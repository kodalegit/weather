# FieldCast

FieldCast is an AI Engineer challenge project for WeatherAI: an interactive field intelligence map that turns raw weather API responses into operational decisions.

Users can click anywhere on the map, fetch a WeatherAI forecast through a FastAPI backend, inspect the raw response, copy a concise advisory, and ask a streaming tool-calling agent for natural-language advice.

## Features

- **Two-panel experience**: full interactive Leaflet map on the left, weather intelligence on the right
- **Weather intelligence hierarchy**: location summary, current conditions, hourly/daily forecast timeline, and a field advisory
- **Streaming weather agent**: a chat-style interface that calls WeatherAI live and streams tokens, tool calls, and reasoning
- **Copy-ready advisory**: a single-field advisory with one-tap copy, replacing the redundant SMS preview
- **FastAPI backend** keeps the WeatherAI API key private and powers the streaming agent
- **Raw WeatherAI JSON inspector** in a collapsed panel for transparent API review

## Stack

- Frontend: Next.js 16, React 19, Tailwind CSS v4, Leaflet, TanStack Query
- Backend: FastAPI, uv, httpx, pydantic-settings, LangChain
- API: WeatherAI `/v1/weather` and `/v1/usage`

## Design

The interface follows a calm, information-dense aesthetic inspired by Linear, Vercel, Apple Weather, Notion, and Arc Browser: soft borders, restrained color, generous spacing, and clear hierarchy. Weather data is parsed from the WeatherAI response shape into human-readable sections (current conditions, hourly/daily forecast, advisory) rather than presented as raw cards.

## Local Setup

### Backend

```bash
cd backend
cp .env.example .env
```

Add your WeatherAI key to `backend/.env`:

```bash
WEATHERAI_API_KEY=your_weatherai_api_key
OPENAI_API_KEY=your_openai_api_key
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
- `OPENAI_API_KEY`
- `OPENAI_CHAT_MODEL`

Deploy the frontend on Railway, Netlify, or Vercel and set:

- `NEXT_PUBLIC_API_BASE_URL=https://your-backend-domain`

## Project Framing

The Free WeatherAI plan is enough for the core demo. Real SMS sending is not included in the MVP because WeatherAI's live SMS/USSD delivery is a Scale-plan capability, so FieldCast presents a production-shaped advisory that can be copied and wired to live delivery once approved.
