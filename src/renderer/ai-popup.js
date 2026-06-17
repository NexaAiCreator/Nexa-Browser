const closeAiButton = document.getElementById("close-ai-button");
const aiPermissionsList = document.getElementById("ai-permissions-list");
const aiSummarizePageButton = document.getElementById("ai-summarize-page-button");
const aiSearchForm = document.getElementById("ai-search-form");
const aiSearchInput = document.getElementById("ai-search-input");
const aiActivityList = document.getElementById("ai-activity-list");
const aiStatusText = document.getElementById("ai-status-text");
const aiStatusPill = document.getElementById("ai-status-pill");
const aiVoiceMeta = document.getElementById("ai-voice-meta");
const aiPageQuestionForm = document.getElementById("ai-page-question-form");
const aiPageQuestionInput = document.getElementById("ai-page-question-input");
const aiPageQuestionSubmit = document.getElementById("ai-page-question-submit");
const aiVoiceToggleButton = document.getElementById("ai-voice-toggle-button");
const aiInlineVoiceButton = document.getElementById("ai-inline-voice-button");
const aiConversation = document.getElementById("ai-conversation");
const aiContextTitle = document.getElementById("ai-context-title");
const aiContextUrl = document.getElementById("ai-context-url");
// Chat quick actions (new layout)
const aiQuickSummarize = document.getElementById("ai-quick-summarize");
const aiQuickResearch = document.getElementById("ai-quick-research");
const aiQuickExplain = document.getElementById("ai-quick-explain");
const aiQuickAutomate = document.getElementById("ai-quick-automate");
const aiStopSpeechButton = document.getElementById("ai-stop-speech-button");
const aiActivePillText = document.getElementById("ai-active-pill-text");
// ai-debug-strip removed from markup (developer-only)
const aiDebugMode = document.getElementById("ai-debug-mode");
const aiDebugSilence = document.getElementById("ai-debug-silence");
const aiDebugWake = document.getElementById("ai-debug-wake");
const aiDebugStt = document.getElementById("ai-debug-stt");

// Brain UI elements
const aiTabConversation = document.getElementById("ai-tab-conversation");
const aiTabBrain = document.getElementById("ai-tab-brain");
const aiViewConversation = document.getElementById("ai-view-conversation");
const aiViewBrain = document.getElementById("ai-view-brain");
const aiBrainForm = document.getElementById("ai-brain-form");
const aiBrainInput = document.getElementById("ai-brain-input");
const aiBrainSubmit = document.getElementById("ai-brain-submit");
const aiBrainThread = document.getElementById("ai-brain-thread");
const aiBrainRuns = document.getElementById("ai-brain-runs");
const MAX_TTS_PREFETCH = 5;
const ALLOW_BROWSER_SPEECH_FALLBACK = false;
const ENABLE_BROWSER_WAKE_RECOGNITION = true;
const WAKE_RECOGNITION_CTOR = ENABLE_BROWSER_WAKE_RECOGNITION
  ? (window.SpeechRecognition || window.webkitSpeechRecognition || null)
  : null;
const WAKE_PHRASES = ["hey nexa", "hello nexa", "hi nexa", "nexa"];
const WAKE_ALIASES = [
  "next a",
  "next uh",
  "nex a",
  "nex uh",
  "necks a",
  "necks uh",
  "neck sir",
  "neck sa",
  "nex us",
  "nexus",
  "necks a",
  "neck s a",
  "nexx a",
  "nek sa",
  "nek suh",
  "neks a",
  "necker",
  "neck zaa",
  "nek za",
  "hey next a",
  "hey neck sa",
  "hey nexus",
  "hey nexa",
  "hay nexa",
  "hello neck sir",
  "hello next uh",
  "helo nexa",
  "hullo nex a",
  "high neck sa",
  "high next a",
  "yo neck za",
  "okay neck sir",
  "okay next a",
  "listen neck sa",
  "listen nexus",
  "heynex",
  "helnexa",
  "nexahey",
  "nexa listen",
  "nexus listen",
  "nax a",
  "nix a",
  "nek seh"
];
const WAKE_NEGATIVE_PHRASES = [
  "next up",
  "nexus phone",
  "texas",
  "extra",
  "nexus 5",
  "check sir"
];
const CLOSE_PHRASES = [
  "thanks",
  "thank you",
  "thanks nexa",
  "thank you nexa",
  "bye",
  "goodbye",
  "goodbye nexa",
  "stop listening",
  "stop voice mode",
  "end voice mode",
  "thats all",
  "that's all"
];
const MAX_COMMAND_DISTANCE = 2;
const WAKE_SAMPLE_RATE = 16000;
const WAKE_CHUNK_DURATION_MS = 80;
const WAKE_CHUNK_OVERLAP_MS = 0;
const WAKE_CHUNK_SAMPLES = Math.floor((WAKE_SAMPLE_RATE * WAKE_CHUNK_DURATION_MS) / 1000);
const WAKE_CHUNK_OVERLAP_SAMPLES = Math.floor((WAKE_SAMPLE_RATE * WAKE_CHUNK_OVERLAP_MS) / 1000);
const LOCAL_WAKE_SCORE_THRESHOLD = 0.35;
const MAX_WAKE_SEND_QUEUE = 12;

let currentState = {
  activeTab: null,
  ai: {
    contract: {
      permissions: [],
      actions: []
    },
    permissions: {},
    activity: []
  }
};

const runtimeState = {
  status: "idle",
  voiceModeActive: false,
  voiceConversationAwake: false,
  wakeRecognition: null,
  wakeRecognitionShouldRestart: false,
  wakeSourceNode: null,
  wakeProcessorNode: null,
  wakeChunkBuffer: [],
  wakeChunkQueue: [],
  wakeDetectInFlight: false,
  wakeChunksSent: 0,
  wakeSessionId: createId("wake"),
  rawWakeSupported: true,
  currentRequestId: null,
  currentAssistantMessageId: null,
  mediaStream: null,
  mediaRecorder: null,
  audioContext: null,
  analyserNode: null,
  analyserData: null,
  voiceActivityInterval: null,
  speechSourceNode: null,
  speechProcessorNode: null,
  pcmCaptureBuffer: [],
  recorderMimeType: "audio/webm",
  audioChunks: [],
  isClosing: false,
  messages: [],
  lastAssistantText: "",
  speechEnabled: Boolean(window.speechSynthesis),
  speaking: false,
  activeUtterance: null,
  speechQueue: [],
  streamSpeechBuffer: "",
  streamedSpeechQueued: false,
  activeAudio: null,
  activeAudioUrl: null,
  speechSynthesisInFlight: new Set(),
  preparedSpeechQueue: [],
  speechSessionId: 0,
  nextSpeechSequence: 0,
  nextPlaybackSequence: 0,
  silenceTimeout: null,
  lastAudioTime: null,
  speechDetectedDuringCapture: false,
  lastWakeMatch: "waiting",
  sttState: "idle"
};

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(value = Date.now()) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function createEmptyState(message) {
  const block = document.createElement("div");
  block.className = "empty-state";
  block.textContent = message;
  return block;
}

