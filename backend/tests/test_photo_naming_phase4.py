"""
Golden-file tests for Phase 4 photo naming based on Window structure.

These tests verify that filenames are correctly derived from Window structure
with chronological lettering, handling edge cases like:
- Out-of-order upload
- >26 photos in one window
- letter_override
- Unassigned directional photos
"""
import pytest
from processing.photo_naming import (
    generate_filenames_for_photos,
    generate_filenames_for_unassigned_photos,
)


class TestWindowBasedNaming:
    """Test filename generation from Window structure."""
    
    def test_single_window_basic(self):
        """Test basic window with 3 photos in chronological order."""
        windows = [
            {
                'number': 1,
                'photos': [
                    {'id': 'photo_a', 'label': '1a'},
                    {'id': 'photo_b', 'label': '1b'},
                    {'id': 'photo_c', 'label': '1c'},
                ],
            }
        ]
        
        result = generate_filenames_for_photos(windows)
        
        assert result == [
            ('photo_a', '1a.jpg'),
            ('photo_b', '1b.jpg'),
            ('photo_c', '1c.jpg'),
        ]
    
    def test_multiple_windows_numeric_order(self):
        """Test that windows are sorted by number."""
        windows = [
            {
                'number': 3,
                'photos': [
                    {'id': 'p3a', 'label': '3a'},
                    {'id': 'p3b', 'label': '3b'},
                ],
            },
            {
                'number': 1,
                'photos': [
                    {'id': 'p1a', 'label': '1a'},
                ],
            },
            {
                'number': 2,
                'photos': [
                    {'id': 'p2a', 'label': '2a'},
                    {'id': 'p2b', 'label': '2b'},
                    {'id': 'p2c', 'label': '2c'},
                ],
            },
        ]
        
        result = generate_filenames_for_photos(windows)
        
        # Windows should be sorted: 1, 2, 3
        assert result == [
            ('p1a', '1a.jpg'),
            ('p2a', '2a.jpg'),
            ('p2b', '2b.jpg'),
            ('p2c', '2c.jpg'),
            ('p3a', '3a.jpg'),
            ('p3b', '3b.jpg'),
        ]
    
    def test_more_than_26_photos_in_window(self):
        """Test window with >26 photos uses double-letter labels."""
        photos = [
            {'id': f'photo_{i}', 'label': f'1{chr(ord("a") + i)}'}
            for i in range(26)
        ]
        # Add 4 more photos with double-letter labels
        photos.extend([
            {'id': 'photo_26', 'label': '1aa'},
            {'id': 'photo_27', 'label': '1ab'},
            {'id': 'photo_28', 'label': '1ac'},
            {'id': 'photo_29', 'label': '1ad'},
        ])
        
        windows = [{'number': 1, 'photos': photos}]
        
        result = generate_filenames_for_photos(windows)
        
        assert len(result) == 30
        assert result[0] == ('photo_0', '1a.jpg')
        assert result[25] == ('photo_25', '1z.jpg')
        assert result[26] == ('photo_26', '1aa.jpg')
        assert result[27] == ('photo_27', '1ab.jpg')
        assert result[28] == ('photo_28', '1ac.jpg')
        assert result[29] == ('photo_29', '1ad.jpg')
    
    def test_letter_override(self):
        """Test that letter_override is respected in labels."""
        windows = [
            {
                'number': 2,
                'photos': [
                    {'id': 'p1', 'label': '2a'},
                    {'id': 'p2', 'label': '2CUSTOM'},  # override
                    {'id': 'p3', 'label': '2c'},
                ],
            }
        ]
        
        result = generate_filenames_for_photos(windows)
        
        assert result == [
            ('p1', '2a.jpg'),
            ('p2', '2CUSTOM.jpg'),
            ('p3', '2c.jpg'),
        ]
    
    def test_custom_extension(self):
        """Test that custom file extensions are preserved."""
        windows = [
            {
                'number': 1,
                'photos': [
                    {'id': 'p1', 'label': '1a', 'filename': 'orig.png'},
                    {'id': 'p2', 'label': '1b', 'filename': 'orig.JPG'},
                ],
            }
        ]
        
        result = generate_filenames_for_photos(windows)
        
        assert result == [
            ('p1', '1a.png'),
            ('p2', '1b.jpg'),  # extension lowercased
        ]
    
    def test_photo_without_label_fallback(self):
        """Photos without a pre-computed label derive one from window + position;
        the ID-prefix fallback only applies when no window number exists."""
        # In a numbered window: label derived from position → 1a
        windows = [
            {
                'number': 1,
                'photos': [
                    {'id': 'photo_abc123def456', 'label': None},
                ],
            }
        ]
        result = generate_filenames_for_photos(windows)
        assert result == [('photo_abc123def456', '1a.jpg')]

        # Without a window number: fall back to ID prefix (no doubled 'photo_')
        windows_no_number = [
            {
                'number': None,
                'photos': [
                    {'id': 'photo_abc123def456', 'label': None},
                ],
            }
        ]
        result = generate_filenames_for_photos(windows_no_number)
        assert result == [('photo_abc123def456', 'photo_abc123de.jpg')]
    
    def test_empty_windows_list(self):
        """Test that empty windows list returns empty results."""
        assert generate_filenames_for_photos([]) == []
    
    def test_window_with_no_photos(self):
        """Test that window with no photos is handled gracefully."""
        windows = [
            {'number': 1, 'photos': []},
            {
                'number': 2,
                'photos': [
                    {'id': 'p1', 'label': '2a'},
                ],
            },
        ]
        
        result = generate_filenames_for_photos(windows)
        
        assert result == [('p1', '2a.jpg')]


