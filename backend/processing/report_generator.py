"""
Scottish Stained Glass report PDF generator.

This module keeps the existing report structure and content flow intact while
upgrading the visual presentation of the generated assessment PDF.
"""

import os
import re
from typing import Any, Dict, List, Optional

from PIL import Image as PILImage
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    Image,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from processing.report_payload import (
    DEFAULT_CONDITION_SCHEDULE_INTRO,
    DEFAULT_CONDITION_SCHEDULE_TITLE,
    extract_condition_schedule_intro,
    extract_condition_schedule_rows,
    extract_condition_schedule_title,
    extract_cover_photo_id,
    extract_section_photo_ids,
    normalize_text_narrative,
)


SCOTTISH_GREEN = HexColor("#72B034")
FADE_GREEN = HexColor("#C5D9B0")
CHARCOAL = HexColor("#2C2C2C")
WARM_GRAY = HexColor("#666666")
MID_GRAY = HexColor("#888888")
LIGHT_GRAY = HexColor("#DDDDDD")
PALE_GRAY = HexColor("#EEEEEE")
PALE_ROW = HexColor("#F9F9F9")
BODY_TINT = HexColor("#F2F7EE")
LIGHT_YELLOW = HexColor("#FEF9E7")
LIGHT_RED = HexColor("#FDE8E8")
GOOD_GREEN = HexColor("#3A7D0A")
AMBER = HexColor("#B8860B")
ALERT_RED = HexColor("#CC0000")

PAGE_W, PAGE_H = letter
FOOTER_BAR_HEIGHT = 12
REPORT_LOGO_COLOR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "dashboard",
    "public",
    "brand",
    "ssg-logo-color.png",
)


def _register_fonts() -> None:
    font_map = {
        "Georgia": "/System/Library/Fonts/Supplemental/Georgia.ttf",
        "Georgia-Bold": "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
        "Georgia-Italic": "/System/Library/Fonts/Supplemental/Georgia Italic.ttf",
        "Georgia-BoldItalic": "/System/Library/Fonts/Supplemental/Georgia Bold Italic.ttf",
    }
    for name, path in font_map.items():
        if name not in pdfmetrics.getRegisteredFontNames() and os.path.exists(path):
            pdfmetrics.registerFont(TTFont(name, path))


_register_fonts()

DISPLAY_FONT = "Georgia" if "Georgia" in pdfmetrics.getRegisteredFontNames() else "Times-Roman"
DISPLAY_BOLD = "Georgia-Bold" if "Georgia-Bold" in pdfmetrics.getRegisteredFontNames() else "Times-Bold"
DISPLAY_ITALIC = "Georgia-Italic" if "Georgia-Italic" in pdfmetrics.getRegisteredFontNames() else "Times-Italic"
BODY_FONT = "Helvetica"
BODY_BOLD = "Helvetica-Bold"
BODY_ITALIC = "Helvetica-Oblique"


class GreenRule(Flowable):
    def __init__(self, width: float, thickness: float = 1.5, color=SCOTTISH_GREEN):
        Flowable.__init__(self)
        self.width = width
        self.height = thickness + 4
        self.thickness = thickness
        self.color = color

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, 2, self.width, 2)


class TaperedRule(Flowable):
    def __init__(self, width: float):
        Flowable.__init__(self)
        self.width = width
        self.height = 10

    def draw(self):
        green_width = self.width * 0.6
        self.canv.setStrokeColor(SCOTTISH_GREEN)
        self.canv.setLineWidth(1.5)
        self.canv.line(0, 6, green_width, 6)
        self.canv.setStrokeColor(FADE_GREEN)
        self.canv.setLineWidth(0.75)
        self.canv.line(green_width, 6, self.width, 6)


