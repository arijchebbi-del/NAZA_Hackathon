# Lunar Landing Site Evaluator

An interactive lunar mission-planning application for exploring and comparing
potential landing sites, with a focus on the Moon's south pole.

The project combines a real-time 3D Moon, physical site-evaluation calculations,
time-dependent Sun and Earth visibility, custom surface-point analysis, and a
natural-language mission assistant.

## What the application does

Users can:

- Explore a textured 3D Moon in the browser.
- Select predefined lunar regions.
- Click any visible point to create a custom landing point.
- Change the simulated date and observe changing lighting conditions.
- Evaluate terrain slope, Sun elevation, Earth elevation, and communication geometry.
- Compare multiple locations and rank them by the composite evaluator score.
- Ask the mission assistant to describe, compare, or rank locations.
- Use natural-language commands to select sites, change dates, and switch views.

The score is a planning indicator. It is not a certified landing-safety result
or a probability of mission success.

## Project structure

```text
NAZA_Hackathon/
├── backend/
│   ├── app/
│   │   ├── server.py              # HTTP API
│   │   ├── physical.py            # Physical evaluation model
│   │   └── chatbot/               # Chatbot, tools, prompts, and data access
│   ├── requirements.txt
│   └── scripts/
├── data/
│   ├── sites.json                 # Site catalogue
│   └── metrics/                   # Metric data files
├── frontend/
│   ├── src/
│   │   ├── main/                  # 3D lunar simulation
│   │   ├── components/            # UI components
│   │   ├── api/                   # Frontend API client
│   │   └── store/                 # Application state
│   ├── public/                    # Textures and 3D assets
│   └── package.json
└── README.md
```

## Requirements

- Node.js 18 or newer
- npm
- Python 3.11 or newer
- An OpenAI-compatible API key is optional. The backend includes deterministic
  evaluator responses for core physical questions when no model is available.

## Installation

### Frontend

```powershell
cd frontend
npm install
```

### Backend

```powershell
cd backend
python -m pip install -r requirements.txt
```

## Environment configuration

Create `backend/.env` for the chatbot provider:

```env
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=openrouter/free
LLM_API_KEY=your_api_key_here
```

Do not commit API keys to the repository.

The frontend API URL can be configured in `frontend/.env.local`:

```env
VITE_API_URL=http://127.0.0.1:8000
```

If `VITE_API_URL` is not set, the frontend can run in local mock mode for
development, depending on the selected frontend configuration.

## Running the application

Start the backend in one terminal:

```powershell
cd backend
python -m app.server
```

The backend runs at:

```text
http://127.0.0.1:8000
```

Start the frontend in a second terminal:

```powershell
cd frontend
npm run dev -- --host 127.0.0.1
```

Open:

```text
http://127.0.0.1:5173
```

Select **Enter Mission** or open `/app` directly:

```text
http://127.0.0.1:5173/app
```

## API endpoints

### List sites

```http
GET /api/sites
```

Returns the available lunar regions and their evaluator information.

### Site details

```http
GET /api/sites/{site_id}?date=YYYY-MM-DD
```

Returns the selected site's physical evaluation for the requested date.

### Sky evaluation

```http
GET /api/sites/{site_id}/sky?date=YYYY-MM-DD
```

Returns Sun and Earth elevations, azimuths, visibility, and score factors.

### Visibility timeline

```http
GET /api/sites/{site_id}/timeline?start=YYYY-MM-DD&end=YYYY-MM-DD
```

Returns daily Sun and Earth visibility points for the selected period.

### Mission assistant

```http
POST /api/chat
Content-Type: application/json
```

Example request:

```json
{
  "message": "Which site has the best Earth visibility?",
  "history": [],
  "level": "expert",
  "appState": {
    "selected_site": null,
    "selected_date": "2026-11-15",
    "view": "globe"
  },
  "regions": []
}
```

The response contains:

