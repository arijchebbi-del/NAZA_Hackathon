"""
Tools the chatbot LLM can REQUEST, plus validation of their arguments.

Principle: the LLM requests, our code decides.
  - TOOLS / get_tools()  -> the "menu" sent to the LLM (name, description, input schema)
  - validate_tool_call() -> checks one requested call BEFORE it reaches the frontend

This module executes nothing. service.py calls validate_tool_call() for every
tool call returned by the LLM, keeps the approved ones as UI actions, and
drops (and reports) the rejected ones.

Validation errors carry `suggestions` (close site names) so the bot can ask
"did you mean ...?" instead of guessing.
"""
from __future__ import annotations

import os
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any, Callable, Dict, List, Optional

from data_access import RegionNotFound, get_region

# ---------------------------------------------------------------------------
# Configuration (align these with the rest of the team)
# ---------------------------------------------------------------------------

# Views the frontend knows. MUST match the frontend store / executeAction.js.
VALID_VIEWS = ("globe", "site", "heatmap")

# Dates covered by the precomputed data. Set the real range via env vars
# (ask whoever does the ephemeris computation), e.g. DATA_DATE_MIN=2026-01-01.
DATE_MIN = date.fromisoformat(os.getenv("DATA_DATE_MIN", "2026-01-01"))
DATE_MAX = date.fromisoformat(os.getenv("DATA_DATE_MAX", "2030-12-31"))

# Side-by-side comparison limits.
MIN_COMPARE = 2
MAX_COMPARE = 3


# ---------------------------------------------------------------------------
# 1. Tool definitions (what the LLM sees)
# ---------------------------------------------------------------------------
# The DESCRIPTION is what the LLM uses to decide when to call a tool.
# If it picks the wrong tool, fix the description, not the code.

TOOLS: List[Dict[str, Any]] = [
    {
        "name": "select_site",
        "description": (
            "Focus the interface on ONE landing site: the camera flies to it and "
            "the site panel opens. Use when the user asks to see, open or go to a "
            "single site (e.g. 'show me Shackleton', 'take me to Malapert'). "
            "Do NOT use for comparing several sites."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Site name exactly as in the site catalogue.",
                }
            },
            "required": ["name"],
        },
    },
    {
        "name": "set_date",
        "description": (
            "Change the date shown in the interface: the time slider jumps to that "
            "date and the Sun and Earth positions update. Use when the user gives "
            "or changes a date (e.g. 'what about the 12th of March?'). Use only a "
            "complete, unambiguous date; otherwise ask the user first."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {
                    "type": "string",
                    "description": "ISO date, format YYYY-MM-DD.",
                }
            },
            "required": ["date"],
        },
    },
    {
        "name": "compare_sites",
        "description": (
            f"Switch to the side-by-side comparison view for {MIN_COMPARE} to "
            f"{MAX_COMPARE} sites. Use when the user asks to compare sites "
            "(e.g. 'compare Connecting Ridge and Malapert'). Use select_site "
            "instead if only one site is mentioned."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "names": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": MIN_COMPARE,
                    "maxItems": MAX_COMPARE,
                    "description": "Site names exactly as in the site catalogue.",
                }
            },
            "required": ["names"],
        },
    },
    {
        "name": "set_view",
        "description": (
            "Switch the 3D scene between views: 'globe' (the Moon seen from "
            "space), 'site' (the sky as seen standing on the selected site, with "
            "horizon, Sun and Earth) and 'heatmap' (map of scores around the "
            "south pole). Use when the user asks to change what they are looking "
            "at (e.g. 'show me the sky from the site')."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "view": {"type": "string", "enum": list(VALID_VIEWS)}
            },
            "required": ["view"],
        },
    },
]


def get_tools() -> List[Dict[str, Any]]:
    """Tool definitions in Anthropic format (name / description / input_schema)."""
    return TOOLS


def to_openai_tools() -> List[Dict[str, Any]]:
    """Same tools in OpenAI 'tools' format (chat.completions)."""
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["input_schema"],
            },
        }
        for t in TOOLS
    ]


# ---------------------------------------------------------------------------
# 2. Validation result
# ---------------------------------------------------------------------------

@dataclass
class ToolResult:
    """Outcome of validating one tool call."""

    ok: bool
    tool: str
    args: Dict[str, Any] = field(default_factory=dict)  # clean args if ok
    error: Optional[str] = None                         # human-readable if not ok
    suggestions: List[str] = field(default_factory=list)  # close names, for "did you mean"

    def to_action(self) -> Dict[str, Any]:
        """Action sent to the frontend (only call when ok)."""
        return {"type": self.tool, "args": self.args}

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _ok(tool: str, args: Dict[str, Any]) -> ToolResult:
    return ToolResult(ok=True, tool=tool, args=args)


