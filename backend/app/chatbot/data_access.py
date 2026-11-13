"""
Data access for the chatbot.

Reads the shared data contract (repo-root /data):
  data/sites.json            -> {"regions": [{id, name, type, lat, lon, source}, ...]}
  data/metrics/{id}.json     -> {"id", "name", "score", "parameters": {...}}

Returns "region" dicts shaped like the chatbot payload:
  {"id", "name", "type", "lat", "lon", "source", "score", "parameters"}
"""
from __future__ import annotations

import difflib
import json
import os
import re
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Dict, List

# backend/app/chatbot/data_access.py -> parents[3] is the repo root
DATA_DIR = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parents[3] / "data"))


class RegionNotFound(Exception):
    """Raised when a name matches no region. Carries close suggestions."""

    def __init__(self, query: str, suggestions: List[str]):
        self.query = query
        self.suggestions = suggestions
        hint = f" Did you mean: {', '.join(suggestions)}?" if suggestions else ""
        super().__init__(f"Unknown region '{query}'.{hint}")


def normalize(text: str) -> str:
    """Lowercase, strip accents, keep only letters/digits ('Shackleton Rim' == 'shackleton-rim')."""
    text = unicodedata.normalize("NFKD", str(text))
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _read_json(path: Path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def _load_all() -> Dict[str, dict]:
    """Merge sites.json with metrics/*.json. Cached; call reload() after regenerating data."""
    sites_file = DATA_DIR / "sites.json"
    if not sites_file.exists():
        raise FileNotFoundError(f"{sites_file} not found. Run backend/scripts/build_sites.py first.")

    merged: Dict[str, dict] = {}
    for site in _read_json(sites_file).get("regions", []):
        rid = str(site.get("id") or normalize(site["name"]).replace(" ", "_"))
        merged[rid] = {
            "id": rid,
            "name": site["name"],
            "type": site.get("type"),
            "lat": site.get("lat"),
            "lon": site.get("lon"),
            "source": site.get("source"),
            "score": None,
            "parameters": {},
        }

    metrics_dir = DATA_DIR / "metrics"
    if metrics_dir.exists():
        for path in metrics_dir.glob("*.json"):
            m = _read_json(path)
            rid = str(m.get("id") or path.stem)
            entry = merged.setdefault(
                rid,
                {"id": rid, "name": m.get("name", rid), "type": None, "lat": None,
                 "lon": None, "source": None, "score": None, "parameters": {}},
            )
            entry["score"] = m.get("score")
            entry["parameters"] = m.get("parameters", {}) or {}
    return merged


def reload() -> None:
    """Clear the cache (use after the backend scripts regenerate data/)."""
    _load_all.cache_clear()


def _index() -> Dict[str, str]:
    """normalized id/name -> id"""
    idx: Dict[str, str] = {}
    for rid, r in _load_all().items():
        idx[normalize(rid)] = rid
        idx[normalize(r["name"])] = rid
    return idx


def list_names(only_scored: bool = False) -> List[str]:
    """Names of all regions (optionally only those that already have a score)."""
    return sorted(r["name"] for r in _load_all().values() if not only_scored or r["score"] is not None)


def get_region(name: str) -> dict:
    """Find one region by id or name (case, accents and punctuation ignored, typo-tolerant)."""
    idx = _index()
    key = normalize(name)
    if key in idx:
        return dict(_load_all()[idx[key]])

    close = difflib.get_close_matches(key, list(idx), n=3, cutoff=0.6)
    if len(close) == 1 or (close and difflib.SequenceMatcher(None, key, close[0]).ratio() >= 0.85):
        return dict(_load_all()[idx[close[0]]])  # confident single match
    raise RegionNotFound(name, [_load_all()[idx[c]]["name"] for c in close])


def get_regions(names: List[str]) -> List[dict]:
    """Resolve several names; duplicates removed, order preserved. Raises on the first unknown name."""
    seen, out = set(), []
    for n in names:
        r = get_region(n)
        if r["id"] not in seen:
            seen.add(r["id"])
            out.append(r)
    return out


def get_regions_by_type(region_type: str) -> List[dict]:
    """E.g. get_regions_by_type('artemis_candidate'). Only regions that have a score."""
    return [dict(r) for r in _load_all().values() if r["type"] == region_type and r["score"] is not None]