/**
 * Permission Manager
 * Manages action permissions and enforces permission scopes
 * Implements deny-by-default security model
 */

class PermissionManager {
  constructor(database) {
    this.database = database;
    this.sessionPermissions = new Map();
    this.permissionScopes = {
      // Existing read-only scopes
      current_page: {
        category: "read",
        label: "Current page",
        description: "Allow access to visible page text",
        risk: "low",
        default: false
      },
      selected_text: {
        category: "read",
        label: "Selected text",
        description: "Allow access to selected text",
        risk: "low",
        default: false
      },
      open_tabs: {
        category: "read",
        label: "Open tabs",
        description: "Allow access to tab list",
        risk: "low",
        default: false
      },
      browsing_history: {
        category: "read",
        label: "Browsing history",
        description: "Allow access to browsing history",
        risk: "medium",
        default: false
      },
      bookmarks: {
        category: "read",
        label: "Bookmarks",
        description: "Allow access to bookmarks",
        risk: "low",
        default: false
      },
      downloads: {
        category: "read",
        label: "Downloads",
        description: "Allow access to download metadata",
        risk: "medium",
        default: false
      },
      // New action scopes
      navigate_pages: {
        category: "action",
        label: "Navigate to different pages",
        description: "Allow Nexa to click links and navigate",
        risk: "high",
        default: false,
        requires: []
      },
      click_elements: {
        category: "action",
        label: "Click buttons and links",
        description: "Allow Nexa to click interactive elements",
        risk: "high",
        default: false,
        requires: []
      },
      fill_forms: {
        category: "action",
        label: "Fill form fields",
        description: "Allow Nexa to type into forms",
        risk: "high",
        default: false,
        requires: []
      },
      submit_forms: {
        category: "action",
        label: "Submit forms",
        description: "Allow Nexa to submit search, purchase, or email",
        risk: "critical",
        default: false,
        requires: ["fill_forms", "click_elements"]
      },
      read_form_fields: {
        category: "action",
        label: "Read form values",
        description: "Allow Nexa to see what you've typed",
        risk: "medium",
        default: false,
        requires: []
      },
      manage_tabs: {
        category: "action",
        label: "Open/close tabs",
        description: "Allow Nexa to open and close tabs",
        risk: "medium",
        default: false,
        requires: []
      },
      download_files: {
        category: "action",
        label: "Download files",
        description: "Allow Nexa to trigger downloads",
        risk: "high",
        default: false,
        requires: []
      }
    };

    this.loadPermissionsFromDatabase();
  }

  /**
   * Load persisted permissions from database
   */
  loadPermissionsFromDatabase() {
    try {
      // This would query database for saved permissions
      // For now, use session-only
    } catch (error) {
      console.error("Failed to load permissions from database:", error);
    }
  }

  /**
   * Check if a permission is granted
   * @param {string} scope - Permission scope to check
   * @param {Object} options - Check options
   * @returns {boolean} True if permission is granted
   */
  checkPermission(scope, options = {}) {
    const { site, level = "current_session" } = options;

    // Check session permissions
    const key = site ? `${scope}:${site}` : scope;

    if (this.sessionPermissions.has(key)) {
      const perm = this.sessionPermissions.get(key);
      if (perm.allowed) {
        return true;
      }
    }

    // Check persistent permissions in database
    // (For now, default to deny)

    return false;
  }

  /**
   * Request permission from user
   * Returns promise that resolves to boolean
   */
  async requestPermission(scope, options = {}) {
    const { site, reason, workflow_id } = options;

    if (!this.permissionScopes[scope]) {
      throw new Error(`Unknown permission scope: ${scope}`);
    }

    // Emit to renderer via IPC
    // Renderer will show permission dialog
    // This is a placeholder - actual implementation depends on IPC integration

    return new Promise((resolve) => {
      const key = site ? `${scope}:${site}` : scope;

      // Store pending request
      this.sessionPermissions.set(`pending_${key}`, {
        scope,
        site,
        reason,
        workflow_id,
        requested_at: Date.now()
      });

      // This will be resolved by IPC handler when user responds
      resolve(false); // Default to deny for now
    });
  }

