# BeeHaven Office

Standalone Node.js application that visualizes Claude Code activity as an animated bee office. Uses **PixiJS v8** for GPU-accelerated HiDPI rendering. Bee characters move between rooms based on what Claude Code is doing in real-time.

## Rendering

- **PixiJS v8** — WebGL GPU-accelerated 2D renderer (loaded via CDN importmap in browser)
- **HiDPI** — `resolution: window.devicePixelRatio` for Retina displays (2x-3x)
- **1480x1040** logical canvas — scales to fill container
- **Programmatic bee sprites** — PixiJS Graphics API draws bees with wings, expressions, accessories
- **Layered rendering** — grid → rooms → furniture → doors → bees → elevator → UI (sorted draw order)
- **A* waypoint pathfinding** — 30+ nodes with door thresholds, corridor waypoints, and hallway spine for smooth bee movement through doors between rooms
- **COORD_SCALE = 2** — Backend room coords are half-scale, multiplied by 2 on client

## Commands

```bash
cd beehaven_office
npm run dev                              # Start with hot-reload (tsx watch)
npm run build                            # Compile TypeScript → dist/
npm run start                            # Run compiled JS
npm run setup-hooks                      # Write hooks to .claude/settings.local.json
ELEVENLABS_API_KEY=sk-... npm run dev    # Start with voice enabled
BEEHAVEN_PORT=4000 npm run dev           # Custom port (default: 3333)
```

Opens at http://localhost:3333

## Architecture

```
Claude Code hooks → /tmp/beehaven-events.jsonl → Watcher → Office State → WebSocket → PixiJS Canvas
```

### Data Flow

1. **Hooks** (`hooks/event-logger.sh`): Shell script receives JSON on stdin from Claude Code hook events, appends timestamped JSONL to `/tmp/beehaven-events.jsonl`
2. **Watcher** (`src/watcher.ts`): Uses chokidar to poll the JSONL file every 100ms, parses new lines, emits `ClaudeEvent` objects
3. **Office** (`src/office.ts`): State machine that maps events to bee positions/activities across 9 rooms (Library, Studio, Web Booth, Focus Booth, Conference, Kitchen, Lounge, Server Room, Lobby). Auto-detects projects on startup from `~/.claude/projects/` and saved sessions
4. **Server** (`src/server.ts`): Express serves `public/` static files. WebSocketServer pushes state at 2Hz to all connected browsers
5. **Voice** (`src/voice.ts`): Optional ElevenLabs integration. Strips code blocks from text, speaks conversational portions via TTS. STT available for voice input
6. **Canvas** (`public/office.js`): PixiJS v8 WebGL renderer with A* pathfinding, animated bee characters, elevator, sliding doors, dynamic expressions, interaction point seating

### Hook Events Consumed

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

### Room Layout (Backend Coordinates — multiply by COORD_SCALE=2 for canvas)

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
| `src/types.ts` | All TypeScript interfaces: `ClaudeEvent`, `BeeCharacter`, `Room`, `OfficeState`, etc. |
| `src/office.ts` | Core state engine. `processEvent()` main entry point. `ROOMS` array, `toolToRoom()`, `toolToActivity()`, auto project detection via `scanLocalProjects()` |
| `src/watcher.ts` | `ClaudeWatcher` extends EventEmitter. Tracks file byte offset for incremental reads |
| `src/server.ts` | Express + ws. `broadcastState()`, `broadcastSpeech()`, REST APIs for sessions/shop/chat |
| `src/voice.ts` | `Voice.speak()` returns audio Buffer. `stripCode()` removes markdown/code from text |
| `src/shop.ts` | `HONEY_REWARDS` mapping, `SHOP_SKINS`, `SHOP_ACCESSORIES` catalogs, `ShopManager` class |
| `src/chat.ts` | `ChatHandler` — Recruiter Bee chat via Firebase Cloud Functions, agent script generation, PR creation |
| `src/relay.ts` | `Relay` — optional sync to Clearly cloud for multi-office building view |
| `src/index.ts` | Wires components: `watcher.on('event')` → `office.processEvent()` → `server.broadcastState()` |
| `public/office.js` | PixiJS v8 renderer. `initPixi()` bootstraps app. `createBeeGraphics()` draws bees. `syncBees()` syncs state. A* pathfinding, elevator, doors, expressions |
| `hooks/event-logger.sh` | Bash script. Reads stdin JSON, adds timestamp via python3, appends to JSONL. Always exits 0 |

## Hook Configuration

Hooks are defined in the project's `.claude/settings.local.json` under the `"hooks"` key. Each event maps to the `event-logger.sh` script with a 5-second timeout. The hook script must always exit 0 to never block Claude Code.

To modify which events are captured, edit the `hooks` object in `.claude/settings.local.json` or run `npm run setup-hooks` to regenerate.

## Adding New Rooms or Behaviors

1. Add room to `Room` type in `src/types.ts`
2. Add room definition to `ROOMS` array in `src/office.ts` (x, y, width, height, color)
3. Add tool mapping in `toolToRoom()` and `toolToActivity()` in `src/office.ts`
4. Add room to `ROOMS` array in `public/office.js` (must match coordinates × COORD_SCALE)
5. Add waypoint and edges in `WAYPOINTS`/`EDGES` arrays in `public/office.js`
6. Optionally add furniture in `FURNITURE` object and interaction points in `INTERACTION_POINTS` in `public/office.js`

## Adding New Bee Characters

Worker bees spawn automatically on `SubagentStart` events. To add persistent ambient bees, add to the `AMBIENT_BEES` array in `public/office.js`. To add server-side bees, push to `this.state.bees` in the `Office` constructor in `src/office.ts`.

## Voice (ElevenLabs)

- **TTS**: `eleven_flash_v2_5` model, `JBFqnCBsd6RMkjVDRZzb` voice (George). Audio sent as base64 MP3 over WebSocket, played in browser via `Audio()` API
- **STT**: `scribe_v2` model. Browser captures audio via MediaRecorder, POSTs to `/api/transcribe`
- Voice is disabled when `ELEVENLABS_API_KEY` is not set. The app runs fully without it

## Dependencies

- `pixi.js` v8 - GPU-accelerated 2D WebGL renderer (loaded via CDN importmap in browser)
- `express` - HTTP server for static files and API
- `ws` - WebSocket for real-time state push
- `chokidar` - File watching for JSONL event file
- `@elevenlabs/elevenlabs-js` - TTS and STT (optional, gracefully degrades)
- `tsx` - Dev-time TypeScript execution with watch mode
