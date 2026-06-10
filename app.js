import { BPM_MIN, BPM_MAX, beatIndex, colorForBeat } from "./sync.js";

const DEFAULT_PASSWORD_HASH =
  "02fa5110100a0d099bce9753f947d9ee4ab7eba13e17bbfd86a7431d98740c0f";

const PASSWORD_HASH_KEY = "color-flash-password-hash";
const AUTH_KEY = "color-flash-auth";

const params = new URLSearchParams(window.location.search);
const viewerOnly = params.has("viewer");

const flashLayer = document.getElementById("flash-layer");
const statusPill = document.getElementById("status-pill");
const syncPill = document.getElementById("sync-pill");
const adminTrigger = document.getElementById("admin-trigger");
const showTitleEl = document.getElementById("show-title");
const mainHintEl = document.getElementById("main-hint");
const mainHintSubEl = document.getElementById("main-hint-sub");

const loginModal = document.getElementById("login-modal");
const loginForm = document.getElementById("login-form");
const passwordInput = document.getElementById("password-input");
const loginError = document.getElementById("login-error");
const loginCancel = document.getElementById("login-cancel");

const adminModal = document.getElementById("admin-modal");
const adminForm = document.getElementById("admin-form");
const bpmSlider = document.getElementById("bpm-slider");
const bpmLabel = document.getElementById("bpm-label");
const runningToggle = document.getElementById("running-toggle");
const colorModeSelect = document.getElementById("color-mode");
const adminLock = document.getElementById("admin-lock");
const adminClose = document.getElementById("admin-close");
const shareUrl = document.getElementById("share-url");
const presetButtons = document.querySelectorAll("[data-bpm]");
const showTitleInput = document.getElementById("show-title-input");
const hintMainInput = document.getElementById("hint-main-input");
const hintSubInput = document.getElementById("hint-sub-input");

let serverState = {
  bpm: 120,
  running: false,
  colorMode: "spectrum",
  epochMs: 0,
  beatOffset: 0,
  showTitle: "Your Event",
  hintMain: "Hold your phone up. Groove.",
  hintSub: "Photosensitive? Leave if flashing is uncomfortable.",
};

let clockOffset = 0;
let clockSynced = false;
let syncInterval = null;
let beatTimer = null;
let lastRenderedBeat = -1;
let socket = null;
let reconnectTimer = null;
let adminPassword = sessionStorage.getItem("color-flash-admin-pw") || "";

function serverNow() {
  return Date.now() + clockOffset;
}

function syncClock(serverTime, roundTripMs = 0) {
  const offset = serverTime + roundTripMs / 2 - Date.now();
  clockOffset = clockSynced ? clockOffset * 0.65 + offset * 0.35 : offset;
  clockSynced = true;
}

async function measureClockOffset() {
  const t0 = Date.now();
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientTime: t0 }),
  });
  const t3 = Date.now();
  const data = await res.json();
  const rtt = t3 - t0;
  syncClock(data.serverTime, rtt);
  return rtt;
}

function startClockSync() {
  measureClockOffset().catch(() => {});
  if (!syncInterval) {
    syncInterval = setInterval(() => measureClockOffset().catch(() => {}), 15000);
  }
}

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyPassword(password) {
  const stored =
    localStorage.getItem(PASSWORD_HASH_KEY) || DEFAULT_PASSWORD_HASH;
  return (await hashPassword(password)) === stored;
}

function isAuthenticated() {
  return sessionStorage.getItem(AUTH_KEY) === "1" && adminPassword.length > 0;
}

function setAuthenticated(value, password = "") {
  if (value) {
    sessionStorage.setItem(AUTH_KEY, "1");
    adminPassword = password;
    sessionStorage.setItem("color-flash-admin-pw", password);
  } else {
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem("color-flash-admin-pw");
    adminPassword = "";
  }
}

function applyServerState(next) {
  serverState = { ...serverState, ...next };
  updateUi();
  rescheduleBeats();
}

function updateDisplayCopy() {
  showTitleEl.textContent = serverState.showTitle || "Your Event";
  mainHintEl.textContent = serverState.hintMain || "Hold your phone up. Groove.";
  mainHintSubEl.textContent =
    serverState.hintSub || "Photosensitive? Leave if flashing is uncomfortable.";
  document.title = `${serverState.showTitle || "Color Flash"} · Color Flash`;
}

function updateUi() {
  statusPill.textContent = serverState.running ? "Live" : "Paused";
  statusPill.classList.toggle("live", serverState.running);
  document.body.classList.toggle("flashing", serverState.running);
  updateDisplayCopy();

  if (!serverState.running) {
    flashLayer.style.backgroundColor = "#111";
    lastRenderedBeat = -1;
  }
}

function updateSyncPill(connected, listeners) {
  if (!connected) {
    syncPill.textContent = "Connecting…";
    syncPill.classList.remove("sync-ok");
    return;
  }
  const count = listeners ?? 0;
  syncPill.textContent =
    count === 1 ? "Synced · 1 phone" : `Synced · ${count} phones`;
  syncPill.classList.add("sync-ok");
}

function renderBeat(beat) {
  if (beat === lastRenderedBeat) return;
  lastRenderedBeat = beat;
  flashLayer.style.backgroundColor = colorForBeat(
    beat,
    serverState.colorMode
  );
}

