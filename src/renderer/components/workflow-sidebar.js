/**
 * WorkflowProgressSidebar Component
 * Displays real-time workflow execution progress with step details
 */

class WorkflowProgressSidebar {
  constructor() {
    this.container = null;
    this.workflow = null;
    this.currentStep = 0;
    this.isVisible = false;
  }

  init(parentSelector = '#app') {
    const parent = document.querySelector(parentSelector) || document.body;
    if (!parent) return;

    this.container = document.createElement('div');
    this.container.id = 'workflow-sidebar';
    this.container.className = 'workflow-sidebar hidden';
    this.container.innerHTML = this._getTemplate();
    parent.appendChild(this.container);

    this._attachEventListeners();
  }

  _getTemplate() {
    return `
      <div class="workflow-sidebar-header">
        <div class="workflow-title">
          <h3 id="workflow-goal">Workflow</h3>
          <span id="workflow-status" class="status-badge">Initializing</span>
        </div>
        <button id="close-sidebar" class="close-btn" aria-label="Close sidebar">×</button>
      </div>

      <div class="workflow-meta">
        <div class="meta-item">
          <span class="meta-label">Progress:</span>
          <span id="progress-text" class="meta-value">0/0</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Time:</span>
          <span id="elapsed-time" class="meta-value">0:00</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Risk:</span>
          <span id="risk-level" class="meta-value risk-low">Low</span>
        </div>
      </div>

      <div class="workflow-steps" id="steps-container">
        <!-- Steps will be inserted here -->
      </div>

      <div class="workflow-actions">
        <button id="pause-workflow" class="action-btn pause-btn">
          <span class="btn-icon">⏸</span> Pause
        </button>
        <button id="cancel-workflow" class="action-btn cancel-btn">
          <span class="btn-icon">⊗</span> Cancel
        </button>
      </div>

      <div id="workflow-error" class="error-message hidden">
        <!-- Error messages will appear here -->
      </div>
    `;
  }

  _attachEventListeners() {
    const closeBtn = this.container.querySelector('#close-sidebar');
    const pauseBtn = this.container.querySelector('#pause-workflow');
    const cancelBtn = this.container.querySelector('#cancel-workflow');

    closeBtn?.addEventListener('click', () => this.hide());
    pauseBtn?.addEventListener('click', () => this._onPause());
    cancelBtn?.addEventListener('click', () => this._onCancel());
  }

  show() {
    if (this.container) {
      this.container.classList.remove('hidden');
      this.isVisible = true;
    }
  }

  hide() {
    if (this.container) {
      this.container.classList.add('hidden');
      this.isVisible = false;
    }
  }

  setWorkflow(workflow) {
    this.workflow = workflow;
    this.currentStep = 0;
    this._updateHeader();
    this._renderSteps();
    this.show();
  }

