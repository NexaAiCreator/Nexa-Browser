/**
 * WorkflowUIManager
 * Manages all workflow UI components and coordinates with the browser API
 */

class WorkflowUIManager {
  constructor() {
    this.sidebar = null;
    this.permissionDialog = null;
    this.clarificationDialog = null;
    this.workflows = new Map();
    this.cssLoaded = false;
  }

  async init() {
    // Load CSS if not already loaded
    if (!this.cssLoaded) {
      await this._loadStylesheet();
      this.cssLoaded = true;
    }

    // Initialize components
    this.sidebar = new WorkflowProgressSidebar();
    this.sidebar.init('body');

    this.permissionDialog = new PermissionDialog();
    this.permissionDialog.init('body');

    this.clarificationDialog = new ClarificationDialog();
    this.clarificationDialog.init('body');

    // Set up event listeners
    this._setupEventListeners();

    console.log('✅ WorkflowUIManager initialized');
  }

  async _loadStylesheet() {
    return new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = './components/workflow-ui.css';
      link.onload = resolve;
      link.onerror = () => {
        console.warn('Failed to load workflow-ui.css');
        resolve(); // Continue anyway
      };
      document.head.appendChild(link);
    });
  }

  _setupEventListeners() {
    if (!window.browserApi) {
      console.error('browserApi not available');
      return;
    }

    // Workflow events
    window.browserApi.onWorkflowStarted?.((data) => {
      console.log('Workflow started:', data);
      this._handleWorkflowStarted(data);
    });

    window.browserApi.onWorkflowStepStarted?.((data) => {
      console.log('Step started:', data);
      this.sidebar?.onStepStarted(data.stepId || data.step_id);
    });

    window.browserApi.onWorkflowStepCompleted?.((data) => {
      console.log('Step completed:', data);
      this.sidebar?.onStepCompleted(
        data.stepId || data.step_id,
        data.success,
        data.timing?.durationMs || data.timing?.total_ms
      );
    });

    window.browserApi.onWorkflowProgress?.((data) => {
      console.log('Workflow progress:', data);
      // Update any progress displays
    });

    window.browserApi.onWorkflowCompleted?.((data) => {
      console.log('Workflow completed:', data);
      this.sidebar?.onWorkflowCompleted(true);
      this._handleWorkflowCompleted(data);
    });

    window.browserApi.onWorkflowFailed?.((data) => {
      console.log('Workflow failed:', data);
      this.sidebar?.onWorkflowCompleted(false);
      this.sidebar?.onWorkflowError(data.error || 'Workflow failed');
    });

    window.browserApi.onWorkflowClarificationRequired?.((data) => {
      console.log('Clarification required:', data);
      this._handleClarificationRequired(data);
    });

    window.browserApi.onWorkflowPermissionRequired?.((data) => {
      console.log('Permission required:', data);
      this._handlePermissionRequired(data);
    });

    window.browserApi.onWorkflowUserActionRequired?.((data) => {
      console.log('User action required:', data);
      this._handleUserActionRequired(data);
    });
  }

  /**
   * Start a workflow from a goal
   */
  async startWorkflow(goal, permissions = []) {
    try {
      console.log('Starting workflow:', goal);

      // Get current context
      const context = this._getCurrentContext();

      // Call AI to plan the workflow
      const planResponse = await fetch('http://127.0.0.1:8000/agent/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal,
          context,
        }),
      });

      if (!planResponse.ok) {
        throw new Error(`Plan failed: ${planResponse.statusText}`);
      }

      const plan = this._normalizePlan(await planResponse.json());
      console.log('Workflow plan:', plan);

      // Check if user approval is needed
      if (plan.risk_assessment?.requires_approval) {
        await this._requestUserApproval(plan);
      }

      // Start the workflow
      const result = await window.browserApi.startWorkflow(
        goal,
        plan.steps,
        plan.required_permissions,
        { workflowId: plan.workflow_id }
      );

      // Store workflow info
      this.workflows.set(plan.workflow_id, {
        id: plan.workflow_id,
        goal,
        plan,
        startTime: Date.now(),
      });

      // Show sidebar with workflow info
      this.sidebar?.setWorkflow(plan);

      return plan.workflow_id;
    } catch (error) {
      console.error('Failed to start workflow:', error);
      this.sidebar?.onWorkflowError(error.message);
      throw error;
    }
  }

  _normalizePlan(plan) {
    const workflowId = plan.workflow_id || plan.workflowId || `wf-ui-${Date.now()}`;
    const requiredPermissions = plan.required_permissions || plan.permissions_required || [];

    return {
      ...plan,
      workflow_id: workflowId,
      required_permissions: requiredPermissions,
      steps: Array.isArray(plan.steps) ? plan.steps.map((step, index) => this._normalizeStep(step, index)) : []
    };
  }

  _normalizeStep(step, index) {
    const content = step.content || {};
    const actionType = step.action_type || step.actionType || content.action_type || content.action || step.action;
    const params = step.params || content.params || content || {};

    if (step.type === 'action' || actionType) {
      return {
        ...step,
        id: step.id || step.step_id || `step_${index + 1}`,
        type: 'action',
        action_type: actionType,
        params,
        content: {
          ...content,
          action_type: actionType,
          params
        }
      };
    }

    return {
      ...step,
      id: step.id || step.step_id || `step_${index + 1}`,
      params: step.params || content.params || content
    };
  }

  _getCurrentContext() {
    // Gather current browser context
    const tabs = Array.from(document.querySelectorAll('a[href]')).slice(0, 10).map(a => ({
      title: a.textContent,
      url: a.href,
    }));

    return {
      current_url: window.location.href,
      current_title: document.title,
      open_tabs: tabs,
      bookmarks: [],
      available_permissions: [
        'current_page',
        'selected_text',
        'navigate_pages',
        'click_elements',
        'fill_forms',
      ],
    };
  }

  async _requestUserApproval(plan) {
    return new Promise((resolve, reject) => {
      this.permissionDialog.show(
        {
          goal: plan.goal,
          description: plan.description,
        },
        plan.required_permissions,
        plan.risk_assessment,
        async (lifetime) => {
          try {
            console.log(`Approved with lifetime: ${lifetime}`);
            for (const scope of plan.required_permissions || []) {
              await window.browserApi.setActionPermission(scope, true, lifetime);
            }
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        () => {
          reject(new Error('User denied workflow'));
        }
      );
    });
  }

  _handleWorkflowStarted(data) {
    console.log('Workflow started event');
    this.sidebar?.onWorkflowStarted();
  }

  _handleWorkflowCompleted(data) {
    console.log('Workflow completed event', data);
    this.workflows.delete(data.workflowId || data.workflow_id);
    
    // Show results notification
    this._showNotification('✅ Workflow completed!', 'success', 5000);
  }

  async _handleClarificationRequired(data) {
    console.log('Clarification required:', data);

    return new Promise((resolve, reject) => {
      this.clarificationDialog.show(
        data.workflowId || data.workflow_id,
        data.stepId || data.step_id,
        data.question,
        data.input_type || 'text',
        async (response) => {
          try {
            await window.browserApi.provideClarification(
              data.workflowId || data.workflow_id,
              response
            );
            resolve();
          } catch (error) {
            console.error('Failed to submit clarification:', error);
            reject(error);
          }
        },
        async () => {
          try {
            await window.browserApi.provideErrorResponse(
              data.workflowId || data.workflow_id,
              'User skipped clarification'
            );
            resolve();
          } catch (error) {
            console.error('Failed to skip clarification:', error);
            reject(error);
          }
        }
      );
    });
  }

  async _handlePermissionRequired(data) {
    console.log('Permission required:', data);
    const requiredPermissions = data.required_permissions || data.requiredPermissions || data.missing || [];

    return new Promise((resolve, reject) => {
      this.permissionDialog.show(
        {
          goal: data.goal,
          description: `This workflow requires the following permissions to continue.`,
        },
        requiredPermissions,
        data.risk_assessment || {},
        async (lifetime) => {
          try {
            // Grant all requested permissions
            for (const scope of requiredPermissions) {
              await window.browserApi.setActionPermission(scope, true, lifetime);
            }
            resolve();
          } catch (error) {
            console.error('Failed to grant permissions:', error);
            reject(error);
          }
        },
        () => {
          reject(new Error('User denied permissions'));
        }
      );
    });
  }

  _handleUserActionRequired(data) {
    console.log('User action required:', data);
    this._showNotification(data.message || 'User action required', 'info');
  }

  _showNotification(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `workflow-notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 12px 16px;
      background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
      color: white;
      border-radius: 4px;
      font-size: 13px;
      z-index: 3000;
      animation: slideInUp 0.3s ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOutDown 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, duration);
  }

  /**
   * Cancel a running workflow
   */
  async cancelWorkflow(workflowId) {
    try {
      await window.browserApi.cancelWorkflow(workflowId);
      this.workflows.delete(workflowId);
    } catch (error) {
      console.error('Failed to cancel workflow:', error);
    }
  }

  /**
   * Pause a running workflow
   */
  async pauseWorkflow(workflowId) {
    try {
      await window.browserApi.pauseWorkflow(workflowId);
    } catch (error) {
      console.error('Failed to pause workflow:', error);
    }
  }

  /**
   * Resume a paused workflow
   */
  async resumeWorkflow(workflowId) {
    try {
      await window.browserApi.resumeWorkflow(workflowId);
    } catch (error) {
      console.error('Failed to resume workflow:', error);
    }
  }

  /**
   * Get status of a workflow
   */
  async getWorkflowStatus(workflowId) {
    try {
      const status = await window.browserApi.getWorkflowStatus(workflowId);
      return status;
    } catch (error) {
      console.error('Failed to get workflow status:', error);
      return null;
    }
  }

  /**
   * Clear sidebar
   */
  clearSidebar() {
    this.sidebar?.hide();
  }
}

// Global instance
window.workflowUIManager = null;

// Initialize on document ready
async function initWorkflowUI() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
      window.workflowUIManager = new WorkflowUIManager();
      await window.workflowUIManager.init();
    });
  } else {
    window.workflowUIManager = new WorkflowUIManager();
    await window.workflowUIManager.init();
  }
}

// Start initialization
initWorkflowUI().catch(console.error);

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WorkflowUIManager, initWorkflowUI };
}