function createListItem(title, meta, avatarSeed = title) {
  const item = document.createElement("article");
  item.className = "list-item";

  const row = document.createElement("div");
  row.className = "list-item__row";

  const avatar = document.createElement("div");
  avatar.className = "list-item__avatar";
  avatar.textContent = `${avatarSeed || "N"}`
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[\s./-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

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

  return item;
}

function setRuntimeStatus(status, meta = "") {
  runtimeState.status = status;
  document.body.dataset.aiStatus = status;

  const labels = {
    idle: "Idle",
    resting: "Resting",
    listening: "Listening",
    transcribing: "Transcribing",
    answering: "Answering",
    speaking: "Speaking",
    error: "Error"
  };

  aiStatusText.textContent = labels[status] || "Idle";
  aiVoiceMeta.textContent = meta || (
    status === "resting"
      ? "Monitoring microphone for the wake word."
      : status === "listening"
        ? "Listening... (auto-stops after 4 seconds of silence)"
        : status === "transcribing"
        ? "Turning speech into text"
        : status === "answering"
          ? "Nexa is thinking..."
          : status === "speaking"
            ? "Nexa is speaking"
            : status === "error"
              ? "Something went wrong"
              : "Nexa can make mistakes. Check important info."
  );
  aiStatusPill.dataset.status = status;
  aiPageQuestionSubmit.disabled = status === "listening" || status === "transcribing";
  aiInlineVoiceButton.disabled = status === "transcribing";
  aiStopSpeechButton.disabled = !runtimeState.speaking;

  // Developer debug-strip removed; avoid updating missing DOM.
  // updateDebugStrip();

  const voiceStateText = document.getElementById("voice-state-text");
  if (voiceStateText) {
    voiceStateText.textContent = (labels[status] || "Idle");
  }
}

function isVoiceCaptureActiveStatus() {
  return runtimeState.status === "listening" || runtimeState.status === "resting";
}

function supportsWakeRecognition() {
  return Boolean(WAKE_RECOGNITION_CTOR);
}

function getWakeArmedLabel() {
  if (runtimeState.rawWakeSupported && supportsWakeRecognition()) {
    return "raw + browser armed";
  }
  if (runtimeState.rawWakeSupported) {
    return "raw armed";
  }
  if (supportsWakeRecognition()) {
    return "browser only";
  }
  return "wake unsupported";
}

function setDebugWakeState(value) {
  runtimeState.lastWakeMatch = value || "waiting";
  // Developer debug-strip removed from markup.
}

function setDebugSttState(value) {
  runtimeState.sttState = value || "idle";
  // Developer debug-strip removed from markup.
}

function updateDebugStrip() {
  // No-op: debug strip removed.
}


function normalizeVoiceCommandText(text) {
  return `${text || ""}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(left, right) {
  const a = `${left || ""}`;
  const b = `${right || ""}`;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) {
    dp[i][0] = i;
  }
  for (let j = 0; j < cols; j += 1) {
    dp[0][j] = j;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[a.length][b.length];
}

function isFuzzyCommandMatch(input, target, maxDistance = MAX_COMMAND_DISTANCE) {
  if (!input || !target) {
    return false;
  }

  if (input === target) {
    return true;
  }

  const distance = levenshteinDistance(input, target);
  return distance <= maxDistance;
}

function isWakeLikeSingleWord(word) {
  if (!word || word.length < 3) {
    return false;
  }

  return [
    "nexa",
    "nexus",
    "next",
    "nex",
    "neks",
    "necks",
    "nek",
    "nax",
    "nix"
  ].some((candidate) => isFuzzyCommandMatch(word, candidate, 2));
}

function startsWithWakeNegativePhrase(normalized) {
  return WAKE_NEGATIVE_PHRASES.some((phrase) => (
    normalized === phrase || normalized.startsWith(`${phrase} `)
  ));
}

function extractWakeAliasMatch(normalized, words) {
  for (const phrase of [...WAKE_PHRASES, ...WAKE_ALIASES]) {
    const phraseWords = phrase.split(" ").filter(Boolean);
    const candidate = words.slice(0, phraseWords.length).join(" ");
    if (!candidate) {
      continue;
    }

    if (isFuzzyCommandMatch(candidate, phrase)) {
      return {
        matched: phrase,
        prompt: words.slice(phraseWords.length).join(" ").trim()
      };
    }
  }

  return null;
}

function extractWakeMatch(text) {
  const normalized = normalizeVoiceCommandText(text);
  if (!normalized) {
    return null;
  }

  if (startsWithWakeNegativePhrase(normalized)) {
    return null;
  }

  const words = normalized.split(" ").filter(Boolean);
  const aliasMatch = extractWakeAliasMatch(normalized, words);
  if (aliasMatch) {
    return aliasMatch;
  }

  const firstWord = words[0] || "";
  const firstTwoWords = words.slice(0, 2).join(" ");
  const remainderAfterFirstWord = words.slice(1).join(" ").trim();
  const remainderAfterTwoWords = words.slice(2).join(" ").trim();

  if (isWakeLikeSingleWord(firstWord)) {
    return {
      matched: firstWord,
      prompt: remainderAfterFirstWord
    };
  }

  for (const phrase of WAKE_PHRASES) {
    const phraseWordCount = phrase.split(" ").length;
    const candidate = phraseWordCount === 1 ? firstWord : firstTwoWords;
    if (isFuzzyCommandMatch(candidate, phrase)) {
      return {
        matched: phrase,
        prompt: phraseWordCount === 1 ? remainderAfterFirstWord : remainderAfterTwoWords
      };
    }
  }

  if (words.length >= 2 && ["hey", "hi", "hello"].some((greeting) => isFuzzyCommandMatch(firstWord, greeting, 1))) {
    const possibleName = words[1] || "";
    if (isFuzzyCommandMatch(possibleName, "nexa", 2)) {
      return {
        matched: `${firstWord} ${possibleName}`,
        prompt: words.slice(2).join(" ").trim()
      };
    }
  }

  return null;
}

function getWakePrompt(text) {
  const wakeMatch = extractWakeMatch(text);
  if (!wakeMatch) {
    return null;
  }
  return wakeMatch.prompt;
}

function isCloseCommand(text) {
  const normalized = normalizeVoiceCommandText(text);
  if (!normalized) {
    return false;
  }

  return CLOSE_PHRASES.some((phrase) => isFuzzyCommandMatch(normalized, phrase));
}

function pushMessage(role, text = "", extras = {}) {
  const message = {
    id: createId(role),
    role,
    text,
    createdAt: Date.now(),
    ...extras
  };
  runtimeState.messages.push(message);
  renderConversation();
  return message;
}

function updateMessage(id, patch) {
  const message = runtimeState.messages.find((item) => item.id === id);
  if (!message) {
    return;
  }
  Object.assign(message, patch);
  renderConversation();
}

function renderConversation() {
  aiConversation.replaceChildren();

  if (!runtimeState.messages.length) {
    const intro = document.createElement("div");
    intro.className = "ai-thread__empty";
    intro.innerHTML = "<strong>Nexa is ready.</strong><span>Ask about this page, summarize it, or use voice to talk naturally.</span>";
    aiConversation.appendChild(intro);
    return;
  }

  for (const message of runtimeState.messages) {
    const row = document.createElement("div");
    row.className = `ai-thread__row ai-thread__row--${message.role}`;

    const bubble = document.createElement("article");
    bubble.className = `ai-thread__bubble ai-thread__bubble--${message.role}`;

    if (message.role === "assistant") {
      const badge = document.createElement("div");
      badge.className = "ai-thread__assistant-badge";
      badge.textContent = "N";
      row.appendChild(badge);
    }

    const body = document.createElement("div");
    body.className = "ai-thread__bubble-body";
    body.textContent = message.text || (message.pending ? "..." : "");

    const meta = document.createElement("div");
    meta.className = "ai-thread__meta";
    meta.textContent = message.meta || formatTime(message.createdAt);

    bubble.append(body, meta);
    row.appendChild(bubble);
    aiConversation.appendChild(row);
  }

  aiConversation.scrollTop = aiConversation.scrollHeight;
}

function renderAiPermissions() {
  aiPermissionsList.replaceChildren();

  for (const permission of currentState.ai.contract.permissions) {
    const label = document.createElement("label");
    label.className = "permission-item";

    const text = document.createElement("div");
    text.className = "permission-copy";
    const title = document.createElement("div");
    title.className = "permission-copy__title";
    title.textContent = permission.label;
    const description = document.createElement("div");
    description.className = "permission-copy__description";
    description.textContent = permission.description;
    text.append(title, description);

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = Boolean(currentState.ai.permissions[permission.scope]);
    toggle.addEventListener("change", async () => {
      await window.browserApi.setAiPermission(permission.scope, toggle.checked);
    });

    label.append(text, toggle);
    aiPermissionsList.appendChild(label);
  }
}

function renderAiActivity() {
  aiActivityList.replaceChildren();

  if (!currentState.ai.activity.length) {
    aiActivityList.appendChild(createEmptyState("No AI activity yet."));
    return;
  }

  for (const entry of currentState.ai.activity) {
    aiActivityList.appendChild(
      createListItem(
        entry.action,
        `${entry.status}  ${new Date(entry.createdAt).toLocaleString()}`,
        entry.action
      )
    );
  }
}

function renderContextCard() {
  const activeTab = currentState.activeTab;
  if (!activeTab || activeTab.kind !== "web") {
    aiContextTitle.textContent = "No active page";
    aiContextUrl.textContent = "Open a website to activate page-aware help.";
    aiActivePillText.textContent = "Open a page";
    return;
  }

  aiContextTitle.textContent = activeTab.title || "Current page";
  aiContextUrl.textContent = activeTab.url || "";
  aiActivePillText.textContent = currentState.ai.permissions.current_page
    ? "Active on this page"
    : "Permission required";
}

function hasActiveVoiceRecorder() {
  return Boolean(runtimeState.speechProcessorNode);
}

function encodeWavFromInt16(samples, sampleRate = WAKE_SAMPLE_RATE) {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(offset, samples[i], true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function startRecorderForCurrentStream() {
  if (!runtimeState.mediaStream) {
    throw new Error("No microphone stream available.");
  }

  if (!runtimeState.audioContext) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("AudioContext is not available for prompt capture.");
    }
    runtimeState.audioContext = new AudioContextCtor();
  }

  const source = runtimeState.audioContext.createMediaStreamSource(runtimeState.mediaStream);
  const processor = runtimeState.audioContext.createScriptProcessor(4096, 1, 1);
  runtimeState.speechSourceNode = source;
  runtimeState.speechProcessorNode = processor;
  runtimeState.mediaRecorder = { state: "recording" };
  runtimeState.pcmCaptureBuffer = [];
  runtimeState.lastAudioTime = Date.now();
  runtimeState.speechDetectedDuringCapture = false;

  processor.onaudioprocess = (event) => {
    if (!runtimeState.voiceModeActive || runtimeState.status !== "listening") {
      return;
    }

    const inputChannel = event.inputBuffer.getChannelData(0);
    const downsampled = downsampleToWakeRate(inputChannel, event.inputBuffer.sampleRate);
    const pcm = floatTo16BitPcm(downsampled);
    runtimeState.pcmCaptureBuffer.push(...pcm);
  };

  source.connect(processor);
  processor.connect(runtimeState.audioContext.destination);
  console.log("[Voice] PCM prompt capture armed");
}

function resumeContinuousListening() {
  if (!runtimeState.voiceModeActive) {
    return;
  }

  if (!runtimeState.voiceConversationAwake) {
    if (runtimeState.speechProcessorNode) {
      runtimeState.speechProcessorNode.disconnect();
      runtimeState.speechProcessorNode.onaudioprocess = null;
      runtimeState.speechProcessorNode = null;
    }
    if (runtimeState.speechSourceNode) {
      runtimeState.speechSourceNode.disconnect();
      runtimeState.speechSourceNode = null;
    }
    runtimeState.mediaRecorder = null;
    runtimeState.pcmCaptureBuffer = [];
    runtimeState.audioChunks = [];
    runtimeState.lastAudioTime = null;
    setDebugSttState("idle");
    if (runtimeState.mediaStream && !runtimeState.wakeProcessorNode) {
      startRawWakeDetection(runtimeState.mediaStream);
    }
    startWakeRecognition();
    setRuntimeStatus("resting", "Wake-only mode. Say 'Nexa' or 'Hey Nexa' to start capture.");
    setDebugWakeState(getWakeArmedLabel());
    return;
  }

  if (!hasActiveVoiceRecorder()) {
    startRecorderForCurrentStream();
  }

  runtimeState.audioChunks = [];
  runtimeState.lastAudioTime = Date.now();
  setDebugSttState("idle");
  setRuntimeStatus(runtimeState.voiceConversationAwake ? "listening" : "resting");
  resetSilenceTimer();
}

async function endVoiceMode(message = "Voice mode stopped") {
  runtimeState.voiceModeActive = false;
  runtimeState.voiceConversationAwake = false;
  stopWakeRecognition();
  await stopRawWakeDetection();
  stopSpeaking();
  if (runtimeState.currentRequestId) {
    await window.browserApi.cancelAiStream(runtimeState.currentRequestId);
    runtimeState.currentRequestId = null;
  }
  await stopVoiceCapture({ keepStream: false });
  setDebugWakeState("waiting");
  setDebugSttState("idle");
  setRuntimeStatus("idle", message);
}

function stopSpeaking() {
  if (runtimeState.activeAudio) {
    runtimeState.activeAudio.pause();
    runtimeState.activeAudio.src = "";
    runtimeState.activeAudio = null;
  }
  if (runtimeState.activeAudioUrl) {
    URL.revokeObjectURL(runtimeState.activeAudioUrl);
    runtimeState.activeAudioUrl = null;
  }
  for (const prepared of runtimeState.preparedSpeechQueue) {
    if (prepared?.audioUrl) {
      URL.revokeObjectURL(prepared.audioUrl);
    }
  }
  runtimeState.preparedSpeechQueue = [];
  runtimeState.speechSessionId += 1;
  runtimeState.nextSpeechSequence = 0;
  runtimeState.nextPlaybackSequence = 0;
  if (!window.speechSynthesis) {
    runtimeState.speaking = false;
    runtimeState.speechQueue = [];
    runtimeState.streamSpeechBuffer = "";
    runtimeState.speechSynthesisInFlight.clear();
    if (runtimeState.status === "speaking") {
      if (runtimeState.voiceModeActive) {
        resumeContinuousListening();
      } else {
        setRuntimeStatus("idle");
      }
    }
    return;
  }
  window.speechSynthesis.cancel();
  runtimeState.activeUtterance = null;
  runtimeState.speaking = false;
  runtimeState.speechQueue = [];
  runtimeState.streamSpeechBuffer = "";
  runtimeState.speechSynthesisInFlight.clear();
  if (runtimeState.status === "speaking") {
    if (runtimeState.voiceModeActive) {
      resumeContinuousListening();
    } else {
      setRuntimeStatus("idle");
    }
  }
}

function getPreferredVoice() {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((voice) => /en/i.test(voice.lang)) || voices[0] || null;
}

function sanitizeSpeechText(text) {
  return `${text || ""}`
    .replace(/\s+/g, " ")
    .replace(/[-*]\s+/g, "")
    .replace(/\bhttps?:\/\/\S+/gi, "")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();
}

function tryExtractAnswerText(text) {
  const raw = `${text || ""}`.trim();
  if (!raw) {
    return "";
  }

  let candidate = raw;
  if (candidate.startsWith("```")) {
    const parts = candidate.split("```");
    candidate = parts.find((part) => part.includes("{") && part.includes("}")) || candidate;
    candidate = candidate.replace(/^json\s*/i, "").trim();
  }

  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed.text === "string" && parsed.text.trim()) {
      return parsed.text.trim();
    }
  } catch (_error) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        const parsed = JSON.parse(candidate.slice(start, end + 1));
        if (parsed && typeof parsed.text === "string" && parsed.text.trim()) {
          return parsed.text.trim();
        }
      } catch (_nestedError) {
        return raw;
      }
    }
  }

  return raw;
}

