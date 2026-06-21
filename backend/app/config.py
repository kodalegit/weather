from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    weatherai_api_key: str = Field(default="", alias="WEATHERAI_API_KEY")
    weatherai_base_url: str = Field(
        default="https://api.weather-ai.co", alias="WEATHERAI_BASE_URL"
    )
    frontend_origin: str = Field(
        default="http://localhost:3000", alias="FRONTEND_ORIGIN"
    )
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    openai_chat_model: str = Field(default="gpt-5-nano", alias="OPENAI_CHAT_MODEL")
    # Optional override. When empty, the OpenAI SDK uses its default
    # (https://api.openai.com/v1). Surfaced here so error messages can report
    # the exact endpoint the backend is trying to reach.
    openai_base_url: str = Field(default="", alias="OPENAI_BASE_URL")
    openai_timeout: float = Field(default=30.0, alias="OPENAI_TIMEOUT")
    openai_max_retries: int = Field(default=2, alias="OPENAI_MAX_RETRIES")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
