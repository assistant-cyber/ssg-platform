"""Reports and proposals router."""
import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db, SessionLocal
from app.dependencies import get_current_user, is_staff_role, require_staff
from app.models import Estimate, Photo, Project, Proposal, Report, User, new_uuid
from app.schemas import (
    GenerateReportRequest,
    GenerateAiReportDraftRequest,
    ImproveBriefRequest,
    ImproveBriefResponse,
    ProposalOut,
    ReportDraftUpdate,
    ReportOut,
)
from app.storage import storage
from processing.report_payload import extract_meta
router = APIRouter(tags=["reports"])


REPORT_SECTION_SPECS = {
    "overview": {
        "title": "Overview & Valuation",
        "subtitle": "Set the context and importance of the windows being assessed.",
    },
    "current_condition": {
        "title": "Current Condition",
        "subtitle": "Describe the visible condition issues the client needs to understand.",
    },
    "causes": {
        "title": "What Caused These Issues",
        "subtitle": "Break down the root causes in language a customer can understand.",
    },
    "hundred_year_plan": {
        "title": "100-Year Restoration Plan",
        "subtitle": "Lay out the restoration strategy and preservation approach.",
    },
    "summary": {
        "title": "Summary",
        "subtitle": "Close with the professional recommendation and next-step framing.",
    },
}

VOICE_GUIDANCE = {
    "pastoral_confident": (
        "Warm, confident, client-facing, and reassuring. Sound like a trusted stained glass restoration "
        "expert speaking to a church leadership team. Clear, polished, and respectful."
    ),
    "heritage_stewardship": (
        "Historic-preservation focused and stewardship-oriented. Emphasize care, legacy, material integrity, "
        "and long-term preservation without sounding academic or cold."
    ),
    "concise_executive": (
        "Direct, polished, and efficient. Use shorter paragraphs and decisive language suitable for decision-makers "
        "who want clarity fast."
    ),
}


def _get_project_or_404(project_id: str, db: Session) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _photo_local_path(photo: Photo, cache_dir: Path) -> str:
    """Resolve a stored photo to a local filesystem path for PDF generation."""
    if not photo.storage_url:
        return ""
    return storage.materialize_file(photo.storage_url, cache_dir, filename=photo.filename or None)


def _photos_to_dicts(photos, cache_dir: Path):
    """Convert Photo ORM objects to dicts for processing modules."""
    result = []
    for p in photos:
        result.append({
            "id": p.id,
            "notes": p.notes or "",
            "local_path": _photo_local_path(p, cache_dir),
            "storage_url": p.storage_url,
            "filename": p.filename or "",
            "window_number": p.window_number or "",
            "panel_letter": p.panel_letter or "",
            "elevation": p.elevation or "",
        })
    return result


def _project_snapshot(project: Project, photos: list[Photo]) -> str:
    photo_lines = []
    for photo in photos[:40]:
        window_ref = f"{photo.window_number or ''}{photo.panel_letter or ''}".strip()
        label = window_ref or (photo.filename or "").rsplit(".", 1)[0].strip() or photo.id
        note = re.sub(r"\s+", " ", (photo.notes or "").strip())
        if len(note) > 260:
            note = f"{note[:257]}..."
        photo_lines.append(
            f"- id={photo.id}; label={label}; window_ref={window_ref or 'None'}; "
            f"elevation={photo.elevation or 'Unknown'}; filename={photo.filename or 'Unknown'}; "
            f"note={note or 'No note provided'}"
        )

    address_parts = [
        project.address_street or "",
        project.address_city or "",
        project.address_state or "",
        project.address_zip or "",
    ]
    address = ", ".join(part for part in address_parts if part)
    return (
        f"Project name: {project.name}\n"
        f"Church name: {project.church_name or project.name}\n"
        f"Address: {address or 'Not provided'}\n"
        f"Assessment date: {project.created_at.strftime('%B %d, %Y')}\n"
        f"Project notes: {(project.general_notes or '').strip() or 'None provided'}\n"
        f"Photo observations:\n" + ("\n".join(photo_lines) if photo_lines else "- No photos uploaded yet")
    )


