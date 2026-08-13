/**
 * Window Detail Screen — shows photos in a window with large notes field.
 * Big camera button opens window-scoped burst capture mode.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, Stack, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api, { Window, Photo } from '@/services/api';
import Colors from '@/constants/Colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'react-native';

export default function WindowDetailScreen() {
  const { id: projectId, windowId } = useLocalSearchParams<{ id: string; windowId: string }>();
  const [window, setWindow] = useState<Window | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    if (!windowId) return;
    if (!silent) setLoading(true);
    try {
      const [windowData, photosData] = await Promise.all([
        api.getWindow(windowId),
        api.listWindowPhotos(windowId),
      ]);
      setWindow(windowData);
      setPhotos(photosData);
      setNotes(windowData.notes ?? '');
      setNotesDirty(false);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not load window.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [windowId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      fetchData(true);
    }, [fetchData]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData(true);
  };

  const handleNotesBlur = async () => {
    if (!notesDirty || !windowId) return;
    setSavingNotes(true);
    try {
      const updated = await api.updateWindow(windowId, { notes: notes.trim() });
      setWindow(updated);
      setNotesDirty(false);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save notes.');
    } finally {
      setSavingNotes(false);
    }
  };

  const openCamera = () => {
    if (!windowId || !projectId) return;
    router.push(`/(app)/${projectId}/camera?windowId=${windowId}`);
  };

  if (loading || !window) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: window.name ?? `Window ${window.number}`,
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          keyboardShouldPersistTaps="handled"
        >
          {/* Window info card */}
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.numberBadge}>
                <Text style={styles.numberText}>{window.number}</Text>
              </View>
              <View style={styles.photoCountBadge}>
                <Ionicons name="camera-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.photoCountText}>{photos.length} photos</Text>
              </View>
            </View>
            {window.name && (
              <Text style={styles.windowName}>{window.name}</Text>
            )}
          </View>

          {/* Notes field */}
          <View style={styles.notesSection}>
            <View style={styles.notesHeader}>
              <Text style={styles.notesLabel}>Window Notes</Text>
              {savingNotes && (
                <View style={styles.savingIndicator}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.savingText}>Saving…</Text>
                </View>
              )}
            </View>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={(v) => {
                setNotes(v);
                setNotesDirty(true);
              }}
              onBlur={handleNotesBlur}
              placeholder="Tap to add notes or use voice dictation…"
              placeholderTextColor={Colors.textLight}
              multiline
              textAlignVertical="top"
              autoCapitalize="sentences"
            />
          </View>

          {/* Photos grid */}
          <View style={styles.photosSection}>
            <Text style={styles.sectionTitle}>
              Photos {photos.length > 0 ? `(${photos.length})` : ''}
            </Text>

            {photos.length === 0 ? (
              <View style={styles.emptyPhotos}>
                <Ionicons name="camera-outline" size={48} color={Colors.border} />
                <Text style={styles.emptyText}>No photos yet</Text>
                <Text style={styles.emptySubtext}>
                  Tap the camera button below to start capturing.
                </Text>
              </View>
            ) : (
              <View style={styles.photoGrid}>
                {photos.map((photo) => (
                  <TouchableOpacity
                    key={photo.id}
                    style={styles.photoItem}
                    onPress={() => router.push(`/(app)/${projectId}/photo/${photo.id}`)}
                    activeOpacity={0.8}
                  >
                    <Image
                      source={{ uri: api.photoUrl(photo.thumbnail_url ?? photo.storage_url) }}
                      style={styles.photoThumb}
                      resizeMode="cover"
                    />
                    {photo.label && (
                      <View style={styles.labelBadge}>
                        <Text style={styles.labelText}>{photo.label}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </ScrollView>

        {/* Camera FAB */}
        <View style={styles.fabArea}>
          <TouchableOpacity
            style={styles.cameraBtn}
            onPress={openCamera}
            activeOpacity={0.85}
          >
            <Ionicons name="camera" size={28} color={Colors.white} />
            <Text style={styles.cameraBtnText}>Take Photos</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 120 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  numberBadge: {
    backgroundColor: Colors.primary,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '700',
  },
  photoCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryLight,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  photoCountText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  windowName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textDark,
    marginTop: 10,
  },
  notesSection: {
    marginBottom: 20,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  notesLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textDark,
  },
  savingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  savingText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  notesInput: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: Colors.textDark,
    backgroundColor: Colors.white,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  photosSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 14,
  },
  emptyPhotos: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.textLight,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoItem: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: Colors.primaryLight,
  },
  photoThumb: {
    width: '100%',
    height: '100%',
  },
  labelBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  labelText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  fabArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 28,
    paddingHorizontal: 24,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: 14,
  },
  cameraBtn: {
    height: 60,
    backgroundColor: Colors.primary,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: Colors.primaryDark,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  cameraBtnText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
});
