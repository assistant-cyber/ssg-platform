#!/usr/bin/env python3
"""Migrate SQLite/local-storage data into the configured target database/storage."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import requests
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.database import Base, engine as target_engine
from app.models import (
    ConditionData,
    Estimate,
    EstimateLineItem,
    Photo,
    Project,
    Proposal,
    Report,
    User,
)
from app.storage import storage


MODEL_ORDER = [
    User,
    Project,
    Photo,
    ConditionData,
    Estimate,
    EstimateLineItem,
    Report,
    Proposal,
]


def _connect_args(database_url: str) -> dict:
    return {"check_same_thread": False} if database_url.startswith("sqlite") else {}


def _row_to_dict(instance) -> dict:
    return {
        column.name: getattr(instance, column.name)
        for column in instance.__table__.columns
    }


def _legacy_key_from_url(url: str) -> str:
    if not url:
        raise ValueError("Asset URL is empty")

    if url.startswith("/uploads/"):
        return url[len("/uploads/"):].lstrip("/")
    if url.startswith("/media/"):
        return url[len("/media/"):].lstrip("/")

    parsed = urlparse(url)
    if parsed.scheme in {"http", "https"}:
        path = parsed.path.lstrip("/")
        if "/storage/v1/object/public/" in parsed.path:
            _, _, remainder = parsed.path.partition("/storage/v1/object/public/")
            remainder = remainder.lstrip("/")
            _, _, key = remainder.partition("/")
            return key
        if "/storage/v1/object/sign/" in parsed.path:
            _, _, remainder = parsed.path.partition("/storage/v1/object/sign/")
            remainder = remainder.lstrip("/")
            _, _, key = remainder.partition("/")
            return key
        return path

    return url.lstrip("/")


def _read_source_asset(url: str, source_upload_root: Path) -> bytes:
    parsed = urlparse(url)
    if parsed.scheme in {"http", "https"}:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        return response.content

    key = _legacy_key_from_url(url)
    candidate = source_upload_root / key
    if candidate.exists():
        return candidate.read_bytes()

    path_candidate = Path(url)
    if path_candidate.exists():
        return path_candidate.read_bytes()

    raise FileNotFoundError(f"Missing source asset: {url}")


def _upload_asset(
    url: Optional[str],
    project_id: str,
    source_upload_root: Path,
    migrated_assets: dict[str, str],
) -> Optional[str]:
    if not url:
        return url
    if url in migrated_assets:
        return migrated_assets[url]

    key = _legacy_key_from_url(url)
    parts = Path(key).parts
    if len(parts) < 4 or parts[0] != "projects":
        raise ValueError(f"Unsupported asset key: {key}")

    subfolder = "/".join(parts[2:-1]) or "files"
    filename = parts[-1]
    file_bytes = _read_source_asset(url, source_upload_root)
    new_url = storage.upload_file(
        file_bytes=file_bytes,
        project_id=project_id,
        filename=filename,
        subfolder=subfolder,
        content_type=storage.guess_content_type(filename),
    )
    migrated_assets[url] = new_url
    return new_url


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Copy SQLite/local-storage SSG data into the currently configured target backend.",
    )
    parser.add_argument(
        "--source-db",
        default="sqlite:///./ssg.db",
        help="Source database URL. Defaults to the local SQLite database in backend/.",
    )
    parser.add_argument(
        "--source-upload-dir",
        default="./uploads",
        help="Directory containing source uploaded files.",
    )
    args = parser.parse_args()

    source_engine = create_engine(
        args.source_db,
        connect_args=_connect_args(args.source_db),
    )
    SourceSession = sessionmaker(bind=source_engine, autoflush=False, autocommit=False)
    TargetSession = sessionmaker(bind=target_engine, autoflush=False, autocommit=False)
    source_upload_root = Path(args.source_upload_dir).resolve()
    migrated_assets: dict[str, str] = {}
    deferred_user_project_links: dict[str, str] = {}

    Base.metadata.create_all(bind=target_engine)

    with Session(source_engine) as source_db:
        source_project_ids = set(source_db.scalars(select(Project.id)).all())
        source_user_ids = set(source_db.scalars(select(User.id)).all())
        source_photo_ids = set(source_db.scalars(select(Photo.id)).all())
        source_estimate_ids = set(source_db.scalars(select(Estimate.id)).all())

        with TargetSession() as target_db:
            for model in MODEL_ORDER:
                rows = source_db.scalars(select(model)).all()
                for row in rows:
                    payload = _row_to_dict(row)

                    if model is User:
                        linked_project_id = payload.get("linked_project_id")
                        if linked_project_id:
                            deferred_user_project_links[payload["id"]] = linked_project_id
                            # Users and projects form a cycle:
                            # users.linked_project_id -> projects.id and
                            # projects.assigned_staff_id -> users.id.
                            # Insert the user first, then backfill the customer link after
                            # all referenced projects exist in the target database.
                            payload["linked_project_id"] = None
                    elif model is Photo:
                        if payload["project_id"] not in source_project_ids:
                            continue
                        if payload.get("uploaded_by_id") not in source_user_ids:
                            payload["uploaded_by_id"] = None
                        payload["storage_url"] = _upload_asset(
                            payload.get("storage_url"),
                            payload["project_id"],
                            source_upload_root,
                            migrated_assets,
                        )
                        payload["thumbnail_url"] = _upload_asset(
                            payload.get("thumbnail_url"),
                            payload["project_id"],
                            source_upload_root,
                            migrated_assets,
                        )
                    elif model is ConditionData:
                        if payload["project_id"] not in source_project_ids:
                            continue
                        if payload["photo_id"] not in source_photo_ids:
                            continue
                    elif model is Estimate:
                        if payload["project_id"] not in source_project_ids:
                            continue
                        if payload.get("created_by_id") not in source_user_ids:
                            payload["created_by_id"] = None
                    elif model is EstimateLineItem:
                        if payload["estimate_id"] not in source_estimate_ids:
                            continue
                    elif model is Report:
                        if payload["project_id"] not in source_project_ids:
                            continue
                        if payload.get("generated_by_id") not in source_user_ids:
                            payload["generated_by_id"] = None
                        payload["spreadsheet_url"] = _upload_asset(
                            payload.get("spreadsheet_url"),
                            payload["project_id"],
                            source_upload_root,
                            migrated_assets,
                        )
                        payload["pdf_url"] = _upload_asset(
                            payload.get("pdf_url"),
                            payload["project_id"],
                            source_upload_root,
                            migrated_assets,
                        )
                    elif model is Proposal:
                        if payload["project_id"] not in source_project_ids:
                            continue
                        if payload.get("estimate_id") not in source_estimate_ids:
                            payload["estimate_id"] = None
                        payload["pdf_url"] = _upload_asset(
                            payload.get("pdf_url"),
                            payload["project_id"],
                            source_upload_root,
                            migrated_assets,
                        )

                    target_db.merge(model(**payload))

                target_db.flush()

            for user_id, linked_project_id in deferred_user_project_links.items():
                user = target_db.get(User, user_id)
                if user is None:
                    raise ValueError(f"Deferred user missing from target DB: {user_id}")
                user.linked_project_id = linked_project_id

            target_db.commit()

    print("Migration complete.")
    print(f"Source DB: {args.source_db}")
    print(f"Source uploads: {source_upload_root}")
    print(f"Migrated assets: {len(migrated_assets)}")


if __name__ == "__main__":
    main()
