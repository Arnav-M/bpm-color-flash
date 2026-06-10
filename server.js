const http = require("http");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3847;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "flashadmin";
const ADMIN_HASH = crypto.createHash("sha256").update(ADMIN_PASSWORD).digest("hex");

const BPM_MIN = 40;
const BPM_MAX = 220;

const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.static(__dirname));

const DEFAULT_DISPLAY = {
  showTitle: "Your Event",
  hintMain: "Hold your phone up. Groove.",
  hintSub: "Photosensitive? Leave if flashing is uncomfortable.",
};

let state = {
  bpm: 120,
  running: false,
  colorMode: "spectrum",
  epochMs: 0,
  beatOffset: 0,
  showTitle: DEFAULT_DISPLAY.showTitle,
  hintMain: DEFAULT_DISPLAY.hintMain,
  hintSub: DEFAULT_DISPLAY.hintSub,
};

let listenerCount = 0;

function clampBpm(value) {
  return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(Number(value))));
}

function alignEpochOnBpmChange(nextBpm) {
  const now = Date.now();
  if (!state.running) {
    state.bpm = nextBpm;
    return;
  }
  const msPerBeat = 60000 / state.bpm;
  const beatsElapsed = Math.floor((now - state.epochMs) / msPerBeat);
  state.beatOffset += beatsElapsed;
  state.epochMs = now;
  state.bpm = nextBpm;
}

function startShow() {
  state.running = true;
  state.epochMs = Date.now();
  state.beatOffset = 0;
}

function stopShow() {
  state.running = false;
}

function verifyPassword(password) {
  const hash = crypto.createHash("sha256").update(String(password)).digest("hex");
  return hash === ADMIN_HASH;
}

function trimDisplay(value, maxLen) {
  return String(value ?? "").trim().slice(0, maxLen);
}

function publicState() {
  return {
    bpm: state.bpm,
    running: state.running,
    colorMode: state.colorMode,
    epochMs: state.epochMs,
    beatOffset: state.beatOffset,
    showTitle: state.showTitle,
    hintMain: state.hintMain,
    hintSub: state.hintSub,
    bpmMin: BPM_MIN,
    bpmMax: BPM_MAX,
    listeners: listenerCount,
  };
}

function broadcast(payload) {
  const message = JSON.stringify({ ...payload, serverTime: Date.now() });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(message);
  }
}

function broadcastState() {
  broadcast({ type: "state", state: publicState() });
}

app.get("/api/state", (_req, res) => {
  res.json({ serverTime: Date.now(), state: publicState() });
});

/** NTP-style clock sync for phones on cellular / different networks */
app.post("/api/sync", (req, res) => {
  const clientTime = Number(req.body?.clientTime) || 0;
  res.json({ serverTime: Date.now(), clientTime });
});

app.post("/api/state", (req, res) => {
  const { password, patch } = req.body || {};
  if (!verifyPassword(password)) {
    return res.status(401).json({ error: "Invalid password" });
  }
  if (!patch || typeof patch !== "object") {
    return res.status(400).json({ error: "Missing patch" });
  }

  if (patch.bpm !== undefined) {
    alignEpochOnBpmChange(clampBpm(patch.bpm));
  }
  if (patch.colorMode !== undefined) {
    state.colorMode = String(patch.colorMode);
  }
  if (patch.running === true) startShow();
  if (patch.running === false) stopShow();
  if (patch.showTitle !== undefined) {
    state.showTitle = trimDisplay(patch.showTitle, 48) || DEFAULT_DISPLAY.showTitle;
  }
  if (patch.hintMain !== undefined) {
    state.hintMain = trimDisplay(patch.hintMain, 80) || DEFAULT_DISPLAY.hintMain;
  }
  if (patch.hintSub !== undefined) {
    state.hintSub = trimDisplay(patch.hintSub, 120) || DEFAULT_DISPLAY.hintSub;
  }

  broadcastState();
  res.json({ ok: true, serverTime: Date.now(), state: publicState() });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (socket) => {
  listenerCount += 1;
  socket.send(
    JSON.stringify({ type: "state", serverTime: Date.now(), state: publicState() })
  );
  broadcastState();

  socket.on("close", () => {
    listenerCount = Math.max(0, listenerCount - 1);
    broadcastState();
  });
});

setInterval(() => {
  broadcast({ type: "ping", serverTime: Date.now(), state: publicState() });
}, 3000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Color Flash server listening on port ${PORT}`);
  console.log(`Set ADMIN_PASSWORD in production. Default: ${ADMIN_PASSWORD}`);
});