- `text`: Assistant response
- `actions`: Optional frontend navigation actions
- `computed`: Physical and comparison data
- `rejected`: Invalid or refused actions
- `error`: Provider or service status

## Physical evaluation model

The evaluator combines several factors:

### Terrain slope

Lower slope is preferred for landing and surface operations. The reference
model uses a maximum slope threshold of approximately 15 degrees.

### Sun elevation

Higher Sun elevation generally provides better illumination and solar-power
potential. Negative elevation indicates that the Sun is below the local horizon.

### Earth elevation

Higher Earth elevation indicates stronger geometric visibility of Earth. A value
below zero means Earth is below the local horizon and a direct geometric link is
not available.

### Curvature and horizon obstruction

Local terrain variation and the surrounding horizon can obstruct the Sun or
Earth even when their geometric elevation is positive.

### Composite score

The score is based on the physical factors and is intentionally multiplicative:
a severe weakness in one condition can significantly reduce the combined score.
This models the fact that a useful landing site must satisfy several constraints
at the same time.

## DEM and terrain data

The original high-resolution calculation workflow supports Lunar Digital
Elevation Model data in JP2 format. It uses:

- Rasterio for elevation-raster access
- PyProj for lunar map projections
- Polar stereographic and cylindrical coordinate systems
- Neighboring elevation samples for slope and curvature

The large DEM archive is not required to run the browser demo. When those
datasets are not installed, the API uses a dependency-light analytical fallback
so the complete application remains runnable.

## Chatbot behavior

The assistant uses two complementary layers:

1. **Deterministic evaluator responses** for physical questions such as:
   - “Which site has the best Earth visibility?”
   - “Describe this landing spot.”
   - “Rank all the points I selected.”
2. **An OpenAI-compatible language model** for explanations, general questions,
   and natural-language mission planning.

Numerical values come from the evaluator rather than being invented by the
language model. The assistant can also return validated actions such as:

- `select_site`
- `set_date`
- `compare_sites`
- `set_view`

## Technology stack

### Frontend

- React
- JavaScript and TypeScript
- Vite
- Three.js
- React Three Fiber
- Drei
- Zustand
- Framer Motion
- WebGL

### Backend

- Python
- Standard-library HTTP server
- OpenAI-compatible client
- OpenRouter-compatible model configuration
- JSON data contracts
- Deterministic physical evaluator

## Development commands

Build the frontend:

```powershell
cd frontend
npm run build
```

Run the backend chatbot tests:

```powershell
cd backend
python -m pytest
```

Run the manual chatbot script:

```powershell
cd backend
python scripts/try_chatbot.py
```

## Troubleshooting

### Chat shows “Failed to fetch”

Check that:

1. The backend is running on port `8000`.
2. The frontend is running on port `5173`.
3. `VITE_API_URL` points to the backend:

```env
VITE_API_URL=http://127.0.0.1:8000
```

The backend allows both `localhost:5173` and `127.0.0.1:5173`.

### Chat says that no LLM provider is configured

Add `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY` to `backend/.env`, then
restart the backend. Core deterministic physical responses can still work
without an LLM provider.

### Frontend changes are not visible

Refresh the page completely after changing environment variables. Vite reads
frontend environment variables when the development server starts.

## Limitations

- The current analytical fallback is not a replacement for high-resolution DEM
  terrain analysis.
- Communication calculations describe geometric visibility only; they do not
  model antenna gain, signal strength, data rate, or ground-station coverage.
- Scores are planning indicators, not mission certification.
- The browser build contains large 3D assets and may require additional memory
  during production bundling.

## Future improvements

- Install and use the full DEM pipeline directly through the API.
- Add higher-resolution horizon and terrain obstruction calculations.
- Add mission-specific landing constraints.
- Include thermal, radiation, power-storage, and rover-accessibility models.
- Add persistent project sessions and exportable comparison reports.
- Add automated end-to-end browser tests.
