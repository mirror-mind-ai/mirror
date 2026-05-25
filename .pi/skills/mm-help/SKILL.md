---
name: "mm-help"
description: Shows available Mirror Mind commands on Pi and Gemini CLI
user-invocable: true
---

# Help

Show the user the available commands (same on Pi and Gemini CLI):

## Mirror Mode

| Command | What it does |
|---------|-------------|
| `/mm-mirror` | Activates Mirror Mode |
| | `--persona ID` · `--journey ID` · `--query "terms"` · `--org` |

## Builder Mode

| Command | What it does |
|---------|-------------|
| `/mm-build <slug>` | Activates Builder Mode for a journey |

## Journeys

| Command | What it does |
|---------|-------------|
| `/mm-journeys` | Lists journeys with status and current stage |
| `/mm-journey [slug]` | Shows detailed status for one or all journeys |

## Memories & Journal

| Command | What it does |
|---------|-------------|
| `/mm-memories` | Lists recorded memories |
| | `--type TYPE` · `--layer LAYER` · `--journey ID` · `--search "text"` · `--limit N` |
| `/mm-journal "text"` | Records a personal journal entry |
| | `--journey ID` |

## Tasks

| Command | What it does |
|---------|-------------|
| `/mm-tasks` | Lists open tasks |
| | `--journey SLUG` · `--status STATUS` · `--all` |
| `/mm-tasks add "title"` | Creates a task |
| `/mm-tasks done ID` · `doing ID` · `block ID` · `delete ID` | Status changes |
| `/mm-tasks import [slug]` | Imports tasks from journey paths |
| `/mm-tasks sync [slug]` | Syncs tasks from external file |

## Weekly Planning

| Command | What it does |
|---------|-------------|
| `/mm-week` | Shows the current week view |
| `/mm-week plan "text"` | Ingests a weekly plan |

## Conversations & Logging

| Command | What it does |
|---------|-------------|
| `/mm-conversations` | Lists recent conversations |
| `/mm-recall ID` | Loads a previous conversation |
| `/mm-save` | Export conversation (Claude Code only — no Pi transcript) |
| `/mm-new` | Starts a new conversation |
| `/mm-mute` | Toggles conversation logging |

## System

| Command | What it does |
|---------|-------------|
| `/mm-backup` | Backs up the memory database |
| `/mm-seed` | Seeds identity files from the active user home into the database |
| `/mm-release-notes [latest|vX.Y.Z]` | Shows Mirror Mind release notes |
| `/mm-help` | Shows this list |
