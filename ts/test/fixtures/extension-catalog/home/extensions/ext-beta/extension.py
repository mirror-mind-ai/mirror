"""Fixture command-skill entrypoint. Never executed by the catalog golden."""


def register(api):
    api.register_cli("echo", _cmd_echo, summary="Echo the arguments back")


def _cmd_echo(api, argv):
    """Echo the arguments back."""
    print(" ".join(argv))
    return 0
