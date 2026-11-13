import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # so `import chatbot` works

import data_access


@pytest.fixture(autouse=True)
def fake_data(tmp_path, monkeypatch):
    """Tiny fake data/ folder so tests don't depend on the real dataset."""
    (tmp_path / "metrics").mkdir()
    sites = [
        {"id": "shackleton_rim", "name": "Shackleton Rim", "type": "artemis_candidate", "lat": -89.9, "lon": 0.0, "source": "x"},
        {"id": "malapert_massif", "name": "Malapert Massif", "type": "artemis_candidate", "lat": -86.0, "lon": 0.0, "source": "x"},
        {"id": "connecting_ridge", "name": "Connecting Ridge", "type": "artemis_candidate", "lat": -89.5, "lon": 222.0, "source": "x"},
        {"id": "connecting_ridge_ext", "name": "Connecting Ridge Extension", "type": "artemis_candidate", "lat": -89.4, "lon": 220.0, "source": "x"},
        {"id": "no_data_site", "name": "No Data Site", "type": "other", "lat": -80.0, "lon": 10.0, "source": "x"},
    ]
    (tmp_path / "sites.json").write_text(json.dumps({"regions": sites}))
    for rid, score in [("shackleton_rim", 80), ("malapert_massif", 60), ("connecting_ridge", 90), ("connecting_ridge_ext", 70)]:
        (tmp_path / "metrics" / f"{rid}.json").write_text(
            json.dumps({"id": rid, "score": score, "parameters": {"sun_visible_pct": score}})
        )

    monkeypatch.setattr(data_access, "DATA_DIR", tmp_path)
    data_access.reload()
    yield
    data_access.reload()