function playSpeechWithBrowser(text) {
  if (!ALLOW_BROWSER_SPEECH_FALLBACK) {
    runtimeState.speaking = false;
    runtimeState.activeUtterance = null;
    if (!runtimeState.speechQueue.length && !runtimeState.preparedSpeechQueue.length) {
      if (runtimeState.voiceModeActive) {
        resumeContinuousListening();
      } else {
        setRuntimeStatus("idle");
      }
    }
    return;
  }
  if (!runtimeState.speechEnabled || runtimeState.activeUtterance) {
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;

  const preferredVoice = getPreferredVoice();
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  utterance.onstart = () => {
    runtimeState.speaking = true;
    runtimeState.activeUtterance = utterance;
    setRuntimeStatus("speaking");
  };

  utterance.onend = () => {
    if (runtimeState.activeUtterance === utterance) {
      runtimeState.activeUtterance = null;
      runtimeState.speaking = false;
      if (runtimeState.speechQueue.length) {
        pumpSpeechQueue();
      } else {
        if (runtimeState.voiceModeActive) {
          resumeContinuousListening();
        } else {
          setRuntimeStatus("idle");
        }
      }
    }
  };

  utterance.onerror = () => {
    if (runtimeState.activeUtterance === utterance) {
      runtimeState.activeUtterance = null;
      runtimeState.speaking = false;
      runtimeState.speechQueue = [];
      setRuntimeStatus("error", "Speech playback failed.");
    }
  };

  window.speechSynthesis.speak(utterance);
}

function playNextPreparedSpeech() {
  if (runtimeState.activeAudio || runtimeState.activeUtterance || !runtimeState.preparedSpeechQueue.length) {
    return;
  }

  const nextPreparedIndex = runtimeState.preparedSpeechQueue.findIndex(
    (item) => item.sequence === runtimeState.nextPlaybackSequence
  );
  if (nextPreparedIndex === -1) {
    return;
  }

  const [nextPrepared] = runtimeState.preparedSpeechQueue.splice(nextPreparedIndex, 1);
  if (!nextPrepared) {
    return;
  }

  const audio = new Audio(nextPrepared.audioUrl);
  runtimeState.activeAudio = audio;
  runtimeState.activeAudioUrl = nextPrepared.audioUrl;
  runtimeState.speaking = true;
  setRuntimeStatus("speaking");

  audio.addEventListener("ended", () => {
    if (runtimeState.activeAudio === audio) {
      runtimeState.activeAudio = null;
    }
    if (runtimeState.activeAudioUrl === nextPrepared.audioUrl) {
      URL.revokeObjectURL(nextPrepared.audioUrl);
      runtimeState.activeAudioUrl = null;
    }
    runtimeState.speaking = false;
    runtimeState.nextPlaybackSequence += 1;
    playNextPreparedSpeech();
    void pumpSpeechQueue();
    if (
      !runtimeState.activeAudio
      && !runtimeState.activeUtterance
      && runtimeState.speechSynthesisInFlight.size === 0
      && !runtimeState.speechQueue.length
      && !runtimeState.preparedSpeechQueue.length
    ) {
      if (runtimeState.voiceModeActive) {
        resumeContinuousListening();
      } else {
        setRuntimeStatus("idle");
      }
    }
  }, { once: true });

  audio.addEventListener("error", () => {
    if (runtimeState.activeAudio === audio) {
      runtimeState.activeAudio = null;
    }
    if (runtimeState.activeAudioUrl === nextPrepared.audioUrl) {
      URL.revokeObjectURL(nextPrepared.audioUrl);
      runtimeState.activeAudioUrl = null;
    }
    runtimeState.speaking = false;
    runtimeState.nextPlaybackSequence += 1;
    playSpeechWithBrowser(nextPrepared.text);
    void pumpSpeechQueue();
  }, { once: true });

  audio.play().catch(() => {
    if (runtimeState.activeAudio === audio) {
      runtimeState.activeAudio = null;
    }
    if (runtimeState.activeAudioUrl === nextPrepared.audioUrl) {
      URL.revokeObjectURL(nextPrepared.audioUrl);
      runtimeState.activeAudioUrl = null;
    }
    runtimeState.speaking = false;
    runtimeState.nextPlaybackSequence += 1;
    playSpeechWithBrowser(nextPrepared.text);
    void pumpSpeechQueue();
  });
}

async function pumpSpeechQueue() {
  if (
    (!runtimeState.speechEnabled && !window.Audio)
    || !runtimeState.speechQueue.length
    || runtimeState.preparedSpeechQueue.length >= MAX_TTS_PREFETCH
  ) {
    playNextPreparedSpeech();
    return;
  }

  // Allow up to 3 concurrent synthesis requests
  if (runtimeState.speechSynthesisInFlight.size >= 3) {
    playNextPreparedSpeech();
    return;
  }

  const nextItem = runtimeState.speechQueue.shift();
  if (!nextItem) {
    return;
  }

  const requestId = `synthesis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sessionId = runtimeState.speechSessionId;
  runtimeState.speechSynthesisInFlight.add(requestId);

  try {
    const response = await window.browserApi.synthesizeSpeech({
      text: nextItem.text
    });

    if (!response.ok) {
      throw new Error(response.error || "Speech synthesis failed.");
    }

    const mimeType = response.mimeType || "audio/mpeg";
    const audioBytes = new Uint8Array(response.audioBytes || []);
    const audioBlob = new Blob([audioBytes], { type: mimeType });
    const audioUrl = URL.createObjectURL(audioBlob);
    if (sessionId !== runtimeState.speechSessionId) {
      URL.revokeObjectURL(audioUrl);
      return;
    }
    runtimeState.preparedSpeechQueue.push({
      sequence: nextItem.sequence,
      text: nextItem.text,
      audioUrl
    });
    runtimeState.preparedSpeechQueue.sort((left, right) => left.sequence - right.sequence);
    playNextPreparedSpeech();
  } catch (_error) {
    runtimeState.nextPlaybackSequence = Math.max(
      runtimeState.nextPlaybackSequence,
      nextItem.sequence + 1
    );
    playSpeechWithBrowser(nextItem.text);
  } finally {
    runtimeState.speechSynthesisInFlight.delete(requestId);
    playNextPreparedSpeech();
    // Continue pumping if there are more items in queue and capacity
    if (runtimeState.speechQueue.length && runtimeState.preparedSpeechQueue.length < MAX_TTS_PREFETCH) {
      void pumpSpeechQueue();
    }
  }
}

function queueSpeechText(text) {
  const cleaned = sanitizeSpeechText(text);
  if (!cleaned) {
    return;
  }

  runtimeState.speechQueue.push({
    sequence: runtimeState.nextSpeechSequence++,
    text: cleaned
  });
  void pumpSpeechQueue();
}

function flushStreamingSpeechBuffer(force = false) {
  const buffer = runtimeState.streamSpeechBuffer;
  if (!buffer) {
    return;
  }

  const units = [];
  const pattern = /(.+?[.!?](?:\s|$)|.+?\n|.+?(?=:))/g;
  let consumedLength = 0;

  for (const match of buffer.matchAll(pattern)) {
    units.push(match[0]);
    consumedLength += match[0].length;
  }

  if (units.length) {
    for (const unit of units) {
      queueSpeechText(unit);
      runtimeState.streamedSpeechQueued = true;
    }
    runtimeState.streamSpeechBuffer = buffer.slice(consumedLength).trimStart();
  }

  if (force && runtimeState.streamSpeechBuffer.trim()) {
    queueSpeechText(runtimeState.streamSpeechBuffer);
    runtimeState.streamedSpeechQueued = true;
    runtimeState.streamSpeechBuffer = "";
  }
}

async function runAiAction(actionId, payload = {}) {
  const response = await window.browserApi.runAiAction(actionId, payload);
  if (!response.ok) {
    setRuntimeStatus("error", response.error);
    pushMessage("assistant", response.error, { meta: "Error" });
    return;
  }

  const { result } = response;
  let assistantText = "";

  if (result.summary) {
    assistantText = result.summary;
  } else if (Array.isArray(result.items)) {
    assistantText = result.items.length
      ? result.items.map((item) => `${item.type || item.kind || "item"}: ${item.title || item.url}`).join("\n")
      : "No matching items.";
  } else {
    assistantText = JSON.stringify(result, null, 2);
  }

  assistantText = tryExtractAnswerText(assistantText);

  pushMessage("assistant", assistantText);
  runtimeState.lastAssistantText = assistantText;
  setRuntimeStatus("idle");
  queueSpeechText(assistantText);
}

async function askAboutPage(userPrompt) {
  const trimmed = `${userPrompt || ""}`.trim();
  if (!trimmed) {
    setRuntimeStatus("error", "Ask a question first.");
    return;
  }

  if (runtimeState.currentRequestId) {
    await window.browserApi.cancelAiStream(runtimeState.currentRequestId);
    runtimeState.currentRequestId = null;
  }

  stopSpeaking();
  pushMessage("user", trimmed);
  const assistantMessage = pushMessage("assistant", "", { pending: true, meta: "Thinking..." });
  runtimeState.currentAssistantMessageId = assistantMessage.id;
  setRuntimeStatus("answering");

  const response = await window.browserApi.askPageStream({ userPrompt: trimmed });
  if (!response.ok) {
    runtimeState.currentRequestId = null;
    runtimeState.currentAssistantMessageId = null;
    updateMessage(assistantMessage.id, {
      text: response.error,
      pending: false,
      meta: "Error"
    });
    setRuntimeStatus("error", response.error);
    return;
  }

  runtimeState.currentRequestId = response.result.requestId;
}

function stopMediaTracks() {
  if (runtimeState.voiceActivityInterval) {
    clearInterval(runtimeState.voiceActivityInterval);
    runtimeState.voiceActivityInterval = null;
  }

  if (runtimeState.speechProcessorNode) {
    runtimeState.speechProcessorNode.disconnect();
    runtimeState.speechProcessorNode.onaudioprocess = null;
    runtimeState.speechProcessorNode = null;
  }

  if (runtimeState.speechSourceNode) {
    runtimeState.speechSourceNode.disconnect();
    runtimeState.speechSourceNode = null;
  }

  if (runtimeState.wakeProcessorNode) {
    runtimeState.wakeProcessorNode.disconnect();
    runtimeState.wakeProcessorNode.onaudioprocess = null;
    runtimeState.wakeProcessorNode = null;
  }

  if (runtimeState.wakeSourceNode) {
    runtimeState.wakeSourceNode.disconnect();
    runtimeState.wakeSourceNode = null;
  }

  if (runtimeState.audioContext) {
    runtimeState.audioContext.close().catch(() => {});
    runtimeState.audioContext = null;
  }

  runtimeState.analyserNode = null;
  runtimeState.analyserData = null;

  if (runtimeState.mediaStream) {
    for (const track of runtimeState.mediaStream.getTracks()) {
      track.stop();
    }
  }
  runtimeState.mediaStream = null;
  runtimeState.wakeChunkBuffer = [];
  runtimeState.wakeChunkQueue = [];
  runtimeState.wakeDetectInFlight = false;
  runtimeState.wakeChunksSent = 0;
}

function stopWakeRecognition() {
  runtimeState.wakeRecognitionShouldRestart = false;
  const recognition = runtimeState.wakeRecognition;
  runtimeState.wakeRecognition = null;
  if (!recognition) {
    return;
  }

  recognition.onstart = null;
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;

  try {
    recognition.stop();
  } catch (_error) {
    // Ignore if already stopped.
  }
}

function resetWakeSession() {
  runtimeState.wakeSessionId = createId("wake");
  runtimeState.wakeChunkBuffer = [];
  runtimeState.wakeChunkQueue = [];
  runtimeState.wakeDetectInFlight = false;
  runtimeState.wakeChunksSent = 0;
}

async function stopRawWakeDetection({ resetRemote = true } = {}) {
  if (runtimeState.wakeProcessorNode) {
    runtimeState.wakeProcessorNode.disconnect();
    runtimeState.wakeProcessorNode.onaudioprocess = null;
    runtimeState.wakeProcessorNode = null;
  }

  if (runtimeState.wakeSourceNode) {
    runtimeState.wakeSourceNode.disconnect();
    runtimeState.wakeSourceNode = null;
  }

  runtimeState.wakeChunkBuffer = [];
  runtimeState.wakeChunkQueue = [];
  runtimeState.wakeDetectInFlight = false;

  if (resetRemote && runtimeState.rawWakeSupported) {
    try {
      await window.browserApi.wakeDetectAudio({
        sessionId: runtimeState.wakeSessionId,
        reset: true
      });
    } catch (_error) {
      // Ignore cleanup failures.
    }
  }

  resetWakeSession();
}

function downsampleToWakeRate(float32Samples, sourceRate) {
  if (sourceRate === WAKE_SAMPLE_RATE) {
    return new Float32Array(float32Samples);
  }

  const ratio = sourceRate / WAKE_SAMPLE_RATE;
  const nextLength = Math.max(1, Math.round(float32Samples.length / ratio));
  const result = new Float32Array(nextLength);

  let offsetResult = 0;
  let offsetSource = 0;

  while (offsetResult < result.length) {
    const nextOffsetSource = Math.min(float32Samples.length, Math.round((offsetResult + 1) * ratio));
    let sum = 0;
    let count = 0;

    for (let i = offsetSource; i < nextOffsetSource; i += 1) {
      sum += float32Samples[i];
      count += 1;
    }

    result[offsetResult] = count ? sum / count : float32Samples[offsetSource] || 0;
    offsetResult += 1;
    offsetSource = nextOffsetSource;
  }

  return result;
}

function floatTo16BitPcm(samples) {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  return pcm;
}

async function sendWakeChunk(int16Chunk) {
  if (!runtimeState.rawWakeSupported) {
    setDebugWakeState(supportsWakeRecognition() ? "browser only" : "wake unsupported");
    return;
  }

  runtimeState.wakeDetectInFlight = true;
  runtimeState.wakeChunksSent += 1;
  try {
    const response = await window.browserApi.wakeDetectAudio({
      sessionId: runtimeState.wakeSessionId,
      audioBytes: new Uint8Array(int16Chunk.buffer.slice(0)),
      sampleRate: WAKE_SAMPLE_RATE,
      reset: false
    });

    if (!response.ok) {
      if (response.statusCode === 404) {
        runtimeState.rawWakeSupported = false;
        runtimeState.wakeChunkQueue = [];
        setDebugWakeState(supportsWakeRecognition() ? "browser only" : "wake unsupported");
        await stopRawWakeDetection({ resetRemote: false });
        return;
      }
      setDebugWakeState(`wake error`);
      throw new Error(response.error);
    }

    const result = response.result || {};
    if (result.supported === false) {
      setDebugWakeState("wake unsupported");
      return;
    }

    const wakeScore = Number(result.score || 0);
    setDebugWakeState(`raw ${wakeScore.toFixed(2)} #${runtimeState.wakeChunksSent}`);
    if (result.detected || wakeScore >= LOCAL_WAKE_SCORE_THRESHOLD) {
      setDebugWakeState(`matched: ${result.model || "wake"}`);
      await activateVoiceConversation("");
    }
  } finally {
    runtimeState.wakeDetectInFlight = false;
    if (runtimeState.rawWakeSupported && runtimeState.wakeChunkQueue.length && !runtimeState.voiceConversationAwake) {
      const queued = runtimeState.wakeChunkQueue.shift();
      void sendWakeChunk(queued).catch((error) => {
        console.error("[WakeDetection] Queued chunk error:", error.message);
        setDebugWakeState("wake retrying");
      });
    }
  }
}

