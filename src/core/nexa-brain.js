const EventEmitter = require("events");

const DEFAULT_GENERATION_ENDPOINT = "http://127.0.0.1:8000";

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function normalizeText(value) {
  return `${value || ""}`.trim();
}

function hasAny(text, needles) {
  const haystack = text.toLowerCase();
  return needles.some((needle) => haystack.includes(needle));
}

class NexaBrain extends EventEmitter {
  constructor({ actionExecutor, permissionManager, workflowOrchestrator, database, aiServiceBaseUrl } = {}) {
    super();
    this.actionExecutor = actionExecutor;
    this.permissionManager = permissionManager;
    this.workflowOrchestrator = workflowOrchestrator;
    this.database = database;
    this.aiServiceBaseUrl = aiServiceBaseUrl || process.env.NEXA_AI_SERVICE_URL || DEFAULT_GENERATION_ENDPOINT;
    this.runs = new Map();
    this.workflowRunMap = new Map();

    this._bindWorkflowEvents();
  }

  async askGoal(goal, context = {}) {
    const run = this._createRun(goal, context);
    this._emitRun(run.id, "brain:reasoning", {
      goal: run.goal,
      intent: "browser_workflow",
      reasoning: "Building a safe browser workflow."
    });

    const plan = await this._buildPlan(run.goal, context);
    run.intent = plan.intent;
    run.plan = plan;
    run.requiredPermissions = plan.permissionsRequired || [];
    run.status = run.requiredPermissions.length ? "awaiting_permission" : "running";
    run.updatedAt = Date.now();
    this._saveRun(run);

    this._emitRun(run.id, "brain:planned", { goal: run.goal, plan });

    if (run.requiredPermissions.length) {
      this._emitRun(run.id, "brain:permission-required", {
        goal: run.goal,
        plan,
        missing: run.requiredPermissions,
        risk: this._assessRisk(run.requiredPermissions)
      });
      return this._publicRun(run);
    }

    await this._startWorkflow(run);
    return this._publicRun(run);
  }

  async provideClarification(runId, answers = {}) {
    const run = this.runs.get(runId) || this._hydrateRun(runId);
    if (!run) {
      return { status: "failed", error: `Brain run not found: ${runId}` };
    }

    run.answers = { ...(run.answers || {}), ...answers };
    run.status = "planning";
    run.updatedAt = Date.now();
    this._saveRun(run);

    const clarifiedGoal = [run.goal, ...Object.values(answers).map(normalizeText)].filter(Boolean).join(" ");
    const plan = await this._buildPlan(clarifiedGoal, run.context || {});
    run.plan = plan;
    run.intent = plan.intent;
    run.requiredPermissions = plan.permissionsRequired || [];
    run.status = run.requiredPermissions.length ? "awaiting_permission" : "running";
    run.updatedAt = Date.now();
    this._saveRun(run);

    this._emitRun(run.id, "brain:planned", { goal: run.goal, plan });

    if (run.requiredPermissions.length) {
      this._emitRun(run.id, "brain:permission-required", {
        goal: run.goal,
        plan,
        missing: run.requiredPermissions,
        risk: this._assessRisk(run.requiredPermissions)
      });
      return this._publicRun(run);
    }

    await this._startWorkflow(run);
    return this._publicRun(run);
  }

  async providePermissionDecision(runId, granted = {}) {
    const run = this.runs.get(runId) || this._hydrateRun(runId);
    if (!run) {
      return { status: "failed", error: `Brain run not found: ${runId}` };
    }

    const denied = [];
    for (const [scope, allowed] of Object.entries(granted || {})) {
      if (allowed) {
        this.permissionManager?.grantPermission(scope, { scope_type: "session" });
      } else {
        this.permissionManager?.denyPermission(scope);
        denied.push(scope);
      }
    }

    if (denied.length) {
      run.status = "failed";
      run.error = `Permission denied: ${denied.join(", ")}`;
      run.updatedAt = Date.now();
      this._saveRun(run);
      this._emitRun(run.id, "brain:failed", { error: run.error });
      return this._publicRun(run);
    }

    run.status = "running";
    run.updatedAt = Date.now();
    this._saveRun(run);
    await this._startWorkflow(run);
    return this._publicRun(run);
  }

  cancelRun(runId) {
    const run = this.runs.get(runId) || this._hydrateRun(runId);
    if (!run) return false;

    if (run.workflowId) {
      this.workflowOrchestrator?.cancelWorkflow(run.workflowId);
    }

    run.status = "cancelled";
    run.updatedAt = Date.now();
    this._saveRun(run);
    this._emitRun(run.id, "brain:cancelled", {});
    return true;
  }

