import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { Window } from '@/services/api';

interface Props {
  window: Window;
  onPress: () => void;
  onLongPress?: () => void;
}

export function WindowCard({ window, onPress, onLongPress }: Props) {
  const photoCount = window.photo_count ?? 0;
  const notesPreview = window.notes?.trim();

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.numberBadge}>
          <Text style={styles.numberText}>{window.number}</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.photoCountBadge}>
            <Ionicons name="camera-outline" size={12} color={Colors.textMuted} />
            <Text style={styles.photoCountText}>{photoCount}</Text>
          </View>
        </View>
      </View>

      {window.name ? (
        <Text style={styles.name} numberOfLines={1}>
          {window.name}
        </Text>
      ) : null}

      {notesPreview ? (
        <Text style={styles.notes} numberOfLines={2}>
          {notesPreview}
        </Text>
      ) : (
        <Text style={styles.noNotes}>No notes</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  numberBadge: {
    backgroundColor: Colors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  photoCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryLight,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  photoCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: 4,
  },
  notes: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  noNotes: {
    fontSize: 13,
    color: Colors.textLight,
    fontStyle: 'italic',
  },
});

export default WindowCard;
