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

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
