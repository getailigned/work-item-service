import { Request, Response } from 'express';
import { WorkItemService } from '../services/workItemService';
export declare class WorkItemController {
    private workItemService;
    private logger;
    constructor(workItemService: WorkItemService);
    createWorkItem(req: Request, res: Response): Promise<void>;
    updateWorkItem(req: Request, res: Response): Promise<void>;
    deleteWorkItem(req: Request, res: Response): Promise<void>;
    getWorkItem(req: Request, res: Response): Promise<void>;
    getWorkItems(req: Request, res: Response): Promise<void>;
    getWorkItemLineage(req: Request, res: Response): Promise<void>;
    private handleError;
}
//# sourceMappingURL=workItemController.d.ts.map