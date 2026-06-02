#!/usr/bin/env python3
"""
SSG Platform — Proposal PDF Generator (v2)
==========================================
Produces a beautiful, fully-branded restoration proposal after a customer
accepts an estimate.  Uses ReportLab + Pillow — no external dependencies.

Structure:
  1. Cover page    — full-bleed project photo (or SSG green) + church name
  2. Intro page    — "Prepared for" block, date, SSG contact
  3. Assessment    — executive summary from narrative
  4. Photo gallery — 2-column grid, best 4–6 photos
  5. Scope of work — estimate line items as service descriptions
  6. Investment    — estimate table, grand total
  7. About SSG     — credentials, guarantee, contact
  8. Next steps    — acceptance confirmation + signature block

Entry point:
    generate_proposal_pdf(project, estimate, photos, narrative, output_path)

    project  : dict  — name, church_name, address_street/city/state, assess_date
    estimate : dict  — total_amount, notes, line_items [{description,qty,unit,unit_price,total}]
    photos   : list  — [{local_path, filename, window_number, panel_letter, notes}]
    narrative: dict  — {overview, current_condition, causes, hundred_year_plan, summary}
    output_path: str
"""

import io
import os
import re
import tempfile
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import requests
from PIL import Image as PILImage
from reportlab.lib.colors import Color, HexColor, black, white
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, Image, KeepTogether,
    NextPageTemplate, PageBreak, PageTemplate, Paragraph,
    Spacer, Table, TableStyle,
)

from processing.report_payload import normalize_text_narrative

# ── Brand palette ─────────────────────────────────────────────────────────────
SSG_GREEN    = HexColor("#83A94B")
SSG_DARK     = HexColor("#5B7A35")
SSG_LIGHT    = HexColor("#E8F0DC")
CHARCOAL     = HexColor("#2C2C2C")
WARM_GRAY    = HexColor("#6B6B6B")
LIGHT_GRAY   = HexColor("#E5E5E5")
CREAM        = HexColor("#FAFAF7")
WHITE_COLOR  = HexColor("#FFFFFF")
DARK_OVERLAY = Color(0, 0, 0, alpha=0.55)   # for cover photo overlay

PAGE_W, PAGE_H = letter   # 612 × 792 pts


# ── Helper: download or copy a photo to a local temp file ────────────────────

def _resolve_photo(path_or_url: str, tmpdir: str, idx: int) -> Optional[str]:
    """Return a local file path for a photo, downloading if necessary."""
    if not path_or_url:
        return None
    if path_or_url.startswith("http"):
        try:
            r = requests.get(path_or_url, timeout=15)
            r.raise_for_status()
            ext = ".jpg"
            ct = r.headers.get("content-type", "")
            if "png" in ct:
                ext = ".png"
            out = os.path.join(tmpdir, f"photo_{idx:03d}{ext}")
            with open(out, "wb") as f:
                f.write(r.content)
            return out
        except Exception as e:
            print(f"  Warning: could not download photo {path_or_url}: {e}")
            return None
    if os.path.exists(path_or_url):
        return path_or_url
    return None


def _best_cover_photo(photos: List[Dict], tmpdir: str) -> Optional[str]:
    """Pick the best cover photo — prefer overall window shots, then first."""
    ordered = sorted(photos, key=lambda p: (
        0 if not p.get("panel_letter") else 1,   # overall shots first
        p.get("sort_order", 999),
    ))
    for i, p in enumerate(ordered[:6]):
        local = _resolve_photo(p.get("local_path") or p.get("storage_url", ""), tmpdir, i)
        if local:
            return local
    return None


def _select_gallery_photos(photos: List[Dict], tmpdir: str, count: int = 6) -> List[Tuple[str, str]]:
    """Return list of (local_path, caption) for up to `count` photos."""
    out = []
    seen_windows = set()
    # Prefer one photo per window for variety
    for p in photos:
        win = p.get("window_number")
        if win and win in seen_windows:
            continue
        local = _resolve_photo(p.get("local_path") or p.get("storage_url", ""), tmpdir, len(out))
        if local:
            label = f"Window {win}" if win else (p.get("filename", "").split(".")[0] or "Photo")
            if p.get("panel_letter"):
                label += f" — Panel {p['panel_letter']}"
            out.append((local, label))
            if win:
                seen_windows.add(win)
        if len(out) >= count:
            break
    return out