  /**
   * Grant permission (called by user via IPC)
   */
  grantPermission(scope, options = {}) {
    const { site, scope_type = "session" } = options;
    const key = site ? `${scope}:${site}` : scope;

    this.sessionPermissions.set(key, {
      allowed: true,
      scope,
      site,
      scope_type,
      granted_at: Date.now(),
      expires_at:
        scope_type === "session" ? Date.now() + 3600000 : undefined // 1 hour for session
    });

    // Optionally persist to database
    if (scope_type === "permanent" || scope_type === "site") {
      this._persistPermission(scope, true, scope_type, site);
    }

    return true;
  }

  /**
   * Deny permission (called by user via IPC)
   */
  denyPermission(scope, options = {}) {
    const { site } = options;
    const key = site ? `${scope}:${site}` : scope;

    this.sessionPermissions.set(key, {
      allowed: false,
      scope,
      site,
      denied_at: Date.now()
    });

    return true;
  }

  /**
   * Revoke permission
   */
  revokePermission(scope, options = {}) {
    const { site } = options;
    const key = site ? `${scope}:${site}` : scope;

    this.sessionPermissions.delete(key);
    this._removePersistentPermission(scope, site);

    return true;
  }

  /**
   * Get all permissions for a scope
   */
  getPermission(scope) {
    return this.permissionScopes[scope] || null;
  }

  /**
   * Get all permissions
   */
  getAllPermissions() {
    return this.permissionScopes;
  }

  /**
   * Get current permission state (for UI)
   */
  getCurrentPermissionState() {
    const state = {
      granted: [],
      denied: [],
      pending: []
    };

    for (const [key, perm] of this.sessionPermissions.entries()) {
      if (key.startsWith("pending_")) {
        state.pending.push(perm);
      } else if (perm.allowed) {
        state.granted.push({
          scope: perm.scope,
          site: perm.site,
          grantedAt: perm.granted_at,
          expiresAt: perm.expires_at
        });
      } else {
        state.denied.push({
          scope: perm.scope,
          site: perm.site,
          deniedAt: perm.denied_at
        });
      }
    }

    return state;
  }

  /**
   * Check if action requires permission
   */
  getRequiredPermissions(actionType) {
    const permissionMap = {
      click: "click_elements",
      fill: "fill_forms",
      submit: "submit_forms",
      navigate: "navigate_pages",
      read: "current_page",
      download: "download_files",
      manage_tabs: "manage_tabs"
    };

    const perm = permissionMap[actionType];
    if (!perm) return [];

    // Include dependencies
    const deps = this.permissionScopes[perm]?.requires || [];
    return [perm, ...deps];
  }

  /**
   * Analyze permissions required for a workflow
   */
  analyzeWorkflowPermissions(workflow) {
    const required = new Set();
    const risks = [];

    workflow.steps.forEach((step, index) => {
      const perms = this.getRequiredPermissions(step.action_type);
      perms.forEach(p => required.add(p));

      // Identify risky actions
      const perm = this.permissionScopes[perms[0]];
      if (perm && perm.risk === "critical") {
        risks.push({
          step: index,
          action: step.action_type,
          risk: "critical",
          message: `This step will ${perm.description}`
        });
      }
    });

    return {
      required: Array.from(required),
      risks,
      hasRisks: risks.length > 0
    };
  }

  /**
   * Check if all required permissions are granted for a workflow
   */
  checkWorkflowPermissions(workflow) {
    const analysis = this.analyzeWorkflowPermissions(workflow);

    for (const scope of analysis.required) {
      if (!this.checkPermission(scope)) {
        return {
          allowed: false,
          missing: [scope],
          message: `Permission required: ${this.permissionScopes[scope].label}`
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Clear session permissions
   */
  clearSessionPermissions() {
    this.sessionPermissions.clear();
  }

  /**
   * Cleanup expired permissions
   */
  cleanupExpiredPermissions() {
    const now = Date.now();

    for (const [key, perm] of this.sessionPermissions.entries()) {
      if (perm.expires_at && perm.expires_at < now) {
        this.sessionPermissions.delete(key);
      }
    }
  }

  /**
   * Persist permission to database
   */
  _persistPermission(scope, allowed, scope_type, site) {
    // TODO: Implement database persistence
  }

  /**
   * Remove persistent permission
   */
  _removePersistentPermission(scope, site) {
    // TODO: Implement database cleanup
  }
}

module.exports = { PermissionManager };
