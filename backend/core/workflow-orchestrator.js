/**
 * Workflow Orchestrator
 * Manages multi-step workflow execution
 * Coordinates planning, action execution, observation, and adaptation
 */

const EventEmitter = require("events");

class WorkflowOrchestrator extends EventEmitter {
  constructor(actionExecutor, permissionManager) {
    super();
    this.actionExecutor = actionExecutor;
    this.permissionManager = permissionManager;
    this.workflows = new Map();
    this.nextWorkflowId = 1;
  }

  /**
   * Start a new workflow
   */
  async startWorkflow(goal, steps, options = {}) {
    const workflowId = `wf_${this.nextWorkflowId++}`;
    const normalizedSteps = this._normalizeSteps(steps);

    const workflow = {
      id: workflowId,
      goal,
      steps: normalizedSteps,
      status: "initializing",
      currentStepIndex: 0,
      stepsCompleted: [],
      stepsPending: normalizedSteps,
      observations: [],
      errors: [],
      startedAt: Date.now(),
      estimatedCompletionMs: options.totalTimeout || 300000, // 5 min default
      permissions: options.permissions || [],
      options,
      executionActive: false
    };

    this.workflows.set(workflowId, workflow);

    // Check permissions before starting
    const permCheck = this.permissionManager.checkWorkflowPermissions(workflow);
    if (!permCheck.allowed) {
      workflow.status = "permission_denied";
      workflow.errors.push(permCheck.message);

      this.emit("workflow:permission-required", {
        workflowId,
        workflow_id: workflowId,
        goal,
        missing: permCheck.missing,
        required_permissions: permCheck.missing
      });

      return { workflowId, status: "permission_denied", message: permCheck.message };
    }

    // Begin execution
    setImmediate(() => this._executeWorkflow(workflowId));

    return { workflowId, status: "started", message: `Workflow ${workflowId} started` };
  }

