// What `-h` / `--help` answers after a command (CR215).
//
// Routing answers a help flag anywhere after a known command, before any family
// runs, so a flag that asks what a command does is never the command doing it.
// Before CR215 only the word in the subcommand's place was read as help:
// `tasks delete <id> --help` deleted the task, `identity set ... --help` wrote
// identity, and `journal --help` reached the model to journal the word `--help`.
//
// This module is the table the answer is read from. A line names what the
// command reads, as its route reads it; a test checks every option a line
// names against its route's source. The line for `build` is not here: it is
// generated from the specs its parser enforces (`buildArgSpecs.ts`).
//
// Every command that has no subcommands has a line. Among subcommands, every
// one that changes data, spends money, or moves the operating mode has its own,
// so an agent learns its arguments from help instead of by trying it. A
// subcommand that only reads answers with its family's line.

/**
 * Usage lines without the `usage: ` prefix, keyed by the command as a user
 * types it: `seed`, `tasks add`, `explore story handoff`.
 */
export const COMMAND_SYNOPSES: ReadonlyMap<string, string> = new Map([
  // Commands with no subcommands, and the families with no subcommand list.
  ["init", "init <user>"],
  ["seed", "seed [--force] [--env ENV] [--mirror-home PATH]"],
  ["backup", "backup [--silent] [--backup-dir PATH] [--mirror-home PATH]"],
  ["repair-encoding", "repair-encoding [--apply] [--no-backup] [--limit N] [--mirror-home PATH]"],
  ["journal", "journal <text>... [--journey ID] [--mirror-home PATH]"],
  [
    "consult",
    "consult <family> [tier] [question] [--query TEXT] [--persona ID] [--journey ID] [--org] [--mirror-home PATH] | consult credits",
  ],
  ["recall", "recall <conversation_id> [--limit N] [--mirror-home PATH]"],
  [
    "memories",
    "memories [--search QUERY] [--limit N] [--type TYPE] [--layer LAYER] [--journey ID] [--mirror-home PATH]",
  ],
  ["journeys", "journeys [--mirror-home PATH]"],
  ["detect-persona", "detect-persona <query> [--mirror-home PATH]"],
  ["welcome", "welcome [--mirror-home PATH]"],
  ["mcp", "mcp"],
  [
    "journey",
    "journey [status] [<slug>] | journey set-path <slug> <path> | journey update <slug> (<content> | - | --file PATH)",
  ],
  [
    "conversations",
    "conversations [--limit N] [--journey ID] [--persona ID] [--mirror-home PATH] | conversations {append,imported,skill-turns} ...",
  ],

  [
    "identity set",
    "identity set <layer> <key> [--content TEXT | --file PATH] [--mirror-home PATH]",
  ],
  ["identity edit", "identity edit <layer> <key> [--mirror-home PATH]"],

  [
    "extensions sync",
    "extensions sync --runtime NAME --target-root PATH [--extensions-root PATH] [--mirror-home PATH]",
  ],
  [
    "extensions install",
    "extensions install <id> --extensions-root PATH [--runtime NAME] [--mirror-home PATH]",
  ],
  ["extensions uninstall", "extensions uninstall <id> [--runtime NAME] [--mirror-home PATH]"],
  ["extensions expose-claude", "extensions expose-claude --target-root PATH [--mirror-home PATH]"],
  ["extensions clean-claude", "extensions clean-claude --target-root PATH"],

  [
    "mirror load",
    "mirror load [--query TEXT] [--persona ID] [--journey ID] [--org] [--context-only] [--session-id ID] [--mirror-home PATH]",
  ],
  ["mirror deactivate", "mirror deactivate [--session-id ID] [--mirror-home PATH]"],
  ["mirror log", "mirror log <summary> [--session-id ID] [--mirror-home PATH]"],

  ["mode activate", "mode activate <mode> [--journey ID] [--session-id ID] [--mirror-home PATH]"],
  ["mode deactivate", "mode deactivate [--session-id ID] [--mirror-home PATH]"],

  ["conversation-logger mute", "conversation-logger mute [--mirror-home PATH]"],
  ["conversation-logger unmute", "conversation-logger unmute [--mirror-home PATH]"],
  [
    "conversation-logger discard-current",
    "conversation-logger discard-current [--session-id ID] [--interface NAME] [--mirror-home PATH]",
  ],
  [
    "conversation-logger repair-journeys",
    "conversation-logger repair-journeys [--apply] [--limit N] [--mirror-home PATH]",
  ],
  [
    "conversation-logger switch",
    "conversation-logger switch [--session-id ID] [--mirror-home PATH]",
  ],

  ["explore load", "explore load <journey> [--session-id ID] [--mirror-home PATH]"],
  ["explore deactivate", "explore deactivate [--session-id ID] [--mirror-home PATH]"],
  [
    "explore story update",
    "explore story update <journey> [--story TEXT] [--summary TEXT] [--last-card TEXT] [--mirror-home PATH]",
  ],
  [
    "explore story open",
    "explore story open <journey> [--story TEXT] [--summary TEXT] [--last-card TEXT] [--mirror-home PATH]",
  ],
  [
    "explore story thicken",
    "explore story thicken <journey> [--story TEXT] [--summary TEXT] [--last-card TEXT] [--changed TEXT] [--mirror-home PATH]",
  ],
  ["explore story archive", "explore story archive <journey> [--mirror-home PATH]"],
  ["explore story clear", "explore story clear <journey> [--mirror-home PATH]"],
  ["explore story promote", "explore story promote <journey> [--mirror-home PATH]"],
  [
    "explore story attractors",
    "explore story attractors <journey> --attractor LABEL [--description TEXT] [--status STATUS] [--mirror-home PATH]",
  ],
  [
    "explore story experiment",
    "explore story experiment <journey> --title TITLE [--description TEXT] [--status STATUS] [--mirror-home PATH]",
  ],
  [
    "explore story handoff",
    "explore story handoff <journey> --title TITLE [--summary TEXT] [--editorial-synthesis TEXT] [--source-conversation ID[:ROLE]]... [--include-full-conversation] [--mirror-home PATH]",
  ],

  ["soul load", "soul load [<journey>] [--session-id ID] [--mirror-home PATH]"],
  [
    "soul apply",
    "soul apply <layer> --proposed TEXT --confirm APPLY [--key KEY] [--origin TEXT] [--conversation-id ID] [--journal-id ID] [--mirror-home PATH]",
  ],
  ["soul fruit", "soul fruit {set <fruit>,show,clear} [--session-id ID] [--mirror-home PATH]"],
  [
    "soul harvest",
    "soul harvest {set [<fruit>],show,save,decline} [--journey ID] [--session-id ID] [--mirror-home PATH]",
  ],

  [
    "tasks add",
    "tasks add <title> [--journey ID] [--due DATE] [--stage STAGE] [--mirror-home PATH]",
  ],
  ["tasks done", "tasks done <task_id> [--mirror-home PATH]"],
  ["tasks doing", "tasks doing <task_id> [--mirror-home PATH]"],
  ["tasks block", "tasks block <task_id> [--mirror-home PATH]"],
  ["tasks delete", "tasks delete <task_id> [--mirror-home PATH]"],
  ["tasks import", "tasks import [<journey>] [--mirror-home PATH]"],
  ["tasks sync", "tasks sync [<journey>] [--mirror-home PATH]"],
  ["tasks sync-config", "tasks sync-config <journey> <file_path> [--mirror-home PATH]"],

  ["week plan", "week plan <text> [--mirror-home PATH]"],
  ["week save", "week save [--mirror-home PATH]"],

  ["descriptor generate", "descriptor generate [--layer LAYER] [--key KEY] [--mirror-home PATH]"],

  [
    "consolidate scan",
    "consolidate scan [--journey ID] [--layer LAYER] [--limit N] [--threshold F] [--mirror-home PATH]",
  ],
  ["consolidate apply", "consolidate apply <proposal_id> [--content TEXT] [--mirror-home PATH]"],
  ["consolidate reject", "consolidate reject <proposal_id> [--mirror-home PATH]"],

  ["shadow scan", "shadow scan [--limit N] [--mirror-home PATH]"],
  ["shadow apply", "shadow apply <proposal_id> [--content TEXT] [--mirror-home PATH]"],
  ["shadow reject", "shadow reject <proposal_id> [--mirror-home PATH]"],

  ["journey set-path", "journey set-path <slug> <path> [--mirror-home PATH]"],
  ["journey update", "journey update <slug> (<content> | - | --file PATH) [--mirror-home PATH]"],

  // `runtime`'s lines came with PR #60 (issue #58), where `runtime update
  // --help` performed an update. Every runtime subcommand has one.
  ["runtime status", "runtime status [--mirror-home PATH] [--channel stable|main]"],
  ["runtime version", "runtime version [--start COMMIT] [--channel stable|main]"],
  ["runtime diagnose", "runtime diagnose [--mirror-home PATH]"],
  [
    "runtime update",
    "runtime update [--check] [--dry-run] [--no-fetch] [--skip-migrations] [--repair-updater] [--mirror-home PATH] [--channel stable|main]",
  ],
  [
    "runtime release-notes",
    "runtime release-notes [latest|<version>|pending] [--ref GIT_REF] [--from VERSION] [--no-fetch]",
  ],
  ["runtime backup", "runtime backup [--mirror-home PATH] [--verify PATH]"],
  ["runtime migrate", "runtime migrate [--mirror-home PATH]"],
  ["runtime channel", "runtime channel [stable|main]"],
]);