function enqueueWakeChunk(int16Chunk) {
  if (!runtimeState.rawWakeSupported) {
    return;
  }

  if (runtimeState.wakeChunkQueue.length >= MAX_WAKE_SEND_QUEUE) {
    runtimeState.wakeChunkQueue.shift();
  }
  runtimeState.wakeChunkQueue.push(int16Chunk);
}

function flushWakeChunkQueue() {
  if (!runtimeState.rawWakeSupported || !runtimeState.voiceModeActive || runtimeState.voiceConversationAwake) {
    return;
  }

  while (runtimeState.wakeChunkBuffer.length >= WAKE_CHUNK_SAMPLES) {
    const chunk = runtimeState.wakeChunkBuffer.slice(0, WAKE_CHUNK_SAMPLES);
    const consumeCount = Math.max(1, WAKE_CHUNK_SAMPLES - WAKE_CHUNK_OVERLAP_SAMPLES);
    runtimeState.wakeChunkBuffer.splice(0, consumeCount);
    const int16Chunk = Int16Array.from(chunk);
    if (runtimeState.wakeDetectInFlight) {
      enqueueWakeChunk(int16Chunk);
      return;
    }

    void sendWakeChunk(int16Chunk).catch((error) => {
      console.error("[WakeDetection] Error:", error.message);
      setDebugWakeState("wake retrying");
    });
  }
}

