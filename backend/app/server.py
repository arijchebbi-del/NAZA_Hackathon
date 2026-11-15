"""Minimal dependency-light HTTP API for the lunar evaluator."""
from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from dotenv import load_dotenv

from .chatbot import data_access
from .physical import evaluate_site

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(REPO_DIR / ".env")
load_dotenv(REPO_DIR / "frontend" / ".env")


def _site_payload(region: dict, when: str | None = None) -> dict:
    when = when or "2027-03-12"
    physical = evaluate_site(region, when) if region.get("lat") is not None else {}
    score = physical.get("scores", {}).get("total")
    if score is not None:
        score = round(score * 100, 2)
    return {**region, "score": score if score is not None else region.get("score"), "physical": physical}


def _origin(handler: BaseHTTPRequestHandler) -> str:
    requested = handler.headers.get("Origin", "")
    allowed = {
        os.getenv("CORS_ORIGIN", "http://localhost:5173"),
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    }
    return requested if requested in allowed else next(iter(allowed))


def _json(handler: BaseHTTPRequestHandler, status: int, payload: object) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode()
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", _origin(handler))
    handler.send_header("Vary", "Origin")
    handler.end_headers()
    handler.wfile.write(body)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_: object) -> None:
        return

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", _origin(self))
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        parts = [part for part in parsed.path.split("/") if part]
        query = parse_qs(parsed.query)
        try:
            if parts == ["api", "sites"]:
                _json(self, 200, {"sites": [_site_payload(r) for r in data_access._load_all().values()]})
                return
            if len(parts) == 3 and parts[:2] == ["api", "sites"]:
                region = data_access.get_region(parts[2])
                _json(self, 200, _site_payload(region, query.get("date", [None])[0]))
                return
            if len(parts) == 4 and parts[:2] == ["api", "sites"] and parts[3] == "sky":
                region = data_access.get_region(parts[2])
                _json(self, 200, evaluate_site(region, query.get("date", ["2027-03-12"])[0]))
                return
            if len(parts) == 4 and parts[:2] == ["api", "sites"] and parts[3] == "timeline":
                region = data_access.get_region(parts[2])
                start = query.get("start", ["2027-03-12"])[0]
                end = query.get("end", [start])[0]
                from datetime import date, timedelta
                current, stop, points = date.fromisoformat(start), date.fromisoformat(end), []
                while current <= stop and len(points) <= 365:
                    result = evaluate_site(region, current.isoformat())
                    points.append({"t": current.isoformat(), "sunEl": result["sun"]["elevation_deg"], "earthEl": result["earth"]["elevation_deg"], "sunVisible": result["sun"]["visible"], "earthVisible": result["earth"]["visible"]})
                    current += timedelta(days=1)
                _json(self, 200, {"points": points})
                return
            _json(self, 404, {"error": "Not found"})
        except (ValueError, data_access.RegionNotFound, FileNotFoundError) as exc:
            _json(self, 400, {"error": str(exc)})

    def do_POST(self) -> None:
        if self.path != "/api/chat":
            _json(self, 404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            from .chatbot.service import chat
            result = chat(payload.get("message", ""), payload.get("regions"), payload.get("history"), payload.get("level", "expert"), payload.get("appState"))
            _json(self, 200, {"text": result.get("answer", ""), "actions": result.get("actions", []), "rejected": result.get("rejected", []), "computed": result.get("computed"), "error": result.get("error", False)})
        except Exception as exc:
            _json(self, 500, {"error": f"Chat service unavailable: {type(exc).__name__}"})


def run() -> None:
    host, port = os.getenv("API_HOST", "127.0.0.1"), int(os.getenv("API_PORT", "8000"))
    print(f"Lunar evaluator API listening on http://{host}:{port}", flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    run()
