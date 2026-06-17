const tabsRoot = document.getElementById("tabs");
const tabOverflowButton = document.getElementById("tab-overflow-button");
const tabOverflowCount = document.getElementById("tab-overflow-count");
const tabOverflowMenu = document.getElementById("tab-overflow-menu");
const newTabButton = document.getElementById("new-tab-button");
const addressForm = document.getElementById("address-form");
const addressInput = document.getElementById("address-input");
const heroSearchForm = document.getElementById("hero-search-form");
const heroSearchInput = document.getElementById("hero-search-input");
const backButton = document.getElementById("back-button");
const forwardButton = document.getElementById("forward-button");
const reloadButton = document.getElementById("reload-button");
const bookmarkButton = document.getElementById("bookmark-button");
const openAiButton = document.getElementById("open-ai-button");
const addCurrentToDialButton = document.getElementById("add-current-to-dial");
const topbar = document.getElementById("topbar");
const restorePrompt = document.getElementById("restore-prompt");
const restorePromptCopy = document.getElementById("restore-prompt-copy");
const restoreSessionButton = document.getElementById("restore-session-button");
const dismissRestoreButton = document.getElementById("dismiss-restore-button");
const startPage = document.getElementById("start-page");
const openSettingsButton = document.getElementById("open-settings-button");
const speedDialsRoot = document.getElementById("speed-dials");
const bookmarkCount = document.getElementById("bookmark-count");
const historyCount = document.getElementById("history-count");
const downloadCount = document.getElementById("download-count");
const securityIndicator = document.getElementById("security-indicator");
const openBookmarksButton = document.getElementById("open-bookmarks-button");
const openHistoryButton = document.getElementById("open-history-button");
const openDownloadsButton = document.getElementById("open-downloads-button");
const workspaceSection = document.getElementById("workspace-section");
const workspaceTitle = document.getElementById("workspace-title");
const closeWorkspaceButton = document.getElementById("close-workspace-button");
const bookmarkCurrentButton = document.getElementById("bookmark-current-button");
const clearHistoryButton = document.getElementById("clear-history-button");
const clearDownloadsButton = document.getElementById("clear-downloads-button");
const bookmarksList = document.getElementById("bookmarks-list");
const historyList = document.getElementById("history-list");
const downloadsList = document.getElementById("downloads-list");
const homepageInput = document.getElementById("homepage-input");
const backgroundSelect = document.getElementById("background-select");
const restoreSessionInput = document.getElementById("restore-session-input");
const profileSelect = document.getElementById("profile-select");
const profileCreateForm = document.getElementById("profile-create-form");
const profileNameInput = document.getElementById("profile-name-input");
const saveSettingsButton = document.getElementById("save-settings-button");

const workspaceViews = {
  bookmarks: document.getElementById("workspace-bookmarks"),
  history: document.getElementById("workspace-history"),
  downloads: document.getElementById("workspace-downloads"),
  settings: document.getElementById("workspace-settings")
};

let isTabOverflowOpen = false;
let currentWorkspace = null;
let currentState = {
  tabs: [],
  activeTabId: null,
  activeTab: null,
  activeIsBookmarked: false,
  browserData: {
    bookmarks: [],
    history: [],
    downloads: [],
    settings: {},
    speedDials: [],
    stats: {
      bookmarks: 0,
      history: 0,
      downloadsInProgress: 0
    }
  },
  recovery: {
    hasCrashedSession: false,
    tabCount: 0,
    savedAt: null
  },
  profiles: {
    activeProfile: null,
    items: []
  }
};

