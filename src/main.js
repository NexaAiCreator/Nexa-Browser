const path = require("path");
const http = require("http");
const https = require("https");
const { app, BrowserWindow, BrowserView, ipcMain, nativeImage, shell, session } = require("electron");
const { BrowserDatabase, DEFAULT_AI_PERMISSIONS } = require("./storage/database");
const { ProfileRegistry } = require("./storage/profiles");
const { ActionExecutor } = require("./core/action-executor");
const { PermissionManager } = require("./core/permission-manager");
const { WorkflowOrchestrator } = require("./core/workflow-orchestrator");
const { NexaBrain } = require("./core/nexa-brain");

const START_URL = "nexa://start";
const WINDOW_MIN_WIDTH = 1180;
const WINDOW_MIN_HEIGHT = 760;
const DEFAULT_TOOLBAR_HEIGHT = 104;
const AI_SERVICE_BASE_URL = (process.env.NEXA_AI_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const AI_SERVICE_TIMEOUT_MS = Number(process.env.NEXA_AI_TIMEOUT_MS || 180000);
const AI_STT_TIMEOUT_MS = Number(process.env.NEXA_AI_STT_TIMEOUT_MS || 180000);
const AI_TTS_TIMEOUT_MS = Number(process.env.NEXA_AI_TTS_TIMEOUT_MS || 45000);
const AI_CONTRACT = {
  version: "1.0",
  provider: "local-api",
  model: "browser-service",
  permissions: [
    {
      scope: "current_page",
      label: "Current page",
      description: "Allow Nexa AI to read the visible page text from the active tab."
    },
    {
      scope: "selected_text",
      label: "Selected text",
      description: "Allow Nexa AI to read the current text selection only."
    },
    {
      scope: "open_tabs",
      label: "Open tabs",
      description: "Allow Nexa AI to inspect open tab titles and URLs."
    },
    {
      scope: "browsing_history",
      label: "Browsing history",
      description: "Allow Nexa AI to search saved browser history."
    },
    {
      scope: "bookmarks",
      label: "Bookmarks",
      description: "Allow Nexa AI to search saved bookmarks."
    },
    {
      scope: "downloads",
      label: "Downloads",
      description: "Allow Nexa AI to inspect saved download metadata."
    }
  ],
  actions: [
    {
      id: "summarize_page",
      label: "Summarize page",
      requiredScopes: ["current_page"],
      description: "Summarize the active page using the current document text."
    },
    {
      id: "summarize_selection",
      label: "Summarize selection",
      requiredScopes: ["selected_text"],
      description: "Summarize the user's current text selection."
    },
    {
      id: "list_open_tabs",
      label: "List open tabs",
      requiredScopes: ["open_tabs"],
      description: "Return the titles and URLs of open tabs."
    },
    {
      id: "search_memory",
      label: "Search browser memory",
      requiredScopes: ["bookmarks", "browsing_history"],
      description: "Search bookmarks and history for matching items."
    }
  ]
};

let mainWindow = null;
let activeTabId = null;
let nextTabId = 1;
let toolbarHeight = DEFAULT_TOOLBAR_HEIGHT;
let database = null;
let restoringSession = false;
let profileRegistry = null;
let activeProfile = null;
let pendingCrashRecovery = null;
let isQuitting = false;
let aiPanelWindow = null;

// Workflow and action execution components
let actionExecutor = null;
let permissionManager = null;
let workflowOrchestrator = null;
let nexaBrain = null;

const AI_PANEL_MIN_WIDTH = 320;
const AI_PANEL_MAX_WIDTH = 420;

const tabs = new Map();
const aiStreamControllers = new Map();

// BrowserViewManager for action executor
const browserViewManager = {
  getActiveView: () => {
    const tab = tabs.get(activeTabId);
    return tab?.kind === "web" && tab?.view ? tab.view : null;
  },
  getAllViews: () => Array.from(tabs.values()).filter(t => t.kind === "web").map(t => t.view).filter(Boolean)
};

function getBrowserState() {
  return database.getBrowserState();
}

function getSettings() {
  return getBrowserState().settings;
}

function normalizeUrl(input) {
  const trimmed = `${input || ""}`.trim();
  const settings = getSettings();

  if (!trimmed) {
    return settings.homepage || START_URL;
  }

  if (trimmed === START_URL) {
    return START_URL;
  }

  if (/^[a-zA-Z]+:\/\//.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("localhost") || trimmed.startsWith("127.0.0.1")) {
    return `http://${trimmed}`;
  }

  if (trimmed.includes(" ") || !trimmed.includes(".")) {
    return settings.searchEngine.replace("%s", encodeURIComponent(trimmed));
  }

  return `https://${trimmed}`;
}

function createBrowserViewForTab(tab) {
  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  });

  view.setAutoResize({
    width: true,
    height: true
  });

  tab.view = view;
  hookWebTabEvents(tab);
}

function createWebTab(initialUrl) {
  const tab = {
    id: nextTabId++,
    kind: "web",
    url: "",
    displayUrl: "",
    title: "New Tab",
    loading: false,
    canGoBack: false,
    canGoForward: false,
    favicon: ""
  };

  tabs.set(tab.id, tab);
  loadTabUrl(tab, initialUrl);
  return tab;
}

function createStartTab() {
  const tab = {
    id: nextTabId++,
    kind: "start",
    url: START_URL,
    displayUrl: "",
    title: "Speed Dial",
    loading: false,
    canGoBack: false,
    canGoForward: false,
    favicon: ""
  };

  tabs.set(tab.id, tab);
  return tab;
}

function ensureAtLeastOneTab() {
  if (tabs.size > 0) {
    return;
  }

  const firstTab = createStartTab();
  setActiveTab(firstTab.id);
}

function getWindowBounds() {
  if (!mainWindow) {
    return null;
  }

  const bounds = mainWindow.getContentBounds();
  const panelOffset = aiPanelWindow && !aiPanelWindow.isDestroyed()
    ? getAiPanelWidth()
    : 0;
  return {
    x: panelOffset,
    y: toolbarHeight,
    width: Math.max(bounds.width - panelOffset, 0),
    height: Math.max(bounds.height - toolbarHeight, 0)
  };
}