# ── Custom flowables ──────────────────────────────────────────────────────────

class GreenRule(Flowable):
    def __init__(self, width, thickness=1.5):
        super().__init__()
        self.width = width
        self.height = thickness + 4
        self.thickness = thickness

    def draw(self):
        self.canv.setStrokeColor(SSG_GREEN)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, 2, self.width, 2)


class DarkBar(Flowable):
    def __init__(self, width, height=6):
        super().__init__()
        self.width = width
        self.height = height

    def draw(self):
        self.canv.setFillColor(SSG_GREEN)
        self.canv.rect(0, 0, self.width, self.height, fill=1, stroke=0)


class TwoPhotoRow(Flowable):
    """Two photos side by side with captions."""
    def __init__(self, img1, cap1, img2, cap2, total_width):
        super().__init__()
        self.gap = 12
        self.photo_w = (total_width - self.gap) / 2
        self.photo_h = self.photo_w * 0.67
        self.img1, self.cap1 = img1, cap1
        self.img2, self.cap2 = img2, cap2
        self.width = total_width
        self.height = self.photo_h + 22

    def _draw_one(self, img_path, x, caption):
        try:
            self.canv.drawImage(
                img_path, x, 18,
                width=self.photo_w, height=self.photo_h,
                preserveAspectRatio=True, mask="auto",
            )
        except Exception:
            self.canv.setFillColor(SSG_LIGHT)
            self.canv.rect(x, 18, self.photo_w, self.photo_h, fill=1, stroke=0)
        self.canv.setFont("Times-Italic", 8)
        self.canv.setFillColor(SSG_GREEN)
        self.canv.drawString(x + 2, 5, caption[:55])

    def draw(self):
        self._draw_one(self.img1, 0, self.cap1)
        if self.img2:
            self._draw_one(self.img2, self.photo_w + self.gap, self.cap2)


# ── Page background callbacks ─────────────────────────────────────────────────

def _cover_page_bg(c: rl_canvas.Canvas, doc):
    """Cover page — full-bleed photo (if available) with dark overlay."""
    c.saveState()
    cover_img = getattr(doc, "_cover_image", None)

    if cover_img and os.path.exists(cover_img):
        try:
            # Full-bleed photo
            c.drawImage(cover_img, 0, 0, width=PAGE_W, height=PAGE_H,
                        preserveAspectRatio=False, mask="auto")
            # Dark overlay
            c.setFillColor(Color(0, 0, 0, alpha=0.58))
            c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        except Exception:
            c.setFillColor(SSG_DARK)
            c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    else:
        # Fallback: SSG dark green solid
        c.setFillColor(SSG_DARK)
        c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        # Subtle texture: light green corner block
        c.setFillColor(SSG_GREEN)
        c.rect(0, 0, PAGE_W * 0.4, 8, fill=1, stroke=0)

    # Bottom green bar
    c.setFillColor(SSG_GREEN)
    c.rect(0, 0, PAGE_W, 8, fill=1, stroke=0)

    c.restoreState()


def _make_interior_bg(church_name: str, doc_date: str):
    def _bg(c: rl_canvas.Canvas, doc):
        c.saveState()
        # Header: church name left, date right, green rule below
        c.setFont("Times-Roman", 8)
        c.setFillColor(WARM_GRAY)
        c.drawString(doc.leftMargin, PAGE_H - 34, f"{church_name} — Restoration Proposal")
        c.drawRightString(PAGE_W - doc.rightMargin, PAGE_H - 34, doc_date)
        c.setStrokeColor(SSG_GREEN)
        c.setLineWidth(1.5)
        c.line(doc.leftMargin, PAGE_H - 40, PAGE_W - doc.rightMargin, PAGE_H - 40)
        # Footer
        c.setFillColor(SSG_GREEN)
        c.rect(0, 0, PAGE_W, 8, fill=1, stroke=0)
        # Page number
        c.setFont("Times-Roman", 8)
        c.setFillColor(WARM_GRAY)
        c.drawCentredString(PAGE_W / 2, 14, str(c.getPageNumber()))
        c.restoreState()
    return _bg


# ── Styles ────────────────────────────────────────────────────────────────────

