"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkItemController = void 0;
const loggerService_1 = require("../services/loggerService");
class WorkItemController {
    constructor(workItemService) {
        this.workItemService = workItemService;
        this.logger = new loggerService_1.LoggerService();
    }
    async createWorkItem(req, res) {
        try {
            const user = req.user;
            const data = req.body;
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
        }
        catch (error) {
            this.handleError(res, error, 'Failed to create work item');
        }
    }
    async updateWorkItem(req, res) {
        try {
            const user = req.user;
            const workItemId = req.params.id;
            const data = req.body;
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
        }
        catch (error) {
            this.handleError(res, error, 'Failed to update work item');
        }
    }
    async deleteWorkItem(req, res) {
        try {
            const user = req.user;
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
        }
        catch (error) {
            this.handleError(res, error, 'Failed to delete work item');
        }
    }
    async getWorkItem(req, res) {
        try {
            const user = req.user;
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
        }
        catch (error) {
            this.handleError(res, error, 'Failed to get work item');
        }
    }
    async getWorkItems(req, res) {
        try {
            const user = req.user;
            const params = {
                type: req.query.type,
                status: req.query.status,
                priority: req.query.priority,
                owner_id: req.query.owner_id,
                parent_id: req.query.parent_id,
                search: req.query.search,
                limit: req.query.limit ? parseInt(req.query.limit) : 50,
                offset: req.query.offset ? parseInt(req.query.offset) : 0
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
        }
        catch (error) {
            this.handleError(res, error, 'Failed to get work items');
        }
    }
    async getWorkItemLineage(req, res) {
        try {
            const user = req.user;
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
        }
        catch (error) {
            this.handleError(res, error, 'Failed to get work item lineage');
        }
    }
    handleError(res, error, message) {
        this.logger.error(message, { error: error.message, stack: error.stack });
        let statusCode = 500;
        let errorCode = 'INTERNAL_ERROR';
        if (error.message.includes('LINEAGE_REQUIRED')) {
            statusCode = 409;
            errorCode = 'LINEAGE_REQUIRED';
        }
        else if (error.message.includes('NOT_FOUND')) {
            statusCode = 404;
            errorCode = 'NOT_FOUND';
        }
        else if (error.message.includes('INSUFFICIENT_PERMISSIONS')) {
            statusCode = 403;
            errorCode = 'INSUFFICIENT_PERMISSIONS';
        }
        else if (error.message.includes('INVALID_')) {
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
exports.WorkItemController = WorkItemController;
//# sourceMappingURL=workItemController.js.map