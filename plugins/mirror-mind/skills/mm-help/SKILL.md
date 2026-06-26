---
name: "mm:help"
description: Shows available Mirror Mind commands and how to use them
user-invocable: true
---

# Help

Show the user the available commands in this format:

## Available Commands

### Mirror Mode

| Command | What it does |
|---------|-----------|
| `/mm:mirror` | Activates Mirror Mode manually |
| | `--persona ID` - specific persona |
| | `--journey ID` - journey context |
| | `--query "terms"` - relevant attachment search |
| | `--org` - include organization identity |
| `/mm:consult <family> "question"` | Asks another LLM with Mirror context |
| | Families: `gemini`, `grok`, `deepseek`, `openai`, `claude`, `llama`, or direct model ID |
| | `[tier]` — lite (default), mid, flagship |
| | `--persona`, `--journey`, `--query`, `--org` |
| `/mm:consult <family>` | Sends the current conversation to another model |
| `/mm:consult credits` | Shows OpenRouter balance |

### Journeys

| Command | What it does |
|---------|-----------|
| `/mm:journeys` | Lists journeys with status and current stage |
| `/mm:journey [id]` | Shows detailed status for one journey or all journeys |
| | If the journey has `sync_file`, reads from the external file |

### Memories And Journal

| Command | What it does |
|---------|-----------|
| `/mm:memories` | Lists recorded memories |
| | `--type TYPE` — decision, insight, idea, journal, tension, learning, pattern, commitment, reflection |
| | `--layer LAYER` — self, ego, shadow |
| | `--journey ID` - filter by journey |
| | `--search "text"` - semantic search |
| | `--limit N` - maximum results (default: 20) |
| `/mm:journal "text"` | Records a personal journal entry |
| | `--journey ID` - associate with a journey |

### Tasks

| Command | What it does |
|---------|-----------|
| `/mm:tasks` | Lists open tasks |
| | `--journey SLUG` - filter by journey |
| | `--status STATUS` — todo, doing, done, blocked |
| | `--all` - include completed tasks |
| `/mm:tasks add "title"` | Creates a task |
| | `--journey SLUG`, `--due YYYY-MM-DD`, `--stage STAGE` |
| `/mm:tasks done ID` | Marks a task as completed |
| `/mm:tasks doing ID` | Marks a task as in progress |
| `/mm:tasks block ID` | Marks a task as blocked |
| `/mm:tasks delete ID` | Removes a task |
| `/mm:tasks import [slug]` | Imports pending tasks from journey paths |
| `/mm:tasks sync [slug]` | Syncs tasks from an external file |
| `/mm:tasks sync-config SLUG /path` | Configures the reference file for sync |

### Weekly Planning

| Command | What it does |
|---------|-----------|
| `/mm:week` | Shows the current week view |
| `/mm:week "free text"` | Ingests a weekly plan and asks confirmation before saving |

### Conversations And Logging

| Command | What it does |
|---------|-----------|
| `/mm:save [slug]` | Saves the latest turn as Markdown in the conversation exports directory |
| | `--full` - save the full conversation |
| `/mm:conversations` | Lists recent conversations |
| | `--limit N`, `--journey ID`, `--persona ID` |
| `/mm:recall ID` | Loads a previous conversation into context |
| | `--limit N` - maximum messages (default: 50) |
| `/mm:new` | Starts a new conversation |
| `/mm:mute` | Toggles conversation logging |

### System

| Command | What it does |
|---------|-----------|
| `/mm:backup` | Backs up the memory database |
| `/mm:seed` | Seeds identity files from the active user home into the database |
| `/mm:release-notes [latest|vX.Y.Z]` | Shows Mirror Mind release notes |
| `/mm:help` | Shows this list |

## Operating Modes

Mirror has two automatically activated modes:

- **Mirror Mode**: personal, work, strategy, writing, mentoring
- **Builder Mode**: code, architecture, bugs, development

When uncertain, ask which mode to use.
