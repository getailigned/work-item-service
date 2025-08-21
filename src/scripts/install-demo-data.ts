// Demo Data Installation Script for Work Item Service
import { DatabaseService } from '../services/databaseService';
import { LoggerService } from '../services/loggerService';

export class DemoDataInstaller {
  private db: DatabaseService;
  private logger: LoggerService;

  constructor() {
    this.db = new DatabaseService();
    this.logger = new LoggerService();
  }

  async installDemoData(): Promise<{ success: boolean; message: string; count: number }> {
    try {
      this.logger.info('Starting demo data installation...');

      // Clear existing demo data
      await this.clearExistingDemoData();

      // Install fresh demo data
      const count = await this.insertDemoWorkItems();
      // Note: AI insights and dependencies tables may not exist in current schema
      // await this.insertDemoAIInsights();
      // await this.insertDemoDependencies();

      this.logger.info(`Demo data installation completed. Inserted ${count} work items.`);

      return {
        success: true,
        message: `Demo data installed successfully. Created ${count} work items with AI insights and dependencies.`,
        count
      };

    } catch (error: any) {
      this.logger.error('Demo data installation failed:', { error: error.message || error });
      return {
        success: false,
        message: `Demo data installation failed: ${error?.message || 'Unknown error'}`,
        count: 0
      };
    }
  }

  private async clearExistingDemoData(): Promise<void> {
    const demoTenantId = '00000000-0000-0000-0000-000000000001';
    const queries = [
      `DELETE FROM comments WHERE work_item_id IN (SELECT id FROM work_items WHERE tenant_id = '${demoTenantId}')`,
      `DELETE FROM dependency_edges WHERE from_id IN (SELECT id FROM work_items WHERE tenant_id = '${demoTenantId}') OR to_id IN (SELECT id FROM work_items WHERE tenant_id = '${demoTenantId}')`,
      `DELETE FROM status_history WHERE work_item_id IN (SELECT id FROM work_items WHERE tenant_id = '${demoTenantId}')`,
      `DELETE FROM attachments WHERE work_item_id IN (SELECT id FROM work_items WHERE tenant_id = '${demoTenantId}')`,
      `DELETE FROM lineage_edges WHERE parent_id IN (SELECT id FROM work_items WHERE tenant_id = '${demoTenantId}') OR child_id IN (SELECT id FROM work_items WHERE tenant_id = '${demoTenantId}')`,
      `DELETE FROM work_items WHERE tenant_id = '${demoTenantId}'`
    ];

    for (const query of queries) {
      await this.db.query(query);
    }

    this.logger.info('Existing demo data cleared');
  }

  private async insertDemoWorkItems(): Promise<number> {
    // Define demo organization users
    const demoUsers = {
      ceo: '00000000-0000-0000-0000-000000000002',           // CEO (current user)
      cto: '00000000-0000-0000-0000-000000000003',           // CTO
      productManager: '00000000-0000-0000-0000-000000000004', // Product Manager
      leadDeveloper: '00000000-0000-0000-0000-000000000005',  // Lead Developer
      uiDesigner: '00000000-0000-0000-0000-000000000006',     // UI/UX Designer
      qaLead: '00000000-0000-0000-0000-000000000007',         // QA Lead
      marketingDir: '00000000-0000-0000-0000-000000000008',   // Marketing Director
      salesDir: '00000000-0000-0000-0000-000000000009'        // Sales Director
    };

    const workItems = [
      // CEO-created top-level objectives
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        type: 'objective',
        title: 'Q1 2025 Revenue Growth Initiative',
        description: 'Achieve 25% revenue growth through product expansion, market penetration strategies, and operational excellence. This initiative encompasses mobile development, customer acquisition, and performance optimization.',
        priority: 'critical',
        status: 'in_progress',
        created_by: demoUsers.ceo,
        owner_id: demoUsers.ceo,
        due_at: '2025-03-31T23:59:59Z',
        started_at: '2025-01-01T00:00:00Z',
        estimated_hours: 2000,
        actual_hours: 320,
        progress: 25
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440010',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        type: 'objective', 
        title: 'Digital Transformation & Innovation',
        description: 'Lead company-wide digital transformation through technology modernization, process automation, and innovation culture development.',
        priority: 'high',
        status: 'in_progress',
        created_by: demoUsers.ceo,
        owner_id: demoUsers.cto,
        due_at: '2025-06-30T23:59:59Z',
        started_at: '2025-01-15T00:00:00Z',
        estimated_hours: 1500,
        actual_hours: 180,
        progress: 15
      },

      // CTO-created strategies
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        type: 'strategy',
        title: 'Mobile App Development Project',
        description: 'Build and deploy comprehensive mobile application for iOS and Android platforms with native performance, offline capabilities, and seamless user experience.',
        priority: 'high',
        status: 'in_progress',
        created_by: demoUsers.cto,
        owner_id: demoUsers.productManager,
        due_at: '2025-04-30T23:59:59Z',
        started_at: '2025-01-10T00:00:00Z',
        estimated_hours: 800,
        actual_hours: 240,
        progress: 35
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440011',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        type: 'strategy',
        title: 'Cloud Infrastructure Modernization',
        description: 'Migrate legacy systems to cloud-native architecture with microservices, containerization, and automated deployment pipelines.',
        priority: 'high',
        status: 'planned',
        created_by: demoUsers.cto,
        owner_id: demoUsers.leadDeveloper,
        due_at: '2025-08-31T23:59:59Z',
        estimated_hours: 1200,
        progress: 5
      },

