# FieldCast Backend

FastAPI proxy and advisory layer for WeatherAI.

```bash
cp .env.example .env
uv sync
uv run fastapi dev main.py
```

Required environment variable:

- `WEATHERAI_API_KEY`
- `OPENAI_API_KEY`
