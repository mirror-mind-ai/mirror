"""Allow `python -m memory <command>` dispatch."""

import sys


def _prefer_utf8_stdio() -> None:
    """Keep Unicode CLI surfaces printable on Windows cp1252 consoles.

    Mirror's runtime cards intentionally use glyphs such as ◇ and →. On
    Windows, Python can inherit a legacy console encoding (commonly cp1252)
    even when the surrounding terminal can display UTF-8. Reconfiguring the
    text streams makes direct CLI use and Pi extension subprocesses agree with
    Mirror's UTF-8 file/database contract. Test capture streams and custom
    file-like objects may not expose ``reconfigure``; those are left alone.
    """
    for stream in (sys.stdout, sys.stderr):
        encoding = (getattr(stream, "encoding", None) or "").lower()
        if encoding == "utf-8" or encoding.startswith("utf-8-"):
            continue
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except (OSError, ValueError):
                pass


_prefer_utf8_stdio()

USAGE = """Usage: python -m memory <command> [args]

Commands:
  init                 Initialize a user home from identity templates
                       Usage: python -m memory init <user>
  seed                 Seed identity YAML files into the database (bootstrap only — skips existing entries)
                       Use --force to overwrite existing entries from YAML files
  identity             Read and update identity directly in the database
                       Usage: python -m memory identity <list|get|set|edit> [args]
  list                 List personas, journeys, extensions, or all
                       Usage: python -m memory list [personas|journeys|extensions|all] [--mirror-home PATH] [--verbose] [--extensions-root PATH] [--runtime NAME]
  inspect              Inspect one persona, extension, runtime catalog, or llm-calls trace
                       Usage: python -m memory inspect persona|extension|runtime-catalog <id> [--mirror-home PATH] [--extensions-root PATH]
                              python -m memory inspect llm-calls [--conversation ID] [--session ID] [--role ROLE] [--since DATE] [--limit N]
  detect-persona       Show persona routing matches for a query
                       Usage: python -m memory detect-persona <query> [--mirror-home PATH]
  extensions           List, validate, sync, install, uninstall, expose, or clean external skills under the active Mirror home
                       Usage: python -m memory extensions [list|validate|sync|install|uninstall|expose-claude|clean-claude] [--mirror-home PATH] [--extensions-root PATH] [--runtime NAME] [--target-root PATH]
                       expose-claude and clean-claude require --target-root PATH
  ext                  Dispatch into a command-skill extension's CLI
                       Usage: python -m memory ext [list | <id> [--help] | <id> <subcommand> [args...] | <id> bind|unbind|bindings|migrate ...]
  mirror               Mirror skill commands
                       Usage: python -m memory mirror <load|deactivate|log|journeys> [args]
  mode                 Explicit Mirror operating mode lifecycle
                       Usage: python -m memory mode <activate|deactivate|status> [args]
  conversation-logger  Conversation logging commands
                       Usage: python -m memory conversation-logger <status|mute|unmute|switch|...>
  backup               Create a zipped backup of the memory database
                       Usage: python -m memory backup [--silent]
  repair-encoding      Dry-run/apply repair for reversible UTF-8/Windows mojibake in user text
                       Usage: python -m memory repair-encoding [--mirror-home PATH] [--apply] [--no-backup]
  journal              Record a journal entry
                       Usage: python -m memory journal [--journey SLUG] [--mirror-home PATH] <text>
  journey              Inspect or update a journey
                       Usage: python -m memory journey [status [SLUG]] | update <slug> <content> | set-path <slug> <path> [--mirror-home PATH]
  build                Builder Mode DB context loader
                       Usage: python -m memory build load <slug>
  explore              Explorer Mode context loader
                       Usage: python -m memory explore load <slug>
  soul                 Soul Mode context loader and surface renderer
                       Usage: python -m memory soul load [slug]
                              python -m memory soul listen [--self TEXT] [--shadow TEXT] [--wisdom TEXT] [--beauty TEXT]
                              python -m memory soul rite self|shadow|wisdom|beauty [--says TEXT]
                              python -m memory soul close [--harvested TEXT] [--echoes TEXT] [--open TEXT] [--integration TEXT]
                              python -m memory soul review [--journal TEXT] [--self TEXT] [--shadow TEXT] [--ego TEXT] [--persona TEXT] [--open TEXT]
                              python -m memory soul propose self|shadow|ego|persona --proposed TEXT --why TEXT
                              python -m memory soul apply self|shadow|ego|persona --proposed TEXT --confirm APPLY
                              python -m memory soul fruit set|show|clear
                              python -m memory soul harvest set|show|save|decline
                              python -m memory soul prompt self|wisdom|beauty
  memories             List memories with filters
                       Usage: python -m memory memories [--type T] [--layer L] [--journey J] [--search Q] [--mirror-home PATH]
  conversations        List recent conversations
                       Usage: python -m memory conversations [--limit N] [--journey J] [--persona P] [--mirror-home PATH]
  recall               Load messages from a previous conversation
                       Usage: python -m memory recall <conversation_id> [--limit N] [--mirror-home PATH]
  tasks                Task management
                       Usage: python -m memory tasks [--mirror-home PATH] [list|add|done|doing|block|import|sync|delete] [args]
  week                 Weekly planning
                       Usage: python -m memory week [--mirror-home PATH] [view|plan <text>|save]
  journeys             List journeys with status, stage, and description
                       Usage: python -m memory journeys [--mirror-home PATH]
  migrate-legacy       Validate or run explicit legacy migration into a user home
                       Usage: python -m memory migrate-legacy validate --source PATH --target-home PATH
                              python -m memory migrate-legacy run --source PATH --target-home PATH
  consult              Ask other LLMs through OpenRouter with Mirror context
                       Usage: python -m memory consult <family> [tier] "question" [--persona P] [--journey J] [--org] [--mirror-home PATH]
                              python -m memory consult credits
  descriptor           Generate and list routing descriptors for personas and journeys
                       Usage: python -m memory descriptor generate [--layer LAYER] [--key KEY]
                              python -m memory descriptor list [--layer LAYER]
  eval                 Run a named eval probe set (hits real LLM — costs money, not for CI)
                       Usage: python -m memory eval <name>
  consolidate          Scan memories for patterns and manage consolidation proposals
                       Usage: python -m memory consolidate <scan|apply|reject|list> [args]
  shadow               Surface and promote shadow-layer observations
                       Usage: python -m memory shadow <scan|apply|reject|list|show> [args]
  web                  Run the local Mirror Web Console
                       Usage: python -m memory web [--host 127.0.0.1] [--port 8765]
  mcp                  Run the Mirror MCP server over stdio (read + on-demand context tools)
                       Usage: python -m memory mcp
  runtime              Inspect Mirror runtime status, drift, backups, version, plan and execute updates
                       Usage: python -m memory runtime status [--mirror-home PATH] [--channel stable|main]
                              python -m memory runtime version [--start PATH] [--channel stable|main]
                              python -m memory runtime diagnose [--mirror-home PATH]
                              python -m memory runtime backup [--mirror-home PATH]
                              python -m memory runtime backup --verify PATH
                              python -m memory runtime update --dry-run [--mirror-home PATH] [--channel stable|main]
                              python -m memory runtime update --check [--channel stable|main]
                              python -m memory runtime update [--no-fetch] [--skip-migrations] [--mirror-home PATH] [--channel stable|main]
                              python -m memory runtime update --repair-updater [--no-fetch] [--mirror-home PATH] [--channel stable|main]
                              python -m memory runtime release-notes [latest|vX.Y.Z]
                              python -m memory runtime release-notes pending [--from vX.Y.Z] [--ref REF] [--no-fetch]
                              python -m memory runtime release-doctor --target vX.Y.Z [--stable REF]
                              python -m memory runtime release-promote --target vX.Y.Z [--stable BRANCH] [--remote REMOTE] [--dry-run] [--push]
  welcome              Render the state-aware welcome card for the current Mirror home
                       Usage: python -m memory welcome [--mirror-home PATH]
"""