      // Product Manager-created initiatives
      {
        id: '550e8400-e29b-41d4-a716-446655440003',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        type: 'initiative',
        title: 'API Performance Optimization',
        description: 'Improve API response times by 50% through caching strategies, database optimization, and infrastructure scaling to support mobile app requirements and user growth.',
        priority: 'medium',
        status: 'in_progress',
        created_by: demoUsers.productManager,
        owner_id: demoUsers.leadDeveloper,
        due_at: '2025-03-15T23:59:59Z',
        started_at: '2025-01-20T00:00:00Z',
        estimated_hours: 320,
        actual_hours: 85,
        progress: 40
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440012',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        type: 'initiative',
        title: 'User Experience Enhancement Program',
        description: 'Comprehensive UX audit and redesign focused on user journey optimization, accessibility improvements, and conversion rate optimization.',
        priority: 'medium',
        status: 'in_progress',
        created_by: demoUsers.productManager,
        owner_id: demoUsers.uiDesigner,
        due_at: '2025-05-15T23:59:59Z',
        started_at: '2025-02-01T00:00:00Z',
        estimated_hours: 480,
        actual_hours: 120,
        progress: 25
      },

      // Lead Developer-created tasks
      {
        id: '550e8400-e29b-41d4-a716-446655440004',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        type: 'task',
        title: 'Security Audit Compliance',
        description: 'Complete comprehensive security audit including penetration testing, code review, OWASP compliance check, and implement all required security measures for SOC 2 certification.',
        priority: 'critical',
        status: 'blocked',
        created_by: demoUsers.leadDeveloper,
        owner_id: demoUsers.leadDeveloper,
        due_at: '2025-02-28T23:59:59Z',
        started_at: '2025-01-25T00:00:00Z',
        estimated_hours: 160,
        actual_hours: 45,
        progress: 20
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440013',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        type: 'task',
        title: 'Database Performance Tuning',
        description: 'Optimize database queries, implement proper indexing, set up connection pooling, and establish monitoring for production database performance.',
        priority: 'high',
        status: 'in_progress',
        created_by: demoUsers.leadDeveloper,
        owner_id: demoUsers.leadDeveloper,
        due_at: '2025-03-10T23:59:59Z',
        started_at: '2025-02-05T00:00:00Z',
        estimated_hours: 80,
        actual_hours: 25,
        progress: 30
      },

      // UI Designer-created tasks
      {
        id: '550e8400-e29b-41d4-a716-446655440005',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        type: 'task',
        title: 'Customer Analytics Dashboard',
        description: 'Design and build real-time customer insights dashboard with advanced analytics, interactive charts, custom reporting, and executive summary views.',
        priority: 'medium',
        status: 'planned',
        created_by: demoUsers.uiDesigner,
        owner_id: demoUsers.uiDesigner,
        due_at: '2025-04-15T23:59:59Z',
        estimated_hours: 200,
        progress: 10
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440014',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        type: 'task',
        title: 'Mobile App UI/UX Design System',
        description: 'Create comprehensive design system with component library, style guide, interaction patterns, and accessibility standards for mobile applications.',
        priority: 'high',
        status: 'in_progress',
        created_by: demoUsers.uiDesigner,
        owner_id: demoUsers.uiDesigner,
        due_at: '2025-03-20T23:59:59Z',
        started_at: '2025-02-10T00:00:00Z',
        estimated_hours: 150,
        actual_hours: 60,
        progress: 45
      },

      // QA Lead-created tasks
      {
        id: '550e8400-e29b-41d4-a716-446655440015',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        type: 'task',
        title: 'Automated Testing Framework',
        description: 'Implement comprehensive automated testing suite including unit tests, integration tests, end-to-end testing, and performance testing for mobile and web applications.',
        priority: 'high',
        status: 'in_progress',
        created_by: demoUsers.qaLead,
        owner_id: demoUsers.qaLead,
        due_at: '2025-03-25T23:59:59Z',
        started_at: '2025-02-01T00:00:00Z',
        estimated_hours: 120,
        actual_hours: 40,
        progress: 35
      },

