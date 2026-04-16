from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Congressional Trading Intelligence API"
    database_url: str = Field(default="sqlite:///./congress_trades.db", alias="DATABASE_URL")
    api_prefix: str = "/api"

    capitol_trades_base_url: str = "https://www.capitoltrades.com/trades"
    capitol_trades_page_size: int = 96
    user_agent: str = "CongressTradingIntel/0.1"
    legislators_url: str = "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml"
    committee_memberships_url: str = "https://raw.githubusercontent.com/unitedstates/congress/main/data/committee-membership-current.json"
    congress_api_reference_url: str = "https://raw.githubusercontent.com/christopherkenny/congress/master/README.md"

    yfinance_period: str = "10y"
    benchmark_ticker: str = "SPY"

    scheduler_timezone: str = "UTC"
    smtp_enabled: bool = Field(default=False, alias="SMTP_ENABLED")
    smtp_host: str = Field(default="localhost", alias="SMTP_HOST")
    smtp_port: int = Field(default=587, alias="SMTP_PORT")
    smtp_username: str = Field(default="", alias="SMTP_USERNAME")
    smtp_password: str = Field(default="", alias="SMTP_PASSWORD")
    smtp_from_email: str = Field(default="alerts@example.com", alias="SMTP_FROM_EMAIL")
    alert_to_email: str = Field(default="alerts@example.com", alias="ALERT_TO_EMAIL")

    cache_dir: Path = Path(".cache")
    model_dir: Path = Path("artifacts/models")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.cache_dir.mkdir(parents=True, exist_ok=True)
    settings.model_dir.mkdir(parents=True, exist_ok=True)
    return settings
