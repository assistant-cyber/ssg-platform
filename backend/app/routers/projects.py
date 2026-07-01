"""Projects router."""
import random
import string
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import get_current_user, is_staff_role, require_staff
from app.models import (
    ConditionData,
    Estimate,
    EstimateLineItem,
    Photo,
    Project,
    Proposal,
    Report,
    User,
    new_uuid,
)
from app.schemas import ProjectCreate, ProjectDetail, ProjectOut, ProjectUpdate
from app.security import hash_pin
from app.storage import storage

router = APIRouter(tags=["projects"])


def _generate_access_code(length: int = 6) -> str:
    """Generate a random numeric access code."""
    return "".join(random.choices(string.digits, k=length))


def _project_to_out(project: Project, db: Session) -> ProjectOut:
    """Convert a Project ORM object to ProjectOut schema including photo_count."""
    photo_count = db.query(Photo).filter(Photo.project_id == project.id).count()
    out = ProjectOut.model_validate(project)
    out.photo_count = photo_count
    return out


# ─── List projects ────────────────────────────────────────────────────────────

@router.get("/projects", response_model=List[ProjectOut])
def list_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return projects the caller is allowed to see.

    - Staff: all projects.
    - Customer: only their linked project.
    """
    if is_staff_role(current_user.role):
        projects = db.query(Project).order_by(Project.created_at.desc()).all()
    else:
        if not current_user.linked_project_id:
            return []
        projects = (
            db.query(Project)
            .filter(Project.id == current_user.linked_project_id)
            .all()
        )

    return [_project_to_out(p, db) for p in projects]


# ─── Create project ───────────────────────────────────────────────────────────

@router.post("/projects", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    body: ProjectCreate,
    current_user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Create a new project (staff only).

    Also auto-creates a linked customer user whose PIN is a generated 6-digit
    access code so the customer can log in immediately.
    """
    access_code = _generate_access_code(6)

    project = Project(
        id=new_uuid(),
        name=body.name,
        church_name=body.church_name,
        address_street=body.address_street,
        address_city=body.address_city,
        address_state=body.address_state,
        address_zip=body.address_zip,
        assigned_staff_id=body.assigned_staff_id or current_user.id,
        customer_access_code=access_code,
        general_notes=body.general_notes,
        status="assessment",
    )
    db.add(project)
    db.flush()  # assign project.id before creating user

    # Auto-create customer user
    customer = User(
        id=new_uuid(),
        name=f"{body.church_name} (Customer)",
        role="customer",
        pin_hash=hash_pin(access_code),
        linked_project_id=project.id,
        is_active=True,
    )
    db.add(customer)
    db.commit()
    db.refresh(project)

    return _project_to_out(project, db)


# ─── Get project detail ───────────────────────────────────────────────────────

@router.get("/projects/{project_id}", response_model=ProjectDetail)
def get_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return detailed project info including photos and latest report/estimate.

    Customers may only view their own linked project.
    """
    # Eager-load photos (and each photo's condition_data / uploaded_by) in
    # 3 small SELECTs instead of 1 + 2*N lazy queries. Projects with 700+
    # photos were hitting 30–60s on the dashboard because of the N+1.
    project = (
        db.query(Project)
        .options(
            selectinload(Project.photos).selectinload(Photo.condition_data),
            selectinload(Project.photos).selectinload(Photo.uploaded_by),
            selectinload(Project.reports),
            selectinload(Project.estimates),
        )
        .filter(Project.id == project_id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if current_user.role == "customer":
        if current_user.linked_project_id != project_id:
            raise HTTPException(status_code=403, detail="Access denied")

    # Build detail
    from app.schemas import EstimateOut, PhotoOut, ReportOut

    photos_out = [PhotoOut.model_validate(p) for p in project.photos]

    latest_report = None
    if project.reports:
        latest_report = ReportOut.model_validate(project.reports[0])

    latest_estimate = None
    if project.estimates:
        latest_estimate = EstimateOut.model_validate(project.estimates[0])

    detail = ProjectDetail.model_validate(project)
    detail.photos = photos_out
    detail.latest_report = latest_report
    detail.latest_estimate = latest_estimate

    return detail


# ─── Update project ───────────────────────────────────────────────────────────

@router.patch("/projects/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: str,
    body: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Partially update a project.

    Staff/admin may update any editable project fields.
    The linked customer may only submit `general_notes` for their project.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    update_data = body.model_dump(exclude_unset=True)

    if not is_staff_role(current_user.role):
        if current_user.role != "customer" or current_user.linked_project_id != project_id:
            raise HTTPException(status_code=403, detail="Access denied")
        disallowed = set(update_data.keys()) - {"general_notes"}
        if disallowed:
            raise HTTPException(status_code=403, detail="Customers may only update project notes")

    for field, value in update_data.items():
        setattr(project, field, value)
    project.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(project)
    return _project_to_out(project, db)


# ─── Delete project ───────────────────────────────────────────────────────────

@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: str,
    current_user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Delete a project and all dependent records/files (staff only)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    db.query(ConditionData).filter(ConditionData.project_id == project_id).delete(
        synchronize_session=False
    )

    estimate_ids = [
        row[0]
        for row in db.query(Estimate.id).filter(Estimate.project_id == project_id).all()
    ]
    if estimate_ids:
        db.query(EstimateLineItem).filter(
            EstimateLineItem.estimate_id.in_(estimate_ids)
        ).delete(synchronize_session=False)

    db.query(Photo).filter(Photo.project_id == project_id).delete(
        synchronize_session=False
    )
    db.query(Proposal).filter(Proposal.project_id == project_id).delete(
        synchronize_session=False
    )
    db.query(Report).filter(Report.project_id == project_id).delete(
        synchronize_session=False
    )
    db.query(Estimate).filter(Estimate.project_id == project_id).delete(
        synchronize_session=False
    )
    db.query(User).filter(User.linked_project_id == project_id).delete(
        synchronize_session=False
    )
    db.delete(project)
    db.commit()

    storage.delete_project_files(project_id)