def _default_photo_ids_for_section(section_key: str, photos: list[Photo]) -> list[str]:
    if not photos:
        return []
    if section_key == "overview":
        return [photos[0].id]
    if section_key == "summary":
        return [photos[-1].id]
    return [photo.id for photo in photos[: min(3, len(photos))]]


def _narrative_with_portal_publish(narrative: Optional[dict], generated_at: datetime) -> dict:
    payload = narrative.copy() if isinstance(narrative, dict) else {}
    meta = payload.get("_meta")
    meta = meta.copy() if isinstance(meta, dict) else {}
    meta["portal_published_at"] = datetime.utcnow().isoformat()
    meta["portal_published_version_at"] = generated_at.isoformat()
    payload["_meta"] = meta
    return payload


def _fallback_report_body(
    section_key: str,
    project: Project,
    photos: list[Photo],
    additional_context: str,
    voice: str,
) -> str:
    church_name = project.church_name or project.name
    location_parts = [project.address_city, project.address_state]
    location = ", ".join(part for part in location_parts if part)
    note_samples = [re.sub(r"\s+", " ", (photo.notes or "").strip()) for photo in photos if (photo.notes or "").strip()]
    sample_text = " ".join(note_samples[:4])
    voice_line = {
        "pastoral_confident": "Our goal is to give the client a clear, reassuring explanation of the observed conditions and the restoration path ahead.",
        "heritage_stewardship": "This draft emphasizes stewardship of the historic material and the long-term preservation value of the windows.",
        "concise_executive": "This draft keeps the explanation concise, decision-oriented, and focused on practical next steps.",
    }[voice]

    if section_key == "overview":
        return (
            f"Scottish Stained Glass completed a visual assessment of the stained glass at {church_name}"
            f"{f' in {location}' if location else ''}. The purpose of this report is to document the visible condition of the windows, "
            "explain the restoration needs in plain language, and outline a professional path forward.\n\n"
            f"{voice_line}"
        )
    if section_key == "current_condition":
        details = sample_text or "Visible field conditions indicate areas of age-related deterioration, protective system concerns, and glass/support issues that should be addressed."
        return (
            "The current condition of the stained glass indicates active deterioration that is typical of aging church windows exposed to long-term environmental stress. "
            f"Observed field notes include: {details}\n\n"
            "Taken together, these conditions support restoration planning rather than continued deferred maintenance."
        )
    if section_key == "causes":
        return (
            "The deterioration appears to be the result of cumulative age, weather exposure, normal movement in the surrounding structure, and the long-term fatigue of the lead matrix and supporting materials. "
            "In many church installations, these issues develop gradually and are compounded when small failures allow moisture or structural stress to remain active over time.\n\n"
            "The visible damage should be understood as part of a broader preservation cycle rather than as isolated cosmetic issues."
        )
    if section_key == "hundred_year_plan":
        context_tail = f" {additional_context.strip()}" if additional_context.strip() else ""
        return (
            "Our recommendation is a restoration approach that stabilizes the windows, addresses failing lead and damaged glass, and returns the panels to sound long-term service while preserving their original character. "
            "That scope typically includes removal, studio restoration, repair or replacement of damaged materials where appropriate, protective glazing review, and careful reinstallation.\n\n"
            f"The objective is to create a durable preservation outcome that supports the next generation of stewardship.{context_tail}"
        )
    return (
        "In summary, the windows show conditions that justify professional restoration planning at this stage. "
        "A complete restoration scope will protect the artistic and historical value of the glass while reducing the risk of continued loss or emergency repairs.\n\n"
        "This report is intended to support next-step discussion, budgeting, and restoration sequencing."
    )