class HeroImageWithFade(Flowable):
    def __init__(self, img_path: str, width: float, max_height: float):
        Flowable.__init__(self)
        self.img_path = img_path
        self.width = width
        self.max_height = max_height
        self.img_w = width
        self.img_h = max_height
        self.height = max_height
        self._calc_size()

    def _calc_size(self):
        try:
            img = PILImage.open(self.img_path)
            iw, ih = img.size
            ratio = min(self.width / iw, self.max_height / ih)
            self.img_w = iw * ratio
            self.img_h = ih * ratio
            self.height = self.img_h
        except Exception:
            self.img_w = self.width
            self.img_h = self.max_height * 0.7
            self.height = self.img_h

    def draw(self):
        x = (self.width - self.img_w) / 2
        try:
            self.canv.drawImage(
                self.img_path,
                x,
                0,
                width=self.img_w,
                height=self.img_h,
                preserveAspectRatio=True,
                mask="auto",
            )
        except Exception:
            self.canv.setFillColor(LIGHT_GRAY)
            self.canv.rect(x, 0, self.img_w, self.img_h, fill=1, stroke=0)

        fade_h = min(72, self.img_h * 0.32)
        if hasattr(self.canv, "setFillAlpha"):
            step_h = fade_h / 10.0
            for step in range(10):
                self.canv.saveState()
                self.canv.setFillAlpha((step + 1) / 10.0 * 0.18)
                self.canv.setFillColor(white)
                self.canv.rect(x, step * step_h, self.img_w, step_h + 1, fill=1, stroke=0)
                self.canv.restoreState()
        else:
            self.canv.setFillColor(white)
            self.canv.rect(x, 0, self.img_w, fade_h * 0.75, fill=1, stroke=0)


class PhotoWithCaption(Flowable):
    def __init__(self, img_path: str, caption: str, window_ref: str, max_width: float, max_height: float):
        Flowable.__init__(self)
        self.img_path = img_path
        self.caption = caption
        self.window_ref = window_ref
        self.max_width = max_width
        self.max_height = max_height
        self.img_w = max_width
        self.img_h = max_height
        self.width = max_width
        self.height = max_height + 34
        self._calc_size()

    def _calc_size(self):
        try:
            img = PILImage.open(self.img_path)
            iw, ih = img.size
            ratio = min(self.max_width * 0.65 / iw, self.max_height / ih)
            self.img_w = iw * ratio
            self.img_h = ih * ratio
        except Exception:
            self.img_w = self.max_width * 0.65
            self.img_h = self.max_height * 0.72

    def draw(self):
        x = (self.max_width - self.img_w) / 2
        y = 18
        if hasattr(self.canv, "setFillAlpha"):
            self.canv.saveState()
            self.canv.setFillAlpha(0.10)
            self.canv.setFillColor(black)
            self.canv.rect(x + 2, y - 3, self.img_w, self.img_h, fill=1, stroke=0)
            self.canv.restoreState()
        try:
            self.canv.drawImage(
                self.img_path,
                x,
                y,
                width=self.img_w,
                height=self.img_h,
                preserveAspectRatio=True,
                mask="auto",
            )
        except Exception:
            self.canv.setFillColor(LIGHT_GRAY)
            self.canv.rect(x, y, self.img_w, self.img_h, fill=1, stroke=0)
        self.canv.setStrokeColor(LIGHT_GRAY)
        self.canv.setLineWidth(1)
        self.canv.rect(x, y, self.img_w, self.img_h, fill=0, stroke=1)

        caption = sanitize_inline_text(self.caption)
        if self.window_ref:
            caption = f"{caption}: {sanitize_inline_text(self.window_ref)}"
        self.canv.setFillColor(SCOTTISH_GREEN)
        self.canv.setFont(DISPLAY_ITALIC, 9)
        self.canv.drawCentredString(self.max_width / 2, 4, caption[:110])


def fit_image_to_box(img_path: str, max_width: float, max_height: float) -> tuple[float, float]:
    try:
        with PILImage.open(img_path) as img:
            iw, ih = img.size
        ratio = min(max_width / float(iw), max_height / float(ih))
        return iw * ratio, ih * ratio
    except Exception:
        return max_width, max_height


def sanitize_inline_text(text: str) -> str:
    cleaned = (text or "").replace("—", ": ").replace("–", ": ").replace("!", ".")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    cleaned = re.sub(r"\.\.+", ".", cleaned)
    cleaned = re.sub(r":\s*:\s*", ": ", cleaned)
    return cleaned


def sanitize_body_text(text: str) -> str:
    cleaned = sanitize_inline_text(text)
    cleaned = re.sub(r"\s+\.", ".", cleaned)
    return cleaned


def split_numbered_items(text: str):
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    if len(paragraphs) <= 2:
        lines = text.strip().split("\n")
        paragraphs = []
        current = []
        for line in lines:
            if re.match(r"^\d+[\.)]\s", line.strip()) and current:
                paragraphs.append("\n".join(current))
                current = [line]
            else:
                current.append(line)
        if current:
            paragraphs.append("\n".join(current))

    prose, numbered = [], []
    in_numbered = False
    for paragraph in paragraphs:
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        if re.match(r"^\d+[\.)]\s", paragraph):
            in_numbered = True
        if in_numbered:
            items = re.split(r"\n(?=\d+[\.)]\s)", paragraph)
            for item in items:
                item = item.strip()
                if item:
                    numbered.append(re.sub(r"^\d+[\.)]\s*", "", item))
        else:
            prose.append(paragraph)

    if prose and numbered and re.search(r"problems are (structural|mostly)", prose[-1], re.I):
        prose.pop()

    return prose, numbered


