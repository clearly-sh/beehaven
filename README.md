# BeeHaven Office

Visualize Claude Code activity as an animated bee office. Watch your AI coding assistant come to life as bee characters navigate between rooms — coding at desks, running commands in the server room, and presenting results in the conference room.

## Quick Start

```bash
npx @clearly/beehaven
```

This starts the BeeHaven Office server and opens it in your browser at `http://localhost:3333`.

## Setup

Configure Claude Code hooks so BeeHaven can observe activity:

```bash
# In your project directory:
npx @clearly/beehaven setup
```

This writes hook configuration to `.claude/settings.local.json` in your current directory. Restart Claude Code for hooks to take effect.

## Features

### Free (no account needed)

- Real-time animated office with PixiJS WebGL rendering
- Bee characters that move between rooms based on Claude Code activity
- Terminal panel showing Claude's responses
- Activity log with tool calls, file reads/writes, commands
- Multi-project support with building view
- Honey currency earned from coding activity
- Bee shop with skins and accessories
- HiDPI Retina display support

### With Clearly Account

Link your [Clearly](https://clearly.sh) account to unlock:

- Cloud relay — sync office state to the cloud
- Shared team visualization — see teammates' offices
- Synced bee skins across devices
- Voice narration (ElevenLabs TTS)
- Usage analytics

```bash
npx @clearly/beehaven login
```

## CLI Reference

```
beehaven [command] [options]

Commands:
  start          Start the office server (default)
  setup          Configure Claude Code hooks for current project
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
Claude Code hooks --> /tmp/beehaven-events.jsonl --> Watcher --> Office State --> WebSocket --> PixiJS Canvas
```

1. **Hooks**: A shell script receives events from Claude Code and appends them to a JSONL file
2. **Watcher**: Polls the JSONL file for new events using chokidar
3. **Office**: State machine maps events to bee positions and activities across 8 rooms
4. **Server**: Express + WebSocket pushes state updates at 2Hz to connected browsers
5. **Canvas**: PixiJS v8 renders the animated office with A\* pathfinding, sliding doors, elevator, and dynamic bee expressions

### Hook Events

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

## Environment Variables

| Variable | Description |
|---|---|
| `BEEHAVEN_PORT` | Server port (default: 3333) |
| `ELEVENLABS_API_KEY` | Enable voice narration via ElevenLabs TTS |

## Contributing

Contributions welcome! Please open an issue or PR on [GitHub](https://github.com/clearly-sh/beehaven).

## License

MIT