def _fallback_ai_report_draft(
    project: Project,
    photos: list[Photo],
    additional_context: str,
    voice: str,
) -> dict:
    draft = {
        "_meta": {
            "report_title": project.church_name or project.name,
            "report_subtitle": "A client-ready assessment draft written from field observations, project context, and photo evidence.",
            "report_label": "Assessment Report",
            "cover_photo_id": photos[0].id if photos else None,
            "ai_voice": voice,
            "ai_context": additional_context.strip(),
        }
    }
    for section_key, spec in REPORT_SECTION_SPECS.items():
        draft[section_key] = {
            "title": spec["title"],
            "subtitle": spec["subtitle"],
            "body": _fallback_report_body(section_key, project, photos, additional_context, voice),
            "photo_ids": _default_photo_ids_for_section(section_key, photos),
        }
    return draft


def _sanitize_ai_report_payload(
    payload: Optional[dict],
    project: Project,
    photos: list[Photo],
    additional_context: str,
    voice: str,
) -> dict:
    base = _fallback_ai_report_draft(project, photos, additional_context, voice)
    if not isinstance(payload, dict):
        return base

    meta = payload.get("_meta")
    if isinstance(meta, dict):
        for key in ("report_title", "report_subtitle", "report_label"):
            if isinstance(meta.get(key), str) and meta.get(key).strip():
                base["_meta"][key] = meta.get(key).strip()
        cover_photo_id = meta.get("cover_photo_id")
        if isinstance(cover_photo_id, str) and any(photo.id == cover_photo_id for photo in photos):
            base["_meta"]["cover_photo_id"] = cover_photo_id

    valid_photo_ids = {photo.id for photo in photos}
    for section_key, spec in REPORT_SECTION_SPECS.items():
        section_payload = payload.get(section_key)
        if not isinstance(section_payload, dict):
            continue

        title = section_payload.get("title")
        subtitle = section_payload.get("subtitle")
        body = section_payload.get("body")
        photo_ids = section_payload.get("photo_ids")

        if isinstance(title, str) and title.strip():
            base[section_key]["title"] = title.strip()
        else:
            base[section_key]["title"] = spec["title"]

        if isinstance(subtitle, str) and subtitle.strip():
            base[section_key]["subtitle"] = subtitle.strip()
        else:
            base[section_key]["subtitle"] = spec["subtitle"]

        if isinstance(body, str) and body.strip():
            base[section_key]["body"] = body.strip().replace("—", ", ").replace("–", ", ")

        if isinstance(photo_ids, list):
            filtered = [photo_id for photo_id in photo_ids if isinstance(photo_id, str) and photo_id in valid_photo_ids]
            base[section_key]["photo_ids"] = filtered or _default_photo_ids_for_section(section_key, photos)

    return base


