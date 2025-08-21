import { CedarEvaluationResponse, User, WorkItem } from '../types';
export declare class CedarAuthService {
    private logger;
    private policyServiceUrl;
    constructor();
    evaluatePolicy(user: User, action: string, resource: WorkItem | any, context?: Record<string, any>): Promise<CedarEvaluationResponse>;
    canCreateWorkItem(user: User, workItemType: string, parentId?: string): Promise<{
        allowed: boolean;
        reason?: string;
    }>;
    canUpdateWorkItem(user: User, workItem: WorkItem): Promise<boolean>;
    canDeleteWorkItem(user: User, workItem: WorkItem): Promise<boolean>;
    canReadWorkItem(user: User, workItem: WorkItem): Promise<boolean>;
    canManageLineage(user: User, workItem: WorkItem): Promise<boolean>;
    fallbackAuthorization(user: User, action: string, resource: any): boolean;
}
//# sourceMappingURL=cedarAuthService.d.ts.map