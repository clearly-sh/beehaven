# BeeHaven Office

Standalone Node.js application that visualizes Claude Code activity as an animated bee office. Uses **PixiJS v8** for GPU-accelerated HiDPI rendering with Porto Rocha-designed bee SVG sprites. Bee characters move between rooms based on what Claude Code is doing in real-time.

## Rendering

- **PixiJS v8** — WebGL GPU-accelerated 2D renderer
- **HiDPI** — `resolution: window.devicePixelRatio` for Retina displays (2x-3x)
- **1480x1040** logical canvas — scales to fill container
- **Porto Rocha bee sprites** — `public/assets/bee-logo-porto-*.svg` loaded as textures
- **Fallback** — programmatic Graphics drawing if SVG load fails
- **Layered rendering** — grid → rooms → furniture → bees → UI (sorted draw order)

## Shared Types (from svg_art branch)

Cherry-picked into `src/shared/`:

- `src/shared/bee-memory/types.ts` — 1,506 lines: BeeIdentity, BeeOutfit, BeeNationalAffiliation (Pacific Rim), BeeSkin (LoL-style rarity: common→mythic), SkinEffects, BattlePass, Tournaments, CompetitiveStats, ELO ratings, ChallengeTypes
- `src/shared/claude-code/types.ts` — ClaudeCodeConfig, CanvasContext, ClaudePromptInput, IPC types for Electron
- `src/shared/claude-code/daemon-types.ts` — TokenManager, DaemonConfig, WebSocket gateway types
- `src/shared/claude-code/clearly-hub-types.ts` — HubSkill, HubAgent, SkillCategory (the "AI Reddit" platform)

## Commands

```bash
cd beehaven
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
Claude Code hooks → /tmp/beehaven-events.jsonl → Watcher → Office State → WebSocket → Browser Canvas
```

### Data Flow

1. **Hooks** (`hooks/event-logger.sh`): Shell script receives JSON on stdin from Claude Code hook events, appends timestamped JSONL to `/tmp/beehaven-events.jsonl`
2. **Watcher** (`src/watcher.ts`): Uses chokidar to poll the JSONL file every 100ms, parses new lines, emits `ClaudeEvent` objects
3. **Office** (`src/office.ts`): State machine that maps events to bee positions/activities across 8 rooms. Contains room layout coordinates and tool-to-room mapping
4. **Server** (`src/server.ts`): Express serves `public/` static files. WebSocketServer pushes state at 2Hz to all connected browsers
5. **Voice** (`src/voice.ts`): Optional ElevenLabs integration. Strips code blocks from text, speaks conversational portions via TTS. STT available for voice input
6. **Canvas** (`public/office.js`): HTML5 Canvas renderer with animated bee characters, room furniture, activity indicators, speech bubbles, event log sidebar

### Hook Events Consumed

| Event | Bee Behavior |
|---|---|
| `SessionStart` | Queen arrives in Lobby |
| `UserPromptSubmit` | Queen moves to Meeting Room, thinks |
| `PreToolUse` (Read/Glob/Grep) | Queen moves to Library |
| `PreToolUse` (Edit/Write) | Queen moves to Coding Desks |
| `PreToolUse` (Bash) | Queen moves to Server Room |
| `PreToolUse` (Task) | Queen moves to Meeting Room |
| `PostToolUse` | Activity completed indicator |
| `PostToolUseFailure` | Error state, queen rethinks |
| `Stop` | Queen moves to Stage, presents |
| `SubagentStart` | Worker bee spawns, flies to assigned room |
| `SubagentStop` | Worker bee celebrates, then disappears |
| `SessionEnd` | Queen returns to Lobby |
| (idle 8s) | Queen wanders to Coffee Bar or Break Area |

### Room Layout (Canvas Coordinates)

| Room | Position | Size | Purpose |
|---|---|---|---|
| Break Area | (20, 40) | 160x120 | Idle state |
| Coding Desks | (220, 40) | 240x140 | Edit, Write |
| Library | (500, 40) | 220x140 | Read, Glob, Grep, Web |
| Coffee Bar | (20, 200) | 160x120 | Idle state |
| Meeting Room | (220, 220) | 240x120 | Thinking, Task |
| Server Room | (500, 220) | 220x120 | Bash commands |
| Lobby | (20, 360) | 160x120 | Session start/end |
| Stage | (220, 380) | 240x100 | Presenting results |

## Key Files

| File | Purpose |
|---|---|
| `src/types.ts` | All TypeScript interfaces: `ClaudeEvent`, `BeeCharacter`, `Room`, `OfficeState`, etc. |
| `src/office.ts` | Core state engine. `processEvent()` is the main entry point. `ROOMS` array defines layout. `toolToRoom()` and `toolToActivity()` map tools to bee behavior |
| `src/watcher.ts` | `ClaudeWatcher` extends EventEmitter. Tracks file byte offset for incremental reads |
| `src/server.ts` | Express + ws. `broadcastState()`, `broadcastSpeech()` push to clients |
| `src/voice.ts` | `Voice.speak()` returns audio Buffer. `stripCode()` removes markdown/code from text |
| `src/index.ts` | Wires components: `watcher.on('event')` → `office.processEvent()` → `server.broadcastState()` |
| `public/office.js` | Canvas renderer. `draw()` is the animation loop. `drawBee()` renders characters with wings, expressions, crowns. `updateBee()` interpolates positions |
| `hooks/event-logger.sh` | Bash script. Reads stdin JSON, adds timestamp via python3, appends to JSONL. Always exits 0 |

## Hook Configuration

Hooks are defined in the project's `.claude/settings.local.json` under the `"hooks"` key. Each event maps to the `event-logger.sh` script with a 5-second timeout. The hook script must always exit 0 to never block Claude Code.

To modify which events are captured, edit the `hooks` object in `.claude/settings.local.json` or run `npm run setup-hooks` to regenerate.

## Adding New Rooms or Behaviors

1. Add room to `Room` type in `src/types.ts`
2. Add room definition to `ROOMS` array in `src/office.ts` (x, y, width, height, color)
3. Add tool mapping in `toolToRoom()` and `toolToActivity()` in `src/office.ts`
4. Add room to `ROOMS` array in `public/office.js` (must match coordinates)
5. Optionally add furniture in `FURNITURE` object in `public/office.js`

## Adding New Bee Characters

Worker bees spawn automatically on `SubagentStart` events. To add persistent characters, push to `this.state.bees` in the `Office` constructor in `src/office.ts`.

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

## SVG Bee Assets

11 Porto Rocha-designed bee logos in `public/assets/`:
- `bee-icon.svg` — App icon (macOS squircle, 1024x1024)
- `bee-logo-[1-5].svg` — Standard bee logos
- `bee-logo-porto-[1-5].svg` — Porto Rocha style (warm honey tones, translucent wings, gradients)