function updateNavState(tab) {
  if (tab.kind !== "web" || !tab.view) {
    tab.canGoBack = false;
    tab.canGoForward = false;
    return;
  }

  tab.canGoBack = tab.view.webContents.navigationHistory.canGoBack();
  tab.canGoForward = tab.view.webContents.navigationHistory.canGoForward();
}

function serializeTab(tab) {
  return {
    id: tab.id,
    kind: tab.kind,
    title: tab.title,
    url: tab.url,
    displayUrl: tab.displayUrl,
    canGoBack: tab.canGoBack,
    canGoForward: tab.canGoForward,
    loading: tab.loading,
    favicon: tab.favicon
  };
}

function buildRendererState() {
  const store = getBrowserState();
  const activeTab = tabs.get(activeTabId) || null;
  const downloadsInProgress = store.downloads.filter((item) => item.state === "progressing").length;

  return {
    tabs: Array.from(tabs.values()).map(serializeTab),
    activeTabId,
    activeTab: activeTab ? serializeTab(activeTab) : null,
    activeIsBookmarked: activeTab ? Boolean(database.findBookmark(activeTab.url)) : false,
    browserData: {
      bookmarks: store.bookmarks,
      history: store.history,
      downloads: store.downloads,
      settings: store.settings,
      speedDials: store.speedDials,
      stats: {
        bookmarks: store.bookmarks.length,
        history: store.history.length,
        downloadsInProgress
      }
    },
    ai: {
      contract: AI_CONTRACT,
      permissions: store.aiPermissions,
      activity: store.aiActivity
    },
    profiles: {
      activeProfile,
      items: profileRegistry ? profileRegistry.listProfiles() : []
    },
    recovery: {
      hasCrashedSession: Boolean(pendingCrashRecovery?.entries?.length),
      tabCount: pendingCrashRecovery?.entries?.length || 0,
      savedAt: pendingCrashRecovery?.savedAt || null
    }
  };
}

function sendState() {
  const state = buildRendererState();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("browser:state", state);
  }

  if (aiPanelWindow && !aiPanelWindow.isDestroyed()) {
    aiPanelWindow.webContents.send("browser:state", state);
  }
}

function sendAiStreamEvent(payload) {
  if (aiPanelWindow && !aiPanelWindow.isDestroyed()) {
    aiPanelWindow.webContents.send("ai:stream-event", payload);
  }
}