def build_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        "SectionTitle",
        fontName=DISPLAY_BOLD,
        fontSize=26,
        textColor=SCOTTISH_GREEN,
        leading=30,
        spaceBefore=6,
        spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        "SectionSubtitle",
        fontName=DISPLAY_ITALIC,
        fontSize=11,
        textColor=WARM_GRAY,
        leading=14,
        spaceBefore=0,
        spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        "BodyText2",
        fontName=BODY_FONT,
        fontSize=10.5,
        textColor=CHARCOAL,
        leading=16.8,
        spaceBefore=0,
        spaceAfter=0,
        alignment=TA_LEFT,
    ))
    styles.add(ParagraphStyle(
        "ContactInfo",
        fontName=BODY_FONT,
        fontSize=10,
        textColor=CHARCOAL,
        leading=13,
        alignment=TA_CENTER,
        spaceBefore=2,
        spaceAfter=2,
    ))
    styles.add(ParagraphStyle(
        "AppendixTitle",
        fontName=BODY_BOLD,
        fontSize=11,
        textColor=CHARCOAL,
        leading=14,
        spaceBefore=12,
        spaceAfter=6,
    ))
    return styles


def build_callout_block(text_parts: List[str], styles):
    parts = [sanitize_body_text(part) for part in text_parts if sanitize_body_text(part)]
    if not parts:
        return None
    paragraph = Paragraph("<br/><br/>".join(parts), styles["BodyText2"])
    table = Table([[paragraph]])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BODY_TINT),
        ("LINEBEFORE", (0, 0), (0, 0), 3, SCOTTISH_GREEN),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return table


def cover_page_bg(canvas_obj, doc):
    canvas_obj.saveState()
    canvas_obj.setStrokeColor(PALE_GRAY)
    canvas_obj.setLineWidth(0.75)
    canvas_obj.line(doc.leftMargin, 42, PAGE_W - doc.rightMargin, 42)
    canvas_obj.setFont(BODY_FONT, 8.5)
    canvas_obj.setFillColor(MID_GRAY)
    canvas_obj.drawString(doc.leftMargin, 28, "Cover Page")
    canvas_obj.drawCentredString(PAGE_W / 2, 28, f"{canvas_obj.getPageNumber()}")
    canvas_obj.drawRightString(PAGE_W - doc.rightMargin, 28, sanitize_inline_text(doc.title or "Assessment Report"))
    canvas_obj.restoreState()


def make_content_page_bg(church_name: str, assess_date: str):
    def content_page_bg(canvas_obj, doc):
        canvas_obj.saveState()
        canvas_obj.setFont(BODY_FONT, 9)
        canvas_obj.setFillColor(MID_GRAY)
        canvas_obj.drawString(doc.leftMargin, PAGE_H - 36, f"{sanitize_inline_text(church_name)} Assessment")
        canvas_obj.drawRightString(PAGE_W - doc.rightMargin, PAGE_H - 36, sanitize_inline_text(assess_date))
        canvas_obj.setStrokeColor(SCOTTISH_GREEN)
        canvas_obj.setLineWidth(0.75)
        canvas_obj.line(doc.leftMargin, PAGE_H - 42, PAGE_W - doc.rightMargin, PAGE_H - 42)
        canvas_obj.setStrokeColor(PALE_GRAY)
        canvas_obj.setLineWidth(0.75)
        canvas_obj.line(doc.leftMargin, 42, PAGE_W - doc.rightMargin, 42)
        canvas_obj.setFillColor(MID_GRAY)
        canvas_obj.drawString(doc.leftMargin, 28, sanitize_inline_text(church_name))
        canvas_obj.drawCentredString(PAGE_W / 2, 28, f"{canvas_obj.getPageNumber()}")
        canvas_obj.drawRightString(PAGE_W - doc.rightMargin, 28, f"{sanitize_inline_text(church_name)} Assessment")
        canvas_obj.restoreState()
    return content_page_bg


