"""
Chatbot orchestrator, provider-agnostic (OpenAI-compatible API: OpenRouter, Gemini, Groq, Mistral...).

This is the ONLY file that talks to an LLM provider.

.env (primary):   LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
.env (optional):  LLM_FALLBACK_BASE_URL, LLM_FALLBACK_API_KEY, LLM_FALLBACK_MODEL
Chain: primary -> fallback -> offline template (never an empty error during a demo).

History rule: the frontend sends plain text turns only ({"role","content"} strings).
Tool calls are not kept in history, so no tool-result round trip is needed.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from typing import Any, Dict, List, Optional

import openai
from openai import OpenAI

from . import data_access
from .precompute import precompute
from .prompts import build_system
from .tools import TOOLS, validate_action

MAX_TOKENS = int(os.getenv("CHAT_MAX_TOKENS", "1000"))
TEMPERATURE = float(os.getenv("CHAT_TEMPERATURE", "0.2"))
CACHE_TTL_S = int(os.getenv("CHAT_CACHE_TTL_S", "600"))  # identical request within 10 min = no API call


# ---------------------------------------------------------------- providers
def _providers() -> List[dict]:
    """Built at call time so .env changes are picked up after load_dotenv()."""
    chain = []
    for prefix in ("LLM_", "LLM_FALLBACK_"):
        key, base, model = (os.getenv(prefix + s) for s in ("API_KEY", "BASE_URL", "MODEL"))
        if key and base and model:
            # strip stray quotes/spaces that sometimes end up in .env values
            key, base, model = (v.strip().strip('"').strip("'") for v in (key, base, model))
            chain.append({"name": base, "model": model,
                          "client": OpenAI(base_url=base, api_key=key, timeout=30.0, max_retries=0)})
    return chain


def _openai_tools() -> List[dict]:
    """Convert the tool definitions in tools.py to the OpenAI 'function' format."""
    return [{"type": "function",
             "function": {"name": t["name"], "description": t["description"], "parameters": t["input_schema"]}}
            for t in TOOLS]


# ---------------------------------------------------------------- context
def _clean_history(history: Optional[List[dict]], limit: int = 10) -> List[dict]:
    out: List[dict] = []
    for m in history or []:
        if m.get("role") in ("user", "assistant") and isinstance(m.get("content"), str) and m["content"].strip():
            if out and out[-1]["role"] == m["role"]:
                out[-1]["content"] += "\n" + m["content"]
            else:
                out.append({"role": m["role"], "content": m["content"]})
    out = out[-limit:]
    while out and out[0]["role"] != "user":
        out.pop(0)
    return out


def _resolve_regions(regions: Optional[List[dict]], app_state: dict) -> List[dict]:
    if regions:
        return regions
    names = app_state.get("compared_sites") or ([app_state["selected_site"]] if app_state.get("selected_site") else [])
    try:
        return data_access.get_regions(names) if names else []
    except data_access.RegionNotFound:
        return []


def _build_user_message(question: str, regions: List[dict], computed: Optional[dict], app_state: dict) -> str:
    blocks = []
    if app_state:
        blocks.append("APP STATE (what the user currently sees):\n" + json.dumps(app_state, ensure_ascii=False))
    if regions:
        blocks.append("DATA:\n" + json.dumps({"regions": regions}, ensure_ascii=False, indent=1))
        blocks.append("PRECOMPUTED (reliable, computed by code):\n" + json.dumps(computed, ensure_ascii=False, indent=1))
    else:
        blocks.append("DATA: none. No site is selected or provided. Answer general questions only, "
                      "and ask the user to pick a site for any evaluation.")
    blocks.append("QUESTION:\n" + question)
    return "\n\n".join(blocks)


# ---------------------------------------------------------------- cache (saves free-tier quota)
_cache: Dict[str, tuple] = {}


def _cache_get(key: str):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL_S:
        return hit[1]
    return None


# ---------------------------------------------------------------- offline template
def _template_answer(computed: Optional[dict]) -> str:
    """No-LLM summary built from precompute. Used only if every provider fails."""
    if not computed or not computed.get("ranking"):
        return ("The language model is unavailable and no site is selected. "
                "Select a site and try again in a moment.")
    lines = ["(Automatic summary: the language model is unavailable.)", ""]
    for r in computed["ranking"]:
        lines.append(f"{r['rank']}. {r['name']}: score {r['score']}")
    for key, p in (computed.get("parameters") or {}).items():
        if "best" in p and not p.get("all_equal"):
            lines.append(f"- {p['label']}: best = {', '.join(p['best'])} ({p['best_value']}), "
                         f"worst = {', '.join(p['worst'])} ({p['worst_value']})")
    for w in computed.get("warnings", []):
        lines.append(f"! {w}")
    return "\n".join(lines)


# ---------------------------------------------------------------- main entry
def chat(
    question: str,
    regions: Optional[List[dict]] = None,
    history: Optional[List[dict]] = None,
    level: str = "expert",
    app_state: Optional[Dict[str, Any]] = None,
) -> dict:
    app_state = app_state or {}
    regions = _resolve_regions(regions, app_state)

    computed = None
    if regions:
        try:
            computed = precompute(regions)
        except ValueError as e:
            computed = {"mode": None, "warnings": [str(e)]}

    messages = (
        [{"role": "system", "content": build_system(level, (computed or {}).get("mode"))}]
        + _clean_history(history)
        + [{"role": "user", "content": _build_user_message(question, regions, computed, app_state)}]
    )

    ck = hashlib.sha256(json.dumps(messages, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    cached = _cache_get(ck)
    if cached:
        return {**cached, "cached": True}

    last_error = "No LLM provider configured. Set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL in backend/.env."
    for p in _providers():
        try:
            msg, finish = _call(p, messages)
        except openai.AuthenticationError:
            last_error = f"API key rejected by {p['name']}."
            continue
        except openai.RateLimitError:
            last_error = f"Rate limit reached on {p['name']} (free tiers are small)."
            continue
        except (openai.APIConnectionError, openai.APITimeoutError):
            last_error = f"Could not reach {p['name']}."
            continue
        except openai.APIStatusError as e:
            last_error = f"{p['name']} returned an error (status {e.status_code})."
            continue

        text = (msg.content or "").strip()
        actions, rejected = [], []
        for tc in msg.tool_calls or []:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                rejected.append({"tool": tc.function.name, "reason": "Malformed arguments."})
                continue
            action, rejection = validate_action(tc.function.name, args)
            (actions if action else rejected).append(action or rejection)

        if rejected:
            note = "Some requested actions were not applied:\n" + "\n".join(f"- {r['reason']}" for r in rejected)
            text = (text + "\n\n" if text else "") + note
        if finish == "length":
            text += "\n\n(Answer truncated. Ask me to continue.)"
        if not text and not actions:
            continue  # empty reply from a flaky free model: try the next provider

        result = {"answer": text, "computed": computed, "actions": actions, "rejected": rejected,
                  "model": p["model"]}
        _cache[ck] = (time.time(), result)
        return result

    # Every provider failed: still give the user something useful.
    return {"answer": _template_answer(computed) + f"\n\n[{last_error}]", "computed": computed,
            "actions": [], "rejected": [], "error": True}


def _call(provider: dict, messages: List[dict]):
    """One model call. If the model/provider rejects tools, retry once without them."""
    kwargs = dict(model=provider["model"], messages=messages, max_tokens=MAX_TOKENS, temperature=TEMPERATURE)
    client: OpenAI = provider["client"]
    try:
        resp = client.chat.completions.create(**kwargs, tools=_openai_tools(), tool_choice="auto")
    except openai.BadRequestError:
        resp = client.chat.completions.create(**kwargs)  # text only, no actions
    choice = resp.choices[0]
    return choice.message, choice.finish_reason