function startRawWakeDetection(stream) {
  if (!runtimeState.rawWakeSupported) {
    setDebugWakeState(supportsWakeRecognition() ? "browser only" : "wake unsupported");
    return;
  }

  if (!runtimeState.audioContext) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("AudioContext is not available for raw wake detection.");
    }
    runtimeState.audioContext = new AudioContextCtor();
  }

  if (runtimeState.audioContext.state === "suspended") {
    runtimeState.audioContext.resume().catch((error) => {
      console.error("[WakeDetection] Failed to resume audio context:", error.message);
      setDebugWakeState("audio blocked");
    });
  }

  const source = runtimeState.audioContext.createMediaStreamSource(stream);
  const processor = runtimeState.audioContext.createScriptProcessor(4096, 1, 1);

  runtimeState.wakeSourceNode = source;
  runtimeState.wakeProcessorNode = processor;
  runtimeState.wakeChunkBuffer = [];
  runtimeState.wakeChunkQueue = [];
  runtimeState.wakeDetectInFlight = false;
  runtimeState.wakeChunksSent = 0;

  processor.onaudioprocess = (event) => {
    if (!runtimeState.voiceModeActive || runtimeState.voiceConversationAwake) {
      return;
    }

    const inputChannel = event.inputBuffer.getChannelData(0);
    const downsampled = downsampleToWakeRate(inputChannel, event.inputBuffer.sampleRate);
    const pcm = floatTo16BitPcm(downsampled);
    runtimeState.wakeChunkBuffer.push(...pcm);
    flushWakeChunkQueue();
  };

  source.connect(processor);
  processor.connect(runtimeState.audioContext.destination);
}

async function activateVoiceConversation(promptFromWake = "", options = {}) {
  const { announce = true } = options;
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Voice input is not supported in this environment.");
  }

  stopWakeRecognition();
  await stopRawWakeDetection({ resetRemote: false });
  stopSpeaking();

  let stream = runtimeState.mediaStream;
  if (!stream) {
    console.log("[Voice] Requesting microphone access...");
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("[Voice] Microphone granted! Stream tracks:", stream.getTracks().length);
    stream.getTracks().forEach((track, i) => {
      console.log(`[Voice] Track ${i}: kind=${track.kind}, enabled=${track.enabled}, state=${track.readyState}, label=${track.label}`);
    });
    runtimeState.mediaStream = stream;
    startVoiceActivityDetection(stream);
  }

  runtimeState.voiceConversationAwake = true;
  setDebugWakeState("awake");
  setDebugSttState("idle");
  runtimeState.audioChunks = [];
  runtimeState.pcmCaptureBuffer = [];
  runtimeState.lastAudioTime = Date.now();

  if (promptFromWake) {
    aiPageQuestionInput.value = promptFromWake;
    setRuntimeStatus("answering");
    await askAboutPage(promptFromWake);
    return;
  }

  startRecorderForCurrentStream();

  if (announce) {
    pushMessage("assistant", "I'm listening.", { meta: formatTime() });
    queueSpeechText("I'm listening.");
  }
  setRuntimeStatus("listening");
  resetSilenceTimer();
}

function startWakeRecognition() {
  if (!supportsWakeRecognition()) {
    return false;
  }

  stopWakeRecognition();
  runtimeState.wakeRecognitionShouldRestart = true;

  const recognition = new WAKE_RECOGNITION_CTOR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    runtimeState.wakeRecognition = recognition;
    setDebugWakeState("engine: browser");
    setDebugSttState("idle");
    setRuntimeStatus("resting", "Waiting for 'Hey Nexa' before active capture");
  };

  recognition.onresult = (event) => {
    let combinedTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      combinedTranscript += ` ${event.results[i][0]?.transcript || ""}`;
    }

    const transcript = combinedTranscript.trim();
    if (!transcript) {
      return;
    }

    const wakeMatch = extractWakeMatch(transcript);
    if (!wakeMatch) {
      return;
    }

    runtimeState.voiceConversationAwake = true;
    setDebugWakeState(`matched: ${wakeMatch.matched}`);
    void activateVoiceConversation(wakeMatch.prompt || "");
  };

  recognition.onerror = (event) => {
    console.error("[WakeRecognition] Error:", event.error);
    if (event.error === "no-speech" || event.error === "aborted") {
      setDebugWakeState("engine: browser");
      return;
    }

    setDebugWakeState(`error: ${event.error}`);
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      runtimeState.wakeRecognitionShouldRestart = false;
      setRuntimeStatus("error", "Wake-word microphone access was denied.");
    }
  };

  recognition.onend = () => {
    runtimeState.wakeRecognition = null;
    if (
      runtimeState.wakeRecognitionShouldRestart
      && runtimeState.voiceModeActive
      && !runtimeState.voiceConversationAwake
      && !runtimeState.isClosing
    ) {
      setTimeout(() => {
        if (
          runtimeState.wakeRecognitionShouldRestart
          && runtimeState.voiceModeActive
          && !runtimeState.voiceConversationAwake
        ) {
          startWakeRecognition();
        }
      }, 150);
    }
  };

  recognition.start();
  return true;
}

async function stopVoiceCapture({ keepStream = false } = {}) {
  // Clear silence detection timer
  if (runtimeState.silenceTimeout) {
    clearInterval(runtimeState.silenceTimeout);
    runtimeState.silenceTimeout = null;
  }

  const processor = runtimeState.speechProcessorNode;
  const source = runtimeState.speechSourceNode;
  const samples = Int16Array.from(runtimeState.pcmCaptureBuffer || []);

  if (processor) {
    processor.disconnect();
    processor.onaudioprocess = null;
    runtimeState.speechProcessorNode = null;
  }
  if (source) {
    source.disconnect();
    runtimeState.speechSourceNode = null;
  }

  runtimeState.mediaRecorder = null;
  runtimeState.pcmCaptureBuffer = [];
  runtimeState.audioChunks = [];

  if (!keepStream) {
    stopWakeRecognition();
    runtimeState.voiceModeActive = false;
    runtimeState.voiceConversationAwake = false;
    setDebugWakeState("waiting");
    stopMediaTracks();
  }

  if (!samples.length) {
    return null;
  }

  return encodeWavFromInt16(samples, WAKE_SAMPLE_RATE);
}

async function startVoiceCapture() {
  console.log("[Voice] Starting voice capture...");
  stopSpeaking();

  try {
    runtimeState.voiceModeActive = true;
    runtimeState.voiceConversationAwake = false;
    setDebugWakeState("waiting");
    setDebugSttState("idle");
    runtimeState.audioChunks = [];
    runtimeState.lastAudioTime = null;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Voice input is not supported in this environment.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, noiseSuppression: true, echoCancellation: true } });
    runtimeState.mediaStream = stream;
    startVoiceActivityDetection(stream);
    resetWakeSession();
    startRawWakeDetection(stream);
    startWakeRecognition();
    setRuntimeStatus("resting", "Wake-only mode. Say 'Nexa' or 'Hey Nexa' to start capture.");
    setDebugWakeState(getWakeArmedLabel());
  } catch (error) {
    console.error("[Voice] Fatal error:", error.message, error.name);
    throw error;
  }
}

function resetSilenceTimer() {
  if (runtimeState.silenceTimeout) {
    clearInterval(runtimeState.silenceTimeout);
  }

  runtimeState.lastAudioTime = Date.now();
  updateDebugStrip();
  console.log("[SilenceDetection] Timer reset. Will process speech or return to resting after 4 seconds of silence.");

  // Use polling instead of one-time timer
  // Check every 500ms if 4+ seconds have passed since last audio
  runtimeState.silenceTimeout = setInterval(async () => {
    const timeSinceLastAudio = Date.now() - runtimeState.lastAudioTime;
    updateDebugStrip();
    console.log("[SilenceDetection] Check - Time since audio:", timeSinceLastAudio, "ms, Status:", runtimeState.status);
    
    // If 4+ seconds of silence detected
    if (timeSinceLastAudio >= 4000 && isVoiceCaptureActiveStatus()) {
      console.log("[SilenceDetection] ===== 4 SECONDS OF SILENCE DETECTED =====");
      console.log("[SilenceDetection] Evaluating captured speech.");
      
      // Stop the polling timer
      if (runtimeState.silenceTimeout) {
        clearInterval(runtimeState.silenceTimeout);
        runtimeState.silenceTimeout = null;
      }
      
      try {
        const speechDetected = runtimeState.speechDetectedDuringCapture;
        const blob = await stopVoiceCapture({ keepStream: true });
        runtimeState.speechDetectedDuringCapture = false;

        if (!speechDetected || !blob || blob.size === 0) {
          runtimeState.voiceConversationAwake = false;
          runtimeState.currentRequestId = null;
          runtimeState.currentAssistantMessageId = null;
          runtimeState.audioChunks = [];
          runtimeState.pcmCaptureBuffer = [];
          setDebugWakeState("waiting");
          setDebugSttState("idle");
          resumeContinuousListening();
          return;
        }

        setRuntimeStatus("transcribing");
        setDebugSttState("transcribing");
        const transcript = await transcribeVoiceBlob(blob);

        if (!transcript || transcript.trim().length === 0) {
          runtimeState.voiceConversationAwake = false;
          runtimeState.audioChunks = [];
          runtimeState.pcmCaptureBuffer = [];
          setDebugWakeState("waiting");
          setDebugSttState("idle");
          resumeContinuousListening();
          return;
        }

        await handleVoiceTranscript(transcript);
      } catch (error) {
        console.error("[SilenceDetection] Error:", error.message);
        setDebugSttState("error");
        setRuntimeStatus("error", error.message);
        if (runtimeState.silenceTimeout) {
          clearInterval(runtimeState.silenceTimeout);
          runtimeState.silenceTimeout = null;
        }
      }
    }
  }, 500); // Check every 500ms
}