_BOILERPLATE = {
    "overview": (
        "This assessment was conducted by Scottish Stained Glass to evaluate the current "
        "structural and aesthetic condition of the stained glass windows at this location. "
        "Our team performed a thorough on-site inspection, documenting each window's "
        "condition, dimensions, and any areas requiring attention. The findings presented "
        "in this report provide the basis for our recommended restoration plan."
    ),
    "current_condition": (
        "The stained glass windows at this location show varying degrees of deterioration "
        "consistent with their age and exposure conditions. Lead came deterioration, glass "
        "breakage, and structural warping are the primary concerns identified during the "
        "inspection. The per-window and per-panel condition details are documented in the "
        "condition schedule included in the appendix."
    ),
    "causes": (
        "1. Age and Natural Wear, Over decades of thermal expansion and contraction, "
        "the lead came that holds the individual glass pieces weakens, sags, and eventually "
        "fails, allowing the panels to buckle and warp.\n\n"
        "2. Environmental Exposure, UV radiation, moisture infiltration, and freeze-thaw "
        "cycles accelerate deterioration of both the glass and the supporting lead matrix.\n\n"
        "3. Deferred Maintenance, Without periodic re-leading and re-caulking, minor issues "
        "compound over time, leading to structural instability and potential glass loss.\n\n"
        "4. Structural Movement, Building settlement and vibration from nearby traffic or "
        "HVAC equipment can contribute to panel warping and glass stress fractures."
    ),
    "hundred_year_plan": (
        "To ensure these windows endure for another century, Scottish Stained Glass recommends "
        "a phased restoration approach, beginning with the most critically deteriorated panels. "
        "Each panel will be carefully removed, the glass inventoried and cleaned, and re-leaded "
        "using high-quality lead came. Protective exterior glazing will be installed where "
        "appropriate to shield the restored panels from future environmental damage. "
        "A maintenance schedule will be established to catch and address minor issues before "
        "they escalate."
    ),
    "summary": (
        "Based on our assessment, we recommend prompt attention to the windows rated in poor "
        "condition and monitoring of those rated fair. Scottish Stained Glass has the expertise "
        "and craftsmanship to restore these windows to their original beauty while ensuring "
        "their structural integrity for generations to come. We look forward to the opportunity "
        "to serve as stewards of this sacred heritage."
    ),
}


def _fill_narrative(narrative: Dict[str, str]) -> Dict[str, str]:
    filled = {}
    for key in ["overview", "current_condition", "causes", "hundred_year_plan", "summary"]:
        text = (narrative.get(key) or "").strip()
        filled[key] = text if text else _BOILERPLATE[key]
    return filled


def build_cover_page(story, church_name, church_address, assess_date, cover_image_path, content_width):
    if os.path.exists(REPORT_LOGO_COLOR):
        story.append(Spacer(1, 18))
        logo_w, logo_h = fit_image_to_box(REPORT_LOGO_COLOR, min(content_width * 0.58, 320), 34)
        logo = Image(REPORT_LOGO_COLOR, width=logo_w, height=logo_h)
        logo.hAlign = "CENTER"
        story.append(logo)
        story.append(Spacer(1, 24))
    else:
        story.append(Paragraph(
            "Scottish Stained Glass",
            ParagraphStyle(
                "CoverWordmark",
                fontName=BODY_BOLD,
                fontSize=22,
                textColor=SCOTTISH_GREEN,
                alignment=TA_CENTER,
                spaceAfter=24,
            ),
        ))
    story.append(Paragraph(
        sanitize_inline_text(church_name),
        ParagraphStyle(
            "CoverChurch",
            fontName=BODY_BOLD,
            fontSize=28,
            textColor=black,
            alignment=TA_CENTER,
            leading=32,
            spaceAfter=12,
        ),
    ))
    story.append(Paragraph(
        "Assessment Report",
        ParagraphStyle(
            "CoverLabel",
            fontName=BODY_BOLD,
            fontSize=12,
            textColor=CHARCOAL,
            alignment=TA_CENTER,
            spaceAfter=3,
        ),
    ))
    if assess_date:
        story.append(Paragraph(
            sanitize_inline_text(assess_date),
            ParagraphStyle(
                "CoverDate",
                fontName=BODY_BOLD,
                fontSize=11,
                textColor=CHARCOAL,
                alignment=TA_CENTER,
                spaceAfter=2,
            ),
        ))
    if church_address:
        story.append(Paragraph(
            sanitize_inline_text(church_address),
            ParagraphStyle(
                "CoverAddress",
                fontName=BODY_BOLD,
                fontSize=11,
                textColor=CHARCOAL,
                alignment=TA_CENTER,
                leading=15,
                spaceAfter=18,
            ),
        ))
    else:
        story.append(Spacer(1, 18))
    if cover_image_path and os.path.exists(cover_image_path):
        story.append(HeroImageWithFade(cover_image_path, content_width * 0.92, PAGE_H * 0.40))
    else:
        story.append(Spacer(1, 3.4 * inch))
    story.append(PageBreak())