def _build_styles():
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle("CoverTitle",
        fontName="Times-Bold", fontSize=36, textColor=WHITE_COLOR,
        alignment=TA_LEFT, leading=42, spaceAfter=8))
    styles.add(ParagraphStyle("CoverSubtitle",
        fontName="Times-Italic", fontSize=16, textColor=SSG_GREEN,
        alignment=TA_LEFT, leading=22, spaceAfter=6))
    styles.add(ParagraphStyle("CoverMeta",
        fontName="Times-Roman", fontSize=11, textColor=WHITE_COLOR,
        alignment=TA_LEFT, leading=16, spaceAfter=4, alpha=0.8))

    styles.add(ParagraphStyle("SectionTitle",
        fontName="Times-Bold", fontSize=20, textColor=SSG_DARK,
        spaceBefore=6, spaceAfter=6, leading=24))
    styles.add(ParagraphStyle("SectionSubtitle",
        fontName="Times-Italic", fontSize=11, textColor=WARM_GRAY,
        spaceBefore=0, spaceAfter=10, leading=14))
    styles.add(ParagraphStyle("Body",
        fontName="Times-Roman", fontSize=10.5, textColor=CHARCOAL,
        spaceBefore=4, spaceAfter=8, leading=15, alignment=TA_JUSTIFY))
    styles.add(ParagraphStyle("BoldLabel",
        fontName="Times-Bold", fontSize=11, textColor=SSG_DARK,
        spaceBefore=10, spaceAfter=4))
    styles.add(ParagraphStyle("SmallMeta",
        fontName="Times-Roman", fontSize=9, textColor=WARM_GRAY,
        spaceBefore=2, spaceAfter=4, leading=13))
    styles.add(ParagraphStyle("Caption",
        fontName="Times-Italic", fontSize=9, textColor=SSG_GREEN,
        spaceBefore=2, spaceAfter=8, alignment=TA_LEFT))
    styles.add(ParagraphStyle("PreparedFor",
        fontName="Times-Bold", fontSize=24, textColor=SSG_DARK,
        spaceBefore=0, spaceAfter=6, leading=30))
    styles.add(ParagraphStyle("CompanyName",
        fontName="Times-Bold", fontSize=14, textColor=SSG_DARK,
        spaceBefore=8, spaceAfter=2))
    styles.add(ParagraphStyle("ContactInfo",
        fontName="Times-Roman", fontSize=10, textColor=WARM_GRAY,
        spaceBefore=1, spaceAfter=2))
    styles.add(ParagraphStyle("ScopeItem",
        fontName="Times-Roman", fontSize=10.5, textColor=CHARCOAL,
        spaceBefore=3, spaceAfter=3, leading=15, leftIndent=18))
    styles.add(ParagraphStyle("ScopeSection",
        fontName="Times-Bold", fontSize=12, textColor=SSG_DARK,
        spaceBefore=10, spaceAfter=4, leftIndent=0))
    styles.add(ParagraphStyle("Guarantee",
        fontName="Times-Italic", fontSize=10, textColor=WARM_GRAY,
        spaceBefore=4, spaceAfter=4, leading=14, alignment=TA_JUSTIFY))

    return styles


# ── Cover page ────────────────────────────────────────────────────────────────

def _build_cover(story, project, date_str, styles, content_width):
    # Pull down from top for dramatic effect
    story.append(Spacer(1, PAGE_H * 0.38))
    story.append(GreenRule(content_width, thickness=1.5))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Restoration Proposal", styles["CoverSubtitle"]))
    story.append(Paragraph(
        project.get("church_name") or project.get("name", "Assessment"),
        styles["CoverTitle"]
    ))

    addr_parts = filter(None, [
        project.get("address_street"),
        project.get("address_city"),
        project.get("address_state"),
    ])
    addr = ", ".join(addr_parts)
    if addr:
        story.append(Paragraph(addr, styles["CoverMeta"]))

    story.append(Spacer(1, 4))
    story.append(Paragraph(
        f"Prepared by Scottish Stained Glass  ·  {date_str}",
        ParagraphStyle("CoverDate", fontName="Times-Roman", fontSize=10,
                       textColor=WHITE_COLOR, opacity=0.65)
    ))


# ── Intro / Prepared-for page ─────────────────────────────────────────────────

