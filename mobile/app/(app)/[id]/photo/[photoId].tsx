/**
 * Photo Review Screen — full-screen view of a single photo.
 * Edit notes, save, or delete.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api, { Photo } from '@/services/api';
import Colors from '@/constants/Colors';
import { ShorthandHint } from '@/components/ShorthandHint';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PhotoReviewScreen() {
  const { id: projectId, photoId } = useLocalSearchParams<{
    id: string;
    photoId: string;
  }>();

  const [photo, setPhoto] = useState<Photo | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await api.request<Photo>('GET', `/photos/${photoId}`);
        setPhoto(p);
        setNotes(p.notes ?? '');
      } catch (err: any) {
        Alert.alert('Error', err.message ?? 'Could not load photo.');
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [photoId]);

  const handleSave = async () => {
    if (!photo || saving) return;
    setSaving(true);
    try {
      const updated = await api.updatePhoto(photo.id, { notes: notes.trim() });
      setPhoto(updated);
      setDirty(false);
      Alert.alert('Saved', 'Photo notes updated.');
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Photo',
      'Are you sure you want to delete this photo? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!photo) return;
            setDeleting(true);
            try {
              await api.deletePhoto(photo.id);
              router.back();
            } catch (err: any) {
              Alert.alert('Error', err.message ?? 'Could not delete.');
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  if (loading || !photo) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const imageUrl = api.photoUrl(photo.storage_url);
  const windowLabel = photo.window_number
    ? `Window ${photo.window_number}${photo.panel_letter ? photo.panel_letter : ''}`
    : photo.filename?.replace(/\.[^.]+$/, '') ?? 'Photo';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          title: windowLabel,
          headerRight: () => (
            <TouchableOpacity
              onPress={handleDelete}
              disabled={deleting}
              style={{ padding: 4 }}
            >
              {deleting ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <Ionicons name="trash-outline" size={22} color={Colors.white} />
              )}
            </TouchableOpacity>
          ),
        }}
      />

      <SafeAreaView style={styles.safe} edges={['bottom']}>
        {/* Full photo */}
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="contain"
          />
        </View>

        {/* Notes editor */}
        <ScrollView
          style={styles.notesPanel}
          contentContainerStyle={styles.notesPanelContent}
          keyboardShouldPersistTaps="handled"
        >
          <ShorthandHint />

          <View style={styles.metaRow}>
            {photo.window_number && (
              <View style={styles.metaBadge}>
                <Text style={styles.metaBadgeText}>
                  W{photo.window_number}{photo.panel_letter ?? ''}
                </Text>
              </View>
            )}
            {photo.elevation && (
              <View style={styles.metaBadge}>
                <Text style={styles.metaBadgeText}>{photo.elevation}</Text>
              </View>
            )}
            <Text style={styles.metaDate}>
              {new Date(photo.uploaded_at).toLocaleDateString()}
            </Text>
          </View>

          <Text style={styles.label}>Window notes</Text>
          <TextInput
            style={styles.input}
            value={notes}
            onChangeText={(v) => {
              setNotes(v);
              setDirty(true);
            }}
            placeholder="e.g. 1A w2 l1 b0 30x36"
            placeholderTextColor={Colors.textLight}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            style={[styles.saveBtn, (!dirty || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!dirty || saving}
          >
            {saving ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color={Colors.white} />
                <Text style={styles.saveBtnText}>Save Notes</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imageContainer: {
    backgroundColor: Colors.charcoal,
    height: 280,
    width: '100%',
  },
  image: {
    flex: 1,
    width: '100%',
  },
  notesPanel: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  notesPanelContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  metaBadge: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  metaBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  metaDate: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    fontFamily: 'monospace' as const,
    color: Colors.textDark,
    backgroundColor: Colors.white,
    minHeight: 56,
    marginBottom: 14,
  },
  saveBtn: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
});
