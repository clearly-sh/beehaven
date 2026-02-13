# BeeHaven Office

Standalone Node.js application that visualizes Claude Code activity as an animated bee office. Uses **PixiJS v8** for GPU-accelerated HiDPI rendering. Bee characters move between rooms based on what Claude Code is doing in real-time. Optionally syncs to Clearly cloud for project context, multi-office building view, and AI-powered insights.

## Commands

```bash
npm run dev                              # Start with hot-reload (tsx watch)
npm run build                            # Compile TypeScript → dist/
npm run start                            # Run compiled JS
ELEVENLABS_API_KEY=sk-... npm run dev    # Start with voice enabled
BEEHAVEN_PORT=4000 npm run dev           # Custom port (default: 3333)
```

Opens at http://localhost:3333

## Architecture

```
Claude Code hooks → /tmp/beehaven-events.jsonl → Watcher → Office State → WebSocket → PixiJS Canvas
                                                                       ↘ Relay → Clearly Cloud (Firestore + GCS)
```

### Data Flow

1. **Hooks** (`hooks/event-logger.sh`): Shell script receives JSON on stdin from Claude Code hook events, appends timestamped JSONL to `/tmp/beehaven-events.jsonl`
2. **Watcher** (`src/watcher.ts`): Uses chokidar to poll the JSONL file every 100ms, parses new lines, emits `ClaudeEvent` objects
3. **Office** (`src/office.ts`): State machine that maps events to bee positions/activities across 9 rooms. Auto-detects projects from `~/.claude/projects/` and saved sessions. Manages city indicators and project board
4. **Server** (`src/server.ts`): Express serves `public/` static files. WebSocketServer pushes state at 2Hz to all connected browsers. REST APIs for account linking, shop, sessions, project files, sync status
5. **Relay** (`src/relay.ts`): Syncs office state, project context, transcripts, and documentation to Clearly cloud via Firebase Cloud Function
6. **Voice** (`src/voice.ts`): Optional ElevenLabs integration. TTS narration of Claude's responses. STT for voice input
7. **Canvas** (`public/office.js`): PixiJS v8 WebGL renderer with A* pathfinding, animated bees, city visualization, shop, board panel, account popover with sync dashboard

### Transcript Scanning

In addition to hook events, the server scans `~/.claude/projects/*/` every 3 seconds for active transcript JSONL files. This discovers sessions that may not have hooks configured, reads Claude's text output, extracts embedded BEEHAVEN commands, and pipes text to the terminal + optional voice narration.

## Rendering

- **PixiJS v8** — WebGL GPU-accelerated 2D renderer (loaded via CDN importmap in browser)
- **HiDPI** — `resolution: window.devicePixelRatio` for Retina displays (2x-3x)
- **1480x1040** logical canvas — scales to fill container
- **Programmatic bee sprites** — PixiJS Graphics API draws bees with wings, expressions, accessories
- **Layered rendering** — grid → rooms → furniture → doors → bees → elevator → UI (sorted draw order)
- **A* waypoint pathfinding** — 30+ nodes with door thresholds, corridor waypoints, and hallway spine
- **COORD_SCALE = 2** — Backend room coords are half-scale, multiplied by 2 on client

## Hook Events

| Event | Bee Behavior |
|---|---|
| `SessionStart` | Queen arrives in Lobby |
| `UserPromptSubmit` | Queen moves to Conference Room, thinks |
| `PreToolUse` (Read/Glob/Grep) | Queen moves to Library (reading/research) |
| `PreToolUse` (Edit/Write/NotebookEdit) | Queen moves to Studio (coding/creation) |
| `PreToolUse` (WebFetch/WebSearch) | Queen moves to Web Booth (browsing) |
| `PreToolUse` (Bash) | Queen moves to Server Room |
| `PreToolUse` (Task) | Queen moves to Conference Room |
| `PostToolUse` | Activity completed indicator |
| `PostToolUseFailure` | Error state, queen rethinks |
| `Stop` | Queen moves to Conference Room, presents |
| `SubagentStart` | Worker bee spawns, walks to assigned room |
| `SubagentStop` | Worker bee celebrates, then disappears |
| `SessionEnd` | Queen returns to Lobby |
| (idle 8s) | Queen wanders to Kitchen or Lounge |

## Room Layout (Backend Coordinates — multiply by COORD_SCALE=2 for canvas)

| Room ID | Label | Position | Size | Purpose |
|---|---|---|---|---|
| `lobby` | Reception | (20, 200) | 100x30 | Session start/end |
| `library` | Library | (125, 20) | 140x170 | Research: Read, Glob, Grep |
| `studio` | Studio | (275, 20) | 150x170 | Creation: Edit, Write, NotebookEdit |
| `web-booth` | Web | (20, 20) | 40x50 | Browsing: WebFetch, WebSearch |
| `phone-b` | Focus | (530, 20) | 40x50 | Ambient focus booth |
| `server-room` | Server Room | (500, 235) | 60x80 | Bash commands |
| `meeting-room` | Conference | (20, 235) | 100x100 | Thinking, Task, presenting |
| `water-cooler` | Lounge | (320, 235) | 125x100 | Idle state |
| `coffee` | Kitchen | (170, 235) | 100x100 | Idle state |

