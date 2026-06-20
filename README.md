# FieldCast

FieldCast is an AI Engineer challenge project for WeatherAI: an interactive field intelligence map that turns raw weather API responses into operational decisions.

Users can click anywhere on the map, fetch a WeatherAI forecast through a FastAPI backend, inspect the raw response, copy a 160-character SMS-ready alert, and ask a lightweight tool-calling agent for natural-language advice.

## Features

- Interactive Leaflet map with pin-based WeatherAI lookups
- FastAPI backend keeps the WeatherAI API key private
- Deterministic local advisory engine for rain, wind, and temperature risk
- SMS alert preview for last-mile delivery workflows
- Agent-style endpoint that exposes its tool calls and synthesized answer
- Raw WeatherAI JSON inspector for transparent API integration review
- Usage/quota fetch via the WeatherAI usage endpoint

## Stack

- Frontend: Next.js, React, Tailwind CSS, shadcn-style primitives, Leaflet
- Backend: FastAPI, uv, httpx, pydantic-settings
- API: WeatherAI `/v1/weather` and `/v1/usage`

## Local Setup

### Backend

```bash
cd backend
cp .env.example .env
```

Add your WeatherAI key to `backend/.env`:

```bash
WEATHERAI_API_KEY=your_weatherai_api_key
```

Install and run:

```bash
UV_CACHE_DIR=.uv-cache uv sync
UV_CACHE_DIR=.uv-cache uv run fastapi dev main.py
```

The API runs at `http://localhost:8000`.

### Frontend

```bash
cd frontend
cp .env.example .env.local
bash -ic 'pnpm install'
bash -ic 'pnpm dev'
```

The app runs at `http://localhost:3000`.

## Verification

```bash
cd backend
UV_CACHE_DIR=.uv-cache uv run python -m py_compile main.py

cd ../frontend
bash -ic 'pnpm lint'
bash -ic 'pnpm build'
```

## Deployment Notes

Deploy the backend as a FastAPI service on Railway or Render with:

```bash
fastapi run main.py
```

Set backend environment variables:

- `WEATHERAI_API_KEY`
- `WEATHERAI_BASE_URL=https://api.weather-ai.co`
- `FRONTEND_ORIGIN=https://your-frontend-domain`

Deploy the frontend on Railway, Netlify, or Vercel and set:

- `NEXT_PUBLIC_API_BASE_URL=https://your-backend-domain`

## Project Framing

The Free WeatherAI plan is enough for the core demo. Real SMS sending is not included in the MVP because WeatherAI's live SMS/USSD delivery is a Scale-plan capability, so FieldCast presents a production-shaped SMS preview that can be wired to live delivery once approved.
