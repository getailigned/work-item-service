export interface WorkItem {
    id: string;
    tenant_id: string;
    type: WorkItemType;
    title: string;
    description: string;
    status: WorkItemStatus;
    priority: WorkItemPriority;
    created_by: string;
    owner_id: string;
    due_at?: Date;
    started_at?: Date;
    completed_at?: Date;
    created_at: Date;
    updated_at: Date;
    metadata?: Record<string, any>;
}
export declare enum WorkItemType {
    OBJECTIVE = "objective",
    STRATEGY = "strategy",
    INITIATIVE = "initiative",
    TASK = "task",
    SUBTASK = "subtask"
}
export declare enum WorkItemStatus {
    DRAFT = "draft",
    PLANNED = "planned",
    IN_PROGRESS = "in_progress",
    BLOCKED = "blocked",
    REVIEW = "review",
    COMPLETED = "completed",
    CANCELLED = "cancelled"
}
export declare enum WorkItemPriority {
    CRITICAL = "critical",
    HIGH = "high",
    MEDIUM = "medium",
    LOW = "low"
}
export interface LineageEdge {
    id: string;
    tenant_id: string;
    parent_id: string;
    child_id: string;
    relation_type: LineageRelationType;
    created_at: Date;
    created_by: string;
}
export declare enum LineageRelationType {
    CONTAINS = "contains",
    SUPPORTS = "supports",
    DERIVED_FROM = "derived_from"
}
export interface CreateWorkItemRequest {
    type: WorkItemType;
    title: string;
    description: string;
    priority?: WorkItemPriority;
    owner_id?: string;
    due_at?: Date;
    parent_id?: string;
    metadata?: Record<string, any>;
}
export interface UpdateWorkItemRequest {
    title?: string;
    description?: string;
    status?: WorkItemStatus;
    priority?: WorkItemPriority;
    owner_id?: string;
    due_at?: Date;
    metadata?: Record<string, any>;
}
export interface WorkItemQueryParams {
    type?: WorkItemType;
    status?: WorkItemStatus;
    priority?: WorkItemPriority;
    owner_id?: string;
    parent_id?: string;
    search?: string;
    limit?: number;
    offset?: number;
}
export interface WorkItemWithLineage extends WorkItem {
    parent?: WorkItem;
    children?: WorkItem[];
    depth?: number;
}
export interface LineageValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
export interface User {
    id: string;
    email: string;
    tenant_id: string;
    roles: string[];
}
export interface CedarEvaluationRequest {
    principal: {
        id: string;
        tenant_id: string;
        roles: string[];
    };
    action: {
        type: string;
        id: string;
    };
    resource: {
        id: string;
        type: string;
        tenant_id: string;
        owner_id?: string;
    };
    context?: Record<string, any>;
}
export interface CedarEvaluationResponse {
    allowed: boolean;
    policy_id: string;
    reason: string;
    context?: Record<string, any>;
}
export interface WorkItemEvent {
    type: string;
    work_item_id: string;
    tenant_id: string;
    user_id: string;
    data: Record<string, any>;
    timestamp: Date;
}
export interface DatabaseConnection {
    query: (text: string, params?: any[]) => Promise<any>;
    transaction: <T>(callback: (client: any) => Promise<T>) => Promise<T>;
}
export interface MessageQueueConnection {
    publish: (exchange: string, routingKey: string, message: any) => Promise<void>;
    subscribe: (queue: string, callback: (message: any) => void) => Promise<void>;
}
//# sourceMappingURL=index.d.ts.map