def _build_intro(story, project, date_str, styles, content_width):
    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph("Restoration Proposal", styles["SectionSubtitle"]))
    story.append(Paragraph(
        project.get("church_name") or project.get("name", ""),
        styles["PreparedFor"]
    ))

    addr_parts = list(filter(None, [
        project.get("address_street"),
        project.get("address_city"),
        project.get("address_state"),
    ]))
    if addr_parts:
        story.append(Paragraph(", ".join(addr_parts), styles["SmallMeta"]))

    story.append(GreenRule(content_width))
    story.append(Spacer(1, 0.2 * inch))

    # Two-column info block
    col_data = [
        [
            Paragraph("<b>Prepared By</b>", styles["SmallMeta"]),
            Paragraph("<b>Date</b>", styles["SmallMeta"]),
        ],
        [
            Paragraph("Scottish Stained Glass", styles["Body"]),
            Paragraph(date_str, styles["Body"]),
        ],
        [
            Paragraph("Stained Glass Restoration Specialists", styles["SmallMeta"]),
            Paragraph("", styles["SmallMeta"]),
        ],
    ]
    tbl = Table(col_data, colWidths=[content_width * 0.6, content_width * 0.4])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SSG_LIGHT),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [SSG_LIGHT, WHITE_COLOR, WHITE_COLOR]),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 0.25 * inch))

    story.append(Paragraph(
        "Dear Friends,",
        ParagraphStyle("Salutation", fontName="Times-Italic", fontSize=12,
                       textColor=SSG_DARK, spaceBefore=6, spaceAfter=10)
    ))
    story.append(Paragraph(
        "Thank you for inviting Scottish Stained Glass to assess your beautiful windows. "
        "We have prepared this proposal to outline our findings, recommended scope of work, "
        "and investment for restoring and preserving your stained glass for generations to come. "
        "Our team brings decades of specialized experience to every project, "
        "and we are honored to be considered for this work.",
        styles["Body"]
    ))
    story.append(Paragraph(
        "The following pages detail our assessment, the proposed scope of work, "
        "and a transparent breakdown of the investment required. "
        "Please don't hesitate to contact us with any questions.",
        styles["Body"]
    ))


# ── Assessment summary ────────────────────────────────────────────────────────

def _build_assessment(story, narrative, styles, content_width):
    story.append(PageBreak())
    story.append(Paragraph("Assessment Summary", styles["SectionTitle"]))
    story.append(GreenRule(content_width))
    story.append(Spacer(1, 0.15 * inch))

    sections = [
        ("Overview & Valuation",       narrative.get("overview", "")),
        ("Current Condition",          narrative.get("current_condition", "")),
        ("Causes of Deterioration",    narrative.get("causes", "")),
        ("100-Year Restoration Plan",  narrative.get("hundred_year_plan", "")),
    ]

    placeholder = (
        "Our team conducted a thorough on-site assessment of the stained glass windows. "
        "Detailed findings are documented in the full assessment report, available upon request."
    )

    for section_title, text in sections:
        if text and text.strip():
            story.append(Paragraph(section_title, styles["BoldLabel"]))
            for para in text.strip().split("\n\n"):
                if para.strip():
                    story.append(Paragraph(para.strip(), styles["Body"]))
            story.append(Spacer(1, 0.1 * inch))

    if not any(v for _, v in sections if v and v.strip()):
        story.append(Paragraph(placeholder, styles["Body"]))


# ── Photo gallery ─────────────────────────────────────────────────────────────

def _build_gallery(story, gallery_photos, styles, content_width):
    if not gallery_photos:
        return

    story.append(PageBreak())
    story.append(Paragraph("Photo Documentation", styles["SectionTitle"]))
    story.append(GreenRule(content_width))
    story.append(Spacer(1, 0.15 * inch))
    story.append(Paragraph(
        "The following photographs were taken during the on-site assessment, "
        "documenting the current condition of each window.",
        styles["Body"]
    ))
    story.append(Spacer(1, 0.15 * inch))

    # Pair up photos for 2-column layout
    pairs = [(gallery_photos[i], gallery_photos[i + 1] if i + 1 < len(gallery_photos) else (None, ""))
             for i in range(0, len(gallery_photos), 2)]

    for (img1, cap1), (img2, cap2) in pairs:
        row = TwoPhotoRow(img1, cap1, img2 or img1, cap2, content_width)
        story.append(row)
        story.append(Spacer(1, 0.15 * inch))


