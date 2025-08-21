declare class WorkItemApp {
    private app;
    private logger;
    private db;
    private messageQueue;
    private cedarAuth;
    private workItemService;
    private workItemController;
    constructor();
    private initializeServices;
    private setupMiddleware;
    private setupRoutes;
    private setupErrorHandling;
    start(): Promise<void>;
    shutdown(): Promise<void>;
}
declare const app: WorkItemApp;
export default app;
//# sourceMappingURL=index.d.ts.map