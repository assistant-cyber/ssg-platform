"""SQLAlchemy engine, session, and table-creation helpers."""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings


# Railway provides postgres:// but SQLAlchemy 2.x requires postgresql://
_db_url = settings.DATABASE_URL
if _db_url.startswith("postgres://"):
        _db_url = _db_url.replace("postgres://", "postgresql://", 1)
    
# Build engine — SQLite needs check_same_thread=False for FastAPI
connect_args = {}
if _db_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
            _db_url,
    connect_args=connect_args,
    echo=settings.DEBUG,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Shared declarative base for all models."""
    pass


def get_db():
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables() -> None:
    """Import all models so their metadata is registered, then create tables."""
    # Importing models here registers them with Base.metadata
    import app.models  # noqa: F401
    Base.metadata.create_all(bind=engine)
