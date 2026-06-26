"""LLM router for sending messages to models through OpenRouter."""

import json
import ssl
import time
import urllib.request
from dataclasses import dataclass
from typing import cast

import certifi
from openai import OpenAI
from openai.types.chat import ChatCompletionMessageParam

from memory.config import (
    LLM_FAMILIES,
    OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL,
)


@dataclass
class LLMResponse:
    model: str
    content: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_cost: float | None = None
    generation_id: str | None = None
    latency_ms: int | None = None
    prompt: str | None = None


@dataclass
class CreditInfo:
    total_credits: float
    total_usage: float
    balance: float


def _openrouter_ssl_context() -> ssl.SSLContext:
    """Return a certificate-backed SSL context for OpenRouter urllib calls."""
    return ssl.create_default_context(cafile=certifi.where())


def resolve_model(family: str, tier: str = "mid") -> str:
    """Resolve family plus tier to an OpenRouter model_id.

    If family contains '/', assume it is a direct model_id.
    """
    if "/" in family:
        return family

    family_lower = family.lower()
    if family_lower not in LLM_FAMILIES:
        available = ", ".join(sorted(LLM_FAMILIES.keys()))
        raise ValueError(f"Family '{family}' not found. Available: {available}")

    tiers = LLM_FAMILIES[family_lower]
    tier_lower = tier.lower()
    if tier_lower not in tiers:
        raise ValueError(f"Tier '{tier}' does not exist for '{family}'. Use: lite, mid, flagship")

    return tiers[tier_lower]


def send_to_model(
    model: str,
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 4096,
) -> LLMResponse:
    """Send messages to one model through OpenRouter and return response metadata."""
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not configured.")

    client = OpenAI(
        api_key=OPENROUTER_API_KEY,
        base_url=OPENROUTER_BASE_URL,
    )

    prompt_str = json.dumps(messages, ensure_ascii=False)

    t0 = time.perf_counter()
    response = client.chat.completions.create(
        model=model,
        messages=cast(list[ChatCompletionMessageParam], messages),
        temperature=temperature,
        max_tokens=max_tokens,
    )
    latency_ms = int((time.perf_counter() - t0) * 1000)

    content = (response.choices[0].message.content or "").strip()

    # Extract cost metadata.
    prompt_tokens = None
    completion_tokens = None
    total_cost = None
    generation_id = getattr(response, "id", None)

    if response.usage:
        prompt_tokens = response.usage.prompt_tokens
        completion_tokens = response.usage.completion_tokens

    return LLMResponse(
        model=model,
        content=content,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_cost=total_cost,
        generation_id=generation_id,
        latency_ms=latency_ms,
        prompt=prompt_str,
    )


def fetch_generation_cost(generation_id: str, retries: int = 4) -> float | None:
    """Fetch real generation cost through OpenRouter /api/v1/generation.

    OpenRouter can take a few seconds to expose usage data. Uses progressive
    backoff: 1s, 2s, 3s, 4s between attempts.
    """
    import time

    url = f"{OPENROUTER_BASE_URL}/generation?id={generation_id}"
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"},
    )
    for attempt in range(retries + 1):
        if attempt > 0:
            time.sleep(attempt)  # backoff: 1s, 2s, 3s, 4s
        try:
            with urllib.request.urlopen(req, context=_openrouter_ssl_context()) as resp:
                data = json.loads(resp.read().decode()).get("data", {})
                cost = data.get("total_cost")
                if cost is not None:
                    return float(cost)
        except Exception:
            pass
    return None


def get_credits() -> CreditInfo:
    """Fetch OpenRouter balance through /api/v1/credits."""
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not configured.")

    req = urllib.request.Request(
        f"{OPENROUTER_BASE_URL}/credits",
        headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"},
    )
    with urllib.request.urlopen(req, context=_openrouter_ssl_context()) as resp:
        data = json.loads(resp.read().decode())["data"]

    total = data.get("total_credits", 0)
    usage = data.get("total_usage", 0)

    return CreditInfo(
        total_credits=total,
        total_usage=usage,
        balance=total - usage,
    )