## Key Files

| File | Purpose |
|---|---|
| `src/types.ts` | All interfaces: `ClaudeEvent`, `BeeCharacter`, `OfficeState`, `ProjectSyncData`, city/shop/building types |
| `src/office.ts` | Core state engine. `processEvent()`, `ROOMS[]`, `toolToRoom()`, project detection, city commands, `getProjectSyncData()` |
| `src/watcher.ts` | `ClaudeWatcher` extends EventEmitter. Polls JSONL file, tracks byte offset for incremental reads |
| `src/server.ts` | Express + ws. REST APIs for account, shop, sessions, files, sync. Broadcasts state at 2Hz |
| `src/relay.ts` | `Relay` class — syncs to Clearly cloud: state, events, project context, transcripts, docs. Per-project debounce, sync status tracking |
| `src/voice.ts` | ElevenLabs TTS/STT. `speak()` strips code, `transcribe()` returns text. Gracefully degrades |
| `src/shop.ts` | Honey economy: `HONEY_REWARDS`, 9 skins, 9 accessories, purchase/equip logic |
| `src/file-tree.ts` | `scanProjectFiles()` — walks project directory (max 500 files, 8 depth), caches 30s |
| `src/index.ts` | Main entry. Wires watcher→office→server→relay. Transcript scanning, BEEHAVEN command parsing |
| `src/cli.ts` | CLI: `start`, `setup`, `login`, `logout` commands |
| `src/setup-hooks.ts` | Installs Claude Code hooks globally in `~/.claude/settings.json` |
| `src/setup-relay.ts` | Interactive relay token linking |
| `public/office.js` | PixiJS v8 renderer (6000+ lines). Bees, pathfinding, city scene, shop, board, account, sync dashboard |
| `public/style.css` | Dark glassmorphic design system. HUD, terminal, board, shop, account, sync styles |
| `public/index.html` | SPA structure: login, HUD, viewport, terminal, team panel, board, modals |
| `hooks/event-logger.sh` | Shell script. Reads stdin JSON, adds timestamp, appends to JSONL. Always exits 0 |

## Clearly Cloud Integration

BeeHaven optionally syncs to Clearly's Firebase backend for project context and multi-office features.

### Sync Architecture

```
BeeHaven (local)
  ↓ Bearer token auth
beehiveRelay Cloud Function (us-central1)
  ↓
Firestore: users/{userId}/beehive/
  ├── state              — office state (bees, stats, events)
  ├── config             — relay token, settings
  ├── events/{id}        — Claude events (SessionStart, SessionEnd, etc.)
  └── projects/{name}/
      ├── (metadata)     — fileCount, dirCount, lastActive
      ├── data/fileTree  — files[], directories[]
      ├── data/cityState — indicators[], board[]
      ├── data/conversations — last 200 terminal entries
      └── docs/{name}    — README.md, CLAUDE.md, package.json content

Cloud Storage: beehive/{userId}/
  └── transcripts/{sessionId}.jsonl  — full session transcripts
```

### What Gets Synced

| Data | Method | Trigger | Size |
|---|---|---|---|
| Office state (bees, stats) | Firestore | Debounced 300ms | ~5 KB |
| Claude events | Firestore | Batched with state | ~1 KB/event |
| Project context (file tree, city state, conversations) | Firestore | Every 60s + session end | 5-50 KB |
| Session transcripts | Cloud Storage (signed URLs) | Session end | 100 KB - 10 MB |
| Documentation (README, CLAUDE.md, package.json) | Firestore | Session end | 1-50 KB |

### Sync Status UI

The account popover shows a **sync dashboard** when linked:
- **Summary**: requests sent / failed, last sync time
- **Per-project cards**: file count, conversation count, doc count, transcript upload status, last sync time
- Live updates via WebSocket (piggybacks on 2Hz state broadcast)

### Account Linking

1. Generate a relay token from Clearly.sh → Settings → BeeHaven
2. Paste token in BeeHaven account popover (or run `beehaven login`)
3. Token is verified via heartbeat to Cloud Function
4. Profile (name, email, plan) displayed in popover
5. Token auto-extends on each 30s heartbeat (90-day TTL)

### Rate Limits

| Tier | Requests/min |
|---|---|
| Free | 30 |
| Pro | 120 |
| Team | 300 |

## City Visualization

The city view renders a project's file tree as a procedural city skyline. Each file becomes a building, grouped by directory into districts.

### Building Types (by file extension)

| Extension | Style | Color |
|---|---|---|
| .ts, .tsx | Glass tower | Blue |
| .js, .jsx | Tech building | Yellow |
| .css, .scss | Art deco | Purple |
| .json, .yaml | Warehouse | Gray |
| .sh, .bash | Factory | Red |
| .md, .txt | Library | Green |
| Other | Generic | Neutral |

