# BeeHaven Office

Real-time Claude Code activity visualizer. Watch kawaii bees move between office rooms as Claude works on your code.

## Quick Start

```bash
# 1. Install & Build
cd beehaven
npm install
npm run build

# 2. Configure Claude Code Hooks
npm run setup-hooks
# Writes to .claude/settings.local.json so Claude Code
# sends events to /tmp/beehaven-events.jsonl

# 3. Start the Office
npm run dev
# Opens at http://localhost:3333

# 4. (Optional) Connect to Clearly Cloud
npm run setup-relay
# Follow prompts to enter your relay token
# Get a token at clearly.sh/home > Settings > Generate Relay Token

# 5. (Optional) Enable Voice
ELEVENLABS_API_KEY=sk-... npm run dev
# Bees narrate Claude Code activity via ElevenLabs TTS
```

## How It Works

```
Claude Code hooks --> /tmp/beehaven-events.jsonl --> Watcher --> Office State --> WebSocket --> Browser
                                                                     |
                                                               Relay (optional)
                                                                     |
                                                              Firebase/Firestore
                                                                     |
                                                            clearly.sh web office
```

1. **Hooks** capture every Claude Code event (tool calls, prompts, sessions) via `event-logger.sh`
2. **Watcher** polls the JSONL file every 100ms and parses new events
3. **Office state machine** maps events to bee room transitions:
   - `Edit/Write` --> Team Office (coding)
   - `Read/Grep/Glob` --> Team Office (reading)
   - `Bash` --> Server Closet (terminal)
   - `Task` (subagent) --> Meeting Room (delegation)
   - `UserPromptSubmit` --> Meeting Room (thinking)
   - `Stop` --> Meeting Room (presenting results)
   - Idle 8s --> Kitchen or Lounge (break)
4. **WebSocket** pushes state to the browser at 2Hz
5. **PixiJS canvas** renders animated bees with wings, speech bubbles, and room transitions
6. **Relay** (optional) syncs state to Firebase for the web office at clearly.sh

## Worker Bees

When Claude Code launches subagents (`Task` tool), worker bees spawn and fly to the appropriate room. They celebrate when done and disappear after 3 seconds.

## Claude Code Hook Events

| Event | Bee Behavior |
|---|---|
| `SessionStart` | Queen arrives in lobby |
| `UserPromptSubmit` | Queen moves to meeting room |
| `PreToolUse` (Read/Grep) | Queen moves to team office |
| `PreToolUse` (Edit/Write) | Queen moves to team office |
| `PreToolUse` (Bash) | Queen moves to server closet |
| `PostToolUse` | Activity complete indicator |
| `PostToolUseFailure` | Error state, queen rethinks |
| `Stop` | Queen presents results in meeting room |
| `SubagentStart` | Worker bee spawns |
| `SubagentStop` | Worker bee celebrates |
| `SessionEnd` | Queen returns to lobby |

## Office Layout (WeWork-style)

```
Phone Booth A -- Team Office (6 desks) -- Phone Booth B
                      |
              Main Corridor
                      |
Meeting Room -- Kitchen -- Lounge -- Server Closet
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BEEHAVEN_PORT` | `3333` | Local server port |
| `ELEVENLABS_API_KEY` | (none) | Enable voice narration |

## Commands

```bash
npm run dev           # Start with hot-reload
npm run build         # Compile TypeScript
npm run start         # Run compiled JS
npm run setup-hooks   # Configure Claude Code hooks
npm run setup-relay   # Configure cloud relay
```

## Cloud Relay

The relay syncs your local office state to Clearly's Firebase backend so your bees appear in the web office at clearly.sh.

### Setup

1. Sign in at clearly.sh
2. Go to Settings > Generate Relay Token
3. Run `npm run setup-relay` and paste the token
4. Your bees now appear in the web office in real-time

### Architecture

- **Token auth**: 64-char hex token with 90-day TTL (auto-extended)
- **Rate limits**: 30 req/min (free), 120 (pro), 300 (team)
- **Batching**: Events debounced at 300ms, batches of up to 20
- **Heartbeat**: Every 30 seconds, extends token TTL
- **Backoff**: Exponential retry (1s to 60s) on failures
