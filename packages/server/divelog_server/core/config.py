import logging
from functools import lru_cache
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as package_version

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_SESSION_SECRET = "dev-only-session-secret-change-me-please"

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Runtime configuration, read from the environment (and .env in dev)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATA_ROOT: str = "/data/repo"
    STATE_DIR: str = "/data/state"
    GIT_ENABLED: bool = True
    GIT_AUTHOR_NAME: str = "divelog"
    GIT_AUTHOR_EMAIL: str = ""
    GIT_SSH_KEY_PATH: str = "/run/secrets/deploy_key"

    SITE_NAME: str = "divelog"
    OWNER_NAME: str = "Diver"
    HOME_COUNTRIES: str = ""
    MAIL_SUBJECT: str = "Sign in to {site_name}"
    MAIL_GREETING: str = "Hi {owner_name},"
    COMMONS_ROOT: str = ""
    COMMONS_GIT_ENABLED: bool = False
    PUBLIC_COMMONS_SITES: bool = False
    PUBLIC_COMMONS_REGIONS: str = ""

    APP_VERSION: str = Field(default="", validate_default=True)
    DEBUG: bool = False
    SITE_URL: str = "http://localhost:5173"
    TRUSTED_PROXY_IPS: str = ""

    OWNER_EMAIL: str = ""
    SESSION_SECRET: str = DEFAULT_SESSION_SECRET
    SESSION_COOKIE_NAME: str = "divelog_session"
    SESSION_DAYS: int = 30
    MAGIC_LINK_MINUTES: int = 2
    SIGN_INVITE_DAYS: int = 7
    SIGN_MAIL_SUBJECT: str = "{owner_name} logged a dive with you"
    COOKIE_SECURE: bool = False

    STORAGE_BACKEND: str = "local"
    MEDIA_ROOT: str = "/data/media"
    S3_ENDPOINT: str = ""
    S3_BUCKET: str = ""
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_REGION: str = "us-east-1"
    MAX_UPLOAD_BYTES: int = 50 * 1024 * 1024
    SHEARWATER_LEGACY_SERIAL: str = ""

    BACKEND_SMTP_HOST: str = "localhost"
    BACKEND_SMTP_PORT: int = 1325
    BACKEND_SMTP_USERNAME: str = ""
    BACKEND_SMTP_PASSWORD: str = ""
    BACKEND_SMTP_TLS: bool = False
    BACKEND_SMTP_FROM: str = ""

    @field_validator("APP_VERSION")
    @classmethod
    def _default_version(cls, value: str) -> str:
        """An empty ``APP_VERSION`` falls back to the installed package version."""
        if value:
            return value
        try:
            return package_version("divelog-server")
        except PackageNotFoundError:
            return "0.0.0-dev"

    @property
    def home_countries(self) -> frozenset[str]:
        """ISO-3 codes of the countries that do not count as abroad for trips."""
        return frozenset(c.strip().upper() for c in self.HOME_COUNTRIES.split(",") if c.strip())

    @property
    def public_commons_regions(self) -> frozenset[str]:
        """Region ids ``PUBLIC_COMMONS_SITES`` is limited to; empty means every region."""
        return frozenset(r.strip() for r in self.PUBLIC_COMMONS_REGIONS.split(",") if r.strip())


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance; cleared in tests after setting env vars."""
    return Settings()


class InsecureSettingsError(RuntimeError):
    """Settings that are unsafe to serve in production."""


def check_session_secret(settings: Settings) -> None:
    """Warn about the default ``SESSION_SECRET``; refuse it when ``COOKIE_SECURE`` is on.

    Parameters
    ----------
    settings
        The runtime settings to check.

    Raises
    ------
    InsecureSettingsError
        When ``SESSION_SECRET`` is the shipped default and ``COOKIE_SECURE`` is true.
    """
    if settings.SESSION_SECRET != DEFAULT_SESSION_SECRET:
        return
    if settings.COOKIE_SECURE:
        raise InsecureSettingsError(
            "SESSION_SECRET is the shipped default while COOKIE_SECURE is true; "
            "set SESSION_SECRET (example: output of `openssl rand -hex 32`) before serving"
        )
    logger.warning(
        "SESSION_SECRET is the shipped default: fine for development, "
        "set your own before serving this anywhere public"
    )