# ── Scope of work ─────────────────────────────────────────────────────────────

def _build_scope(story, estimate, styles, content_width):
    story.append(PageBreak())
    story.append(Paragraph("Scope of Work", styles["SectionTitle"]))
    story.append(GreenRule(content_width))
    story.append(Spacer(1, 0.15 * inch))
    story.append(Paragraph(
        "The following services are included in this proposal, as agreed upon in the accepted estimate.",
        styles["Body"]
    ))
    story.append(Spacer(1, 0.1 * inch))

    if not estimate:
        story.append(Paragraph(
            "• Full stained glass assessment and restoration per our findings.",
            styles["ScopeItem"]
        ))
        return

    for item in estimate.get("line_items", []):
        desc = item.get("description", "")
        if not desc:
            continue

        # Section header (encoded as ##Section or unit=§section)
        if item.get("unit") == "§section" or desc.startswith("##"):
            clean = desc[2:] if desc.startswith("##") else desc
            story.append(Paragraph(clean, styles["ScopeSection"]))
        else:
            qty  = item.get("quantity", 1)
            unit = item.get("unit") or ""
            qty_str = f"{qty:g} {unit}".strip() if unit and qty != 1 else ""
            bullet = f"• {desc}" + (f" <font color='#718096' size='9'>({qty_str})</font>" if qty_str else "")
            story.append(Paragraph(bullet, styles["ScopeItem"]))


# ── Investment summary ────────────────────────────────────────────────────────

def _build_investment(story, estimate, styles, content_width):
    story.append(PageBreak())
    story.append(Paragraph("Investment Summary", styles["SectionTitle"]))
    story.append(GreenRule(content_width))
    story.append(Spacer(1, 0.15 * inch))

    if not estimate:
        story.append(Paragraph("Investment details are outlined in the separate estimate document.", styles["Body"]))
        return

    # Table data
    col_widths = [content_width * 0.50, content_width * 0.15,
                  content_width * 0.15, content_width * 0.20]
    header = [
        Paragraph("<b>Description</b>", styles["SmallMeta"]),
        Paragraph("<b>Qty</b>",          styles["SmallMeta"]),
        Paragraph("<b>Unit</b>",          styles["SmallMeta"]),
        Paragraph("<b>Amount</b>",        styles["SmallMeta"]),
    ]
    rows = [header]

    total = 0.0
    for item in estimate.get("line_items", []):
        desc = item.get("description", "")
        if not desc:
            continue
        if item.get("unit") == "§section" or desc.startswith("##"):
            clean = desc[2:] if desc.startswith("##") else desc
            rows.append([
                Paragraph(f"<b>{clean}</b>",
                          ParagraphStyle("TblSection", fontName="Helvetica-Bold",
                                         fontSize=9, textColor=SSG_DARK)),
                Paragraph("", styles["SmallMeta"]),
                Paragraph("", styles["SmallMeta"]),
                Paragraph("", styles["SmallMeta"]),
            ])
            continue

        item_total = (item.get("quantity") or 0) * (item.get("unit_price") or 0)
        total += item_total
        rows.append([
            Paragraph(desc, styles["SmallMeta"]),
            Paragraph(str(item.get("quantity", "")), styles["SmallMeta"]),
            Paragraph(item.get("unit") or "", styles["SmallMeta"]),
            Paragraph(f"${item_total:,.2f}", styles["SmallMeta"]),
        ])

    # Grand total row
    api_total = estimate.get("total_amount") or total
    rows.append([
        Paragraph("<b>Total Investment</b>",
                  ParagraphStyle("TblTotal", fontName="Times-Bold", fontSize=12,
                                 textColor=WHITE_COLOR)),
        Paragraph("", styles["SmallMeta"]),
        Paragraph("", styles["SmallMeta"]),
        Paragraph(f"<b>${api_total:,.2f}</b>",
                  ParagraphStyle("TblTotalAmt", fontName="Times-Bold", fontSize=13,
                                 textColor=SSG_GREEN, alignment=TA_LEFT)),
    ])

    tbl = Table(rows, colWidths=col_widths)
    last = len(rows) - 1
    tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0),      (-1, 0),     SSG_DARK),
        ("TEXTCOLOR",    (0, 0),      (-1, 0),     white),
        ("ROWBACKGROUNDS", (0, 1),    (-1, last - 1), [WHITE_COLOR, SSG_LIGHT]),
        ("BACKGROUND",   (0, last),   (-1, last),  SSG_DARK),
        ("TOPPADDING",   (0, 0),      (-1, -1),    6),
        ("BOTTOMPADDING",(0, 0),      (-1, -1),    6),
        ("LEFTPADDING",  (0, 0),      (-1, -1),    8),
        ("RIGHTPADDING", (0, 0),      (-1, -1),    8),
        ("LINEBELOW",    (0, 0),      (-1, -2),    0.5, LIGHT_GRAY),
        ("ALIGN",        (3, 0),      (3, -1),     "LEFT"),
    ]))
    story.append(tbl)

    if estimate.get("notes"):
        story.append(Spacer(1, 0.2 * inch))
        story.append(Paragraph("<b>Notes</b>", styles["BoldLabel"]))
        story.append(Paragraph(estimate["notes"], styles["Body"]))


