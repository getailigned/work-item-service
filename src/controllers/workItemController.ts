// Work Item Controller - REST API endpoints

import { Request, Response } from 'express';
import { WorkItemService } from '../services/workItemService';
import { LoggerService } from '../services/loggerService';
import { User, CreateWorkItemRequest, UpdateWorkItemRequest, WorkItemQueryParams } from '../types';

export class WorkItemController {
  private workItemService: WorkItemService;
  private logger: LoggerService;

  constructor(workItemService: WorkItemService) {
    this.workItemService = workItemService;
    this.logger = new LoggerService();
  }

  async createWorkItem(req: Request, res: Response): Promise<void> {
    try {
      const user: User = (req as any).user;
      const data: CreateWorkItemRequest = req.body;

      // Validate required fields
      if (!data.title || !data.type) {
        res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_FIELDS',
          message: 'Title and type are required'
        });
        return;
      }

      const workItem = await this.workItemService.createWorkItem(user, data);

      res.status(201).json({
        success: true,
        data: workItem
      });

    } catch (error) {
      this.handleError(res, error, 'Failed to create work item');
    }
  }

  async updateWorkItem(req: Request, res: Response): Promise<void> {
    try {
      const user: User = (req as any).user;
      const workItemId = req.params.id;
      const data: UpdateWorkItemRequest = req.body;

      if (!workItemId) {
        res.status(400).json({
          success: false,
          error: 'MISSING_WORK_ITEM_ID',
          message: 'Work item ID is required'
        });
        return;
      }

      const workItem = await this.workItemService.updateWorkItem(user, workItemId, data);

      res.json({
        success: true,
        data: workItem
      });

    } catch (error) {
      this.handleError(res, error, 'Failed to update work item');
    }
  }

  async deleteWorkItem(req: Request, res: Response): Promise<void> {
    try {
      const user: User = (req as any).user;
      const workItemId = req.params.id;

      if (!workItemId) {
        res.status(400).json({
          success: false,
          error: 'MISSING_WORK_ITEM_ID',
          message: 'Work item ID is required'
        });
        return;
      }

      await this.workItemService.deleteWorkItem(user, workItemId);

      res.json({
        success: true,
        message: 'Work item deleted successfully'
      });

    } catch (error) {
      this.handleError(res, error, 'Failed to delete work item');
    }
  }

  async getWorkItem(req: Request, res: Response): Promise<void> {
    try {
      const user: User = (req as any).user;
      const workItemId = req.params.id;

      if (!workItemId) {
        res.status(400).json({
          success: false,
          error: 'MISSING_WORK_ITEM_ID',
          message: 'Work item ID is required'
        });
        return;
      }

      const workItem = await this.workItemService.getWorkItemById(user, workItemId);

      if (!workItem) {
        res.status(404).json({
          success: false,
          error: 'WORK_ITEM_NOT_FOUND',
          message: 'Work item not found'
        });
        return;
      }

      res.json({
        success: true,
        data: workItem
      });

    } catch (error) {
      this.handleError(res, error, 'Failed to get work item');
    }
  }

  async getWorkItems(req: Request, res: Response): Promise<void> {
    try {
      const user: User = (req as any).user;
      
      const params: WorkItemQueryParams = {
        type: req.query.type as any,
        status: req.query.status as any,
        priority: req.query.priority as any,
        owner_id: req.query.owner_id as string,
        parent_id: req.query.parent_id as string,
        search: req.query.search as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0
      };

      const workItems = await this.workItemService.getWorkItemsWithLineage(user, params);

      res.json({
        success: true,
        data: workItems,
        meta: {
          total: workItems.length,
          limit: params.limit || 50,
          offset: params.offset || 0
        }
      });

    } catch (error) {
      this.handleError(res, error, 'Failed to get work items');
    }
  }

  async getWorkItemLineage(req: Request, res: Response): Promise<void> {
    try {
      const user: User = (req as any).user;
      const workItemId = req.params.id;

      if (!workItemId) {
        res.status(400).json({
          success: false,
          error: 'MISSING_WORK_ITEM_ID',
          message: 'Work item ID is required'
        });
        return;
      }

      const lineage = await this.workItemService.getLineageForWorkItem(user, workItemId);

      res.json({
        success: true,
        data: lineage
      });

    } catch (error) {
      this.handleError(res, error, 'Failed to get work item lineage');
    }
  }

  private handleError(res: Response, error: any, message: string): void {
    this.logger.error(message, { error: error.message, stack: error.stack });

    let statusCode = 500;
    let errorCode = 'INTERNAL_ERROR';

    if (error.message.includes('LINEAGE_REQUIRED')) {
      statusCode = 409;
      errorCode = 'LINEAGE_REQUIRED';
    } else if (error.message.includes('NOT_FOUND')) {
      statusCode = 404;
      errorCode = 'NOT_FOUND';
    } else if (error.message.includes('INSUFFICIENT_PERMISSIONS')) {
      statusCode = 403;
      errorCode = 'INSUFFICIENT_PERMISSIONS';
    } else if (error.message.includes('INVALID_')) {
      statusCode = 400;
      errorCode = 'INVALID_REQUEST';
    }

    res.status(statusCode).json({
      success: false,
      error: errorCode,
      message: error.message || message,
      timestamp: new Date()
    });
  }
}
