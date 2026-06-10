# BPM Color Flash

Sync every phone in the room to the same BPM color strobe — concerts, parties, fitness classes, or any live event.

**Live demo:** deploy to [Render](#deploy-on-render-free) (or run locally below).

## What it does

- **Host** sets tempo, color style, and on-screen text from one phone
- **Audience** opens a link — every phone flashes **in sync** on the beat
- **WebSocket + clock sync** keeps phones aligned over Wi‑Fi or cellular
- **No install** for viewers — works in the mobile browser

## Quick start (local)

**Requirements:** Node.js 18+

```bash
npm install
npm start
```

| Role | URL |
|------|-----|
| Host (controls) | `http://localhost:3847` |
| Audience | `http://localhost:3847?viewer` |

Default host password: `flashadmin` (change for production — see below).

## Host controls

1. Tap the **gear** icon → enter host password
2. Set **Screen text** (title, audience hint, photosensitivity note)
3. Adjust **BPM**, **color mode**, and toggle **Flash on beat**
4. Copy the **audience link** from the host panel (`?viewer`)

## Deploy on Render (free)

This app needs a **long-running Node server with WebSockets**. Render’s free **Web Service** works well.

### 1. Push this repo to GitHub

```bash
git add -A
git commit -m "Add README and Render deploy config"
git push origin main
```

### 2. Create a Render Web Service

1. Go to [render.com](https://render.com) → **New** → **Web Service**
2. Connect **`Arnav-M/bpm-color-flash`** (or your fork)
3. Use these settings:

| Setting | Value |
|---------|--------|
| **Name** | `bpm-color-flash` (or your choice) |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance type** | Free |

4. **Environment variables** → add:

| Key | Value |
|-----|--------|
| `ADMIN_PASSWORD` | A strong password only you know |
| `NODE_VERSION` | `20` (optional; matches `engines` in package.json) |

5. Click **Create Web Service**

Render sets `PORT` automatically — the server already uses `process.env.PORT`.

### 3. Use your live URLs

After deploy (HTTPS):

| Role | URL |
|------|-----|
| Host | `https://your-app.onrender.com` |
| Audience | `https://your-app.onrender.com?viewer` |

Share the `?viewer` link with the crowd. Open the base URL on your phone to control the show.

### Render notes

- **Free tier spin-down:** the service sleeps after ~15 minutes idle. The first visit may take 30–60 seconds to wake up. WebSockets reconnect automatically.
- **State is in memory:** restarting the service resets BPM and text. Fine for single events.
- **HTTPS:** included on `*.onrender.com` — phones use secure WebSockets (`wss://`) automatically.

### Optional: deploy from `render.yaml`

This repo includes a [Render Blueprint](https://render.com/docs/blueprint-spec). You can use **New** → **Blueprint** and point at the repo, then set `ADMIN_PASSWORD` in the dashboard when prompted.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | Set by host | `3847` | HTTP port (Render sets this) |
| `ADMIN_PASSWORD` | **Yes in production** | `flashadmin` | Host login + API auth |

Copy `.env.example` to `.env` for local overrides (`.env` is gitignored).

## Project structure

```
server.js      Express + WebSocket server
app.js         Host + viewer UI logic
sync.js        Beat timing and color math
index.html     Single-page app
styles.css     Full-screen flash UI
```

## Safety

Flashing colors can affect people with photosensitivity. The default hint reminds viewers to leave if uncomfortable — customize it in the host panel.

## License

MIT — see [LICENSE](LICENSE).
