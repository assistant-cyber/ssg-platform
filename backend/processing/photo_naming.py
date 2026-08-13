"""
Photo auto-naming logic based on Window structure.

Phase 4: Filenames derived from Window structure (window_id + chronological lettering).
Format: {window_number}{letter}.jpg (e.g. 1a.jpg, 1b.jpg, ..., 2a.jpg, ...)
Site/elevation photos (no window_id) keep directional labels (North.jpg, South.jpg, site_notes.jpg).

Legacy shorthand parsing functions (from CompanyCam workflow) are preserved with
'legacy_' prefix for backward compatibility with migration scripts.
"""
import re
from typing import Dict, List, Optional, Tuple

# ─── Word → number mappings ───────────────────────────────────────────────────

_WORD_TO_NUM: Dict[str, int] = {
    'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
    'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19,
    'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
    'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90,
}

_ONES = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
_TEENS_AND_BELOW = [
    'nineteen', 'eighteen', 'seventeen', 'sixteen', 'fifteen', 'fourteen',
    'thirteen', 'twelve', 'eleven', 'ten',
    'nine', 'eight', 'seven', 'six', 'five', 'four', 'three', 'two', 'one', 'zero',
]
_TENS = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']


# ─── Spelled-out number parser ────────────────────────────────────────────────

def _parse_word_number(text: str) -> Optional[Tuple[str, str, int]]:
    """Try to parse a spelled-out number at the start of *text*.

    Returns ``(number_string, trailing_letter, match_length)`` or ``None`` if no match.
    The trailing letter (A, B, C…) is uppercased and may be empty string.

    Examples::

        'one'        → ('1', '')
        'onea'       → ('1', 'A')
        'twentyone'  → ('21', '')
        'twenty-one' → ('21', '')
    """
    if not text:
        return None
    text_lower = text.lower().lstrip()
    if not text_lower:
        return None

    def _check_trailing_letter(remainder: str) -> Optional[Tuple[str, int]]:
        if not remainder:
            return '', 0
        m = re.match(r'^([a-z])(?![a-z])', remainder)
        if m:
            return m.group(1).lower(), len(m.group(0))
        if not remainder[0].isalpha():
            return '', 0
        return None   # starts with letter sequence → ambiguous

    # Compound tens + ones: "twentyone", "twenty-one", "twenty one"
    for ten in _TENS:
        if text_lower.startswith(ten):
            rest = text_lower[len(ten):]
            separator_match = re.match(r'^[\s\-]+', rest)
            separator_len = len(separator_match.group(0)) if separator_match else 0
            rest_stripped = rest[separator_len:]
            matched_ones = False
            for one in sorted(_ONES, key=len, reverse=True):
                if rest_stripped.startswith(one):
                    remainder = rest_stripped[len(one):]
                    letter = _check_trailing_letter(remainder)
                    if letter is not None:
                        num = _WORD_TO_NUM[ten] + _WORD_TO_NUM[one]
                        return (str(num), letter[0], len(ten) + separator_len + len(one) + letter[1])
                    matched_ones = True
                    break
            if matched_ones:
                continue
            letter = _check_trailing_letter(rest_stripped)
            if letter is not None:
                return (str(_WORD_TO_NUM[ten]), letter[0], len(ten) + separator_len + letter[1])

    # Single-word numbers (longest first so "nineteen" beats "nine")
    for word in _TEENS_AND_BELOW:
        if text_lower.startswith(word):
            remainder = text_lower[len(word):]
            letter = _check_trailing_letter(remainder)
            if letter is not None:
                return (str(_WORD_TO_NUM[word]), letter[0], len(word) + letter[1])

    return None


# ─── LEGACY: Label extraction (preserved for migration scripts) ──────────────
# These functions parse shorthand notes from the old CompanyCam workflow.
# They are ONLY used by scripts/migrate_create_windows.py to backfill Window
# entities from existing photo notes. Production naming uses Window structure.

def legacy_strip_note_delimiter(text: str) -> str:
    """Legacy helper: strip delimiter characters from notes."""
    return re.sub(r'^[\s\-:.,]+', '', text or '').strip()


def legacy_extract_base_label_parts(notes: str) -> Tuple[Optional[str], Optional[str]]:
    """Legacy helper: extract (window_number, panel_letter) from shorthand notes."""
    notes_stripped = (notes or "").strip()
    if not notes_stripped:
        return None, None

    num_match = re.match(r'^(\d+)([a-zA-Z]?)', notes_stripped)
    if num_match:
        win = num_match.group(1)
        letter = num_match.group(2).lower() or None
        return win, letter

    word_result = _parse_word_number(notes_stripped)
    if word_result:
        num_str, letter, _ = word_result
        return num_str, letter or None

    return None, None


def normalize_field_note(notes: str) -> str:
    """Legacy: normalize field notes by stripping 'window' or 'photo' prefix.
    
    DEPRECATED: Only used for backward compatibility with migration scripts.
    """
    notes_stripped = (notes or "").strip()
    prefix = re.match(r'^(window|photo)\b', notes_stripped, re.IGNORECASE)
    if not prefix:
        return notes_stripped

    remainder = notes_stripped[prefix.end():].strip()
    if not remainder:
        return notes_stripped

    window_number, panel_letter = legacy_extract_base_label_parts(remainder)
    if not window_number:
        return notes_stripped

    label = f"{window_number}{(panel_letter or '').lower()}"
    suffix = remainder
    digit_match = re.match(r'^(\d+)([a-zA-Z]?)', remainder)
    if digit_match:
        suffix = remainder[digit_match.end():]
    else:
        word_result = _parse_word_number(remainder)
        if word_result:
            suffix = remainder[word_result[2]:]

    return f"{label} {legacy_strip_note_delimiter(suffix)}".strip()


