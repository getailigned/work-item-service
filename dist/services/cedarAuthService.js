"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CedarAuthService = void 0;
const axios_1 = __importDefault(require("axios"));
const loggerService_1 = require("./loggerService");
class CedarAuthService {
    constructor() {
        this.logger = new loggerService_1.LoggerService();
        this.policyServiceUrl = process.env.POLICY_SERVICE_URL || 'http://localhost:3001';
    }
    async evaluatePolicy(user, action, resource, context) {
        try {
            const request = {
                principal: {
                    id: user.id,
                    tenant_id: user.tenant_id,
                    roles: user.roles
                },
                action: {
                    type: action,
                    id: `action_${action}`
                },
                resource: {
                    id: resource.id || `resource_${Date.now()}`,
                    type: resource.type || 'work_item',
                    tenant_id: resource.tenant_id || user.tenant_id,
                    owner_id: resource.owner_id
                },
                context: {
                    ...context,
                    timestamp: new Date(),
                    service: 'work-item-service'
                }
            };
            const response = await axios_1.default.post(`${this.policyServiceUrl}/api/policies/evaluate`, request, {
                timeout: 5000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            if (!response.data.success) {
                throw new Error(response.data.message || 'Policy evaluation failed');
            }
            const result = response.data.data;
            this.logger.debug('Policy evaluation completed', {
                userId: user.id,
                action,
                resourceId: resource.id,
                allowed: result.allowed,
                policyId: result.policy_id
            });
            return result;
        }
        catch (error) {
            this.logger.error('Policy evaluation failed', {
                userId: user.id,
                action,
                resourceId: resource.id,
                error: error instanceof Error ? error.message : String(error)
            });
            return {
                allowed: false,
                policy_id: 'error_deny',
                reason: 'Policy evaluation failed - defaulting to deny',
                context: { error: error instanceof Error ? error.message : String(error) }
            };
        }
    }
    async canCreateWorkItem(user, workItemType, parentId) {
        const result = await this.evaluatePolicy(user, 'create', {
            type: workItemType,
            tenant_id: user.tenant_id
        }, {
            parent_id: parentId,
            lineage_enforcement: true
        });
        if (!result.allowed) {
            return {
                allowed: false,
                reason: result.reason
            };
        }
        if (workItemType !== 'objective' && !parentId) {
            const hasExecRole = user.roles.some(role => ['CEO', 'President'].includes(role));
            if (!hasExecRole) {
                return {
                    allowed: false,
                    reason: 'Non-objective work items require a parent unless created by CEO or President'
                };
            }
        }
        return { allowed: true };
    }
    async canUpdateWorkItem(user, workItem) {
        const result = await this.evaluatePolicy(user, 'update', workItem);
        return result.allowed;
    }
    async canDeleteWorkItem(user, workItem) {
        const result = await this.evaluatePolicy(user, 'delete', workItem);
        return result.allowed;
    }
    async canReadWorkItem(user, workItem) {
        const result = await this.evaluatePolicy(user, 'read', workItem);
        return result.allowed;
    }
    async canManageLineage(user, workItem) {
        const result = await this.evaluatePolicy(user, 'manage_lineage', workItem);
        return result.allowed;
    }
    fallbackAuthorization(user, action, resource) {
        const requiredRoles = {
            'create': ['Manager', 'Director', 'VP', 'President', 'CEO'],
            'update': ['Manager', 'Director', 'VP', 'President', 'CEO'],
            'delete': ['Director', 'VP', 'President', 'CEO'],
            'read': ['Contributor', 'Manager', 'Director', 'VP', 'President', 'CEO']
        };
        const actionRoles = requiredRoles[action] || [];
        const hasRequiredRole = user.roles.some(role => actionRoles.includes(role));
        const sameTeant = user.tenant_id === resource.tenant_id;
        const isOwner = resource.owner_id === user.id;
        return sameTeant && (hasRequiredRole || isOwner);
    }
}
exports.CedarAuthService = CedarAuthService;
//# sourceMappingURL=cedarAuthService.js.map