### City Indicators

Claude can embed BEEHAVEN commands in its text output to annotate buildings:

```
<!--BEEHAVEN:{"action":"mark","file":"src/server.ts","indicator":"bug","note":"Race condition in sync"}-->
```

**6 indicator types**: bug (red), feature (green), refactor (blue), priority (orange), in-progress (yellow), done (gray)

### Project Board

Kanban board with Backlog / In Progress / Done columns. Items can be added manually via UI or via BEEHAVEN commands:

```
<!--BEEHAVEN:{"action":"board-add","title":"Fix race condition","file":"src/server.ts","indicator":"bug"}-->
<!--BEEHAVEN:{"action":"board-move","itemId":"item-123","status":"done"}-->
```

## Shop Economy

### Honey Rewards (Per Event)

| Event | Honey |
|---|---|
| SessionStart | 5 |
| UserPromptSubmit | 2 |
| PreToolUse | 1 |
| PostToolUse | 1 |
| SubagentStart | 3 |
| Stop | 5 |
| SessionEnd | 10 |

### Catalog

- **9 Skins** (0-500 honey): Honey Gold, Midnight Hacker, Ocean Breeze, Cherry Blossom, Emerald Coder, Royal Purple, Sunset Fire, Cosmic Nebula, Legendary Aureate
- **9 Accessories** (15-100 honey): Party Hat, Bow Tie, Cool Shades, Top Hat, DJ Beats, Wizard Hat, Angel Halo, Devil Horns

## Voice (ElevenLabs)

- **TTS**: `eleven_v3` model, Arabella voice. Strips code blocks and markdown. Audio sent as base64 MP3 over WebSocket
- **STT**: `scribe_v2` model. Browser captures audio via MediaRecorder, POSTs to `/api/transcribe`
- Disabled when `ELEVENLABS_API_KEY` is not set. The app runs fully without it

## REST API

| Route | Method | Purpose |
|---|---|---|
| `/api/status` | GET | Onboarding status, tier, connection |
| `/api/config` | POST | Save onboarding config |
| `/api/account` | GET | Clearly account state (linked, profile, tier, connected) |
| `/api/account/link` | POST | Verify relay token and link account |
| `/api/account/unlink` | POST | Clear relay config |
| `/api/account/sync` | GET | Detailed sync status per project |
| `/api/pin` | GET/POST | PIN hash for login screen |
| `/api/building` | GET | Building state from relay |
| `/api/building/select` | POST | Claim desk in building |
| `/api/sessions` | GET | List saved sessions |
| `/api/sessions/:id` | GET | Load session details |
| `/api/project-files/:project` | GET | Scan file tree for city |
| `/api/transcribe` | POST | STT via ElevenLabs |

## WebSocket Messages (Server → Client)

| Type | Payload | Frequency |
|---|---|---|
| `state` | Full OfficeState + cityState + syncStatus | 2Hz |
| `event` | `{ event, detail }` | On Claude events |
| `speech` | `{ audio: base64, text, project }` | When TTS fires |
| `transcript` | `{ text, audioSize }` | After STT |
| `response` | `{ event, content }` | Claude text output |

## Persistence

### ~/.beehaven/config.json

Stores onboarding state, relay token, PIN hash, building selection, user profile, shop inventory.

### ~/.beehaven/sessions/

One JSON file per Claude session. Contains terminal log, event log, stats, project name, timestamps.

## Adding New Rooms

1. Add room to `Room` type in `src/types.ts`
2. Add room definition to `ROOMS` array in `src/office.ts`
3. Add tool mapping in `toolToRoom()` and `toolToActivity()` in `src/office.ts`
4. Add room to `ROOMS` array in `public/office.js` (coordinates × COORD_SCALE)
5. Add waypoint and edges in `WAYPOINTS`/`EDGES` arrays in `public/office.js`
6. Optionally add furniture in `FURNITURE` object and interaction points in `public/office.js`

## Adding New Bee Characters

Worker bees spawn automatically on `SubagentStart` events. To add persistent ambient bees, add to the `AMBIENT_BEES` array in `public/office.js`. To add server-side bees, push to `this.state.bees` in the `Office` constructor in `src/office.ts`.

## Dependencies

- `pixi.js` v8 — GPU-accelerated 2D WebGL renderer (CDN importmap)
- `express` — HTTP server for static files and API
- `ws` — WebSocket for real-time state push
- `chokidar` — File watching for JSONL event file
- `@elevenlabs/elevenlabs-js` — TTS and STT (optional, gracefully degrades)
- `tsx` — Dev-time TypeScript execution with watch mode

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `BEEHAVEN_PORT` | 3333 | HTTP server port |
| `ELEVENLABS_API_KEY` | (not set) | Enable ElevenLabs TTS/STT |
