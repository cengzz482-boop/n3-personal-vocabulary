const PAGE_SIZE = 30;
const STANDALONE_DATA_VERSION = "20260715-2";
const storageKey = "n3-personal-state-v1";
const defaultSettings = {
  speed: 0.7, sentenceLevel: "N3", autoPronounce: true, personFirst: true, chineseAuto: false,
  sentenceAuto: false, showRomaji: true, showSentenceRomaji: true, petEnabled: true,
  petNeverWake: false, autoReadPopup: false, autoReadDelay: 500, darkMode: false,
  motionLevel: "full", wordRepeat: 1, sentenceRepeat: 1, pipeX: null, pipeY: null,
};
const LESSON_ENDS = [
  "輪", "我々", "割合に", "僅か", "割る", "渡る", "悪口", "割り勘", "割り算", "和",
  "ローマ字", "リボン", "脇", "リビングルーム", "和食", "和英", "列島", "我が儘", "蝋燭", "話題",
  "レンタカー", "わざと", "ワールド", "若々しい", "和服", "我が", "ワンピース", "割引", "割に", "礼", "連休",
];

const app = document.querySelector("#app");
const title = document.querySelector("#page-title");
const searchInput = document.querySelector("#global-search");
const dialog = document.querySelector("#detail-dialog");
const detailContent = document.querySelector("#detail-content");
const marioPet = document.querySelector(".mario-pet");
const marioPetMenu = document.querySelector(".mario-pet-menu");
const marioPetImage = document.querySelector(".mario-pet-image");
const marioCloud = document.querySelector(".mario-cloud");
const sentenceCaption = document.querySelector("#sentence-caption");
const sentenceCaptionLabel = sentenceCaption.querySelector(".sentence-caption-label");
const sentenceCaptionJp = sentenceCaption.querySelector(".sentence-caption-jp");
const sentenceCaptionCn = sentenceCaption.querySelector(".sentence-caption-cn");

let words = [];
let relatedLexicon = {};
const standaloneScriptPromises = new Map();
let detailDataPromise = null;
let edgeChineseAudioPromise = null;
let currentView = "home";
let currentPage = 1;
let studyIndex = 0;
let quiz = null;
let selectedLesson = 0;
let highlightedWordId = "";
let autoReadWords = [];
let autoReadIndex = -1;
let autoReadRunning = false;
let autoReadStarted = false;
let autoReadTimer = null;
let autoReadWaiting = false;
let activeAudio = null;
let audioSequenceToken = 0;
let activeSpeechTimeout = null;
let activeSpeechUtterance = null;
let speechRequestId = 0;
let speechVoiceLoadPromise = null;
let speechVoiceLoadAttempted = false;
let autoReadDelay = 500;
let readStepScrollFrame = null;
let readStepScrollToken = 0;
let sentenceCaptionToken = 0;
let sentenceCaptionHideTimer = null;
let sentenceCaptionSafetyTimer = null;
let openDetailWordId = "";
let dialogTouchStartY = 0;
let dialogTouchStartHeight = 0;
let dialogTouchDragging = false;
let dialogDragFrame = null;
let dialogDragOffset = null;
let suppressDialogClickUntil = 0;
let brainwashAudio = null;
let brainwashStopped = true;
let mascotReactionTimer = null;
let mascotBehaviorTimer = null;
let mascotBusyUntil = 0;
let mascotFrameTimer = null;
let mascotMoveTimer = null;
let mascotWakeTimer = null;
let mascotRetireTimer = null;
let mascotAwake = false;
let mascotActionHistory = [];
let lastPetInteraction = Date.now();
let pipePreviewOpen = false;
let easterCourseRunning = false;
let mascotSequenceTimers = [];
let mascotSequenceRunning = false;
let mascotNormalActionsSinceYoshi = 0;
let currentDetailWord = null;
let currentDetailData = null;
const sentenceLevelCache = new Map();
let petPointerStart = null;
let petDragFrame = null;
let petDragPoint = null;
let petResizeTimer = null;
let noticeTimer = null;
let searchTimer = null;
let searchComposing = false;
let detailRequestToken = 0;
let lastMascotScheduleAt = 0;
const mascotClasses = ["pet-jump", "pet-fall", "pet-spin", "pet-skid", "pet-slide", "pet-crouch", "pet-climb", "pet-victory", "pet-point", "pet-run", "pet-walk", "pet-idle", "pet-look", "pet-wake", "pet-fly", "pet-dive", "pet-cloud", "pet-yoshi-summon", "pet-yoshi-run", "pet-yoshi-tongue", "pet-yoshi-jump", "pet-yoshi-fly", "pet-yoshi-celebrate", "pet-grabbed"];
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let state = loadState();
state.settings = { ...defaultSettings, ...state.settings };
state.brainwash = { sentence: false, wordSpeed: 1, sentenceSpeed: 1, count: 10, ...state.brainwash };
autoReadDelay = state.settings.autoReadDelay;
applyTheme();

function loadStandaloneScript(filename, globalName) {
  if (!window.__STANDALONE__ || window[globalName]) return Promise.resolve(window[globalName]);
  if (standaloneScriptPromises.has(filename)) return standaloneScriptPromises.get(filename);

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.dataset.lazyStandalone = filename;
    script.src = new URL(`${filename}?v=${STANDALONE_DATA_VERSION}`, document.baseURI).href;
    script.onload = () => {
      if (window[globalName]) resolve(window[globalName]);
      else reject(new Error(`${filename} 内容无效`));
    };
    script.onerror = () => reject(new Error(`${filename} 下载失败，请检查网络后重试`));
    document.head.appendChild(script);
  }).catch(error => {
    standaloneScriptPromises.delete(filename);
    document.querySelector(`script[data-lazy-standalone="${filename}"]`)?.remove();
    throw error;
  });

  standaloneScriptPromises.set(filename, promise);
  return promise;
}

function ensureDetailData() {
  if (!window.__STANDALONE__) return Promise.resolve();
  if (window.__DETAILS__ && window.__SENTENCES__ && window.__RELATED_LEXICON__) {
    relatedLexicon = window.__RELATED_LEXICON__;
    return Promise.resolve();
  }
  if (detailDataPromise) return detailDataPromise;

  detailDataPromise = Promise.all([
    loadStandaloneScript("details.js", "__DETAILS__"),
    loadStandaloneScript("sentences.js", "__SENTENCES__").catch(() => { window.__SENTENCES__ ||= {}; }),
    loadStandaloneScript("related-lexicon.js", "__RELATED_LEXICON__").catch(() => { window.__RELATED_LEXICON__ ||= {}; }),
  ]).then(() => {
    relatedLexicon = window.__RELATED_LEXICON__ || {};
  }).catch(error => {
    detailDataPromise = null;
    throw error;
  });
  return detailDataPromise;
}

function ensureEdgeChineseAudio() {
  if (!window.__STANDALONE__ || window.__EDGE_CN_AUDIO__) return Promise.resolve(window.__EDGE_CN_AUDIO__);
  if (!edgeChineseAudioPromise) {
    edgeChineseAudioPromise = loadStandaloneScript("edge-audio.js", "__EDGE_CN_AUDIO__").catch(error => {
      edgeChineseAudioPromise = null;
      throw error;
    });
  }
  return edgeChineseAudioPromise;
}