function startSilenceDetection() {
  resetSilenceTimer();
}

function startVoiceActivityDetection(stream) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return;
  }

  const audioContext = runtimeState.audioContext || new AudioContextCtor();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.15;

  const data = new Uint8Array(analyser.fftSize);
  source.connect(analyser);

  runtimeState.audioContext = audioContext;
  runtimeState.analyserNode = analyser;
  runtimeState.analyserData = data;

  const speechThreshold = 6;
  runtimeState.voiceActivityInterval = setInterval(() => {
    if (!runtimeState.voiceModeActive || !isVoiceCaptureActiveStatus() || !runtimeState.analyserNode) {
      return;
    }

    runtimeState.analyserNode.getByteTimeDomainData(runtimeState.analyserData);

    let sumSquares = 0;
    for (const sample of runtimeState.analyserData) {
      const centered = sample - 128;
      sumSquares += centered * centered;
    }

    const rms = Math.sqrt(sumSquares / runtimeState.analyserData.length);
    if (rms > speechThreshold) {
      runtimeState.lastAudioTime = Date.now();
      if (runtimeState.status === "listening") {
        runtimeState.speechDetectedDuringCapture = true;
      }
      updateDebugStrip();
    }
  }, 100);
}

async function transcribeVoiceBlob(blob) {
  setDebugSttState("uploading");
  const arrayBuffer = await blob.arrayBuffer();
  const isWav = (blob.type || "").includes("wav");
  const response = await window.browserApi.transcribeAudio({
    audioBytes: new Uint8Array(arrayBuffer),
    mimeType: blob.type || (isWav ? "audio/wav" : "audio/webm"),
    fileName: isWav ? "voice-question.wav" : "voice-question.webm"
  });
  if (!response.ok) {
    if (response.statusCode === 422) {
      setDebugSttState("empty");
      return "";
    }
    setDebugSttState("error");
    throw new Error(response.error);
  }

  const transcript = `${response.text || ""}`.trim();
  if (!transcript) {
    setDebugSttState("empty");
    throw new Error("I could not hear a clear question. Try again.");
  }

  setDebugSttState("done");
  return transcript;
}

async function handleVoiceTranscript(transcript) {
  const trimmed = `${transcript || ""}`.trim();
  if (!trimmed) {
    return false;
  }

  if (isCloseCommand(trimmed)) {
    pushMessage("user", trimmed);
    pushMessage("assistant", "Voice mode ended.", { meta: formatTime() });
    await endVoiceMode("Voice mode ended");
    return true;
  }

  let promptToSend = trimmed;
  const wakePrompt = getWakePrompt(trimmed);
  const wakeMatch = extractWakeMatch(trimmed);

  if (!runtimeState.voiceConversationAwake) {
    if (wakePrompt === null) {
      setDebugWakeState("waiting");
      setRuntimeStatus("resting", "Say 'Hey Nexa' to wake me.");
      resetSilenceTimer();
      return true;
    }

    runtimeState.voiceConversationAwake = true;
    setDebugWakeState(`matched: ${wakeMatch?.matched || "nexa"}`);
    if (!wakePrompt) {
      pushMessage("assistant", "I'm listening.", { meta: formatTime() });
      queueSpeechText("I'm listening.");
      resumeContinuousListening();
      return true;
    }

    promptToSend = wakePrompt;
  } else if (wakePrompt !== null && wakePrompt) {
    setDebugWakeState(`matched: ${wakeMatch?.matched || "nexa"}`);
    promptToSend = wakePrompt;
  } else {
    setDebugWakeState("awake");
  }

  aiPageQuestionInput.value = promptToSend;
  await askAboutPage(promptToSend);
  return true;
}

async function handleVoiceToggle() {
  try {
    console.log("[VoiceToggle] Clicked. Current status:", runtimeState.status);

    if (runtimeState.voiceModeActive) {
      console.log("[VoiceToggle] Stopping continuous voice mode...");
      await endVoiceMode("Voice mode stopped");
      return;
    }

    console.log("[VoiceToggle] Starting voice capture...");
    await startVoiceCapture();
    console.log("[VoiceToggle] Voice capture started successfully");
  } catch (error) {
    console.error("[VoiceToggle] Error:", error.message, error);
    // Clear silence timer on error
    if (runtimeState.silenceTimeout) {
      clearInterval(runtimeState.silenceTimeout);
      runtimeState.silenceTimeout = null;
    }
    runtimeState.voiceModeActive = false;
    runtimeState.mediaRecorder = null;
    runtimeState.audioChunks = [];
    setDebugWakeState("waiting");
    setDebugSttState("error");
    await stopRawWakeDetection();
    stopMediaTracks();
    runtimeState.currentRequestId = null;
    runtimeState.currentAssistantMessageId = null;
    setRuntimeStatus("error", error.message);
    pushMessage("assistant", error.message, { meta: "Voice error" });
  }
}

function handleAiStreamEvent(payload) {
  if (!payload || !payload.requestId) {
    return;
  }

  if (runtimeState.currentRequestId !== payload.requestId) {
    return;
  }

  const messageId = runtimeState.currentAssistantMessageId;

  switch (payload.status) {
    case "started":
      setRuntimeStatus("answering", "Generating response...");
      // Reset speech buffers for fresh stream
      runtimeState.streamSpeechBuffer = "";
      runtimeState.streamedSpeechQueued = false;
      runtimeState.speechQueue = [];
      runtimeState.preparedSpeechQueue = [];
      break;
    case "delta": {
      const existing = runtimeState.messages.find((item) => item.id === messageId);
      runtimeState.streamSpeechBuffer += payload.chunk || "";
      // Flush sentences immediately for real-time speech
      flushStreamingSpeechBuffer(false);
      // Start pumping speech queue to synthesize in real-time
      void pumpSpeechQueue();
      updateMessage(messageId, {
        text: `${existing?.text || ""}${payload.chunk || ""}`,
        pending: false,
        meta: "Nexa is responding"
      });
      break;
    }
    case "done": {
      const finalMessage = runtimeState.messages.find((item) => item.id === messageId);
      const normalizedText = tryExtractAnswerText(finalMessage?.text || "");
      runtimeState.lastAssistantText = normalizedText;
      runtimeState.currentRequestId = null;
      runtimeState.currentAssistantMessageId = null;
      updateMessage(messageId, {
        text: normalizedText,
        pending: false,
        meta: formatTime()
      });
      if (runtimeState.lastAssistantText) {
        flushStreamingSpeechBuffer(true);
        if (
          !runtimeState.speechQueue.length
          && !runtimeState.preparedSpeechQueue.length
          && !runtimeState.activeUtterance
          && !runtimeState.activeAudio
          && !runtimeState.streamedSpeechQueued
        ) {
          queueSpeechText(runtimeState.lastAssistantText);
        }
        if (
          !runtimeState.activeAudio
          && !runtimeState.activeUtterance
          && runtimeState.speechSynthesisInFlight.size === 0
          && !runtimeState.speechQueue.length
          && !runtimeState.preparedSpeechQueue.length
        ) {
          resumeContinuousListening();
        }
      } else {
        if (runtimeState.voiceModeActive) {
          resumeContinuousListening();
        } else {
          setRuntimeStatus("idle");
        }
      }
      break;
    }
    case "cancelled":
      runtimeState.currentRequestId = null;
      runtimeState.currentAssistantMessageId = null;
      updateMessage(messageId, { pending: false, meta: "Cancelled" });
      if (runtimeState.voiceModeActive) {
        resumeContinuousListening();
      } else {
        setRuntimeStatus("idle", "Answer cancelled");
      }
      break;
    case "error":
      runtimeState.currentRequestId = null;
      runtimeState.currentAssistantMessageId = null;
      updateMessage(messageId, {
        text: payload.error || "Page Q&A failed.",
        pending: false,
        meta: "Error"
      });
      if (runtimeState.voiceModeActive) {
        setRuntimeStatus("error", payload.error || "Page Q&A failed.");
      } else {
        setRuntimeStatus("error", payload.error || "Page Q&A failed.");
      }
      break;
    default:
      break;
  }
}

async function cleanupRuntime() {
  runtimeState.isClosing = true;
  stopWakeRecognition();
  await stopRawWakeDetection();
  stopSpeaking();
  if (runtimeState.currentRequestId) {
    await window.browserApi.cancelAiStream(runtimeState.currentRequestId);
    runtimeState.currentRequestId = null;
  }
  if (runtimeState.voiceModeActive || runtimeState.status === "listening" || runtimeState.status === "resting") {
    await stopVoiceCapture();
  } else {
    stopMediaTracks();
  }
}

function applyState(state) {
  currentState = state;
  renderAiPermissions();
  renderAiActivity();
  renderContextCard();
}

function focusAskInput() {
  aiPageQuestionInput.focus();
}

