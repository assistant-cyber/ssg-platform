"""
Photo auto-naming logic ported from companycam_integration.py.

Generates filenames for photos based on shorthand descriptions (window numbers,
panel letters, directional labels, site notes, spelled-out numbers).
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
            return m.group(1).upper(), len(m.group(0))
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


# ─── Label extraction ─────────────────────────────────────────────────────────

def _strip_note_delimiter(text: str) -> str:
    return re.sub(r'^[\s\-:.,]+', '', text or '').strip()


def _extract_base_label_parts(notes: str) -> Tuple[Optional[str], Optional[str]]:
    notes_stripped = (notes or "").strip()
    if not notes_stripped:
        return None, None

    num_match = re.match(r'^(\d+)([a-zA-Z]?)', notes_stripped)
    if num_match:
        win = num_match.group(1)
        letter = num_match.group(2).upper() or None
        return win, letter

    word_result = _parse_word_number(notes_stripped)
    if word_result:
        num_str, letter, _ = word_result
        return num_str, letter or None

    return None, None


def normalize_field_note(notes: str) -> str:
    notes_stripped = (notes or "").strip()
    prefix = re.match(r'^(window|photo)\b', notes_stripped, re.IGNORECASE)
    if not prefix:
        return notes_stripped

    remainder = notes_stripped[prefix.end():].strip()
    if not remainder:
        return notes_stripped

    window_number, panel_letter = _extract_base_label_parts(remainder)
    if not window_number:
        return notes_stripped

    label = f"{window_number}{(panel_letter or 'A').upper()}"
    suffix = remainder
    digit_match = re.match(r'^(\d+)([a-zA-Z]?)', remainder)
    if digit_match:
        suffix = remainder[digit_match.end():]
    else:
        word_result = _parse_word_number(remainder)
        if word_result:
            suffix = remainder[word_result[2]:]

    return f"{label} {_strip_note_delimiter(suffix)}".strip()


def extract_label_from_description(notes: str) -> Optional[str]:
    """Extract the base label from a photo description string.

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

    window_number, panel_letter = _extract_base_label_parts(notes_stripped)
    if window_number:
        return window_number + (panel_letter or '')

    return None


def extract_label_parts(notes: str) -> Tuple[Optional[str], Optional[str]]:
    """Return ``(window_number, panel_letter)`` parsed from notes shorthand.

    ``panel_letter`` is ``None`` (not ``""``) when the photo has no panel letter
    (e.g. it's a whole-window shot like ``"1 48x96"``).
    """
    notes_stripped = normalize_field_note(notes)
    if not notes_stripped:
        return None, None

    return _extract_base_label_parts(notes_stripped)


# ─── Filename generation ──────────────────────────────────────────────────────

def generate_filenames_for_photos(
    photos_list: List[dict],
    ext: str = ".jpg",
) -> List[str]:
    """Generate auto-sequenced filenames for a list of photo dicts.

    Each dict must have at least a ``"notes"`` key.  Optionally a ``"filename"``
    key to use a specific extension.

    Auto-sequencing rules (matching companycam_integration.py exactly):

    - A photo with a description becomes a "labeled" photo (e.g. ``"1A.jpg"``).
      It sets the current label and resets the inherit counter.
    - A photo with no description inherits the current label with a sequence
      counter: ``"1A(1).jpg"``, ``"1A(2).jpg"``, etc.
    - If no label has been set yet, unlabeled photos fall back to
      ``"photo_001.jpg"``.
    """
    filenames: List[str] = []
    current_label: Optional[str] = None
    inherit_counter: int = 0

    for idx, photo in enumerate(photos_list, 1):
        notes = photo.get("notes", "") or ""
        # Use provided extension or default
        photo_ext = ext
        if photo.get("filename"):
            stem_ext = photo["filename"].rsplit(".", 1)
            if len(stem_ext) == 2 and stem_ext[1]:
                photo_ext = "." + stem_ext[1].lower()

        label = extract_label_from_description(notes)

        if label is not None:
            current_label = label
            inherit_counter = 0
            filenames.append(f"{label}{photo_ext}")
        else:
            if current_label is not None:
                inherit_counter += 1
                filenames.append(f"{current_label}({inherit_counter}){photo_ext}")
            else:
                filenames.append(f"photo_{idx:03d}{photo_ext}")

    return filenames
