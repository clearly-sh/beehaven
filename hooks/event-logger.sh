#!/bin/bash
# BeeHaven Office - Claude Code Event Logger
# This hook script captures Claude Code events and writes them to a JSONL file
# for the BeeHaven Office watcher to consume.

EVENTS_FILE="/tmp/beehaven-events.jsonl"
INPUT=$(cat)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")

# Add timestamp and write to events file
echo "$INPUT" | /usr/bin/env python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    data['timestamp'] = '$TIMESTAMP'
    print(json.dumps(data))
except:
    pass
" >> "$EVENTS_FILE" 2>/dev/null

# Always exit 0 so we never block Claude Code
exit 0
