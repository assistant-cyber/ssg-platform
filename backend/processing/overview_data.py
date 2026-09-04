"""Overview and Valuation data aggregation.

Collects all available project data (windows, photos, AI vision analysis,
condition scores, field notes, and estimates) into a structured summary dict
for the AI narrative generation prompt.
"""
from typing import Dict, List, Optional, Any
from sqlalchemy.orm import Session

from app.models import Project, Window, Photo, ConditionData, Estimate


def aggregate_overview_data(project_id: str, db: Session) -> Dict[str, Any]:
    """Build a compact structured summary of all project data.
    
    Args:
        project_id: The project UUID
        db: SQLAlchemy database session
        
    Returns:
        Dict with structure:
        {
            "total_windows": int,
            "total_photos": int,
            "windows": [
                {
                    "number": int,
                    "name": str | None,
                    "notes": str | None,
                    "panes": int | None,
                    "panels": int | None,
                    "sqft": float | None,
                    "pieces": int | None,
                    "max_warping": int | None,
                    "max_lead_det": int | None,
                    "total_breaks": int,
                    "has_wood_rot": bool,
                    "has_paint_fail": bool,
                },
                ...
            ],
            "totals": {
                "total_sqft": float,
                "total_pieces": int,
                "total_panels": int,
                "windows_with_sqft": int,
                "windows_with_pieces": int,
                "windows_with_panels": int,
            },
            "condition_rollup": {
                "avg_warping": float | None,
                "max_warping": int | None,
                "avg_lead_det": float | None,
                "max_lead_det": int | None,
                "total_breaks": int,
                "windows_with_wood_rot": int,
                "windows_with_paint_fail": int,
            },
            "estimate_summary": {
                "total_value": float,
                "line_item_count": int,
            } | None
        }
    """
    windows = db.query(Window).filter(
        Window.project_id == project_id
    ).order_by(Window.sort_order, Window.number).all()
    
    total_photos = db.query(Photo).filter(Photo.project_id == project_id).count()
    
    window_summaries: List[Dict[str, Any]] = []
    
    # Project-level totals
    total_sqft = 0.0
    total_pieces = 0
    total_panels = 0
    windows_with_sqft = 0
    windows_with_pieces = 0
    windows_with_panels = 0
    
    # Condition rollup accumulators
    warping_values: List[int] = []
    lead_det_values: List[int] = []
    total_breaks = 0
    windows_with_wood_rot = 0
    windows_with_paint_fail = 0
    
    for window in windows:
        photos = db.query(Photo).filter(Photo.window_id == window.id).all()
        
        # Aggregate AI vision data and condition scores from photos
        win_panes: Optional[int] = None
        win_panels: Optional[int] = None
        win_sqft: Optional[float] = None
        win_pieces: Optional[int] = None
        win_max_warping: Optional[int] = None
        win_max_lead_det: Optional[int] = None
        win_total_breaks = 0
        win_has_wood_rot = False
        win_has_paint_fail = False
        
        for photo in photos:
            # Staff-edited ai_* fields take priority, then ConditionData fallback
            
            # Panes: use first available ai_panes
            if win_panes is None and photo.ai_panes is not None:
                win_panes = photo.ai_panes
            
            # Panels: use first available ai_panels
            if win_panels is None and photo.ai_panels is not None:
                win_panels = photo.ai_panels
            
            # SqFt: use max ai_sqft across photos
            if photo.ai_sqft is not None:
                if win_sqft is None:
                    win_sqft = photo.ai_sqft
                else:
                    win_sqft = max(win_sqft, photo.ai_sqft)
            
            # Pieces: staff-edited ai_pieces first, then ConditionData.pieces
            if photo.ai_pieces is not None:
                if win_pieces is None:
                    win_pieces = photo.ai_pieces
                else:
                    win_pieces = max(win_pieces, photo.ai_pieces)
            elif photo.condition_data and photo.condition_data.pieces is not None:
                if win_pieces is None:
                    win_pieces = photo.condition_data.pieces
                else:
                    win_pieces = max(win_pieces, photo.condition_data.pieces)
            
            # Condition scores from ConditionData
            if photo.condition_data:
                cd = photo.condition_data
                
                if cd.warping is not None:
                    if win_max_warping is None:
                        win_max_warping = cd.warping
                    else:
                        win_max_warping = max(win_max_warping, cd.warping)
                
                if cd.lead_det is not None:
                    if win_max_lead_det is None:
                        win_max_lead_det = cd.lead_det
                    else:
                        win_max_lead_det = max(win_max_lead_det, cd.lead_det)
                
                if cd.breaks is not None:
                    win_total_breaks += cd.breaks
                
                if cd.wood_rot:
                    win_has_wood_rot = True
                
                if cd.paint_fail:
                    win_has_paint_fail = True
        
        # Build window summary
        window_summary: Dict[str, Any] = {
            "number": window.number,
            "name": window.name,
            "notes": _truncate_notes(window.notes, max_len=200),
            "panes": win_panes,
            "panels": win_panels,
            "sqft": win_sqft,
            "pieces": win_pieces,
            "max_warping": win_max_warping,
            "max_lead_det": win_max_lead_det,
            "total_breaks": win_total_breaks,
            "has_wood_rot": win_has_wood_rot,
            "has_paint_fail": win_has_paint_fail,
        }
        window_summaries.append(window_summary)
        
        # Update project-level totals
        if win_sqft is not None:
            total_sqft += win_sqft
            windows_with_sqft += 1
        
        if win_pieces is not None:
            total_pieces += win_pieces
            windows_with_pieces += 1
        
        if win_panels is not None:
            total_panels += win_panels
            windows_with_panels += 1
        
        # Update condition rollup
        if win_max_warping is not None:
            warping_values.append(win_max_warping)
        
        if win_max_lead_det is not None:
            lead_det_values.append(win_max_lead_det)
        
        total_breaks += win_total_breaks
        
        if win_has_wood_rot:
            windows_with_wood_rot += 1
        
        if win_has_paint_fail:
            windows_with_paint_fail += 1
    
    # Compute condition rollup stats
    condition_rollup: Dict[str, Any] = {
        "avg_warping": sum(warping_values) / len(warping_values) if warping_values else None,
        "max_warping": max(warping_values) if warping_values else None,
        "avg_lead_det": sum(lead_det_values) / len(lead_det_values) if lead_det_values else None,
        "max_lead_det": max(lead_det_values) if lead_det_values else None,
        "total_breaks": total_breaks,
        "windows_with_wood_rot": windows_with_wood_rot,
        "windows_with_paint_fail": windows_with_paint_fail,
    }
    
    # Estimate summary (latest estimate if it exists)
    estimate = db.query(Estimate).filter(
        Estimate.project_id == project_id
    ).order_by(Estimate.created_at.desc()).first()
    
    estimate_summary: Optional[Dict[str, Any]] = None
    if estimate:
        estimate_summary = {
            "total_value": estimate.total_amount or 0.0,
            "line_item_count": len(estimate.line_items) if estimate.line_items else 0,
        }
    
    return {
        "total_windows": len(windows),
        "total_photos": total_photos,
        "windows": window_summaries,
        "totals": {
            "total_sqft": round(total_sqft, 1),
            "total_pieces": total_pieces,
            "total_panels": total_panels,
            "windows_with_sqft": windows_with_sqft,
            "windows_with_pieces": windows_with_pieces,
            "windows_with_panels": windows_with_panels,
        },
        "condition_rollup": condition_rollup,
        "estimate_summary": estimate_summary,
    }


def _truncate_notes(text: Optional[str], max_len: int = 200) -> Optional[str]:
    """Truncate notes to max_len characters, adding ellipsis if truncated."""
    if not text:
        return None
    text = text.strip()
    if len(text) <= max_len:
        return text
    return text[:max_len - 3] + "..."
