"""Estimates router."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_staff
from app.models import Estimate, EstimateLineItem, Project, User, new_uuid
from app.schemas import EstimateCreate, EstimateOut, EstimateResponse

router = APIRouter(tags=["estimates"])


def _get_project_or_404(project_id: str, db: Session) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _check_customer_access(project_id: str, current_user: User):
    if current_user.role == "customer" and current_user.linked_project_id != project_id:
        raise HTTPException(status_code=403, detail="Access denied")


def _get_latest_estimate(project_id: str, db: Session) -> Optional[Estimate]:
    return (
        db.query(Estimate)
        .filter(Estimate.project_id == project_id)
        .order_by(Estimate.created_at.desc())
        .first()
    )


# ─── Get latest estimate ──────────────────────────────────────────────────────

@router.get("/projects/{project_id}/estimate", response_model=EstimateOut)
def get_estimate(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the latest estimate for a project.

    Both staff and the linked customer may view.
    """
    _get_project_or_404(project_id, db)
    _check_customer_access(project_id, current_user)

    estimate = _get_latest_estimate(project_id, db)
    if not estimate:
        raise HTTPException(status_code=404, detail="No estimate found for this project")

    return EstimateOut.model_validate(estimate)


# ─── Create/replace draft estimate ────────────────────────────────────────────

@router.post(
    "/projects/{project_id}/estimate",
    response_model=EstimateOut,
    status_code=status.HTTP_201_CREATED,
)
def create_estimate(
    project_id: str,
    body: EstimateCreate,
    current_user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Create or replace the draft estimate for a project (staff only).

    Any existing draft estimate is replaced.  Sent/accepted/declined estimates
    are preserved in history — only drafts are removed.
    Line item totals are (re)calculated as quantity * unit_price.
    """
    _get_project_or_404(project_id, db)

    # Delete existing drafts
    db.query(Estimate).filter(
        Estimate.project_id == project_id,
        Estimate.status == "draft",
    ).delete(synchronize_session=False)

    # Calculate line item totals and estimate total
    total_amount = 0.0
    line_items = []
    for i, item_data in enumerate(body.line_items):
        total = round(item_data.quantity * item_data.unit_price, 2)
        total_amount += total
        line_items.append(
            EstimateLineItem(
                id=new_uuid(),
                description=item_data.description,
                quantity=item_data.quantity,
                unit=item_data.unit,
                unit_price=item_data.unit_price,
                total=total,
                sort_order=item_data.sort_order if item_data.sort_order else i,
            )
        )

    estimate = Estimate(
        id=new_uuid(),
        project_id=project_id,
        created_by_id=current_user.id,
        status="draft",
        total_amount=round(total_amount, 2),
        notes=body.notes,
    )
    db.add(estimate)
    db.flush()

    for item in line_items:
        item.estimate_id = estimate.id
        db.add(item)

    db.commit()
    db.refresh(estimate)
    return EstimateOut.model_validate(estimate)


# ─── Send estimate ────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/estimate/send", response_model=EstimateOut)
def send_estimate(
    project_id: str,
    current_user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Mark the latest draft estimate as sent and update project status (staff only)."""
    project = _get_project_or_404(project_id, db)

    estimate = _get_latest_estimate(project_id, db)
    if not estimate:
        raise HTTPException(status_code=404, detail="No estimate found for this project")
    if estimate.status != "draft":
        raise HTTPException(
            status_code=400, detail=f"Estimate is already '{estimate.status}', not a draft"
        )

    estimate.status = "sent"
    estimate.sent_at = datetime.utcnow()
    estimate.updated_at = datetime.utcnow()

    project.status = "estimate_sent"
    project.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(estimate)
    return EstimateOut.model_validate(estimate)


# ─── Respond to estimate ──────────────────────────────────────────────────────

@router.post("/projects/{project_id}/estimate/respond", response_model=EstimateOut)
def respond_to_estimate(
    project_id: str,
    body: EstimateResponse,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Customer accepts or declines the sent estimate.

    Updates project status accordingly.
    """
    _get_project_or_404(project_id, db)
    _check_customer_access(project_id, current_user)

    estimate = _get_latest_estimate(project_id, db)
    if not estimate:
        raise HTTPException(status_code=404, detail="No estimate found for this project")
    if estimate.status != "sent":
        raise HTTPException(
            status_code=400,
            detail=f"Estimate is '{estimate.status}', not 'sent'. Cannot respond.",
        )

    project = db.query(Project).filter(Project.id == project_id).first()

    if body.action == "accept":
        estimate.status = "accepted"
        project.status = "accepted"
    else:
        estimate.status = "declined"
        project.status = "declined"

    estimate.responded_at = datetime.utcnow()
    estimate.updated_at = datetime.utcnow()
    project.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(estimate)
    return EstimateOut.model_validate(estimate)