  _updateHeader() {
    if (!this.workflow) return;

    const goalEl = this.container.querySelector('#workflow-goal');
    const riskEl = this.container.querySelector('#risk-level');
    
    if (goalEl) goalEl.textContent = this.workflow.goal;
    
    if (riskEl) {
      const riskLevel = this.workflow.risk_assessment?.overall || 'low';
      riskEl.textContent = riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1);
      riskEl.className = `meta-value risk-${riskLevel}`;
    }
  }

  _renderSteps() {
    if (!this.workflow) return;

    const container = this.container.querySelector('#steps-container');
    container.innerHTML = '';

    this.workflow.steps.forEach((step, index) => {
      const stepEl = this._createStepElement(step, index);
      container.appendChild(stepEl);
    });
  }

  _createStepElement(step, index) {
    const el = document.createElement('div');
    el.className = `workflow-step step-type-${step.type}`;
    el.id = `step-${step.id}`;
    el.innerHTML = `
      <div class="step-header">
        <span class="step-number">${index + 1}</span>
        <span class="step-type-badge">${this._formatStepType(step.type)}</span>
        <span class="step-status" data-status="pending">⏳</span>
      </div>
      <div class="step-content">
        ${this._getStepContent(step)}
      </div>
      <div class="step-timing hidden">
        <span class="timing-text">0ms</span>
      </div>
    `;
    return el;
  }

  _getStepContent(step) {
    const content = step.content || {};
    const params = step.params || content.params || content || {};

    switch (step.type) {
      case 'action': {
        const actionType = step.action_type || step.actionType || content.action_type || content.action || 'unknown';
        const selector = params.selector || content.selector;
        return `
          <div class="action-info">
            <strong>Action:</strong> ${this._escapeHtml(actionType)}
            ${selector ? `<br><small>Selector: ${this._escapeHtml(selector)}</small>` : ''}
          </div>
        `;
      }
      case 'decision':
        return `
          <div class="decision-info">
            <strong>Condition:</strong> ${this._escapeHtml(step.condition || params.check || 'evaluate')}
          </div>
        `;
      case 'clarification':
        return `
          <div class="clarification-info">
            <strong>Question:</strong> ${this._escapeHtml(params.question || content.question || '')}
          </div>
        `;
      case 'synthesize':
        return `
          <div class="synthesize-info">
            <strong>Synthesize:</strong> ${this._escapeHtml(params.description || content.description || 'compile results')}
          </div>
        `;
      default:
        return `<div>${this._escapeHtml(JSON.stringify(content || step))}</div>`;
    }
  }

  _escapeHtml(value) {
    return `${value ?? ''}`
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  _getStepElement(stepId) {
    if (!this.container || !stepId) return null;
    const rawId = `step-${stepId}`;
    const escapedId = window.CSS?.escape
      ? CSS.escape(rawId)
      : rawId.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    return this.container.querySelector(`#${escapedId}`);
  }

  _formatStepType(type) {
    const labels = {
      action: 'Action',
      decision: 'Decision',
      clarification: 'Ask',
      synthesize: 'Compile',
    };
    return labels[type] || type;
  }

  onStepStarted(stepId) {
    const stepEl = this._getStepElement(stepId);
    if (stepEl) {
      stepEl.classList.add('executing');
      stepEl.querySelector('[data-status]').dataset.status = 'executing';
      stepEl.querySelector('[data-status]').textContent = '▶';
    }
    this._updateProgress();
  }

  onStepCompleted(stepId, success, timing) {
    const stepEl = this._getStepElement(stepId);
    if (stepEl) {
      stepEl.classList.remove('executing');
      stepEl.classList.add(success ? 'completed' : 'failed');
      stepEl.querySelector('[data-status]').dataset.status = success ? 'completed' : 'failed';
      stepEl.querySelector('[data-status]').textContent = success ? '✓' : '✗';
      
      if (timing) {
        const timingEl = stepEl.querySelector('.step-timing');
        timingEl.classList.remove('hidden');
        timingEl.querySelector('.timing-text').textContent = `${timing}ms`;
      }
    }
    this._updateProgress();
  }

  onWorkflowStarted() {
    const statusEl = this.container.querySelector('#workflow-status');
    if (statusEl) {
      statusEl.textContent = 'Running';
      statusEl.className = 'status-badge running';
    }
    this._startTimer();
  }

  onWorkflowCompleted(success) {
    this._stopTimer();
    const statusEl = this.container.querySelector('#workflow-status');
    if (statusEl) {
      statusEl.textContent = success ? 'Completed' : 'Failed';
      statusEl.className = `status-badge ${success ? 'completed' : 'failed'}`;
    }
  }

  onWorkflowError(error) {
    const errorEl = this.container.querySelector('#workflow-error');
    if (errorEl) {
      errorEl.textContent = error;
      errorEl.classList.remove('hidden');
    }
    const statusEl = this.container.querySelector('#workflow-status');
    if (statusEl) {
      statusEl.textContent = 'Error';
      statusEl.className = 'status-badge error';
    }
  }

  _updateProgress() {
    const progressEl = this.container.querySelector('#progress-text');
    if (progressEl && this.workflow) {
      const total = this.workflow.steps.length;
      const completed = this.container.querySelectorAll('.workflow-step.completed').length;
      progressEl.textContent = `${completed}/${total}`;
    }
  }

  _startTimer() {
    if (this._timerInterval) clearInterval(this._timerInterval);
    
    let seconds = 0;
    this._timerInterval = setInterval(() => {
      seconds++;
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      const timeEl = this.container.querySelector('#elapsed-time');
      if (timeEl) {
        timeEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      }
    }, 1000);
  }

  _stopTimer() {
    if (this._timerInterval) clearInterval(this._timerInterval);
  }

  async _onPause() {
    if (!this.workflow) return;
    const pauseBtn = this.container.querySelector('#pause-workflow');
    const isPaused = pauseBtn.classList.contains('resumed');
    
    try {
      if (isPaused) {
        await window.browserApi.resumeWorkflow(this.workflow.id);
        pauseBtn.textContent = 'Pause';
        pauseBtn.classList.remove('resumed');
      } else {
        await window.browserApi.pauseWorkflow(this.workflow.id);
        pauseBtn.textContent = 'Resume';
        pauseBtn.classList.add('resumed');
      }
    } catch (error) {
      console.error('Failed to pause/resume workflow:', error);
      this.onWorkflowError(`Pause/resume failed: ${error.message}`);
    }
  }

  async _onCancel() {
    if (!this.workflow) return;
    
    try {
      await window.browserApi.cancelWorkflow(this.workflow.id);
      this.onWorkflowCompleted(false);
    } catch (error) {
      console.error('Failed to cancel workflow:', error);
      this.onWorkflowError(`Cancel failed: ${error.message}`);
    }
  }
}

// Export for use in browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WorkflowProgressSidebar;
}