function setPromptAndAsk(prompt) {
  aiPageQuestionInput.value = prompt;
  return askAboutPage(prompt);
}

closeAiButton.addEventListener("click", async () => {
  await cleanupRuntime();
  window.browserApi.closeAiOverlay();
});

// Quick actions (Chat)
aiQuickSummarize?.addEventListener("click", async () => {
  pushMessage("user", "Summarize this page");
  await runAiAction("summarize_page");
});

aiQuickResearch?.addEventListener("click", async () => {

  await setPromptAndAsk(
    "Research this page: key insights, strategic takeaways, and the next best actions."
  );
});

aiQuickExplain?.addEventListener("click", async () => {

  await setPromptAndAsk(
    "Explain this page like I’m an operator: what matters, what to do next, and what could go wrong."
  );
});

aiQuickAutomate?.addEventListener("click", async () => {

  await brainSubmit("Automate: open relevant pages, read key content, and produce an operator-style timeline.");
});

aiPageQuestionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await askAboutPage(aiPageQuestionInput.value);
});

aiVoiceToggleButton.addEventListener("click", handleVoiceToggle);
aiInlineVoiceButton.addEventListener("click", handleVoiceToggle);
aiStopSpeechButton.addEventListener("click", stopSpeaking);

// Ask main browser to show its left-side agent timeline panel when opening voice/agent/brain.
// The actual timeline rendering is handled by the existing workflow sidebar component.
function requestAgentPanelOpen() {
  // Ensure main-process left sidebar is visible.
  // This function is expected to exist from `src/renderer/index.html`.
  if (typeof window.__nexa_showAgentSidebar === 'function') {
    try { window.__nexa_showAgentSidebar(); } catch (e) {}
  }
  // Fallback: try to call workflow UI manager directly.
  if (window.workflowUIManager?.sidebar?.show) {
    try { window.workflowUIManager.sidebar.show(); } catch (e) {}
  }
  // Fallback: unhide DOM container.
  const el = document.getElementById('workflow-sidebar');
  if (el) el.classList.remove('hidden');

  try {
    if (window.__nexa_showAgentSidebar) window.__nexa_showAgentSidebar();
  } catch (e) {
    // ignore
  }
}



window.browserApi.onState((state) => {
  applyState(state);
});
window.browserApi.onAiStreamEvent(handleAiStreamEvent);

window.addEventListener("beforeunload", () => {
  cleanupRuntime();
});

if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {};
}

// ===========================================================================
// Nexa Brain UI
// ----------------------------------------------------------------------------
// Two tabs (Ask / Brain). The Brain tab accepts free-form goals, dispatches
// them to the main-process NexaBrain via `window.browserApi.askGoal`, and
// reacts to the `brain:event` stream:
//   - brain:reasoning            -> "Nexa is thinking..." status
//   - brain:planned              -> shows the planned steps
//   - brain:clarification-required -> opens ClarificationDialog
//   - brain:permission-required  -> opens PermissionDialog
//   - workflow:* (via main)      -> updates the Brain's run progress card
//   - brain:completed            -> shows the final answer card
//   - brain:failed               -> shows an error card
// ===========================================================================

const brainState = {
  activeRunId: null,
  runs: new Map(),         // runId -> serialized run
  pendingClarification: null,
  pendingPermission: null
};

function switchTab(name) {
  // If user goes into Agent/Brain/Voice modes, surface the browser-level agent timeline.
  if (name === "brain") requestAgentPanelOpen();
  const tabs = { conversation: aiTabConversation, brain: aiTabBrain };

  const views = { conversation: aiViewConversation, brain: aiViewBrain };
  for (const [key, btn] of Object.entries(tabs)) {
    const isActive = key === name;
    btn.classList.toggle("ai-workspace__tab--active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  }
  for (const [key, view] of Object.entries(views)) {
    view.classList.toggle("ai-workspace__view--active", key === name);
  }
}

aiTabConversation?.addEventListener("click", () => switchTab("conversation"));
aiTabBrain?.addEventListener("click", () => switchTab("brain"));

// If the new layout includes Agent/Voice tabs, wire them to also open the left agent panel.
const aiTabAgent = document.getElementById('ai-tab-agent');
const aiTabVoice = document.getElementById('ai-tab-voice');
aiTabAgent?.addEventListener('click', () => {
  switchTab('conversation');
  requestAgentPanelOpen();
});
aiTabVoice?.addEventListener('click', () => {
  switchTab('conversation');
  requestAgentPanelOpen();
});
// NOTE: The Conversation tab is still where Q&A and voice input live in current backend.



function escapeHtml(value) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function brainAppendMessage({ role, title, body, meta, pending }) {
  if (!aiBrainThread) return;
  // Always keep a single intro at the top
  const intro = aiBrainThread.querySelector(".ai-workspace__brain-empty");
  const row = document.createElement("article");
  row.className = `ai-brain-row ai-brain-row--${role}`;
  const titleEl = document.createElement("div");
  titleEl.className = "ai-brain-row__title";
  titleEl.textContent = title || (role === "user" ? "You" : "Nexa");
  const bodyEl = document.createElement("div");
  bodyEl.className = "ai-brain-row__body";
  bodyEl.textContent = body || "";
  if (pending) bodyEl.classList.add("ai-brain-row__body--pending");
  row.appendChild(titleEl);
  row.appendChild(bodyEl);
  if (meta) {
    const metaEl = document.createElement("div");
    metaEl.className = "ai-brain-row__meta";
    metaEl.textContent = meta;
    row.appendChild(metaEl);
  }
  // Insert after the intro, before the run-cards
  if (intro) {
    intro.insertAdjacentElement("afterend", row);
  } else {
    aiBrainThread.appendChild(row);
  }
  aiBrainThread.scrollTop = aiBrainThread.scrollHeight;
  return row;
}

function brainSetStatus(text) {
  if (!aiBrainThread) return;
  let bar = aiBrainThread.querySelector(".ai-brain-status");
  if (text) {
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "ai-brain-status";
      aiBrainThread.appendChild(bar);
    }
    bar.textContent = text;
  } else if (bar) {
    bar.remove();
  }
}

function renderBrainRunCard(run) {
  if (!aiBrainThread) return;
  let card = aiBrainThread.querySelector(`[data-run-card="${run.id}"]`);
  if (!card) {
    card = document.createElement("article");
    card.className = "ai-brain-run";
    card.dataset.runCard = run.id;
    aiBrainThread.appendChild(card);
  }
  const status = run.status || "planning";
  const plan = run.plan;
  const steps = plan?.steps || [];
  const completed = steps.filter((s) => s.completed).length;
  const progressPct = steps.length > 0 ? Math.round((completed / steps.length) * 100) : 0;

  const statusLabel = ({
    planning: "Planning",
    awaiting_clarification: "Asking you a question",
    awaiting_permission: "Asking for permission",
    running: "Running",
    completed: "Done",
    failed: "Failed",
    cancelled: "Cancelled"
  })[status] || status;

  const stepsHtml = steps.map((s) => {
    const cls = s.completed ? "completed" : s.failed ? "failed" : s.executing ? "executing" : "pending";
    return `
      <li class="ai-brain-step ai-brain-step--${cls}">
        <span class="ai-brain-step__bullet"></span>
        <span class="ai-brain-step__label">${escapeHtml(s.label || s.type || s.action_type || "step")}</span>
        ${s.note ? `<span class="ai-brain-step__note">${escapeHtml(s.note)}</span>` : ""}
      </li>
    `;
  }).join("");

  const risk = plan?.riskAssessment;
  const riskHtml = risk ? `<span class="ai-brain-run__risk" data-risk="${escapeHtml(risk.overall)}">Risk: ${escapeHtml(risk.overall)}</span>` : "";

  const reasoning = plan?.reasoning ? `<div class="ai-brain-run__reasoning">${escapeHtml(plan.reasoning)}</div>` : "";

  card.innerHTML = `
    <header class="ai-brain-run__head">
      <div class="ai-brain-run__title">${escapeHtml(plan?.intent ? plan.intent : "Brain run")} <span class="ai-brain-run__id">${escapeHtml(run.id)}</span></div>
      <div class="ai-brain-run__status" data-status="${escapeHtml(status)}">${escapeHtml(statusLabel)}</div>
    </header>
    ${reasoning}
    <div class="ai-brain-run__progress">
      <div class="ai-brain-run__progress-bar"><div class="ai-brain-run__progress-fill" style="width:${progressPct}%"></div></div>
      <span class="ai-brain-run__progress-text">${completed}/${steps.length} steps</span>
      ${riskHtml}
    </div>
    ${steps.length > 0 ? `<ol class="ai-brain-run__steps">${stepsHtml}</ol>` : ""}
    ${run.error ? `<div class="ai-brain-run__error">${escapeHtml(run.error)}</div>` : ""}
    ${run.result?.final ? `<div class="ai-brain-run__final">${escapeHtml(JSON.stringify(run.result.final))}</div>` : ""}
  `;
}

function renderBrainRunsList() {
  if (!aiBrainRuns) return;
  const list = Array.from(brainState.runs.values())
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 10);
  aiBrainRuns.replaceChildren();
  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.className = "ai-brain-run-empty";
    empty.textContent = "No runs yet.";
    aiBrainRuns.appendChild(empty);
    return;
  }
  for (const r of list) {
    const item = document.createElement("button");
    item.className = "ai-brain-run-item";
    item.type = "button";
    const status = r.status || "planning";
    item.dataset.status = status;
    const when = r.createdAt ? new Date(r.createdAt).toLocaleTimeString() : "";
    item.innerHTML = `
      <div class="ai-brain-run-item__goal">${escapeHtml(r.goal)}</div>
      <div class="ai-brain-run-item__meta">${escapeHtml(status)} · ${escapeHtml(when)}</div>
    `;
    item.addEventListener("click", () => {
      switchTab("brain");
      brainState.activeRunId = r.id;
      const hydrated = brainState.runs.get(r.id);
      if (hydrated) renderBrainRunCard(hydrated);
    });
    aiBrainRuns.appendChild(item);
  }
}

