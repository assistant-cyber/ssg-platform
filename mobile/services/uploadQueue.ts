/**
 * Offline-first upload queue with local persistence.
 * Photos and notes are stored locally, background synced with retries.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import api from './api';

const QUEUE_KEY = '@ssg_upload_queue';
const PHOTOS_DIR = `${FileSystem.documentDirectory}pending_photos/`;

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed';

export interface QueuedPhoto {
  id: string;
  windowId: string;
  localUri: string;
  notes: string;
  capturedAt: string;
  captureSequence: number;
  status: UploadStatus;
  uploadedPhotoId?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
}

let isProcessing = false;

// ─── Queue Management ─────────────────────────────────────────────────────────

async function loadQueue(): Promise<QueuedPhoto[]> {
  try {
    const json = await AsyncStorage.getItem(QUEUE_KEY);
    if (!json) return [];
    return JSON.parse(json);
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedPhoto[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function ensurePhotosDir(): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(PHOTOS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function enqueuePhoto(
  windowId: string,
  photoUri: string,
  capturedAt: Date,
  captureSequence: number,
  notes: string = '',
): Promise<string> {
  await ensurePhotosDir();

  const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const filename = `${id}.jpg`;
  const localUri = `${PHOTOS_DIR}${filename}`;

  // Copy photo to persistent location
  await FileSystem.copyAsync({
    from: photoUri,
    to: localUri,
  });

  const item: QueuedPhoto = {
    id,
    windowId,
    localUri,
    notes,
    capturedAt: capturedAt.toISOString(),
    captureSequence,
    status: 'queued',
    retryCount: 0,
    createdAt: new Date().toISOString(),
  };

  const queue = await loadQueue();
  queue.push(item);
  await saveQueue(queue);

  // Trigger background processing
  processQueue().catch(() => {
    // Silent fail — processQueue will be retried on next enqueue or app restart
  });

  return id;
}

export async function getQueueStatus(): Promise<{
  queued: number;
  uploading: number;
  failed: number;
  done: number;
}> {
  const queue = await loadQueue();
  return {
    queued: queue.filter((p) => p.status === 'queued').length,
    uploading: queue.filter((p) => p.status === 'uploading').length,
    failed: queue.filter((p) => p.status === 'failed').length,
    done: queue.filter((p) => p.status === 'done').length,
  };
}

export async function getQueuedPhotos(): Promise<QueuedPhoto[]> {
  return loadQueue();
}

export async function retryFailed(): Promise<void> {
  const queue = await loadQueue();
  const updated = queue.map((p) =>
    p.status === 'failed' ? { ...p, status: 'queued' as UploadStatus, retryCount: 0 } : p
  );
  await saveQueue(updated);
  processQueue().catch(() => {});
}

export async function clearDone(): Promise<void> {
  const queue = await loadQueue();
  const remaining = queue.filter((p) => p.status !== 'done');
  
  // Delete files for done items
  const done = queue.filter((p) => p.status === 'done');
  for (const item of done) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(item.localUri);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(item.localUri, { idempotent: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  await saveQueue(remaining);
}

// ─── Background Processing ────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 5000, 10000]; // ms

export async function processQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const queue = await loadQueue();
    const pending = queue.filter((p) => p.status === 'queued');

    for (const item of pending) {
      // Mark as uploading
      item.status = 'uploading';
      await saveQueue(queue);

      try {
        // Verify file exists
        const fileInfo = await FileSystem.getInfoAsync(item.localUri);
        if (!fileInfo.exists) {
          throw new Error('Local file not found');
        }

        // Upload to backend
        const uploaded = await api.uploadPhotoToWindow(
          item.windowId,
          item.localUri,
          item.notes,
          item.capturedAt,
          item.captureSequence,
        );

        // Success
        item.status = 'done';
        item.uploadedPhotoId = uploaded.id;
        item.errorMessage = undefined;

      } catch (err: any) {
        item.retryCount += 1;

        if (item.retryCount >= MAX_RETRIES) {
          item.status = 'failed';
          item.errorMessage = err.message ?? 'Upload failed';
        } else {
          item.status = 'queued';
          // Wait before next retry
          const delay = RETRY_DELAYS[item.retryCount - 1] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1];
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      await saveQueue(queue);
    }
  } finally {
    isProcessing = false;
  }
}

// ─── Initialization ───────────────────────────────────────────────────────────

export async function initQueue(): Promise<void> {
  await ensurePhotosDir();
  // Resume processing on app start
  processQueue().catch(() => {});
}

// ─── Clean Queue Item ─────────────────────────────────────────────────────────

export async function removeQueueItem(id: string): Promise<void> {
  const queue = await loadQueue();
  const item = queue.find((p) => p.id === id);
  
  if (item) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(item.localUri);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(item.localUri, { idempotent: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  const updated = queue.filter((p) => p.id !== id);
  await saveQueue(updated);
}