# ── About SSG ─────────────────────────────────────────────────────────────────

def _build_about(story, styles, content_width):
    story.append(PageBreak())
    story.append(Paragraph("About Scottish Stained Glass", styles["SectionTitle"]))
    story.append(GreenRule(content_width))
    story.append(Spacer(1, 0.15 * inch))

    story.append(Paragraph(
        "Scottish Stained Glass is a family-owned stained glass studio and restoration company "
        "with decades of experience preserving the artistic and spiritual heritage of churches "
        "and historic buildings across the United States. Our artisans are trained in traditional "
        "European techniques while employing modern conservation standards.",
        styles["Body"]
    ))

    credentials = [
        ("Our Commitment", (
            "Every project we undertake receives the same level of care and craftsmanship we would "
            "apply to our own family heritage. We work closely with church committees, preservation "
            "societies, and architectural historians to ensure our restorations honor the original "
            "artistic intent."
        )),
        ("Our Guarantee", (
            "All restoration work completed by Scottish Stained Glass is guaranteed for a period of "
            "one year from completion. This covers workmanship defects and material failure under "
            "normal conditions. We stand behind every panel we touch."
        )),
        ("Conservation Standards", (
            "Our team follows American Institute for Conservation (AIC) guidelines and uses only "
            "conservation-grade materials including authentic lead came, hand-blown art glass, "
            "and UV-stable sealants. We document all work with before-and-after photography."
        )),
    ]

    for title, text in credentials:
        story.append(Paragraph(title, styles["BoldLabel"]))
        story.append(Paragraph(text, styles["Guarantee"]))
        story.append(Spacer(1, 0.05 * inch))

    # Contact block
    story.append(Spacer(1, 0.2 * inch))
    story.append(GreenRule(content_width))
    story.append(Spacer(1, 0.1 * inch))
    story.append(Paragraph("Scottish Stained Glass", styles["CompanyName"]))
    for line in [
        "Stained Glass Restoration Specialists",
        "www.scottishstainedglass.com",
        "info@scottishstainedglass.com",
    ]:
        story.append(Paragraph(line, styles["ContactInfo"]))


# ── Signature / next steps ────────────────────────────────────────────────────

