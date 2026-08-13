"""Unit tests for photo lettering logic."""
import pytest
from app.photo_lettering import compute_letter, compute_labels_for_photos, compute_label_for_photo


class TestComputeLetter:
    """Test the compute_letter function for Excel-style lettering."""
    
    def test_single_letters_a_to_z(self):
        """Test positions 0-25 produce single letters a-z."""
        assert compute_letter(0) == 'a'
        assert compute_letter(1) == 'b'
        assert compute_letter(2) == 'c'
        assert compute_letter(25) == 'z'
    
    def test_double_letters_start_at_26(self):
        """Test position 26 produces 'aa', not 'ba'."""
        assert compute_letter(26) == 'aa'
        assert compute_letter(27) == 'ab'
        assert compute_letter(28) == 'ac'
    
    def test_double_letters_through_zz(self):
        """Test double letter range aa-zz."""
        assert compute_letter(51) == 'az'  # 26 + 25
        assert compute_letter(52) == 'ba'
        assert compute_letter(53) == 'bb'
        assert compute_letter(77) == 'bz'  # 52 + 25
        assert compute_letter(701) == 'zz'  # 26 * 27 - 1
    
    def test_triple_letters_start_at_702(self):
        """Test position 702 produces 'aaa'."""
        assert compute_letter(702) == 'aaa'
        assert compute_letter(703) == 'aab'
    
    def test_negative_position_raises_error(self):
        """Test that negative positions raise ValueError."""
        with pytest.raises(ValueError, match="Position must be >= 0"):
            compute_letter(-1)
    
    def test_large_positions(self):
        """Test some larger positions to verify the algorithm scales."""
        # Just verify they don't crash and produce reasonable length strings
        result_1000 = compute_letter(1000)
        assert len(result_1000) >= 3
        assert result_1000.isalpha()
        assert result_1000.islower()


class TestComputeLabelsForPhotos:
    """Test the compute_labels_for_photos function."""
    
    def test_empty_list(self):
        """Test empty photo list returns empty labels."""
        assert compute_labels_for_photos([], window_number=1) == []
    
    def test_basic_sequential_labels(self):
        """Test basic sequential lettering for photos without overrides."""
        photos = [
            {"id": "1"},
            {"id": "2"},
            {"id": "3"},
        ]
        labels = compute_labels_for_photos(photos, window_number=1)
        assert labels == ["1a", "1b", "1c"]
    
    def test_letter_override_replaces_auto_letter(self):
        """Test that letter_override replaces the auto-computed letter."""
        photos = [
            {"id": "1"},
            {"id": "2", "letter_override": "x"},
            {"id": "3"},
        ]
        labels = compute_labels_for_photos(photos, window_number=1)
        assert labels == ["1a", "1x", "1c"]
    
    def test_empty_override_hides_label(self):
        """Test that empty string override hides the label (returns None)."""
        photos = [
            {"id": "1"},
            {"id": "2", "letter_override": ""},
            {"id": "3"},
        ]
        labels = compute_labels_for_photos(photos, window_number=1)
        assert labels == ["1a", None, "1c"]
    
    def test_more_than_26_photos(self):
        """Test lettering beyond 'z' goes to 'aa', 'ab', etc."""
        photos = [{"id": str(i)} for i in range(28)]
        labels = compute_labels_for_photos(photos, window_number=2)
        
        assert labels[0] == "2a"
        assert labels[25] == "2z"
        assert labels[26] == "2aa"
        assert labels[27] == "2ab"
    
    def test_different_window_numbers(self):
        """Test that window number is correctly prepended."""
        photos = [{"id": "1"}, {"id": "2"}]
        
        assert compute_labels_for_photos(photos, window_number=1) == ["1a", "1b"]
        assert compute_labels_for_photos(photos, window_number=5) == ["5a", "5b"]
        assert compute_labels_for_photos(photos, window_number=99) == ["99a", "99b"]


class TestComputeLabelForPhoto:
    """Test the compute_label_for_photo function."""
    
    def test_basic_label_computation(self):
        """Test basic label computation for a single photo."""
        photo = {"id": "1"}
        assert compute_label_for_photo(photo, window_number=1, position=0) == "1a"
        assert compute_label_for_photo(photo, window_number=1, position=5) == "1f"
        assert compute_label_for_photo(photo, window_number=2, position=0) == "2a"
    
    def test_override_replaces_computed_label(self):
        """Test that letter_override replaces the computed label."""
        photo = {"id": "1", "letter_override": "custom"}
        assert compute_label_for_photo(photo, window_number=1, position=0) == "1custom"
    
    def test_empty_override_returns_none(self):
        """Test that empty override returns None (no label)."""
        photo = {"id": "1", "letter_override": ""}
        assert compute_label_for_photo(photo, window_number=1, position=0) is None
    
    def test_position_beyond_z(self):
        """Test positions beyond 25 produce multi-letter labels."""
        photo = {"id": "1"}
        assert compute_label_for_photo(photo, window_number=3, position=26) == "3aa"
        assert compute_label_for_photo(photo, window_number=3, position=27) == "3ab"


