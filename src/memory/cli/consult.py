"""CLI: ask other LLMs through OpenRouter with Mirror identity context."""

import sys

from memory import MemoryClient
from memory.cli.common import db_path_from_mirror_home
from memory.intelligence.llm_router import (
    fetch_generation_cost,
    get_credits,
    resolve_model,
    send_to_model,
)
from memory.services.observability import build_llm_logger

TIERS = ("lite", "mid", "flagship")

SYSTEM_PREAMBLE = """You are the user's Mirror, as described in the context below. Answer in first person, as the user.
Respect the vocabulary, tone, and philosophy described in the identity context.

"""

USD_TO_BRL = 5.7


def cmd_ask(
    model_id: str,
    prompt: str,
    persona=None,
    journey=None,
    org=False,
    query=None,
    mirror_home=None,
):
    mem = MemoryClient(db_path=db_path_from_mirror_home(mirror_home))
    context = mem.load_mirror_context(
        persona=persona,
        journey=journey,
        org=org,
        query=query,
    )

    system_prompt = SYSTEM_PREAMBLE + context
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ]

    print(f"Consulting {model_id}...", flush=True)
    resp = send_to_model(model_id, messages)

    print(f"--- response via {resp.model} ---")
    print(resp.content)
    print("--- end ---")

    cost_parts = []
    if resp.prompt_tokens:
        cost_parts.append(f"prompt: {resp.prompt_tokens}")
    if resp.completion_tokens:
        cost_parts.append(f"completion: {resp.completion_tokens}")
    if cost_parts:
        print(f"[{', '.join(cost_parts)}]")

    total_cost = fetch_generation_cost(resp.generation_id) if resp.generation_id else None
    if total_cost is not None:
        cost_brl = total_cost * USD_TO_BRL
        if total_cost < 0.01:
            print(f"Call cost: ${total_cost:.6f} (R$ {cost_brl:.4f})")
        else:
            print(f"Call cost: ${total_cost:.4f} (R$ {cost_brl:.2f})")

    # Consult joins the ledger with its real fetched cost (metadata-only unless full).
    log = build_llm_logger(mem.store, role="consult", cost_usd=total_cost)
    if log:
        log(resp)

    cmd_credits()


def cmd_credits():
    info = get_credits()

    balance_brl = info.balance * USD_TO_BRL

    bar_width = 20
    if info.total_credits > 0:
        fill = int(bar_width * info.balance / info.total_credits)
    else:
        fill = 0
    bar = "▓" * fill + "░" * (bar_width - fill)

    print(f"Balance: openrouter: {bar} R$ {balance_brl:.2f}")


def parse_args(argv: list[str] | None = None):
    args = sys.argv[1:] if argv is None else argv
    if not args:
        print("Usage: consult <family> [tier] [question] [--persona P] [--journey J] [--org]")
        print("     consult credits")
        sys.exit(1)

    if args[0] == "credits":
        return {"command": "credits"}

    persona = None
    journey = None
    org = False
    query = None
    mirror_home = None
    positional = []

    i = 0
    while i < len(args):
        if args[i] == "--persona" and i + 1 < len(args):
            persona = args[i + 1]
            i += 2
        elif args[i] == "--journey" and i + 1 < len(args):
            journey = args[i + 1]
            i += 2
        elif args[i] == "--query" and i + 1 < len(args):
            query = args[i + 1]
            i += 2
        elif args[i] == "--mirror-home" and i + 1 < len(args):
            mirror_home = args[i + 1]
            i += 2
        elif args[i] == "--org":
            org = True
            i += 1
        else:
            positional.append(args[i])
            i += 1

    if not positional:
        print("Error: model family is required.")
        sys.exit(1)

    family = positional[0]
    tier = "lite"
    prompt = None

    if len(positional) == 1:
        print("Error: question is required.")
        sys.exit(1)
    elif len(positional) == 2:
        if positional[1] in TIERS:
            print("Error: question is required.")
            sys.exit(1)
        else:
            prompt = positional[1]
    elif len(positional) >= 3:
        if positional[1] in TIERS:
            tier = positional[1]
            prompt = " ".join(positional[2:])
        else:
            prompt = " ".join(positional[1:])

    model_id = resolve_model(family, tier)

    return {
        "command": "ask",
        "model_id": model_id,
        "prompt": prompt,
        "persona": persona,
        "journey": journey,
        "org": org,
        "query": query,
        "mirror_home": mirror_home,
    }


def main(argv: list[str] | None = None):
    parsed = parse_args(argv)

    if parsed["command"] == "credits":
        cmd_credits()
    elif parsed["command"] == "ask":
        cmd_ask(
            parsed["model_id"],
            parsed["prompt"],
            persona=parsed.get("persona"),
            journey=parsed.get("journey"),
            org=bool(parsed.get("org", False)),
            query=parsed.get("query"),
            mirror_home=parsed.get("mirror_home"),
        )


if __name__ == "__main__":
    main()