def _generate_ai_report_draft(
    project: Project,
    photos: list[Photo],
    additional_context: str,
    voice: str,
) -> dict:
    fallback = _fallback_ai_report_draft(project, photos, additional_context, voice)
    if not settings.ANTHROPIC_API_KEY:
        return fallback

    prompt = f"""
You are writing a stained glass assessment report for Scottish Stained Glass.

Brand voice:
{VOICE_GUIDANCE[voice]}

Instructions:
- Write the full customer-facing report in polished prose.
- Keep the tone on-brand, professional, and specific.
- Use only standard punctuation. Do not use em dashes.
- Do not write bullet lists.
- Each section should be substantial enough for a customer report, usually 2 to 4 short paragraphs.
- Only reference facts that are supported by the project data and field notes below.
- When the field notes support it, mention specific window or panel references such as 1A, 2B, or north elevation in the prose so the reader can connect the report text to the actual photos.
- Choose section photo_ids that directly match the problems discussed in each section.
- Return valid JSON only.
- Use this shape exactly:
{{
  "_meta": {{
    "report_title": "string",
    "report_subtitle": "string",
    "report_label": "Assessment Report",
    "cover_photo_id": "photo-id-or-null"
  }},
  "overview": {{"title": "string", "subtitle": "string", "body": "string", "photo_ids": ["id"]}},
  "current_condition": {{"title": "string", "subtitle": "string", "body": "string", "photo_ids": ["id"]}},
  "causes": {{"title": "string", "subtitle": "string", "body": "string", "photo_ids": ["id"]}},
  "hundred_year_plan": {{"title": "string", "subtitle": "string", "body": "string", "photo_ids": ["id"]}},
  "summary": {{"title": "string", "subtitle": "string", "body": "string", "photo_ids": ["id"]}}
}}

Project context:
{_project_snapshot(project, photos)}

Additional user context:
{additional_context.strip() or "None provided"}
""".strip()

    try:
        from anthropic import Anthropic

        client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2400,
            temperature=0.4,
            messages=[{"role": "user", "content": prompt}],
        )

        raw_text = " ".join(
            block_text
            for block in response.content
            for block_text in [getattr(block, "text", None)]
            if isinstance(block_text, str)
        ).strip()
        if raw_text.startswith("```"):
            raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
            raw_text = re.sub(r"\s*```$", "", raw_text)
        payload = json.loads(raw_text)
        return _sanitize_ai_report_payload(payload, project, photos, additional_context, voice)
    except Exception:
        return fallback


def _upsert_report_draft(
    db: Session,
    project_id: str,
    user_id: str,
    narrative: dict,
) -> Report:
    report = (
        db.query(Report)
        .filter(Report.project_id == project_id)
        .order_by(Report.generated_at.desc())
        .first()
    )

    if report is None:
        report = Report(
            id=new_uuid(),
            project_id=project_id,
            generated_by_id=user_id,
            narrative=narrative,
            generated_at=datetime.utcnow(),
        )
        db.add(report)
    else:
        report.generated_by_id = user_id
        report.narrative = narrative
        report.generated_at = datetime.utcnow()

    db.commit()
    db.refresh(report)
    return report


def _polish_brief_fallback(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", (text or "").strip())
    cleaned = cleaned.replace("—", ", ").replace("–", ", ")
    cleaned = cleaned.replace("  ", " ")
    if not cleaned:
        return ""
    cleaned = cleaned[0].upper() + cleaned[1:]
    if not cleaned.endswith("."):
        cleaned += "."
    if "Scottish Stained Glass" not in cleaned:
        cleaned = (
            "The selected photographs show stained glass areas that require professional assessment and restoration work. "
            + cleaned
        )
    return cleaned


def _polish_brief_with_ai(text: str) -> str:
    prompt = (
        "Rewrite this stained glass restoration field note as a short, professional internal estimator brief. "
        "Keep it to 2 or 3 sentences. Be concrete about visible condition issues and recommended work. "
        "Do not use em dashes. Do not use bullet points. Preserve factual meaning.\n\n"
        f"Field note:\n{text.strip()}"
    )

    if settings.ANTHROPIC_API_KEY:
      try:
        from anthropic import Anthropic

        client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=220,
            temperature=0.2,
            messages=[{"role": "user", "content": prompt}],
        )
        parts = []
        for block in response.content:
            block_text = getattr(block, "text", None)
            if isinstance(block_text, str):
                parts.append(block_text)
        improved = " ".join(parts).strip()
        if improved:
            return improved.replace("—", ", ").replace("–", ", ")
      except Exception:
        pass

    return _polish_brief_fallback(text)


# ─── Background task: generate report ────────────────────────────────────────