def extract_label_from_description(notes: str) -> Optional[str]:
    """Legacy: Extract the base label from a photo description string.

    DEPRECATED: Only used by migration scripts. Production code uses Window structure.
    
    Returns the label (e.g. ``"45"``, ``"45A"``, ``"North"``, ``"site_notes"``)
    or ``None`` if no recognisable label is found.
    """
    notes_stripped = normalize_field_note(notes)
    notes_lower = notes_stripped.lower()

    if not notes_stripped:
        return None

    # Directional labels
    direction_match = re.match(r'^(north|south|east|west)\b', notes_lower)
    if direction_match:
        return direction_match.group(1).capitalize()

    # "Site Notes" label
    if notes_lower.startswith("site notes"):
        return "site_notes"

    window_number, panel_letter = legacy_extract_base_label_parts(notes_stripped)
    if window_number:
        return window_number + (panel_letter or '')

    return None


def extract_label_parts(notes: str) -> Tuple[Optional[str], Optional[str]]:
    """Legacy: Return ``(window_number, panel_letter)`` parsed from notes shorthand.

    DEPRECATED: Only used by scripts/migrate_create_windows.py. Production code
    uses Window structure with photo.window_id foreign key.
    
    ``panel_letter`` is ``None`` (not ``""``) when the photo has no panel letter
    (e.g. it's a whole-window shot like ``"1 48x96"``).
    """
    notes_stripped = normalize_field_note(notes)
    if not notes_stripped:
        return None, None

    return legacy_extract_base_label_parts(notes_stripped)


# ─── Filename generation (Window-based) ───────────────────────────────────────

def generate_filenames_for_photos(
    windows: List[dict],
    ext: str = ".jpg",
) -> List[Tuple[str, str]]:
    """Generate filenames from Window structure.
    
    Args:
        windows: List of window dicts, each with:
            - 'number': int window number
            - 'photos': list of photo dicts, each with:
                - 'id': photo ID
                - 'label': computed label (e.g. '1a', '1b')
                - 'letter_override': optional manual letter
                - optional 'filename' key to use specific extension
        ext: default file extension (default: .jpg)
        
    Returns:
        List of (photo_id, filename) tuples in window/chronological order.
        
    Examples:
        Window 1 with 3 photos labeled 1a, 1b, 1c:
        [('photo_id_1', '1a.jpg'), ('photo_id_2', '1b.jpg'), ('photo_id_3', '1c.jpg')]
        
        Site photos (no window) with directional labels:
        [('photo_id_x', 'North.jpg'), ('photo_id_y', 'South.jpg')]
    """
    from app.photo_lettering import compute_letter
    
    filenames: List[Tuple[str, str]] = []
    
    # Sort windows by number
    sorted_windows = sorted(windows, key=lambda w: w.get('number', 999))
    
    for window in sorted_windows:
        window_number = window.get('number')
        photos = window.get('photos', [])
        
        for idx, photo in enumerate(photos):
            photo_id = photo.get('id')
            if not photo_id:
                continue
                
            # Use provided extension or default
            photo_ext = ext
            if photo.get('filename'):
                stem_ext = photo['filename'].rsplit('.', 1)
                if len(stem_ext) == 2 and stem_ext[1]:
                    photo_ext = '.' + stem_ext[1].lower()
            
            # Use the pre-computed label from photo_lettering
            label = photo.get('label')
            if label:
                filename = f"{label}{photo_ext}"
            else:
                # Fallback: photo has no label (should not happen in production)
                filename = f"photo_{photo_id[:8]}{photo_ext}"
            
            filenames.append((photo_id, filename))
    
    return filenames


def generate_filenames_for_unassigned_photos(
    photos: List[dict],
    ext: str = ".jpg",
) -> List[Tuple[str, str]]:
    """Generate filenames for site/elevation photos not assigned to a window.
    
    These photos use directional labels (North, South, East, West, site_notes)
    parsed from their notes field, falling back to photo ID.
    
    Args:
        photos: List of photo dicts with 'id', 'notes', and optional 'filename'
        ext: default file extension
        
    Returns:
        List of (photo_id, filename) tuples
    """
    filenames: List[Tuple[str, str]] = []
    
    for photo in photos:
        photo_id = photo.get('id')
        if not photo_id:
            continue
            
        notes = photo.get('notes', '') or ''
        notes_lower = notes.lower().strip()
        
        # Use provided extension or default
        photo_ext = ext
        if photo.get('filename'):
            stem_ext = photo['filename'].rsplit('.', 1)
            if len(stem_ext) == 2 and stem_ext[1]:
                photo_ext = '.' + stem_ext[1].lower()
        
        # Directional labels
        direction_match = re.match(r'^(north|south|east|west)\b', notes_lower)
        if direction_match:
            direction = direction_match.group(1).capitalize()
            filenames.append((photo_id, f"{direction}{photo_ext}"))
            continue
        
        # Site notes label
        if notes_lower.startswith('site notes'):
            filenames.append((photo_id, f"site_notes{photo_ext}"))
            continue
        
        # Fallback: use photo ID prefix
        filenames.append((photo_id, f"photo_{photo_id[:8]}{photo_ext}"))
    
    return filenames