function createAiRequestId() {
  return `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function persistSession() {
  if (!database || restoringSession) {
    return;
  }

  const entries = Array.from(tabs.values()).map((tab) => ({
    kind: tab.kind,
    url: tab.kind === "start" ? START_URL : tab.url,
    title: tab.title,
    isActive: tab.id === activeTabId
  }));

  database.saveSession(entries);
}

function destroyAllTabs() {
  for (const tab of tabs.values()) {
    if (tab.view) {
      if (mainWindow && mainWindow.getBrowserView() === tab.view) {
        mainWindow.setBrowserView(null);
      }
      tab.view.webContents.close({ waitForBeforeUnload: false });
    }
  }
  tabs.clear();
  activeTabId = null;
  nextTabId = 1;
}

function syncBounds() {
  if (!mainWindow) {
    return;
  }

  const activeTab = tabs.get(activeTabId);
  const bounds = getWindowBounds();

  if (!activeTab || !bounds) {
    return;
  }

  if (activeTab.kind === "web" && activeTab.view) {
    if (mainWindow.getBrowserView() !== activeTab.view) {
      mainWindow.setBrowserView(activeTab.view);
    }
    activeTab.view.setBounds(bounds);
  } else if (mainWindow.getBrowserView()) {
    mainWindow.setBrowserView(null);
  }
}

function getAiPanelWidth() {
  if (!mainWindow) {
    return AI_PANEL_MIN_WIDTH;
  }

  const contentWidth = mainWindow.getContentBounds().width;
  return Math.max(
    AI_PANEL_MIN_WIDTH,
    Math.min(AI_PANEL_MAX_WIDTH, Math.floor(contentWidth * 0.32))
  );
}

function getAiPanelBounds() {
  if (!mainWindow) {
    return null;
  }

  const contentBounds = mainWindow.getContentBounds();
  const windowBounds = mainWindow.getBounds();
  const panelWidth = getAiPanelWidth();

  return {
    x: windowBounds.x,
    y: windowBounds.y + toolbarHeight,
    width: panelWidth,
    height: Math.max(contentBounds.height - toolbarHeight, 0)
  };
}

function syncAiPanelBounds() {
  if (!aiPanelWindow || aiPanelWindow.isDestroyed()) {
    return;
  }

  const bounds = getAiPanelBounds();
  if (!bounds) {
    return;
  }

  aiPanelWindow.setBounds(bounds);
}

function abortAllAiStreams() {
  for (const controller of aiStreamControllers.values()) {
    controller.abort();
  }
  aiStreamControllers.clear();
}

function recordHistory(tab) {
  if (tab.kind !== "web" || !tab.url || tab.url.startsWith("devtools:")) {
    return;
  }

  database.recordHistory({
    title: tab.title,
    url: tab.url,
    visitedAt: new Date().toISOString()
  });
}

function updateTabFromWebContents(tab) {
  if (tab.kind !== "web" || !tab.view) {
    return;
  }

  const currentUrl = tab.view.webContents.getURL() || tab.url;
  tab.url = currentUrl;
  tab.displayUrl = currentUrl;
  tab.title = tab.view.webContents.getTitle() || deriveTitleFromUrl(currentUrl);
  tab.loading = tab.view.webContents.isLoading();
  updateNavState(tab);
}

function deriveTitleFromUrl(url) {
  if (!url) {
    return "New Tab";
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function hookWebTabEvents(tab) {
  const { webContents } = tab.view;

  webContents.on("page-title-updated", (_event, title) => {
    tab.title = title || tab.title;
    persistSession();
    sendState();
  });
  webContents.on("page-favicon-updated", (_event, favicons) => {
    tab.favicon = Array.isArray(favicons) && favicons[0] ? favicons[0] : "";
    sendState();
  });
  webContents.on("did-start-loading", () => {
    tab.loading = true;
    updateTabFromWebContents(tab);
    sendState();
  });
  webContents.on("did-stop-loading", () => {
    tab.loading = false;
    updateTabFromWebContents(tab);
    recordHistory(tab);
    persistSession();
    sendState();
  });
  webContents.on("did-navigate", () => {
    updateTabFromWebContents(tab);
    recordHistory(tab);
    persistSession();
    sendState();
  });
  webContents.on("did-navigate-in-page", () => {
    updateTabFromWebContents(tab);
    persistSession();
    sendState();
  });
  webContents.on("did-fail-load", () => {
    tab.loading = false;
    updateTabFromWebContents(tab);
    sendState();
  });
  webContents.setWindowOpenHandler(({ url }) => {
    const newTab = createTab(url, true);
    setActiveTab(newTab.id);
    return { action: "deny" };
  });
  webContents.on("will-navigate", (event, targetUrl) => {
    if (targetUrl.startsWith("mailto:")) {
      event.preventDefault();
      shell.openExternal(targetUrl);
    }
  });
}

function attachDownloadHandlers() {
  session.defaultSession.on("will-download", (_event, item) => {
    const record = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      filename: item.getFilename(),
      url: item.getURL(),
      savePath: item.getSavePath(),
      receivedBytes: 0,
      totalBytes: item.getTotalBytes(),
      state: "progressing",
      startedAt: new Date().toISOString()
    };

    database.upsertDownload(record);
    sendState();

    item.on("updated", (_updatedEvent, state) => {
      record.receivedBytes = item.getReceivedBytes();
      record.totalBytes = item.getTotalBytes();
      record.state = state === "interrupted" ? "interrupted" : "progressing";
      database.upsertDownload(record);
      sendState();
    });

    item.once("done", (_doneEvent, state) => {
      record.receivedBytes = item.getReceivedBytes();
      record.totalBytes = item.getTotalBytes();
      record.savePath = item.getSavePath();
      record.state = state;
      record.finishedAt = new Date().toISOString();
      database.upsertDownload(record);
      sendState();
    });
  });
}

function loadTabUrl(tab, nextUrl) {
  const normalized = normalizeUrl(nextUrl);

  if (normalized === START_URL) {
    tab.kind = "start";
    tab.url = START_URL;
    tab.displayUrl = "";
    tab.title = "Speed Dial";
    tab.loading = false;
    tab.canGoBack = false;
    tab.canGoForward = false;
    if (tab.view && mainWindow && mainWindow.getBrowserView() === tab.view) {
      mainWindow.setBrowserView(null);
    }
    persistSession();
    sendState();
    syncBounds();
    return;
  }

  if (!tab.view) {
    createBrowserViewForTab(tab);
  }

  tab.kind = "web";
  tab.url = normalized;
  tab.displayUrl = normalized;
  tab.title = deriveTitleFromUrl(normalized);
  tab.loading = true;
  persistSession();
  sendState();
  tab.view.webContents.loadURL(normalized);
}

function createTab(initialUrl = START_URL, makeActive = true) {
  const normalized = normalizeUrl(initialUrl);
  const tab = normalized === START_URL ? createStartTab() : createWebTab(normalized);

  if (makeActive) {
    setActiveTab(tab.id);
  } else {
    persistSession();
    sendState();
  }

  return tab;
}

function destroyTab(tabId) {
  const tab = tabs.get(tabId);

  if (!tab) {
    return;
  }

  if (tab.kind === "web" && tab.view && mainWindow && mainWindow.getBrowserView() === tab.view) {
    mainWindow.setBrowserView(null);
  }

  if (tab.view) {
    tab.view.webContents.close({ waitForBeforeUnload: false });
  }

  tabs.delete(tabId);

  if (tabs.size === 0) {
    const replacement = createStartTab();
    setActiveTab(replacement.id);
    return;
  }

  if (activeTabId === tabId) {
    const replacementId = Array.from(tabs.keys()).at(-1);
    setActiveTab(replacementId);
    return;
  }

  persistSession();
  sendState();
}

function setActiveTab(tabId) {
  const tab = tabs.get(tabId);

  if (!mainWindow || !tab) {
    return;
  }

  activeTabId = tabId;
  syncBounds();
  persistSession();
  sendState();
}

function withActiveTab(handler) {
  const tab = tabs.get(activeTabId);

  if (!tab) {
    return null;
  }

  return handler(tab);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    backgroundColor: "#dbe4f0",
    title: "Nexa Browser",
    icon: nativeImage.createEmpty(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.on("resize", () => {
    syncBounds();
    syncAiPanelBounds();
  });
  mainWindow.on("move", syncAiPanelBounds);
  mainWindow.on("closed", () => {
    if (aiPanelWindow && !aiPanelWindow.isDestroyed()) {
      aiPanelWindow.close();
    }
    aiPanelWindow = null;
    mainWindow = null;
  });

  restorePreviousSession();
  sendState();
}

function createAiPanelWindow() {
  if (!mainWindow) {
    return null;
  }

  // Clean up any existing panel window first
  if (aiPanelWindow && !aiPanelWindow.isDestroyed()) {
    aiPanelWindow.removeAllListeners();
    aiPanelWindow.close();
    aiPanelWindow = null;
  }

  const bounds = getAiPanelBounds();
  aiPanelWindow = new BrowserWindow({
    ...bounds,
    parent: mainWindow,
    modal: false,
    show: false,
    frame: false,
    transparent: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  aiPanelWindow.loadFile(path.join(__dirname, "renderer", "ai-popup.html"));
  aiPanelWindow.on("closed", () => {
    abortAllAiStreams();
    aiPanelWindow = null;
    syncBounds();
  });
  aiPanelWindow.once("ready-to-show", () => {
    if (aiPanelWindow && !aiPanelWindow.isDestroyed()) {
      aiPanelWindow.show();
      aiPanelWindow.focus();
      syncBounds();
      sendState();
    }
  });
  return aiPanelWindow;
}

function toggleAiOverlay() {
  if (aiPanelWindow && !aiPanelWindow.isDestroyed()) {
    aiPanelWindow.close();
    aiPanelWindow = null;
    return false;
  }

  createAiPanelWindow();
  return true;
}

function closeAiOverlay() {
  if (aiPanelWindow && !aiPanelWindow.isDestroyed()) {
    abortAllAiStreams();
    aiPanelWindow.close();
    aiPanelWindow = null;
    return true;
  }

  return false;
}

function loadDatabaseForProfile(profile) {
  const profileDir = profileRegistry.getProfileDataDir(profile.id);
  database = new BrowserDatabase(path.join(profileDir, "browser-state.db"));
  activeProfile = profile;
  pendingCrashRecovery = database.getCrashRecoverySession();
}

function restorePreviousSession() {
  const settings = getSettings();
  if (pendingCrashRecovery?.entries?.length) {
    ensureAtLeastOneTab();
    return;
  }
  const sessionEntries = settings.restoreLastSession ? database.loadSession() : [];

  if (!sessionEntries.length) {
    ensureAtLeastOneTab();
    return;
  }

  restoringSession = true;
  try {
    let fallbackActiveId = null;
    for (const entry of sessionEntries) {
      const tab = createTab(entry.url || START_URL, false);
      if (entry.title && tab.kind === "start") {
        tab.title = entry.title;
      }
      if (entry.isActive) {
        fallbackActiveId = tab.id;
      }
    }

    if (fallbackActiveId) {
      setActiveTab(fallbackActiveId);
    } else if (tabs.size > 0) {
      setActiveTab(Array.from(tabs.keys())[0]);
    } else {
      ensureAtLeastOneTab();
    }
  } finally {
    restoringSession = false;
    persistSession();
  }
}

function switchProfile(profileId) {
  const nextProfile = profileRegistry.setActiveProfile(profileId);
  destroyAllTabs();
  loadDatabaseForProfile(nextProfile);
  restorePreviousSession();
  sendState();
  return nextProfile;
}

function enforcePermission(scope) {
  const permissions = getBrowserState().aiPermissions;
  if (!permissions[scope]) {
    const message = `Permission denied for scope: ${scope}`;
    database.logAiActivity("permission_check", "denied", message);
    throw new Error(message);
  }
}

async function getActivePageText() {
  const tab = tabs.get(activeTabId);
  if (!tab || tab.kind !== "web" || !tab.view) {
    throw new Error("No active web page available.");
  }

  const payload = await tab.view.webContents.executeJavaScript(
    `(() => ({
      title: document.title || "",
      selection: window.getSelection ? String(window.getSelection()) : "",
      text: (document.body?.innerText || "").replace(/\\s+/g, " ").trim(),
      bodyLength: (document.body?.innerText || "").replace(/\\s+/g, " ").trim().length
    }))()`,
    true
  );
  const normalizedText = `${payload.text || ""}`;

  return {
    title: payload.title || tab.title,
    selection: payload.selection || "",
    text: normalizedText.slice(0, 6000),
    contentTruncated: normalizedText.length > 6000 || Number(payload.bodyLength || 0) > 6000,
    url: tab.url
  };
}

function buildAiClientInfo() {
  return {
    name: "nexa-browser",
    version: app.getVersion(),
    platform: process.platform
  };
}

async function callAiServiceExecute(action, requestBody) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_SERVICE_TIMEOUT_MS);

  try {
    const response = await fetch(`${AI_SERVICE_BASE_URL}/v1/browser/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        version: "1.0",
        action,
        client: buildAiClientInfo(),
        ...requestBody
      }),
      signal: controller.signal
    });

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      if (response.status === 404) {
        return callAiServiceGenerateFallback(action, requestBody);
      }
      const message = json?.error?.message || `AI service request failed with status ${response.status}.`;
      throw new Error(message);
    }

    if (!json?.ok) {
      throw new Error(json?.error?.message || "AI service returned an invalid response.");
    }

    return json.result;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("AI service request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildLegacyBrowserPrompt(action, requestBody = {}) {
  const page = requestBody.context?.page || {};
  const prompt = `${requestBody.user_prompt || ""}`.trim();
  const source = [
    page.title ? `Title: ${page.title}` : "",
    page.url ? `URL: ${page.url}` : "",
    page.selection ? `Selection:\n${page.selection}` : "",
    page.content ? `Page content:\n${page.content}` : ""
  ].filter(Boolean).join("\n\n");

  if (action === "summarize_selection") {
    return `Summarize the selected text clearly and concisely.\n\n${source}`;
  }

  if (action === "summarize_page") {
    return `Summarize this webpage clearly and concisely.\n\n${source}`;
  }

  if (action === "answer_with_page_context") {
    return `Answer the user's question using only the webpage context when possible.\n\nQuestion: ${prompt}\n\n${source}`;
  }

  return `${prompt || `Complete browser action: ${action}`}\n\n${source}`;
}

