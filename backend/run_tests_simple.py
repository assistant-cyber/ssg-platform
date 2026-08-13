#!/usr/bin/env python3
"""
Simple test runner for Phase 4 implementation.
Runs all tests without pytest dependency.
"""
import sys
sys.path.insert(0, '.')

from app.photo_lettering import compute_labels_for_photos, compute_letter
from processing.photo_naming import (
    generate_filenames_for_photos,
    generate_filenames_for_unassigned_photos,
    extract_label_parts,
)


def test_defensive_sorting():
    """Test that photos are sorted before labeling."""
    photos = [
        {'id': '3', 'captured_at': '2024-01-03T10:00:00Z'},
        {'id': '1', 'captured_at': '2024-01-01T10:00:00Z'},
        {'id': '2', 'captured_at': '2024-01-02T10:00:00Z'},
    ]
    labels = compute_labels_for_photos(photos, window_number=1)
    assert labels == ['1a', '1b', '1c'], f"Expected ['1a', '1b', '1c'], got {labels}"
    print("✓ Defensive sorting works")


def test_more_than_26_photos():
    """Test >26 photos use double letters."""
    photos = [{'id': f'p{i}', 'captured_at': f'2024-01-01T{i:02d}:00:00Z'} for i in range(30)]
    labels = compute_labels_for_photos(photos, window_number=5)
    
    assert len(labels) == 30
    assert labels[0] == '5a'
    assert labels[25] == '5z'
    assert labels[26] == '5aa'
    assert labels[27] == '5ab'
    print("✓ Double-letter labeling works")


def test_window_based_naming():
    """Test filename generation from windows."""
    windows = [
        {
            'number': 2,
            'photos': [
                {'id': 'p1', 'label': '2a'},
                {'id': 'p2', 'label': '2b'},
            ],
        },
        {
            'number': 1,
            'photos': [
                {'id': 'p0', 'label': '1a'},
            ],
        },
    ]
    
    result = generate_filenames_for_photos(windows)
    # Should be sorted by window number
    assert result == [
        ('p0', '1a.jpg'),
        ('p1', '2a.jpg'),
        ('p2', '2b.jpg'),
    ], f"Expected sorted windows, got {result}"
    print("✓ Window-based naming works")


def test_unassigned_photos():
    """Test directional and site photo naming."""
    photos = [
        {'id': 'n1', 'notes': 'North elevation'},
        {'id': 's1', 'notes': 'South wall'},
        {'id': 'site', 'notes': 'Site notes: parking lot'},
        {'id': 'other', 'notes': 'random text'},
    ]
    
    result = generate_filenames_for_unassigned_photos(photos)
    assert result == [
        ('n1', 'North.jpg'),
        ('s1', 'South.jpg'),
        ('site', 'site_notes.jpg'),
        ('other', 'photo_other.jpg'),  # Fallback
    ], f"Got {result}"
    print("✓ Unassigned photo naming works")


def test_legacy_functions_preserved():
    """Test that migration script functions still work."""
    result = extract_label_parts('1a some description')
    assert result == ('1', 'a'), f"Expected ('1', 'a'), got {result}"
    
    result = extract_label_parts('45 large window')
    assert result == ('45', None), f"Expected ('45', None), got {result}"
    
    print("✓ Legacy functions preserved")


def test_letter_override():
    """Test that letter_override is respected."""
    photos = [
        {'id': 'p1', 'captured_at': '2024-01-01T01:00:00Z'},
        {'id': 'p2', 'captured_at': '2024-01-01T02:00:00Z', 'letter_override': 'CUSTOM'},
        {'id': 'p3', 'captured_at': '2024-01-01T03:00:00Z'},
    ]
    
    labels = compute_labels_for_photos(photos, window_number=3)
    assert labels == ['3a', '3CUSTOM', '3c'], f"Got {labels}"
    print("✓ Letter override works")


def test_integration_scenario():
    """Test realistic project with multiple windows."""
    windows = [
        {
            'number': 1,
            'photos': [
                {'id': f'w1_p{i}', 'label': f'1{chr(ord("a") + i)}'}
                for i in range(5)
            ],
        },
        {
            'number': 2,
            'photos': [
                {'id': 'w2_p0', 'label': '2a'},
                {'id': 'w2_p1', 'label': '2b'},
                {'id': 'w2_p2', 'label': '2DETAIL'},  # override
            ],
        },
    ]
    
    result = generate_filenames_for_photos(windows)
    
    # Check window 1
    assert result[0] == ('w1_p0', '1a.jpg')
    assert result[4] == ('w1_p4', '1e.jpg')
    
    # Check window 2 with override
    assert result[5] == ('w2_p0', '2a.jpg')
    assert result[7] == ('w2_p2', '2DETAIL.jpg')
    
    print("✓ Integration scenario works")


if __name__ == '__main__':
    print("\n" + "="*60)
    print("PHASE 4 IMPLEMENTATION TESTS")
    print("="*60 + "\n")
    
    tests = [
        test_defensive_sorting,
        test_more_than_26_photos,
        test_window_based_naming,
        test_unassigned_photos,
        test_legacy_functions_preserved,
        test_letter_override,
        test_integration_scenario,
    ]
    
    failed = []
    for test in tests:
        try:
            test()
        except Exception as e:
            print(f"✗ {test.__name__} FAILED: {e}")
            failed.append((test.__name__, e))
    
    print("\n" + "="*60)
    if failed:
        print(f"FAILED: {len(failed)}/{len(tests)} tests failed")
        for name, error in failed:
            print(f"  - {name}: {error}")
        sys.exit(1)
    else:
        print(f"SUCCESS: All {len(tests)} tests passed!")
        print("="*60 + "\n")
        sys.exit(0)
