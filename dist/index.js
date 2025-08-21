"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = require("dotenv");
const databaseService_1 = require("./services/databaseService");
const messageQueueService_1 = require("./services/messageQueueService");
const cedarAuthService_1 = require("./services/cedarAuthService");
const workItemService_1 = require("./services/workItemService");
const workItemController_1 = require("./controllers/workItemController");
const loggerService_1 = require("./services/loggerService");
const authMiddleware_1 = require("./middleware/authMiddleware");
(0, dotenv_1.config)();
class WorkItemApp {
    constructor() {
        this.app = (0, express_1.default)();
        this.logger = new loggerService_1.LoggerService();
        this.initializeServices();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }
    initializeServices() {
        this.db = new databaseService_1.DatabaseService();
        this.messageQueue = new messageQueueService_1.MessageQueueService();
        this.cedarAuth = new cedarAuthService_1.CedarAuthService();
        this.workItemService = new workItemService_1.WorkItemService(this.db, this.messageQueue, this.cedarAuth);
        this.workItemController = new workItemController_1.WorkItemController(this.workItemService);
    }
    setupMiddleware() {
        this.app.use((0, helmet_1.default)({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                },
            },
        }));
        this.app.use((0, cors_1.default)({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        }));
        this.app.use((0, express_rate_limit_1.default)({
            windowMs: 15 * 60 * 1000,
            max: 1000,
            message: {
                success: false,
                error: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many requests from this IP'
            }
        }));
        this.app.use(express_1.default.json({ limit: '10mb' }));
        this.app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
        this.app.use((0, compression_1.default)());
        this.app.use((req, _res, next) => {
            this.logger.info('Request received', {
                method: req.method,
                url: req.url,
                userAgent: req.get('user-agent'),
                ip: req.ip
            });
            next();
        });
    }
    setupRoutes() {
        this.app.get('/health', (_req, res) => {
            res.json({
                service: 'work-item-service',
                status: 'healthy',
                timestamp: new Date(),
                version: process.env.npm_package_version || '1.0.0'
            });
        });
        const apiRouter = express_1.default.Router();
        apiRouter.use(authMiddleware_1.authMiddleware);
        apiRouter.post('/work-items', this.workItemController.createWorkItem.bind(this.workItemController));
        apiRouter.get('/work-items', this.workItemController.getWorkItems.bind(this.workItemController));
        apiRouter.get('/work-items/:id', this.workItemController.getWorkItem.bind(this.workItemController));
        apiRouter.put('/work-items/:id', this.workItemController.updateWorkItem.bind(this.workItemController));
        apiRouter.delete('/work-items/:id', this.workItemController.deleteWorkItem.bind(this.workItemController));
        apiRouter.get('/work-items/:id/lineage', this.workItemController.getWorkItemLineage.bind(this.workItemController));
        this.app.use('/api', apiRouter);
        this.app.use('*', (_req, res) => {
            res.status(404).json({
                success: false,
                error: 'ENDPOINT_NOT_FOUND',
                message: 'The requested endpoint was not found'
            });
        });
    }
    setupErrorHandling() {
        this.app.use((error, req, res, _next) => {
            this.logger.error('Unhandled error', {
                error: error.message,
                stack: error.stack,
                url: req.url,
                method: req.method
            });
            res.status(500).json({
                success: false,
                error: 'INTERNAL_SERVER_ERROR',
                message: 'An unexpected error occurred'
            });
        });
        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error('Unhandled Promise Rejection', {
                reason: reason?.toString(),
                promise: promise.toString()
            });
        });
        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught Exception', {
                error: error.message,
                stack: error.stack
            });
            process.exit(1);
        });
    }
    async start() {
        try {
            await this.db.initialize();
            this.logger.info('Database initialized successfully');
            await this.messageQueue.connect();
            this.logger.info('Message queue connected successfully');
            const port = process.env.PORT || 3004;
            this.app.listen(port, () => {
                this.logger.info(`Work Item Service started on port ${port}`);
            });
        }
        catch (error) {
            this.logger.error('Failed to start Work Item Service', { error: error instanceof Error ? error.message : String(error) });
            process.exit(1);
        }
    }
    async shutdown() {
        this.logger.info('Shutting down Work Item Service...');
        try {
            await this.db.close();
            await this.messageQueue.close();
            this.logger.info('Work Item Service shutdown complete');
        }
        catch (error) {
            this.logger.error('Error during shutdown', { error: error instanceof Error ? error.message : String(error) });
        }
        process.exit(0);
    }
}
const app = new WorkItemApp();
process.on('SIGTERM', () => app.shutdown());
process.on('SIGINT', () => app.shutdown());
app.start().catch((error) => {
    console.error('Failed to start Work Item Service:', error);
    process.exit(1);
});
exports.default = app;
//# sourceMappingURL=index.js.map