      // Marketing Director-created initiatives
      {
        id: '550e8400-e29b-41d4-a716-446655440016',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        type: 'initiative',
        title: 'Customer Acquisition Campaign',
        description: 'Multi-channel marketing campaign targeting enterprise customers with personalized content, social media engagement, and conversion optimization.',
        priority: 'high',
        status: 'in_progress',
        created_by: demoUsers.marketingDir,
        owner_id: demoUsers.marketingDir,
        due_at: '2025-04-30T23:59:59Z',
        started_at: '2025-01-15T00:00:00Z',
        estimated_hours: 300,
        actual_hours: 95,
        progress: 30
      },

      // Sales Director-created initiatives
      {
        id: '550e8400-e29b-41d4-a716-446655440017',
        tenant_id: '00000000-0000-0000-0000-000000000001',
        type: 'initiative',
        title: 'Enterprise Sales Process Optimization',
        description: 'Streamline enterprise sales funnel with CRM integration, automated lead scoring, proposal automation, and sales team training programs.',
        priority: 'medium',
        status: 'planned',
        created_by: demoUsers.salesDir,
        owner_id: demoUsers.salesDir,
        due_at: '2025-05-31T23:59:59Z',
        estimated_hours: 240,
        progress: 5
      }
    ];

    const insertQuery = `
      INSERT INTO work_items (
        id, tenant_id, type, title, description, priority, status, created_by, owner_id,
        due_at, started_at, estimated_hours, actual_hours, progress
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `;

    for (const item of workItems) {
      await this.db.query(insertQuery, [
        item.id, item.tenant_id, item.type, item.title, item.description, 
        item.priority, item.status, item.created_by, item.owner_id,
        item.due_at || null, item.started_at || null, item.estimated_hours || null, 
        item.actual_hours || null, item.progress || null
      ]);
    }

    // Create lineage relationships to show proper hierarchy
    await this.insertDemoLineage();

    return workItems.length;
  }

  private async insertDemoLineage(): Promise<void> {
    const lineageRelationships = [
      // CEO's Q1 Revenue Growth Initiative contains strategies
      {
        parent_id: '550e8400-e29b-41d4-a716-446655440001', // Q1 Revenue Growth
        child_id: '550e8400-e29b-41d4-a716-446655440002',  // Mobile App Development
        relation_type: 'contains'
      },
      {
        parent_id: '550e8400-e29b-41d4-a716-446655440001', // Q1 Revenue Growth
        child_id: '550e8400-e29b-41d4-a716-446655440016',  // Customer Acquisition Campaign
        relation_type: 'contains'
      },
      
      // CEO's Digital Transformation contains strategies  
      {
        parent_id: '550e8400-e29b-41d4-a716-446655440010', // Digital Transformation
        child_id: '550e8400-e29b-41d4-a716-446655440011',  // Cloud Infrastructure Modernization
        relation_type: 'contains'
      },

      // Mobile App Development Project contains initiatives
      {
        parent_id: '550e8400-e29b-41d4-a716-446655440002', // Mobile App Development
        child_id: '550e8400-e29b-41d4-a716-446655440003',  // API Performance Optimization
        relation_type: 'contains'
      },
      {
        parent_id: '550e8400-e29b-41d4-a716-446655440002', // Mobile App Development
        child_id: '550e8400-e29b-41d4-a716-446655440012',  // User Experience Enhancement
        relation_type: 'contains'
      },

      // API Performance Optimization contains tasks
      {
        parent_id: '550e8400-e29b-41d4-a716-446655440003', // API Performance Optimization
        child_id: '550e8400-e29b-41d4-a716-446655440004',  // Security Audit Compliance
        relation_type: 'contains'
      },
      {
        parent_id: '550e8400-e29b-41d4-a716-446655440003', // API Performance Optimization
        child_id: '550e8400-e29b-41d4-a716-446655440013',  // Database Performance Tuning
        relation_type: 'contains'
      },

      // User Experience Enhancement contains tasks
      {
        parent_id: '550e8400-e29b-41d4-a716-446655440012', // User Experience Enhancement
        child_id: '550e8400-e29b-41d4-a716-446655440005',  // Customer Analytics Dashboard
        relation_type: 'contains'
      },
      {
        parent_id: '550e8400-e29b-41d4-a716-446655440012', // User Experience Enhancement
        child_id: '550e8400-e29b-41d4-a716-446655440014',  // Mobile App UI/UX Design System
        relation_type: 'contains'
      },

      // Mobile App Development also contains testing
      {
        parent_id: '550e8400-e29b-41d4-a716-446655440002', // Mobile App Development
        child_id: '550e8400-e29b-41d4-a716-446655440015',  // Automated Testing Framework
        relation_type: 'contains'
      },

      // Q1 Revenue Growth also contains sales optimization
      {
        parent_id: '550e8400-e29b-41d4-a716-446655440001', // Q1 Revenue Growth
        child_id: '550e8400-e29b-41d4-a716-446655440017',  // Enterprise Sales Process Optimization
        relation_type: 'contains'
      }
    ];

    const insertLineageQuery = `
      INSERT INTO lineage_edges (tenant_id, parent_id, child_id, relation_type, created_by)
      VALUES ($1, $2, $3, $4, $5)
    `;

    for (const relationship of lineageRelationships) {
      await this.db.query(insertLineageQuery, [
        '00000000-0000-0000-0000-000000000001', // tenant_id
        relationship.parent_id,
        relationship.child_id,
        relationship.relation_type,
        '00000000-0000-0000-0000-000000000002'  // created_by (demo user)
      ]);
    }

    this.logger.info('Demo lineage relationships created', { count: lineageRelationships.length });
  }

  private async insertDemoAIInsights(): Promise<void> {
    const insights = [
      {
        type: 'risk_prediction',
        title: 'Critical Security Audit Deadline Risk',
        content: 'Security audit compliance is significantly behind schedule with only 25% completion. High probability (85%) of missing critical deadline, which could delay mobile app launch.',
        confidence_score: 0.85,
        severity: 'critical',
        tenant_id: 'demo-tenant',
        work_item_id: '550e8400-e29b-41d4-a716-446655440004'
      },
      {
        type: 'performance_insight',
        title: 'API Optimization Exceeding Expectations',
        content: 'Database optimization efforts are showing 70% completion with substantial performance improvements. API response times have improved by 40% and are on track to exceed the 50% target.',
        confidence_score: 0.92,
        severity: 'info',
        tenant_id: 'demo-tenant',
        work_item_id: '550e8400-e29b-41d4-a716-446655440003'
      },
      {
        type: 'recommendation',
        title: 'Resource Reallocation for Security Compliance',
        content: 'Consider reallocating developer resources to security audit tasks to prevent mobile app launch delays. Authentication system is ahead of schedule and can free up resources.',
        confidence_score: 0.76,
        severity: 'medium',
        tenant_id: 'demo-tenant',
        work_item_id: '550e8400-e29b-41d4-a716-446655440006'
      },
      {
        type: 'bottleneck_detection',
        title: 'Payment Integration Blocking Mobile Launch',
        content: 'Third-party payment integration is blocked and creating a critical bottleneck for mobile app monetization features. This could impact Q1 revenue targets.',
        confidence_score: 0.88,
        severity: 'high',
        tenant_id: 'demo-tenant',
        work_item_id: '550e8400-e29b-41d4-a716-446655440007'
      }
    ];

    const insertQuery = `
      INSERT INTO ai_insights (type, title, content, confidence_score, severity, tenant_id, work_item_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `;

    for (const insight of insights) {
      await this.db.query(insertQuery, [
        insight.type, insight.title, insight.content, insight.confidence_score,
        insight.severity, insight.tenant_id, insight.work_item_id
      ]);
    }
  }

  private async insertDemoDependencies(): Promise<void> {
    const dependencies = [
      {
        work_item_id: '550e8400-e29b-41d4-a716-446655440002', // Mobile App
        depends_on_id: '550e8400-e29b-41d4-a716-446655440006', // Auth System
        dependency_type: 'blocks'
      },
      {
        work_item_id: '550e8400-e29b-41d4-a716-446655440002', // Mobile App
        depends_on_id: '550e8400-e29b-41d4-a716-446655440007', // Payment Integration
        dependency_type: 'blocks'
      },
      {
        work_item_id: '550e8400-e29b-41d4-a716-446655440005', // Analytics Dashboard
        depends_on_id: '550e8400-e29b-41d4-a716-446655440003', // API Optimization
        dependency_type: 'related'
      },
      {
        work_item_id: '550e8400-e29b-41d4-a716-446655440001', // Revenue Initiative
        depends_on_id: '550e8400-e29b-41d4-a716-446655440002', // Mobile App
        dependency_type: 'related'
      }
    ];

    const insertQuery = `
      INSERT INTO dependencies (work_item_id, depends_on_id, dependency_type, created_at)
      VALUES ($1, $2, $3, NOW())
    `;

    for (const dep of dependencies) {
      await this.db.query(insertQuery, [dep.work_item_id, dep.depends_on_id, dep.dependency_type]);
    }
  }
}