def _generate_report_task(
    report_id: str,
    project_id: str,
    narrative: dict,
    parsing_mode: str,
    count_pieces: bool,
    glass_flavor: str,
    publish_to_portal: bool,
):
    """Background task: build condition sheet + report PDF, upload, update DB."""
    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return

        report = db.query(Report).filter(Report.id == report_id).first()
        if not report:
            return

        photos = (
            db.query(Photo)
            .filter(Photo.project_id == project_id)
            .order_by(Photo.sort_order)
            .all()
        )
        output_dir = Path(settings.REPORTS_OUTPUT_PATH) / project_id
        output_dir.mkdir(parents=True, exist_ok=True)
        render_cache_dir = output_dir / "_media_cache"
        render_cache_dir.mkdir(parents=True, exist_ok=True)

        photos_dicts = _photos_to_dicts(photos, render_cache_dir)

        # ── 1. Generate condition spreadsheet ────────────────────────────────

        safe_name = "".join(c if c.isalnum() or c in " _-" else "_" for c in project.name)
        xlsx_filename = f"{safe_name}_Condition_Sheet.xlsx"
        xlsx_path = str(output_dir / xlsx_filename)

        from processing.condition_sheet import generate_condition_sheet_from_db
        generate_condition_sheet_from_db(
            project_id=project_id,
            project_name=project.church_name or project.name,
            photos=photos_dicts,
            output_path=xlsx_path,
            mode=parsing_mode,
            count_pieces=count_pieces,
            flavor=glass_flavor,
        )

        # Upload spreadsheet
        if os.path.exists(xlsx_path):
            xlsx_bytes = Path(xlsx_path).read_bytes()
            spreadsheet_url = storage.upload_file(
                xlsx_bytes, project_id, xlsx_filename,
                subfolder="reports", content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        else:
            spreadsheet_url = None

        # ── 2. Generate report PDF ────────────────────────────────────────────
        pdf_filename = f"{safe_name}_Assessment_Report.pdf"
        pdf_path = str(output_dir / pdf_filename)

        assess_date = project.created_at.strftime("%B %d, %Y")
        address_parts = [
            project.address_street,
            project.address_city,
            project.address_state,
            project.address_zip,
        ]
        full_address = ", ".join(p for p in address_parts if p) or ""

        project_dict = {
            "name": project.name,
            "church_name": project.church_name or project.name,
            "address_street": project.address_street or "",
            "address_city": project.address_city or "",
            "address_state": project.address_state or "",
            "assess_date": assess_date,
            "church_address": full_address,
        }

        from processing.report_generator import generate_report_pdf
        generate_report_pdf(
            project=project_dict,
            narrative=narrative,
            photos=photos_dicts,
            spreadsheet_path=xlsx_path if os.path.exists(xlsx_path) else None,
            output_path=pdf_path,
        )

        # Upload PDF
        pdf_url = None
        if os.path.exists(pdf_path):
            pdf_bytes = Path(pdf_path).read_bytes()
            pdf_url = storage.upload_file(
                pdf_bytes, project_id, pdf_filename,
                subfolder="reports", content_type="application/pdf",
            )

        # ── 3. Update report record ───────────────────────────────────────────
        report.spreadsheet_url = spreadsheet_url
        report.pdf_url = pdf_url
        if publish_to_portal and pdf_url:
            report.narrative = _narrative_with_portal_publish(report.narrative, report.generated_at)
        db.commit()

    except Exception as e:
        # Log but do not crash the background task
        print(f"[report_task] Error generating report {report_id}: {e}")
    finally:
        db.close()


# ─── Background task: generate proposal ──────────────────────────────────────

def _generate_proposal_task(proposal_id: str, project_id: str, estimate_id: Optional[str]):
    """Background task: build proposal PDF, upload, update DB."""
    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return

        proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()
        if not proposal:
            return

        estimate = None
        if estimate_id:
            estimate = db.query(Estimate).filter(Estimate.id == estimate_id).first()
        if estimate is None:
            # Fall back to latest estimate
            estimate = (
                db.query(Estimate)
                .filter(Estimate.project_id == project_id)
                .order_by(Estimate.created_at.desc())
                .first()
            )

        output_dir = Path(settings.REPORTS_OUTPUT_PATH) / project_id
        output_dir.mkdir(parents=True, exist_ok=True)

        safe_name = "".join(c if c.isalnum() or c in " _-" else "_" for c in project.name)
        pdf_filename = f"{safe_name}_Proposal.pdf"
        pdf_path = str(output_dir / pdf_filename)

        assess_date = project.created_at.strftime("%B %d, %Y")
        address_parts = [
            project.address_street, project.address_city,
            project.address_state, project.address_zip,
        ]
        full_address = ", ".join(p for p in address_parts if p) or ""

        project_dict = {
            "name": project.name,
            "church_name": project.church_name or project.name,
            "church_address": full_address,
            "assess_date": assess_date,
        }

        estimate_dict = None
        if estimate:
            estimate_dict = {
                "id": estimate.id,
                "status": estimate.status,
                "total_amount": estimate.total_amount or 0.0,
                "notes": estimate.notes or "",
                "created_at": estimate.created_at.strftime("%B %d, %Y"),
                "line_items": [
                    {
                        "description": li.description,
                        "quantity": li.quantity,
                        "unit": li.unit or "",
                        "unit_price": li.unit_price,
                        "total": li.total,
                    }
                    for li in estimate.line_items
                ],
            }

        # Gather photos for cover/gallery
        photos_objs = db.query(Photo).filter(Photo.project_id == project_id).order_by(Photo.sort_order).all()
        render_cache_dir = output_dir / "_media_cache"
        render_cache_dir.mkdir(parents=True, exist_ok=True)
        photos_for_pdf = [
            {
                "local_path": _photo_local_path(p, render_cache_dir) if p.storage_url else None,
                "storage_url": p.storage_url,
                "filename": p.filename or "",
                "window_number": p.window_number,
                "panel_letter": p.panel_letter,
                "notes": p.notes or "",
                "sort_order": p.sort_order,
            }
            for p in photos_objs
        ]

        # Get latest report narrative if available
        latest_report = db.query(Report).filter(Report.project_id == project_id).order_by(Report.generated_at.desc()).first()
        narrative_for_pdf = (latest_report.narrative or {}) if latest_report else {}

        from processing.proposal_generator import generate_proposal_pdf
        generate_proposal_pdf(
            project=project_dict,
            estimate=estimate_dict,
            output_path=pdf_path,
            photos=photos_for_pdf,
            narrative=narrative_for_pdf,
        )

        pdf_url = None
        if os.path.exists(pdf_path):
            pdf_bytes = Path(pdf_path).read_bytes()
            pdf_url = storage.upload_file(
                pdf_bytes, project_id, pdf_filename,
                subfolder="proposals", content_type="application/pdf",
            )

        proposal.pdf_url = pdf_url
        proposal.status = "generated"
        db.commit()

    except Exception as e:
        print(f"[proposal_task] Error generating proposal {proposal_id}: {e}")
    finally:
        db.close()


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post(
    "/projects/{project_id}/generate-report",
    response_model=ReportOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def generate_report(
    project_id: str,
    body: GenerateReportRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Trigger report generation (staff only). Returns immediately; generation runs in background."""
    project = _get_project_or_404(project_id, db)

    report = Report(
        id=new_uuid(),
        project_id=project_id,
        generated_by_id=current_user.id,
        narrative=body.narrative,
        generated_at=datetime.utcnow(),
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    background_tasks.add_task(
        _generate_report_task,
        report.id,
        project_id,
        body.narrative,
        body.parsing_mode,
        body.count_pieces,
        body.glass_flavor,
        body.publish_to_portal,
    )

    return ReportOut.model_validate(report)


@router.patch("/projects/{project_id}/report", response_model=ReportOut)
def save_report_draft(
    project_id: str,
    body: ReportDraftUpdate,
    current_user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Create or update the latest editable report draft for a project."""
    _get_project_or_404(project_id, db)

    report = _upsert_report_draft(db, project_id, current_user.id, body.narrative)
    return ReportOut.model_validate(report)


@router.post("/projects/{project_id}/generate-report-draft", response_model=ReportOut)
def generate_ai_report_draft(
    project_id: str,
    body: GenerateAiReportDraftRequest,
    current_user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Generate a full editable report draft with AI and save it as the latest draft."""
    project = _get_project_or_404(project_id, db)
    photos = (
        db.query(Photo)
        .filter(Photo.project_id == project_id)
        .order_by(Photo.sort_order)
        .all()
    )

    draft = _generate_ai_report_draft(
        project=project,
        photos=photos,
        additional_context=body.additional_context,
        voice=body.voice,
    )
    report = _upsert_report_draft(db, project_id, current_user.id, draft)
    return ReportOut.model_validate(report)


@router.post("/projects/{project_id}/improve-brief", response_model=ImproveBriefResponse)
def improve_brief(
    project_id: str,
    body: ImproveBriefRequest,
    current_user: User = Depends(require_staff),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, db)
    return ImproveBriefResponse(text=_polish_brief_with_ai(body.text))


@router.get("/projects/{project_id}/report", response_model=ReportOut)
def get_report(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the latest report for a project."""
    _get_project_or_404(project_id, db)
    if current_user.role == "customer" and current_user.linked_project_id != project_id:
        raise HTTPException(status_code=403, detail="Access denied")

    report = (
        db.query(Report)
        .filter(Report.project_id == project_id)
        .order_by(Report.generated_at.desc())
        .first()
    )
    if not report:
        raise HTTPException(status_code=404, detail="No report found for this project")

    if current_user.role == "customer":
        meta = extract_meta(report.narrative)
        if not meta.get("portal_published_at"):
            raise HTTPException(status_code=404, detail="No report published for this project")

    return ReportOut.model_validate(report)


@router.post(
    "/projects/{project_id}/generate-proposal",
    response_model=ProposalOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def generate_proposal(
    project_id: str,
    background_tasks: BackgroundTasks,
    estimate_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trigger proposal PDF generation.

    Staff/admin may generate for any project.
    The linked customer may generate for their own project after acceptance.
    """
    project = _get_project_or_404(project_id, db)

    if not is_staff_role(current_user.role):
        if current_user.role != "customer" or current_user.linked_project_id != project_id:
            raise HTTPException(status_code=403, detail="Access denied")

    proposal = Proposal(
        id=new_uuid(),
        project_id=project_id,
        estimate_id=estimate_id,
        status="pending",
        generated_at=datetime.utcnow(),
    )
    db.add(proposal)
    db.commit()
    db.refresh(proposal)

    background_tasks.add_task(
        _generate_proposal_task,
        proposal.id,
        project_id,
        estimate_id,
    )

    return ProposalOut.model_validate(proposal)


@router.get("/projects/{project_id}/proposal", response_model=ProposalOut)
def get_proposal(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the latest proposal for a project.

    If the caller is a customer, marks the proposal as viewed.
    """
    _get_project_or_404(project_id, db)
    if current_user.role == "customer" and current_user.linked_project_id != project_id:
        raise HTTPException(status_code=403, detail="Access denied")

    proposal = (
        db.query(Proposal)
        .filter(Proposal.project_id == project_id)
        .order_by(Proposal.generated_at.desc())
        .first()
    )
    if not proposal:
        raise HTTPException(status_code=404, detail="No proposal found for this project")

    # Mark as viewed if customer has not yet seen it
    if current_user.role == "customer" and not proposal.viewed_by_customer:
        proposal.viewed_by_customer = True
        proposal.viewed_at = datetime.utcnow()
        proposal.status = "viewed"
        db.commit()
        db.refresh(proposal)

    return ProposalOut.model_validate(proposal)