def build_section(story, title, subtitle, text, styles, content_width, section_photos=None):
    story.append(Paragraph(sanitize_inline_text(title), styles["SectionTitle"]))
    if subtitle:
        story.append(Paragraph(sanitize_inline_text(subtitle), styles["SectionSubtitle"]))
    story.append(TaperedRule(content_width))
    story.append(Spacer(1, 24))

    prose, numbered = split_numbered_items(text)
    parts = [re.sub(r"\n(?!\d)", " ", p) for p in prose]
    for index, item in enumerate(numbered):
        item_clean = re.sub(r"\n", " ", item)
        parts.append(f"{index + 1}. {item_clean}")
    callout = build_callout_block(parts, styles)
    if callout is not None:
        story.append(callout)

    if section_photos:
        story.append(Spacer(1, 18))
        for photo in section_photos[:4]:
            photo_path = photo.get("local_path", "")
            if photo_path and os.path.exists(photo_path):
                window_ref = f"Window {photo.get('window_number', '')}{photo.get('panel_letter', '')}".strip()
                story.append(PhotoWithCaption(
                    photo_path,
                    str(photo.get("filename", "")),
                    window_ref,
                    max_width=content_width,
                    max_height=content_width * 0.65,
                ))
                story.append(Spacer(1, 16))

    story.append(PageBreak())


def build_causes_section(story, text, styles, content_width):
    story.append(Paragraph("What Caused These Issues", styles["SectionTitle"]))
    story.append(Paragraph("Understanding the factors behind deterioration", styles["SectionSubtitle"]))
    story.append(TaperedRule(content_width))
    story.append(Spacer(1, 24))

    _, numbered = split_numbered_items(text)
    if numbered:
        parts = []
        for index, item in enumerate(numbered):
            item_clean = sanitize_body_text(re.sub(r"\n", " ", item))
            match = re.match(r"^(.+?)\s*[:,-]\s+(.+)$", item_clean, re.S)
            if match and len(match.group(1)) < 80:
                parts.append(f"{index + 1}. {match.group(1).strip()}: {match.group(2).strip()}")
            else:
                parts.append(f"{index + 1}. {item_clean}")
    else:
        parts = [sanitize_body_text(p.strip()) for p in text.split("\n\n") if p.strip()]

    callout = build_callout_block(parts, styles)
    if callout is not None:
        story.append(callout)
    story.append(PageBreak())


def build_summary_section(story, text, styles, content_width):
    story.append(Paragraph("Summary", styles["SectionTitle"]))
    story.append(Paragraph("Our professional assessment and recommendation", styles["SectionSubtitle"]))
    story.append(TaperedRule(content_width))
    story.append(Spacer(1, 24))

    parts = []
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    if len(paragraphs) <= 1:
        paragraphs = [p.strip() for p in text.split("\n") if p.strip() and len(p.strip()) > 20]
    for paragraph in paragraphs:
        lower = paragraph.lower()
        if any(token in lower for token in [
            "derek espejo",
            "scottish stained glass",
            "720",
            "scottishgroup",
            "churchstained",
            "pricing will be provided",
        ]):
            continue
        parts.append(paragraph)

    callout = build_callout_block(parts, styles)
    if callout is not None:
        story.append(callout)

    story.append(Spacer(1, 24))
    story.append(GreenRule(content_width, thickness=0.75))
    story.append(Spacer(1, 12))
    story.append(Paragraph("<b>Derek Espejo</b>, Restoration Specialist", styles["ContactInfo"]))
    story.append(Paragraph("Scottish Stained Glass", styles["ContactInfo"]))
    story.append(Paragraph("(720) 703-2247  |  derek@scottishgroupcompanies.com", styles["ContactInfo"]))
    story.append(Paragraph('<font color="#72B034">www.churchstainedglassrestoration.com</font>', styles["ContactInfo"]))
    story.append(Spacer(1, 16))
    story.append(Paragraph(
        "<i>Scottish pricing will be provided separately from the assessment.</i>",
        ParagraphStyle(
            "Pricing",
            fontName=BODY_ITALIC,
            fontSize=9,
            textColor=MID_GRAY,
            alignment=TA_CENTER,
        ),
    ))
    story.append(PageBreak())