def main() -> None:
    if len(sys.argv) < 2:
        print(USAGE)
        sys.exit(1)

    command = sys.argv[1]

    if command == "init":
        sys.argv = [sys.argv[0], *sys.argv[2:]]
        from memory.cli.init import main as _init_main

        _init_main()

    elif command == "seed":
        sys.argv = [sys.argv[0], *sys.argv[2:]]
        from memory.cli.seed import main as _seed_main

        _seed_main()

    elif command == "identity":
        from memory.cli.identity_cmd import main as _identity_main

        _identity_main(sys.argv[2:])

    elif command == "list":
        from memory.cli.inspect import cmd_list

        cmd_list(sys.argv[2:])

    elif command == "inspect":
        from memory.cli.inspect import cmd_inspect

        cmd_inspect(sys.argv[2:])

    elif command == "detect-persona":
        from memory.cli.inspect import cmd_detect_persona

        cmd_detect_persona(sys.argv[2:])

    elif command == "extensions":
        from memory.cli.extensions import cmd_extensions

        cmd_extensions(sys.argv[2:])

    elif command == "ext":
        from memory.cli.ext import cmd_ext

        sys.exit(cmd_ext(sys.argv[2:]))

    elif command == "mirror":
        from memory.skills.mirror import main as _mirror_main

        _mirror_main(sys.argv[2:])

    elif command == "mode":
        from memory.cli.mode import main as _mode_main

        _mode_main(sys.argv[2:])

    elif command == "conversation-logger":
        from memory.cli.conversation_logger import main as _logger_main

        _logger_main(sys.argv[2:])

    elif command == "backup":
        sys.argv = [sys.argv[0], *sys.argv[2:]]
        from memory.cli.backup import main as _backup_main

        _backup_main()

    elif command == "repair-encoding":
        from memory.cli.repair_encoding import main as _repair_encoding_main

        sys.exit(_repair_encoding_main(sys.argv[2:]))

    elif command == "journal":
        sys.argv = [sys.argv[0], *sys.argv[2:]]
        from memory.cli.journal import main as _journal_main

        _journal_main()

    elif command == "journey":
        sys.argv = [sys.argv[0], *sys.argv[2:]]
        from memory.cli.journey import main as _journey_main

        _journey_main()

    elif command == "memories":
        sys.argv = [sys.argv[0], *sys.argv[2:]]
        from memory.cli.memories import main as _memories_main

        _memories_main()

    elif command == "conversations":
        sys.argv = [sys.argv[0], *sys.argv[2:]]
        from memory.cli.conversations import main as _conversations_main

        _conversations_main()

    elif command == "recall":
        sys.argv = [sys.argv[0], *sys.argv[2:]]
        from memory.cli.recall import main as _recall_main

        _recall_main()

    elif command == "tasks":
        sys.argv = [sys.argv[0], *sys.argv[2:]]
        from memory.cli.tasks_cmd import main as _tasks_main

        _tasks_main()

    elif command == "week":
        sys.argv = [sys.argv[0], *sys.argv[2:]]
        from memory.cli.week import main as _week_main

        _week_main()

    elif command == "journeys":
        sys.argv = [sys.argv[0], *sys.argv[2:]]
        from memory.cli.journeys import main as _journeys_main

        _journeys_main()

    elif command == "build":
        from memory.cli.build import main as _build_main

        _build_main(sys.argv[2:])

    elif command == "explore":
        from memory.cli.explore import main as _explore_main

        _explore_main(sys.argv[2:])

    elif command == "soul":
        from memory.cli.soul import main as _soul_main

        _soul_main(sys.argv[2:])

    elif command == "consult":
        sys.argv = [sys.argv[0], *sys.argv[2:]]
        from memory.cli.consult import main as _consult_main

        _consult_main()

    elif command == "migrate-legacy":
        sys.argv = [sys.argv[0], *sys.argv[2:]]
        from memory.cli.migrate_legacy import main as _migrate_legacy_main

        _migrate_legacy_main()

    elif command == "descriptor":
        from memory.cli.descriptor import main as _descriptor_main

        _descriptor_main(sys.argv[2:])

    elif command == "eval":
        from evals.runner import main as _eval_main

        sys.exit(_eval_main(sys.argv[2:]))

    elif command == "consolidate":
        from memory.cli.consolidate_cmd import main as _consolidate_main

        _consolidate_main(sys.argv[2:])

    elif command == "shadow":
        from memory.cli.shadow_cmd import main as _shadow_main

        _shadow_main(sys.argv[2:])

    elif command == "web":
        from memory.web.server import main as _web_main

        _web_main(sys.argv[2:])

    elif command == "mcp":
        from memory.mcp.server import main as _mcp_main

        sys.exit(_mcp_main(sys.argv[2:]))

    elif command == "runtime":
        from memory.cli.runtime import cmd_runtime

        sys.exit(cmd_runtime(sys.argv[2:]))

    elif command == "welcome":
        from memory.cli.welcome import main as _welcome_main

        _welcome_main(sys.argv[2:])

    else:
        print(f"Unknown command: {command}\n")
        print(USAGE)
        sys.exit(1)


if __name__ == "__main__":
    main()
