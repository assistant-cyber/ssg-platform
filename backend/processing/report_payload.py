"""Helpers for richer report draft payloads shared by report/proposal generation."""
from typing import Any, Dict, List, Optional


SECTION_KEYS = [
    "overview",
    "current_condition",
    "causes",
    "hundred_year_plan",
    "summary",
]

DEFAULT_CONDITION_SCHEDULE_TITLE = "Appendix 4: Window Condition Schedule"
DEFAULT_CONDITION_SCHEDULE_INTRO = (
    "Per-window and per-panel assessment details. Red indicates critical condition, "
    "yellow indicates moderate, green indicates good condition."
)


def _section_value(narrative: Optional[Dict[str, Any]], key: str) -> Any:
    if not isinstance(narrative, dict):
        return None
    return narrative.get(key)


def extract_section_text(narrative: Optional[Dict[str, Any]], key: str) -> str:
    """Return the editable body text for a section from legacy or rich payloads."""
    value = _section_value(narrative, key)
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        body = value.get("body")
        return body if isinstance(body, str) else ""
    return ""


def extract_section_photo_ids(narrative: Optional[Dict[str, Any]], key: str) -> List[str]:
    """Return selected project photo ids attached to a section."""
    value = _section_value(narrative, key)
    if not isinstance(value, dict):
        return []
    photo_ids = value.get("photo_ids")
    if not isinstance(photo_ids, list):
        return []
    return [str(photo_id) for photo_id in photo_ids if photo_id]


def extract_meta(narrative: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Return the report-level metadata block, if present."""
    if not isinstance(narrative, dict):
        return {}
    meta = narrative.get("_meta")
    return meta if isinstance(meta, dict) else {}


def extract_cover_photo_id(narrative: Optional[Dict[str, Any]]) -> Optional[str]:
    """Return the explicitly selected cover photo id, if present."""
    cover_photo_id = extract_meta(narrative).get("cover_photo_id")
    return str(cover_photo_id) if cover_photo_id else None


def extract_condition_schedule_title(narrative: Optional[Dict[str, Any]]) -> str:
    """Return the Appendix 4 title, if present."""
    title = extract_meta(narrative).get("condition_schedule_title")
    return title.strip() if isinstance(title, str) and title.strip() else DEFAULT_CONDITION_SCHEDULE_TITLE


def extract_condition_schedule_intro(narrative: Optional[Dict[str, Any]]) -> str:
    """Return the Appendix 4 intro copy, if present."""
    intro = extract_meta(narrative).get("condition_schedule_intro")
    return intro.strip() if isinstance(intro, str) and intro.strip() else DEFAULT_CONDITION_SCHEDULE_INTRO


def extract_condition_schedule_rows(narrative: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return validated Appendix 4 rows from report metadata."""
    rows = extract_meta(narrative).get("condition_schedule_rows")
    if not isinstance(rows, list):
        return []

    cleaned: List[Dict[str, Any]] = []
    for raw in rows:
        if not isinstance(raw, dict):
            continue
        row_id = raw.get("id") or raw.get("win_panel")
        if not isinstance(row_id, str) or not row_id.strip():
            continue
        cleaned.append({
            "id": row_id.strip(),
            "elev": str(raw.get("elev") or "").strip(),
            "cond": str(raw.get("cond") or "").strip(),
            "warp": str(raw.get("warp") or "").strip(),
            "lead": str(raw.get("lead") or "").strip(),
            "glass_breaks": str(raw.get("glass_breaks") or raw.get("breaks") or "").strip(),
            "wood_rot": str(raw.get("wood_rot") or "").strip(),
            "paint_caulk": str(raw.get("paint_caulk") or raw.get("paint") or "").strip(),
            "pieces": str(raw.get("pieces") or "").strip(),
            "sqft": str(raw.get("sqft") or "").strip(),
            "notes": str(raw.get("notes") or "").strip(),
            "is_window": bool(raw.get("is_window")),
        })
    return cleaned


def normalize_text_narrative(narrative: Optional[Dict[str, Any]]) -> Dict[str, str]:
    """Flatten legacy or rich narrative payloads into the plain text section map."""
    return {key: extract_section_text(narrative, key) for key in SECTION_KEYS}