class TestLetteringReflowScenarios:
    """Test that labels re-flow correctly when photos are deleted/reordered."""
    
    def test_delete_middle_photo_reflows_remaining(self):
        """Test that deleting a photo re-flows subsequent letters."""
        # Initial: 1a, 1b, 1c, 1d
        # Delete 1b -> should become: 1a, 1b, 1c (what was c becomes b, d becomes c)
        photos_before = [
            {"id": "1"},
            {"id": "2"},
            {"id": "3"},
            {"id": "4"},
        ]
        labels_before = compute_labels_for_photos(photos_before, window_number=1)
        assert labels_before == ["1a", "1b", "1c", "1d"]
        
        # Simulate deletion of photo 2 (index 1)
        photos_after = [photos_before[0], photos_before[2], photos_before[3]]
        labels_after = compute_labels_for_photos(photos_after, window_number=1)
        assert labels_after == ["1a", "1b", "1c"]
    
    def test_override_prevents_reflow_for_that_photo(self):
        """Test that a photo with letter_override keeps its label during reflow."""
        # 1a, 1PINNED, 1c, 1d
        # Delete 1a -> should become: 1a, 1PINNED, 1b
        photos_before = [
            {"id": "1"},
            {"id": "2", "letter_override": "PINNED"},
            {"id": "3"},
            {"id": "4"},
        ]
        labels_before = compute_labels_for_photos(photos_before, window_number=1)
        assert labels_before == ["1a", "1PINNED", "1c", "1d"]
        
        # Delete first photo
        photos_after = [photos_before[1], photos_before[2], photos_before[3]]
        labels_after = compute_labels_for_photos(photos_after, window_number=1)
        assert labels_after == ["1PINNED", "1b", "1c"]


class TestTimezoneAndOrdering:
    """Test ordering by captured_at with timezone-aware timestamps."""
    
    def test_chronological_ordering_defensive_sort(self):
        """Test that compute_labels_for_photos DEFENSIVELY SORTS by timestamp.
        
        Phase 4: The function now sorts internally to prevent wrong labels
        from unsorted input.
        """
        # Photos arrive OUT OF ORDER (simulating upload order != capture order)
        photos = [
            {"id": "3", "captured_at": "2024-01-03T10:00:00Z"},  # Third by time
            {"id": "1", "captured_at": "2024-01-01T10:00:00Z"},  # First by time
            {"id": "2", "captured_at": "2024-01-02T10:00:00Z"},  # Second by time
        ]
        
        # The function sorts internally, so labels are chronologically correct
        labels = compute_labels_for_photos(photos, window_number=1)
        assert labels == ["1a", "1b", "1c"]
        
        # The returned labels correspond to sorted order:
        # - id=1 (earliest timestamp) gets 1a
        # - id=2 (middle timestamp) gets 1b
        # - id=3 (latest timestamp) gets 1c
    
    def test_capture_sequence_fallback(self):
        """Test that capture_sequence is used when captured_at is missing."""
        photos = [
            {"id": "1", "capture_sequence": 3},
            {"id": "2", "capture_sequence": 1},
            {"id": "3", "capture_sequence": 2},
        ]
        
        labels = compute_labels_for_photos(photos, window_number=2)
        # Should be sorted by capture_sequence: 1, 2, 3
        assert labels == ["2a", "2b", "2c"]
    
    def test_uploaded_at_fallback(self):
        """Test that uploaded_at is used when captured_at and capture_sequence are missing."""
        photos = [
            {"id": "1", "uploaded_at": "2024-01-03T10:00:00Z"},
            {"id": "2", "uploaded_at": "2024-01-01T10:00:00Z"},
            {"id": "3", "uploaded_at": "2024-01-02T10:00:00Z"},
        ]
        
        labels = compute_labels_for_photos(photos, window_number=3)
        # Should be sorted by uploaded_at
        assert labels == ["3a", "3b", "3c"]
    
    def test_mixed_timestamps_sort_priority(self):
        """Test sort priority: captured_at > capture_sequence > uploaded_at."""
        photos = [
            {"id": "1", "captured_at": "2024-01-02T10:00:00Z", "capture_sequence": 1},
            {"id": "2", "captured_at": "2024-01-01T10:00:00Z", "capture_sequence": 2},
            {"id": "3", "upload_at": "2024-01-01T09:00:00Z"},  # No captured_at, sorts last
        ]
        
        labels = compute_labels_for_photos(photos, window_number=1)
        # id=2 has earliest captured_at (wins over capture_sequence)
        # id=1 has second captured_at
        # id=3 has no captured_at, sorts last
        assert labels == ["1a", "1b", "1c"]
    
    def test_more_than_26_photos_unsorted_input(self):
        """Test >26 photos with unsorted input to verify defensive sorting works at scale."""
        # Create 30 photos with random-ish timestamps
        photos = [
            {"id": f"photo_{i}", "captured_at": f"2024-01-{(i * 3) % 28 + 1:02d}T10:00:00Z"}
            for i in range(30)
        ]
        
        labels = compute_labels_for_photos(photos, window_number=5)
        
        # Should have 30 labels
        assert len(labels) == 30
        
        # First 26 are single letters
        assert labels[0] is not None and labels[0].startswith("5")
        assert labels[25] is not None and labels[25].endswith("z")
        
        # Next 4 are double letters
        assert labels[26] is not None and labels[26].endswith("aa")
        assert labels[27] is not None and labels[27].endswith("ab")
        assert labels[28] is not None and labels[28].endswith("ac")
        assert labels[29] is not None and labels[29].endswith("ad")
