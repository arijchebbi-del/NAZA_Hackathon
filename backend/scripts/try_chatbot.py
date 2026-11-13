"""
Manual end-to-end check with the real LLM (uses your .env and a few free-tier requests).
Run from the backend folder:  python scripts/try_chatbot.py
Or with your own question:    python scripts/try_chatbot.py "why is B better?"
"""
import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv

load_dotenv(REPO_ROOT / ".env")

from app.chatbot import data_access
from app.chatbot.service import chat

ALL = ["Sample Site A", "Sample Site B", "Sample Site C"]

CASES = [
    ("single region", "Is this site good? Explain the score.", ["Sample Site A"], {}),
    ("comparison", "Compare these sites and recommend one.", ALL, {}),
    ("dead site", "Why is Sample Site C scored 0?", ["Sample Site C"], {}),
    ("tool: select", "Show me Sample Site B", ["Sample Site B"], {}),
    ("tool: date", "What about the 15th of March 2027?", ["Sample Site B"],
     {"selected_site": "Sample Site B", "datetime_utc": "2027-03-12T08:00:00Z"}),
    ("tool: unknown site (must be rejected)", "Take me to Sample Site Z", [], {}),
    ("no data", "Why is the Moon's night so long?", [], {}),
    ("french + discovery level", "Compare ces sites simplement.", ALL, {}),
]


def run(label, question, names, state, level="expert"):
    regions = data_access.get_regions(names) if names else []
    r = chat(question, regions=regions, level=level, app_state=state)
    print("=" * 78)
    print(f"[{label}]  Q: {question}")
    print("-" * 78)
    print(r["answer"])
    print("-" * 78)
    print("model:", r.get("model"), "| cached:", r.get("cached", False), "| error:", r.get("error", False))
    print("actions :", json.dumps(r["actions"], ensure_ascii=False))
    print("rejected:", json.dumps(r["rejected"], ensure_ascii=False))
    if r.get("computed") and r["computed"].get("warnings"):
        print("warnings:", r["computed"]["warnings"])


if __name__ == "__main__":
    if len(sys.argv) > 1:
        run("custom", " ".join(sys.argv[1:]), ALL, {})
    else:
        for label, q, names, state in CASES:
            lvl = "decouverte" if "discovery" in label else "expert"
            run(label, q, names, state, lvl)