# BeeHaven Office

Visualize Claude Code activity as an animated bee office. Watch your AI coding assistant come to life as bee characters navigate between rooms — coding at desks, running commands in the server room, and presenting results in the conference room.

## Quick Start

```bash
npx @clearly/beehaven
```

That's it. BeeHaven starts a server at `http://localhost:3333`, auto-opens your browser, and auto-installs Claude Code hooks. Set a 4-digit PIN on first launch and you're in.

Hooks are installed globally to `~/.claude/settings.json` so all Claude Code sessions emit events — no per-project setup needed. If you already have a Claude Code session running, restart it for hooks to take effect.

## What You'll See

A PixiJS WebGL office with 9 rooms. The queen bee represents your main Claude Code session. She moves between rooms based on what Claude is doing:

| Activity | Room |
|---|---|
| Session starts/ends | Reception (lobby) |
| Reading files (Read, Glob, Grep) | Library |
| Editing files (Edit, Write) | Studio |
| Running commands (Bash) | Server Room |
| Web browsing (WebFetch, WebSearch) | Web Booth |
| Thinking, planning, presenting (Task, Stop) | Conference Room |
| Idle (8+ seconds) | Kitchen or Lounge |

Worker bees spawn when Claude launches subagents and disappear when they finish. The terminal panel on the right shows Claude's responses and tool activity in real time.

BeeHaven also scans `~/.claude/projects/` for active transcripts, so even sessions started before BeeHaven will appear.

## Features

### Free (no account needed)

- Real-time animated office with PixiJS v8 WebGL rendering
- Bee characters that move between 9 rooms based on Claude Code activity
- Terminal panel showing Claude's responses and tool activity
- Activity log with timestamped events
- Multi-project tabs (auto-detected from `~/.claude/projects/`)
- Honey currency earned from coding activity
- Bee shop with skins and accessories
- HiDPI Retina display support
- PIN-locked access screen

### With Clearly Account

Link your [Clearly](https://clearly.sh) account to unlock:

- Cloud sync — project context, transcripts, and docs synced to Clearly
- Shared team visualization — see teammates' offices
- Synced bee skins across devices
- Voice narration (ElevenLabs TTS)

```bash
npx @clearly/beehaven login
```

## CLI Reference

```
beehaven [command] [options]

Commands:
  start          Start the office server (default)
  setup          Re-install Claude Code hooks (auto-installed on startup)
  uninstall      Remove all BeeHaven hooks from ~/.claude/settings.json
  login          Link your Clearly account
  logout         Unlink your Clearly account

Options:
  --port <n>     Server port (default: 3333, env: BEEHAVEN_PORT)
  --no-open      Don't auto-open browser
  --verbose      Enable verbose logging
  --help, -h     Show help
  --version, -v  Show version
```

## How It Works

```
Claude Code hooks → /tmp/beehaven-events.jsonl → Watcher → Office State → WebSocket → PixiJS Canvas
```

1. **Hooks**: On startup, BeeHaven writes hooks to `~/.claude/settings.json`. A shell script receives events from Claude Code and appends timestamped JSONL to `/tmp/beehaven-events.jsonl`
2. **Watcher**: Polls the JSONL file for new events using chokidar (100ms interval)
3. **Office**: State machine maps events to bee positions and activities across 9 rooms
4. **Server**: Express + WebSocket pushes state updates at 2Hz to connected browsers
5. **Canvas**: PixiJS v8 renders the animated office with A\* pathfinding, sliding doors, elevator, and dynamic bee expressions
6. **Transcript Scanner**: Every 3 seconds, scans `~/.claude/projects/` for recently-modified transcript files to discover sessions even without hooks

## Environment Variables

| Variable | Description |
|---|---|
| `BEEHAVEN_PORT` | Server port (default: 3333) |
| `ELEVENLABS_API_KEY` | Enable voice narration via ElevenLabs TTS |

## Contributing

Contributions welcome! Please open an issue or PR on [GitHub](https://github.com/clearly-sh/beehaven).

## License

MIT
