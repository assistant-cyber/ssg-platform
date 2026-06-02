/**
 * Camera + Note Screen
 * Two stages:
 *  1. VIEWFINDER — full-screen camera, tap shutter to capture
 *  2. REVIEW — photo preview + shorthand notes input + Save/Retake
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import api from '@/services/api';
import Colors from '@/constants/Colors';
import { ShorthandHint } from '@/components/ShorthandHint';
import { SafeAreaView } from 'react-native-safe-area-context';

type Stage = 'viewfinder' | 'review';

export default function CameraScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [facing] = useState<CameraType>('back');

  const [stage, setStage] = useState<Stage>('viewfinder');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(false);

  // ── Permission gate ────────────────────────────────────────────────────────

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Ionicons name="camera-outline" size={60} color={Colors.border} />
        <Text style={styles.permTitle}>Camera Access Needed</Text>
        <Text style={styles.permText}>
          SSG Field needs camera access to photograph stained glass windows.
        </Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant Camera Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Capture ────────────────────────────────────────────────────────────────

  const handleCapture = async () => {
    if (capturing || !cameraRef.current) return;
    setCapturing(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
      });
      if (photo?.uri) {
        setPhotoUri(photo.uri);
        setStage('review');
      }
    } catch (err) {
      Alert.alert('Camera Error', 'Could not take photo. Please try again.');
    } finally {
      setCapturing(false);
    }
  };

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!photoUri || !projectId || uploading) return;
    setUploading(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Navigate back immediately — upload continues in background
    router.back();
    // Background upload with retry
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await api.uploadPhoto(
          projectId,
          photoUri,
          notes.trim(),
          new Date().toISOString(),
        );
        break; // success
      } catch (err: any) {
        if (attempt === MAX_RETRIES) {
          Alert.alert(
            'Upload Failed',
            'Could not save photo after 3 attempts. Please check your connection and try again from the project view.',
          );
        } else {
          // Wait before retry
          await new Promise(r => setTimeout(r, attempt * 1500));
        }
      }
    }
    setUploading(false);
  };

  const handleRetake = () => {
    setPhotoUri(null);
    setNotes('');
    setStage('viewfinder');
  };

  // ── STAGE: Viewfinder ──────────────────────────────────────────────────────

  if (stage === 'viewfinder') {
    return (
      <View style={styles.cameraContainer}>
        <Stack.Screen options={{ headerShown: false }} />

        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
        />

        {/* Top bar */}
        <SafeAreaView style={styles.topBar} edges={['top']}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="close" size={28} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.cameraHint}>Point at the window panel</Text>
          <View style={{ width: 44 }} />
        </SafeAreaView>

        {/* Shutter button */}
        <SafeAreaView style={styles.shutterArea} edges={['bottom']}>
          <TouchableOpacity
            style={styles.shutter}
            onPress={handleCapture}
            disabled={capturing}
            activeOpacity={0.85}
          >
            {capturing ? (
              <ActivityIndicator color={Colors.primary} size="large" />
            ) : (
              <View style={styles.shutterInner} />
            )}
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  // ── STAGE: Review + Notes ──────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.charcoal }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Photo preview (top half) */}
        <View style={styles.previewContainer}>
          {photoUri && (
            <Image
              source={{ uri: photoUri }}
              style={styles.preview}
              resizeMode="cover"
            />
          )}
          {/* Retake overlay button */}
          <TouchableOpacity style={styles.retakeOverlay} onPress={handleRetake}>
            <Ionicons name="camera-reverse-outline" size={20} color={Colors.white} />
            <Text style={styles.retakeOverlayText}>Retake</Text>
          </TouchableOpacity>
        </View>

        {/* Notes panel (bottom half) */}
        <ScrollView
          style={styles.notesPanel}
          contentContainerStyle={styles.notesPanelContent}
          keyboardShouldPersistTaps="handled"
        >
          <ShorthandHint />

          <Text style={styles.notesLabel}>Window notes</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. 1A w2 l1 b0 30x36"
            placeholderTextColor={Colors.textLight}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            blurOnSubmit
          />

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.retakeBtn}
              onPress={handleRetake}
              disabled={uploading}
            >
              <Ionicons name="camera-outline" size={20} color={Colors.primaryDark} />
              <Text style={styles.retakeBtnText}>Retake</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, uploading && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={uploading}
              activeOpacity={0.85}
            >
              {uploading ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={20} color={Colors.white} />
                  <Text style={styles.saveBtnText}>Save Photo</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    padding: 32,
    gap: 16,
  },
  // ── Viewfinder ──────────────────────────────────────────────────────────────
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraHint: {
    color: Colors.white,
    fontSize: 14,
    opacity: 0.85,
  },
  shutterArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 40,
    paddingTop: 20,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    borderColor: Colors.primary,
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.white,
  },
  // ── Review ─────────────────────────────────────────────────────────────────
  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
    minHeight: 200,
  },
  preview: {
    flex: 1,
  },
  retakeOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  retakeOverlayText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  notesPanel: {
    backgroundColor: Colors.background,
    maxHeight: '55%',
  },
  notesPanelContent: {
    padding: 16,
    gap: 4,
    paddingBottom: 24,
  },
  notesLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 8,
    marginTop: 4,
  },
  notesInput: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    fontFamily: 'monospace' as const,
    color: Colors.textDark,
    backgroundColor: Colors.white,
    minHeight: 56,
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  retakeBtn: {
    flex: 1,
    height: 52,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.white,
  },
  retakeBtnText: {
    color: Colors.primaryDark,
    fontSize: 15,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  // ── Permissions ────────────────────────────────────────────────────────────
  permTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textDark,
    textAlign: 'center',
  },
  permText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  permBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 8,
  },
  permBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
});
