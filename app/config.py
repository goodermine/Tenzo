from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o-mini"
    llm_api_key: str = ""

    # Ramblbox v0
    ramblbox_db_path: str = "ramblbox.db"
    transcribe_model: str = "whisper-1"
    # When true, segment audio is not sent anywhere and a placeholder transcript
    # is used. Lets the whole capture -> assimilate loop run without an ASR key.
    # Set false to transcribe via the OpenAI-compatible /audio/transcriptions endpoint.
    transcribe_stub: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