  _normalizeSteps(steps = []) {
    return steps.map((step, index) => {
      const content = step.content || {};
      const actionType = step.action_type || step.actionType || content.action_type || content.action || step.action;
      const params = step.params || content.params || content || {};

      if (step.type === "action" || actionType) {
        return {
          ...step,
          id: step.id || step.step_id || `step_${index + 1}`,
          type: "action",
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
        params
      };
    });
  }

  /**
   * Internal workflow execution loop
   */
  async _executeWorkflow(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;
    if (workflow.executionActive) return;

    workflow.executionActive = true;
    workflow.status = "running";
    this.emit("workflow:started", { workflowId, goal: workflow.goal });

    try {
      while (workflow.currentStepIndex < workflow.steps.length) {
        if (workflow.status === "cancelled") {
          return;
        }

        if (workflow.status === "paused") {
          await this._waitUntilRunnable(workflowId);
          if (workflow.status === "cancelled") {
            return;
          }
        }

        const step = workflow.steps[workflow.currentStepIndex];

        // Emit progress
          this.emit("workflow:step-started", {
            workflowId,
            workflow_id: workflowId,
            stepIndex: workflow.currentStepIndex,
            step_index: workflow.currentStepIndex,
            stepId: step.id,
            step_id: step.id,
            stepLabel: step.label || `Step ${workflow.currentStepIndex + 1}`
          });

        try {
          // Execute the step
          const result = await this._executeStep(workflowId, step);

          // Record observation
          workflow.observations.push(result);

          // Mark step as complete
          workflow.stepsCompleted.push({
            id: step.id,
            status: "done",
            result
          });

          // Check if we should adapt the plan
          const adaptation = await this._checkAdaptation(workflowId, result, step);
          if (adaptation.needsAdaptation) {
            await this._handleAdaptation(workflowId, adaptation);
            continue;
          }

          // Emit result
          this.emit("workflow:step-completed", {
            workflowId,
            workflow_id: workflowId,
            stepIndex: workflow.currentStepIndex,
            step_index: workflow.currentStepIndex,
            stepId: step.id,
            step_id: step.id,
            success: result.success !== false,
            result,
            timing: result.timing
          });

          // Move to next step
          workflow.currentStepIndex++;

          // Calculate progress
          const progress = (workflow.currentStepIndex / workflow.steps.length) * 100;

          this.emit("workflow:progress", {
            workflowId,
            progress: Math.round(progress),
            currentStep: workflow.currentStepIndex,
            totalSteps: workflow.steps.length
          });
        } catch (error) {
          // Handle step error
          const handled = await this._handleStepError(workflowId, error, step);

          if (!handled) {
            // If not handled, fail workflow
            throw error;
          }
        }
      }

      // Workflow completed successfully
      workflow.status = "completed";
      workflow.completedAt = Date.now();

      this.emit("workflow:completed", {
        workflowId,
        workflow_id: workflowId,
        goal: workflow.goal,
        status: "success",
        stepsExecuted: workflow.stepsCompleted.length,
        totalDurationMs: workflow.completedAt - workflow.startedAt,
        observations: workflow.observations
      });
    } catch (error) {
      // Workflow failed
      workflow.status = "failed";
      workflow.failedAt = Date.now();
      workflow.errors.push(error.message);

      this.emit("workflow:failed", {
        workflowId,
        workflow_id: workflowId,
        error: error.message,
        stepsCompleted: workflow.stepsCompleted.length,
        totalSteps: workflow.steps.length
      });
    } finally {
      workflow.executionActive = false;
    }
  }

  async _waitUntilRunnable(workflowId) {
    const workflow = this.workflows.get(workflowId);
    while (workflow && workflow.status === "paused") {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * Execute a single step
   */
  async _executeStep(workflowId, step) {
    const workflow = this.workflows.get(workflowId);

    switch (step.type) {
      case "action":
        return await this._executeActionStep(workflowId, step);

      case "decision":
        return await this._executeDecisionStep(workflowId, step);

      case "clarification":
        return await this._executeClarificationStep(workflowId, step);

      case "synthesize":
        return await this._executeSynthesizeStep(workflowId, step);

      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  /**
   * Execute an action step (interact with browser)
   */
  async _executeActionStep(workflowId, step) {
    const workflow = this.workflows.get(workflowId);

    // Check permission for this action
    const perms = this.permissionManager.getRequiredPermissions(step.action_type);
    for (const perm of perms) {
      if (!this.permissionManager.checkPermission(perm)) {
        throw new Error(`Permission denied for action: ${perm}`);
      }
    }

    // Execute action
    const result = await this.actionExecutor.executeAction(
      {
        type: step.action_type,
        params: step.params
      },
      workflowId
    );

    if (!result.success) {
      throw new Error(`Action failed: ${result.error}`);
    }

    return {
      type: "action",
      actionType: step.action_type,
      success: true,
      result: result.result,
      domState: result.domState,
      timing: result.timing
    };
  }

  /**
   * Execute a decision step (check conditions)
   */
  async _executeDecisionStep(workflowId, step) {
    const workflow = this.workflows.get(workflowId);

    // For now, simple branching based on recent observations
    const lastObservation = workflow.observations[workflow.observations.length - 1];

    if (step.params.check === "element_found") {
      if (lastObservation?.result?.elementsFound > 0) {
        return {
          type: "decision",
          condition: "element_found",
          result: true,
          branchesDetected: 1
        };
      }
    }

    return {
      type: "decision",
      condition: step.params.check,
      result: false
    };
  }

  /**
   * Execute a clarification step (ask user)
   */
  async _executeClarificationStep(workflowId, step) {
    const workflow = this.workflows.get(workflowId);

    return new Promise((resolve) => {
      // Emit clarification request
      this.emit("workflow:clarification-required", {
        workflowId,
        workflow_id: workflowId,
        stepId: step.id,
        step_id: step.id,
        question: step.params.question,
        options: step.params.options,
        input_type: step.params.input_type || step.params.inputType || "text",
        timeout: step.params.timeout || 30000
      });

      // Store callback for when user responds
      const timeoutHandle = setTimeout(() => {
        resolve({
          type: "clarification",
          result: null,
          timedOut: true
        });
      }, step.params.timeout || 30000);

      this.on(`clarification:${workflowId}`, (response) => {
        clearTimeout(timeoutHandle);
        resolve({
          type: "clarification",
          result: response
        });
      });
    });
  }

  /**
   * Execute a synthesize step (aggregate data)
   */
  async _executeSynthesizeStep(workflowId, step) {
    const workflow = this.workflows.get(workflowId);

    // Aggregate observations into final result
    const synthesis = {
      type: "synthesize",
      inputs: step.params.inputs || [],
      aggregated: []
    };

    // Collect referenced observations
    step.params.inputs?.forEach((inputId) => {
      const obs = workflow.observations.find(
        (o) => o.actionId === inputId || o.id === inputId
      );
      if (obs) {
        synthesis.aggregated.push(obs.result);
      }
    });

    return synthesis;
  }

  /**
   * Check if plan needs adaptation based on observation
   */
  async _checkAdaptation(workflowId, observation, step) {
    // Implement adaptation logic
    // For now, simple checks

    if (!observation.success && step.params?.retries !== undefined) {
      return {
        needsAdaptation: true,
        type: "retry",
        reason: "Action failed, will retry"
      };
    }

    if (observation.result?.elementsFound === 0) {
      return {
        needsAdaptation: true,
        type: "alternative_selector",
        reason: "Element not found, trying alternative"
      };
    }

    return { needsAdaptation: false };
  }

  /**
   * Handle plan adaptation
   */
  async _handleAdaptation(workflowId, adaptation) {
    const workflow = this.workflows.get(workflowId);

    if (adaptation.type === "retry") {
      // Retry current step
      this.emit("workflow:retrying", {
        workflowId,
        stepIndex: workflow.currentStepIndex,
        reason: adaptation.reason
      });
      // Step index doesn't increment, so it will retry
    } else if (adaptation.type === "alternative_selector") {
      // Try alternative selector if available
      const step = workflow.steps[workflow.currentStepIndex];
      if (step.params?.alternativeSelector) {
        step.params.selector = step.params.alternativeSelector;
        this.emit("workflow:adapting-selector", { workflowId });
        // Retry with new selector
      }
    }
  }

  /**
   * Handle step error
   */
  async _handleStepError(workflowId, error, step) {
    const workflow = this.workflows.get(workflowId);

    workflow.errors.push({
      stepId: step.id,
      error: error.message,
      timestamp: Date.now()
    });

    // Try to recover
    if (error.message.includes("element_not_found")) {
      // Emit user clarification
      this.emit("workflow:user-action-required", {
        workflowId,
        workflow_id: workflowId,
        stepId: step.id,
        step_id: step.id,
        issue: "Element not found",
        message: "Element not found",
        options: ["Retry", "Skip", "Stop"]
      });

      return new Promise((resolve) => {
        this.once(`error-response:${workflowId}`, (response) => {
          if (response === "Retry") {
            resolve(true); // Will retry
          } else if (response === "Skip") {
            workflow.currentStepIndex++; // Skip to next
            resolve(true);
          } else {
            resolve(false); // Stop workflow
          }
        });
      });
    }

    return false; // Can't recover
  }

  /**
   * Pause workflow
   */
  pauseWorkflow(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return false;

    workflow.status = "paused";
    this.emit("workflow:paused", { workflowId });

    return true;
  }

  /**
   * Resume workflow
   */
  resumeWorkflow(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return false;

    workflow.status = "running";
    this.emit("workflow:resumed", { workflowId });

    if (!workflow.executionActive) {
      setImmediate(() => this._executeWorkflow(workflowId));
    }

    return true;
  }

  /**
   * Cancel workflow
   */
  cancelWorkflow(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return false;

    workflow.status = "cancelled";
    workflow.cancelledAt = Date.now();

    this.emit("workflow:cancelled", { workflowId });

    return true;
  }

  /**
   * Get workflow status
   */
  getWorkflowStatus(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return null;

    return {
      id: workflow.id,
      goal: workflow.goal,
      status: workflow.status,
      currentStep: workflow.currentStepIndex,
      totalSteps: workflow.steps.length,
      progress: (workflow.currentStepIndex / workflow.steps.length) * 100,
      stepsCompleted: workflow.stepsCompleted,
      observations: workflow.observations,
      errors: workflow.errors,
      startedAt: workflow.startedAt,
      completedAt: workflow.completedAt
    };
  }

  /**
   * Provide user input to clarification
   */
  provideClarification(workflowId, response) {
    this.emit(`clarification:${workflowId}`, response);
  }

  /**
   * Provide error response
   */
  provideErrorResponse(workflowId, response) {
    this.emit(`error-response:${workflowId}`, response);
  }

  /**
   * Get all workflows
   */
  getAllWorkflows() {
    return Array.from(this.workflows.values()).map((wf) => ({
      id: wf.id,
      goal: wf.goal,
      status: wf.status,
      progress: (wf.currentStepIndex / wf.steps.length) * 100
    }));
  }

  /**
   * Cleanup completed workflows
   */
  cleanupCompletedWorkflows() {
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    for (const [id, workflow] of this.workflows.entries()) {
      if (
        (workflow.status === "completed" || workflow.status === "failed") &&
        workflow.completedAt < oneHourAgo
      ) {
        this.workflows.delete(id);
      }
    }
  }
}

module.exports = { WorkflowOrchestrator };
