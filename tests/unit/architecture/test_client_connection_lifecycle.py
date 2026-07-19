"""Architecture guard: never chain on a freshly constructed MemoryClient.

`get_connection()` opens a fresh SQLite connection per call and
`MemoryClient.__del__` closes it (the Python 3.14 file-descriptor fix). Chaining
a data attribute on a temporary client —

    MemoryClient(...).store.upsert(...)     # or _memory_client(...).store.x()

— lets CPython refcount-collect the temporary right after `.store` is read,
closing the connection via `__del__` before the call runs, which raises
``sqlite3.ProgrammingError: Cannot operate on a closed database``. In production
hook subprocesses (where failures are swallowed) this is silent. It caused two
real bugs: CV9.E2.S7 (the quarantine-count helper) and CV9.E2.S8 (`mirror_state`
`_load_state`/`write_state`).

Bind the client to a local (``mem = _memory_client(...); mem.store...``) or use
``with``. A direct method call on the temporary (``MemoryClient(...).close()``)
is safe — the bound method keeps the client alive for the duration of the call —
and is allowed.

This test fails if the pattern is reintroduced anywhere under ``src/memory`` or
``tests``.
"""

import ast
from pathlib import Path

_CLIENT_FACTORIES = {"MemoryClient", "_memory_client"}
_REPO_ROOT = Path(__file__).resolve().parents[3]
_SCAN_ROOTS = (_REPO_ROOT / "src" / "memory", _REPO_ROOT / "tests")


def _is_client_factory(func: ast.expr) -> bool:
    if isinstance(func, ast.Name):
        return func.id in _CLIENT_FACTORIES
    if isinstance(func, ast.Attribute):
        return func.attr in _CLIENT_FACTORIES
    return False


def find_chained_client_temporaries(
    source: str, filename: str = "<unknown>"
) -> list[tuple[int, str]]:
    """Return (lineno, attr) for each data attribute read off a temporary client.

    Flags ``MemoryClient(...).store`` / ``_memory_client(...).conn`` etc. Allows a
    direct method call on the temporary (``X().close()``): there the bound method
    holds the client alive for the call, so the connection is not closed early.
    """
    tree = ast.parse(source, filename=filename)
    chained = {
        id(node): node
        for node in ast.walk(tree)
        if isinstance(node, ast.Attribute)
        and isinstance(node.value, ast.Call)
        and _is_client_factory(node.value.func)
    }
    method_calls = {
        id(node.func)
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and id(node.func) in chained
    }
    return sorted(
        (node.lineno, node.attr) for cid, node in chained.items() if cid not in method_calls
    )


def test_detector_flags_data_attribute_chains_and_allows_safe_forms():
    flagged = "MemoryClient(db).store.get(x)\n_memory_client(h).conn.execute(y)"
    assert find_chained_client_temporaries(flagged) == [(1, "store"), (2, "conn")]

    allowed = (
        "m = MemoryClient(db)\n"  # bind to a local
        "m.store.get(x)\n"  # attribute on a bound name
        "MemoryClient(db).close()\n"  # method call keeps the temporary alive
        "with MemoryClient(db) as c:\n"  # context manager holds it
        "    c.store.get(x)\n"
    )
    assert find_chained_client_temporaries(allowed) == []


def test_no_chained_client_temporary_in_repo():
    offenders = []
    for root in _SCAN_ROOTS:
        for path in sorted(root.rglob("*.py")):
            for lineno, attr in find_chained_client_temporaries(path.read_text(), str(path)):
                offenders.append(f"{path.relative_to(_REPO_ROOT)}:{lineno} -> .{attr}")
    assert not offenders, (
        "Chained MemoryClient temporary(ies) found. A freshly constructed client is "
        "garbage-collected right after the attribute access, closing its SQLite "
        "connection via __del__ before the call runs. Bind it to a local "
        "(mem = _memory_client(...); mem.store...) or use `with`:\n  " + "\n  ".join(offenders)
    )