async function callAiServiceGenerateFallback(action, requestBody = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_SERVICE_TIMEOUT_MS);

  try {
    const response = await fetch(`${AI_SERVICE_BASE_URL}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: buildLegacyBrowserPrompt(action, requestBody),
        max_new_tokens: requestBody.generation?.max_new_tokens || 300,
        temperature: requestBody.generation?.temperature ?? 0.2
      }),
      signal: controller.signal
    });

    const json = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(json?.detail || `Legacy AI service fallback failed with status ${response.status}.`);
    }

    return {
      type: action === "summarize_page" || action === "summarize_selection" ? "summary" : "answer",
      text: `${json?.reply || ""}`.trim()
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("AI service fallback request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function callAiServiceTranscribeAudio({ audioBytes, mimeType, fileName }) {
  try {
    const audioBuffer = Buffer.from(audioBytes || []);
    if (!audioBuffer.length) {
      throw new Error("No recorded audio was captured.");
    }

    const startedAt = Date.now();
    const boundary = `----NexaBoundary${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    const safeMimeType = mimeType || "audio/webm";
    const safeFileName = fileName || "recording.webm";
    const multipartPrefix = Buffer.from(
      `--${boundary}\r\n`
      + `Content-Disposition: form-data; name="audio"; filename="${safeFileName}"\r\n`
      + `Content-Type: ${safeMimeType}\r\n\r\n`,
      "utf8"
    );
    const multipartSuffix = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
    const requestBody = Buffer.concat([multipartPrefix, audioBuffer, multipartSuffix]);

    console.log("[STT] Uploading audio clip", {
      bytes: audioBuffer.length,
      mimeType: safeMimeType,
      fileName: safeFileName,
      requestBytes: requestBody.length
    });
    const { statusCode, bodyText } = await new Promise((resolve, reject) => {
      const url = new URL(`${AI_SERVICE_BASE_URL}/v1/stt/transcribe`);
      const transport = url.protocol === "https:" ? https : http;
      const request = transport.request({
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": String(requestBody.length)
        },
        timeout: AI_STT_TIMEOUT_MS
      }, (response) => {
        const chunks = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode || 500,
            bodyText: Buffer.concat(chunks).toString("utf8")
          });
        });
      });

      request.on("timeout", () => {
        request.destroy(new Error("Speech transcription timed out."));
      });
      request.on("error", reject);
      request.write(requestBody);
      request.end();
    });
    let json = null;
    try {
      json = JSON.parse(bodyText || "null");
    } catch (_error) {
      json = null;
    }
    if (statusCode < 200 || statusCode >= 300) {
      const error = new Error(json?.detail || "Speech transcription failed.");
      error.statusCode = statusCode;
      throw error;
    }
    const text = `${json?.text || ""}`.trim();
    if (!text) {
      throw new Error("Speech transcription returned empty text.");
    }
    console.log("[STT] Transcription completed", {
      durationMs: Date.now() - startedAt,
      textLength: text.length
    });
    return text;
  } catch (error) {
    if (error.message === "Speech transcription timed out.") {
      throw error;
    }
    throw error;
  }
}