  listRuns(limit = 25) {
    if (this.database?.listBrainRuns) {
      const stored = this.database.listBrainRuns(limit);
      for (const run of stored) {
        this.runs.set(run.id, { ...run, context: run.context || {} });
      }
      return stored;
    }

    return Array.from(this.runs.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((run) => this._publicRun(run));
  }

  getRun(runId) {
    const run = this.runs.get(runId) || this._hydrateRun(runId);
    return run ? this._publicRun(run) : null;
  }

  _onWorkflowCompleted(workflowId, data = {}) {
    const run = this._getRunForWorkflow(workflowId);
    if (!run || run.status === "completed") return;

    run.status = "completed";
    run.result = {
      workflowId,
      final: {
        stepsExecuted: data.stepsExecuted || 0,
        totalDurationMs: data.totalDurationMs || 0
      },
      observations: data.observations || []
    };
    run.updatedAt = Date.now();
    this._saveRun(run);
    this._emitRun(run.id, "brain:completed", { result: run.result });
  }

  _onWorkflowFailed(workflowId, data = {}) {
    const run = this._getRunForWorkflow(workflowId);
    if (!run || run.status === "failed") return;

    run.status = "failed";
    run.error = data.error || "Workflow failed.";
    run.updatedAt = Date.now();
    this._saveRun(run);
    this._emitRun(run.id, "brain:failed", { error: run.error });
  }

  _bindWorkflowEvents() {
    if (!this.workflowOrchestrator?.on) return;

    const forward = (event) => (data = {}) => {
      const run = this._getRunForWorkflow(data.workflowId || data.workflow_id);
      if (!run) return;
      this._emitRun(run.id, event, data);
    };

    this.workflowOrchestrator.on("workflow:started", forward("workflow:started"));
    this.workflowOrchestrator.on("workflow:step-started", forward("workflow:step-started"));
    this.workflowOrchestrator.on("workflow:step-completed", forward("workflow:step-completed"));
    this.workflowOrchestrator.on("workflow:progress", forward("workflow:progress"));
  }

  async _buildPlan(goal, context = {}) {
    const remotePlan = await this._tryRemotePlan(goal, context);
    if (remotePlan) {
      return this._normalizePlan(remotePlan, goal);
    }

    return this._buildLocalPlan(goal, context);
  }

  async _tryRemotePlan(goal, context) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const response = await fetch(`${this.aiServiceBaseUrl}/agent/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          context: {
            current_url: context.currentUrl || "",
            current_title: context.currentTitle || "",
            open_tabs: context.openTabs || []
          }
        }),
        signal: controller.signal
      });

      if (!response.ok) return null;
      const json = await response.json().catch(() => null);
      return json?.plan || json?.workflow || json;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  _buildLocalPlan(goal, context = {}) {
    const text = goal.toLowerCase();
    const currentUrl = normalizeText(context.currentUrl);
    const steps = [];

    if (hasAny(text, ["search", "latest", "find", "look up", "release notes", "openai"])) {
      const query = encodeURIComponent(goal);
      steps.push({
        id: "step_1",
        type: "action",
        action_type: "navigate",
        label: "Search the web",
        params: { url: `https://www.google.com/search?q=${query}` }
      });
      steps.push({
        id: "step_2",
        type: "action",
        action_type: "read",
        label: "Read visible results",
        params: { selector: "body", return_type: "data" }
      });
    } else if (hasAny(text, ["click", "press", "open button", "load more"])) {
      const label = goal.replace(/^(click|press)\s+/i, "").slice(0, 80);
      steps.push({
        id: "step_1",
        type: "action",
        action_type: "click",
        label: "Click matching element",
        params: { textIncludes: label || "load more" }
      });
      steps.push({
        id: "step_2",
        type: "action",
        action_type: "read",
        label: "Observe result",
        params: { selector: "body", return_type: "data" }
      });
    } else if (currentUrl) {
      steps.push({
        id: "step_1",
        type: "action",
        action_type: "read",
        label: "Read current page",
        params: { selector: "body", return_type: "data" }
      });
    } else {
      steps.push({
        id: "step_1",
        type: "action",
        action_type: "read",
        label: "Read current page",
        params: { selector: "body", return_type: "data" }
      });
    }

    return this._normalizePlan({
      goal,
      intent: this._inferIntent(goal),
      reasoning: "Local fallback plan because the AI planning endpoint is unavailable.",
      steps
    }, goal);
  }

  _normalizePlan(plan, goal) {
    const steps = Array.isArray(plan.steps) ? plan.steps : [];
    const normalizedSteps = steps.map((step, index) => {
      const actionType = step.action_type || step.actionType || step.action || step.type;
      return {
        ...step,
        id: step.id || step.step_id || `step_${index + 1}`,
        type: step.type === "clarification" || step.type === "decision" || step.type === "synthesize" ? step.type : "action",
        action_type: actionType,
        label: step.label || step.description || `Step ${index + 1}`,
        params: step.params || {}
      };
    });

    return {
      goal: plan.goal || goal,
      intent: plan.intent || this._inferIntent(goal),
      reasoning: plan.reasoning || "Plan generated for browser workflow.",
      steps: normalizedSteps,
      permissionsRequired: this._requiredPermissionsForSteps(normalizedSteps)
    };
  }

  _requiredPermissionsForSteps(steps) {
    const permissions = [];
    for (const step of steps) {
      const required = this.permissionManager?.getRequiredPermissions(step.action_type) || [];
      permissions.push(...required);
    }
    return unique(permissions);
  }

  _inferIntent(goal) {
    const text = goal.toLowerCase();
    if (hasAny(text, ["summarize", "explain", "what is", "tell me"])) return "read_and_answer";
    if (hasAny(text, ["click", "press", "fill", "open", "search", "find", "latest"])) return "browser_action";
    return "browser_workflow";
  }

  _assessRisk(permissions) {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const scope of permissions || []) {
      const risk = this.permissionManager?.permissionScopes?.[scope]?.risk || "medium";
      counts[risk] = (counts[risk] || 0) + 1;
    }
    const overall = counts.critical ? "critical" : counts.high ? "high" : counts.medium ? "medium" : "low";
    return { overall, ...counts };
  }

  async _startWorkflow(run) {
    if (!this.workflowOrchestrator) {
      throw new Error("Workflow orchestrator not initialized.");
    }

    const result = await this.workflowOrchestrator.startWorkflow(run.goal, run.plan.steps, {
      permissions: run.requiredPermissions
    });

    run.workflowId = result.workflowId;
    run.status = result.status === "permission_denied" ? "awaiting_permission" : "running";
    run.updatedAt = Date.now();
    this.workflowRunMap.set(result.workflowId, run.id);
    this._saveRun(run);

    if (result.status === "permission_denied") {
      this._emitRun(run.id, "brain:permission-required", {
        goal: run.goal,
        plan: run.plan,
        missing: result.missing || run.requiredPermissions,
        risk: this._assessRisk(result.missing || run.requiredPermissions)
      });
    }
  }

  _createRun(goal, context) {
    const run = {
      id: createId("brain"),
      goal,
      context,
      status: "planning",
      intent: null,
      plan: null,
      workflowId: null,
      clarifications: [],
      answers: {},
      requiredPermissions: [],
      result: null,
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.runs.set(run.id, run);
    this._saveRun(run);
    return run;
  }

  _hydrateRun(runId) {
    if (!this.database?.getBrainRun) return null;
    const stored = this.database.getBrainRun(runId);
    if (!stored) return null;
    this.runs.set(stored.id, stored);
    if (stored.workflowId) {
      this.workflowRunMap.set(stored.workflowId, stored.id);
    }
    return stored;
  }

  _getRunForWorkflow(workflowId) {
    if (!workflowId) return null;
    const runId = this.workflowRunMap.get(workflowId);
    if (!runId) return null;
    return this.runs.get(runId) || this._hydrateRun(runId);
  }

  _emitRun(runId, event, data = {}) {
    this.emit("run:event", { runId, event, data });
  }

  _saveRun(run) {
    this.runs.set(run.id, run);
    if (!this.database?.logBrainRun) return;

    try {
      this.database.logBrainRun(run);
    } catch (error) {
      console.warn("[NexaBrain] Failed to persist run:", error.message);
    }
  }

  _publicRun(run) {
    return {
      id: run.id,
      runId: run.id,
      goal: run.goal,
      intent: run.intent,
      status: run.status,
      plan: run.plan,
      workflowId: run.workflowId,
      clarifications: run.clarifications || [],
      answers: run.answers || {},
      requiredPermissions: run.requiredPermissions || [],
      result: run.result || null,
      error: run.error || null,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt
    };
  }
}

module.exports = { NexaBrain };
