// Cedar Authorization Service for Work Item Operations

import axios from 'axios';
import { LoggerService } from './loggerService';
import { CedarEvaluationRequest, CedarEvaluationResponse, User, WorkItem } from '../types';

export class CedarAuthService {
  private logger: LoggerService;
  private policyServiceUrl: string;

  constructor() {
    this.logger = new LoggerService();
    this.policyServiceUrl = process.env.POLICY_SERVICE_URL || 'http://localhost:3001';
  }

  async evaluatePolicy(
    user: User,
    action: string,
    resource: WorkItem | any,
    context?: Record<string, any>
  ): Promise<CedarEvaluationResponse> {
    try {
      const request: CedarEvaluationRequest = {
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

      const response = await axios.post(
        `${this.policyServiceUrl}/api/policies/evaluate`,
        request,
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.data.success) {
        throw new Error(response.data.message || 'Policy evaluation failed');
      }

      const result = response.data.data as CedarEvaluationResponse;
      
      this.logger.debug('Policy evaluation completed', {
        userId: user.id,
        action,
        resourceId: resource.id,
        allowed: result.allowed,
        policyId: result.policy_id
      });

      return result;

    } catch (error) {
      this.logger.warn('Policy service unavailable, falling back to role-based authorization', {
        userId: user.id,
        action,
        resourceId: resource.id,
        error: error instanceof Error ? error.message : String(error)
      });

      // Fall back to role-based authorization when policy service is unavailable
      const allowed = this.fallbackAuthorization(user, action, resource);
      
      return {
        allowed,
        policy_id: 'fallback_authorization',
        reason: allowed ? 'Authorized via fallback role-based check' : 'Denied by fallback authorization',
        context: { 
          fallback: true, 
          error: error instanceof Error ? error.message : String(error),
          userRoles: user.roles,
          resourceTenantId: resource.tenant_id,
          userTenantId: user.tenant_id
        }
      };
    }
  }

  async canCreateWorkItem(
    user: User,
    workItemType: string,
    parentId?: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Check lineage enforcement policy
    const result = await this.evaluatePolicy(
      user,
      'create',
      {
        type: workItemType,
        tenant_id: user.tenant_id
      },
      {
        parent_id: parentId,
        lineage_enforcement: true
      }
    );

    if (!result.allowed) {
      return {
        allowed: false,
        reason: result.reason
      };
    }

    // Additional business logic checks
    if (workItemType !== 'objective' && !parentId) {
      // Check if user has executive role (CEO/President)
      const hasExecRole = user.roles.some(role => 
        ['CEO', 'President'].includes(role)
      );

      if (!hasExecRole) {
        return {
          allowed: false,
          reason: 'Non-objective work items require a parent unless created by CEO or President'
        };
      }
    }

    return { allowed: true };
  }

  async canUpdateWorkItem(user: User, workItem: WorkItem): Promise<boolean> {
    const result = await this.evaluatePolicy(user, 'update', workItem);
    return result.allowed;
  }

  async canDeleteWorkItem(user: User, workItem: WorkItem): Promise<boolean> {
    const result = await this.evaluatePolicy(user, 'delete', workItem);
    return result.allowed;
  }

  async canReadWorkItem(user: User, workItem: WorkItem): Promise<boolean> {
    const result = await this.evaluatePolicy(user, 'read', workItem);
    return result.allowed;
  }

  async canManageLineage(user: User, workItem: WorkItem): Promise<boolean> {
    const result = await this.evaluatePolicy(user, 'manage_lineage', workItem);
    return result.allowed;
  }

  /**
   * Fallback authorization check for when policy service is unavailable
   */
  fallbackAuthorization(user: User, action: string, resource: any): boolean {
    // Basic role-based fallback
    // const roleHierarchy = ['CEO', 'President', 'VP', 'Director', 'Manager', 'Contributor'];
    const requiredRoles: Record<string, string[]> = {
      'create': ['Manager', 'Director', 'VP', 'President', 'CEO'],
      'update': ['Manager', 'Director', 'VP', 'President', 'CEO'],
      'delete': ['Director', 'VP', 'President', 'CEO'],
      'read': ['Contributor', 'Manager', 'Director', 'VP', 'President', 'CEO']
    };

    const actionRoles = requiredRoles[action] || [];
    const hasRequiredRole = user.roles.some(role => actionRoles.includes(role));

    // Additional checks for tenant isolation
    const sameTenant = user.tenant_id === resource.tenant_id;

    // Owner check for read/update
    const isOwner = resource.owner_id === user.id;

    return sameTenant && (hasRequiredRole || isOwner);
  }
}
