// Core Work Item Service with Lineage Enforcement

import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from './databaseService';
import { MessageQueueService } from './messageQueueService';
import { CedarAuthService } from './cedarAuthService';
import { LoggerService } from './loggerService';
import {
  WorkItem,
  WorkItemType,
  WorkItemStatus,
  CreateWorkItemRequest,
  UpdateWorkItemRequest,
  WorkItemQueryParams,
  WorkItemWithLineage,
  LineageEdge,
  LineageValidationResult,
  User,
  WorkItemEvent
} from '../types';

export class WorkItemService {
  private db: DatabaseService;
  private messageQueue: MessageQueueService;
  private cedarAuth: CedarAuthService;
  private logger: LoggerService;

  constructor(
    db: DatabaseService,
    messageQueue: MessageQueueService,
    cedarAuth: CedarAuthService
  ) {
    this.db = db;
    this.messageQueue = messageQueue;
    this.cedarAuth = cedarAuth;
    this.logger = new LoggerService();
  }

  async createWorkItem(
    user: User,
    data: CreateWorkItemRequest
  ): Promise<WorkItem> {
    return this.db.transaction(async (client) => {
      // 1. Validate lineage enforcement
      const lineageCheck = await this.cedarAuth.canCreateWorkItem(
        user,
        data.type,
        data.parent_id
      );

      if (!lineageCheck.allowed) {
        throw new Error(`LINEAGE_REQUIRED: ${lineageCheck.reason}`);
      }

      // 2. Validate parent exists and user has access
      if (data.parent_id) {
        const parent = await this.getWorkItemById(user, data.parent_id);
        if (!parent) {
          throw new Error('PARENT_NOT_FOUND: Specified parent work item does not exist');
        }

        // Validate parent-child relationship rules
        const parentChildValidation = this.validateParentChildRelationship(parent.type, data.type);
        if (!parentChildValidation.valid) {
          throw new Error(`INVALID_HIERARCHY: ${parentChildValidation.errors.join(', ')}`);
        }
      }

      // 3. Create work item
      const workItemId = uuidv4();
      const now = new Date();
      
      const insertQuery = `
        INSERT INTO work_items (
          id, tenant_id, type, title, description, status, priority,
          created_by, owner_id, due_at, created_at, updated_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *;
      `;

      const workItemResult = await client.query(insertQuery, [
        workItemId,
        user.tenant_id,
        data.type,
        data.title,
        data.description || '',
        WorkItemStatus.DRAFT,
        data.priority || 'medium',
        user.id,
        data.owner_id || user.id,
        data.due_at || null,
        now,
        now,
        data.metadata || {}
      ]);

      const workItem = workItemResult.rows[0];

      // 4. Create lineage edge if parent specified
      if (data.parent_id) {
        await this.createLineageEdge(client, user, data.parent_id, workItemId);
      }

      // 5. Record status history
      await this.recordStatusChange(client, workItemId, null, WorkItemStatus.DRAFT, user.id);

      // 6. Publish event
      const event: WorkItemEvent = {
        type: 'created',
        work_item_id: workItemId,
        tenant_id: user.tenant_id,
        user_id: user.id,
        data: {
          work_item: workItem,
          parent_id: data.parent_id
        },
        timestamp: now
      };

      await this.messageQueue.publishWorkItemEvent(event);

      this.logger.info('Work item created', {
        workItemId,
        type: data.type,
        parentId: data.parent_id,
        userId: user.id,
        tenantId: user.tenant_id
      });

      return workItem;
    });
  }

