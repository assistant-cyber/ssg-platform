"""Storage service supporting local disk and S3-compatible object stores."""
import io
import mimetypes
import shutil
from pathlib import Path
from typing import Optional, Tuple, Union
from urllib.parse import urlparse

import requests
from PIL import Image as PILImage

from app.config import settings


class StorageService:
    """Unified storage backend supporting local disk and S3-compatible storage."""

    MEDIA_PREFIX = "/media/"

    def __init__(self):
        self.storage_type = settings.STORAGE_TYPE.lower()
        self._bucket = settings.S3_BUCKET_NAME

        if self.storage_type == "s3":
            import boto3
            from botocore.config import Config

            client_kwargs = {
                "service_name": "s3",
                "region_name": settings.S3_REGION,
                "aws_access_key_id": settings.AWS_ACCESS_KEY_ID,
                "aws_secret_access_key": settings.AWS_SECRET_ACCESS_KEY,
            }
            if settings.S3_ENDPOINT_URL:
                client_kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL
                client_kwargs["config"] = Config(s3={"addressing_style": "path"})

            self._s3 = boto3.client(**client_kwargs)
        else:
            self._upload_dir = Path(settings.UPLOAD_DIR).resolve()
            self._upload_dir.mkdir(parents=True, exist_ok=True)

    def upload_photo(
        self, file_bytes: bytes, project_id: str, filename: str
    ) -> Tuple[str, str]:
        """Upload a photo and a derived thumbnail."""
        photo_url = self.upload_file(
            file_bytes,
            project_id,
            filename,
            subfolder="photos",
            content_type=self.guess_content_type(filename),
        )

        thumb_bytes = self._make_thumbnail(file_bytes)
        thumb_filename = self._thumbnail_name(filename)
        thumbnail_url = self.upload_file(
            thumb_bytes,
            project_id,
            thumb_filename,
            subfolder="photos/thumbs",
            content_type="image/jpeg",
        )

        return photo_url, thumbnail_url

    def upload_photo_fast(
        self, file_bytes: bytes, project_id: str, filename: str, photo_id: str
    ) -> str:
        """Upload photo only (no thumbnail), return photo_url. Non-blocking."""
        key = self.build_key(project_id, "photos", filename)
        if self.storage_type == "s3":
            self._upload_s3(file_bytes, key, self.guess_content_type(filename))
        else:
            self._upload_local(file_bytes, key)
        return self.media_url(key)

    def upload_file(
        self,
        file_bytes: bytes,
        project_id: str,
        filename: str,
        subfolder: str = "files",
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload arbitrary bytes and return the app media URL."""
        key = self.build_key(project_id, subfolder, filename)

        if self.storage_type == "s3":
            self._upload_s3(file_bytes, key, content_type)
        else:
            self._upload_local(file_bytes, key)

        return self.media_url(key)

    def build_key(self, project_id: str, subfolder: str, filename: str) -> str:
        return f"projects/{project_id}/{subfolder}/{filename}"

    def media_url(self, key: str) -> str:
        return f"{self.MEDIA_PREFIX}{key.lstrip('/')}"

    def storage_key_from_url(self, url: str) -> str:
        """Extract the object key from an app media URL, legacy upload URL, or S3 URL."""
        if not url:
            raise ValueError("Storage URL is empty")

        if url.startswith(self.MEDIA_PREFIX):
            return url[len(self.MEDIA_PREFIX):].lstrip("/")

        if url.startswith("/uploads/"):
            return url[len("/uploads/"):].lstrip("/")

        parsed = urlparse(url)
        if parsed.scheme in {"http", "https"}:
            path = parsed.path.lstrip("/")

            if "/storage/v1/object/public/" in parsed.path:
                _, _, remainder = parsed.path.partition("/storage/v1/object/public/")
                remainder = remainder.lstrip("/")
                bucket, _, key = remainder.partition("/")
                if bucket and key:
                    return key

            if "/storage/v1/object/sign/" in parsed.path:
                _, _, remainder = parsed.path.partition("/storage/v1/object/sign/")
                remainder = remainder.lstrip("/")
                bucket, _, key = remainder.partition("/")
                if bucket and key:
                    return key

            if self._bucket and path.startswith(f"{self._bucket}/"):
                return path[len(self._bucket) + 1:]

            return path

        return url.lstrip("/")

    def get_local_path(self, url: str) -> str:
        """Convert a local storage URL into an absolute filesystem path."""
        key = self.storage_key_from_url(url)
        return str(self._upload_dir / key)

    def download_bytes(self, url: str) -> bytes:
        """Return file bytes for a stored asset, regardless of backend."""
        if self.storage_type == "s3":
            key = self.storage_key_from_url(url)
            body = self._s3.get_object(Bucket=self._bucket, Key=key)["Body"]
            return body.read()

        parsed = urlparse(url)
        if parsed.scheme in {"http", "https"}:
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            return response.content

        return Path(self.get_local_path(url)).read_bytes()

    def materialize_file(
        self,
        url: str,
        destination_dir: Union[str, Path],
        filename: Optional[str] = None,
    ) -> str:
        """Ensure a stored asset exists on local disk and return its path."""
        if self.storage_type != "s3" and not urlparse(url).scheme:
            return self.get_local_path(url)

        destination_root = Path(destination_dir)
        destination_root.mkdir(parents=True, exist_ok=True)

        key = self.storage_key_from_url(url)
        target_name = filename or Path(key).name or "asset.bin"
        destination = destination_root / target_name
        if destination.exists():
            return str(destination)

        destination.write_bytes(self.download_bytes(url))
        return str(destination)

    def delete_project_files(self, project_id: str) -> None:
        """Delete all stored files for a project."""
        prefix = f"projects/{project_id}/"
        if self.storage_type == "s3":
            self._delete_project_files_s3(prefix)
        else:
            self._delete_project_files_local(prefix)

    def guess_content_type(self, filename: str) -> str:
        content_type, _ = mimetypes.guess_type(filename)
        return content_type or "application/octet-stream"

    def _make_thumbnail(self, file_bytes: bytes, size: Tuple[int, int] = (400, 400)) -> bytes:
        try:
            img = PILImage.open(io.BytesIO(file_bytes))
            img.thumbnail(size, PILImage.LANCZOS)
            if img.mode in ("RGBA", "P", "LA"):
                img = img.convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=80, optimize=True)
            return buf.getvalue()
        except Exception:
            return file_bytes

    def _upload_local(self, file_bytes: bytes, key: str) -> None:
        dest_path = self._upload_dir / key
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        dest_path.write_bytes(file_bytes)

    def _delete_project_files_local(self, prefix: str) -> None:
        project_dir = self._upload_dir / prefix
        if project_dir.exists():
            shutil.rmtree(project_dir, ignore_errors=True)

    def _upload_s3(self, file_bytes: bytes, key: str, content_type: str) -> None:
        self._s3.put_object(
            Bucket=self._bucket,
            Key=key,
            Body=file_bytes,
            ContentType=content_type,
        )

    def _delete_project_files_s3(self, prefix: str) -> None:
        paginator = self._s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
            contents = page.get("Contents", [])
            if not contents:
                continue
            objects = [{"Key": item["Key"]} for item in contents]
            self._s3.delete_objects(Bucket=self._bucket, Delete={"Objects": objects})

    @staticmethod
    def _thumbnail_name(filename: str) -> str:
        stem = Path(filename).stem
        return f"{stem}_thumb.jpg"


storage = StorageService()
