"""Photo lettering logic for Window-based auto-labeling.

Photos within a window are automatically lettered in chronological order:
a, b, c ... z, aa, ab, ac ... az, ba, bb, ...

The label is computed from window.number + auto-letter, e.g. "1f" for the 6th
photo in window 1. letter_override allows manual pinning.
"""
from typing import List, Optional


def compute_letter(position: int) -> str:
    """Compute letter label for a 0-indexed position.
    
    0 -> 'a', 1 -> 'b', ..., 25 -> 'z', 26 -> 'aa', 27 -> 'ab', ...
    
    This is Excel-column-style lettering: single letters a-z, then aa-zz,
    then aaa-zzz, etc.
    
    Args:
        position: 0-indexed position within the window
        
    Returns:
        Letter label (lowercase)
        
    Examples:
        >>> compute_letter(0)
        'a'
        >>> compute_letter(25)
        'z'
        >>> compute_letter(26)
        'aa'
        >>> compute_letter(27)
        'ab'
        >>> compute_letter(51)
        'az'
        >>> compute_letter(52)
        'ba'
    """
    if position < 0:
        raise ValueError(f"Position must be >= 0, got {position}")
    
    # Single-letter range: a-z (positions 0-25)
    if position < 26:
        return chr(ord('a') + position)
    
    # Multi-letter range: aa-zz, aaa-zzz, etc.
    # This is base-26 with 'a'=0, 'b'=1, ..., 'z'=25
    # but we need to handle the "carry" differently than normal base conversion
    
    result = []
    pos = position
    
    while pos >= 0:
        result.append(chr(ord('a') + (pos % 26)))
        pos = pos // 26 - 1
        
    return ''.join(reversed(result))


def compute_labels_for_photos(
    photos: List[dict],
    window_number: int,
) -> List[Optional[str]]:
    """Compute labels for a list of photos in a window.
    
    DEFENSIVE SORTING: Photos are sorted chronologically before labeling to ensure
    correct label assignment even if callers pass unsorted data. Sort keys:
    (captured_at, capture_sequence, uploaded_at).
    
    Args:
        photos: List of photo dicts with optional 'letter_override' key and
                optional 'captured_at', 'capture_sequence', 'uploaded_at' timestamps
        window_number: The window's display number
        
    Returns:
        List of computed labels (e.g. ["1a", "1b", "1c"]) in the same order
        as the SORTED photos (not input order). Returns None for photos with
        letter_override set to empty string (hidden from labeling).
        
    WARNING: The returned labels correspond to the CHRONOLOGICALLY SORTED order,
    not the input order. If you need to map labels back to the original input,
    use photo IDs to match them.
    """
    # Defensive sort: ensure chronological order even if caller didn't sort
    # Sort by captured_at (if present), then capture_sequence, then uploaded_at
    def sort_key(photo: dict):
        captured_at = photo.get('captured_at')
        capture_seq = photo.get('capture_sequence', 0) or 0
        uploaded_at = photo.get('uploaded_at')
        
        # Handle None/missing timestamps by sorting them last
        captured_ts = captured_at if captured_at else '9999-12-31T23:59:59Z'
        uploaded_ts = uploaded_at if uploaded_at else '9999-12-31T23:59:59Z'
        
        return (captured_ts, capture_seq, uploaded_ts)
    
    sorted_photos = sorted(photos, key=sort_key)
    
    labels = []
    
    for idx, photo in enumerate(sorted_photos):
        override = photo.get('letter_override')
        
        # If override is set, use it (empty string means no label)
        if override is not None:
            labels.append(f"{window_number}{override}" if override else None)
        else:
            # Auto-compute letter from position
            letter = compute_letter(idx)
            labels.append(f"{window_number}{letter}")
    
    return labels


def compute_label_for_photo(
    photo: dict,
    window_number: int,
    position: int,
) -> Optional[str]:
    """Compute label for a single photo.
    
    Args:
        photo: Photo dict with optional 'letter_override' key
        window_number: The window's display number
        position: 0-indexed position within the window (after sorting)
        
    Returns:
        Computed label (e.g. "1f") or None if override is empty string
    """
    override = photo.get('letter_override')
    
    if override is not None:
        return f"{window_number}{override}" if override else None
    
    letter = compute_letter(position)
    return f"{window_number}{letter}"
