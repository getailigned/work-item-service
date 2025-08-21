import { DatabaseService } from './databaseService';
import { MessageQueueService } from './messageQueueService';
import { CedarAuthService } from './cedarAuthService';
import { WorkItem, CreateWorkItemRequest, UpdateWorkItemRequest, WorkItemQueryParams, WorkItemWithLineage, LineageEdge, User } from '../types';
export declare class WorkItemService {
    private db;
    private messageQueue;
    private cedarAuth;
    private logger;
    constructor(db: DatabaseService, messageQueue: MessageQueueService, cedarAuth: CedarAuthService);
    createWorkItem(user: User, data: CreateWorkItemRequest): Promise<WorkItem>;
    updateWorkItem(user: User, workItemId: string, data: UpdateWorkItemRequest): Promise<WorkItem>;
    deleteWorkItem(user: User, workItemId: string): Promise<void>;
    getWorkItemById(user: User, workItemId: string): Promise<WorkItem | null>;
    getWorkItemsWithLineage(user: User, params?: WorkItemQueryParams): Promise<WorkItemWithLineage[]>;
    getLineageForWorkItem(user: User, workItemId: string): Promise<LineageEdge[]>;
    private createLineageEdge;
    private recordStatusChange;
    private validateParentChildRelationship;
}
//# sourceMappingURL=workItemService.d.ts.map