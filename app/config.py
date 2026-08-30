from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Ramblbox v0
    ramblbox_db_path: str = "ramblbox.db"
    # Raw segment audio is stored here on disk; the agent downloads and transcribes it.
    ramblbox_audio_dir: str = "ramblbox_audio"
    # Optional: URL to POST to the instant "Done" is pressed, so the agent starts
    # immediately instead of polling /agent/pending. Empty = notify disabled (poll only).
    agent_webhook_url: str = ""
    # Optional: send a Telegram message on "Done" to wake the agent on demand
    # (avoids timed polling / idle credit burn). Both must be set to enable.
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
