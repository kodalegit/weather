# FieldCast Backend

FastAPI proxy and advisory layer for WeatherAI.

```bash
cp .env.example .env
UV_CACHE_DIR=.uv-cache uv sync
UV_CACHE_DIR=.uv-cache uv run fastapi dev main.py
```

Required environment variable:

- `WEATHERAI_API_KEY`
- `OPENAI_API_KEY`
