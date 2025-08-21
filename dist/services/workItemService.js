"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkItemService = void 0;
const uuid_1 = require("uuid");
const loggerService_1 = require("./loggerService");
const types_1 = require("../types");
class WorkItemService {
    constructor(db, messageQueue, cedarAuth) {
        this.db = db;
        this.messageQueue = messageQueue;
        this.cedarAuth = cedarAuth;
        this.logger = new loggerService_1.LoggerService();
    }
    async createWorkItem(user, data) {
        return this.db.transaction(async (client) => {
            const lineageCheck = await this.cedarAuth.canCreateWorkItem(user, data.type, data.parent_id);
            if (!lineageCheck.allowed) {
                throw new Error(`LINEAGE_REQUIRED: ${lineageCheck.reason}`);
            }
            if (data.parent_id) {
                const parent = await this.getWorkItemById(user, data.parent_id);
                if (!parent) {
                    throw new Error('PARENT_NOT_FOUND: Specified parent work item does not exist');
                }
                const parentChildValidation = this.validateParentChildRelationship(parent.type, data.type);
                if (!parentChildValidation.valid) {
                    throw new Error(`INVALID_HIERARCHY: ${parentChildValidation.errors.join(', ')}`);
                }
            }
            const workItemId = (0, uuid_1.v4)();
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
                types_1.WorkItemStatus.DRAFT,
                data.priority || 'medium',
                user.id,
                data.owner_id || user.id,
                data.due_at || null,
                now,
                now,
                data.metadata || {}
            ]);
            const workItem = workItemResult.rows[0];
            if (data.parent_id) {
                await this.createLineageEdge(client, user, data.parent_id, workItemId);
            }
            await this.recordStatusChange(client, workItemId, null, types_1.WorkItemStatus.DRAFT, user.id);
            const event = {
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
    async updateWorkItem(user, workItemId, data) {
        return this.db.transaction(async (client) => {
            const existing = await this.getWorkItemById(user, workItemId);
            if (!existing) {
                throw new Error('WORK_ITEM_NOT_FOUND');
            }
            const canUpdate = await this.cedarAuth.canUpdateWorkItem(user, existing);
            if (!canUpdate) {
                throw new Error('INSUFFICIENT_PERMISSIONS');
            }
            const updates = [];
            const values = [];
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
                await this.recordStatusChange(client, workItemId, existing.status, data.status, user.id);
                if (data.status === types_1.WorkItemStatus.IN_PROGRESS && !existing.started_at) {
                    updates.push(`started_at = $${paramIndex++}`);
                    values.push(new Date());
                }
                if (data.status === types_1.WorkItemStatus.COMPLETED && !existing.completed_at) {
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
                return existing;
            }
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
            const event = {
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
    async deleteWorkItem(user, workItemId) {
        return this.db.transaction(async (client) => {
            const existing = await this.getWorkItemById(user, workItemId);
            if (!existing) {
                throw new Error('WORK_ITEM_NOT_FOUND');
            }
            const canDelete = await this.cedarAuth.canDeleteWorkItem(user, existing);
            if (!canDelete) {
                throw new Error('INSUFFICIENT_PERMISSIONS');
            }
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
            const deleteQuery = `
        DELETE FROM work_items 
        WHERE id = $1 AND tenant_id = $2;
      `;
            await client.query(deleteQuery, [workItemId, user.tenant_id]);
            const event = {
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
    async getWorkItemById(user, workItemId) {
        const query = `
      SELECT * FROM work_items 
      WHERE id = $1 AND tenant_id = $2;
    `;
        const result = await this.db.query(query, [workItemId, user.tenant_id]);
        if (result.rows.length === 0) {
            return null;
        }
        const workItem = result.rows[0];
        const canRead = await this.cedarAuth.canReadWorkItem(user, workItem);
        if (!canRead) {
            return null;
        }
        return workItem;
    }
    async getWorkItemsWithLineage(user, params = {}) {
        const conditions = ['wi.tenant_id = $1'];
        const values = [user.tenant_id];
        let paramIndex = 2;
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
        const authorizedItems = [];
        for (const item of result.rows) {
            const canRead = await this.cedarAuth.canReadWorkItem(user, item);
            if (canRead) {
                authorizedItems.push(item);
            }
        }
        return authorizedItems;
    }
    async getLineageForWorkItem(user, workItemId) {
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
    async createLineageEdge(client, user, parentId, childId) {
        const lineageId = (0, uuid_1.v4)();
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
    async recordStatusChange(client, workItemId, fromStatus, toStatus, userId, reason) {
        const query = `
      INSERT INTO status_history (work_item_id, from_status, to_status, changed_by, reason)
      VALUES ($1, $2, $3, $4, $5);
    `;
        await client.query(query, [workItemId, fromStatus, toStatus, userId, reason]);
    }
    validateParentChildRelationship(parentType, childType) {
        const validRelationships = {
            [types_1.WorkItemType.OBJECTIVE]: [types_1.WorkItemType.STRATEGY],
            [types_1.WorkItemType.STRATEGY]: [types_1.WorkItemType.INITIATIVE],
            [types_1.WorkItemType.INITIATIVE]: [types_1.WorkItemType.TASK],
            [types_1.WorkItemType.TASK]: [types_1.WorkItemType.SUBTASK],
            [types_1.WorkItemType.SUBTASK]: []
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
exports.WorkItemService = WorkItemService;
//# sourceMappingURL=workItemService.js.map