function msUntilNextBeat() {
  const msPerBeat = 60000 / serverState.bpm;
  const now = serverNow();
  const elapsed = now - serverState.epochMs;
  const intoBeat = elapsed % msPerBeat;
  return msPerBeat - intoBeat;
}

function tickBeat() {
  if (!serverState.running) return;
  const beat = beatIndex(serverState, serverNow());
  renderBeat(beat);
  beatTimer = setTimeout(tickBeat, Math.max(4, msUntilNextBeat()));
}

function rescheduleBeats() {
  if (beatTimer !== null) {
    clearTimeout(beatTimer);
    beatTimer = null;
  }
  if (serverState.running) {
    const beat = beatIndex(serverState, serverNow());
    renderBeat(beat);
    beatTimer = setTimeout(tickBeat, Math.max(4, msUntilNextBeat()));
  }
}

async function fetchState() {
  await measureClockOffset();
  const res = await fetch("/api/state");
  const data = await res.json();
  syncClock(data.serverTime);
  applyServerState(data.state);
  updateSyncPill(true, data.state.listeners);
  startClockSync();
}

async function pushPatch(patch) {
  if (!isAuthenticated()) return;
  const res = await fetch("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: adminPassword, patch }),
  });
  if (!res.ok) throw new Error("Update rejected");
  const data = await res.json();
  syncClock(data.serverTime);
  applyServerState(data.state);
}

function connectSocket() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}`);

  socket.addEventListener("open", () => {
    measureClockOffset().catch(() => {});
    updateSyncPill(true, serverState.listeners);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  });

  socket.addEventListener("message", (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.serverTime && msg.type === "ping") {
      syncClock(msg.serverTime, 80);
    }
    if (msg.state) {
      applyServerState(msg.state);
      updateSyncPill(socket.readyState === 1, msg.state.listeners);
    }
  });

  socket.addEventListener("close", () => {
    updateSyncPill(false);
    reconnectTimer = setTimeout(connectSocket, 1500);
  });

  socket.addEventListener("error", () => socket.close());
}

function syncAdminForm() {
  bpmSlider.min = String(serverState.bpmMin ?? BPM_MIN);
  bpmSlider.max = String(serverState.bpmMax ?? BPM_MAX);
  bpmSlider.value = String(serverState.bpm);
  bpmLabel.textContent = `${serverState.bpm} BPM`;
  runningToggle.checked = serverState.running;
  colorModeSelect.value = serverState.colorMode;
  showTitleInput.value = serverState.showTitle || "";
  hintMainInput.value = serverState.hintMain || "";
  hintSubInput.value = serverState.hintSub || "";
}

function pushDisplayPatch() {
  pushPatch({
    showTitle: showTitleInput.value,
    hintMain: hintMainInput.value,
    hintSub: hintSubInput.value,
  }).catch(() => {});
}

function openLogin() {
  loginError.hidden = true;
  passwordInput.value = "";
  loginModal.showModal();
  passwordInput.focus();
}

function openAdmin() {
  syncAdminForm();
  const base = location.origin + location.pathname.replace(/\/?$/, "/");
  const viewerLink = `${base}?viewer`;
  shareUrl.textContent = viewerLink;
  adminModal.showModal();
}

if (viewerOnly) {
  adminTrigger.hidden = true;
} else {
  adminTrigger.addEventListener("click", () => {
    if (isAuthenticated()) openAdmin();
    else openLogin();
  });
}

loginCancel.addEventListener("click", () => loginModal.close());

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const ok = await verifyPassword(passwordInput.value);
  if (!ok) {
    loginError.hidden = false;
    return;
  }
  setAuthenticated(true, passwordInput.value);
  loginModal.close();
  openAdmin();
});

adminLock.addEventListener("click", () => {
  setAuthenticated(false);
  adminModal.close();
});

adminClose.addEventListener("click", () => adminModal.close());

bpmSlider.addEventListener("input", () => {
  const bpm = parseInt(bpmSlider.value, 10);
  bpmLabel.textContent = `${bpm} BPM`;
});

bpmSlider.addEventListener("change", () => {
  pushPatch({ bpm: parseInt(bpmSlider.value, 10) }).catch(() => {});
});

presetButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const bpm = parseInt(btn.dataset.bpm, 10);
    bpmSlider.value = String(bpm);
    bpmLabel.textContent = `${bpm} BPM`;
    pushPatch({ bpm }).catch(() => {});
  });
});

runningToggle.addEventListener("change", () => {
  pushPatch({ running: runningToggle.checked }).catch(() => {});
});

colorModeSelect.addEventListener("change", () => {
  pushPatch({ colorMode: colorModeSelect.value }).catch(() => {});
});

for (const input of [showTitleInput, hintMainInput, hintSubInput]) {
  input.addEventListener("change", pushDisplayPatch);
}

adminForm.addEventListener("submit", (event) => {
  event.preventDefault();
  pushDisplayPatch();
  adminModal.close();
});

fetchState().catch(() => {
  syncPill.textContent = "Run npm start — open via server URL";
  syncPill.classList.remove("sync-ok");
});
connectSocket();

window.hashPassword = hashPassword;
