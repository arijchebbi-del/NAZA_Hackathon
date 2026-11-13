"""
Deterministic calculations for the chatbot. The LLM never does this math:
it only explains what this module returns.

Input : list of regions (dicts, or objects with name / score / parameters)
Output: JSON-serializable dict with mode, ranking, gaps, per-parameter best/worst, warnings.
"""
from __future__ import annotations

import math
from typing import Any, Dict, Iterable, List

# Direction matters: a LONGER night or comm gap is WORSE, so "best" means the lowest value.
# Unknown parameters default to "higher is better" and produce a warning.
PARAMS = {
    "steepness_deg": {"label": "Slope (°)", "better": "lower"},
    "sun_elevation_deg": {"label": "Sun elevation (°)", "better": "higher"},
    "earth_elevation_deg": {"label": "Earth elevation (°)", "better": "higher"},
    "p_no_collision": {"label": "P(no collision)", "better": "higher"},
}


def factors(p: Dict[str, float]) -> dict:
    s1 = max(0.0, 1 - p["steepness_deg"] / 15)
    s2 = max(0.0, p["sun_elevation_deg"]) / 90
    s3 = max(0.0, p["earth_elevation_deg"]) / 90
    s4 = p["p_no_collision"]
    f = {"slope": s1, "sun": s2, "earth": s3, "collision": s4}
    return {"factors": f, "product": s1 * s2 * s3 * s4, "limiting": min(f, key=f.get)}


def _as_dict(r: Any) -> dict:
    if isinstance(r, dict):
        return r
    if hasattr(r, "model_dump"):  # Pydantic v2
        return r.model_dump()
    return {"name": r.name, "score": r.score, "parameters": getattr(r, "parameters", {})}


def _is_num(x: Any) -> bool:
    return (
        isinstance(x, (int, float))
        and not isinstance(x, bool)
        and (not isinstance(x, float) or math.isfinite(x))
    )


def _rank(regions: List[dict]) -> List[dict]:
    """Competition ranking: equal scores share a rank (1, 1, 3)."""
    ordered = sorted(regions, key=lambda r: (-r["score"], r["name"]))
    out, prev_score, prev_rank = [], None, 0
    for i, r in enumerate(ordered, start=1):
        rank = prev_rank if r["score"] == prev_score else i
        out.append({"rank": rank, "name": r["name"], "score": r["score"]})
        prev_score, prev_rank = r["score"], rank
    return out


def _compare_param(key: str, values: Dict[str, float]) -> dict:
    meta = PARAMS.get(key, {"label": key, "better": "higher"})
    higher_is_better = meta["better"] == "higher"
    best_v = max(values.values()) if higher_is_better else min(values.values())
    worst_v = min(values.values()) if higher_is_better else max(values.values())
    return {
        "label": meta["label"],
        "better": meta["better"],
        "values": values,
        "best": sorted(n for n, v in values.items() if v == best_v),
        "worst": sorted(n for n, v in values.items() if v == worst_v),
        "best_value": best_v,
        "worst_value": worst_v,
        "spread": round(abs(best_v - worst_v), 2),
        "all_equal": best_v == worst_v,
    }


def precompute(regions: Iterable[Any]) -> dict:
    items = [_as_dict(r) for r in regions]
    if not items:
        raise ValueError("At least one region is required.")

    warnings: List[str] = []
    clean = []
    seen_names = set()
    for r in items:
        if not _is_num(r.get("score")):
            warnings.append(f"'{r.get('name')}' has no numeric score and was excluded from the ranking.")
            continue
        name = r.get("name")
        if not isinstance(name, str) or not name.strip():
            raise ValueError("Every scored region must have a non-empty string name.")
        if name in seen_names:
            raise ValueError(f"Region names must be unique; '{name}' appears more than once.")
        seen_names.add(name)
        if not 0 <= r["score"] <= 100:
            warnings.append(f"Score of '{r['name']}' is {r['score']}, outside the expected 0-100 range.")
        raw_parameters = r.get("parameters")
        if raw_parameters is None:
            raw_parameters = {}
        if not isinstance(raw_parameters, dict):
            raise ValueError(f"Parameters for '{name}' must be an object.")
        invalid_parameters = sorted(k for k, v in raw_parameters.items() if not _is_num(v))
        for key in invalid_parameters:
            warnings.append(f"Parameter '{key}' for '{name}' is not numeric and was excluded.")
        clean.append({
            "name": name,
            "score": r["score"],
            "parameters": {k: v for k, v in raw_parameters.items() if _is_num(v)},
        })

    if not clean:
        raise ValueError("No region with a valid score.")

    ranking = _rank(clean)
    top_score = ranking[0]["score"]
    for row in ranking:
        row["gap_to_first"] = round(top_score - row["score"], 2)

    result: dict = {
        "mode": "comparatif" if len(clean) > 1 else "analyse_simple",
        "n_regions": len(clean),
        "ranking": ranking,
        "first": [r["name"] for r in ranking if r["rank"] == 1],
        "tie_for_first": sum(1 for r in ranking if r["rank"] == 1) > 1,
        "parameters": {},
        "warnings": warnings,
    }

    # Per-parameter analysis
    all_keys = sorted({k for r in clean for k in r["parameters"]})
    for key in all_keys:
        if key not in PARAMS:
            warnings.append(f"Unknown parameter '{key}': assumed 'higher is better'.")
        values = {r["name"]: r["parameters"][key] for r in clean if key in r["parameters"]}
        missing = [r["name"] for r in clean if key not in r["parameters"]]
        if missing:
            warnings.append(f"Parameter '{key}' is missing for: {', '.join(missing)}.")
        if len(clean) == 1:
            meta = PARAMS.get(key, {"label": key, "better": "higher"})
            result["parameters"][key] = {"label": meta["label"], "better": meta["better"], "values": values}
        else:
            result["parameters"][key] = _compare_param(key, values)

    # Trade-offs: in how many parameters is each region the best / the worst?
    if len(clean) > 1:
        wins = {r["name"]: [] for r in clean}
        losses = {r["name"]: [] for r in clean}
        for key, cmp in result["parameters"].items():
            if len(cmp["values"]) < 2 or cmp["all_equal"]:
                continue
            for n in cmp["best"]:
                wins[n].append(key)
            for n in cmp["worst"]:
                losses[n].append(key)
        result["tradeoffs"] = {n: {"best_in": wins[n], "worst_in": losses[n]} for n in wins}
        result["score_spread"] = round(top_score - ranking[-1]["score"], 2)
        # A high score can hide a weak parameter: flag leaders that are worst somewhere.
        result["leader_weaknesses"] = {n: losses[n] for n in result["first"] if losses[n]}

    return result