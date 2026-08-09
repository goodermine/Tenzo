from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o-mini"
    llm_api_key: str = ""

    # Ramblbox v0
    ramblbox_db_path: str = "ramblbox.db"
    # Raw segment audio is stored here on disk; the agent downloads and transcribes it.
    ramblbox_audio_dir: str = "ramblbox_audio"
    # Optional: URL to POST to the instant "Done" is pressed, so the agent starts
    # immediately instead of polling /agent/pending. Empty = notify disabled (poll only).
    agent_webhook_url: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
