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
    
    def test_chronological_ordering(self):
        """Test that labels respect chronological capture order.
        
        This is a documentation test - the actual ordering happens in the
        database query (ORDER BY captured_at, capture_sequence, uploaded_at),
        but the labeling logic assumes photos arrive in correct order.
        """
        # Photos arrive already sorted by capture time
        photos = [
            {"id": "3", "captured_at": "2024-01-03T10:00:00Z"},  # Third by time
            {"id": "1", "captured_at": "2024-01-01T10:00:00Z"},  # First by time
            {"id": "2", "captured_at": "2024-01-02T10:00:00Z"},  # Second by time
        ]
        
        # BUT the caller should sort them first - this function just assigns letters
        # to the order it receives. Here we're demonstrating what happens if
        # they're NOT sorted (to show the importance of pre-sorting).
        labels_wrong_order = compute_labels_for_photos(photos, window_number=1)
        assert labels_wrong_order == ["1a", "1b", "1c"]  # Wrong chronology!
        
        # Correct usage: caller sorts by captured_at first
        photos_sorted = sorted(photos, key=lambda p: p["captured_at"])
        labels_correct = compute_labels_for_photos(photos_sorted, window_number=1)
        assert labels_correct == ["1a", "1b", "1c"]
        # Now labels match chronological order: id=1 is 1a, id=2 is 1b, id=3 is 1c
        assert photos_sorted[0]["id"] == "1"
        assert photos_sorted[1]["id"] == "2"
        assert photos_sorted[2]["id"] == "3"
