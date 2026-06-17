const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("browserApi", {
  newTab: (url) => ipcRenderer.invoke("browser:new-tab", url),
  switchTab: (tabId) => ipcRenderer.invoke("browser:switch-tab", tabId),
  closeTab: (tabId) => ipcRenderer.invoke("browser:close-tab", tabId),
  navigate: (url) => ipcRenderer.invoke("browser:navigate", url),
  reload: () => ipcRenderer.invoke("browser:reload"),
  back: () => ipcRenderer.invoke("browser:back"),
  forward: () => ipcRenderer.invoke("browser:forward"),
  toggleBookmark: () => ipcRenderer.invoke("browser:toggle-bookmark"),
  removeBookmark: (url) => ipcRenderer.invoke("browser:remove-bookmark", url),
  addSpeedDial: (payload) => ipcRenderer.invoke("browser:add-speed-dial", payload),
  removeSpeedDial: (url) => ipcRenderer.invoke("browser:remove-speed-dial", url),
  saveSettings: (settings) => ipcRenderer.invoke("browser:save-settings", settings),
  clearHistory: () => ipcRenderer.invoke("browser:clear-history"),
  clearDownloads: () => ipcRenderer.invoke("browser:clear-downloads"),
  openDownload: (downloadId) => ipcRenderer.invoke("browser:open-download", downloadId),
  openExternal: (url) => ipcRenderer.invoke("browser:open-url", url),
  getState: () => ipcRenderer.invoke("browser:get-state"),
  createProfile: (name) => ipcRenderer.invoke("browser:create-profile", name),
  switchProfile: (profileId) => ipcRenderer.invoke("browser:switch-profile", profileId),
  toggleAiOverlay: () => ipcRenderer.invoke("browser:toggle-ai-overlay"),
  closeAiOverlay: () => ipcRenderer.invoke("browser:close-ai-overlay"),
  restoreCrashSession: () => ipcRenderer.invoke("browser:restore-crash-session"),
  dismissCrashRecovery: () => ipcRenderer.invoke("browser:dismiss-crash-recovery"),
  getAiContract: () => ipcRenderer.invoke("ai:get-contract"),
  setAiPermission: (scope, allowed) => ipcRenderer.invoke("ai:set-permission", scope, allowed),
  runAiAction: (actionId, payload) => ipcRenderer.invoke("ai:run-action", actionId, payload),
  askPageStream: (payload) => ipcRenderer.invoke("ai:ask-page-stream", payload),
  cancelAiStream: (requestId) => ipcRenderer.invoke("ai:cancel-stream", requestId),
  wakeDetectAudio: (payload) => ipcRenderer.invoke("ai:wake-detect-audio", payload),
  transcribeAudio: (payload) => ipcRenderer.invoke("ai:transcribe-audio", payload),
  synthesizeSpeech: (payload) => ipcRenderer.invoke("ai:synthesize-speech", payload),
  setToolbarHeight: (height) => ipcRenderer.send("browser:set-toolbar-height", height),
  onState: (listener) => {
    ipcRenderer.on("browser:state", (_event, state) => listener(state));
  },
  onAiStreamEvent: (listener) => {
    ipcRenderer.on("ai:stream-event", (_event, payload) => listener(payload));
  },
  // Workflow and action execution APIs
  executeAction: (action, workflowId, screenshot) =>
    ipcRenderer.invoke("browser:execute-action", { action, workflowId, screenshot }),
  startWorkflow: (goal, steps, permissions, options) =>
    ipcRenderer.invoke("browser:start-workflow", { goal, steps, permissions, options }),
  getWorkflowStatus: (workflowId) => ipcRenderer.invoke("browser:get-workflow-status", workflowId),
  pauseWorkflow: (workflowId) => ipcRenderer.invoke("browser:pause-workflow", workflowId),
  resumeWorkflow: (workflowId) => ipcRenderer.invoke("browser:resume-workflow", workflowId),
  cancelWorkflow: (workflowId) => ipcRenderer.invoke("browser:cancel-workflow", workflowId),
  provideClarification: (workflowId, response) =>
    ipcRenderer.invoke("workflow:provide-clarification", workflowId, response),
  provideErrorResponse: (workflowId, response) =>
    ipcRenderer.invoke("workflow:provide-error-response", workflowId, response),
  getActionPermissions: () => ipcRenderer.invoke("browser:get-action-permissions"),
  setActionPermission: (scope, allowed, scopeType) =>
    ipcRenderer.invoke("browser:set-action-permission", scope, allowed, scopeType),
  getPermissionDefinitions: () => ipcRenderer.invoke("browser:get-permission-definitions"),
  onWorkflowStarted: (listener) => {
    ipcRenderer.on("workflow:started", (_event, data) => listener(data));
  },
  onWorkflowStepStarted: (listener) => {
    ipcRenderer.on("workflow:step-started", (_event, data) => listener(data));
  },
  onWorkflowStepCompleted: (listener) => {
    ipcRenderer.on("workflow:step-completed", (_event, data) => listener(data));
  },
  onWorkflowProgress: (listener) => {
    ipcRenderer.on("workflow:progress", (_event, data) => listener(data));
  },
  onWorkflowCompleted: (listener) => {
    ipcRenderer.on("workflow:completed", (_event, data) => listener(data));
  },
  onWorkflowFailed: (listener) => {
    ipcRenderer.on("workflow:failed", (_event, data) => listener(data));
  },
  onWorkflowClarificationRequired: (listener) => {
    ipcRenderer.on("workflow:clarification-required", (_event, data) => listener(data));
  },
  onWorkflowPermissionRequired: (listener) => {
    ipcRenderer.on("workflow:permission-required", (_event, data) => listener(data));
  },
  onWorkflowUserActionRequired: (listener) => {
    ipcRenderer.on("workflow:user-action-required", (_event, data) => listener(data));
  },
  // ---- Nexa Brain ----
  askGoal: (goal, context) => ipcRenderer.invoke("brain:ask-goal", { goal, context }),
  provideClarification: (runId, answers) => ipcRenderer.invoke("brain:provide-clarification", { runId, answers }),
  providePermissionDecision: (runId, granted) => ipcRenderer.invoke("brain:provide-permission-decision", { runId, granted }),
  cancelRun: (runId) => ipcRenderer.invoke("brain:cancel-run", { runId }),
  listBrainRuns: () => ipcRenderer.invoke("brain:list-runs"),
  getBrainRun: (runId) => ipcRenderer.invoke("brain:get-run", { runId }),
  onBrainEvent: (listener) => {
    ipcRenderer.on("brain:event", (_event, payload) => listener(payload));
  }
});
