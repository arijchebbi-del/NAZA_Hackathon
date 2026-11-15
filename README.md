# Lunar Landing Site Evaluator

## Frontend

The React/Vite application lives in `frontend/`.

```powershell
cd frontend
npm install
npm run dev
```

By default, the frontend connects to `http://localhost:8000`. Copy
`frontend/.env.example` to `frontend/.env.local` to override the API URL or the
supported date range.

## Backend

The evaluator API and chatbot run from `backend/`:

```powershell
cd backend
python -m pip install -r requirements.txt
python -m app.server
```

The API serves site data, physical sky/timeline evaluations, and `POST /api/chat`.
The physical evaluator follows the team's DEM-based score factors and uses a
dependency-free analytical fallback when the large DEM archive is not installed.