def _condition_table_styles():
    def _cell_style(size=7.5, bold=False, color=CHARCOAL, align=TA_CENTER):
        return ParagraphStyle(
            f"condition_{size}_{bold}_{str(color)}_{align}",
            fontName=BODY_BOLD if bold else BODY_FONT,
            fontSize=size,
            textColor=color,
            alignment=align,
            leading=size + 1.8,
        )

    return {
        "header": _cell_style(size=7.5, bold=True, color=white, align=TA_CENTER),
        "data": _cell_style(size=7.5, bold=False, color=CHARCOAL, align=TA_CENTER),
        "notes": _cell_style(size=7.3, bold=False, color=CHARCOAL, align=TA_LEFT),
        "window": _cell_style(size=7.8, bold=True, color=CHARCOAL, align=TA_LEFT),
        "poor": _cell_style(size=7.5, bold=True, color=ALERT_RED, align=TA_CENTER),
        "fair": _cell_style(size=7.5, bold=True, color=AMBER, align=TA_CENTER),
        "good": _cell_style(size=7.5, bold=True, color=GOOD_GREEN, align=TA_CENTER),
    }


def _condition_table_col_widths(content_width: float) -> list[float]:
    proportions = [0.12, 0.07, 0.08, 0.06, 0.06, 0.07, 0.09, 0.11, 0.07, 0.07, 0.20]
    return [content_width * portion for portion in proportions]


def _condition_style(cond_str: str, styles_map: dict):
    cond = (cond_str or "").strip().lower()
    if cond == "poor":
        return styles_map["poor"], LIGHT_RED
    if cond == "fair":
        return styles_map["fair"], LIGHT_YELLOW
    if cond == "good":
        return styles_map["good"], BODY_TINT
    return styles_map["data"], None


def _append_condition_schedule_table(story, rows_data: list[dict], content_width: float):
    if not rows_data:
        return

    styles_map = _condition_table_styles()
    headers = [
        "Win/Panel", "Elev", "Cond", "Warp", "Lead", "Breaks",
        "Wood Rot", "Paint/Caulk", "Pieces", "Sq Ft", "Notes",
    ]
    table_data = [[Paragraph(sanitize_inline_text(header), styles_map["header"]) for header in headers]]
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), SCOTTISH_GREEN),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("BOX", (0, 0), (-1, -1), 0.8, LIGHT_GRAY),
        ("GRID", (0, 0), (-1, -1), 0.45, PALE_GRAY),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]

    for index, row in enumerate(rows_data, start=1):
        is_window = bool(row.get("is_window"))
        cond_style, row_bg = _condition_style(str(row.get("cond") or ""), styles_map)
        cells = [
            Paragraph(sanitize_inline_text(str(row.get("id") or "")), styles_map["window"] if is_window else styles_map["data"]),
            Paragraph(sanitize_inline_text(str(row.get("elev") or "")), styles_map["data"]),
            Paragraph("" if is_window else sanitize_inline_text(str(row.get("cond") or "")), cond_style),
            Paragraph("" if is_window else sanitize_inline_text(str(row.get("warp") or "")), styles_map["data"]),
            Paragraph("" if is_window else sanitize_inline_text(str(row.get("lead") or "")), styles_map["data"]),
            Paragraph("" if is_window else sanitize_inline_text(str(row.get("glass_breaks") or "")), styles_map["data"]),
            Paragraph(sanitize_inline_text(str(row.get("wood_rot") or "")), styles_map["data"]),
            Paragraph(sanitize_inline_text(str(row.get("paint_caulk") or "")), styles_map["data"]),
            Paragraph("" if is_window else sanitize_inline_text(str(row.get("pieces") or "")), styles_map["data"]),
            Paragraph(sanitize_inline_text(str(row.get("sqft") or "")), styles_map["data"]),
            Paragraph(sanitize_inline_text(str(row.get("notes") or "")), styles_map["notes"]),
        ]
        table_data.append(cells)
        if is_window:
            style_cmds.append(("BACKGROUND", (0, index), (-1, index), BODY_TINT))
        else:
            style_cmds.append(("BACKGROUND", (0, index), (-1, index), PALE_ROW if index % 2 == 0 else white))
            if row_bg:
                style_cmds.append(("BACKGROUND", (0, index), (-1, index), row_bg))

    table = Table(
        table_data,
        colWidths=_condition_table_col_widths(content_width),
        repeatRows=1,
        splitByRow=1,
    )
    table.hAlign = "LEFT"
    table.setStyle(TableStyle(style_cmds))
    story.append(table)


