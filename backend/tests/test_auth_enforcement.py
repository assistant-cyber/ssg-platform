"""Tests that authentication is actually enforced (regression for disabled-auth).

The backend previously shipped with get_current_user bypassed — every request
was treated as an admin. These tests lock in real JWT enforcement.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from main import app
from app.models import Project, User, new_uuid
from app.security import hash_pin, create_access_token


@pytest.fixture(scope="function")
def test_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="function")
def client(test_db):
    def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def staff_user(test_db):
    user = User(
        id=new_uuid(), name="Staff", role="staff",
        pin_hash=hash_pin("1234"), is_active=True,
    )
    test_db.add(user)
    test_db.commit()
    return user


@pytest.fixture(scope="function")
def customer_user(test_db, project):
    user = User(
        id=new_uuid(), name="Customer", role="customer",
        pin_hash=hash_pin("786534"), is_active=True,
        linked_project_id=project.id,
    )
    test_db.add(user)
    test_db.commit()
    return user


@pytest.fixture(scope="function")
def project(test_db):
    proj = Project(id=new_uuid(), name="Auth Test Project")
    test_db.add(proj)
    test_db.commit()
    return proj


def _headers(user):
    token = create_access_token({"sub": user.id, "role": user.role})
    return {"Authorization": f"Bearer {token}"}


# ── No token → 401 ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("method,path", [
    ("get", "/projects"),
    ("get", "/projects/some-id"),
    ("get", "/projects/some-id/windows"),
    ("post", "/projects/some-id/windows"),
    ("get", "/projects/some-id/proposal-draft"),
])
def test_unauthenticated_requests_rejected(client, method, path):
    if method == "post":
        response = client.post(path, json={})
    else:
        response = client.get(path)
    assert response.status_code == 401, f"{method.upper()} {path} allowed without a token!"


def test_garbage_token_rejected(client):
    response = client.get("/projects", headers={"Authorization": "Bearer not-a-jwt"})
    assert response.status_code == 401


def test_token_for_deleted_user_rejected(client, test_db, staff_user):
    headers = _headers(staff_user)
    test_db.delete(staff_user)
    test_db.commit()
    response = client.get("/projects", headers=headers)
    assert response.status_code == 401


def test_token_for_deactivated_user_rejected(client, test_db, staff_user):
    headers = _headers(staff_user)
    staff_user.is_active = False
    test_db.commit()
    response = client.get("/projects", headers=headers)
    assert response.status_code == 401


# ── Valid tokens work ────────────────────────────────────────────────────────

def test_staff_token_accepted(client, staff_user):
    response = client.get("/projects", headers=_headers(staff_user))
    assert response.status_code == 200


def test_login_flow_end_to_end(client, staff_user):
    login = client.post("/auth/login", json={"code": "1234"})
    assert login.status_code == 200
    token = login.json()["access_token"]
    response = client.get("/projects", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200


def test_customer_token_accepted_for_project_read(client, customer_user, project):
    response = client.get(f"/projects/{project.id}", headers=_headers(customer_user))
    # customer may read (200); the key assertion is it is NOT a 401
    assert response.status_code != 401