function truncateLabel(value, maxLength = 26) {
  if (!value) {
    return "New Tab";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function getInitials(value) {
  return `${value || "N"}`
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[\s./-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function formatUrl(url) {
  if (!url) {
    return "";
  }

  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function formatTime(value) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString();
}

function getActiveTab() {
  return currentState.activeTab;
}

function openWorkspace(name) {
  currentWorkspace = name;
  workspaceSection.classList.remove("hidden");
  workspaceTitle.textContent = name[0].toUpperCase() + name.slice(1);

  for (const [viewName, view] of Object.entries(workspaceViews)) {
    view.classList.toggle("hidden", viewName !== name);
  }
}

function closeWorkspace() {
  currentWorkspace = null;
  workspaceSection.classList.add("hidden");
}

function getSecurityIndicatorMarkup(activeTab) {
  if (!activeTab || activeTab.kind === "start") {
    return '<svg viewBox="0 0 24 24"><path d="M11 5H5v14h14v-6M13 11l6-6M14 5h5v5" /></svg>';
  }

  if (activeTab.url?.startsWith("https://")) {
    return '<svg viewBox="0 0 24 24"><path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7z" /></svg>';
  }

  return '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20" /></svg>';
}

function renderTabs() {
  tabsRoot.replaceChildren();
  tabOverflowMenu.replaceChildren();

  const allTabs = currentState.tabs;
  const tabCount = allTabs.length;
  const tabsWidth = tabsRoot.clientWidth || 1;
  const minVisibleWidth = 64;
  const slotWidth = minVisibleWidth + 5;
  const maxVisibleTabs = Math.max(1, Math.floor((tabsWidth + 5) / slotWidth));
  const activeIndex = Math.max(
    0,
    allTabs.findIndex((tab) => tab.id === currentState.activeTabId)
  );

  let visibleStart = 0;
  let visibleEnd = tabCount;

  if (tabCount > maxVisibleTabs) {
    const preferredStart = Math.max(0, activeIndex - Math.floor(maxVisibleTabs / 2));
    visibleStart = Math.min(preferredStart, tabCount - maxVisibleTabs);
    visibleEnd = visibleStart + maxVisibleTabs;
  }

  const visibleTabs = allTabs.slice(visibleStart, visibleEnd);
  const hiddenTabs = allTabs.filter((_, index) => index < visibleStart || index >= visibleEnd);
  const totalGap = Math.max(visibleTabs.length - 1, 0) * 5;
  const availableWidth = Math.max(tabsWidth - totalGap, 1);
  const rawWidth = visibleTabs.length > 0 ? Math.floor(availableWidth / visibleTabs.length) : 190;
  const boundedWidth = Math.max(56, Math.min(rawWidth, 220));

  tabsRoot.style.setProperty("--tab-width", `${boundedWidth}px`);
  tabsRoot.classList.toggle("tabs--compact", boundedWidth < 112);
  tabsRoot.classList.toggle("tabs--cramped", boundedWidth < 72);
  tabOverflowButton.classList.toggle("hidden", hiddenTabs.length === 0);
  tabOverflowCount.textContent = hiddenTabs.length > 99 ? "99+" : String(hiddenTabs.length);
  tabOverflowMenu.classList.toggle("hidden", !isTabOverflowOpen || hiddenTabs.length === 0);

  let activeTabElement = null;

  for (const tab of visibleTabs) {
    const tabButton = document.createElement("button");
    tabButton.className = `tab ${tab.id === currentState.activeTabId ? "tab--active" : ""}`;
    tabButton.type = "button";
    tabButton.title = tab.title || tab.url || "New Tab";

    const lead = document.createElement(tab.loading ? "span" : tab.favicon ? "img" : "span");
    lead.className = tab.loading ? "tab__loading" : tab.favicon ? "tab__favicon" : "tab__badge";
    if (tab.favicon) {
      lead.src = tab.favicon;
      lead.alt = "";
    } else if (!tab.loading) {
      lead.textContent = tab.kind === "start" ? "N" : getInitials(tab.title || tab.url);
    }

    const title = document.createElement("span");
    title.className = "tab__title";
    title.textContent = truncateLabel(tab.title || tab.url);

    const close = document.createElement("span");
    close.className = "tab__close";
    close.textContent = "x";
    close.addEventListener("click", async (event) => {
      event.stopPropagation();
      await window.browserApi.closeTab(tab.id);
    });

    tabButton.addEventListener("click", async () => {
      await window.browserApi.switchTab(tab.id);
    });

    tabButton.append(lead, title, close);
    tabsRoot.appendChild(tabButton);

    if (tab.id === currentState.activeTabId) {
      activeTabElement = tabButton;
    }
  }

  for (const tab of hiddenTabs) {
    const item = document.createElement("button");
    item.className = `tab-overflow-item ${tab.id === currentState.activeTabId ? "tab-overflow-item--active" : ""}`;
    item.type = "button";
    item.title = tab.title || tab.url || "New Tab";

    const lead = document.createElement(tab.loading ? "span" : tab.favicon ? "img" : "span");
    lead.className = tab.loading ? "tab__loading" : tab.favicon ? "tab__favicon" : "tab__badge";
    if (tab.favicon) {
      lead.src = tab.favicon;
      lead.alt = "";
    } else if (!tab.loading) {
      lead.textContent = tab.kind === "start" ? "N" : getInitials(tab.title || tab.url);
    }

    const title = document.createElement("span");
    title.className = "tab-overflow-item__title";
    title.textContent = truncateLabel(tab.title || tab.url, 42);

    const close = document.createElement("span");
    close.className = "tab-overflow-item__close";
    close.textContent = "x";
    close.addEventListener("click", async (event) => {
      event.stopPropagation();
      await window.browserApi.closeTab(tab.id);
    });

    item.addEventListener("click", async () => {
      isTabOverflowOpen = false;
      await window.browserApi.switchTab(tab.id);
    });

    item.append(lead, title, close);
    tabOverflowMenu.appendChild(item);
  }

  if (activeTabElement) {
    requestAnimationFrame(() => {
      const tabLeft = activeTabElement.offsetLeft;
      const tabRight = tabLeft + activeTabElement.offsetWidth;
      const visibleLeft = tabsRoot.scrollLeft;
      const visibleRight = visibleLeft + tabsRoot.clientWidth;

      if (tabLeft < visibleLeft) {
        tabsRoot.scrollLeft = tabLeft - 16;
      } else if (tabRight > visibleRight) {
        tabsRoot.scrollLeft = tabRight - tabsRoot.clientWidth + 16;
      }
    });
  }
}

function renderSpeedDials() {
  speedDialsRoot.replaceChildren();

  for (const dial of currentState.browserData.speedDials) {
    const card = document.createElement("button");
    card.className = "dial-card";
    card.type = "button";
    card.style.setProperty("--dial-accent", dial.accent || "#2563eb");
    card.addEventListener("click", async () => {
      await window.browserApi.newTab(dial.url);
    });

    const remove = document.createElement("button");
    remove.className = "dial-card__remove";
    remove.type = "button";
    remove.textContent = "x";
    remove.addEventListener("click", async (event) => {
      event.stopPropagation();
      await window.browserApi.removeSpeedDial(dial.url);
    });

    const logo = document.createElement("div");
    logo.className = "dial-card__logo";
    logo.textContent = getInitials(dial.title);

    const title = document.createElement("div");
    title.className = "dial-card__title";
    title.textContent = dial.title;

    const url = document.createElement("div");
    url.className = "dial-card__url";
    url.textContent = formatUrl(dial.url);

    card.append(remove, logo, title, url);
    speedDialsRoot.appendChild(card);
  }
}

function createEmptyState(message) {
  const block = document.createElement("div");
  block.className = "empty-state";
  block.textContent = message;
  return block;
}

function createListItem(title, meta, actions = [], avatarSeed = title) {
  const item = document.createElement("article");
  item.className = "list-item";

  const row = document.createElement("div");
  row.className = "list-item__row";

  const avatar = document.createElement("div");
  avatar.className = "list-item__avatar";
  avatar.textContent = getInitials(avatarSeed);

  const copy = document.createElement("div");
  const heading = document.createElement("div");
  heading.className = "list-item__title";
  heading.textContent = title;
  const sub = document.createElement("div");
  sub.className = "list-item__meta";
  sub.textContent = meta;
  copy.append(heading, sub);

  row.append(avatar, copy);
  item.appendChild(row);

  if (actions.length) {
    const actionsRow = document.createElement("div");
    actionsRow.className = "list-item__actions";

    for (const action of actions) {
      const button = document.createElement("button");
      button.className = "list-button";
      button.type = "button";
      button.textContent = action.label;
      button.addEventListener("click", action.onClick);
      actionsRow.appendChild(button);
    }

    item.appendChild(actionsRow);
  }

  return item;
}

function renderBookmarks() {
  bookmarksList.replaceChildren();

  if (!currentState.browserData.bookmarks.length) {
    bookmarksList.appendChild(createEmptyState("No bookmarks yet."));
    return;
  }

  for (const bookmark of currentState.browserData.bookmarks) {
    bookmarksList.appendChild(
      createListItem(
        bookmark.title,
        formatUrl(bookmark.url),
        [
          { label: "Open", onClick: () => window.browserApi.newTab(bookmark.url) },
          { label: "Dial", onClick: () => window.browserApi.addSpeedDial(bookmark) },
          { label: "Remove", onClick: () => window.browserApi.removeBookmark(bookmark.url) }
        ],
        bookmark.title
      )
    );
  }
}

function renderHistory() {
  historyList.replaceChildren();

  if (!currentState.browserData.history.length) {
    historyList.appendChild(createEmptyState("No history yet."));
    return;
  }

  for (const entry of currentState.browserData.history) {
    historyList.appendChild(
      createListItem(
        entry.title,
        `${formatUrl(entry.url)}  ${formatTime(entry.visitedAt)}`,
        [{ label: "Open", onClick: () => window.browserApi.newTab(entry.url) }],
        entry.title
      )
    );
  }
}

function renderDownloads() {
  downloadsList.replaceChildren();

  if (!currentState.browserData.downloads.length) {
    downloadsList.appendChild(createEmptyState("No downloads yet."));
    return;
  }

  for (const entry of currentState.browserData.downloads) {
    const actions = [];
    if (entry.savePath) {
      actions.push({
        label: "Show in Folder",
        onClick: () => window.browserApi.openDownload(entry.id)
      });
    }

    downloadsList.appendChild(
      createListItem(
        entry.filename,
        `${entry.filename || "Download"}  ${entry.state}`,
        actions,
        entry.filename
      )
    );
  }
}

function renderProfiles() {
  profileSelect.replaceChildren();

  for (const profile of currentState.profiles.items) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    option.selected = profile.id === currentState.profiles.activeProfile?.id;
    profileSelect.appendChild(option);
  }
}

function renderCounts() {
  bookmarkCount.textContent = String(currentState.browserData.bookmarks.length);
  historyCount.textContent = String(currentState.browserData.history.length);
  downloadCount.textContent = String(currentState.browserData.stats.downloadsInProgress);
}

function syncControls() {
  const activeTab = getActiveTab();
  backButton.disabled = !activeTab?.canGoBack;
  forwardButton.disabled = !activeTab?.canGoForward;
  reloadButton.disabled = !activeTab || activeTab.kind !== "web";
  bookmarkButton.classList.toggle("is-active", Boolean(currentState.activeIsBookmarked));

  if (document.activeElement !== addressInput) {
    addressInput.value = activeTab?.displayUrl || activeTab?.url || "";
  }

  securityIndicator.innerHTML = getSecurityIndicatorMarkup(activeTab);
}

function syncStartPage() {
  const activeTab = getActiveTab();
  const showStart = currentState.recovery.hasCrashedSession || !activeTab || activeTab.kind === "start";
  startPage.classList.toggle("hidden", !showStart);
}

function renderRecoveryPrompt() {
  const recovery = currentState.recovery;
  restorePrompt.classList.toggle("hidden", !recovery.hasCrashedSession);

  if (!recovery.hasCrashedSession) {
    return;
  }

  const savedAt = recovery.savedAt ? formatTime(recovery.savedAt) : "your last session";
  const tabLabel = recovery.tabCount === 1 ? "1 tab" : `${recovery.tabCount} tabs`;
  restorePromptCopy.textContent = `Nexa Browser appears to have closed unexpectedly. Restore ${tabLabel} from ${savedAt}?`;
}

function syncSettings() {
  const settings = currentState.browserData.settings || {};
  homepageInput.value = settings.homepage || "nexa://start";
  backgroundSelect.value = settings.startBackground || "aurora";
  restoreSessionInput.checked = Boolean(settings.restoreLastSession);
  if (currentState.profiles.activeProfile) {
    profileSelect.value = currentState.profiles.activeProfile.id;
    openSettingsButton.textContent = currentState.profiles.activeProfile.name.slice(0, 1).toUpperCase();
  }
  document.body.dataset.theme = settings.startBackground || "aurora";
}

function syncToolbarHeight() {
  if (window.browserApi?.setToolbarHeight) {
    window.browserApi.setToolbarHeight(topbar.getBoundingClientRect().height);
  }
}

async function handleNavigation(event, sourceInput = addressInput) {
  event.preventDefault();
  await window.browserApi.navigate(sourceInput.value);
}

async function bookmarkCurrentPage() {
  await window.browserApi.toggleBookmark();
}

async function addCurrentPageToDial() {
  const activeTab = getActiveTab();

  if (!activeTab || activeTab.kind !== "web") {
    return;
  }

  await window.browserApi.addSpeedDial({
    title: activeTab.title,
    url: activeTab.url,
    accent: "#2563eb"
  });
}

async function bookmarkCurrentPage() {
  await window.browserApi.toggleBookmark();
}

newTabButton.addEventListener("click", async () => {
  if (window.browserApi?.newTab) {
    await window.browserApi.newTab("nexa://start");
  }
});
openAiButton.addEventListener("click", () => {
  if (window.browserApi?.toggleAiOverlay) {
    window.browserApi.toggleAiOverlay();
  }
});
openSettingsButton.addEventListener("click", () => {
  openWorkspace("settings");
});
openBookmarksButton.addEventListener("click", () => {
  openWorkspace("bookmarks");
});
openHistoryButton.addEventListener("click", () => {
  openWorkspace("history");
});
openDownloadsButton.addEventListener("click", () => {
  openWorkspace("downloads");
});
closeWorkspaceButton.addEventListener("click", closeWorkspace);
tabOverflowButton.addEventListener("click", () => {
  isTabOverflowOpen = !isTabOverflowOpen;
  renderTabs();
});
addressForm.addEventListener("submit", (event) => handleNavigation(event, addressInput));
heroSearchForm.addEventListener("submit", (event) => handleNavigation(event, heroSearchInput));
backButton.addEventListener("click", async () => {
  await window.browserApi.back();
});
forwardButton.addEventListener("click", async () => {
  await window.browserApi.forward();
});
reloadButton.addEventListener("click", async () => {
  await window.browserApi.reload();
});
bookmarkButton.addEventListener("click", bookmarkCurrentPage);
bookmarkCurrentButton.addEventListener("click", bookmarkCurrentPage);
addCurrentToDialButton.addEventListener("click", addCurrentPageToDial);
clearHistoryButton.addEventListener("click", async () => {
  await window.browserApi.clearHistory();
});
clearDownloadsButton.addEventListener("click", async () => {
  await window.browserApi.clearDownloads();
});
saveSettingsButton.addEventListener("click", async () => {
  await window.browserApi.saveSettings({
    homepage: homepageInput.value.trim() || "nexa://start",
    startBackground: backgroundSelect.value,
    restoreLastSession: restoreSessionInput.checked
  });
});
profileSelect.addEventListener("change", async () => {
  if (!profileSelect.value) {
    return;
  }
  await window.browserApi.switchProfile(profileSelect.value);
});
profileCreateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = profileNameInput.value.trim();
  if (!name) {
    return;
  }
  const profile = await window.browserApi.createProfile(name);
  profileNameInput.value = "";
  await window.browserApi.switchProfile(profile.id);
});
addressInput.addEventListener("focus", () => addressInput.select());
heroSearchInput.addEventListener("focus", () => heroSearchInput.select());
restoreSessionButton.addEventListener("click", async () => {
  await window.browserApi.restoreCrashSession();
});
dismissRestoreButton.addEventListener("click", async () => {
  await window.browserApi.dismissCrashRecovery();
});

window.addEventListener("load", syncToolbarHeight);
window.addEventListener("resize", syncToolbarHeight);
window.addEventListener("click", (event) => {
  if (
    isTabOverflowOpen &&
    !tabOverflowMenu.contains(event.target) &&
    !tabOverflowButton.contains(event.target)
  ) {
    isTabOverflowOpen = false;
    renderTabs();
  }
});

if (typeof ResizeObserver !== "undefined") {
  const observer = new ResizeObserver(() => {
    syncToolbarHeight();
  });
  observer.observe(topbar);
}

function applyState(state) {
  currentState = state;
  renderTabs();
  renderSpeedDials();
  renderCounts();
  renderBookmarks();
  renderHistory();
  renderDownloads();
  renderProfiles();
  renderRecoveryPrompt();
  syncControls();
  syncStartPage();
  syncSettings();
  if (currentWorkspace) {
    openWorkspace(currentWorkspace);
  }
}

if (window.browserApi?.onState) {
  window.browserApi.onState((state) => {
    applyState(state);
  });
}

if (window.browserApi?.getState) {
  window.browserApi.getState().then((state) => {
    applyState(state);
  });
}