  async updateWorkItem(
    user: User,
    workItemId: string,
    data: UpdateWorkItemRequest
  ): Promise<WorkItem> {
    return this.db.transaction(async (client) => {
      // 1. Get existing work item
      const existing = await this.getWorkItemById(user, workItemId);
      if (!existing) {
        throw new Error('WORK_ITEM_NOT_FOUND');
      }

      // 2. Check authorization
      const canUpdate = await this.cedarAuth.canUpdateWorkItem(user, existing);
      if (!canUpdate) {
        throw new Error('INSUFFICIENT_PERMISSIONS');
      }

      // 3. Build update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (data.title !== undefined) {
        updates.push(`title = $${paramIndex++}`);
        values.push(data.title);
      }

      if (data.description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        values.push(data.description);
      }

      if (data.status !== undefined) {
        updates.push(`status = $${paramIndex++}`);
        values.push(data.status);
        
        // Record status change
        await this.recordStatusChange(client, workItemId, existing.status, data.status, user.id);
        
        // Update timestamps based on status
        if (data.status === WorkItemStatus.IN_PROGRESS && !existing.started_at) {
          updates.push(`started_at = $${paramIndex++}`);
          values.push(new Date());
        }
        
        if (data.status === WorkItemStatus.COMPLETED && !existing.completed_at) {
          updates.push(`completed_at = $${paramIndex++}`);
          values.push(new Date());
        }
      }

      if (data.priority !== undefined) {
        updates.push(`priority = $${paramIndex++}`);
        values.push(data.priority);
      }

      if (data.owner_id !== undefined) {
        updates.push(`owner_id = $${paramIndex++}`);
        values.push(data.owner_id);
      }

      if (data.due_at !== undefined) {
        updates.push(`due_at = $${paramIndex++}`);
        values.push(data.due_at);
      }

      if (data.metadata !== undefined) {
        updates.push(`metadata = $${paramIndex++}`);
        values.push(JSON.stringify(data.metadata));
      }

      if (updates.length === 0) {
        return existing; // No changes to make
      }

      // Add updated_at and where clause
      updates.push(`updated_at = $${paramIndex++}`);
      values.push(new Date());
      values.push(workItemId);
      values.push(user.tenant_id);

      const updateQuery = `
        UPDATE work_items 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
        RETURNING *;
      `;

      const result = await client.query(updateQuery, values);
      const updatedWorkItem = result.rows[0];

      // 4. Publish event
      const event: WorkItemEvent = {
        type: 'updated',
        work_item_id: workItemId,
        tenant_id: user.tenant_id,
        user_id: user.id,
        data: {
          before: existing,
          after: updatedWorkItem,
          changes: data
        },
        timestamp: new Date()
      };

      await this.messageQueue.publishWorkItemEvent(event);

      this.logger.info('Work item updated', {
        workItemId,
        changes: Object.keys(data),
        userId: user.id,
        tenantId: user.tenant_id
      });

      return updatedWorkItem;
    });
  }

  async deleteWorkItem(user: User, workItemId: string): Promise<void> {
    return this.db.transaction(async (client) => {
      // 1. Get existing work item
      const existing = await this.getWorkItemById(user, workItemId);
      if (!existing) {
        throw new Error('WORK_ITEM_NOT_FOUND');
      }

      // 2. Check authorization
      const canDelete = await this.cedarAuth.canDeleteWorkItem(user, existing);
      if (!canDelete) {
        throw new Error('INSUFFICIENT_PERMISSIONS');
      }

      // 3. Check for child work items
      const childrenQuery = `
        SELECT COUNT(*) as child_count
        FROM lineage_edges le
        WHERE le.tenant_id = $1 AND le.parent_id = $2;
      `;
      
      const childrenResult = await client.query(childrenQuery, [user.tenant_id, workItemId]);
      const childCount = parseInt(childrenResult.rows[0].child_count);

      if (childCount > 0) {
        throw new Error('CANNOT_DELETE_PARENT: Work item has child items');
      }

      // 4. Delete work item (cascades to lineage_edges, status_history, etc.)
      const deleteQuery = `
        DELETE FROM work_items 
        WHERE id = $1 AND tenant_id = $2;
      `;

      await client.query(deleteQuery, [workItemId, user.tenant_id]);

      // 5. Publish event
      const event: WorkItemEvent = {
        type: 'deleted',
        work_item_id: workItemId,
        tenant_id: user.tenant_id,
        user_id: user.id,
        data: {
          work_item: existing
        },
        timestamp: new Date()
      };

      await this.messageQueue.publishWorkItemEvent(event);

      this.logger.info('Work item deleted', {
        workItemId,
        type: existing.type,
        userId: user.id,
        tenantId: user.tenant_id
      });
    });
  }

  async getWorkItemById(user: User, workItemId: string): Promise<WorkItem | null> {
    const query = `
      SELECT * FROM work_items 
      WHERE id = $1 AND tenant_id = $2;
    `;

    const result = await this.db.query(query, [workItemId, user.tenant_id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const workItem = result.rows[0];

    // Check authorization
    const canRead = await this.cedarAuth.canReadWorkItem(user, workItem);
    if (!canRead) {
      return null;
    }

    return workItem;
  }

  async getWorkItemsWithLineage(
    user: User,
    params: WorkItemQueryParams = {}
  ): Promise<WorkItemWithLineage[]> {
    const conditions: string[] = ['wi.tenant_id = $1'];
    const values: any[] = [user.tenant_id];
    let paramIndex = 2;

    // Build query conditions
    if (params.type) {
      conditions.push(`wi.type = $${paramIndex++}`);
      values.push(params.type);
    }

    if (params.status) {
      conditions.push(`wi.status = $${paramIndex++}`);
      values.push(params.status);
    }

    if (params.priority) {
      conditions.push(`wi.priority = $${paramIndex++}`);
      values.push(params.priority);
    }

    if (params.owner_id) {
      conditions.push(`wi.owner_id = $${paramIndex++}`);
      values.push(params.owner_id);
    }

    if (params.parent_id) {
      conditions.push(`le.parent_id = $${paramIndex++}`);
      values.push(params.parent_id);
    }

    if (params.search) {
      conditions.push(`(
        to_tsvector('english', wi.title) @@ plainto_tsquery('english', $${paramIndex}) OR
        to_tsvector('english', wi.description) @@ plainto_tsquery('english', $${paramIndex})
      )`);
      values.push(params.search);
      paramIndex++;
    }

    const limit = params.limit || 50;
    const offset = params.offset || 0;

    const query = `
      WITH RECURSIVE lineage_tree AS (
        -- Base case: get work items
        SELECT 
          wi.*,
          le.parent_id,
          0 as depth
        FROM work_items wi
        LEFT JOIN lineage_edges le ON wi.id = le.child_id AND le.tenant_id = wi.tenant_id
        WHERE ${conditions.join(' AND ')}
        
        UNION ALL
        
        -- Recursive case: get parent lineage
        SELECT 
          p.*,
          ple.parent_id,
          lt.depth + 1
        FROM work_items p
        JOIN lineage_edges ple ON p.id = ple.child_id
        JOIN lineage_tree lt ON ple.parent_id = lt.id
        WHERE ple.tenant_id = p.tenant_id AND lt.depth < 10
      )
      SELECT DISTINCT ON (id) *
      FROM lineage_tree
      ORDER BY id, depth
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
    `;

    values.push(limit, offset);

    const result = await this.db.query(query, values);
    
    // Filter based on read permissions
    const authorizedItems: WorkItemWithLineage[] = [];
    
    for (const item of result.rows) {
      const canRead = await this.cedarAuth.canReadWorkItem(user, item);
      if (canRead) {
        authorizedItems.push(item);
      }
    }

    return authorizedItems;
  }

  async getLineageForWorkItem(user: User, workItemId: string): Promise<LineageEdge[]> {
    const query = `
      SELECT le.*, 
             p.title as parent_title,
             c.title as child_title
      FROM lineage_edges le
      JOIN work_items p ON le.parent_id = p.id
      JOIN work_items c ON le.child_id = c.id
      WHERE le.tenant_id = $1 
      AND (le.parent_id = $2 OR le.child_id = $2)
      ORDER BY le.created_at;
    `;

    const result = await this.db.query(query, [user.tenant_id, workItemId]);
    return result.rows;
  }

  private async createLineageEdge(
    client: any,
    user: User,
    parentId: string,
    childId: string
  ): Promise<void> {
    const lineageId = uuidv4();
    
    const query = `
      INSERT INTO lineage_edges (id, tenant_id, parent_id, child_id, relation_type, created_by)
      VALUES ($1, $2, $3, $4, $5, $6);
    `;

    await client.query(query, [
      lineageId,
      user.tenant_id,
      parentId,
      childId,
      'contains',
      user.id
    ]);

    // Publish lineage event
    await this.messageQueue.publishLineageEvent({
      type: 'edge_created',
      lineage_id: lineageId,
      parent_id: parentId,
      child_id: childId,
      tenant_id: user.tenant_id,
      user_id: user.id,
      timestamp: new Date()
    });

    this.logger.info('Lineage edge created', {
      lineageId,
      parentId,
      childId,
      userId: user.id,
      tenantId: user.tenant_id
    });
  }

  private async recordStatusChange(
    client: any,
    workItemId: string,
    fromStatus: WorkItemStatus | null,
    toStatus: WorkItemStatus,
    userId: string,
    reason?: string
  ): Promise<void> {
    const query = `
      INSERT INTO status_history (work_item_id, from_status, to_status, changed_by, reason)
      VALUES ($1, $2, $3, $4, $5);
    `;

    await client.query(query, [workItemId, fromStatus, toStatus, userId, reason]);
  }

  private validateParentChildRelationship(
    parentType: WorkItemType,
    childType: WorkItemType
  ): LineageValidationResult {
    const validRelationships: Record<WorkItemType, WorkItemType[]> = {
      [WorkItemType.OBJECTIVE]: [WorkItemType.STRATEGY],
      [WorkItemType.STRATEGY]: [WorkItemType.INITIATIVE],
      [WorkItemType.INITIATIVE]: [WorkItemType.TASK],
      [WorkItemType.TASK]: [WorkItemType.SUBTASK],
      [WorkItemType.SUBTASK]: []
    };

    const allowedChildren = validRelationships[parentType] || [];
    const isValid = allowedChildren.includes(childType);

    if (!isValid) {
      return {
        valid: false,
        errors: [`${parentType} cannot contain ${childType}`],
        warnings: []
      };
    }

    return {
      valid: true,
      errors: [],
      warnings: []
    };
  }
}