async function brainSubmit(goalText) {
  const trimmed = `${goalText || ""}`.trim();
  if (!trimmed) return;
  if (!window.browserApi?.askGoal) {
    brainAppendMessage({ role: "assistant", title: "Nexa", body: "Brain is not ready yet. Reload the popup." });
    return;
  }
  brainAppendMessage({ role: "user", title: "You", body: trimmed, meta: "Goal" });
  aiBrainInput.value = "";
  brainSetStatus("Nexa is thinking…");

  const context = {
    currentUrl: currentState?.activeTab?.url || "",
    currentTitle: currentState?.activeTab?.title || "",
    openTabs: Array.isArray(currentState?.tabs) ? currentState.tabs.map((t) => ({ title: t.title, url: t.url })) : []
  };

  let response;
  try {
    response = await window.browserApi.askGoal(trimmed, context);
  } catch (e) {
    brainSetStatus(null);
    brainAppendMessage({ role: "assistant", title: "Nexa", body: `Brain failed to start: ${e.message}` });
    return;
  }
  if (!response?.ok) {
    brainSetStatus(null);
    brainAppendMessage({ role: "assistant", title: "Nexa", body: response?.error || "Unknown error starting brain run." });
    return;
  }
  const runId = response.runId;
  brainState.activeRunId = runId;
  // Optimistic placeholder
  brainState.runs.set(runId, { id: runId, goal: trimmed, status: response.status, plan: null, createdAt: Date.now() });
  renderBrainRunCard(brainState.runs.get(runId));

  // If the run is already done, render the result immediately.
  if (response.status === "completed" || response.status === "failed" || response.status === "cancelled") {
    brainSetStatus(null);
    return;
  }
}

aiBrainForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await brainSubmit(aiBrainInput.value);
});

// ---- Brain event handler ----

async function handleBrainEvent(payload) {
  if (!payload) return;
  const runId = payload.runId || payload.workflowId;
  if (!runId) return;

  // Make sure the active run is tracked. The Brain may not have published
  // the run record yet (e.g. for permission-required before planning).
  if (!brainState.runs.has(runId)) {
    brainState.runs.set(runId, { id: runId, goal: payload.goal || "Active run", status: "planning", plan: null, createdAt: Date.now() });
  }
  const run = brainState.runs.get(runId);

  switch (payload.event) {
    case "brain:reasoning":
      run.intent = payload.intent || run.intent;
      brainSetStatus(payload.reasoning || "Nexa is thinking…");
      renderBrainRunsList();
      break;

    case "brain:planned":
      run.plan = payload.plan;
      run.status = "awaiting_permission"; // assumed; will flip if running
      run.requiredPermissions = payload.plan?.permissionsRequired || [];
      // Mark each step as pending
      (payload.plan?.steps || []).forEach((s) => { s.completed = false; s.executing = false; s.failed = false; });
      brainSetStatus(null);
      renderBrainRunCard(run);
      renderBrainRunsList();
      break;

    case "brain:clarification-required":
      run.status = "awaiting_clarification";
      run.clarifications = payload.questions || [];
      brainSetStatus(null);
      renderBrainRunCard(run);
      await openClarificationForRun(runId, run.clarifications);
      break;

    case "brain:permission-required":
      run.status = "awaiting_permission";
      run.requiredPermissions = payload.missing || run.requiredPermissions;
      brainSetStatus(null);
      renderBrainRunCard(run);
      await openPermissionForRun(runId, run.plan, run.requiredPermissions, payload.risk);
      break;

    case "brain:completed":
      run.status = "completed";
      run.result = payload.result;
      brainSetStatus(null);
      renderBrainRunCard(run);
      renderBrainRunsList();
      brainAppendMessage({
        role: "assistant",
        title: "Nexa",
        body: `Run complete. ${run.plan?.intent ? `Intent: ${run.plan.intent}.` : ""} ${payload.result?.final?.stepsExecuted ? `${payload.result.final.stepsExecuted} steps executed.` : ""}`,
        meta: "Done"
      });
      // Also surface a one-line summary in the conversation tab if it's not active
      pushMessage("assistant", `Brain run complete: ${run.goal}`);
      break;

    case "brain:failed":
      run.status = "failed";
      run.error = payload.error || "Brain run failed";
      brainSetStatus(null);
      renderBrainRunCard(run);
      renderBrainRunsList();
      brainAppendMessage({ role: "assistant", title: "Nexa", body: `Run failed: ${run.error}`, meta: "Error" });
      break;

    case "brain:cancelled":
      run.status = "cancelled";
      brainSetStatus(null);
      renderBrainRunCard(run);
      renderBrainRunsList();
      break;

    // Workflow lifecycle events come in via the main workflow channel. We
    // also receive them as brain:event because the Brain re-emits them. So
    // the workflow sidebar inside the popup reacts too. The Brain doesn't
    // tag these as its own events, but it re-emits as `run:event` with the
    // original `event` field, so we just update the card here.
    case "workflow:step-started":
    case "workflow:step-completed":
    case "workflow:progress":
    case "workflow:started": {
      if (run.plan?.steps) {
        const stepIndex = payload.stepIndex ?? payload.step_index;
        if (typeof stepIndex === "number" && run.plan.steps[stepIndex]) {
          if (payload.event === "workflow:step-started") {
            run.plan.steps[stepIndex].executing = true;
            run.plan.steps[stepIndex].completed = false;
            run.plan.steps[stepIndex].failed = false;
          } else if (payload.event === "workflow:step-completed") {
            run.plan.steps[stepIndex].executing = false;
            run.plan.steps[stepIndex].completed = payload.success !== false;
            run.plan.steps[stepIndex].failed = payload.success === false;
            run.plan.steps[stepIndex].note = payload.success === false ? (payload.result?.error || "failed") : `${payload.timing?.durationMs || payload.timing?.total_ms || 0}ms`;
          }
        }
        if (payload.event === "workflow:progress" && typeof payload.progress === "number") {
          // nothing extra; UI updates via the per-step state.
        }
        renderBrainRunCard(run);
      }
      break;
    }

    default:
      break;
  }
}

// ---- Dialogs ----

// Use the existing components/* if present; otherwise build minimal
// inline dialogs. We attach the JS classes to window when their scripts
// have loaded.
function getPermissionDialog() { return window.permissionDialog; }
function getClarificationDialog() { return window.clarificationDialog; }

async function openClarificationForRun(runId, questions) {
  const dialog = getClarificationDialog();
  const list = Array.isArray(questions) ? questions : [questions].filter(Boolean);
  if (list.length === 0) return;

  if (dialog && typeof dialog.show === "function") {
    const first = list[0];
    dialog.show(runId, first.id || "clarification", first.question || "Could you clarify?", first.inputType || "select", async (answer) => {
      // Build answers object. Allow freeform.
      const answers = { [first.id || "clarification_1"]: answer };
      // If there are more questions in the list, ask the next one recursively.
      const remaining = list.slice(1);
      if (remaining.length > 0) {
        await openClarificationForRun(runId, remaining);
      }
      await window.browserApi.provideClarification(runId, answers);
    }, async () => {
      // Skip: send empty answer for the first question
      const answers = { [first.id || "clarification_1"]: "" };
      await window.browserApi.provideClarification(runId, answers);
    });
    return;
  }

  // Fallback: window.prompt. Crude but always available.
  const first = list[0];
  const answer = window.prompt(first.question || "Clarify?", "");
  if (answer === null) return;
  const answers = { [first.id || "clarification_1"]: answer };
  await window.browserApi.provideClarification(runId, answers);
}

async function openPermissionForRun(runId, plan, missing, risk) {
  if (!Array.isArray(missing) || missing.length === 0) return;
  const dialog = getPermissionDialog();
  const lifetime = await new Promise((resolve) => {
    if (dialog && typeof dialog.show === "function") {
      dialog.show(
        { goal: plan?.goal || plan?.intent || "Brain run", description: plan?.reasoning || "" },
        missing,
        {
          overall: (risk?.overall) || "medium",
          description: "This run will use the listed capabilities.",
          critical_actions: risk?.critical || 0,
          high_risk_actions: risk?.high || 0,
          medium_risk_actions: risk?.medium || 0
        },
        (chosenLifetime) => resolve(chosenLifetime || "session"),
        () => resolve(false)
      );
    } else {
      // Fallback: window.confirm
      const ok = window.confirm(
        `Allow Brain to use these capabilities for this run?\n\n${missing.join("\n")}\n\nOK = grant for this session, Cancel = deny.`
      );
      resolve(ok ? "session" : false);
    }
  });

  if (lifetime === false) {
    const granted = {};
    for (const scope of missing) granted[scope] = false;
    await window.browserApi.providePermissionDecision(runId, granted);
    return;
  }
  const granted = {};
  for (const scope of missing) granted[scope] = true;
  await window.browserApi.providePermissionDecision(runId, granted);
}

// ---- Boot ----

if (window.browserApi?.onBrainEvent) {
  window.browserApi.onBrainEvent(handleBrainEvent);
}

if (window.browserApi?.listBrainRuns) {
  window.browserApi.listBrainRuns().then((res) => {
    if (res?.ok && Array.isArray(res.runs)) {
      for (const r of res.runs) brainState.runs.set(r.id, r);
      renderBrainRunsList();
    }
  }).catch(() => {});
}

// Initial state for the Brain view
brainAppendMessage({
  role: "assistant",
  title: "Nexa",
  body: "Try one of these:",
  meta: "Welcome"
});

window.browserApi.getState().then((state) => {
  applyState(state);
  setRuntimeStatus("idle");
  renderConversation();
});
