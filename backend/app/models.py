"""SQLAlchemy ORM models for the SSG platform."""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer,
    JSON, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


def new_uuid() -> str:
    """Generate a new UUID as a plain string (compatible with SQLite & Postgres)."""
    return str(uuid.uuid4())


# ─── User ─────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False, default="staff")   # "staff" | "customer"
    pin_hash = Column(String, nullable=False)
    linked_project_id = Column(String, ForeignKey("projects.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    linked_project = relationship(
        "Project", foreign_keys=[linked_project_id], back_populates="customer_users"
    )
    uploaded_photos = relationship(
        "Photo", foreign_keys="Photo.uploaded_by_id", back_populates="uploaded_by"
    )
    assigned_projects = relationship(
        "Project", foreign_keys="Project.assigned_staff_id", back_populates="assigned_staff"
    )
    created_estimates = relationship(
        "Estimate", foreign_keys="Estimate.created_by_id", back_populates="created_by"
    )
    generated_reports = relationship(
        "Report", foreign_keys="Report.generated_by_id", back_populates="generated_by"
    )


# ─── Project ──────────────────────────────────────────────────────────────────

class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String, nullable=False)
    church_name = Column(String, nullable=True)
    address_street = Column(String, nullable=True)
    address_city = Column(String, nullable=True)
    address_state = Column(String, nullable=True)
    address_zip = Column(String, nullable=True)
    # Status: "assessment" | "estimate_sent" | "accepted" | "declined" | "in_progress" | "complete"
    status = Column(String, nullable=False, default="assessment")
    assigned_staff_id = Column(String, ForeignKey("users.id"), nullable=True)
    customer_access_code = Column(String, nullable=True)  # 6-digit code shown to customer
    general_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    customer_users = relationship(
        "User", foreign_keys="User.linked_project_id", back_populates="linked_project"
    )
    assigned_staff = relationship(
        "User", foreign_keys=[assigned_staff_id], back_populates="assigned_projects"
    )
    photos = relationship("Photo", back_populates="project", order_by="Photo.sort_order")
    condition_data = relationship("ConditionData", back_populates="project")
    estimates = relationship("Estimate", back_populates="project", order_by="Estimate.created_at.desc()")
    reports = relationship("Report", back_populates="project", order_by="Report.generated_at.desc()")
    proposals = relationship("Proposal", back_populates="project", order_by="Proposal.generated_at.desc()")


# ─── Photo ────────────────────────────────────────────────────────────────────

class Photo(Base):
    __tablename__ = "photos"

    id = Column(String, primary_key=True, default=new_uuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    storage_url = Column(String, nullable=False)
    thumbnail_url = Column(String, nullable=True)
    original_filename = Column(String, nullable=True)
    filename = Column(String, nullable=True)          # auto-generated from notes
    window_number = Column(String, nullable=True)
    panel_letter = Column(String, nullable=True)
    elevation = Column(String, nullable=True)
    notes = Column(Text, nullable=True)              # raw shorthand description
    taken_at = Column(DateTime, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    uploaded_by_id = Column(String, ForeignKey("users.id"), nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="photos")
    uploaded_by = relationship(
        "User", foreign_keys=[uploaded_by_id], back_populates="uploaded_photos"
    )
    condition_data = relationship(
        "ConditionData", back_populates="photo", uselist=False, cascade="all, delete-orphan"
    )


# ─── ConditionData ────────────────────────────────────────────────────────────

class ConditionData(Base):
    __tablename__ = "condition_data"

    id = Column(String, primary_key=True, default=new_uuid)
    photo_id = Column(String, ForeignKey("photos.id"), nullable=False, unique=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    window_num = Column(String, nullable=True)
    panel_letter = Column(String, nullable=True)
    elevation = Column(String, nullable=True)
    warping = Column(Integer, nullable=True)        # 0-5
    lead_det = Column(Integer, nullable=True)       # 0-5
    breaks = Column(Integer, nullable=True)         # count
    wood_rot = Column(Boolean, nullable=True)
    paint_fail = Column(Boolean, nullable=True)
    pieces = Column(Integer, nullable=True)
    panel_w = Column(Float, nullable=True)
    panel_h = Column(Float, nullable=True)
    overall_w = Column(Float, nullable=True)
    overall_h = Column(Float, nullable=True)
    is_overall_only = Column(Boolean, default=False, nullable=False)
    parsed_notes = Column(Text, nullable=True)
    parsed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    photo = relationship("Photo", back_populates="condition_data")
    project = relationship("Project", back_populates="condition_data")


# ─── Estimate ─────────────────────────────────────────────────────────────────

class Estimate(Base):
    __tablename__ = "estimates"

    id = Column(String, primary_key=True, default=new_uuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    created_by_id = Column(String, ForeignKey("users.id"), nullable=True)
    # Status: "draft" | "sent" | "accepted" | "declined"
    status = Column(String, nullable=False, default="draft")
    total_amount = Column(Float, nullable=True, default=0.0)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    sent_at = Column(DateTime, nullable=True)
    responded_at = Column(DateTime, nullable=True)

    # Relationships
    project = relationship("Project", back_populates="estimates")
    created_by = relationship(
        "User", foreign_keys=[created_by_id], back_populates="created_estimates"
    )
    line_items = relationship(
        "EstimateLineItem", back_populates="estimate",
        order_by="EstimateLineItem.sort_order",
        cascade="all, delete-orphan",
    )
    proposals = relationship("Proposal", back_populates="estimate")


# ─── EstimateLineItem ─────────────────────────────────────────────────────────

class EstimateLineItem(Base):
    __tablename__ = "estimate_line_items"

    id = Column(String, primary_key=True, default=new_uuid)
    estimate_id = Column(String, ForeignKey("estimates.id"), nullable=False)
    description = Column(String, nullable=False)
    quantity = Column(Float, nullable=False, default=1.0)
    unit = Column(String, nullable=True)             # e.g. "sqft", "panel", "ea"
    unit_price = Column(Float, nullable=False, default=0.0)
    total = Column(Float, nullable=False, default=0.0)  # quantity * unit_price
    sort_order = Column(Integer, default=0, nullable=False)

    # Relationships
    estimate = relationship("Estimate", back_populates="line_items")


# ─── Report ───────────────────────────────────────────────────────────────────

class Report(Base):
    __tablename__ = "reports"

    id = Column(String, primary_key=True, default=new_uuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    generated_by_id = Column(String, ForeignKey("users.id"), nullable=True)
    narrative = Column(JSON, nullable=True)  # dict with overview/current_condition/causes/hundred_year_plan/summary
    spreadsheet_url = Column(String, nullable=True)
    pdf_url = Column(String, nullable=True)
    generated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="reports")
    generated_by = relationship(
        "User", foreign_keys=[generated_by_id], back_populates="generated_reports"
    )


# ─── Proposal ─────────────────────────────────────────────────────────────────

class Proposal(Base):
    __tablename__ = "proposals"

    id = Column(String, primary_key=True, default=new_uuid)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    estimate_id = Column(String, ForeignKey("estimates.id"), nullable=True)
    pdf_url = Column(String, nullable=True)
    generated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    viewed_at = Column(DateTime, nullable=True)
    viewed_by_customer = Column(Boolean, default=False, nullable=False)
    # Status: "pending" | "generated" | "viewed"
    status = Column(String, nullable=False, default="pending")

    # Relationships
    project = relationship("Project", back_populates="proposals")
    estimate = relationship("Estimate", back_populates="proposals")