class TestUnassignedPhotoNaming:
    """Test filename generation for site/elevation photos."""
    
    def test_directional_labels(self):
        """Test that directional labels are preserved."""
        photos = [
            {'id': 'p1', 'notes': 'North elevation'},
            {'id': 'p2', 'notes': 'south wall detail'},
            {'id': 'p3', 'notes': 'East side window frame'},
            {'id': 'p4', 'notes': 'west entrance'},
        ]
        
        result = generate_filenames_for_unassigned_photos(photos)
        
        assert result == [
            ('p1', 'North.jpg'),
            ('p2', 'South.jpg'),
            ('p3', 'East.jpg'),
            ('p4', 'West.jpg'),
        ]
    
    def test_site_notes_label(self):
        """Test that 'site notes' label is recognized."""
        photos = [
            {'id': 'p1', 'notes': 'Site notes: parking lot visible'},
            {'id': 'p2', 'notes': 'site notes exterior stairs'},
        ]
        
        result = generate_filenames_for_unassigned_photos(photos)
        
        assert result == [
            ('p1', 'site_notes.jpg'),
            ('p2', 'site_notes.jpg'),
        ]
    
    def test_fallback_to_photo_id(self):
        """Test fallback for photos with no recognized label."""
        photos = [
            {'id': 'abc123def456ghi7', 'notes': 'random description'},
            {'id': 'xyz789uvw012stu3', 'notes': ''},
        ]
        
        result = generate_filenames_for_unassigned_photos(photos)
        
        assert result == [
            ('abc123def456ghi7', 'photo_abc123de.jpg'),
            ('xyz789uvw012stu3', 'photo_xyz789uv.jpg'),
        ]
    
    def test_custom_extension_unassigned(self):
        """Test custom extensions on unassigned photos."""
        photos = [
            {'id': 'p1', 'notes': 'North', 'filename': 'orig.png'},
            {'id': 'p2', 'notes': 'site notes', 'filename': 'orig.JPEG'},
        ]
        
        result = generate_filenames_for_unassigned_photos(photos)
        
        assert result == [
            ('p1', 'North.png'),
            ('p2', 'site_notes.jpeg'),
        ]
    
    def test_empty_photos_list(self):
        """Test empty photos list returns empty results."""
        assert generate_filenames_for_unassigned_photos([]) == []
    
    def test_photo_without_id_skipped(self):
        """Test that photos without ID are skipped."""
        photos = [
            {'notes': 'North'},  # No id
            {'id': 'p1', 'notes': 'South'},
        ]
        
        result = generate_filenames_for_unassigned_photos(photos)
        
        assert result == [('p1', 'South.jpg')]


class TestIntegrationScenario:
    """Golden-file test with realistic project data."""
    
    def test_realistic_project_naming(self):
        """Test a realistic project with mixed windows and site photos.
        
        Scenario:
        - Window 1: 20 photos (uploaded out of order)
        - Window 2: 30 photos (>26, needs double letters)
        - Window 3: 5 photos with one override
        - Site photos: North, South, site_notes
        """
        windows = [
            {
                'number': 1,
                'photos': [
                    {'id': f'w1_p{i}', 'label': f'1{chr(ord("a") + i)}'}
                    for i in range(20)
                ],
            },
            {
                'number': 2,
                'photos': [
                    # First 26 photos (a-z)
                    *[
                        {'id': f'w2_p{i}', 'label': f'2{chr(ord("a") + i)}'}
                        for i in range(26)
                    ],
                    # Next 4 photos (aa-ad)
                    {'id': 'w2_p26', 'label': '2aa'},
                    {'id': 'w2_p27', 'label': '2ab'},
                    {'id': 'w2_p28', 'label': '2ac'},
                    {'id': 'w2_p29', 'label': '2ad'},
                ],
            },
            {
                'number': 3,
                'photos': [
                    {'id': 'w3_p0', 'label': '3a'},
                    {'id': 'w3_p1', 'label': '3b'},
                    {'id': 'w3_p2', 'label': '3DETAIL'},  # override
                    {'id': 'w3_p3', 'label': '3d'},
                    {'id': 'w3_p4', 'label': '3e'},
                ],
            },
        ]
        
        site_photos = [
            {'id': 'site_north', 'notes': 'North elevation'},
            {'id': 'site_south', 'notes': 'South elevation'},
            {'id': 'site_notes', 'notes': 'Site notes: access from parking'},
        ]
        
        window_filenames = generate_filenames_for_photos(windows)
        site_filenames = generate_filenames_for_unassigned_photos(site_photos)
        
        # Verify window counts
        assert len(window_filenames) == 20 + 30 + 5  # 55 total
        
        # Verify Window 1 range
        assert window_filenames[0] == ('w1_p0', '1a.jpg')
        assert window_filenames[19] == ('w1_p19', '1t.jpg')
        
        # Verify Window 2 range (includes double letters)
        assert window_filenames[20] == ('w2_p0', '2a.jpg')
        assert window_filenames[45] == ('w2_p25', '2z.jpg')
        assert window_filenames[46] == ('w2_p26', '2aa.jpg')
        assert window_filenames[49] == ('w2_p29', '2ad.jpg')
        
        # Verify Window 3 with override
        assert window_filenames[50] == ('w3_p0', '3a.jpg')
        assert window_filenames[52] == ('w3_p2', '3DETAIL.jpg')  # override preserved
        assert window_filenames[54] == ('w3_p4', '3e.jpg')
        
        # Verify site photos
        assert site_filenames == [
            ('site_north', 'North.jpg'),
            ('site_south', 'South.jpg'),
            ('site_notes', 'site_notes.jpg'),
        ]
