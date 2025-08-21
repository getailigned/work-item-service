"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const pg_1 = require("pg");
const loggerService_1 = require("./loggerService");
class DatabaseService {
    constructor() {
        this.logger = new loggerService_1.LoggerService();
        this.pool = new pg_1.Pool({
            host: process.env.POSTGRES_HOST || 'localhost',
            port: parseInt(process.env.POSTGRES_PORT || '5432'),
            database: process.env.POSTGRES_DB || 'htma',
            user: process.env.POSTGRES_USER || 'htma',
            password: process.env.POSTGRES_PASSWORD || 'htma_password',
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });
        this.pool.on('error', (err) => {
            this.logger.error('Database pool error', { error: err.message });
        });
        this.pool.on('connect', () => {
            this.logger.debug('New database connection established');
        });
    }
    async query(text, params) {
        const start = Date.now();
        try {
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;
            this.logger.debug('Database query executed', {
                query: text,
                duration,
                rowCount: result.rowCount
            });
            return result;
        }
        catch (error) {
            const duration = Date.now() - start;
            this.logger.error('Database query failed', {
                query: text,
                duration,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
    async transaction(callback) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            this.logger.error('Transaction failed and rolled back', { error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
        finally {
            client.release();
        }
    }
    async initialize() {
        try {
            await this.createTables();
            await this.createIndexes();
            await this.createTriggers();
            this.logger.info('Database initialized successfully');
        }
        catch (error) {
            this.logger.error('Database initialization failed', { error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }
    async createTables() {
        const workItemsTable = `
      CREATE TABLE IF NOT EXISTS work_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        type VARCHAR(20) NOT NULL CHECK (type IN ('objective', 'strategy', 'initiative', 'task', 'subtask')),
        title VARCHAR(500) NOT NULL,
        description TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'planned', 'in_progress', 'blocked', 'review', 'completed', 'cancelled')),
        priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
        created_by UUID NOT NULL,
        owner_id UUID NOT NULL,
        due_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'::jsonb
      );
    `;
        const lineageEdgesTable = `
      CREATE TABLE IF NOT EXISTS lineage_edges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        parent_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
        child_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
        relation_type VARCHAR(20) NOT NULL DEFAULT 'contains' CHECK (relation_type IN ('contains', 'supports', 'derived_from')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by UUID NOT NULL,
        UNIQUE(parent_id, child_id)
      );
    `;
        const statusHistoryTable = `
      CREATE TABLE IF NOT EXISTS status_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
        from_status VARCHAR(20),
        to_status VARCHAR(20) NOT NULL,
        changed_by UUID NOT NULL,
        changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reason TEXT
      );
    `;
        const attachmentsTable = `
      CREATE TABLE IF NOT EXISTS attachments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
        filename VARCHAR(255) NOT NULL,
        uri TEXT NOT NULL,
        size_bytes INTEGER,
        mime_type VARCHAR(100),
        checksum VARCHAR(64),
        uploaded_by UUID NOT NULL,
        uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
        const commentsTable = `
      CREATE TABLE IF NOT EXISTS comments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        work_item_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
        author_id UUID NOT NULL,
        body TEXT NOT NULL,
        mentions TEXT[] DEFAULT ARRAY[]::TEXT[],
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;
        const dependencyEdgesTable = `
      CREATE TABLE IF NOT EXISTS dependency_edges (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        from_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
        to_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
        dependency_type VARCHAR(20) NOT NULL DEFAULT 'finish_to_start' CHECK (dependency_type IN ('finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish')),
        lag_days INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by UUID NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'::jsonb,
        UNIQUE(from_id, to_id),
        CONSTRAINT no_self_dependency CHECK (from_id != to_id)
      );
    `;
        await this.query(workItemsTable);
        await this.query(lineageEdgesTable);
        await this.query(statusHistoryTable);
        await this.query(attachmentsTable);
        await this.query(commentsTable);
        await this.query(dependencyEdgesTable);
    }
    async createIndexes() {
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_work_items_tenant_id ON work_items(tenant_id);',
            'CREATE INDEX IF NOT EXISTS idx_work_items_type ON work_items(type);',
            'CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status);',
            'CREATE INDEX IF NOT EXISTS idx_work_items_owner_id ON work_items(owner_id);',
            'CREATE INDEX IF NOT EXISTS idx_work_items_created_by ON work_items(created_by);',
            'CREATE INDEX IF NOT EXISTS idx_work_items_due_at ON work_items(due_at);',
            'CREATE INDEX IF NOT EXISTS idx_work_items_created_at ON work_items(created_at);',
            'CREATE INDEX IF NOT EXISTS idx_work_items_title_search ON work_items USING gin(to_tsvector(\'english\', title));',
            'CREATE INDEX IF NOT EXISTS idx_work_items_description_search ON work_items USING gin(to_tsvector(\'english\', description));',
            'CREATE INDEX IF NOT EXISTS idx_lineage_edges_tenant_id ON lineage_edges(tenant_id);',
            'CREATE INDEX IF NOT EXISTS idx_lineage_edges_parent_id ON lineage_edges(parent_id);',
            'CREATE INDEX IF NOT EXISTS idx_lineage_edges_child_id ON lineage_edges(child_id);',
            'CREATE INDEX IF NOT EXISTS idx_status_history_work_item_id ON status_history(work_item_id);',
            'CREATE INDEX IF NOT EXISTS idx_status_history_changed_at ON status_history(changed_at);',
            'CREATE INDEX IF NOT EXISTS idx_attachments_work_item_id ON attachments(work_item_id);',
            'CREATE INDEX IF NOT EXISTS idx_comments_work_item_id ON comments(work_item_id);',
            'CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments(author_id);',
            'CREATE INDEX IF NOT EXISTS idx_dependency_edges_tenant_id ON dependency_edges(tenant_id);',
            'CREATE INDEX IF NOT EXISTS idx_dependency_edges_from_id ON dependency_edges(from_id);',
            'CREATE INDEX IF NOT EXISTS idx_dependency_edges_to_id ON dependency_edges(to_id);',
            'CREATE INDEX IF NOT EXISTS idx_dependency_edges_type ON dependency_edges(dependency_type);'
        ];
        for (const index of indexes) {
            await this.query(index);
        }
    }
    async createTriggers() {
        const hasExecRoleFunction = `
      CREATE OR REPLACE FUNCTION has_exec_role(user_id UUID, tenant_id UUID)
      RETURNS BOOLEAN AS $$
      BEGIN
        -- This would typically check against user_roles table
        -- For now, we'll implement basic logic that can be replaced
        -- when Auth/User services are available
        RETURN FALSE; -- Will be overridden by service-level checks
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `;
        const lineageEnforcementFunction = `
      CREATE OR REPLACE FUNCTION enforce_lineage()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Only enforce lineage for non-objective items
        IF NEW.type IN ('strategy', 'initiative', 'task', 'subtask') THEN
          -- Check if item has a parent in lineage_edges
          IF NOT EXISTS (
            SELECT 1 FROM lineage_edges e
            WHERE e.tenant_id = NEW.tenant_id 
            AND e.child_id = NEW.id
          ) THEN
            -- No parent found - this will be handled at service level
            -- since we can't check user roles from DB trigger reliably
            NULL;
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `;
        const lineageEnforcementTrigger = `
      DROP TRIGGER IF EXISTS trigger_enforce_lineage ON work_items;
      CREATE TRIGGER trigger_enforce_lineage
        BEFORE INSERT ON work_items
        FOR EACH ROW
        EXECUTE FUNCTION enforce_lineage();
    `;
        const updateTimestampFunction = `
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `;
        const updateTimestampTriggers = [
            `DROP TRIGGER IF EXISTS trigger_work_items_updated_at ON work_items;
       CREATE TRIGGER trigger_work_items_updated_at
         BEFORE UPDATE ON work_items
         FOR EACH ROW
         EXECUTE FUNCTION update_updated_at_column();`,
            `DROP TRIGGER IF EXISTS trigger_comments_updated_at ON comments;
       CREATE TRIGGER trigger_comments_updated_at
         BEFORE UPDATE ON comments
         FOR EACH ROW
         EXECUTE FUNCTION update_updated_at_column();`
        ];
        await this.query(hasExecRoleFunction);
        await this.query(lineageEnforcementFunction);
        await this.query(lineageEnforcementTrigger);
        await this.query(updateTimestampFunction);
        for (const trigger of updateTimestampTriggers) {
            await this.query(trigger);
        }
    }
    async close() {
        await this.pool.end();
        this.logger.info('Database connection pool closed');
    }
}
exports.DatabaseService = DatabaseService;
//# sourceMappingURL=databaseService.js.map