def _build_condition_table_from_xlsx(story, xlsx_path, styles, content_width):
    import openpyxl

    if not xlsx_path or not os.path.exists(xlsx_path):
        story.append(Paragraph("Condition schedule not available.", styles["BodyText2"]))
        return

    try:
        workbook = openpyxl.load_workbook(xlsx_path, data_only=True)
        sheet = workbook["Window Conditions"]
    except Exception as exc:
        story.append(Paragraph(f"Could not read condition spreadsheet: {sanitize_inline_text(str(exc))}", styles["BodyText2"]))
        return

    data_start = 5
    rows_data = []
    for row in sheet.iter_rows(min_row=data_start, values_only=True):
        if not any(row):
            continue
        rows_data.append({
            "id": str(row[0] or ""),
            "elev": str(row[1] or ""),
            "warp": row[2],
            "lead": row[3],
            "breaks": row[4],
            "rot": str(row[5] or ""),
            "paint": str(row[6] or ""),
            "pieces": row[7],
            "pan_sqft": row[10],
            "ov_sqft": row[16],
            "notes": str(row[17] or ""),
            "cond": str(row[18] or ""),
            "is_window": int(row[19] or 0) == 1,
        })

    if not rows_data:
        story.append(Paragraph("No condition data found in spreadsheet.", styles["BodyText2"]))
        return

    def _val(value):
        if value in (None, ""):
            return ""
        try:
            return str(int(value))
        except Exception:
            return sanitize_inline_text(str(value))

    normalized_rows = []
    for row in rows_data:
        normalized_rows.append({
            "id": row["id"],
            "elev": row["elev"] if row["is_window"] else "",
            "cond": row["cond"],
            "warp": _val(row["warp"]),
            "lead": _val(row["lead"]),
            "glass_breaks": _val(row["breaks"]),
            "wood_rot": "Yes" if row["rot"] == "Yes" else "",
            "paint_caulk": "Yes" if row["paint"] == "Yes" else "",
            "pieces": _val(row["pieces"]),
            "sqft": _val(row["ov_sqft"] if row["is_window"] else row["pan_sqft"]),
            "notes": row["notes"] if not row["is_window"] else "",
            "is_window": row["is_window"],
        })

    _append_condition_schedule_table(story, normalized_rows, content_width)


