"""LLM client with graceful degradation.

If no API key is configured (or the call fails), every AI endpoint falls back
to deterministic in-repo logic so the product keeps working. The LLM is used
ONLY for language understanding and explanations — never for validity.
"""
from __future__ import annotations

import json
import urllib.request
import urllib.error

from ..config import get_settings


class LLMUnavailable(RuntimeError):
    pass


def chat(messages: list[dict], temperature: float = 0.2,
         max_tokens: int = 900) -> str:
    """Call an OpenAI-compatible chat API. Raises LLMUnavailable on any failure."""
    s = get_settings()
    if not s.openai_api_key:
        raise LLMUnavailable("no API key configured")
    body = json.dumps({
        "model": s.llm_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }).encode()
    req = urllib.request.Request(
        s.openai_base_url.rstrip("/") + "/chat/completions",
        data=body,
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {s.openai_api_key}"},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            out = json.loads(resp.read().decode())
        return out["choices"][0]["message"]["content"]
    except Exception as e:  # noqa: BLE001 - degrade to fallback
        raise LLMUnavailable(str(e)) from e


def llm_available() -> bool:
    return bool(get_settings().llm_enabled)
