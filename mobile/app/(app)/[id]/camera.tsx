/**
 * Window-scoped Burst Camera
 * Camera stays live between shots, each capture gets a lettered badge (1a, 1b, ...),
 * thumbnails appear in a strip at bottom. Persistent banner shows window + next label.
 */
import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import api, { Window } from '@/services/api';
import Colors from '@/constants/Colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as uploadQueue from '@/services/uploadQueue';

interface CapturedPhoto {
  id: string;
  uri: string;
  label: string;
  capturedAt: Date;
  sequence: number;
}

function computeLabel(windowNumber: number, photoIndex: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  let letter = '';
  let idx = photoIndex;
  
  while (true) {
    letter = alphabet[idx % 26] + letter;
    idx = Math.floor(idx / 26);
    if (idx === 0) break;
    idx -= 1;
  }
  
  return `${windowNumber}${letter}`;
}

export default function CameraScreen() {
  const { id: projectId, windowId } = useLocalSearchParams<{ id: string; windowId?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [facing] = useState<CameraType>('back');

  const [window, setWindow] = useState<Window | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!windowId) return;
    
    (async () => {
      try {
        const w = await api.getWindow(windowId);
        setWindow(w);
      } catch (err: any) {
        Alert.alert('Error', err.message ?? 'Could not load window.');
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [windowId]);

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

  if (loading || !window) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  // ── Capture ────────────────────────────────────────────────────────────────

  const handleCapture = async () => {
    if (capturing || !cameraRef.current || !windowId) return;
    setCapturing(true);

    const capturedAt = new Date();
    const sequence = capturedPhotos.length;
    const nextLabel = computeLabel(window.number, sequence);

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
      });

      if (photo?.uri) {
        // Flash the label briefly
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        const captured: CapturedPhoto = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          uri: photo.uri,
          label: nextLabel,
          capturedAt,
          sequence,
        };

        setCapturedPhotos((prev) => [...prev, captured]);

        // Queue for upload (no notes at capture time)
        await uploadQueue.enqueuePhoto(
          windowId,
          photo.uri,
          capturedAt,
          sequence,
          '',
        );
      }
    } catch (err) {
      Alert.alert('Camera Error', 'Could not take photo. Please try again.');
    } finally {
      setCapturing(false);
    }
  };

  const handleRetake = (photoId: string) => {
    Alert.alert(
      'Delete Photo',
      'Remove this photo and take again?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setCapturedPhotos((prev) => prev.filter((p) => p.id !== photoId));
            // Remove from upload queue
            await uploadQueue.removeQueueItem(photoId);
          },
        },
      ],
    );
  };

  const handleDone = () => {
    router.back();
  };

  const nextLabel = computeLabel(window.number, capturedPhotos.length);

  return (
    <View style={styles.cameraContainer}>
      <Stack.Screen options={{ headerShown: false }} />

      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
      />

      {/* Top banner */}
      <SafeAreaView style={styles.topBanner} edges={['top']}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={handleDone}
        >
          <Ionicons name="close" size={28} color={Colors.white} />
        </TouchableOpacity>
        <View style={styles.bannerInfo}>
          <Text style={styles.bannerText}>
            Window {window.number}
            {window.name ? ` · ${window.name}` : ''}
          </Text>
          <Text style={styles.bannerNext}>next photo: {nextLabel}</Text>
        </View>
        <View style={{ width: 44 }} />
      </SafeAreaView>

      {/* Bottom: Thumbnail strip + shutter */}
      <SafeAreaView style={styles.bottomArea} edges={['bottom']}>
        {capturedPhotos.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbStrip}
            style={styles.thumbScroll}
          >
            {capturedPhotos.map((photo) => (
              <TouchableOpacity
                key={photo.id}
                style={styles.thumbItem}
                onLongPress={() => handleRetake(photo.id)}
                activeOpacity={0.8}
              >
                <Image
                  source={{ uri: photo.uri }}
                  style={styles.thumbImage}
                  resizeMode="cover"
                />
                <View style={styles.thumbBadge}>
                  <Text style={styles.thumbBadgeText}>{photo.label}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Shutter button */}
        <View style={styles.shutterRow}>
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={handleDone}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark" size={24} color={Colors.primary} />
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>

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

          <View style={{ width: 80 }} />
        </View>
      </SafeAreaView>
    </View>
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
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerInfo: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  bannerText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  bannerNext: {
    color: Colors.white,
    fontSize: 13,
    opacity: 0.85,
  },
  bottomArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingTop: 10,
  },
  thumbScroll: {
    maxHeight: 90,
    marginBottom: 10,
  },
  thumbStrip: {
    paddingHorizontal: 16,
    gap: 8,
  },
  thumbItem: {
    width: 70,
    height: 70,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: Colors.charcoal,
    borderWidth: 2,
    borderColor: Colors.white,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    backgroundColor: Colors.primary,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  thumbBadgeText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.white,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  doneBtnText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '700',
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
