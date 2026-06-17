/**
 * PermissionDialog Component
 * Displays permission requests and allows user to grant/deny
 */

class PermissionDialog {
  constructor() {
    this.container = null;
    this.isOpen = false;
  }

  init(parentSelector = 'body') {
    const parent = document.querySelector(parentSelector);
    if (!parent) return;

    this.container = document.createElement('div');
    this.container.id = 'permission-dialog-container';
    this.container.className = 'permission-dialog-container hidden';
    this.container.innerHTML = this._getTemplate();
    parent.appendChild(this.container);

    this._attachEventListeners();
  }

  _getTemplate() {
    return `
      <div class="permission-dialog-overlay"></div>
      <div class="permission-dialog">
        <div class="dialog-header">
          <h2>🔐 Permission Request</h2>
          <button class="dialog-close" aria-label="Close">&times;</button>
        </div>

        <div class="dialog-content">
          <div class="workflow-info">
            <div class="info-block">
              <strong>Workflow Goal:</strong>
              <p id="workflow-goal-text"></p>
            </div>
            <div class="info-block">
              <strong>Description:</strong>
              <p id="workflow-description-text"></p>
            </div>
          </div>

          <div class="permissions-section">
            <h3>Required Permissions:</h3>
            <div id="permissions-list" class="permissions-list">
              <!-- Permissions will be inserted here -->
            </div>
          </div>

          <div class="risk-assessment">
            <h3>Risk Assessment:</h3>
            <div id="risk-display" class="risk-display">
              <!-- Risk details will be inserted here -->
            </div>
          </div>

          <div class="permission-lifetime">
            <h3>Permission Lifetime:</h3>
            <div class="lifetime-options">
              <label class="radio-option">
                <input type="radio" name="lifetime" value="session" checked>
                <span>This Session Only</span>
              </label>
              <label class="radio-option">
                <input type="radio" name="lifetime" value="site">
                <span>This Site Only</span>
              </label>
              <label class="radio-option">
                <input type="radio" name="lifetime" value="permanent">
                <span>Always Allow</span>
              </label>
            </div>
          </div>
        </div>

        <div class="dialog-actions">
          <button id="deny-btn" class="btn btn-deny">Deny</button>
          <button id="approve-btn" class="btn btn-approve">Approve</button>
        </div>
      </div>
    `;
  }

  _attachEventListeners() {
    const closeBtn = this.container.querySelector('.dialog-close');
    const denyBtn = this.container.querySelector('#deny-btn');
    const approveBtn = this.container.querySelector('#approve-btn');
    const overlay = this.container.querySelector('.permission-dialog-overlay');

    closeBtn?.addEventListener('click', () => this._onDeny());
    denyBtn?.addEventListener('click', () => this._onDeny());
    approveBtn?.addEventListener('click', () => this._onApprove());
    overlay?.addEventListener('click', () => this._onDeny());
  }

  show(workflowInfo, permissions, riskAssessment, onApprove, onDeny) {
    this._onApproveCallback = onApprove;
    this._onDenyCallback = onDeny;

    this._populatePermissions(workflowInfo, permissions, riskAssessment);
    this.container.classList.remove('hidden');
    this.isOpen = true;
  }

  hide() {
    if (this.container) {
      this.container.classList.add('hidden');
      this.isOpen = false;
    }
  }

  _populatePermissions(workflowInfo, permissions, riskAssessment) {
    // Set workflow info
    const goalEl = this.container.querySelector('#workflow-goal-text');
    const descEl = this.container.querySelector('#workflow-description-text');
    if (goalEl) goalEl.textContent = workflowInfo.goal;
    if (descEl) descEl.textContent = workflowInfo.description || 'No description';

    // Render permissions
    const permList = this.container.querySelector('#permissions-list');
    permList.innerHTML = permissions.map(perm => this._renderPermission(perm)).join('');

    // Render risk assessment
    const riskDisplay = this.container.querySelector('#risk-display');
    riskDisplay.innerHTML = this._renderRiskAssessment(riskAssessment);
  }

  _renderPermission(permission) {
    const permissionLabels = {
      current_page: '📄 Read Current Page',
      selected_text: '✏️ Read Selected Text',
      open_tabs: '📑 Access Open Tabs',
      browsing_history: '📚 Access Browser History',
      bookmarks: '⭐ Access Bookmarks',
      downloads: '⬇️ Access Downloads',
      navigate_pages: '🔗 Navigate to Pages',
      click_elements: '🖱️ Click Elements',
      fill_forms: '✍️ Fill Forms',
      submit_forms: '📤 Submit Forms',
      read_form_fields: '📋 Read Form Data',
      manage_tabs: '🪟 Manage Tabs',
      download_files: '💾 Download Files',
    };

    const label = permissionLabels[permission] || permission;
    const risk = this._getPermissionRisk(permission);

    return `
      <div class="permission-item risk-${risk}">
        <div class="permission-checkbox">
          <input type="checkbox" id="perm-${permission}" checked disabled>
        </div>
        <label for="perm-${permission}" class="permission-label">
          <span class="permission-name">${label}</span>
          <span class="permission-risk">${risk}</span>
        </label>
      </div>
    `;
  }

  _getPermissionRisk(permission) {
    const highRisk = ['submit_forms', 'manage_tabs', 'download_files'];
    const mediumRisk = ['click_elements', 'fill_forms', 'navigate_pages'];
    
    if (highRisk.includes(permission)) return 'high';
    if (mediumRisk.includes(permission)) return 'medium';
    return 'low';
  }

  _renderRiskAssessment(assessment) {
    const riskColor = {
      low: '🟢',
      medium: '🟡',
      high: '🔴',
      critical: '⚫',
    };

    const riskLevel = assessment.overall || 'low';
    const icon = riskColor[riskLevel] || '⚪';

    return `
      <div class="risk-level ${riskLevel}">
        <span class="risk-icon">${icon}</span>
        <span class="risk-text">
          <strong>${riskLevel.toUpperCase()}</strong> - ${assessment.description}
        </span>
      </div>
      <div class="risk-details">
        <ul>
          ${assessment.critical_actions > 0 ? `<li>${assessment.critical_actions} critical action(s)</li>` : ''}
          ${assessment.high_risk_actions > 0 ? `<li>${assessment.high_risk_actions} high-risk action(s)</li>` : ''}
          ${assessment.medium_risk_actions > 0 ? `<li>${assessment.medium_risk_actions} medium-risk action(s)</li>` : ''}
        </ul>
      </div>
    `;
  }

  _onApprove() {
    const lifetimeEl = this.container.querySelector('input[name="lifetime"]:checked');
    const lifetime = lifetimeEl?.value || 'session';
    
    if (this._onApproveCallback) {
      this._onApproveCallback(lifetime);
    }
    this.hide();
  }

  _onDeny() {
    if (this._onDenyCallback) {
      this._onDenyCallback();
    }
    this.hide();
  }
}

// Export for use in browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PermissionDialog;
}