def _build_signature(story, project, date_str, styles, content_width):
    story.append(PageBreak())
    story.append(Paragraph("Acceptance & Next Steps", styles["SectionTitle"]))
    story.append(GreenRule(content_width))
    story.append(Spacer(1, 0.15 * inch))

    church = project.get("church_name") or project.get("name", "")

    story.append(Paragraph(
        f"This proposal has been accepted by {church}. "
        "Thank you for choosing Scottish Stained Glass. "
        "A member of our team will contact you within 2 business days to schedule "
        "an initial consultation and review the project timeline.",
        styles["Body"]
    ))
    story.append(Spacer(1, 0.3 * inch))

    # Signature table
    sig_data = [
        [
            Paragraph("<b>Accepted by</b>", styles["SmallMeta"]),
            Paragraph("<b>Date</b>", styles["SmallMeta"]),
            Paragraph("<b>On behalf of SSG</b>", styles["SmallMeta"]),
        ],
        [
            Paragraph(" ", styles["Body"]),
            Paragraph(date_str, styles["Body"]),
            Paragraph("Scottish Stained Glass", styles["Body"]),
        ],
        [
            Paragraph("_" * 30, styles["SmallMeta"]),
            Paragraph("_" * 16, styles["SmallMeta"]),
            Paragraph("_" * 28, styles["SmallMeta"]),
        ],
        [
            Paragraph(church, styles["SmallMeta"]),
            Paragraph("", styles["SmallMeta"]),
            Paragraph("Authorized Representative", styles["SmallMeta"]),
        ],
    ]
    sig_tbl = Table(sig_data, colWidths=[content_width * 0.38, content_width * 0.22, content_width * 0.40])
    sig_tbl.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
        ("LINEABOVE",     (0, 2), (-1, 2),  0.5, LIGHT_GRAY),
    ]))
    story.append(sig_tbl)

    story.append(Spacer(1, 0.4 * inch))
    story.append(Paragraph(
        "This proposal is valid for 90 days from the date of preparation. "
        "Scottish Stained Glass reserves the right to re-evaluate pricing after this period.",
        ParagraphStyle("Fine", fontName="Times-Italic", fontSize=8.5,
                       textColor=WARM_GRAY, alignment=TA_CENTER)
    ))


# ── Main entry point ──────────────────────────────────────────────────────────

def generate_proposal_pdf(
    project: Dict,
    estimate: Optional[Dict],
    output_path: str,
    photos: Optional[List[Dict]] = None,
    narrative: Optional[Dict] = None,
) -> str:
    """
    Generate a beautiful branded proposal PDF.

    Args:
        project:     dict — name, church_name, address_street/city/state
        estimate:    dict — total_amount, notes, line_items
        output_path: where to write the PDF
        photos:      list of photo dicts with local_path/storage_url
        narrative:   dict with overview/current_condition/causes/hundred_year_plan/summary
    Returns:
        output_path
    """
    photos    = photos or []
    narrative = normalize_text_narrative(narrative or {})

    date_str = datetime.now().strftime("%B %d, %Y")
    church   = project.get("church_name") or project.get("name", "")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    with tempfile.TemporaryDirectory() as tmpdir:
        # Resolve photos
        cover_image   = _best_cover_photo(photos, tmpdir) if photos else None
        gallery_photos = _select_gallery_photos(photos, tmpdir, 6) if photos else []

        styles       = _build_styles()
        margin       = 0.85 * inch
        content_width = PAGE_W - 2 * margin

        doc = BaseDocTemplate(
            output_path,
            pagesize=letter,
            leftMargin=margin,
            rightMargin=margin,
            topMargin=0.6 * inch,
            bottomMargin=0.55 * inch,
        )

        # Attach cover image to doc so page callback can access it
        doc._cover_image = cover_image

        cover_frame   = Frame(margin, 0.5 * inch, content_width, PAGE_H - 1.1 * inch, id="cover")
        content_frame = Frame(margin, 0.5 * inch, content_width, PAGE_H - 1.4 * inch, id="content")

        interior_bg = _make_interior_bg(church, date_str)

        doc.addPageTemplates([
            PageTemplate(id="cover",   frames=[cover_frame],   onPage=_cover_page_bg),
            PageTemplate(id="content", frames=[content_frame], onPage=interior_bg),
        ])

        story = []

        # 1. Cover
        _build_cover(story, project, date_str, styles, content_width)
        story.append(NextPageTemplate("content"))
        story.append(PageBreak())

        # 2. Intro
        _build_intro(story, project, date_str, styles, content_width)

        # 3. Assessment summary
        _build_assessment(story, narrative, styles, content_width)

        # 4. Photo gallery
        _build_gallery(story, gallery_photos, styles, content_width)

        # 5. Scope of work
        _build_scope(story, estimate, styles, content_width)

        # 6. Investment
        _build_investment(story, estimate, styles, content_width)

        # 7. About SSG
        _build_about(story, styles, content_width)

        # 8. Signature
        _build_signature(story, project, date_str, styles, content_width)

        doc.build(story)

    size_kb = os.path.getsize(output_path) / 1024
    print(f"  Proposal PDF → {output_path} ({size_kb:.0f} KB)")
    return output_path