async function callAiServiceWakeDetect({ sessionId, audioBytes, sampleRate = 16000, reset = false }) {
  const payload = {
    session_id: sessionId,
    audio_b64: audioBytes ? Buffer.from(audioBytes).toString("base64") : null,
    sample_rate: sampleRate,
    reset
  };

  const requestBody = Buffer.from(JSON.stringify(payload), "utf8");
  const { statusCode, bodyText } = await new Promise((resolve, reject) => {
    const url = new URL(`${AI_SERVICE_BASE_URL}/v1/wake/detect`);
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(requestBody.length)
      },
      timeout: AI_STT_TIMEOUT_MS
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode || 500,
          bodyText: Buffer.concat(chunks).toString("utf8")
        });
      });
    });

    request.on("timeout", () => {
      request.destroy(new Error("Wake detection timed out."));
    });
    request.on("error", reject);
    request.write(requestBody);
    request.end();
  });

  let json = null;
  try {
    json = JSON.parse(bodyText || "null");
  } catch (_error) {
    json = null;
  }

  if (statusCode < 200 || statusCode >= 300) {
    const error = new Error(json?.detail || "Wake detection failed.");
    error.statusCode = statusCode;
    throw error;
  }

  return json;
}

async function callAiServiceSynthesizeSpeech({ text, voice, rate }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TTS_TIMEOUT_MS);

  try {
    const response = await fetch(`${AI_SERVICE_BASE_URL}/v1/tts/speak`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        voice,
        rate,
        voice_id: process.env.NEXA_TTS_VOICE_ID || undefined,
        model_id: process.env.NEXA_TTS_MODEL_ID || undefined
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      let message = "Speech synthesis failed.";

      try {
        const parsed = JSON.parse(bodyText);
        if (parsed?.error) {
          message = parsed.error;
        }
      } catch {
        if (bodyText) {
          message = bodyText;
        }
      }

      throw new Error(message);
    }

    const contentType = response.headers.get("content-type") || "audio/mpeg";
    const audioBuffer = new Uint8Array(await response.arrayBuffer());
    return {
      audioBytes: Array.from(audioBuffer),
      mimeType: contentType
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Speech synthesis timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function streamAiPageAnswer(requestId, userPrompt, page) {
  const controller = new AbortController();
  aiStreamControllers.set(requestId, controller);
  sendAiStreamEvent({ requestId, status: "started" });
  const requestBody = {
    version: "1.0",
    request_id: requestId,
    action: "answer_with_page_context",
    user_prompt: userPrompt,
    context: {
      page: {
        url: page.url,
        title: page.title,
        content: page.text,
        selection: page.selection,
        content_truncated: page.contentTruncated
      },
      open_tabs: [],
      memory: []
    },
    permissions: getBrowserState().aiPermissions,
    client: buildAiClientInfo(),
    generation: {
      temperature: 0.2,
      max_new_tokens: 420
    }
  };

  try {
    const response = await fetch(`${AI_SERVICE_BASE_URL}/v1/browser/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    if (!response.ok) {
      if (response.status === 404) {
        const result = await callAiServiceGenerateFallback("answer_with_page_context", requestBody);
        if (result.text) {
          sendAiStreamEvent({
            requestId,
            status: "delta",
            chunk: result.text
          });
        }
        sendAiStreamEvent({ requestId, status: "done" });
        return;
      }
      const message = await response.text();
      throw new Error(message || `AI service stream failed with status ${response.status}.`);
    }

    if (!response.body) {
      throw new Error("AI service did not provide a response stream.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      if (chunk) {
        sendAiStreamEvent({
          requestId,
          status: "delta",
          chunk
        });
      }
    }

    sendAiStreamEvent({ requestId, status: "done" });
  } catch (error) {
    if (error.name === "AbortError") {
      sendAiStreamEvent({ requestId, status: "cancelled" });
      return;
    }

    sendAiStreamEvent({
      requestId,
      status: "error",
      error: error.message
    });
  } finally {
    aiStreamControllers.delete(requestId);
  }
}

async function runRemoteSummaryAction(actionId, permissionScope, page) {
  enforcePermission(permissionScope);
  const result = await callAiServiceExecute(actionId, {
    context: {
      page: {
        url: page.url,
        title: page.title,
        content: page.text,
        selection: page.selection,
        content_truncated: page.contentTruncated
      },
      open_tabs: [],
      memory: []
    },
    permissions: getBrowserState().aiPermissions,
    generation: {
      temperature: 0.2,
      max_new_tokens: 220
    }
  });

  const summary = result?.text?.trim();
  if (!summary) {
    throw new Error("AI service returned an empty summary.");
  }

  return {
    action: actionId,
    summary,
    source: {
      title: result.title || page.title,
      url: result?.source?.url || page.url
    }
  };
}

async function runAiAction(actionId, payload = {}) {
  switch (actionId) {
    case "summarize_page": {
      const page = await getActivePageText();
      const response = await runRemoteSummaryAction(actionId, "current_page", page);
      database.logAiActivity(actionId, "completed", `Summarized ${page.url}`);
      return response;
    }
    case "summarize_selection": {
      const page = await getActivePageText();
      const response = await runRemoteSummaryAction(actionId, "selected_text", page);
      database.logAiActivity(actionId, "completed", `Summarized selection on ${page.url}`);
      return response;
    }
    case "list_open_tabs": {
      enforcePermission("open_tabs");
      const openTabs = Array.from(tabs.values()).map((tab) => ({
        title: tab.title,
        url: tab.url,
        kind: tab.kind
      }));
      database.logAiActivity(actionId, "completed", `Listed ${openTabs.length} open tabs`);
      return {
        action: actionId,
        items: openTabs
      };
    }
    case "search_memory": {
      const query = `${payload.query || ""}`.trim().toLowerCase();
      const state = getBrowserState();
      const results = [];

      if (state.aiPermissions.bookmarks) {
        results.push(
          ...state.bookmarks.filter((item) =>
            item.title.toLowerCase().includes(query) || item.url.toLowerCase().includes(query)
          ).map((item) => ({ type: "bookmark", ...item }))
        );
      }

      if (state.aiPermissions.browsing_history) {
        results.push(
          ...state.history.filter((item) =>
            item.title.toLowerCase().includes(query) || item.url.toLowerCase().includes(query)
          ).map((item) => ({ type: "history", ...item }))
        );
      }

      if (!state.aiPermissions.bookmarks && !state.aiPermissions.browsing_history) {
        throw new Error("Permission denied for memory search.");
      }

      database.logAiActivity(actionId, "completed", `Memory search returned ${results.length} items`);
      return {
        action: actionId,
        query,
        items: results.slice(0, 12)
      };
    }
    case "answer_with_page_context": {
      enforcePermission("current_page");
      const prompt = `${payload.userPrompt || ""}`.trim();
      if (!prompt) {
        throw new Error("A question is required.");
      }

      const page = await getActivePageText();
      const requestId = payload.requestId || createAiRequestId();
      streamAiPageAnswer(requestId, prompt, page);
      database.logAiActivity(actionId, "completed", `Asked about page ${page.url}`);
      return {
        action: actionId,
        requestId,
        source: {
          title: page.title,
          url: page.url
        }
      };
    }
    default:
      throw new Error(`Unknown AI action: ${actionId}`);
  }
}

function restoreCrashSession() {
  if (!pendingCrashRecovery?.entries?.length) {
    return false;
  }

  const recoveryEntries = pendingCrashRecovery.entries;
  database.dismissCrashRecovery();
  pendingCrashRecovery = null;
  destroyAllTabs();

  restoringSession = true;
  try {
    let fallbackActiveId = null;
    for (const entry of recoveryEntries) {
      const tab = createTab(entry.url || START_URL, false);
      if (entry.title && tab.kind === "start") {
        tab.title = entry.title;
      }
      if (entry.isActive) {
        fallbackActiveId = tab.id;
      }
    }

    if (fallbackActiveId) {
      setActiveTab(fallbackActiveId);
    } else {
      ensureAtLeastOneTab();
      setActiveTab(Array.from(tabs.keys())[0]);
    }
  } finally {
    restoringSession = false;
    persistSession();
    sendState();
  }

  return true;
}

function dismissCrashRecovery() {
  pendingCrashRecovery = null;
  database.dismissCrashRecovery();
  sendState();
}

ipcMain.handle("browser:new-tab", (_, url) => createTab(url || START_URL, true).id);
ipcMain.handle("browser:switch-tab", (_, tabId) => setActiveTab(tabId));
ipcMain.handle("browser:close-tab", (_, tabId) => destroyTab(tabId));
ipcMain.handle("browser:navigate", (_, url) => {
  withActiveTab((tab) => {
    loadTabUrl(tab, url);
  });
});
ipcMain.handle("browser:reload", () => {
  withActiveTab((tab) => {
    if (tab.kind === "web" && tab.view) {
      tab.view.webContents.reload();
    }
  });
});
ipcMain.handle("browser:back", () => {
  withActiveTab((tab) => {
    if (tab.kind === "web" && tab.view && tab.view.webContents.navigationHistory.canGoBack()) {
      tab.view.webContents.navigationHistory.goBack();
    }
  });
});
ipcMain.handle("browser:forward", () => {
  withActiveTab((tab) => {
    if (tab.kind === "web" && tab.view && tab.view.webContents.navigationHistory.canGoForward()) {
      tab.view.webContents.navigationHistory.goForward();
    }
  });
});
ipcMain.handle("browser:toggle-bookmark", () => {
  const tab = tabs.get(activeTabId);

  if (!tab || tab.kind !== "web" || !tab.url) {
    return false;
  }

  if (database.findBookmark(tab.url)) {
    database.removeBookmark(tab.url);
    sendState();
    return false;
  }

  database.upsertBookmark({
    title: tab.title,
    url: tab.url,
    accent: "#2563eb"
  });
  sendState();
  return true;
});
ipcMain.handle("browser:remove-bookmark", (_, url) => {
  database.removeBookmark(url);
  sendState();
});
ipcMain.handle("browser:add-speed-dial", (_, payload) => {
  database.upsertSpeedDial(payload);
  sendState();
});
ipcMain.handle("browser:remove-speed-dial", (_, url) => {
  database.removeSpeedDial(url);
  sendState();
});
ipcMain.handle("browser:open-url", (_, url) => shell.openExternal(normalizeUrl(url)));
ipcMain.handle("browser:get-state", () => buildRendererState());
ipcMain.handle("browser:save-settings", (_, nextSettings) => {
  database.updateSettings(nextSettings);
  sendState();
});
ipcMain.handle("browser:clear-history", () => {
  database.clearHistory();
  sendState();
});
ipcMain.handle("browser:clear-downloads", () => {
  database.clearDownloads();
  sendState();
});
ipcMain.handle("browser:open-download", (_, downloadId) => {
  const item = getBrowserState().downloads.find((entry) => entry.id === downloadId);
  if (item?.savePath) {
    shell.showItemInFolder(item.savePath);
  }
});
ipcMain.handle("browser:create-profile", (_, name) => {
  const profile = profileRegistry.createProfile(name);
  sendState();
  return profile;
});
ipcMain.handle("browser:switch-profile", (_, profileId) => switchProfile(profileId));
ipcMain.handle("browser:toggle-ai-overlay", () => toggleAiOverlay());
ipcMain.handle("browser:close-ai-overlay", () => closeAiOverlay());
ipcMain.handle("browser:restore-crash-session", () => restoreCrashSession());
ipcMain.handle("browser:dismiss-crash-recovery", () => dismissCrashRecovery());
ipcMain.handle("ai:get-contract", () => ({
  contract: AI_CONTRACT,
  permissions: getBrowserState().aiPermissions
}));
ipcMain.handle("ai:set-permission", (_, scope, allowed) => {
  if (!(scope in DEFAULT_AI_PERMISSIONS)) {
    throw new Error(`Unknown AI permission scope: ${scope}`);
  }
  database.setAiPermission(scope, Boolean(allowed));
  database.logAiActivity("permission_update", "completed", `${scope} set to ${Boolean(allowed)}`);
  sendState();
  return getBrowserState().aiPermissions;
});
ipcMain.handle("ai:run-action", async (_, actionId, payload) => {
  try {
    const result = await runAiAction(actionId, payload);
    sendState();
    return { ok: true, result };
  } catch (error) {
    database.logAiActivity(actionId, "failed", error.message);
    sendState();
    return { ok: false, error: error.message };
  }
});
ipcMain.handle("ai:ask-page-stream", async (_, payload) => {
  try {
    const result = await runAiAction("answer_with_page_context", {
      requestId: payload?.requestId,
      userPrompt: payload?.userPrompt
    });
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});
ipcMain.handle("ai:cancel-stream", (_, requestId) => {
  const controller = aiStreamControllers.get(requestId);
  if (controller) {
    controller.abort();
    aiStreamControllers.delete(requestId);
    return true;
  }
  return false;
});
ipcMain.handle("ai:wake-detect-audio", async (_, payload) => {
  try {
    const result = await callAiServiceWakeDetect(payload || {});
    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      statusCode: error.statusCode || null
    };
  }
});
ipcMain.handle("ai:transcribe-audio", async (_, payload) => {
  try {
    const text = await callAiServiceTranscribeAudio(payload || {});
    return { ok: true, text };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      statusCode: error.statusCode || null
    };
  }
});
ipcMain.handle("ai:synthesize-speech", async (_, payload) => {
  try {
    const result = await callAiServiceSynthesizeSpeech(payload || {});
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});
ipcMain.on("browser:set-toolbar-height", (_, nextToolbarHeight) => {
  if (!Number.isFinite(nextToolbarHeight)) {
    return;
  }

  toolbarHeight = Math.max(0, Math.round(nextToolbarHeight));
  syncBounds();
  syncAiPanelBounds();
});

/**
 * Setup workflow event listeners
 * Wire workflow orchestrator events to IPC messages
 */
function setupWorkflowEventListeners() {
  if (!workflowOrchestrator) return;

  workflowOrchestrator.on("workflow:started", (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("workflow:started", data);
    }
  });

  workflowOrchestrator.on("workflow:step-started", (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("workflow:step-started", data);
    }
  });

  workflowOrchestrator.on("workflow:step-completed", (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("workflow:step-completed", data);
    }
  });

  workflowOrchestrator.on("workflow:progress", (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("workflow:progress", data);
    }
  });

  workflowOrchestrator.on("workflow:completed", (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("workflow:completed", data);
    }
  });

  workflowOrchestrator.on("workflow:failed", (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("workflow:failed", data);
    }
  });

  workflowOrchestrator.on("workflow:paused", (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("workflow:paused", data);
    }
  });

  workflowOrchestrator.on("workflow:cancelled", (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("workflow:cancelled", data);
    }
  });

  workflowOrchestrator.on("workflow:clarification-required", (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("workflow:clarification-required", data);
    }
  });

  workflowOrchestrator.on("workflow:permission-required", (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("workflow:permission-required", data);
    }
  });

  workflowOrchestrator.on("workflow:user-action-required", (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("workflow:user-action-required", data);
    }
  });
}

/**
 * Setup Brain event listeners.
 * The Brain emits run-scoped events. We forward them to the renderer for the
 * AI popup's Brain UI, and we also feed the workflow-completion events back
 * into the Brain so it can finalize the run state.
 */
function setupBrainEventListeners() {
  if (!nexaBrain) return;

  // Forward every brain event to both the main window (workflow sidebar lives
  // there too) and the AI popup (Brain conversation lives there).
  nexaBrain.on("run:event", ({ runId, event, data }) => {
    const payload = { runId, ...data, event };
    [mainWindow, aiPanelWindow].forEach((win) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send("brain:event", payload);
      }
    });
  });

  // Feed workflow completion/failure into the Brain so a run reaches its
  // terminal state.
  workflowOrchestrator.on("workflow:completed", (data) => {
    if (data?.workflowId) nexaBrain._onWorkflowCompleted(data.workflowId, data);
  });
  workflowOrchestrator.on("workflow:failed", (data) => {
    if (data?.workflowId) nexaBrain._onWorkflowFailed(data.workflowId, data);
  });
  workflowOrchestrator.on("workflow:cancelled", (data) => {
    if (data?.workflowId) {
      nexaBrain._onWorkflowFailed(data.workflowId, { error: "cancelled" });
    }
  });
}

/**
 * New IPC Handlers for Workflow & Action Execution
 */

// Execute a single browser action
ipcMain.handle("browser:execute-action", async (_, params) => {
  if (!actionExecutor) {
    throw new Error("Action executor not initialized");
  }

  const { action, workflowId, screenshot } = params;

  try {
    const result = await actionExecutor.executeAction(
      {
        type: action.type,
        params: { ...action.params, screenshot: screenshot !== false }
      },
      workflowId
    );

    return {
      ok: true,
      ...result
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});

// Start a new workflow
ipcMain.handle("browser:start-workflow", async (_, params) => {
  if (!workflowOrchestrator) {
    throw new Error("Workflow orchestrator not initialized");
  }

  const { goal, steps, permissions, options } = params;

  try {
    const result = await workflowOrchestrator.startWorkflow(goal, steps, {
      permissions,
      ...options
    });

    return {
      ok: true,
      ...result
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
});

// Get workflow status
ipcMain.handle("browser:get-workflow-status", (_, workflowId) => {
  if (!workflowOrchestrator) {
    throw new Error("Workflow orchestrator not initialized");
  }

  const status = workflowOrchestrator.getWorkflowStatus(workflowId);

  if (!status) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  return {
    ok: true,
    ...status
  };
});

// Pause workflow
ipcMain.handle("browser:pause-workflow", (_, workflowId) => {
  if (!workflowOrchestrator) {
    throw new Error("Workflow orchestrator not initialized");
  }

  const success = workflowOrchestrator.pauseWorkflow(workflowId);

  return { ok: success };
});

// Resume workflow
ipcMain.handle("browser:resume-workflow", (_, workflowId) => {
  if (!workflowOrchestrator) {
    throw new Error("Workflow orchestrator not initialized");
  }

  const success = workflowOrchestrator.resumeWorkflow(workflowId);

  return { ok: success };
});

// Cancel workflow
ipcMain.handle("browser:cancel-workflow", (_, workflowId) => {
  if (!workflowOrchestrator) {
    throw new Error("Workflow orchestrator not initialized");
  }

  const success = workflowOrchestrator.cancelWorkflow(workflowId);

  return { ok: success };
});

// Provide user clarification response
ipcMain.handle("workflow:provide-clarification", (_, workflowId, response) => {
  if (!workflowOrchestrator) {
    throw new Error("Workflow orchestrator not initialized");
  }

  workflowOrchestrator.provideClarification(workflowId, response);

  return { ok: true };
});

// Provide error response
ipcMain.handle("workflow:provide-error-response", (_, workflowId, response) => {
  if (!workflowOrchestrator) {
    throw new Error("Workflow orchestrator not initialized");
  }

  workflowOrchestrator.provideErrorResponse(workflowId, response);

  return { ok: true };
});

// Get/set action permissions
ipcMain.handle("browser:get-action-permissions", () => {
  if (!permissionManager) {
    throw new Error("Permission manager not initialized");
  }

  return {
    ok: true,
    ...permissionManager.getCurrentPermissionState()
  };
});

ipcMain.handle("browser:set-action-permission", (_, scope, allowed, scopeType) => {
  if (!permissionManager) {
    throw new Error("Permission manager not initialized");
  }

  if (allowed) {
    permissionManager.grantPermission(scope, { scope_type: scopeType || "session" });
  } else {
    permissionManager.denyPermission(scope);
  }

  return {
    ok: true,
    ...permissionManager.getCurrentPermissionState()
  };
});

// Get all permission definitions
ipcMain.handle("browser:get-permission-definitions", () => {
  if (!permissionManager) {
    throw new Error("Permission manager not initialized");
  }

  return {
    ok: true,
    permissions: permissionManager.getAllPermissions()
  };
});

/**
 * Brain IPC handlers.
 * The renderer submits a free-form goal and the Brain either returns
 * clarifications it needs answered, a permission prompt, or kicks off the
 * workflow. All responses are async; long-running progress flows over the
 * `brain:event` channel.
 */

ipcMain.handle("brain:ask-goal", async (_, payload) => {
  if (!nexaBrain) throw new Error("Brain not initialized");
  const goal = `${payload?.goal || ""}`.trim();
  if (!goal) {
    return { ok: false, error: "Goal is required" };
  }
  const context = {
    currentUrl: payload?.context?.currentUrl || "",
    currentTitle: payload?.context?.currentTitle || "",
    openTabs: Array.isArray(payload?.context?.openTabs) ? payload.context.openTabs : []
  };
  const result = await nexaBrain.askGoal(goal, context);
  return { ok: true, ...result };
});

ipcMain.handle("brain:provide-clarification", async (_, payload) => {
  if (!nexaBrain) throw new Error("Brain not initialized");
  const { runId, answers } = payload || {};
  if (!runId) return { ok: false, error: "runId is required" };
  const result = await nexaBrain.provideClarification(runId, answers || {});
  return { ok: true, ...result };
});

ipcMain.handle("brain:provide-permission-decision", async (_, payload) => {
  if (!nexaBrain) throw new Error("Brain not initialized");
  const { runId, granted } = payload || {};
  if (!runId) return { ok: false, error: "runId is required" };
  const result = await nexaBrain.providePermissionDecision(runId, granted || {});
  return { ok: true, ...result };
});

ipcMain.handle("brain:cancel-run", async (_, payload) => {
  if (!nexaBrain) throw new Error("Brain not initialized");
  const { runId } = payload || {};
  if (!runId) return { ok: false, error: "runId is required" };
  return { ok: true, cancelled: nexaBrain.cancelRun(runId) };
});

ipcMain.handle("brain:list-runs", async () => {
  if (!nexaBrain) throw new Error("Brain not initialized");
  return { ok: true, runs: nexaBrain.listRuns(25) };
});

ipcMain.handle("brain:get-run", async (_, payload) => {
  if (!nexaBrain) throw new Error("Brain not initialized");
  const { runId } = payload || {};
  if (!runId) return { ok: false, error: "runId is required" };
  const run = nexaBrain.getRun(runId);
  return { ok: true, run };
});

app.whenReady().then(() => {
  profileRegistry = new ProfileRegistry(path.join(app.getPath("userData"), "profiles"));
  loadDatabaseForProfile(profileRegistry.getActiveProfile());
  database.markShutdownState(false);
  attachDownloadHandlers();
  
  // Initialize workflow and action components
  actionExecutor = new ActionExecutor(browserViewManager, tabs);
  permissionManager = new PermissionManager(database);
  workflowOrchestrator = new WorkflowOrchestrator(actionExecutor, permissionManager);
  nexaBrain = new NexaBrain({
    actionExecutor,
    permissionManager,
    workflowOrchestrator,
    database
  });

  // Setup workflow event listeners
  setupWorkflowEventListeners();
  setupBrainEventListeners();

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  if (database) {
    database.markShutdownState(true);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