def build_appendix(story, narrative, xlsx_path, styles, content_width):
    story.append(Paragraph("Appendix", styles["SectionTitle"]))
    story.append(TaperedRule(content_width))
    story.append(Spacer(1, 24))

    story.append(Paragraph('<font color="#72B034">■</font> Appendix 1: Photo Link', styles["AppendixTitle"]))
    story.append(Paragraph(
        sanitize_body_text(
            "A full set of detailed photographs as well as a spreadsheet outlining the condition "
            "of each window can be viewed at the provided Google Drive link. Spreadsheet schedule: "
            "Red is critical and should be addressed immediately, Yellow is moderate and should be "
            "addressed within the next 5 years, White indicates good condition and the windows will "
            "have a lifespan beyond 10 years."
        ),
        styles["BodyText2"],
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<font color="#72B034">■</font> Appendix 2: Warping Categories', styles["AppendixTitle"]))
    story.append(Paragraph("<i>Summarized as categories 1 to 5.</i>", styles["BodyText2"]))
    warping_rows = [
        ("Category 1", "Window is beginning to show the first signs of distortion or warping. Difficult to see and often needs to be felt by running a palm over the glass. At this stage, there will be 1/16 to 1/8 inch of warping."),
        ("Category 2", "Warping has taken hold and is becoming visible to the naked eye. At this stage, there will be 3/16 to 1/4 inch of warping from the original flat plane."),
        ("Category 3", "Warping is easily noticeable around 5/16 to 3/8 inch and starting to endanger the glass through stress."),
        ("Category 4", "Warping is severe at 1/2 inch and glass is in imminent danger of breaking. Requires immediate attention."),
        ("Category 5", "Warping is usually around 1 inch or more, causing glass to come out of the lead channel or break, causing the window to be in danger of falling out. Requires immediate attention."),
    ]
    warp_table = Table(
        [[Paragraph(f"<b>{name}</b>", styles["BodyText2"]), Paragraph(sanitize_body_text(desc), styles["BodyText2"])] for name, desc in warping_rows],
        colWidths=[content_width * 0.2, content_width * 0.8],
    )
    warp_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1, LIGHT_GRAY),
        ("GRID", (0, 0), (-1, -1), 0.5, PALE_GRAY),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(warp_table)
    story.append(Spacer(1, 8))

    story.append(Paragraph('<font color="#72B034">■</font> Appendix 3: Window Numbering Schedule', styles["AppendixTitle"]))
    story.append(Paragraph(
        sanitize_body_text(
            "Each window is labeled with a number: 1, 2, 3, etc. This numbering system corresponds "
            "to the site notes. From the exterior, the window numbers move from right to left. "
            "From the interior of the building, they will be labeled left to right."
        ),
        styles["BodyText2"],
    ))
    story.append(PageBreak())

    condition_schedule_title = extract_condition_schedule_title(narrative or {})
    condition_schedule_intro = extract_condition_schedule_intro(narrative or {})
    story.append(Paragraph(
        f'<font color="#72B034">■</font> {sanitize_inline_text(condition_schedule_title or DEFAULT_CONDITION_SCHEDULE_TITLE)}',
        styles["AppendixTitle"],
    ))
    story.append(Paragraph(
        f"<i>{sanitize_inline_text(condition_schedule_intro or DEFAULT_CONDITION_SCHEDULE_INTRO)}</i>",
        styles["SectionSubtitle"],
    ))
    story.append(Spacer(1, 8))
    condition_schedule_rows = extract_condition_schedule_rows(narrative or {})
    if condition_schedule_rows:
        _append_condition_schedule_table(story, condition_schedule_rows, content_width)
    else:
        _build_condition_table_from_xlsx(story, xlsx_path, styles, content_width)


def generate_report_pdf(
    project: Dict,
    narrative: Dict[str, Any],
    photos: List[Dict],
    spreadsheet_path: Optional[str],
    output_path: str,
) -> str:
    church_name = project.get("church_name") or project.get("name", "Church")
    assess_date = project.get("assess_date", "")
    church_address = project.get("church_address", "")

    filled = _fill_narrative(normalize_text_narrative(narrative))
    photos_by_id = {str(photo.get("id")): photo for photo in photos if photo.get("id")}

    cover_image = None
    cover_photo_id = extract_cover_photo_id(narrative)
    if cover_photo_id and cover_photo_id in photos_by_id:
        path = photos_by_id[cover_photo_id].get("local_path", "")
        if path and os.path.exists(path):
            cover_image = path
    if cover_image is None:
        for photo in photos:
            path = photo.get("local_path", "")
            if path and os.path.exists(path):
                cover_image = path
                break

    def resolve_section_photos(section_key: str, fallback: List[Dict]) -> List[Dict]:
        photo_ids = extract_section_photo_ids(narrative, section_key)
        if not photo_ids:
            return fallback
        selected = []
        for photo_id in photo_ids:
            photo = photos_by_id.get(photo_id)
            if photo is not None:
                selected.append(photo)
        return selected or fallback

    styles = build_styles()
    margin = 0.85 * inch
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    doc = BaseDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=0.6 * inch,
        bottomMargin=0.5 * inch,
    )
    content_width = PAGE_W - 2 * margin
    cover_frame = Frame(margin, 0.5 * inch, content_width, PAGE_H - 1.1 * inch, id="cover")
    content_frame = Frame(margin, 0.5 * inch, content_width, PAGE_H - 1.4 * inch, id="content")

    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[cover_frame], onPage=cover_page_bg),
        PageTemplate(id="content", frames=[content_frame], onPage=make_content_page_bg(church_name, assess_date)),
    ])

    story: List[Any] = []
    build_cover_page(story, church_name, church_address, assess_date, cover_image, content_width)
    story.append(NextPageTemplate("content"))

    build_section(
        story,
        "Overview and Valuation",
        f"A complete assessment of {church_name}'s stained glass windows",
        filled["overview"],
        styles,
        content_width,
        section_photos=resolve_section_photos("overview", photos[:2]),
    )
    build_section(
        story,
        "Current Condition",
        "Assessment of structural and aesthetic integrity",
        filled["current_condition"],
        styles,
        content_width,
        section_photos=resolve_section_photos("current_condition", photos[2:6]),
    )
    build_causes_section(story, filled["causes"], styles, content_width)
    build_section(
        story,
        "100 Year Restoration Plan",
        "A comprehensive plan to preserve these windows for the next century",
        filled["hundred_year_plan"],
        styles,
        content_width,
        section_photos=resolve_section_photos("hundred_year_plan", photos[6:10]),
    )
    build_summary_section(story, filled["summary"], styles, content_width)
    build_appendix(story, narrative, spreadsheet_path, styles, content_width)

    doc.build(story)
    print(f"Report PDF written to: {output_path}")
    return output_path
