"""Application configuration loaded from environment variables / .env file."""
from typing import Optional

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Security
    SECRET_KEY: str = "change-me-to-a-random-secret-key-at-least-32-chars"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = 72
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "sqlite:///./ssg.db"

    # Storage
    STORAGE_TYPE: str = "local"          # "local" | "s3"
    UPLOAD_DIR: str = Field(
        default="./uploads",
        validation_alias=AliasChoices("UPLOAD_DIR", "STORAGE_LOCAL_PATH"),
    )

    # S3 (only used when STORAGE_TYPE="s3")
    S3_BUCKET_NAME: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("S3_BUCKET_NAME", "AWS_BUCKET_NAME"),
    )
    S3_REGION: Optional[str] = Field(
        default="us-east-1",
        validation_alias=AliasChoices("S3_REGION", "AWS_REGION"),
    )
    S3_ENDPOINT_URL: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("S3_ENDPOINT_URL", "AWS_ENDPOINT_URL"),
    )
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None

    # Reports
    REPORTS_OUTPUT_PATH: str = "./reports"

    # AI / Anthropic
    ANTHROPIC_API_KEY: Optional[str] = None


settings = Settings()