function loadState() {
  try {
    return {
      learned: [], favorites: [], mistakes: [], activity: [],
      settings: { ...defaultSettings },
      ...JSON.parse(localStorage.getItem(storageKey) || "{}"),
    };
  } catch {
    return { learned: [], favorites: [], mistakes: [], activity: [], settings: { ...defaultSettings } };
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.darkMode ? "night" : "day";
  document.documentElement.dataset.motion = ["full", "gentle", "off"].includes(state.settings.motionLevel) ? state.settings.motionLevel : "full";
}

function setInList(listName, id, enabled) {
  const set = new Set(state[listName]);
  enabled ? set.add(id) : set.delete(id);
  state[listName] = [...set];
  saveState();
}

function record(type, word) {
  state.activity.unshift({ type, word: word.jp_word, time: new Date().toISOString() });
  state.activity = state.activity.slice(0, 20);
  saveState();
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function repeatCount(value) {
  return Math.max(1, Math.min(3, Math.round(Number(value) || 1)));
}

function showNotice(message) {
  let notice = document.querySelector(".app-notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.className = "app-notice";
    notice.setAttribute("role", "status");
    document.body.appendChild(notice);
  }
  notice.textContent = message;
  notice.classList.add("show");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.classList.remove("show"), 2600);
}

const petFrames = {
  idle: ["idle"], look: ["look", "idle"], walk: ["walk-1", "walk-2", "walk-3"],
  run: ["run-1", "run-2", "run-3"], jump: ["jump", "fall"], fall: ["fall"], spin: ["spin", "fall"],
  skid: ["skid"], slide: ["slide"], crouch: ["crouch"], climb: ["climb", "wake"],
  victory: ["victory", "point"], point: ["point"], wake: ["wake", "jump", "idle"],
  fly: ["cape-run", "cape-fly", "cape-fall"], dive: ["cape-dive", "cape-fall"], cloud: ["idle", "point", "victory", "crouch"],
  "yoshi-summon": ["yoshi-hop", "yoshi-ride-1"], "yoshi-run": ["yoshi-ride-1", "yoshi-ride-2", "yoshi-ride-3"],
  "yoshi-tongue": ["yoshi-tongue-1", "yoshi-tongue-2", "yoshi-tongue-1"], "yoshi-jump": ["yoshi-hop", "yoshi-ride-1"],
  "yoshi-fly": ["yoshi-ride-1", "yoshi-hop", "yoshi-ride-2"], "yoshi-celebrate": ["yoshi-celebrate", "yoshi-ride-1"],
};
const petAssetPaths = {
  idle: "/assets/smw/idle.png", look: "/assets/smw/look.png", "walk-1": "/assets/smw/walk-1.png",
  "walk-2": "/assets/smw/walk-2.png", "walk-3": "/assets/smw/walk-3.png", "run-1": "/assets/smw/run-1.png",
  "run-2": "/assets/smw/run-2.png", "run-3": "/assets/smw/run-3.png", jump: "/assets/smw/jump.png",
  fall: "/assets/smw/fall.png", spin: "/assets/smw/spin.png", skid: "/assets/smw/skid.png",
  slide: "/assets/smw/slide.png", crouch: "/assets/smw/crouch.png", climb: "/assets/smw/climb.png",
  victory: "/assets/smw/victory.png", point: "/assets/smw/point.png", wake: "/assets/smw/wake.png",
  "cape-run": "/assets/smw/cape-run.png", "cape-fly": "/assets/smw/cape-fly.png",
  "cape-dive": "/assets/smw/cape-dive.png", "cape-fall": "/assets/smw/cape-fall.png",
  "cloud-1": "/assets/smw/cloud-1.png", "cloud-2": "/assets/smw/cloud-2.png", "cloud-3": "/assets/smw/cloud-3.png",
  "yoshi-ride-1": "/assets/smw/yoshi-ride-1.png", "yoshi-ride-2": "/assets/smw/yoshi-ride-2.png",
  "yoshi-ride-3": "/assets/smw/yoshi-ride-3.png", "yoshi-tongue-1": "/assets/smw/yoshi-tongue-1.png",
  "yoshi-tongue-2": "/assets/smw/yoshi-tongue-2.png", "yoshi-hop": "/assets/smw/yoshi-hop.png",
  "yoshi-celebrate": "/assets/smw/yoshi-celebrate.png",
};
const motionAssetCache = new Map();
const standaloneAssetUrls = new Map();

function standaloneAssetData(source) {
  const variable = window.__SMW_ASSET_VARS__?.[source];
  if (!variable) return "";
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  if (!value.startsWith("url(") || !value.endsWith(")")) return "";
  const wrapped = value.slice(4, -1).trim();
  return wrapped.length > 1 && ((wrapped[0] === '"' && wrapped.at(-1) === '"') || (wrapped[0] === "'" && wrapped.at(-1) === "'"))
    ? wrapped.slice(1, -1)
    : wrapped;
}

function assetUrl(source) {
  if (typeof source !== "string" || !source || source === "undefined") return "";
  if (!window.__SMW_ASSET_VARS__?.[source]) return source;
  if (standaloneAssetUrls.has(source)) return standaloneAssetUrls.get(source);
  const data = standaloneAssetData(source);
  if (!data) return source;
  try {
    const [header, encoded] = data.split(",", 2);
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const type = header.match(/^data:([^;]+)/)?.[1] || "image/png";
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    standaloneAssetUrls.set(source, url);
    return url;
  } catch {
    standaloneAssetUrls.set(source, data);
    return data;
  }
}

function setMotionImage(image, source) {
  if (!image || typeof source !== "string" || !source || source === "undefined") return;
  const resolved = assetUrl(source);
  if (resolved && image.getAttribute("src") !== resolved) image.src = resolved;
}

function hydrateStandaloneAssets(root = document) {
  root.querySelectorAll?.("[data-smw-src]").forEach(image => setMotionImage(image, image.dataset.smwSrc));
}

hydrateStandaloneAssets();

function stopMascotFrames() {
  if (mascotFrameTimer !== null) cancelAnimationFrame(mascotFrameTimer);
  mascotFrameTimer = null;
}

function scheduleMotionWarmup() {
  const warm = () => {
    new Set(Object.values(petAssetPaths)).forEach(source => {
      if (motionAssetCache.has(source)) return;
      const image = new Image();
      image.decoding = "async";
      image.src = assetUrl(source);
      motionAssetCache.set(source, image);
      image.decode?.().catch(() => {});
    });
    document.querySelectorAll(".easter-level img").forEach(image => {
      image.decoding = "async";
      image.decode?.().catch(() => {});
    });
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(warm, { timeout: 1800 });
  else setTimeout(warm, 240);
}

function notePetInteraction() {
  const now = Date.now();
  lastPetInteraction = now;
  if (mascotAwake && !easterCourseRunning && now - lastMascotScheduleAt >= 400) {
    lastMascotScheduleAt = now;
    scheduleMascotBehavior(8000 + Math.random() * 4000);
  }
}

function setPetAction(action = "idle", duration = 0) {
  stopMascotFrames();
  clearTimeout(mascotReactionTimer);
  mascotReactionTimer = null;
  marioPet.classList.remove(...mascotClasses);
  marioPet.classList.add(`pet-${action}`);
  const frames = petFrames[action] || petFrames.idle;
  let frame = 0;
  setMotionImage(marioPetImage, petAssetPaths[frames[0]]);
  setMotionImage(marioCloud, petAssetPaths["cloud-1"]);
  if (frames.length > 1 && !reducedMotionQuery.matches) {
    const frameDuration = ["run", "yoshi-run"].includes(action) ? 100 : action === "cloud" ? 220 : action === "yoshi-fly" ? 145 : 170;
    const startedAt = performance.now();
    const animateFrame = timestamp => {
      const nextFrame = Math.floor((timestamp - startedAt) / frameDuration) % frames.length;
      if (nextFrame !== frame) {
        frame = nextFrame;
        setMotionImage(marioPetImage, petAssetPaths[frames[frame]]);
        if (action === "cloud") setMotionImage(marioCloud, petAssetPaths[`cloud-${(frame % 3) + 1}`]);
      }
      mascotFrameTimer = requestAnimationFrame(animateFrame);
    };
    mascotFrameTimer = requestAnimationFrame(animateFrame);
  }
  if (duration) mascotReactionTimer = setTimeout(() => setPetAction("idle"), duration);
}

function positionPetMenu() {
  const r = marioPet.getBoundingClientRect();
  const spaceBelow = innerHeight - r.top - 16;
  const spaceAbove = r.top + r.height - 18;
  const openUp = spaceAbove > spaceBelow;
  marioPet.classList.toggle("pet-menu-left", r.left > innerWidth / 2);
  marioPet.classList.toggle("pet-menu-up", openUp);
  marioPet.style.setProperty("--pet-menu-max-height", `${Math.min(470, Math.max(160, openUp ? spaceAbove : spaceBelow))}px`);
}

function syncPetMenu() {
  const wake = marioPetMenu.querySelector('[data-pet-tool="wake"]');
  const retire = marioPetMenu.querySelector('[data-pet-tool="retire"]');
  wake.hidden = mascotAwake;
  wake.textContent = state.settings.petNeverWake ? "解除休眠并唤醒马里奥" : "唤醒马里奥";
  retire.hidden = !mascotAwake;
  const readToggle = marioPetMenu.querySelector('[data-pet-tool="read-toggle"]');
  readToggle.dataset.readState = autoReadRunning ? "running" : autoReadStarted ? "paused" : "ready";
  readToggle.textContent = autoReadRunning ? "暂停朗读" : autoReadStarted ? "继续朗读" : "从选中处朗读";
  marioPetMenu.querySelector('[data-pet-tool="read-delay"]').textContent = `⏱ 词间停顿：${autoReadDelay / 1000}秒`;
  marioPetMenu.querySelector('[data-pet-tool="read-popup"]').textContent = `▣ 朗读弹窗：${state.settings.autoReadPopup ? "开" : "关"}`;
  marioPetMenu.querySelector('[data-pet-tool="theme"]').textContent = state.settings.darkMode ? "☀ 白昼关卡" : "☾ 深色关卡";
  const readWord = autoReadIndex >= 0 ? autoReadWords[autoReadIndex] : null;
  marioPetMenu.querySelector(".pet-read-status").textContent = readWord ? `自动朗读：${readWord.jp_word}` : "自动朗读：未选择起点";
  positionPetMenu();
}

function positionRetiredPet() {
  const fallbackX = innerWidth - (innerWidth <= 900 ? 70 : 86);
  const fallbackY = innerHeight - (innerWidth <= 900 ? 116 : 140);
  const x = Number.isFinite(state.settings.pipeX) ? state.settings.pipeX : fallbackX;
  const y = Number.isFinite(state.settings.pipeY) ? state.settings.pipeY : fallbackY;
  marioPet.style.setProperty("--pet-x", `${Math.max(8, Math.min(innerWidth - 66, x))}px`);
  marioPet.style.setProperty("--pet-y", `${Math.max(42, Math.min(innerHeight - 90, y))}px`);
}

function showPipePreview() {
  pipePreviewOpen = true;
  marioPet.classList.remove("pet-retired");
  marioPet.classList.add("pet-pipe-preview");
  setMotionImage(marioPetImage, petAssetPaths.idle);
  syncPetMenu();
  marioPetMenu.hidden = false;
}

function hidePipePreview() {
  pipePreviewOpen = false;
  marioPetMenu.hidden = true;
  marioPet.classList.remove("pet-pipe-preview");
  marioPet.classList.add("pet-retired");
}

function mascotReact(reaction = "jump") {
  if (!mascotAwake || !state.settings.petEnabled || easterCourseRunning || marioPet.classList.contains("pet-awakening")) return;
  clearTimeout(mascotBehaviorTimer);
  clearTimeout(mascotReactionTimer);
  clearTimeout(mascotMoveTimer);
  const action = { wave: "point", cheer: "victory", dash: "spin" }[reaction] || reaction;
  mascotBusyUntil = Date.now() + 1050;
  setPetAction(action, 950);
  lastPetInteraction = Date.now();
  scheduleMascotBehavior(8500);
}

function stopMascotBehavior() {
  clearTimeout(mascotBehaviorTimer);
  clearTimeout(mascotReactionTimer);
  clearTimeout(mascotMoveTimer);
  clearTimeout(mascotWakeTimer);
  stopMascotFrames();
  mascotSequenceTimers.forEach(clearTimeout);
  mascotSequenceTimers = [];
  mascotSequenceRunning = false;
}

function scheduleMascotBehavior(delay = 8000) {
  clearTimeout(mascotBehaviorTimer);
  if (!mascotAwake || !state.settings.petEnabled || easterCourseRunning || reducedMotionQuery.matches || state.settings.motionLevel === "off") return;
  const adjustedDelay = state.settings.motionLevel === "gentle" ? Math.max(12000, delay * 1.8) : delay;
  mascotBehaviorTimer = setTimeout(runMascotBehavior, adjustedDelay);
}

function collectPetRoutes() {
  const margin = 12;
  const petW = window.innerWidth <= 900 ? 48 : 56;
  const petH = window.innerWidth <= 900 ? 68 : 78;
  const selectors = dialog.open
    ? ["#detail-dialog", ".detail-section", ".detail-summary"]
    : [".topbar", ".word-card", ".panel", ".stat", ".auto-reader", ".settings-panel", ".study-card", ".quiz-card"];
  const routes = [];
  document.querySelectorAll(selectors.join(",")).forEach(element => {
    const r = element.getBoundingClientRect();
    if (r.bottom < 50 || r.top > innerHeight - 30 || r.width < 80) return;
    const y = Math.max(42, Math.min(innerHeight - petH - margin, r.top - petH + (dialog.open ? -8 : 3)));
    const left = Math.max(margin, r.left + 8);
    const right = Math.min(innerWidth - petW - margin, r.right - petW - 8);
    if (right > left) {
      routes.push([left, y], [(left + right) / 2, y], [right, y]);
    }
  });
  if (!routes.length) routes.push([margin, 100], [innerWidth / 2 - petW / 2, 100], [innerWidth - petW - margin, 100]);
  return routes.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
}

function movePetToRoute(preferredIndex, action = "run") {
  if (!mascotAwake || !state.settings.petEnabled || easterCourseRunning || marioPet.classList.contains("pet-awakening")) return;
  const routes = collectPetRoutes();
  const current = marioPet.getBoundingClientRect();
  const candidates = routes.filter(([x, y]) => Math.hypot(x - current.left, y - current.top) > 80);
  const pool = candidates.length ? candidates : routes;
  let point = pool[(preferredIndex ?? Math.floor(Math.random() * pool.length)) % pool.length];
  if (action === "climb" && dialog.open) {
    const ladders = [...detailContent.querySelectorAll(".detail-section:nth-of-type(3n + 2)")].filter(x => {
      const r = x.getBoundingClientRect();
      return r.top > 60 && r.top < innerHeight - 80;
    });
    const ladder = ladders[Math.floor(Math.random() * ladders.length)];
    if (ladder) {
      const r = ladder.getBoundingClientRect();
      point = [Math.max(12, r.right - (innerWidth <= 900 ? 50 : 56)), Math.max(42, r.top - 26)];
    }
  }
  marioPet.classList.toggle("pet-facing-left", point[0] < current.left);
  marioPet.style.setProperty("--pet-x", `${point[0]}px`);
  marioPet.style.setProperty("--pet-y", `${point[1]}px`);
  setPetAction(action);
  const travelTime = ["fly", "dive", "cloud", "yoshi-fly"].includes(action) ? 1800 : 900;
  mascotBusyUntil = Date.now() + travelTime;
  clearTimeout(mascotMoveTimer);
  mascotMoveTimer = setTimeout(() => setPetAction(Math.random() > .55 ? "look" : "idle"), travelTime);
}

function reactNearCard(card) {
  if (!mascotAwake || easterCourseRunning || marioPet.classList.contains("pet-awakening")) return;
  const r = card.getBoundingClientRect();
  const current = marioPet.getBoundingClientRect();
  marioPet.classList.toggle("pet-facing-left", r.left + r.width / 2 < current.left + current.width / 2);
  const actions = ["jump", "spin", "point", "crouch", "look"];
  mascotReact(actions[Math.floor(Math.random() * actions.length)]);
  notePetInteraction();
}

function pickFreshAction() {
  const contextual = currentView === "settings" ? ["climb", "point", "crouch"] :
    dialog.open ? ["walk", "jump", "point", "crouch", "climb", "fly"] :
    currentView === "words" ? ["run", "jump", "spin", "skid", "slide", "look", "fly", "dive", "cloud"] :
    ["walk", "run", "jump", "spin", "victory", "look", "crouch", "fly", "cloud"];
  const fresh = contextual.filter(x => !mascotActionHistory.includes(x));
  const action = (fresh.length ? fresh : contextual)[Math.floor(Math.random() * (fresh.length || contextual.length))];
  mascotActionHistory = [...mascotActionHistory.slice(-2), action];
  return action;
}

function runYoshiSequence() {
  if (!mascotAwake || mascotSequenceRunning || dialog.open || currentView === "settings" || easterCourseRunning || state.settings.motionLevel !== "full") return false;
  mascotSequenceRunning = true;
  mascotNormalActionsSinceYoshi = 0;
  setPetAction("yoshi-summon");
  const steps = [
    [650, () => movePetToRoute(undefined, "yoshi-run")],
    [1600, () => setPetAction("yoshi-tongue")],
    [2400, () => setPetAction("yoshi-jump")],
    [3150, () => movePetToRoute(undefined, "yoshi-fly")],
    [4550, () => setPetAction("yoshi-celebrate")],
    [5350, () => {
      mascotSequenceRunning = false;
      setPetAction("idle");
      scheduleMascotBehavior(8500 + Math.random() * 4000);
    }],
  ];
  mascotSequenceTimers = steps.map(([delay, task]) => setTimeout(task, delay));
  mascotBusyUntil = Date.now() + 5500;
  return true;
}

function runMascotBehavior() {
  if (!mascotAwake || !state.settings.petEnabled || easterCourseRunning || state.settings.motionLevel === "off") return;
  const idleFor = Date.now() - lastPetInteraction;
  if (idleFor < 8000) return scheduleMascotBehavior(8000 - idleFor + 500);
  if (Date.now() < mascotBusyUntil) return scheduleMascotBehavior(mascotBusyUntil - Date.now() + 180);
  if (mascotNormalActionsSinceYoshi >= 12 && !dialog.open && currentView !== "settings" && Math.random() < .07 && runYoshiSequence()) return;
  const action = state.settings.motionLevel === "gentle"
    ? ["look", "crouch", "point", "jump"][Math.floor(Math.random() * 4)]
    : pickFreshAction();
  mascotNormalActionsSinceYoshi += 1;
  if (["walk", "run", "skid", "slide", "climb", "fly", "dive", "cloud"].includes(action) || Math.random() > .65) movePetToRoute(undefined, action);
  else {
    setPetAction(action, action === "crouch" ? 1600 : 950);
    mascotBusyUntil = Date.now() + 1000;
  }
  scheduleMascotBehavior(6500 + Math.random() * 5000);
}

function wakePetFromWordCard(card) {
  if (mascotAwake || !state.settings.petEnabled || state.settings.petNeverWake) return;
  const r = card.getBoundingClientRect();
  mascotAwake = true;
  marioPet.classList.remove("pet-dormant", "pet-retired");
  marioPet.classList.add("pet-awakening");
  marioPet.style.setProperty("--pet-x", `${Math.min(innerWidth - 70, Math.max(12, r.right - 70))}px`);
  marioPet.style.setProperty("--pet-y", `${Math.max(42, r.top - 66)}px`);
  setPetAction("wake");
  mascotWakeTimer = setTimeout(() => {
    marioPet.classList.remove("pet-awakening");
    setPetAction("victory", 900);
    mascotMoveTimer = setTimeout(() => movePetToRoute(undefined, "run"), 950);
    scheduleMascotBehavior(8500);
    if (easterLevelIsVisible()) playEasterLevel();
  }, 1350);
}

function retirePet() {
  if (easterCourseRunning) cancelEasterLevel();
  clearTimeout(mascotRetireTimer);
  if (!mascotAwake) {
    pipePreviewOpen = false;
    marioPet.classList.remove(...mascotClasses);
    marioPet.classList.remove("pet-dormant", "pet-pipe-preview", "pet-awakening", "pet-entering-pipe");
    marioPet.classList.add("pet-retired");
    positionRetiredPet();
    return;
  }
  stopMascotBehavior();
  marioPetMenu.hidden = true;
  marioPet.classList.remove("pet-awakening", "pet-pipe-preview");
  marioPet.classList.add("pet-entering-pipe");
  positionRetiredPet();
  setPetAction("crouch");
  mascotRetireTimer = setTimeout(() => {
    mascotAwake = false;
    marioPet.classList.remove(...mascotClasses);
    marioPet.classList.remove("pet-entering-pipe");
    marioPet.classList.add("pet-retired");
    positionRetiredPet();
  }, 1500);
}

function restorePet() {
  if (state.settings.petNeverWake) return;
  clearTimeout(mascotRetireTimer);
  stopMascotBehavior();
  state.settings.petEnabled = true;
  saveState();
  mascotAwake = true;
  pipePreviewOpen = false;
  marioPetMenu.hidden = true;
  marioPet.classList.remove("pet-retired", "pet-pipe-preview", "pet-dormant", "pet-entering-pipe");
  marioPet.classList.add("pet-awakening");
  setPetAction("wake");
  mascotWakeTimer = setTimeout(() => {
    marioPet.classList.remove("pet-awakening");
    movePetToRoute(undefined, "jump");
    scheduleMascotBehavior(8500);
    if (easterLevelIsVisible()) playEasterLevel();
  }, 1200);
  if (currentView === "settings") renderSettings();
}

function sentenceCaptionText(sentence) {
  return {
    jp: String(sentence?.jp || sentence?.sentence || sentence?.japanese || "").trim(),
    cn: String(sentence?.cn || sentence?.translate || sentence?.chinese || "").trim(),
    level: String(sentence?.level || "").trim(),
  };
}

function armSentenceCaptionTimeout(token, milliseconds) {
  if (!token || token !== sentenceCaptionToken) return;
  clearTimeout(sentenceCaptionSafetyTimer);
  sentenceCaptionSafetyTimer = setTimeout(() => hideSentenceCaption(token), Math.max(1200, milliseconds));
}

function showSentenceCaption(sentence, rate = 1, repeats = 1) {
  const text = sentenceCaptionText(sentence);
  if (!text.jp) {
    hideSentenceCaption();
    return 0;
  }
  const token = ++sentenceCaptionToken;
  clearTimeout(sentenceCaptionHideTimer);
  clearTimeout(sentenceCaptionSafetyTimer);
  sentenceCaptionLabel.textContent = text.level ? `例句 ${text.level}` : "例句";
  sentenceCaptionJp.textContent = text.jp;
  sentenceCaptionCn.textContent = text.cn;
  sentenceCaptionCn.hidden = !text.cn;
  sentenceCaption.hidden = false;
  document.body.classList.add("sentence-caption-visible");
  requestAnimationFrame(() => {
    if (token === sentenceCaptionToken) sentenceCaption.classList.add("show");
  });
  const repeatTotal = repeatCount(repeats);
  const estimatedDuration = Math.max(3500, Math.min(30000, ((text.jp.length * 320 + 1600) / Math.max(.5, rate || 1)) * repeatTotal));
  armSentenceCaptionTimeout(token, estimatedDuration);
  return token;
}

function hideSentenceCaption(token = 0, immediate = false) {
  if (token && token !== sentenceCaptionToken) return;
  if (!token) sentenceCaptionToken += 1;
  const hideToken = sentenceCaptionToken;
  clearTimeout(sentenceCaptionHideTimer);
  clearTimeout(sentenceCaptionSafetyTimer);
  sentenceCaption.classList.remove("show");
  if (immediate || reducedMotionQuery.matches) {
    sentenceCaption.hidden = true;
    document.body.classList.remove("sentence-caption-visible");
    return;
  }
  sentenceCaptionHideTimer = setTimeout(() => {
    if (hideToken === sentenceCaptionToken && !sentenceCaption.classList.contains("show")) {
      sentenceCaption.hidden = true;
      document.body.classList.remove("sentence-caption-visible");
    }
  }, 180);
}

function pauseAutoRead() {
  if (autoReadRunning) {
    autoReadRunning = false;
    autoReadStarted = true;
    autoReadWaiting = false;
    clearTimeout(autoReadTimer);
    autoReadTimer = null;
    audioSequenceToken += 1;
    activeAudio?.pause();
    cancelSystemSpeech();
  }
  hideSentenceCaption();
  refreshAutoReadUi();
}

function play(url, rate = 1, reaction = "jump", caption = null, repeats = 1) {
  pauseAutoRead();
  mascotReact(reaction);
  audioSequenceToken += 1;
  activeAudio?.pause();
  cancelSystemSpeech();
  if (!url || url === "undefined") {
    showNotice("这条音频暂不可用");
    return null;
  }
  const repeatTotal = repeatCount(repeats);
  const captionToken = caption ? showSentenceCaption(caption, rate, repeatTotal) : 0;
  const audio = new Audio(url);
  activeAudio = audio;
  audio.playbackRate = rate;
  let remaining = repeatTotal;
  let finished = false;
  const finish = (failed = false) => {
    if (finished) return;
    finished = true;
    if (activeAudio === audio) activeAudio = null;
    if (captionToken) hideSentenceCaption(captionToken);
    if (failed) showNotice("音频播放失败，请检查网络连接");
  };
  audio.onended = () => {
    if (finished) return;
    remaining -= 1;
    if (remaining <= 0) return finish(false);
    try { audio.currentTime = 0; } catch {}
    audio.play().catch(() => finish(true));
  };
  audio.onerror = () => finish(true);
  audio.onloadedmetadata = () => {
    if (captionToken && Number.isFinite(audio.duration) && audio.duration > 0) {
      armSentenceCaptionTimeout(captionToken, audio.duration / Math.max(.25, audio.playbackRate) * 1000 * repeatTotal + 800);
    }
  };
  audio.play().catch(() => finish(true));
  return audio;
}

function wordAudio(word, type = "jp") {
  if (window.__STANDALONE__) {
    if (type === "person" && word.person_audio) return `https://shiri.cdn.jingqueyun.com/words/${word.person_audio}.mp3`;
    const audioId = word.jp_audio_id || word.audio_id;
    return audioId ? `https://shiri.cdn.jingqueyun.com/words/${audioId}.mp3` : "";
  }
  if (type === "person" && word.person_audio) return `/local-data/person/${word.id}.mp3`;
  return `/local-data/audio/${word.id}.mp3`;
}

function chineseAudio(word) {
  return `https://shiri.cdn.jingqueyun.com/cn_words/${word.audio_id}.mp3`;
}

function needsBundledChineseAudio(word) {
  const audioId = String(word.audio_id || "");
  return !audioId || audioId.includes("/") || audioId.includes("_") || String(word.is_generate_cn) === "0";
}

function bundledEdgeChineseAudio(word) {
  if (window.__STANDALONE__) return window.__EDGE_CN_AUDIO__?.[word.id] || "";
  return needsBundledChineseAudio(word) ? `/local-data/edge-cn/${word.id}.mp3` : "";
}

function chineseSpeechText(word) {
  return String(word.zh_word || word.generate_cn || word.chinese || "").replace(/\s+/g, " ").trim().slice(0, 160);
}

function cancelSystemSpeech() {
  speechRequestId += 1;
  clearTimeout(activeSpeechTimeout);
  activeSpeechTimeout = null;
  activeSpeechUtterance = null;
  try { window.speechSynthesis?.cancel(); } catch {}
}

function isEdgeBrowser() {
  const brands = navigator.userAgentData?.brands || [];
  return brands.some(item => /Microsoft Edge/i.test(item.brand)) || /\bEdg(?:A|iOS)?\//.test(navigator.userAgent || "");
}

function isChineseVoice(voice) {
  return /^zh(?:[-_]|$)/i.test(voice?.lang || "");
}

function isOnlineVoice(voice) {
  return Boolean(voice) && (voice.localService === false || /\bOnline\b/i.test(voice.name || ""));
}

function selectChineseVoice(voices, mode = "any") {
  return [...voices]
    .filter(voice => isChineseVoice(voice))
    .filter(voice => mode !== "online" || isOnlineVoice(voice))
    .filter(voice => mode !== "local" || !isOnlineVoice(voice))
    .sort((a, b) => {
      const score = voice => {
        const lang = String(voice.lang || "").replaceAll("_", "-").toLowerCase();
        const name = voice.name || "";
        return (lang === "zh-cn" || lang.startsWith("zh-hans") ? 500 : 250)
          + (isOnlineVoice(voice) ? 400 : 0)
          + (/Microsoft/i.test(name) ? 120 : 0)
          + (/(?:Xiaoxiao|Yunxi|Xiaoyi|晓晓|云希|晓伊)/i.test(name) ? 80 : 0)
          + (/(?:Online|Natural)/i.test(name) ? 60 : 0)
          + (voice.default ? 5 : 0);
      };
      return score(b) - score(a);
    })[0] || null;
}

function loadChineseVoices() {
  const synth = window.speechSynthesis;
  const current = synth.getVoices?.() || [];
  if (selectChineseVoice(current, "online") || (!isEdgeBrowser() && selectChineseVoice(current)) || speechVoiceLoadAttempted) {
    return Promise.resolve(current);
  }
  if (speechVoiceLoadPromise) return speechVoiceLoadPromise;
  speechVoiceLoadPromise = new Promise(resolve => {
    let settled = false;
    let timer;
    const finish = voices => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      synth.removeEventListener?.("voiceschanged", check);
      speechVoiceLoadAttempted = true;
      speechVoiceLoadPromise = null;
      resolve(voices);
    };
    const check = () => {
      const voices = synth.getVoices?.() || [];
      if (selectChineseVoice(voices, "online") || (!isEdgeBrowser() && selectChineseVoice(voices))) finish(voices);
    };
    synth.addEventListener?.("voiceschanged", check);
    timer = setTimeout(() => finish(synth.getVoices?.() || []), 1800);
    check();
  });
  return speechVoiceLoadPromise;
}

function speakChinese(text, token, onDone) {
  if (!text || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return false;
  cancelSystemSpeech();
  const requestId = speechRequestId;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(activeSpeechTimeout);
    activeSpeechTimeout = null;
    activeSpeechUtterance = null;
    if (token === audioSequenceToken) onDone?.();
  };
  const start = async () => {
    const voices = await loadChineseVoices();
    if (finished || requestId !== speechRequestId || token !== audioSequenceToken) return;
    const onlineVoice = selectChineseVoice(voices, "online");
    const localVoice = selectChineseVoice(voices, "local");
    let localRetried = false;
    const speakWith = (voice, online) => {
      if (finished || requestId !== speechRequestId || token !== audioSequenceToken) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "zh-CN";
      utterance.rate = 0.92;
      utterance.voice = voice;
      activeSpeechUtterance = utterance;
      let attemptDone = false;
      const fail = () => {
        if (attemptDone) return;
        attemptDone = true;
        clearTimeout(activeSpeechTimeout);
        activeSpeechTimeout = null;
        if (online && localVoice && !localRetried) {
          localRetried = true;
          try { window.speechSynthesis.cancel(); } catch {}
          speakWith(localVoice, false);
          return;
        }
        showNotice(isEdgeBrowser() ? "中文语音播放失败，请检查 Edge 在线语音设置" : "当前浏览器无法播放这条中文释义");
        finish();
      };
      utterance.onend = () => {
        if (attemptDone) return;
        attemptDone = true;
        finish();
      };
      utterance.onerror = fail;
      activeSpeechTimeout = setTimeout(() => {
        try { window.speechSynthesis.cancel(); } catch {}
        fail();
      }, Math.max(6000, Math.min(18000, text.length * 360)));
      if (online) showNotice(isEdgeBrowser() ? "识日中文音频缺失，已改用 Edge 在线中文语音" : "识日中文音频缺失，已改用浏览器在线中文语音");
      else if (voice) showNotice(isEdgeBrowser() ? "Edge 在线音色不可用，已改用本地中文语音" : "识日中文音频缺失，已改用浏览器中文语音");
      else showNotice("未检测到中文音色，正在尝试浏览器默认中文语音");
      try { window.speechSynthesis.speak(utterance); } catch { fail(); }
    };
    speakWith(onlineVoice || localVoice || selectChineseVoice(voices), Boolean(onlineVoice));
  };
  start().catch(() => {
    showNotice("中文语音初始化失败");
    finish();
  });
  return true;
}

function chineseSequenceItem(word) {
  const fallbackText = chineseSpeechText(word);
  const bundledAudio = bundledEdgeChineseAudio(word);
  if (bundledAudio) return { url: bundledAudio, rate: 1, fallbackText, lang: "zh-CN" };
  return needsBundledChineseAudio(word)
    ? { speechText: fallbackText, lang: "zh-CN" }
    : { url: chineseAudio(word), rate: 1, fallbackText, lang: "zh-CN" };
}

async function playChineseMeaning(word) {
  pauseAutoRead();
  mascotReact("cheer");
  if (window.__STANDALONE__ && needsBundledChineseAudio(word) && !window.__EDGE_CN_AUDIO__) {
    showNotice("首次使用这类中文发音，正在准备音频...");
    try {
      await ensureEdgeChineseAudio();
    } catch {
      showNotice("内置中文音频加载失败，已改用浏览器语音");
    }
  }
  playSequence([chineseSequenceItem(word)]);
}

function sentenceAudio(detail) {
  return sentenceItemAudio(detailSentence(detail));
}

function sentenceItemAudio(sentence) {
  return sentence?.id && String(sentence.is_generate_audio ?? "1") !== "0" ? `https://shiri.cdn.jingqueyun.com/sentence/${sentence.id}.mp3` : "";
}

function detailSentence(detail) {
  return Array.isArray(detail?.sentence) ? detail.sentence[0] : detail?.sentence;
}

function getDetail(word) {
  return window.__DETAILS__?.[word.id] || null;
}

function selectSentenceDetail(data, levelSentences = {}) {
  if (!data) return data;
  const requested = state.settings.sentenceLevel;
  const orders = {
    N5: ["N5", "N4", "N3"],
    N4: ["N4", "N5", "N3"],
    N3: ["N3", "N4", "N5"],
  };
  const original = Array.isArray(data.sentence) ? data.sentence[0] : data.sentence?.jp ? data.sentence : null;
  const selected = (orders[requested] || orders.N3).map(level => levelSentences[level]).find(Boolean) || original;
  const selectedGrammar = Array.isArray(selected?.grammar) && selected.grammar.length
    ? selected.grammar
    : String(selected?.id || "") === String(original?.id || "") ? (data.grammar || []) : [];
  return {
    ...data,
    sentence: selected || null,
    grammar: selectedGrammar,
    sentence_selection: {
      requested,
      actual: selected?.level || "",
      fallback: Boolean(selected?.level && selected.level !== requested),
    },
  };
}

function getDisplayDetail(word, data = getDetail(word)) {
  const levelSentences = window.__SENTENCES__?.[word.id] || sentenceLevelCache.get(word.id) || {};
  return selectSentenceDetail(data, levelSentences);
}

function audioSequence(word, detail = getDisplayDetail(word)) {
  const settings = state.settings;
  const jp = settings.personFirst && word.person_audio ? wordAudio(word, "person") : wordAudio(word);
  const sequence = [{ url: jp, rate: settings.speed, repeat: repeatCount(settings.wordRepeat) }];
  if (settings.chineseAuto) sequence.push(chineseSequenceItem(word));
  const sentence = detailSentence(detail);
  const sentenceUrl = sentenceItemAudio(sentence);
  if (settings.sentenceAuto && sentenceUrl) sequence.push({ url: sentenceUrl, rate: settings.speed, caption: sentence, repeat: repeatCount(settings.sentenceRepeat) });
  return sequence;
}

function playSequence(sequence, onDone) {
  const token = ++audioSequenceToken;
  activeAudio?.pause();
  cancelSystemSpeech();
  hideSentenceCaption();
  let index = 0;
  const next = () => {
    if (token !== audioSequenceToken) return;
    if (index >= sequence.length) return onDone?.();
    const item = sequence[index++];
    mascotReact(index === 1 ? "jump" : index === 2 ? "wave" : "cheer");
    if (item.speechText) {
      if (!speakChinese(item.speechText, token, next)) {
        showNotice("当前浏览器无法播放这条中文释义");
        next();
      }
      return;
    }
    if (!item?.url || item.url === "undefined") {
      showNotice("部分音频缺失，已继续后续内容");
      next();
      return;
    }
    const audio = new Audio(item.url);
    activeAudio = audio;
    audio.playbackRate = item.rate || 1;
    const repeatTotal = repeatCount(item.repeat);
    const captionToken = item.caption ? showSentenceCaption(item.caption, item.rate || 1, repeatTotal) : 0;
    let remaining = repeatTotal;
    let advanced = false;
    const advance = () => {
      if (advanced) return;
      advanced = true;
      if (captionToken) hideSentenceCaption(captionToken);
      if (token !== audioSequenceToken) return;
      if (activeAudio === audio) activeAudio = null;
      next();
    };
    const fallback = () => {
      if (advanced) return;
      advanced = true;
      if (captionToken) hideSentenceCaption(captionToken);
      if (token !== audioSequenceToken) return;
      if (activeAudio === audio) activeAudio = null;
      if (item.fallbackText) {
        if (speakChinese(item.fallbackText, token, next)) return;
        showNotice("当前浏览器无法播放这条中文释义");
      } else showNotice("部分音频无法播放，已继续后续内容");
      next();
    };
    audio.onended = () => {
      if (advanced || token !== audioSequenceToken) return;
      remaining -= 1;
      if (remaining <= 0) return advance();
      try { audio.currentTime = 0; } catch {}
      audio.play().catch(fallback);
    };
    audio.onerror = fallback;
    audio.onloadedmetadata = () => {
      if (captionToken && Number.isFinite(audio.duration) && audio.duration > 0) {
        armSentenceCaptionTimeout(captionToken, audio.duration / Math.max(.25, audio.playbackRate) * 1000 * repeatTotal + 800);
      }
    };
    audio.play().catch(fallback);
  };
  next();
}

function romaji(kana = "") {
  kana = [...kana].map(char => {
    const code = char.charCodeAt(0);
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : char;
  }).join("");
  const map = { あ:"a",い:"i",う:"u",え:"e",お:"o",か:"ka",き:"ki",く:"ku",け:"ke",こ:"ko",さ:"sa",し:"shi",す:"su",せ:"se",そ:"so",た:"ta",ち:"chi",つ:"tsu",て:"te",と:"to",な:"na",に:"ni",ぬ:"nu",ね:"ne",の:"no",は:"ha",ひ:"hi",ふ:"fu",へ:"he",ほ:"ho",ま:"ma",み:"mi",む:"mu",め:"me",も:"mo",や:"ya",ゆ:"yu",よ:"yo",ら:"ra",り:"ri",る:"ru",れ:"re",ろ:"ro",わ:"wa",を:"o",ん:"n",が:"ga",ぎ:"gi",ぐ:"gu",げ:"ge",ご:"go",ざ:"za",じ:"ji",ず:"zu",ぜ:"ze",ぞ:"zo",だ:"da",ぢ:"ji",づ:"zu",で:"de",ど:"do",ば:"ba",び:"bi",ぶ:"bu",べ:"be",ぼ:"bo",ぱ:"pa",ぴ:"pi",ぷ:"pu",ぺ:"pe",ぽ:"po",ア:"a",イ:"i",ウ:"u",エ:"e",オ:"o",ー:"-" };
  const pairs = { きゃ:"kya",きゅ:"kyu",きょ:"kyo",しゃ:"sha",しゅ:"shu",しょ:"sho",ちゃ:"cha",ちゅ:"chu",ちょ:"cho",にゃ:"nya",にゅ:"nyu",にょ:"nyo",ひゃ:"hya",ひゅ:"hyu",ひょ:"hyo",みゃ:"mya",みゅ:"myu",みょ:"myo",りゃ:"rya",りゅ:"ryu",りょ:"ryo",ぎゃ:"gya",ぎゅ:"gyu",ぎょ:"gyo",じゃ:"ja",じゅ:"ju",じょ:"jo",びゃ:"bya",びゅ:"byu",びょ:"byo",ぴゃ:"pya",ぴゅ:"pyu",ぴょ:"pyo" };
  let out = "", geminate = false;
  for (let i = 0; i < kana.length; i++) {
    if (kana[i] === "っ" || kana[i] === "ッ") { geminate = true; continue; }
    const pair = pairs[kana.slice(i, i + 2)];
    let value = pair || map[kana[i]] || kana[i];
    if (pair) i++;
    if (geminate && /^[a-z]/.test(value)) value = value[0] + value;
    geminate = false;
    out += value;
  }
  return out.replaceAll("-", "");
}

function sentenceRomaji(sentence, data) {
  const grammar = Array.isArray(data?.grammar) ? data.grammar : [];
  if (!grammar.length) return romaji(sentence?.jp || "");
  return grammar.map(part => romaji(part.hiragana || part.jp || ""))
    .join(" ")
    .replace(/\s+([。、！？,.!?])/g, "$1");
}

function percent(value) {
  return Math.round((value / words.length) * 100) || 0;
}

function renderHome() {
  const learned = state.learned.length;
  const recent = state.activity.slice(0, 6);
  app.innerHTML = `
    <div class="stats">
      <div class="stat"><span>总词数</span><strong>${words.length}</strong><div class="progress"><i style="width:100%"></i></div></div>
      <div class="stat"><span>已学习</span><strong>${learned}</strong><div class="progress"><i style="width:${percent(learned)}%"></i></div></div>
      <div class="stat"><span>收藏词</span><strong>${state.favorites.length}</strong><div class="progress"><i style="width:${percent(state.favorites.length)}%"></i></div></div>
      <div class="stat"><span>错题集</span><strong>${state.mistakes.length}</strong><div class="progress"><i style="width:${percent(state.mistakes.length)}%"></i></div></div>
    </div>
    <div class="grid-2">
      <div class="panel">
        <h2>快速开始</h2>
        <div class="action-grid">
          <button class="action" data-go="learn"><strong>继续学习</strong><small>逐词查看释义与发音</small></button>
          <button class="action" data-go="quiz"><strong>词汇测试</strong><small>四选一中文释义</small></button>
          <button class="action" data-go="words"><strong>按单元浏览</strong><small>31 个单元词汇分组</small></button>
          <button class="action" data-random><strong>随机单词</strong><small>打开一个随机词条详情</small></button>
        </div>
      </div>
      <div class="panel">
        <h2>最近活动</h2>
        ${recent.length ? recent.map(x => `<div class="activity-row"><b>${escapeHtml(x.word)}</b><span>${escapeHtml(x.type)}</span></div>`).join("") : '<div class="empty">开始学习后会在这里记录进度</div>'}
      </div>
    </div>`;
}

function filteredWords(view = currentView) {
  let result = words;
  if (view === "words" && selectedLesson) result = words.filter(w => w.lesson === selectedLesson);
  if (view === "favorites") result = words.filter(w => state.favorites.includes(w.id));
  if (view === "mistakes") result = words.filter(w => state.mistakes.includes(w.id));
  const q = searchInput.value.trim().toLowerCase();
  if (q) result = result.filter(w => [w.jp_word, w.hiragana, w.zh_word, w.cixing].some(v => String(v || "").toLowerCase().includes(q)));
  return result;
}

function renderWordList(view = currentView) {
  const result = filteredWords(view);
  const noSearch = !searchInput.value.trim();
  const allUnitsMode = view === "words" && !selectedLesson && noSearch;
  const singleUnitMode = view === "words" && selectedLesson && noSearch;
  const pageSize = singleUnitMode ? result.length || PAGE_SIZE : PAGE_SIZE;
  const pages = allUnitsMode ? LESSON_ENDS.length : Math.max(1, Math.ceil(result.length / pageSize));
  currentPage = Math.min(currentPage, pages);
  const pageWords = allUnitsMode
    ? result.filter(word => word.lesson === currentPage)
    : result.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  app.innerHTML = `
    <div class="toolbar">
      <div>${view === "words" ? lessonSelect() : ""}</div>
      <span>${allUnitsMode ? `第 ${currentPage} 单元 · 本页 ${pageWords.length} 词 · 共 31 单元` : `找到 ${result.length} 个词 · 第 ${currentPage} / ${pages} 页`}</span>
    </div>
    ${view === "words" ? autoReadControls(result) : ""}
    <div class="word-list">${pageWords.map(wordCard).join("") || '<div class="empty">这里还没有单词</div>'}</div>
    ${pages > 1 ? `<div class="pager"><button class="ghost" data-page="-1" ${currentPage === 1 ? "disabled" : ""}>上一页</button><span>${allUnitsMode ? `第 ${currentPage} / 31 单元` : `${currentPage} / ${pages}`}</span><button class="ghost" data-page="1" ${currentPage === pages ? "disabled" : ""}>下一页</button></div>` : ""}
    <div class="word-page-spacer" aria-hidden="true"></div>`;
}

function autoReadControls(result) {
  const startWord = autoReadIndex >= 0 ? autoReadWords[autoReadIndex] : null;
  return `<div class="auto-reader">
    <div>
      <strong>自动朗读</strong>
      <small data-auto-status aria-live="polite">${autoReadStatus(startWord)}</small>
    </div>
    <div class="read-delay-control" aria-label="自动朗读词间停顿"><span>词间停顿</span><div>${[250, 500, 1000].map(delay => `<button class="delay-option ${autoReadDelay === delay ? "active" : ""}" data-read-delay="${delay}" aria-pressed="${autoReadDelay === delay}">${delay / 1000}秒</button>`).join("")}</div></div>
    <label class="auto-popup-toggle"><input type="checkbox" data-setting="autoReadPopup" ${state.settings.autoReadPopup ? "checked" : ""}><i></i><span>朗读弹窗</span></label>
    <div class="auto-reader-skip" aria-label="朗读位置控制"><button class="ghost" data-auto-skip="-1" ${autoReadIndex <= 0 ? "disabled" : ""} aria-label="上一个词">上一词</button><button class="ghost" data-auto-skip="1" ${autoReadIndex < 0 || autoReadIndex >= autoReadWords.length - 1 ? "disabled" : ""} aria-label="下一个词">下一词</button></div>
    <button class="primary smw-read-toggle" data-auto-toggle data-read-state="${autoReadRunning ? "running" : autoReadStarted ? "paused" : "ready"}">${autoReadRunning ? "暂停朗读" : autoReadStarted ? "继续朗读" : "从选中处朗读"}</button>
    <div class="auto-read-wait-track" aria-hidden="true"><i></i></div>
  </div>`;
}

function autoReadStatus(word = autoReadIndex >= 0 ? autoReadWords[autoReadIndex] : null) {
  if (!word) return "先点击列表中的单词选择起点";
  const progress = `${autoReadIndex + 1} / ${autoReadWords.length}`;
  return `${autoReadWaiting ? `停顿 ${autoReadDelay / 1000} 秒 · 下一词` : "当前"}：${escapeHtml(word.jp_word)} · ${progress} · 第 ${word.lesson} 单元`;
}

function refreshAutoReadUi() {
  document.querySelectorAll(".word-card .smw-audio").forEach(button => {
    button.classList.toggle("read-selected", button.closest(".word-card")?.dataset.id === highlightedWordId);
  });
  const status = document.querySelector("[data-auto-status]");
  if (status) status.innerHTML = autoReadStatus();
  document.querySelectorAll("[data-auto-toggle]").forEach(button => {
    button.dataset.readState = autoReadRunning ? "running" : autoReadStarted ? "paused" : "ready";
    button.textContent = autoReadRunning ? "暂停朗读" : autoReadStarted ? "继续朗读" : "从选中处朗读";
  });
  document.querySelectorAll("[data-auto-skip]").forEach(button => {
    const direction = Number(button.dataset.autoSkip);
    button.disabled = autoReadIndex < 0 || autoReadIndex + direction < 0 || autoReadIndex + direction >= autoReadWords.length;
  });
  document.querySelectorAll("[data-read-delay]").forEach(button => {
    const active = Number(button.dataset.readDelay) === autoReadDelay;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const popupToggle = document.querySelector('[data-setting="autoReadPopup"]');
  if (popupToggle) popupToggle.checked = state.settings.autoReadPopup;
  const reader = document.querySelector(".auto-reader");
  if (reader) reader.dataset.waiting = String(autoReadWaiting);
  if (!autoReadWaiting) {
    const waitBar = document.querySelector(".auto-read-wait-track i");
    waitBar?.getAnimations().forEach(animation => animation.cancel());
    if (waitBar) waitBar.style.transform = "scaleX(0)";
  }
  syncPetMenu();
}

function setAutoReadDelay(delay, announce = true) {
  if (![250, 500, 1000].includes(delay)) return;
  autoReadDelay = delay;
  state.settings.autoReadDelay = delay;
  saveState();
  if (autoReadRunning && autoReadWaiting) scheduleNextAutoWord();
  else refreshAutoReadUi();
  if (announce) showNotice(`词间停顿已设为 ${delay / 1000} 秒${autoReadRunning ? "，从下一词开始生效" : ""}`);
}

function animateAutoReadWait() {
  const bar = document.querySelector(".auto-read-wait-track i");
  if (!bar) return;
  bar.getAnimations().forEach(animation => animation.cancel());
  bar.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: autoReadDelay, easing: "linear", fill: "forwards" });
}

function scrollWordListToTop() {
  requestAnimationFrame(() => document.querySelector(".toolbar")?.scrollIntoView({ block: "start", behavior: "auto" }));
}

function lessonSelect() {
  return `<label class="lesson-filter">单元
    <select id="lesson-select">
      <option value="0">全部 31 单元</option>
      ${LESSON_ENDS.map((end, index) => {
        const lesson = index + 1;
        const count = words.filter(w => w.lesson === lesson).length;
        return `<option value="${lesson}" ${selectedLesson === lesson ? "selected" : ""}>第 ${lesson} 单元 · ${count}词 · 到 ${escapeHtml(end)}</option>`;
      }).join("")}
    </select>
  </label>`;
}

function wordCard(w) {
  const favorite = state.favorites.includes(w.id);
  const learned = state.learned.includes(w.id);
  return `<article class="word-card" data-id="${w.id}">
    <div class="word-main" role="button" tabindex="0" aria-label="打开 ${escapeHtml(w.jp_word)} 词条详情">
      <div class="word-title"><strong>${escapeHtml(w.jp_word)}</strong><span class="pitch">${escapeHtml(w.yindiao)}</span><small>${escapeHtml(w.cixing)}</small></div>
      <div class="reading">${escapeHtml(w.hiragana)}${state.settings.showRomaji ? `<small>${escapeHtml(romaji(w.hiragana))}</small>` : ""}</div>
      <div class="meaning">${escapeHtml(w.zh_word)}</div>
    </div>
    <div class="word-actions">
      <button class="icon-button smw-audio ${highlightedWordId === w.id ? "read-selected" : ""}" data-audio="jp" title="播放发音并设为自动朗读起点" aria-label="播放 ${escapeHtml(w.jp_word)} 发音并设为朗读起点">日</button>
      <button class="icon-button smw-favorite ${favorite ? "on" : ""}" data-favorite title="收藏" aria-label="${favorite ? "取消收藏" : "收藏"} ${escapeHtml(w.jp_word)}">★</button>
      <button class="icon-button smw-learned ${learned ? "on" : ""}" data-learned title="标记已学" aria-label="${learned ? "取消已学" : "标记已学"} ${escapeHtml(w.jp_word)}">✓</button>
    </div>
  </article>`;
}

function locateWord(word) {
  searchInput.value = "";
  selectedLesson = word.lesson;
  highlightedWordId = word.id;
  currentView = "words";
  currentPage = 1;
  document.querySelectorAll(".nav-item").forEach(x => x.classList.toggle("active", x.dataset.view === "words"));
  title.textContent = `第 ${word.lesson} 单元`;
  renderWordList("words");
  requestAnimationFrame(() => document.querySelector(`.word-card[data-id="${word.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  showDetail(word);
}

function alignAdjacentReadButton(wordId, direction = "next") {
  const scrollToken = ++readStepScrollToken;
  if (readStepScrollFrame !== null) cancelAnimationFrame(readStepScrollFrame);
  readStepScrollFrame = requestAnimationFrame(() => {
    if (scrollToken !== readStepScrollToken) return;
    const card = document.querySelector(`.word-card[data-id="${wordId}"]`);
    if (!card) return;
    const currentButton = card.querySelector(".smw-audio");
    const adjacentCard = direction === "previous" ? card.previousElementSibling : card.nextElementSibling;
    const adjacentButton = adjacentCard?.matches(".word-card")
      ? adjacentCard.querySelector(".smw-audio")
      : null;
    if (!currentButton || !adjacentButton) return;
    const currentRect = currentButton.getBoundingClientRect();
    const adjacentRect = adjacentButton.getBoundingClientRect();
    const anchorY = currentRect.top + currentRect.height / 2;
    const distance = adjacentRect.top + adjacentRect.height / 2 - anchorY;
    if (Math.abs(distance) < 2) return;
    const scrollingElement = document.scrollingElement || document.documentElement;
    const maxScroll = () => Math.max(0, scrollingElement.scrollHeight - scrollingElement.clientHeight);
    const startY = window.scrollY;
    const targetY = Math.max(0, Math.min(maxScroll(), startY + distance));

    const finish = () => {
      window.scrollTo(0, targetY);
      readStepScrollFrame = requestAnimationFrame(() => {
        if (scrollToken !== readStepScrollToken || !adjacentButton.isConnected) return;
        const finalRect = adjacentButton.getBoundingClientRect();
        const correction = finalRect.top + finalRect.height / 2 - anchorY;
        if (Math.abs(correction) >= .25) {
          window.scrollTo(0, Math.max(0, Math.min(maxScroll(), window.scrollY + correction)));
        }
        readStepScrollFrame = null;
      });
    };

    if (reducedMotionQuery.matches || Math.abs(targetY - startY) < 2) return finish();
    const duration = 180;
    let startedAt = null;
    const animate = timestamp => {
      if (scrollToken !== readStepScrollToken) return;
      if (startedAt === null) startedAt = timestamp;
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      window.scrollTo(0, startY + (targetY - startY) * eased);
      if (progress < 1) readStepScrollFrame = requestAnimationFrame(animate);
      else finish();
    };
    readStepScrollFrame = requestAnimationFrame(animate);
  });
}

function selectReadStart(word) {
  const visibleWords = filteredWords("words");
  const clickedIndex = visibleWords.findIndex(w => w.id === word.id);
  const previousIndex = visibleWords.findIndex(w => w.id === highlightedWordId);
  const direction = previousIndex >= 0 && clickedIndex <= previousIndex ? "previous" : "next";
  stopAutoRead(false);
  autoReadWords = visibleWords;
  autoReadIndex = clickedIndex;
  highlightedWordId = word.id;
  refreshAutoReadUi();
  syncPetMenu();
  alignAdjacentReadButton(word.id, direction);
}

function stopAutoRead(clearSelection = true) {
  autoReadRunning = false;
  autoReadStarted = false;
  clearTimeout(autoReadTimer);
  autoReadTimer = null;
  autoReadWaiting = false;
  audioSequenceToken += 1;
  cancelSystemSpeech();
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  hideSentenceCaption();
  if (clearSelection) {
    autoReadIndex = -1;
    highlightedWordId = "";
  }
}

function toggleAutoRead() {
  if (autoReadRunning) {
    pauseAutoRead();
    return;
  }
  if (autoReadIndex < 0) return showNotice("请先点击单词右侧的日语发音按钮选择朗读起点");
  autoReadRunning = true;
  autoReadStarted = true;
  autoReadWaiting = false;
  playAutoWord();
}

function scheduleNextAutoWord() {
  if (!autoReadRunning) return;
  autoReadWaiting = true;
  refreshAutoReadUi();
  animateAutoReadWait();
  clearTimeout(autoReadTimer);
  autoReadTimer = setTimeout(() => {
    autoReadTimer = null;
    autoReadWaiting = false;
    playAutoWord();
  }, autoReadDelay);
}

function skipAutoWord(direction) {
  if (autoReadIndex < 0) return;
  const nextIndex = Math.max(0, Math.min(autoReadWords.length - 1, autoReadIndex + direction));
  if (nextIndex === autoReadIndex) return;
  clearTimeout(autoReadTimer);
  autoReadTimer = null;
  autoReadWaiting = false;
  audioSequenceToken += 1;
  activeAudio?.pause();
  cancelSystemSpeech();
  hideSentenceCaption();
  autoReadIndex = nextIndex;
  highlightedWordId = autoReadWords[autoReadIndex].id;
  if (autoReadRunning) playAutoWord();
  else {
    autoReadStarted = true;
    showAutoReadWord(autoReadWords[autoReadIndex]);
  }
}

function showAutoReadWord(word) {
  const needsRender = currentView === "words" && selectedLesson !== word.lesson;
  highlightedWordId = word.id;
  if (currentView === "words") {
    selectedLesson = word.lesson;
    currentPage = 1;
    if (needsRender) renderWordList("words");
    refreshAutoReadUi();
    requestAnimationFrame(() => document.querySelector(`.word-card[data-id="${word.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  } else refreshAutoReadUi();
  if (state.settings.autoReadPopup) showDetail(word, { suppressAutoAudio: true, keepOpen: true, autoFollow: true });
}

function syncAutoReadPopup() {
  const word = autoReadIndex >= 0 ? autoReadWords[autoReadIndex] : null;
  if (state.settings.autoReadPopup && autoReadRunning && word) {
    showDetail(word, { suppressAutoAudio: true, keepOpen: true, autoFollow: true });
  } else if (!state.settings.autoReadPopup && dialog.open && dialog.dataset.autoFollow === "true") {
    dialog.close();
  }
}

function playAutoWord() {
  if (!autoReadRunning || autoReadIndex < 0 || autoReadIndex >= autoReadWords.length) {
    stopAutoRead(false);
    if (currentView === "words") renderWordList("words");
    return;
  }
  const word = autoReadWords[autoReadIndex];
  activeAudio?.pause();
  showAutoReadWord(word);
  playSequence(audioSequence(word), () => {
    if (!autoReadRunning) return;
    autoReadIndex += 1;
    if (autoReadIndex >= autoReadWords.length) return playAutoWord();
    highlightedWordId = autoReadWords[autoReadIndex].id;
    scheduleNextAutoWord();
  });
}

function studyWords() {
  const scope = selectedLesson ? words.filter(w => w.lesson === selectedLesson) : words;
  const remaining = scope.filter(w => !state.learned.includes(w.id));
  return remaining.length ? remaining : scope;
}

function renderLearn() {
  const list = studyWords();
  studyIndex %= list.length;
  const w = list[studyIndex];
  app.innerHTML = `<div class="study-shell answer-hidden">
    <div class="study-top"><span>${selectedLesson ? `第 ${selectedLesson} 单元 · ` : ""}剩余 ${list.length} 词</span><span>${studyIndex + 1} / ${list.length}</span></div>
    <div class="study-lesson-picker">${lessonSelect()}</div>
    <div class="progress"><i style="width:${((studyIndex + 1) / list.length) * 100}%"></i></div>
    <article class="study-card">
      <p class="pitch">${escapeHtml(w.yindiao)} · ${escapeHtml(w.cixing)}</p>
      <h2 class="study-word">${escapeHtml(w.jp_word)}</h2>
      <p class="study-reading">${escapeHtml(w.hiragana)}${state.settings.showRomaji ? `<small>${escapeHtml(romaji(w.hiragana))}</small>` : ""}</p>
      <button class="ghost" data-audio-id="${w.id}">播放日语发音</button>
      <div class="answer">
        <p class="study-meaning">${escapeHtml(w.zh_word)}</p>
        <p class="study-explain">${escapeHtml(w.chinese || "")}<br>${escapeHtml(w.japanese || "")}</p>
      </div>
    </article>
    <div class="study-actions">
      <button class="ghost" data-reveal>显示答案</button>
      <button class="danger" data-study-result="mistake">不认识</button>
      <button class="primary" data-study-result="learned">认识</button>
      <button class="ghost" data-detail="${w.id}">详细解释</button>
    </div>
  </div>`;
}

function createQuiz() {
  const scope = selectedLesson ? words.filter(w => w.lesson === selectedLesson) : words;
  const correct = scope[Math.floor(Math.random() * scope.length)];
  const options = new Set([correct.id]);
  while (options.size < 4) options.add(scope[Math.floor(Math.random() * scope.length)].id);
  quiz = { correct, options: [...options].sort(() => Math.random() - 0.5), answered: false };
}

function renderQuiz() {
  if (!quiz) createQuiz();
  app.innerHTML = `<div class="study-shell"><div class="study-lesson-picker">${lessonSelect()}</div><article class="quiz-card">
    <p class="pitch">${escapeHtml(quiz.correct.yindiao)} · ${escapeHtml(quiz.correct.cixing)}</p>
    <h2 class="study-word">${escapeHtml(quiz.correct.jp_word)}</h2>
    <p class="study-reading">${escapeHtml(quiz.correct.hiragana)}${state.settings.showRomaji ? `<small>${escapeHtml(romaji(quiz.correct.hiragana))}</small>` : ""}</p>
    <div class="quiz-options">${quiz.options.map(id => {
      const w = words.find(x => x.id === id);
      return `<button class="quiz-option" data-answer="${id}">${escapeHtml(w.zh_word)}</button>`;
    }).join("")}</div>
  </article><div class="study-actions"><button class="ghost" data-audio-id="${quiz.correct.id}">播放发音</button>${quiz.answered ? '<button class="primary" data-next-quiz>下一题</button>' : ""}</div></div>`;
}

function renderSettings() {
  const s = state.settings;
  const repeatOptions = value => [1, 2, 3].map(count => `<option value="${count}" ${repeatCount(value) === count ? "selected" : ""}>${count} 次</option>`).join("");
  const setting = (key, name, description, badge = "") => `<label class="setting-row">
    <span><b>${name}${badge ? ` <em>${badge}</em>` : ""}</b><small>${description}</small></span>
    <input type="checkbox" data-setting="${key}" ${s[key] ? "checked" : ""}><i></i>
  </label>`;
  app.innerHTML = `<div class="settings-panel">
    <div class="settings-section-title">单词详情页设置</div>
    <label class="setting-row speed-row">
      <span><b>默认例句等级 <em>推荐</em></b><small>如所选等级例句不存在，将使用识日提供的其他等级例句</small></span>
      <select id="sentence-level-setting"><option value="N5" ${s.sentenceLevel === "N5" ? "selected" : ""}>N5</option><option value="N4" ${s.sentenceLevel === "N4" ? "selected" : ""}>N4</option><option value="N3" ${s.sentenceLevel === "N3" ? "selected" : ""}>N3</option></select>
    </label>
    <label class="setting-row speed-row">
      <span><b>慢速发音</b><small>单词与例句发音的播放速度</small></span>
      <select id="speed-setting"><option value="0.7" ${s.speed === 0.7 ? "selected" : ""}>0.7 倍</option><option value="0.85" ${s.speed === 0.85 ? "selected" : ""}>0.85 倍</option><option value="1" ${s.speed === 1 ? "selected" : ""}>1.0 倍</option></select>
    </label>
    <label class="setting-row speed-row">
      <span><b>单词朗读次数</b><small>列表、详情页和自动朗读中，每个日语单词连续播放的次数</small></span>
      <select id="word-repeat-setting">${repeatOptions(s.wordRepeat)}</select>
    </label>
    <label class="setting-row speed-row">
      <span><b>例句朗读次数</b><small>点击例句播放或开启例句自动发音时，每条例句连续播放的次数</small></span>
      <select id="sentence-repeat-setting">${repeatOptions(s.sentenceRepeat)}</select>
    </label>
    ${setting("autoPronounce", "自动发音", "进入单词详情页，是否自动发音")}
    ${setting("personFirst", "真人发音优先", "开启后，单词发音优先使用识日真人发音", "推荐")}
    ${setting("chineseAuto", "中文自动发音", "日语单词对应的中文发音，是否自动发音")}
    ${setting("sentenceAuto", "例句自动发音", "日语单词的例句，是否自动发音")}
    ${setting("showRomaji", "显示单词罗马音", "单词列表与详情页是否显示罗马音")}
    ${setting("showSentenceRomaji", "显示例句罗马音", "单词详情中的识日例句是否显示罗马音")}
    <div class="settings-section-title">学习与界面设置</div>
    ${setting("autoReadPopup", "自动朗读显示弹窗", "自动朗读切换单词时，是否同步弹出对应词条详情")}
    <div class="setting-row read-delay-setting">
      <span><b>自动朗读词间停顿</b><small>上一词全部发音结束后，到下一词开始前的实际停顿</small></span>
      <div class="settings-delay-options">${[250, 500, 1000].map(delay => `<button class="delay-option ${autoReadDelay === delay ? "active" : ""}" data-read-delay="${delay}" aria-pressed="${autoReadDelay === delay}">${delay / 1000}秒</button>`).join("")}</div>
    </div>
    ${setting("darkMode", "深色关卡模式", "切换为马里奥夜间城堡主题")}
    <label class="setting-row speed-row">
      <span><b>动画强度</b><small>舒缓模式减少自主移动；关闭后停止装饰动画与彩蛋关卡，查词工具不受影响</small></span>
      <select id="motion-level-setting"><option value="full" ${s.motionLevel === "full" ? "selected" : ""}>完整</option><option value="gentle" ${s.motionLevel === "gentle" ? "selected" : ""}>舒缓</option><option value="off" ${s.motionLevel === "off" ? "selected" : ""}>关闭</option></select>
    </label>
    ${setting("petEnabled", "马里奥互动伙伴", "关闭时马里奥会钻入管道，并停留为工具标识")}
    ${setting("petNeverWake", "永不唤醒马里奥", "开启后点击词条和管道都不会唤醒马里奥，学习工具仍可使用")}
  </div>`;
}

function memorySection(data) {
  const memory = data.memory && !Array.isArray(data.memory) ? data.memory : {};
  const parts = Array.isArray(memory.fenjie) ? memory.fenjie : [];
  const summary = memory.summarize || data.base?.myexplain || "";
  if (!parts.length && !summary) return "";
  return `<section class="detail-section memory-section">
    <h3>识日记忆技巧</h3>
    ${parts.length ? `<div class="memory-parts">${parts.map(part => `<div class="memory-part"><b>${escapeHtml(part.word || "")}</b><span>${escapeHtml(part.yomi || "")}</span><small>${escapeHtml(part.meaning || "")}</small></div>`).join("")}</div>` : ""}
    ${summary ? `<div class="memory-summary">${escapeHtml(summary)}</div>` : ""}
  </section>`;
}

function meaningSupplementSection(word, data) {
  const base = data.base || {};
  const chinese = word.chinese || base.chinese || word.zh_word || base.zh_word || "";
  const japanese = word.japanese || base.japanese || "";
  const moreMeanings = Array.isArray(data.more_means) ? data.more_means.filter(item => item && typeof item === "object") : [];
  if (!chinese && !japanese && !moreMeanings.length) return "";

  const explanationLine = (label, value) => value ? `<div class="explanation-line"><b>${label}</b><span>${escapeHtml(value)}</span></div>` : "";
  return `<section class="detail-section meaning-supplement-section">
    <h3>释义补充</h3>
    <div class="explanation-pair">
      ${explanationLine("中文", chinese)}
      ${explanationLine("日文", japanese)}
    </div>
    ${moreMeanings.length ? `<div class="more-meanings">${moreMeanings.map((item, index) => {
      const meta = [item.hiragana, item.yindiao, item.cixing].filter(Boolean).join(" · ");
      return `<article class="more-meaning-card">
        <div class="more-meaning-head"><b>${escapeHtml(item.zh_word || `其他释义 ${index + 1}`)}</b>${meta ? `<span>${escapeHtml(meta)}</span>` : ""}</div>
        <div class="explanation-pair">
          ${explanationLine("中文", item.chinese || item.zh_word || "")}
          ${explanationLine("日文", item.japanese || "")}
          ${item.myexplain && item.myexplain !== item.chinese ? explanationLine("补充", item.myexplain) : ""}
        </div>
      </article>`;
    }).join("")}</div>` : ""}
  </section>`;
}

function conjugationForm(form) {
  if (!form || typeof form !== "object" || !form.jp_word) return '<span class="conjugation-empty">—</span>';
  const reading = form.hiragana && form.hiragana !== form.jp_word ? `<small>${escapeHtml(form.hiragana)}</small>` : "";
  return `<span class="conjugation-form"><b>${escapeHtml(form.jp_word)}</b>${reading}</span>`;
}

function conjugationTable(title, rows) {
  if (!Array.isArray(rows) || !rows.length) return "";
  return `<section class="detail-section conjugation-section">
    <h3>${title}</h3>
    <div class="conjugation-table-wrap">
      <table class="conjugation-table">
        <thead><tr><th scope="col">形式</th><th scope="col">普通形</th><th scope="col">礼貌形</th></tr></thead>
        <tbody>${rows.map(row => `<tr><th scope="row">${escapeHtml(row.verb_type || "其他")}</th><td>${conjugationForm(row.plain)}</td><td>${conjugationForm(row.polite)}</td></tr>`).join("")}</tbody>
      </table>
    </div>
  </section>`;
}

function conjugationSections(data) {
  const sections = [];
  if (Array.isArray(data.plain_verb) && data.plain_verb.length) {
    sections.push(conjugationTable("动词变形", data.plain_verb));
  }
  const adjective = data.adj_data && !Array.isArray(data.adj_data) ? data.adj_data : null;
  if (adjective && Array.isArray(adjective.data_list) && adjective.data_list.length) {
    const title = adjective.adj_cixing === "na" ? "な形容词变形" : adjective.adj_cixing === "i" ? "い形容词变形" : "形容词变形";
    sections.push(conjugationTable(title, adjective.data_list));
  }
  return sections.join("");
}

function shiriLexicalRows(items, japaneseKey, chineseKey, showPronunciation = false) {
  return `<div class="shiri-lexical-rows" role="list">${items.map(item => {
    const japanese = item[japaneseKey] || "";
    const pronunciation = showPronunciation ? relatedLexicon[japanese] : null;
    const japaneseCell = showPronunciation
      ? `<div class="shiri-lexical-word"><b>${escapeHtml(japanese)}${pronunciation?.yindiao ? ` <span class="shiri-lexical-pitch">${escapeHtml(pronunciation.yindiao)}</span>` : ""}</b>${pronunciation?.hiragana ? `<small>${escapeHtml(pronunciation.hiragana)}</small>` : ""}</div>`
      : `<b>${escapeHtml(japanese)}</b>`;
    return `<div class="shiri-lexical-row" role="listitem">${japaneseCell}<span>${escapeHtml(item[chineseKey] || "")}</span></div>`;
  }).join("")}</div>`;
}

function shiriLexicalSection(data) {
  const memory = data.new_memory && !Array.isArray(data.new_memory) ? data.new_memory : {};
  const groups = [
    { key: "fan", title: "反义词" },
    { key: "jin", title: "近义词" },
    { key: "lian", title: "拓展词" },
  ].map(group => ({ ...group, items: Array.isArray(memory[group.key]) ? memory[group.key].filter(item => item && (item.jp_word || item.zh_word)) : [] }))
    .filter(group => group.items.length);
  const phrases = Array.isArray(data.phrases) ? data.phrases.filter(item => item && (item.jp || item.cn)) : [];
  const hasRelations = groups.length > 0;
  const hasPhrases = phrases.length > 0;
  if (!hasRelations && !hasPhrases) return "";

  const baseId = `shiri-lexical-${String(data.base?.id || "word").replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const initialTab = hasRelations ? "relations" : "phrases";
  const tab = (key, label) => `<button id="${baseId}-tab-${key}" class="shiri-lexical-tab ${initialTab === key ? "active" : ""}" type="button" role="tab" data-lexical-tab="${key}" aria-selected="${initialTab === key}" aria-controls="${baseId}-panel-${key}" tabindex="${initialTab === key ? "0" : "-1"}">${label}</button>`;
  return `<section class="detail-section shiri-lexical-section">
    <div class="shiri-lexical-tabs" role="tablist" aria-label="识日关联词和词组">
      ${hasRelations ? tab("relations", "关联词") : ""}
      ${hasPhrases ? tab("phrases", "词组") : ""}
    </div>
    ${hasRelations ? `<div id="${baseId}-panel-relations" class="shiri-lexical-panel" role="tabpanel" data-lexical-panel="relations" aria-labelledby="${baseId}-tab-relations" ${initialTab === "relations" ? "" : "hidden"}>${groups.map(group => `<section class="shiri-relation-group"><h4>${group.title}</h4>${shiriLexicalRows(group.items, "jp_word", "zh_word", true)}</section>`).join("")}</div>` : ""}
    ${hasPhrases ? `<div id="${baseId}-panel-phrases" class="shiri-lexical-panel" role="tabpanel" data-lexical-panel="phrases" aria-labelledby="${baseId}-tab-phrases" ${initialTab === "phrases" ? "" : "hidden"}>${shiriLexicalRows(phrases, "jp", "cn")}</div>` : ""}
  </section>`;
}

function bindShiriLexicalTabs() {
  detailContent.querySelectorAll(".shiri-lexical-section").forEach(section => {
    const tabs = [...section.querySelectorAll("[data-lexical-tab]")];
    const panels = [...section.querySelectorAll("[data-lexical-panel]")];
    const activate = (tab, focus = false) => {
      tabs.forEach(item => {
        const active = item === tab;
        item.classList.toggle("active", active);
        item.setAttribute("aria-selected", String(active));
        item.tabIndex = active ? 0 : -1;
      });
      panels.forEach(panel => { panel.hidden = panel.dataset.lexicalPanel !== tab.dataset.lexicalTab; });
      if (focus) tab.focus();
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activate(tab));
      tab.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const targetIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        activate(tabs[targetIndex], true);
      });
    });
  });
}

function closeWordTool() {
  brainwashStopped = true;
  brainwashAudio?.pause();
  brainwashAudio = null;
  hideSentenceCaption();
  document.querySelector(".word-tool-overlay")?.remove();
  document.body.classList.remove("word-tool-open");
}

function openSpellTool(word, data) {
  closeWordTool();
  document.body.classList.add("word-tool-open");
  const answers = [...new Set([...(data.correct_spell || []), word.jp_word, word.hiragana].filter(Boolean))];
  document.body.insertAdjacentHTML("beforeend", `<div class="word-tool-overlay spell-tool">
    <button class="word-tool-close" data-tool-close aria-label="返回">‹ 返回</button>
    <div class="spell-card">
      <img class="tool-mario" src="${escapeHtml(assetUrl("/assets/smw/jump.png"))}" alt="" />
      <h2>随手拼</h2>
      <p class="tool-muted">${escapeHtml(word.cixing || "")}</p>
      <div class="spell-clue"><b>${escapeHtml(word.zh_word || "")}</b><small>日文　${escapeHtml(word.japanese || "")}</small></div>
      <input id="spell-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="请输入日文" />
      <div class="spell-feedback" aria-live="polite"></div>
      <div class="spell-actions"><button class="ghost" data-spell-audio>播放发音</button><button class="ghost" data-spell-answer>显示答案</button><button class="primary" data-spell-check>确认</button></div>
    </div>
  </div>`);
  const overlay = document.querySelector(".spell-tool");
  const input = overlay.querySelector("#spell-input");
  const feedback = overlay.querySelector(".spell-feedback");
  const check = () => {
    const value = input.value.trim();
    if (!value) return;
    const correct = answers.includes(value);
    input.classList.toggle("correct", correct);
    input.classList.toggle("wrong", !correct);
    feedback.className = `spell-feedback ${correct ? "correct" : "wrong"}`;
    feedback.textContent = correct ? "拼写正确" : "再试一次";
    if (correct) play(wordAudio(word, state.settings.personFirst && word.person_audio ? "person" : "jp"), state.settings.speed, "jump", null, state.settings.wordRepeat);
  };
  input.addEventListener("keydown", event => { if (event.key === "Enter") check(); });
  overlay.querySelector("[data-spell-check]").onclick = check;
  overlay.querySelector("[data-spell-answer]").onclick = () => {
    input.value = answers[0];
    feedback.className = "spell-feedback";
    feedback.textContent = answers.join(" / ");
  };
  overlay.querySelector("[data-spell-audio]").onclick = () => play(wordAudio(word, state.settings.personFirst && word.person_audio ? "person" : "jp"), state.settings.speed, "jump", null, state.settings.wordRepeat);
  overlay.querySelector("[data-tool-close]").onclick = closeWordTool;
  requestAnimationFrame(() => input.focus());
}

function brainwashSettingsMarkup() {
  const s = state.brainwash;
  return `<div class="brainwash-settings">
    <div class="brainwash-setting"><span><b>自动播放句子</b><small>每次单词发音后播放例句</small></span><label class="mini-switch"><input type="checkbox" data-brainwash-setting="sentence" ${s.sentence ? "checked" : ""}><i></i></label></div>
    <label class="brainwash-setting"><span><b>单词发音速度</b></span><select data-brainwash-setting="wordSpeed"><option value="0.7" ${s.wordSpeed === 0.7 ? "selected" : ""}>0.7 倍</option><option value="1" ${s.wordSpeed === 1 ? "selected" : ""}>1 倍</option><option value="1.25" ${s.wordSpeed === 1.25 ? "selected" : ""}>1.25 倍</option></select></label>
    <label class="brainwash-setting"><span><b>句子播放速度</b></span><select data-brainwash-setting="sentenceSpeed"><option value="0.7" ${s.sentenceSpeed === 0.7 ? "selected" : ""}>0.7 倍</option><option value="1" ${s.sentenceSpeed === 1 ? "selected" : ""}>1 倍</option><option value="1.25" ${s.sentenceSpeed === 1.25 ? "selected" : ""}>1.25 倍</option></select></label>
    <label class="brainwash-setting"><span><b>洗脑播放次数</b></span><select data-brainwash-setting="count"><option value="5" ${s.count === 5 ? "selected" : ""}>5 次</option><option value="10" ${s.count === 10 ? "selected" : ""}>10 次</option><option value="20" ${s.count === 20 ? "selected" : ""}>20 次</option><option value="30" ${s.count === 30 ? "selected" : ""}>30 次</option></select></label>
    <button class="primary" data-brainwash-restart>应用并重新开始</button>
  </div>`;
}

function openBrainwashTool(word, data) {
  closeWordTool();
  document.body.classList.add("word-tool-open");
  brainwashStopped = false;
  document.body.insertAdjacentHTML("beforeend", `<div class="word-tool-overlay brainwash-tool">
    <button class="word-tool-close" data-tool-close aria-label="退出">×</button>
    <div class="brainwash-main">
      <img class="tool-mario brainwash-mario" src="${escapeHtml(assetUrl("/assets/smw/run-2.png"))}" alt="" />
      <h2>洗脑中...</h2>
      <strong class="brainwash-word">${escapeHtml(word.jp_word)}</strong>
      <span>${escapeHtml(word.hiragana)} · ${escapeHtml(word.zh_word)}</span>
      <p>剩余次数：<b data-brainwash-remaining>${state.brainwash.count}</b></p>
      <small>点击关闭按钮即可退出</small>
      <button class="ghost" data-brainwash-settings>设置</button>
    </div>
    <div class="brainwash-settings-shell" hidden><h2>洗脑设置</h2>${brainwashSettingsMarkup()}</div>
  </div>`);
  const overlay = document.querySelector(".brainwash-tool");
  const main = overlay.querySelector(".brainwash-main");
  const settingsShell = overlay.querySelector(".brainwash-settings-shell");
  const playRound = remaining => {
    if (brainwashStopped || remaining <= 0) {
      if (!brainwashStopped) overlay.querySelector(".brainwash-main h2").textContent = "洗脑完成";
      return;
    }
    overlay.querySelector("[data-brainwash-remaining]").textContent = remaining;
    const type = state.settings.personFirst && word.person_audio ? "person" : "jp";
    const sequence = [{ url: wordAudio(word, type), rate: state.brainwash.wordSpeed }];
    const sentence = detailSentence(data);
    const sentenceUrl = sentenceItemAudio(sentence);
    if (state.brainwash.sentence && sentenceUrl) sequence.push({ url: sentenceUrl, rate: state.brainwash.sentenceSpeed, caption: sentence });
    let index = 0;
    const next = () => {
      if (brainwashStopped) return;
      if (index >= sequence.length) return setTimeout(() => playRound(remaining - 1), 350);
      const item = sequence[index++];
      if (!item?.url || item.url === "undefined") return next();
      brainwashAudio = new Audio(item.url);
      brainwashAudio.playbackRate = item.rate;
      const captionToken = item.caption ? showSentenceCaption(item.caption, item.rate || 1) : 0;
      let advanced = false;
      const advance = () => {
        if (advanced) return;
        advanced = true;
        if (captionToken) hideSentenceCaption(captionToken);
        next();
      };
      brainwashAudio.onended = advance;
      brainwashAudio.onerror = advance;
      brainwashAudio.onloadedmetadata = () => {
        if (captionToken && Number.isFinite(brainwashAudio.duration) && brainwashAudio.duration > 0) {
          armSentenceCaptionTimeout(captionToken, brainwashAudio.duration / Math.max(.25, brainwashAudio.playbackRate) * 1000 + 800);
        }
      };
      brainwashAudio.play().catch(advance);
    };
    next();
  };
  overlay.querySelector("[data-tool-close]").onclick = closeWordTool;
  overlay.querySelector("[data-brainwash-settings]").onclick = () => { main.hidden = true; settingsShell.hidden = false; brainwashAudio?.pause(); hideSentenceCaption(); };
  overlay.addEventListener("change", event => {
    const key = event.target.dataset.brainwashSetting;
    if (!key) return;
    state.brainwash[key] = event.target.type === "checkbox" ? event.target.checked : Number(event.target.value);
    saveState();
  });
  overlay.querySelector("[data-brainwash-restart]").onclick = () => { brainwashStopped = false; settingsShell.hidden = true; main.hidden = false; playRound(state.brainwash.count); };
  playRound(state.brainwash.count);
}

function resetDialogScroll() {
  dialog.scrollTop = 0;
  detailContent.scrollTop = 0;
  requestAnimationFrame(() => {
    dialog.scrollTop = 0;
    detailContent.scrollTop = 0;
  });
}

function dialogHeights() {
  return {
    collapsed: innerWidth <= 900 ? 220 : 235,
    expanded: Math.min(innerHeight * (innerWidth <= 900 ? 0.76 : 0.78), 760),
  };
}

function flushDialogDragFrame() {
  if (dialogDragFrame !== null) cancelAnimationFrame(dialogDragFrame);
  dialogDragFrame = null;
  if (dialogDragOffset === null) return;
  dialog.style.setProperty("--dialog-drag-offset", `${dialogDragOffset}px`);
  dialogDragOffset = null;
}

function queueDialogDragOffset(offset) {
  dialogDragOffset = offset;
  if (dialogDragFrame !== null) return;
  dialogDragFrame = requestAnimationFrame(flushDialogDragFrame);
}

function finishDialogDrag() {
  flushDialogDragFrame();
  requestAnimationFrame(() => {
    dialog.classList.remove("dragging");
    dialog.style.removeProperty("--dialog-drag-offset");
  });
}

async function showDetail(word, options = {}) {
  if (dialog.open && openDetailWordId === word.id) {
    if (options.keepOpen && !options.autoFollow) return;
    dialog.close();
    openDetailWordId = "";
    return;
  }
  const requestToken = ++detailRequestToken;
  currentDetailWord = word;
  openDetailWordId = word.id;
  dialog.classList.toggle("auto-following", Boolean(options.autoFollow));
  dialog.dataset.autoFollow = String(Boolean(options.autoFollow));
  dialog.classList.remove("expanded");
  notePetInteraction();
  resetDialogScroll();
  if (!dialog.open) dialog.show();
  detailContent.innerHTML = '<div class="loading">正在读取本地词条详情...</div>';
  try {
    let data;
    let levelSentences = {};
    if (window.__STANDALONE__) await ensureDetailData();
    if (window.__DETAILS__) {
      data = window.__DETAILS__[word.id];
      if (!data) throw new Error("未找到词条详情");
      levelSentences = window.__SENTENCES__?.[word.id] || {};
    } else {
      const [response, sentenceResponse] = await Promise.all([
        fetch(`/local-data/details/${word.id}.json`),
        fetch(`/local-data/sentences/${word.id}.json`).catch(() => null),
      ]);
      data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "获取失败");
      if (sentenceResponse?.ok) levelSentences = await sentenceResponse.json();
    }
    if (requestToken !== detailRequestToken || openDetailWordId !== word.id) return;
    sentenceLevelCache.set(word.id, levelSentences);
    const displayData = selectSentenceDetail(data, levelSentences);
    currentDetailData = displayData;
    const sentence = Array.isArray(displayData.sentence) ? displayData.sentence : displayData.sentence?.jp ? [displayData.sentence] : [];
    const grammar = displayData.grammar || [];
    const sentenceSelection = displayData.sentence_selection || {};
    if (state.settings.autoPronounce && !options.suppressAutoAudio) {
      pauseAutoRead();
      playSequence(audioSequence(word, displayData));
    }
    detailContent.innerHTML = `
      <div class="detail-summary">
        <div class="detail-head">${options.autoFollow ? `<span class="auto-follow-badge">自动朗读 · ${autoReadWords.findIndex(item => item.id === word.id) + 1}/${autoReadWords.length}</span>` : ""}<h2>${escapeHtml(word.jp_word)} <span class="pitch">${escapeHtml(word.yindiao)}</span></h2><p>${escapeHtml(word.hiragana)} · ${escapeHtml(word.cixing)}</p>${state.settings.showRomaji ? `<small class="romaji">${escapeHtml(romaji(word.hiragana))}</small>` : ""}</div>
        <div class="detail-meaning"><b>${escapeHtml(word.zh_word)}</b><small>${escapeHtml(word.chinese || "")}</small></div>
      </div>
      <div class="study-actions">
        <button class="ghost" data-dialog-audio="jp">日语发音</button>
        ${word.person_audio ? '<button class="ghost" data-dialog-audio="person">识日真人发音</button>' : ""}
        <button class="ghost" data-dialog-audio="cn">识日中文发音</button>
        <button class="ghost ${state.favorites.includes(word.id) ? "on" : ""}" data-dialog-favorite aria-pressed="${state.favorites.includes(word.id)}">${state.favorites.includes(word.id) ? "已收藏" : "收藏"}</button>
        <button class="ghost ${state.learned.includes(word.id) ? "on" : ""}" data-dialog-learned aria-pressed="${state.learned.includes(word.id)}">${state.learned.includes(word.id) ? "已掌握" : "标记掌握"}</button>
      </div>
      ${meaningSupplementSection(word, data)}
      ${memorySection(data)}
      ${sentence.length ? `<section class="detail-section"><h3>识日例句 · ${escapeHtml(sentence[0].level || "未标注")}${sentenceSelection.fallback ? ` <small class="sentence-level-fallback">识日暂无 ${escapeHtml(sentenceSelection.requested)}，已使用 ${escapeHtml(sentenceSelection.actual || "现有等级")}</small>` : ""}</h3>${sentence.slice(0, 20).map(x => `<div class="detail-item sentence-item"><div><b>${escapeHtml(x.jp || x.sentence || x.japanese || "")}</b>${state.settings.showSentenceRomaji ? `<span class="sentence-romaji">${escapeHtml(sentenceRomaji(x, displayData))}</span>` : ""}<small>${escapeHtml(x.cn || x.translate || x.chinese || "")}</small></div>${sentenceItemAudio(x) ? `<button class="sentence-audio-button" data-sentence-audio="${escapeHtml(x.id)}" aria-label="播放例句发音" title="播放例句发音">▶</button>` : ""}</div>`).join("")}</section>` : '<section class="detail-section"><h3>识日例句</h3><div class="detail-item"><small>识日暂无 N5、N4 或 N3 例句</small></div></section>'}
      ${grammar.length ? `<section class="detail-section"><h3>例句分词与语法</h3><div class="grammar-grid">${grammar.slice(0, 30).map(x => `<div class="grammar-item"><b>${escapeHtml(x.jp || "")}</b><span>${escapeHtml(x.hiragana || "")}</span><small>${escapeHtml([x.cixing, x.mean].filter(Boolean).join(" · "))}</small></div>`).join("")}</div></section>` : ""}
      ${shiriLexicalSection(data)}
      ${conjugationSections(data)}`;
    resetDialogScroll();
    bindShiriLexicalTabs();
    detailContent.querySelectorAll("[data-dialog-audio]").forEach(button => button.onclick = () => {
      const type = button.dataset.dialogAudio;
      if (type === "cn") return playChineseMeaning(word);
      return play(wordAudio(word, type), state.settings.speed, type === "person" ? "wave" : "jump", null, state.settings.wordRepeat);
    });
    detailContent.querySelectorAll("[data-sentence-audio]").forEach(button => button.onclick = () => {
      const selectedSentence = sentence.find(item => String(item.id) === String(button.dataset.sentenceAudio));
      play(sentenceItemAudio(selectedSentence), state.settings.speed, "dash", selectedSentence, state.settings.sentenceRepeat);
    });
    detailContent.querySelector("[data-dialog-favorite]").onclick = event => {
      const enabled = !state.favorites.includes(word.id);
      setInList("favorites", word.id, enabled);
      event.currentTarget.classList.toggle("on", enabled);
      event.currentTarget.setAttribute("aria-pressed", String(enabled));
      event.currentTarget.textContent = enabled ? "已收藏" : "收藏";
      document.querySelector(`.word-card[data-id="${word.id}"] .smw-favorite`)?.classList.toggle("on", enabled);
    };
    detailContent.querySelector("[data-dialog-learned]").onclick = event => {
      const enabled = !state.learned.includes(word.id);
      setInList("learned", word.id, enabled);
      event.currentTarget.classList.toggle("on", enabled);
      event.currentTarget.setAttribute("aria-pressed", String(enabled));
      event.currentTarget.textContent = enabled ? "已掌握" : "标记掌握";
      document.querySelector(`.word-card[data-id="${word.id}"] .smw-learned`)?.classList.toggle("on", enabled);
    };
    if (mascotAwake && !marioPet.classList.contains("pet-awakening")) mascotReact("jump");
    return displayData;
  } catch (error) {
    detailContent.innerHTML = `<div class="empty error">${escapeHtml(error.message)}</div>`;
  }
}

function navigate(view) {
  if (view !== "words" && autoReadRunning) pauseAutoRead();
  if (dialog.open) dialog.close();
  currentView = view;
  currentPage = 1;
  document.querySelectorAll(".nav-item").forEach(x => x.classList.toggle("active", x.dataset.view === view));
  const names = { home: "学习总览", words: "全部单词", learn: "开始学习", quiz: "词汇测试", favorites: "收藏词", mistakes: "错题集", settings: "用户设置" };
  title.textContent = names[view];
  if (view === "home") renderHome();
  else if (["words", "favorites", "mistakes"].includes(view)) renderWordList(view);
  else if (view === "learn") renderLearn();
  else if (view === "quiz") { quiz = null; renderQuiz(); }
  else if (view === "settings") renderSettings();
  if (mascotAwake && !marioPet.classList.contains("pet-awakening")) {
    setTimeout(() => setPetAction(view === "settings" ? "point" : "idle", 800), 80);
    notePetInteraction();
  }
}

function assignLessons() {
  let lesson = 1;
  for (const word of words) {
    word.lesson = lesson;
    if (word.jp_word === LESSON_ENDS[lesson - 1] && lesson < LESSON_ENDS.length) lesson += 1;
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  const card = event.target.closest(".word-card");
  if (button?.dataset.view) return navigate(button.dataset.view);
  if (button?.dataset.go) return navigate(button.dataset.go);
  if (button?.hasAttribute("data-random")) return showDetail(words[Math.floor(Math.random() * words.length)]);
  if (button?.dataset.page) {
    currentPage += Number(button.dataset.page);
    renderWordList();
    scrollWordListToTop();
    return;
  }
  if (button?.dataset.readDelay) return setAutoReadDelay(Number(button.dataset.readDelay));
  if (card && button?.dataset.audio) {
    const word = words.find(w => w.id === card.dataset.id);
    selectReadStart(word);
    const type = state.settings.personFirst && word.person_audio ? "person" : "jp";
    return play(wordAudio(word, type), state.settings.speed, "jump", null, state.settings.wordRepeat);
  }
  if (card && button?.hasAttribute("data-favorite")) { const id = card.dataset.id; setInList("favorites", id, !state.favorites.includes(id)); return renderWordList(); }
  if (card && button?.hasAttribute("data-learned")) { const id = card.dataset.id; setInList("learned", id, !state.learned.includes(id)); return renderWordList(); }
  if (button?.dataset.detail) return showDetail(words.find(w => w.id === button.dataset.detail));
  if (card && event.target.closest(".word-main")) {
    const word = words.find(w => w.id === card.dataset.id);
    wakePetFromWordCard(card);
    if (mascotAwake) reactNearCard(card);
    if (searchInput.value.trim()) return locateWord(word);
    return showDetail(word);
  }
  if (button?.hasAttribute("data-auto-toggle")) {
    return toggleAutoRead();
  }
  if (button?.dataset.autoSkip) return skipAutoWord(Number(button.dataset.autoSkip));
  if (button?.dataset.audioId) {
    const word = words.find(w => w.id === button.dataset.audioId);
    const type = state.settings.personFirst && word.person_audio ? "person" : "jp";
    return play(wordAudio(word, type), state.settings.speed, "jump", null, state.settings.wordRepeat);
  }
  if (button?.hasAttribute("data-reveal")) return document.querySelector(".study-shell").classList.remove("answer-hidden");
  if (button?.dataset.studyResult) {
    const w = studyWords()[studyIndex];
    if (button.dataset.studyResult === "learned") { setInList("learned", w.id, true); setInList("mistakes", w.id, false); record("已掌握", w); }
    else { setInList("mistakes", w.id, true); record("加入错题", w); studyIndex += 1; }
    return renderLearn();
  }
  if (button?.dataset.answer && !quiz.answered) {
    quiz.answered = true;
    const correct = button.dataset.answer === quiz.correct.id;
    setInList("mistakes", quiz.correct.id, !correct);
    if (correct) setInList("learned", quiz.correct.id, true);
    record(correct ? "测试正确" : "测试错误", quiz.correct);
    renderQuiz();
    document.querySelectorAll("[data-answer]").forEach(x => {
      if (x.dataset.answer === quiz.correct.id) x.classList.add("correct");
      else if (x.dataset.answer === button.dataset.answer) x.classList.add("wrong");
    });
    return;
  }
  if (button?.hasAttribute("data-next-quiz")) { createQuiz(); return renderQuiz(); }
});

document.addEventListener("change", (event) => {
  if (event.target.dataset.setting) {
    state.settings[event.target.dataset.setting] = event.target.checked;
    saveState();
    if (event.target.dataset.setting === "petEnabled") {
      if (event.target.checked) restorePet();
      else retirePet();
    }
    if (event.target.dataset.setting === "petNeverWake" && event.target.checked) retirePet();
    if (event.target.dataset.setting === "darkMode") applyTheme();
    if (event.target.dataset.setting === "autoReadPopup") syncAutoReadPopup();
    syncPetMenu();
    return;
  }
  if (event.target.id === "speed-setting") {
    state.settings.speed = Number(event.target.value);
    saveState();
    return;
  }
  if (event.target.id === "word-repeat-setting" || event.target.id === "sentence-repeat-setting") {
    const key = event.target.id === "word-repeat-setting" ? "wordRepeat" : "sentenceRepeat";
    state.settings[key] = repeatCount(event.target.value);
    saveState();
    return;
  }
  if (event.target.id === "sentence-level-setting") {
    state.settings.sentenceLevel = event.target.value;
    saveState();
    return;
  }
  if (event.target.id === "motion-level-setting") {
    state.settings.motionLevel = event.target.value;
    saveState();
    applyTheme();
    if (state.settings.motionLevel === "off") {
      stopMascotBehavior();
      if (easterCourseRunning) cancelEasterLevel();
      if (mascotAwake) setPetAction("idle");
    } else if (mascotAwake && state.settings.petEnabled) scheduleMascotBehavior(5000);
    return;
  }
  if (event.target.id !== "lesson-select") return;
  stopAutoRead();
  selectedLesson = Number(event.target.value);
  currentPage = 1;
  studyIndex = 0;
  quiz = null;
  if (currentView === "learn") renderLearn();
  else if (currentView === "quiz") renderQuiz();
  else renderWordList("words");
});

document.addEventListener("keydown", event => {
  const wordMain = event.target.closest(".word-main");
  if (!wordMain || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  wordMain.click();
});

function runSearch() {
  clearTimeout(searchTimer);
  stopAutoRead();
  selectedLesson = 0;
  highlightedWordId = "";
  currentView = "words";
  currentPage = 1;
  navigate("words");
}

document.querySelector("#search-button").onclick = runSearch;
searchInput.addEventListener("compositionstart", () => { searchComposing = true; });
searchInput.addEventListener("compositionend", () => {
  searchComposing = false;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 180);
});
searchInput.addEventListener("input", () => {
  if (searchComposing) return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 180);
});
searchInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    runSearch();
  }
  if (event.key === "Escape") {
    if (searchInput.value) {
      searchInput.value = "";
      runSearch();
    } else searchInput.blur();
  }
});
document.addEventListener("keydown", event => {
  if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.target.matches("input, textarea, select")) return;
  event.preventDefault();
  searchInput.focus();
  searchInput.select();
});
document.addEventListener("keydown", event => {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  if (document.querySelector(".word-tool-overlay")) {
    event.preventDefault();
    closeWordTool();
    return;
  }
  if (!marioPetMenu.hidden) {
    event.preventDefault();
    marioPetMenu.hidden = true;
  }
});
dialog.querySelector(".dialog-close").onclick = () => {
  dialog.close();
  openDetailWordId = "";
};
dialog.addEventListener("close", () => {
  detailRequestToken += 1;
  openDetailWordId = "";
  dialog.classList.remove("expanded");
  dialog.classList.remove("auto-following");
  dialog.classList.remove("dragging");
  dialog.style.removeProperty("--dialog-drag-offset");
  dialogDragOffset = null;
  if (dialogDragFrame !== null) cancelAnimationFrame(dialogDragFrame);
  dialogDragFrame = null;
  delete dialog.dataset.autoFollow;
  if (mascotAwake) mascotReact("jump");
  resetDialogScroll();
});
dialog.addEventListener("click", event => {
  if (Date.now() < suppressDialogClickUntil) return;
  if (!event.target.closest("button, a, select, input")) dialog.classList.add("expanded");
});
dialog.addEventListener("touchstart", event => {
  if (event.touches.length !== 1) return;
  dialogTouchStartY = event.touches[0].clientY;
  const heights = dialogHeights();
  const visibleHeight = innerHeight - dialog.getBoundingClientRect().top;
  dialogTouchStartHeight = Math.max(heights.collapsed, Math.min(heights.expanded, visibleHeight));
  dialogTouchDragging = false;
}, { passive: true });
dialog.addEventListener("touchmove", event => {
  if (event.touches.length !== 1) return;
  const delta = dialogTouchStartY - event.touches[0].clientY;
  const expanded = dialog.classList.contains("expanded");
  const canExpand = !expanded && delta > 0;
  const canCollapse = expanded && dialog.scrollTop <= 0 && delta < 0;
  if (!canExpand && !canCollapse && !dialogTouchDragging) return;
  dialogTouchDragging = true;
  suppressDialogClickUntil = Date.now() + 500;
  event.preventDefault();
  const { collapsed: collapsedHeight, expanded: expandedHeight } = dialogHeights();
  const height = Math.max(collapsedHeight, Math.min(expandedHeight, dialogTouchStartHeight + delta));
  dialog.classList.add("dragging");
  queueDialogDragOffset(expandedHeight - height);
}, { passive: false });
dialog.addEventListener("touchend", event => {
  if (!dialogTouchDragging) return;
  const endY = event.changedTouches[0]?.clientY ?? dialogTouchStartY;
  const delta = dialogTouchStartY - endY;
  if (delta > 45) dialog.classList.add("expanded");
  if (delta < -45) {
    dialog.classList.remove("expanded");
    resetDialogScroll();
  }
  finishDialogDrag();
  dialogTouchDragging = false;
});
dialog.addEventListener("touchcancel", () => {
  finishDialogDrag();
  dialogTouchDragging = false;
});
let observedDialogOpen = dialog.open;
let observedDialogExpanded = dialog.classList.contains("expanded");
new MutationObserver(() => {
  const isOpen = dialog.open;
  const isExpanded = dialog.classList.contains("expanded");
  const expansionChanged = isOpen && observedDialogOpen && isExpanded !== observedDialogExpanded;
  observedDialogOpen = isOpen;
  observedDialogExpanded = isExpanded;
  if (!mascotAwake || !expansionChanged) return;
  if (isExpanded) movePetToRoute(undefined, "climb");
  else setPetAction("jump", 900);
  notePetInteraction();
}).observe(dialog, { attributes: true, attributeFilter: ["class", "open"] });

async function openPetTool(type) {
  marioPetMenu.hidden = true;
  if (type === "read-toggle") return toggleAutoRead();
  if (type === "read-popup") {
    state.settings.autoReadPopup = !state.settings.autoReadPopup;
    saveState();
    refreshAutoReadUi();
    syncAutoReadPopup();
    marioPetMenu.hidden = false;
    return;
  }
  if (type === "read-delay") {
    const delays = [250, 500, 1000];
    setAutoReadDelay(delays[(delays.indexOf(autoReadDelay) + 1) % delays.length]);
    marioPetMenu.hidden = false;
    return;
  }
  if (type === "theme") {
    state.settings.darkMode = !state.settings.darkMode;
    saveState();
    applyTheme();
    syncPetMenu();
    if (currentView === "settings") renderSettings();
    return;
  }
  if (type === "retire") {
    state.settings.petEnabled = false;
    saveState();
    retirePet();
    return;
  }
  if (type === "wake") {
    state.settings.petNeverWake = false;
    saveState();
    restorePet();
    return;
  }
  const word = currentDetailWord || words[Math.floor(Math.random() * words.length)];
  let data = currentDetailData && currentDetailWord?.id === word.id ? currentDetailData : getDetail(word);
  if (!data && window.__STANDALONE__) {
    showNotice("首次使用学习工具，正在准备词条详情...");
    try {
      await ensureDetailData();
      data = getDisplayDetail(word);
    } catch (error) {
      showNotice(error.message || "词条详情加载失败");
      return;
    }
  }
  if (!data && !window.__DETAILS__) {
    const response = await fetch(`/local-data/details/${word.id}.json`);
    data = await response.json();
  }
  if (!data) return showNotice("未找到这个单词的详情");
  if (type === "spell") openSpellTool(word, data);
  if (type === "brainwash") openBrainwashTool(word, data);
}

marioPet.addEventListener("pointerdown", event => {
  if (event.target.closest(".mario-pet-menu")) return;
  if (easterCourseRunning) return;
  const retired = marioPet.classList.contains("pet-retired");
  const preview = marioPet.classList.contains("pet-pipe-preview");
  if (!mascotAwake && !retired && !preview) return;
  petPointerStart = { x: event.clientX, y: event.clientY, time: Date.now(), moved: false, retired, preview };
  marioPet.setPointerCapture(event.pointerId);
  marioPet.classList.add("pet-grabbed");
});

function flushPetDragPosition() {
  if (petDragFrame !== null) cancelAnimationFrame(petDragFrame);
  petDragFrame = null;
  if (!petDragPoint) return;
  const { x, y } = petDragPoint;
  petDragPoint = null;
  marioPet.style.setProperty("--pet-x", `${Math.max(8, Math.min(window.innerWidth - 66, x - 32))}px`);
  marioPet.style.setProperty("--pet-y", `${Math.max(42, Math.min(window.innerHeight - 90, y - 44))}px`);
}

window.addEventListener("pointermove", event => {
  if (!petPointerStart) return;
  if (Math.hypot(event.clientX - petPointerStart.x, event.clientY - petPointerStart.y) > 6) petPointerStart.moved = true;
  if (!petPointerStart.moved) return;
  petDragPoint = { x: event.clientX, y: event.clientY };
  if (petDragFrame === null) petDragFrame = requestAnimationFrame(flushPetDragPosition);
}, { passive: true });
window.addEventListener("pointerup", event => {
  if (!petPointerStart) return;
  flushPetDragPosition();
  const start = petPointerStart;
  const showMenu = !start.moved || Date.now() - start.time > 420;
  petPointerStart = null;
  marioPet.classList.remove("pet-grabbed");
  if (start.moved && (start.retired || start.preview)) {
    const r = marioPet.getBoundingClientRect();
    state.settings.pipeX = r.left;
    state.settings.pipeY = r.top;
    saveState();
    marioPetMenu.hidden = true;
    notePetInteraction();
    return;
  }
  if (start.retired) return showPipePreview();
  if (start.preview) return hidePipePreview();
  if (showMenu) {
    syncPetMenu();
    marioPetMenu.hidden = !marioPetMenu.hidden;
  } else notePetInteraction();
});
window.addEventListener("pointercancel", () => {
  if (petDragFrame !== null) cancelAnimationFrame(petDragFrame);
  petDragFrame = null;
  petDragPoint = null;
  petPointerStart = null;
  marioPet.classList.remove("pet-grabbed");
});
marioPet.addEventListener("keydown", event => {
  if (event.key !== "Enter" && event.key !== " ") return;
  if (marioPet.classList.contains("pet-retired")) return showPipePreview();
  if (marioPet.classList.contains("pet-pipe-preview")) return hidePipePreview();
  if (mascotAwake) {
    syncPetMenu();
    marioPetMenu.hidden = !marioPetMenu.hidden;
  }
});
marioPetMenu.addEventListener("click", event => {
  const tool = event.target.closest("[data-pet-tool]")?.dataset.petTool;
  if (tool) openPetTool(tool);
});
window.addEventListener("resize", () => {
  clearTimeout(petResizeTimer);
  petResizeTimer = setTimeout(() => {
    if (mascotAwake) movePetToRoute(undefined, "skid");
    else if (!state.settings.petEnabled || state.settings.petNeverWake) positionRetiredPet();
    if (!marioPetMenu.hidden) positionPetMenu();
  }, 140);
}, { passive: true });
["pointerdown", "keydown", "touchstart"].forEach(type => document.addEventListener(type, event => {
  if (!event.target.closest(".mario-pet")) notePetInteraction();
}, { passive: true }));
document.addEventListener("scroll", notePetInteraction, { passive: true });

const easterLevel = document.querySelector(".easter-level");
const easterTrack = document.querySelector(".easter-track");
const courseTime = document.querySelector("#course-time");
const EASTER_COURSE_DURATION = 65000;
const easterActionEvents = [[650, "run"], [5200, "jump"], [6500, "fall"], [7600, "spin"], [8750, "run"], [10300, "slide"], [11600, "jump"], [12900, "fall"], [14300, "run"], [16100, "jump"], [17700, "spin"], [18800, "run"], [20400, "fly"], [23100, "dive"], [24500, "fly"], [26400, "fall"], [27700, "run"], [29400, "crouch"], [30500, "jump"], [31900, "fall"], [33100, "run"], [34800, "climb"], [36300, "jump"], [37600, "run"], [39700, "spin"], [41000, "fall"], [42200, "run"], [44200, "yoshi-summon"], [45500, "yoshi-run"], [48200, "yoshi-tongue"], [49500, "yoshi-jump"], [51400, "yoshi-run"], [53600, "yoshi-fly"], [56200, "yoshi-run"], [58200, "yoshi-jump"], [59800, "yoshi-celebrate"], [61000, "victory"], [62000, "run"]];
const easterImpactEvents = [6500, 12900, 26400, 31900, 41000, 49500, 59800];
let easterTimelineFrame = null;
let easterTimelineStartedAt = 0;
let easterActionIndex = 0;
let easterImpactIndex = 0;
let easterImpactUntil = -1;
let easterEnemyFrame = -1;
let easterLastClock = -1;
let easterKoopas = [];
let easterGaloombas = [];
let easterOffscreenTimer = null;
let easterRecoveryTimer = null;
let easterLevelInViewport = false;
let easterViewportFrame = null;

function stopEasterTimeline() {
  if (easterTimelineFrame !== null) cancelAnimationFrame(easterTimelineFrame);
  easterTimelineFrame = null;
  easterTimelineStartedAt = 0;
}

function updateEasterEnemyFrames(elapsed) {
  const frame = Math.floor(elapsed / 180) % 2;
  if (frame === easterEnemyFrame) return;
  easterEnemyFrame = frame;
  easterKoopas.forEach(enemy => setMotionImage(enemy, frame ? "/assets/smw/egg-koopa-walk-1.png" : "/assets/smw/egg-koopa-walk-2.png"));
  easterGaloombas.forEach(enemy => setMotionImage(enemy, frame ? "/assets/smw/course-galoomba-1.png" : "/assets/smw/course-galoomba-2.png"));
}

function runEasterTimeline(timestamp) {
  if (!easterCourseRunning) return;
  if (!easterTimelineStartedAt) easterTimelineStartedAt = timestamp;
  const elapsed = timestamp - easterTimelineStartedAt;

  while (easterActionIndex < easterActionEvents.length && easterActionEvents[easterActionIndex][0] <= elapsed) {
    setPetAction(easterActionEvents[easterActionIndex][1]);
    easterActionIndex += 1;
  }
  while (easterImpactIndex < easterImpactEvents.length && easterImpactEvents[easterImpactIndex] <= elapsed) {
    const impactAt = easterImpactEvents[easterImpactIndex];
    if (elapsed - impactAt <= 340) {
      easterImpactUntil = impactAt + 340;
      easterLevel.classList.add("course-impact");
    }
    easterImpactIndex += 1;
  }
  if (easterImpactUntil >= 0 && elapsed >= easterImpactUntil) {
    easterLevel.classList.remove("course-impact");
    easterImpactUntil = -1;
  }

  easterLevel.classList.toggle("course-cave-active", elapsed >= 34800 && elapsed < 45600);
  easterLevel.classList.toggle("course-sprint-active", elapsed >= 45800);
  const remaining = Math.max(0, 300 - Math.floor(elapsed / 1000) * 3);
  if (remaining !== easterLastClock) {
    easterLastClock = remaining;
    courseTime.textContent = remaining;
  }
  updateEasterEnemyFrames(elapsed);

  if (elapsed >= EASTER_COURSE_DURATION) return finishEasterLevel();
  easterTimelineFrame = requestAnimationFrame(runEasterTimeline);
}

function easterLevelIsVisible() {
  const r = easterLevel?.getBoundingClientRect();
  return r && r.top < innerHeight * .72 && r.bottom > innerHeight * .45;
}
function easterLevelIntersectsViewport() {
  const r = easterLevel?.getBoundingClientRect();
  return Boolean(r && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth);
}
function positionPetAfterCourse() {
  marioPet.style.setProperty("--pet-x", `${Math.max(12, innerWidth - (innerWidth <= 900 ? 72 : 92))}px`);
  marioPet.style.setProperty("--pet-y", `${Math.max(42, innerHeight - (innerWidth <= 900 ? 180 : 205))}px`);
}
function detachPetFromEasterLevel() {
  stopEasterTimeline();
  clearTimeout(easterOffscreenTimer);
  easterOffscreenTimer = null;
  easterCourseRunning = false;
  easterKoopas = [];
  easterGaloombas = [];
  easterLevel?.classList.remove("playing");
  easterLevel?.classList.remove("course-impact");
  easterLevel?.classList.remove("course-cave-active", "course-sprint-active");
  marioPet.classList.remove("pet-easter-course");
  mascotSequenceRunning = false;
  document.body.appendChild(marioPet);
}
function cancelEasterLevel() {
  if (!easterCourseRunning) return;
  detachPetFromEasterLevel();
  stopMascotFrames();
}
function finishEasterLevel() {
  if (!easterCourseRunning) return;
  detachPetFromEasterLevel();
  positionPetAfterCourse();
  setPetAction("idle");
  notePetInteraction();
}
function recoverPetFromOffscreenCourse() {
  if (!easterCourseRunning || easterLevelInViewport || easterLevelIntersectsViewport()) return;
  clearTimeout(easterRecoveryTimer);
  detachPetFromEasterLevel();
  positionPetAfterCourse();
  marioPetMenu.hidden = true;
  setPetAction("spin");
  marioPet.classList.add("pet-course-recovering");
  easterRecoveryTimer = setTimeout(() => {
    marioPet.classList.remove("pet-course-recovering");
    setPetAction("idle");
    notePetInteraction();
  }, 1050);
}
function syncEasterOffscreenRecovery(inViewport = easterLevelIntersectsViewport()) {
  easterLevelInViewport = inViewport;
  if (inViewport || !easterCourseRunning) {
    clearTimeout(easterOffscreenTimer);
    easterOffscreenTimer = null;
    return;
  }
  if (easterOffscreenTimer) return;
  easterOffscreenTimer = setTimeout(() => {
    easterOffscreenTimer = null;
    recoverPetFromOffscreenCourse();
  }, 1000);
}
function playEasterLevel() {
  if (!easterLevel || easterCourseRunning || reducedMotionQuery.matches || state.settings.motionLevel === "off" || marioPet.classList.contains("pet-course-recovering") || !mascotAwake || !state.settings.petEnabled || state.settings.petNeverWake) return;
  clearTimeout(easterRecoveryTimer);
  marioPet.classList.remove("pet-course-recovering");
  easterCourseRunning = true;
  stopMascotBehavior();
  marioPetMenu.hidden = true;
  easterLevel.classList.add("playing");
  easterLevel.appendChild(marioPet);
  marioPet.classList.remove("pet-facing-left");
  marioPet.classList.add("pet-easter-course");
  setPetAction("wake");
  courseTime.textContent = "300";
  easterActionIndex = 0;
  easterImpactIndex = 0;
  easterImpactUntil = -1;
  easterEnemyFrame = -1;
  easterLastClock = 300;
  easterKoopas = [...easterLevel.querySelectorAll(".course-koopa")];
  easterGaloombas = [...easterLevel.querySelectorAll(".course-galoomba")];
  stopEasterTimeline();
  easterTimelineFrame = requestAnimationFrame(runEasterTimeline);
}
new IntersectionObserver(entries => {
  const entry = entries[0];
  if (!entry) return;
  syncEasterOffscreenRecovery(entry.isIntersecting);
  if (entry.isIntersecting) {
    if (entry.intersectionRatio > .5) playEasterLevel();
  }
}, { threshold: [0, .5] }).observe(easterLevel);
window.addEventListener("scroll", () => {
  if (!easterCourseRunning || easterViewportFrame) return;
  easterViewportFrame = requestAnimationFrame(() => {
    easterViewportFrame = null;
    syncEasterOffscreenRecovery();
  });
}, { passive: true });
reducedMotionQuery.addEventListener?.("change", event => {
  if (event.matches) {
    stopMascotBehavior();
    if (easterCourseRunning) cancelEasterLevel();
    setPetAction("idle");
  } else if (mascotAwake && state.settings.petEnabled) scheduleMascotBehavior(5000);
});

Promise.resolve(window.__WORDS__ || fetch("/api/words").then(response => response.json()))
  .then(wordData => {
    words = wordData;
    relatedLexicon = window.__RELATED_LEXICON__ || {};
    assignLessons();
    navigate("home");
    scheduleMotionWarmup();
    if (!state.settings.petEnabled || state.settings.petNeverWake) retirePet();
  })
  .catch(error => { app.innerHTML = `<div class="empty error">载入失败：${escapeHtml(error.message)}</div>`; });
