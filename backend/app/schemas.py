"""Pydantic v2 schemas for request/response validation."""
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ─── Auth ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    code: str = Field(..., description="6-digit PIN code or staff PIN")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str
    name: str


# ─── User ─────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    name: str
    role: str = "staff"          # "staff" | "customer"
    pin: str
    linked_project_id: Optional[str] = None


class UserOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    name: str
    role: str
    linked_project_id: Optional[str] = None
    is_active: bool
    created_at: datetime


# ─── Project ──────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    church_name: Optional[str] = None
    address_street: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    assigned_staff_id: Optional[str] = None
    general_notes: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    church_name: Optional[str] = None
    address_street: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    status: Optional[str] = None
    assigned_staff_id: Optional[str] = None
    general_notes: Optional[str] = None


class ProjectOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    name: str
    church_name: Optional[str] = None
    address_street: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    status: str
    assigned_staff_id: Optional[str] = None
    customer_access_code: Optional[str] = None
    general_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    photo_count: Optional[int] = None


class ProjectDetail(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    name: str
    church_name: Optional[str] = None
    address_street: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    status: str
    assigned_staff_id: Optional[str] = None
    customer_access_code: Optional[str] = None
    general_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    photos: List["PhotoOut"] = []
    latest_report: Optional["ReportOut"] = None
    latest_estimate: Optional["EstimateOut"] = None


# ─── Photo ────────────────────────────────────────────────────────────────────

class PhotoOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    project_id: str
    storage_url: str
    thumbnail_url: Optional[str] = None
    original_filename: Optional[str] = None
    filename: Optional[str] = None
    window_number: Optional[str] = None
    panel_letter: Optional[str] = None
    elevation: Optional[str] = None
    notes: Optional[str] = None
    taken_at: Optional[datetime] = None
    uploaded_at: datetime
    uploaded_by_id: Optional[str] = None
    sort_order: int
    condition_data: Optional["ConditionDataOut"] = None


class PhotoUpdate(BaseModel):
    notes: Optional[str] = None
    sort_order: Optional[int] = None
    taken_at: Optional[datetime] = None


class PhotoDownloadRequest(BaseModel):
    photo_ids: List[str] = Field(default_factory=list)


# ─── ConditionData ────────────────────────────────────────────────────────────

class ConditionDataOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    photo_id: str
    project_id: str
    window_num: Optional[str] = None
    panel_letter: Optional[str] = None
    elevation: Optional[str] = None
    warping: Optional[int] = None
    lead_det: Optional[int] = None
    breaks: Optional[int] = None
    wood_rot: Optional[bool] = None
    paint_fail: Optional[bool] = None
    pieces: Optional[int] = None
    panel_w: Optional[float] = None
    panel_h: Optional[float] = None
    overall_w: Optional[float] = None
    overall_h: Optional[float] = None
    is_overall_only: bool
    parsed_notes: Optional[str] = None
    parsed_at: datetime


# ─── Estimate ─────────────────────────────────────────────────────────────────

class EstimateLineItemCreate(BaseModel):
    description: str
    quantity: float = 1.0
    unit: Optional[str] = None
    unit_price: float = 0.0
    sort_order: int = 0


class EstimateLineItemOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    estimate_id: str
    description: str
    quantity: float
    unit: Optional[str] = None
    unit_price: float
    total: float
    sort_order: int


class EstimateCreate(BaseModel):
    notes: Optional[str] = None
    line_items: List[EstimateLineItemCreate] = []


class EstimateOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    project_id: str
    created_by_id: Optional[str] = None
    status: str
    total_amount: Optional[float] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    sent_at: Optional[datetime] = None
    responded_at: Optional[datetime] = None
    line_items: List[EstimateLineItemOut] = []


class EstimateResponse(BaseModel):
    action: str = Field(..., pattern="^(accept|decline)$")


# ─── Report ───────────────────────────────────────────────────────────────────

class GenerateReportRequest(BaseModel):
    narrative: Dict[str, Any] = Field(
        default_factory=lambda: {
            "overview": "",
            "current_condition": "",
            "causes": "",
            "hundred_year_plan": "",
            "summary": "",
        },
        description="Narrative text or rich report draft payload for each report section.",
    )
    parsing_mode: str = Field(default="shorthand", pattern="^(shorthand|ai|hybrid)$")
    count_pieces: bool = False
    glass_flavor: str = Field(default="stained", pattern="^(stained|dalle)$")
    publish_to_portal: bool = True


class ReportDraftUpdate(BaseModel):
    narrative: Dict[str, Any] = Field(
        default_factory=dict,
        description="Editable report draft payload including section text and selected photo ids.",
    )


class GenerateAiReportDraftRequest(BaseModel):
    additional_context: str = Field(default="", max_length=12000)
    voice: str = Field(
        default="concise_executive",
        pattern="^(pastoral_confident|heritage_stewardship|concise_executive)$",
    )


class ReportOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    project_id: str
    generated_by_id: Optional[str] = None
    narrative: Optional[Dict[str, Any]] = None
    spreadsheet_url: Optional[str] = None
    pdf_url: Optional[str] = None
    generated_at: datetime


class ImproveBriefRequest(BaseModel):
    text: str = Field(default="", min_length=1, max_length=4000)


class ImproveBriefResponse(BaseModel):
    text: str


# ─── Proposal ─────────────────────────────────────────────────────────────────

class ProposalOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    project_id: str
    estimate_id: Optional[str] = None
    pdf_url: Optional[str] = None
    generated_at: datetime
    viewed_at: Optional[datetime] = None
    viewed_by_customer: bool
    status: str


# ─── Forward references ───────────────────────────────────────────────────────

ProjectDetail.model_rebuild()
PhotoOut.model_rebuild()
