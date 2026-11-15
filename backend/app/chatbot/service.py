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
from ..physical import evaluate_site
from .precompute import precompute
from .prompts import build_system_prompt
from .tools import TOOLS, validate_tool_call

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


def _offline_actions(question: str, app_state: dict) -> list[dict]:
    """Keep navigation usable when no LLM provider is configured."""
    normalized = data_access.normalize(question)
    names = [
        name for name in data_access.list_names()
        if data_access.normalize(name) in normalized
        or any(len(part) >= 4 and f" {part} " in f" {normalized} " for part in data_access.normalize(name).split())
    ]
    actions: list[dict] = []
    if "compare" in normalized or " versus " in f" {normalized} " or " vs " in f" {normalized} ":
        if len(names) >= 2:
            result = validate_tool_call("compare_sites", {"names": names[:3]})
            if result.ok:
                actions.append(result.to_action())
    elif names:
        result = validate_tool_call("select_site", {"name": names[0]})
        if result.ok:
            actions.append(result.to_action())
    iso = __import__("re").search(r"\b(20\d{2}-\d{2}-\d{2})\b", question)
    if iso:
        result = validate_tool_call("set_date", {"date": iso.group(1)})
        if result.ok:
            actions.append(result.to_action())
    if any(word in normalized for word in ("sky", "sun", "earth", "horizon")):
        actions.append({"type": "set_view", "args": {"view": "site"}})
    elif "heatmap" in normalized or "polar map" in normalized:
        actions.append({"type": "set_view", "args": {"view": "heatmap"}})
    return actions


def _earth_visibility_answer(question: str, regions: list[dict], computed: dict | None, selected_date: str) -> str | None:
    normalized = data_access.normalize(question)
    if not computed or "earth" not in normalized:
        return None
    if not any(word in normalized for word in ("visibility", "elevation", "visible")):
        return None
    if not any(word in normalized for word in ("best", "which", "rank", "compare")):
        return None
    values = (computed.get("parameters") or {}).get("earth_elevation_deg", {}).get("values", {})
    if not values:
        return None
    ranking = sorted(values.items(), key=lambda item: item[1], reverse=True)
    leader, leader_value = ranking[0]
    lines = [
        f"**Earth visibility ranking ({selected_date})**",
        f"**Best site: {leader}** with Earth elevation **{leader_value:.2f}°**.",
        "",
        "Full ranking:",
    ]
    lines.extend(f"{index}. {name}: {value:.2f}°" for index, (name, value) in enumerate(ranking, 1))
    lines.append("")
    lines.append("Higher Earth elevation means a clearer direct geometric line of sight; values below 0° are below the local horizon.")
    return "\n".join(lines)


def _site_description_answer(question: str, regions: list[dict], computed: dict | None, selected_date: str) -> str | None:
    if not computed or len(regions) != 1:
        return None
    normalized = data_access.normalize(question)
    if not any(term in normalized for term in (
        "describe",
        "this one",
        "selected",
        "selection",
        "what about this",
        "analyze",
        "analyse",
        "analysis",
        "planning spot",
        "landing spot",
        "landing site",
        "planning site",
    )):
        return None
    region = regions[0]
    parameters = computed.get("parameters") or {}
    def value(key: str, fallback: str = "n/a") -> str:
        values = parameters.get(key, {}).get("values", {})
        raw = values.get(region.get("name"))
        return fallback if raw is None else f"{raw:.2f}"
    score = computed["ranking"][0]["score"]
    earth = value("earth_elevation_deg")
    sun = value("sun_elevation_deg")
    slope = value("steepness_deg")
    collision = value("p_no_collision")
    sun_status = "lit" if float(sun) > 0 else "in shadow"
    earth_status = "visible" if float(earth) > 0 else "below the horizon"
    detail_requested = any(term in normalized for term in ("detail", "detailed", "technical", "full"))
    if not detail_requested:
        return (
            f"**{region.get('name', 'Selected point')}** — **{score:.2f}/100** ({selected_date})\n\n"
            f"- Slope: **{slope}°**\n"
            f"- Sun: **{sun}°**, {sun_status}\n"
            f"- Earth: **{earth}°**, {earth_status}\n\n"
            f"**Verdict:** {'promising communication geometry' if float(earth) > 0 else 'no direct Earth link'}; "
            f"solar conditions are {'available' if float(sun) > 0 else 'unfavorable'}."
        )
    return (
        f"**{region.get('name', 'Selected point')}** at "
        f"{float(region.get('lat', 0)):.2f}°, {float(region.get('lon', 0)):.2f}° "
        f"on {selected_date} scores **{score:.2f}/100**.\n\n"
        f"- Slope: **{slope}°** (lower is better)\n"
        f"- Sun elevation: **{sun}°**\n"
        f"- Earth elevation: **{earth}°**\n"
        f"- No-collision factor: **{collision}**\n\n"
        "This is a planning score, not a mission-success probability."
    )


