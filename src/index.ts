// Work Item Service Main Application

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from 'dotenv';

import { DatabaseService } from './services/databaseService';
import { MessageQueueService } from './services/messageQueueService';
import { CedarAuthService } from './services/cedarAuthService';
import { WorkItemService } from './services/workItemService';
import { WorkItemController } from './controllers/workItemController';
import { LoggerService } from './services/loggerService';
import { authMiddleware } from './middleware/authMiddleware';
import { DemoDataInstaller } from './scripts/install-demo-data';

// Load environment variables
config();

class WorkItemApp {
  private app: express.Application;
  private logger: LoggerService;
  private db!: DatabaseService;
  private messageQueue!: MessageQueueService;
  private cedarAuth!: CedarAuthService;
  private workItemService!: WorkItemService;
  private workItemController!: WorkItemController;

  constructor() {
    this.app = express();
    this.logger = new LoggerService();
    
    this.initializeServices();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private initializeServices(): void {
    this.db = new DatabaseService();
    this.messageQueue = new MessageQueueService();
    this.cedarAuth = new CedarAuthService();
    this.workItemService = new WorkItemService(this.db, this.messageQueue, this.cedarAuth);
    this.workItemController = new WorkItemController(this.workItemService);
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || [
        'http://localhost:3000',
        'https://dev.getailigned.com',
        'https://ashy-glacier-0e751650f.2.azurestaticapps.net'
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Rate limiting
    this.app.use(rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // Limit each IP to 1000 requests per windowMs
      message: {
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP'
      }
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Compression
    this.app.use(compression());

    // Request logging
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

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (_req, res) => {
      res.json({
        service: 'work-item-service',
        status: 'healthy',
        timestamp: new Date(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // API routes with authentication
    const apiRouter = express.Router();
    apiRouter.use(authMiddleware);

    // Work item routes
    apiRouter.post('/work-items', this.workItemController.createWorkItem.bind(this.workItemController));
    apiRouter.get('/work-items', this.workItemController.getWorkItems.bind(this.workItemController));
    apiRouter.get('/work-items/:id', this.workItemController.getWorkItem.bind(this.workItemController));
    apiRouter.put('/work-items/:id', this.workItemController.updateWorkItem.bind(this.workItemController));
    apiRouter.delete('/work-items/:id', this.workItemController.deleteWorkItem.bind(this.workItemController));
    apiRouter.get('/work-items/:id/lineage', this.workItemController.getWorkItemLineage.bind(this.workItemController));
    
    // Demo data installation endpoint (with safety checks)
    apiRouter.post('/install-demo-data', async (req, res) => {
      try {
        // Allow demo data installation if explicitly enabled via environment variable
        const allowDemoData = process.env.ALLOW_DEMO_DATA === 'true' || process.env.NODE_ENV === 'development';
        
        if (!allowDemoData) {
          res.status(403).json({
            success: false,
            error: 'FORBIDDEN',
            message: 'Demo data installation is not enabled. Set ALLOW_DEMO_DATA=true to enable.'
          });
          return;
        }

        this.logger.info('Demo data installation requested', { 
          user: (req as any).user?.id || 'unknown',
          timestamp: new Date().toISOString()
        });

        const installer = new DemoDataInstaller();
        const result = await installer.installDemoData();
        
        return res.json(result);
      } catch (error: any) {
        this.logger.error('Demo data installation failed:', { error: error.message || error });
        return res.status(500).json({
          success: false,
          error: 'INSTALLATION_FAILED',
          message: 'Failed to install demo data: ' + (error?.message || 'Unknown error')
        });
      }
    });

    this.app.use('/api', apiRouter);

    // 404 handler
    this.app.use('*', (_req, res) => {
      res.status(404).json({
        success: false,
        error: 'ENDPOINT_NOT_FOUND',
        message: 'The requested endpoint was not found'
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use((error: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
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

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Promise Rejection', {
        reason: reason?.toString(),
        promise: promise.toString()
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    });
  }

  async start(): Promise<void> {
    try {
      // Initialize database
      await this.db.initialize();
      this.logger.info('Database initialized successfully');

      // Connect to message queue
      await this.messageQueue.connect();
      this.logger.info('Message queue connected successfully');

      // Start server
      const port = process.env.PORT || 3004;
      this.app.listen(port, () => {
        this.logger.info(`Work Item Service started on port ${port}`);
      });

    } catch (error) {
      this.logger.error('Failed to start Work Item Service', { error: error instanceof Error ? error.message : String(error) });
      process.exit(1);
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Work Item Service...');
    
    try {
      await this.db.close();
      await this.messageQueue.close();
      this.logger.info('Work Item Service shutdown complete');
    } catch (error) {
      this.logger.error('Error during shutdown', { error: error instanceof Error ? error.message : String(error) });
    }
    
    process.exit(0);
  }
}

// Create and start the application
const app = new WorkItemApp();

// Graceful shutdown
process.on('SIGTERM', () => app.shutdown());
process.on('SIGINT', () => app.shutdown());

// Start the service
app.start().catch((error) => {
  console.error('Failed to start Work Item Service:', error);
  process.exit(1);
});

export default app;