def _fail(tool: str, error: str, suggestions: Optional[List[str]] = None) -> ToolResult:
    return ToolResult(ok=False, tool=tool, error=error, suggestions=suggestions or [])


# ---------------------------------------------------------------------------
# 3. One validator per tool
# ---------------------------------------------------------------------------

def _resolve_site(tool: str, raw: Any):
    """Return (region, None) or (None, ToolResult-failure)."""
    if not isinstance(raw, str) or not raw.strip():
        return None, _fail(tool, "A site name is required.")
    try:
        return get_region(raw), None
    except RegionNotFound as e:
        return None, _fail(tool, str(e), e.suggestions)


def validate_select_site(args: Dict[str, Any]) -> ToolResult:
    region, err = _resolve_site("select_site", args.get("name"))
    if err:
        return err
    # Canonical id + name so the frontend never has to re-match strings.
    return _ok("select_site", {"id": region["id"], "name": region["name"]})


def validate_set_date(args: Dict[str, Any]) -> ToolResult:
    raw = args.get("date")
    if not isinstance(raw, str):
        return _fail("set_date", "A date in YYYY-MM-DD format is required.")
    try:
        d = date.fromisoformat(raw.strip())
    except ValueError:
        return _fail("set_date", f"'{raw}' is not a valid date (use YYYY-MM-DD).")
    if not DATE_MIN <= d <= DATE_MAX:
        return _fail(
            "set_date",
            f"{d.isoformat()} is outside the data range "
            f"({DATE_MIN.isoformat()} to {DATE_MAX.isoformat()}).",
        )
    return _ok("set_date", {"date": d.isoformat()})


def validate_compare_sites(args: Dict[str, Any]) -> ToolResult:
    names = args.get("names")
    if not isinstance(names, list) or not all(isinstance(n, str) for n in names):
        return _fail("compare_sites", "A list of site names is required.")

    regions, seen = [], set()
    for n in names:
        region, err = _resolve_site("compare_sites", n)
        if err:
            return err
        if region["id"] not in seen:  # drop duplicates, keep order
            seen.add(region["id"])
            regions.append(region)

    if len(regions) < MIN_COMPARE:
        return _fail("compare_sites", f"At least {MIN_COMPARE} different sites are needed to compare.")
    if len(regions) > MAX_COMPARE:
        return _fail("compare_sites", f"At most {MAX_COMPARE} sites can be compared at once.")

    unscored = [r["name"] for r in regions if r.get("score") is None]
    if unscored:
        return _fail("compare_sites", f"No data yet for: {', '.join(unscored)}.")

    return _ok(
        "compare_sites",
        {"ids": [r["id"] for r in regions], "names": [r["name"] for r in regions]},
    )


def validate_set_view(args: Dict[str, Any]) -> ToolResult:
    view = args.get("view")
    if view not in VALID_VIEWS:
        return _fail("set_view", f"Unknown view '{view}'. Allowed: {', '.join(VALID_VIEWS)}.")
    return _ok("set_view", {"view": view})


# ---------------------------------------------------------------------------
# 4. Single entry point (whitelist)
# ---------------------------------------------------------------------------

VALIDATORS: Dict[str, Callable[[Dict[str, Any]], ToolResult]] = {
    "select_site": validate_select_site,
    "set_date": validate_set_date,
    "compare_sites": validate_compare_sites,
    "set_view": validate_set_view,
}


def validate_tool_call(name: str, args: Any) -> ToolResult:
    """Validate ONE tool call requested by the LLM. Never raises."""
    validator = VALIDATORS.get(name)
    if validator is None:  # whitelist: anything not listed is refused
        return _fail(name, f"Unknown tool '{name}'.")
    if not isinstance(args, dict):
        return _fail(name, "Tool arguments must be an object.")
    try:
        return validator(args)
    except Exception as e:  # e.g. missing data files: never crash the chat
        return _fail(name, f"Could not validate this action ({type(e).__name__}).")


def validate_tool_calls(calls: List[Dict[str, Any]]) -> Dict[str, List[Any]]:
    """
    Convenience for service.py. `calls` = [{"name": ..., "args": {...}}, ...]
    Returns {"actions": [approved UI actions], "rejected": [ToolResult dicts]}.
    """
    actions, rejected = [], []
    for c in calls:
        res = validate_tool_call(c.get("name", ""), c.get("args", {}))
        (actions if res.ok else rejected).append(res.to_action() if res.ok else res.to_dict())
    return {"actions": actions, "rejected": rejected}