def _comparison_answer(question: str, computed: dict | None, selected_date: str) -> str | None:
    if not computed or computed.get("n_regions", 0) < 2:
        return None
    normalized = data_access.normalize(question)
    if not any(term in normalized for term in ("compare", "better", "best", "rank", "which one", "all of")):
        return None
    ranking = computed.get("ranking") or []
    if not ranking:
        return None
    first = ranking[0]
    lines = [
        f"**Comparison ({selected_date})**",
        f"Based on the combined evaluator score, **{first['name']}** is currently first.",
        "",
    ]
    for index, row in enumerate(ranking, 1):
        lines.append(f"{index}) **{row['name']}** — {row['score']:.2f}/100")
    lines.extend([
        "",
        "The score combines terrain steepness, Sun elevation, Earth visibility and the collision factor. "
        "A higher score is better, but the result is a planning indicator rather than a mission-success probability.",
    ])
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
    if not regions:
        question_normalized = data_access.normalize(question)
        mentioned = [
            name for name in data_access.list_names()
            if data_access.normalize(name) in question_normalized
            or any(
                len(part) >= 4 and f" {part} " in f" {question_normalized} "
                for part in data_access.normalize(name).split()
            )
        ]
        if mentioned:
            regions = data_access.get_regions(mentioned[:3])
        elif (
            "earth" in question_normalized
            and ("visibility" in question_normalized or "elevation" in question_normalized)
            and any(word in question_normalized for word in ("best", "which", "rank", "compare"))
        ):
            regions = [
                data_access.get_region(name)
                for name in data_access.list_names(only_scored=True)
            ]

    selected_date = app_state.get("selected_date", "2027-03-12")
    try:
        for region in regions:
            if region.get("id") == "custom-point":
                continue
            if region.get("lat") is None or region.get("lon") is None:
                continue
            physical = evaluate_site(region, selected_date)
            region["score"] = round(physical["scores"]["total"] * 100, 2)
            region["parameters"] = {
                "steepness_deg": physical["steepness"]["slope_deg"],
                "sun_elevation_deg": physical["sun"]["elevation_deg"],
                "earth_elevation_deg": physical["earth"]["elevation_deg"],
                "p_no_collision": 1.0 if physical["scores"]["pass"] else 0.0,
            }
    except ValueError:
        pass

    computed = None
    if regions:
        try:
            computed = precompute(regions)
        except ValueError as e:
            computed = {"mode": None, "warnings": [str(e)]}

    direct_answer = _earth_visibility_answer(question, regions, computed, selected_date)
    if direct_answer:
        return {
            "answer": direct_answer,
            "computed": computed,
            "actions": [],
            "rejected": [],
            "model": "deterministic-physical-evaluator",
        }
    direct_answer = _site_description_answer(question, regions, computed, selected_date)
    if direct_answer:
        return {
            "answer": direct_answer,
            "computed": computed,
            "actions": [],
            "rejected": [],
            "model": "deterministic-physical-evaluator",
        }
    direct_answer = _comparison_answer(question, computed, selected_date)
    if direct_answer:
        return {
            "answer": direct_answer,
            "computed": computed,
            "actions": [],
            "rejected": [],
            "model": "deterministic-physical-evaluator",
        }

    messages = (
        [{"role": "system", "content": build_system_prompt(
            mode=(computed or {}).get("mode") or "analyse_simple",
            level=level,
        )}]
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
            validation = validate_tool_call(tc.function.name, args)
            (actions if validation.ok else rejected).append(
                validation.to_action() if validation.ok else validation.to_dict()
            )

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
    fallback_actions = _offline_actions(question, app_state)
    return {"answer": _template_answer(computed) + f"\n\n[{last_error}]", "computed": computed,
            "actions": fallback_actions, "rejected": [], "error": True}


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