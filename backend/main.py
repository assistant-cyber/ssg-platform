"""Scottish Stained Glass Platform — FastAPI application."""
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import create_tables
from app.routers import auth, estimates, photos, projects, reports
from app.storage import storage


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: create DB tables on startup."""
    # Ensure upload and report directories exist
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.REPORTS_OUTPUT_PATH, exist_ok=True)
    create_tables()
    yield


app = FastAPI(
    title="Scottish Stained Glass Platform",
    description="Assessment, reporting, and customer portal API for Scottish Stained Glass.",
    version="1.0.0",
    lifespan=lifespan,
)

# ─── CORS ────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Static files (local storage) ────────────────────────────────────────────
if settings.STORAGE_TYPE == "local":
    _upload_dir = os.path.abspath(settings.UPLOAD_DIR)
    os.makedirs(_upload_dir, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=_upload_dir), name="uploads")


@app.get("/media/{asset_path:path}", tags=["media"])
def serve_media(asset_path: str):
    """Serve stored media through the API for both local and S3-backed storage."""
    media_url = f"/media/{asset_path.lstrip('/')}"
    content_type = storage.guess_content_type(asset_path)

    try:
        if settings.STORAGE_TYPE == "local":
            local_path = Path(storage.get_local_path(media_url))
            if not local_path.exists():
                raise HTTPException(status_code=404, detail="Media not found")
            return FileResponse(local_path, media_type=content_type)

        return Response(content=storage.download_bytes(media_url), media_type=content_type)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=404, detail="Media not found")

# ─── Routers ─────────────────────────────────────────────────────────────────
app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(projects.router)
app.include_router(photos.router)
app.include_router(estimates.router)
app.include_router(reports.router)


# ─── Health check ─────────────────────────────────────────────────────────────
@app.get("/", tags=["health"])
def health_check():
    """API health check."""
    return {
        "status": "ok",
        "service": "Scottish Stained Glass Platform",
        "version": "1.0.0",
    }
