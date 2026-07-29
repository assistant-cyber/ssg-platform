'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  HelpCircle,
  ImagePlus,
  Loader2,
  Mic,
  Trash2,
  X,
} from 'lucide-react';
import api, { type Photo, type PhotoPin, type ProjectDetail } from '@/lib/api';
import { buildUploadDraftPlans } from '@/lib/photoNaming';

interface Props {
  project: ProjectDetail;
  onRefresh: () => void;
}

interface QueuedUpload {
  file: File;
  id: string;
  notes: string;
  previewUrl: string;
  status: 'queued' | 'uploading' | 'error';
  updatedAt: number;
  error?: string;
}

const SHORTHAND_HELP = [
  'Start a new window: type or say "window 1 broken lead" — that photo becomes 1A.',
  'Leave the next photos blank and they auto-step: 1B, 1C, 1D…',
  'Say "window 2" to reset the sequence to 2A, 2B, 2C…',
];

const QUEUE_SETTLE_MS = 0;
const MAX_CONCURRENT_UPLOADS = 3;
const MAX_UPLOAD_DIMENSION = 2200;
const JPEG_UPLOAD_QUALITY = 0.8;
const KEEP_ORIGINAL_IF_UNDER_BYTES = 2_400_000;

type DictationRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: {
    resultIndex?: number;
    results: ArrayLike<(ArrayLike<{ transcript: string }> & { isFinal?: boolean })>;
  }) => void) | null;
  start: () => void;
  stop: () => void;
};

type DictationRecognitionCtor = new () => DictationRecognition;

function displayPhotoLabel(photo: Photo) {
  if (photo.filename) return photo.filename.replace(/\.[^.]+$/, '');
  if (photo.window_number) return `${photo.window_number}${photo.panel_letter ?? ''}`;
  return 'Photo';
}

function photoWindowSummary(photo: Photo) {
  const windowLabel = [photo.window_number, photo.panel_letter].filter(Boolean).join('');
  return windowLabel || photo.elevation || 'No window tag yet';
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Upload failed.';
}

function replaceFileExtension(filename: string, nextExtension: string) {
  const normalizedExtension = nextExtension.startsWith('.') ? nextExtension : `.${nextExtension}`;
  const stem = filename.replace(/\.[^.]+$/, '');
  return `${stem}${normalizedExtension}`;
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(objectUrl); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image decode failed.')); };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function prepareUploadFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  try {
    const image = await loadImageElement(file);
    const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const shouldKeepOriginal =
      file.type === 'image/jpeg' &&
      largestSide <= MAX_UPLOAD_DIMENSION &&
      file.size <= KEEP_ORIGINAL_IF_UNDER_BYTES;
    if (shouldKeepOriginal) return file;
    const scale = Math.min(1, MAX_UPLOAD_DIMENSION / largestSide);
    const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    const blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_UPLOAD_QUALITY);
    if (!blob) return file;
    if (file.type === 'image/jpeg' && blob.size >= file.size * 0.95 && largestSide <= MAX_UPLOAD_DIMENSION) return file;
    return new File([blob], replaceFileExtension(file.name, '.jpg'), { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}

export default function PhotosTab({ project, onRefresh }: Props) {
  const [queue, setQueue] = useState<QueuedUpload[]>([]);
  const [activeHelp, setActiveHelp] = useState<string | null>(null);
  const [modalPhotoIndex, setModalPhotoIndex] = useState<number | null>(null);
  const [modalNote, setModalNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  const [queuedPreviewId, setQueuedPreviewId] = useState<string | null>(null);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [downloadingArchive, setDownloadingArchive] = useState<'all' | 'selected' | null>(null);
  const [listeningQueueId, setListeningQueueId] = useState<string | null>(null);
  const [interimQueueNotes, setInterimQueueNotes] = useState<Record<string, string>>({});
  const [modalListening, setModalListening] = useState(false);
  const [interimModalNote, setInterimModalNote] = useState('');
  const [savingElevation, setSavingElevation] = useState(false);
  const [pins, setPins] = useState<PhotoPin[]>([]);
  const [draggingPinId, setDraggingPinId] = useState<string | null>(null);
  const pinImageRef = useRef<HTMLImageElement | null>(null);
  const [dimWidth, setDimWidth] = useState('');
  const [dimHeight, setDimHeight] = useState('');
  const [dimDepth, setDimDepth] = useState('');
  const [savingDimensions, setSavingDimensions] = useState(false);

  const libraryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const queueRef = useRef<QueuedUpload[]>([]);
  const recognitionRef = useRef<DictationRecognition | null>(null);
  const modalRecognitionRef = useRef<DictationRecognition | null>(null);
  const inFlightRef = useRef<Set<string>>(new Set());
  const modalNoteRef = useRef('');

  useEffect(() => { modalNoteRef.current = modalNote; }, [modalNote]);

  const queuePlans = useMemo(
    () => buildUploadDraftPlans(
      queue.map((item) => ({ id: item.id, notes: item.notes, originalName: item.file.name })),
      project.photos,
    ),
    [project.photos, queue],
  );

  const planMap = useMemo(() => new Map(queuePlans.map((plan) => [plan.id, plan])), [queuePlans]);

  // Quick-pick dimension chips: every distinct width x height (x depth) combo
  // already used somewhere in this project, most-used first, so staff never
  // have to retype the same window size more than once.
  const dimensionPresets = useMemo(() => {
    const counts = new Map<string, { width: number; height: number; depth: number | null; count: number }>();
    for (const photo of project.photos) {
      if (photo.dim_width == null || photo.dim_height == null) continue;
      const key = `${photo.dim_width}x${photo.dim_height}x${photo.dim_depth ?? ''}`;
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { width: photo.dim_width, height: photo.dim_height, depth: photo.dim_depth ?? null, count: 1 });
      }
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [project.photos]);

  const uploadInFlight = queue.some((item) => item.status === 'uploading');
  const queuedCount = queue.filter((item) => item.status === 'queued').length;
  const selectedCount = selectedPhotoIds.length;
  const allSelected = project.photos.length > 0 && selectedCount === project.photos.length;
  const modalPhoto = modalPhotoIndex === null ? null : project.photos[modalPhotoIndex] ?? null;

  useEffect(() => { queueRef.current = queue; }, [queue]);

  useEffect(() => () => { queueRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl)); }, []);
  useEffect(() => () => { recognitionRef.current?.stop(); }, []);
  useEffect(() => () => { modalRecognitionRef.current?.stop(); }, []);

  // Concurrent upload runner
  useEffect(() => {
    const available = queue.filter(
      (item) => item.status === 'queued' && !inFlightRef.current.has(item.id) && Date.now() - item.updatedAt > QUEUE_SETTLE_MS,
    );
    const slotsOpen = MAX_CONCURRENT_UPLOADS - inFlightRef.current.size;
    const toStart = available.slice(0, slotsOpen);
    if (toStart.length === 0) return;

    for (const nextItem of toStart) {
      const plan = planMap.get(nextItem.id);
      if (!plan) continue;
      inFlightRef.current.add(nextItem.id);
      setQueue((current) => current.map((item) => item.id === nextItem.id ? { ...item, status: 'uploading', error: undefined } : item));

      void (async () => {
        try {
          const preparedFile = await prepareUploadFile(nextItem.file);
          const takenAt = nextItem.file.lastModified ? new Date(nextItem.file.lastModified).toISOString() : undefined;
          const filenameOverride = plan.predictedFilename
            ? replaceFileExtension(plan.predictedFilename, preparedFile.name.split('.').pop() ?? 'jpg')
            : undefined;
          await api.uploadPhoto(project.id, preparedFile, plan.normalizedNotes, { filenameOverride, takenAt });
          setQueue((current) => {
            const target = current.find((item) => item.id === nextItem.id);
            if (target) URL.revokeObjectURL(target.previewUrl);
            return current.filter((item) => item.id !== nextItem.id);
          });
          onRefresh();
        } catch (error) {
          setQueue((current) => current.map((item) => item.id === nextItem.id ? { ...item, status: 'error', error: errorMessage(error) } : item));
        } finally {
          inFlightRef.current.delete(nextItem.id);
        }
      })();
    }
  }, [onRefresh, planMap, project.id, queue]);

  useEffect(() => {
    if (!modalPhoto) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void closePhotoModal();
      if (event.key === 'ArrowLeft') void goToPreviousModalPhoto();
      if (event.key === 'ArrowRight') void goToNextModalPhoto();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalPhoto, project.photos.length, modalNote]);

  useEffect(() => {
    setModalNote(modalPhoto?.notes ?? '');
    setInterimModalNote('');
    setPins(modalPhoto?.pins ?? []);
    setDimWidth(modalPhoto?.dim_width != null ? String(modalPhoto.dim_width) : '');
    setDimHeight(modalPhoto?.dim_height != null ? String(modalPhoto.dim_height) : '');
    setDimDepth(modalPhoto?.dim_depth != null ? String(modalPhoto.dim_depth) : '');
  }, [modalPhoto?.id]);

  useEffect(() => {
    const validPhotoIds = new Set(project.photos.map((photo) => photo.id));
    setSelectedPhotoIds((current) => current.filter((id) => validPhotoIds.has(id)));
  }, [project.photos]);

  const appendFiles = (incoming: FileList | null) => {
    if (!incoming?.length) return;
    const nextItems = Array.from(incoming).map((file) => ({
      file,
      id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 9)}`,
      notes: '',
      previewUrl: URL.createObjectURL(file),
      status: 'queued' as const,
      updatedAt: Date.now(),
    }));
    setQueue((current) => [...current, ...nextItems]);
    setQueuedPreviewId(nextItems[0]?.id ?? null);
  };

  const updateQueueNote = (id: string, notes: string) => {
    setQueue((current) => current.map((item) => (
      item.id === id ? { ...item, notes, status: item.status === 'uploading' ? item.status : 'queued', updatedAt: Date.now(), error: undefined } : item
    )));
  };

  const retryQueueItem = (id: string) => {
    setQueue((current) => current.map((item) => (item.id === id ? { ...item, status: 'queued', updatedAt: Date.now(), error: undefined } : item)));
  };

  const removeQueueItem = (id: string) => {
    if (listeningQueueId === id) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setListeningQueueId(null);
    }
    clearInterimQueueNote(id);
    setQueue((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  };

  const appendTranscriptToQueueNote = (id: string, transcript: string) => {
    const cleaned = transcript.trim();
    if (!cleaned) return;
    setQueue((current) => current.map((item) => {
      if (item.id !== id) return item;
      const next = item.notes.trim() ? `${item.notes.trim()} ${cleaned}`.replace(/\s+/g, ' ').trim() : cleaned;
      return { ...item, notes: next, status: item.status === 'uploading' ? item.status : 'queued', updatedAt: Date.now(), error: undefined };
    }));
  };

  const clearInterimQueueNote = (id: string) => {
    setInterimQueueNotes((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const toggleQueueDictation = (id: string) => {
    if (typeof window === 'undefined') return;
    if (listeningQueueId === id) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setListeningQueueId(null);
      clearInterimQueueNote(id);
      return;
    }
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if (listeningQueueId) clearInterimQueueNote(listeningQueueId);

    const speechWindow = window as typeof window & { SpeechRecognition?: DictationRecognitionCtor; webkitSpeechRecognition?: DictationRecognitionCtor };
    const RecognitionCtor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!RecognitionCtor) { window.alert('Voice-to-text is not supported on this device/browser yet.'); return; }

    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      let finalizedTranscript = '';
      let interimTranscript = '';
      for (let index = event.resultIndex ?? 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = Array.from(result).map((alt) => alt.transcript).join(' ').trim();
        if (!transcript) continue;
        if (result.isFinal) finalizedTranscript = `${finalizedTranscript} ${transcript}`.trim();
        else interimTranscript = `${interimTranscript} ${transcript}`.trim();
      }
      if (finalizedTranscript) appendTranscriptToQueueNote(id, finalizedTranscript);
      setInterimQueueNotes((current) => {
        if (!interimTranscript) {
          if (!current[id]) return current;
          const next = { ...current };
          delete next[id];
          return next;
        }
        return { ...current, [id]: interimTranscript };
      });
    };
    recognition.onerror = (event) => {
      setListeningQueueId(null);
      recognitionRef.current = null;
      clearInterimQueueNote(id);
      if (event.error && event.error !== 'no-speech' && event.error !== 'aborted') window.alert(`Voice-to-text failed: ${event.error}`);
    };
    recognition.onend = () => {
      setListeningQueueId((current) => (current === id ? null : current));
      recognitionRef.current = null;
      clearInterimQueueNote(id);
    };
    recognitionRef.current = recognition;
    setListeningQueueId(id);
    recognition.start();
  };

  // ── Modal voice dictation ──────────────────────────────────────────────────

  const toggleModalDictation = () => {
    if (typeof window === 'undefined') return;
    if (modalListening) {
      modalRecognitionRef.current?.stop();
      modalRecognitionRef.current = null;
      setModalListening(false);
      setInterimModalNote('');
      return;
    }
    const speechWindow = window as typeof window & { SpeechRecognition?: DictationRecognitionCtor; webkitSpeechRecognition?: DictationRecognitionCtor };
    const RecognitionCtor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!RecognitionCtor) { window.alert('Voice-to-text is not supported in this browser.'); return; }

    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      let finalized = '';
      let interim = '';
      for (let i = event.resultIndex ?? 0; i < event.results.length; i++) {
        const result = event.results[i];
        const t = Array.from(result).map((a) => a.transcript).join(' ').trim();
        if (!t) continue;
        if (result.isFinal) finalized = `${finalized} ${t}`.trim();
        else interim = `${interim} ${t}`.trim();
      }
      if (finalized) {
        const base = modalNoteRef.current.trim();
        setModalNote(base ? `${base} ${finalized}` : finalized);
      }
      setInterimModalNote(interim);
    };
    recognition.onerror = (event) => {
      setModalListening(false);
      modalRecognitionRef.current = null;
      setInterimModalNote('');
      if (event.error && event.error !== 'no-speech' && event.error !== 'aborted') window.alert(`Voice-to-text failed: ${event.error}`);
    };
    recognition.onend = () => {
      setModalListening(false);
      modalRecognitionRef.current = null;
      setInterimModalNote('');
    };
    modalRecognitionRef.current = recognition;
    setModalListening(true);
    recognition.start();
  };

  // ── Modal open / close / navigate ─────────────────────────────────────────

  const openPhotoModal = (photo: Photo) => {
    const index = project.photos.findIndex((item) => item.id === photo.id);
    if (index >= 0) setModalPhotoIndex(index);
  };

  const persistModalNote = async (photo: Photo, note: string) => {
    if (note === (photo.notes ?? '')) return;
    setSavingNote(true);
    try {
      await api.updatePhoto(photo.id, { notes: note.trim() });
      await onRefresh();
    } catch {
      // best-effort auto-save, don't alert
    } finally {
      setSavingNote(false);
    }
  };

  const closePhotoModal = async () => {
    if (modalListening) {
      modalRecognitionRef.current?.stop();
      modalRecognitionRef.current = null;
      setModalListening(false);
      setInterimModalNote('');
    }
    if (modalPhoto) await persistModalNote(modalPhoto, modalNote);
    setModalPhotoIndex(null);
    setModalNote('');
    setInterimModalNote('');
  };

  const goToPreviousModalPhoto = async () => {
    if (modalPhoto) await persistModalNote(modalPhoto, modalNote);
    setModalPhotoIndex((current) => (current === null ? current : Math.max(0, current - 1)));
  };

  const goToNextModalPhoto = async () => {
    if (modalPhoto) await persistModalNote(modalPhoto, modalNote);
    setModalPhotoIndex((current) => (current === null ? current : Math.min(project.photos.length - 1, current + 1)));
  };

  const saveModalNote = async () => {
    if (!modalPhoto || savingNote) return;
    setSavingNote(true);
    try {
      await api.updatePhoto(modalPhoto.id, { notes: modalNote.trim() });
      await onRefresh();
      setModalPhotoIndex(null);
      setModalNote('');
      setInterimModalNote('');
    } finally {
      setSavingNote(false);
    }
  };

  // ── Elevation photo pin editor ──────────────────────────────────────────────

  const PIN_COLORS: PhotoPin['color'][] = ['red', 'blue', 'green', 'purple', 'orange'];
  const PIN_COLOR_HEX: Record<PhotoPin['color'], string> = {
    red: '#D0342C',
    blue: '#2E5FA3',
    green: '#3A7D0A',
    purple: '#7B4397',
    orange: '#D97B1F',
  };

  const toggleElevationPhoto = async () => {
    if (!modalPhoto || savingElevation) return;
    setSavingElevation(true);
    try {
      await api.updatePhoto(modalPhoto.id, { is_elevation: !modalPhoto.is_elevation });
      await onRefresh();
    } finally {
      setSavingElevation(false);
    }
  };

  const setElevationSide = async (side: string) => {
    if (!modalPhoto) return;
    setSavingElevation(true);
    try {
      await api.updatePhoto(modalPhoto.id, { elevation: side });
      await onRefresh();
    } finally {
      setSavingElevation(false);
    }
  };

  // ── Dimensions ───────────────────────────────────────────────────────────────

  const parseDim = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
  };

  const commitDimensions = async (widthRaw = dimWidth, heightRaw = dimHeight, depthRaw = dimDepth) => {
    if (!modalPhoto || savingDimensions) return;
    setSavingDimensions(true);
    try {
      await api.updatePhoto(modalPhoto.id, {
        dim_width: parseDim(widthRaw),
        dim_height: parseDim(heightRaw),
        dim_depth: parseDim(depthRaw),
      });
      await onRefresh();
    } finally {
      setSavingDimensions(false);
    }
  };

  const applyDimensionPreset = (preset: { width: number; height: number; depth: number | null }) => {
    const widthStr = String(preset.width);
    const heightStr = String(preset.height);
    const depthStr = preset.depth != null ? String(preset.depth) : '';
    setDimWidth(widthStr);
    setDimHeight(heightStr);
    setDimDepth(depthStr);
    void commitDimensions(widthStr, heightStr, depthStr);
  };

  // Converts a click/drag position into a percentage relative to the actual
  // rendered image pixels, accounting for the letterboxing that object-contain
  // introduces when the image and its container don't share an aspect ratio.
  const percentFromPointer = (clientX: number, clientY: number): { x_pct: number; y_pct: number } | null => {
    const img = pinImageRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    const naturalW = img.naturalWidth || rect.width;
    const naturalH = img.naturalHeight || rect.height;
    if (!naturalW || !naturalH || !rect.width || !rect.height) return null;

    const containerRatio = rect.width / rect.height;
    const imageRatio = naturalW / naturalH;
    let renderedW = rect.width;
    let renderedH = rect.height;
    if (imageRatio > containerRatio) {
      renderedH = rect.width / imageRatio;
    } else {
      renderedW = rect.height * imageRatio;
    }
    const offsetX = rect.left + (rect.width - renderedW) / 2;
    const offsetY = rect.top + (rect.height - renderedH) / 2;

    const localX = clientX - offsetX;
    const localY = clientY - offsetY;
    if (localX < 0 || localY < 0 || localX > renderedW || localY > renderedH) return null;

    return {
      x_pct: Math.min(100, Math.max(0, (localX / renderedW) * 100)),
      y_pct: Math.min(100, Math.max(0, (localY / renderedH) * 100)),
    };
  };

  const handlePinImageClick = async (event: ReactMouseEvent<HTMLImageElement>) => {
    if (!modalPhoto?.is_elevation || draggingPinId) return;
    const point = percentFromPointer(event.clientX, event.clientY);
    if (!point) return;

    const nextLabel = String(pins.length + 1);
    const optimisticId = `pending-${Date.now()}`;
    const optimisticPin: PhotoPin = {
      id: optimisticId,
      photo_id: modalPhoto.id,
      project_id: modalPhoto.project_id,
      x_pct: point.x_pct,
      y_pct: point.y_pct,
      label: nextLabel,
      color: 'red',
      sort_order: pins.length,
    };
    setPins((current) => [...current, optimisticPin]);
    try {
      const saved = await api.createPin(modalPhoto.id, {
        x_pct: point.x_pct,
        y_pct: point.y_pct,
        label: nextLabel,
        color: 'red',
        sort_order: pins.length,
      });
      setPins((current) => current.map((pin) => (pin.id === optimisticId ? saved : pin)));
      onRefresh();
    } catch {
      setPins((current) => current.filter((pin) => pin.id !== optimisticId));
    }
  };

  const updatePinLabel = (pinId: string, label: string) => {
    setPins((current) => current.map((pin) => (pin.id === pinId ? { ...pin, label } : pin)));
  };

  const commitPinLabel = async (pinId: string, label: string) => {
    try {
      await api.updatePin(pinId, { label });
      onRefresh();
    } catch {
      // Leave the optimistic label in place; re-typing will resubmit.
    }
  };

  const updatePinColor = async (pinId: string, color: PhotoPin['color']) => {
    setPins((current) => current.map((pin) => (pin.id === pinId ? { ...pin, color } : pin)));
    try {
      await api.updatePin(pinId, { color });
      onRefresh();
    } catch {
      // Non-fatal - the pin keeps its optimistic color locally.
    }
  };

  const deletePin = async (pinId: string) => {
    setPins((current) => current.filter((pin) => pin.id !== pinId));
    try {
      await api.deletePin(pinId);
      onRefresh();
    } catch {
      // Non-fatal - a stale pin left in local state can be removed again on next open.
    }
  };

  const handlePinPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, pinId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setDraggingPinId(pinId);
  };

  useEffect(() => {
    if (!draggingPinId) return;

    const handleMove = (event: PointerEvent) => {
      const point = percentFromPointer(event.clientX, event.clientY);
      if (!point) return;
      setPins((current) => current.map((pin) => (pin.id === draggingPinId ? { ...pin, ...point } : pin)));
    };
    const handleUp = async () => {
      const pinId = draggingPinId;
      setDraggingPinId(null);
      const pin = pins.find((item) => item.id === pinId);
      if (pin && pinId && !pinId.startsWith('pending-')) {
        try {
          await api.updatePin(pinId, { x_pct: pin.x_pct, y_pct: pin.y_pct });
          onRefresh();
        } catch {
          // Non-fatal - position stays as last dragged locally until reopened.
        }
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingPinId]);

  // ── Downloads ──────────────────────────────────────────────────────────────

  const downloadSinglePhoto = async (photo: Photo) => {
    try {
      const response = await fetch(api.mediaUrl(photo.storage_url));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = photo.filename || `${displayPhotoLabel(photo)}.jpg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      window.alert(errorMessage(error));
    }
  };

  const togglePhotoSelection = (photoId: string) => {
    setSelectedPhotoIds((current) => current.includes(photoId) ? current.filter((id) => id !== photoId) : [...current, photoId]);
  };

  const selectAllPhotos = () => setSelectedPhotoIds(project.photos.map((photo) => photo.id));
  const clearSelectedPhotos = () => setSelectedPhotoIds([]);

  const triggerArchiveDownload = async (mode: 'all' | 'selected') => {
    const requestedIds = mode === 'selected' ? selectedPhotoIds : [];
    if (mode === 'selected' && requestedIds.length === 0) return;
    setDownloadingArchive(mode);
    try {
      const blob = await api.downloadPhotosArchive(project.id, requestedIds);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const projectName = (project.church_name || project.name || 'project')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
      link.href = url;
      link.download = `${projectName}-photos.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      window.alert(errorMessage(error));
    } finally {
      setDownloadingArchive(null);
    }
  };

  const deleteModalPhoto = async () => {
    if (!modalPhoto || !confirm('Delete this photo?')) return;
    setDeletingPhoto(true);
    try {
      await api.deletePhoto(modalPhoto.id);
      await onRefresh();
      setModalPhotoIndex((current) => {
        if (current === null) return null;
        if (project.photos.length <= 1) return null;
        return Math.max(0, Math.min(current, project.photos.length - 2));
      });
    } finally {
      setDeletingPhoto(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-6">
        <section className="card p-4 md:p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(event) => { appendFiles(event.target.files); event.currentTarget.value = ''; }} />
            <input ref={libraryInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { appendFiles(event.target.files); event.currentTarget.value = ''; }} />
            <button type="button" onClick={() => cameraInputRef.current?.click()} className="btn-primary w-full justify-center text-base">
              <Camera size={18} />
              Take Photo
            </button>
            <button type="button" onClick={() => libraryInputRef.current?.click()} className="btn-secondary w-full justify-center text-base">
              <ImagePlus size={18} />
              Add from Library
            </button>
          </div>
        </section>

        {queue.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-ssg-charcoal">Field uploads</h3>
                <p className="text-[15px] text-ssg-muted">
                  Say or type "window 1 broken lead" for the first photo — it becomes 1A. Leave the next photos blank and they auto-step to 1B, 1C… Say "window 2" to start the next window.
                </p>
              </div>
              <div className="rounded-full bg-white px-3 py-1 text-sm font-medium text-ssg-charcoal shadow-sm">{queue.length} queued</div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {queue.map((item) => {
                const plan = planMap.get(item.id);
                const isActive = queuedPreviewId === item.id;
                const interimTranscript = interimQueueNotes[item.id] ?? '';
                const displayedNote = interimTranscript ? `${item.notes.trim()} ${interimTranscript}`.trim() : item.notes;
                const isListeningToItem = listeningQueueId === item.id;
                return (
                  <div key={item.id} className={['card overflow-hidden border transition', isActive ? 'border-ssg-green' : 'border-black/5'].join(' ')}>
                    <button type="button" onClick={() => setQueuedPreviewId(item.id)} className="relative block aspect-[5/4] w-full overflow-hidden bg-ssg-light md:aspect-[4/3]">
                      <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
                      {item.status === 'queued' && <span className="absolute right-3 top-3 h-3.5 w-3.5 rounded-full bg-orange-400 shadow" />}
                      {item.status === 'uploading' && (
                        <>
                          <div className="absolute inset-0 bg-black/18" />
                          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/30"><div className="h-full w-1/2 animate-pulse bg-ssg-green" /></div>
                          <Loader2 size={18} className="absolute left-3 top-3 animate-spin text-white" />
                        </>
                      )}
                    </button>

                    <div className="space-y-4 p-4">
                      <div className="flex items-center gap-2">
                        <div className="rounded-full bg-ssg-light px-2.5 py-1 text-xs font-semibold text-ssg-green">{plan?.predictedLabel || 'Pending label'}</div>
                        <button type="button" onClick={() => setActiveHelp((current) => current === item.id ? null : item.id)} className="rounded-full p-1 text-ssg-muted hover:bg-ssg-light hover:text-ssg-green" aria-label="Shorthand help"><HelpCircle size={15} /></button>
                        <button type="button" onClick={() => removeQueueItem(item.id)} className="ml-auto rounded-full p-1 text-ssg-muted hover:bg-red-50 hover:text-red-600" aria-label="Remove"><X size={15} /></button>
                      </div>

                      {activeHelp === item.id ? (
                        <div className="rounded-2xl bg-ssg-light p-3 text-xs leading-5 text-ssg-charcoal">
                          {SHORTHAND_HELP.map((line) => <p key={line}>{line}</p>)}
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-sm font-semibold text-ssg-charcoal">Window note</label>
                          <button type="button" onClick={() => toggleQueueDictation(item.id)} className={['inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 transition', isListeningToItem ? 'border-ssg-green bg-ssg-light text-ssg-green' : 'border-black/10 bg-white text-ssg-muted hover:border-ssg-green hover:text-ssg-green'].join(' ')} aria-label={isListeningToItem ? 'Stop voice note' : 'Start voice note'}>
                            {isListeningToItem ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />}
                            {isListeningToItem ? 'Listening…' : 'Voice note'}
                          </button>
                        </div>
                        <textarea className="input min-h-40 resize-none text-base leading-6 md:min-h-28" value={displayedNote} onChange={(event) => updateQueueNote(item.id, event.target.value)} placeholder={'Say "window 1 broken lead" or type shorthand'} spellCheck={false} readOnly={isListeningToItem} />
                        {isListeningToItem ? <p className="text-xs text-ssg-muted">Voice-to-text is writing live. Tap the mic again to stop.</p> : null}
                      </div>

                      {item.error ? (
                        <div className="space-y-2">
                          <p className="text-xs text-red-600">{item.error}</p>
                          <button type="button" onClick={() => retryQueueItem(item.id)} className="btn-secondary w-full justify-center">Retry upload</button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-ssg-charcoal">Project photos</h3>
              <p className="text-[15px] text-ssg-muted">
                Tap a photo to review or edit notes. Use the select buttons to download clean numbered photo sets.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full bg-white px-3 py-1 text-sm font-medium text-ssg-charcoal shadow-sm">{project.photos.length} uploaded</div>
              <div className="rounded-full bg-white px-3 py-1 text-sm font-medium text-ssg-charcoal shadow-sm">{selectedCount} selected</div>
            </div>
          </div>

          {project.photos.length > 0 ? (
            <div className="card flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-ssg-muted">Download photos using the window numbering already assigned in the project, such as {`12A`}.</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={allSelected ? clearSelectedPhotos : selectAllPhotos} className="btn-secondary">{allSelected ? 'Clear all' : 'Select all'}</button>
                <button type="button" onClick={clearSelectedPhotos} disabled={selectedCount === 0} className="btn-secondary">Clear</button>
                <button type="button" onClick={() => void triggerArchiveDownload('selected')} disabled={selectedCount === 0 || downloadingArchive !== null} className="btn-secondary">
                  {downloadingArchive === 'selected' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  Download selected
                </button>
                <button type="button" onClick={() => void triggerArchiveDownload('all')} disabled={project.photos.length === 0 || downloadingArchive !== null} className="btn-primary">
                  {downloadingArchive === 'all' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  Download all
                </button>
              </div>
            </div>
          ) : null}

          {project.photos.length === 0 ? (
            <div className="card px-6 py-16 text-center">
              <p className="text-lg font-semibold text-ssg-charcoal">No photos yet</p>
              <p className="mt-2 text-[15px] text-ssg-muted">Add photos above and they will start uploading automatically.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {project.photos.map((photo) => (
                <div key={photo.id} className="card overflow-hidden text-left">
                  <div className="relative aspect-[4/3] bg-ssg-light">
                    <button type="button" onClick={() => openPhotoModal(photo)} className="block h-full w-full">
                      <img src={api.mediaUrl(photo.thumbnail_url || photo.storage_url)} alt={displayPhotoLabel(photo)} className="h-full w-full object-cover" />
                    </button>
                    <button type="button" onClick={() => togglePhotoSelection(photo.id)} className={['absolute left-3 top-3 flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-xs font-semibold shadow-sm transition', selectedPhotoIds.includes(photo.id) ? 'border-ssg-green bg-ssg-green text-white' : 'border-black/10 bg-white/95 text-ssg-charcoal hover:border-ssg-green hover:text-ssg-green'].join(' ')} aria-label={selectedPhotoIds.includes(photo.id) ? 'Deselect photo' : 'Select photo'}>
                      {selectedPhotoIds.includes(photo.id) ? 'Selected' : 'Select'}
                    </button>
                    <div className="absolute right-3 top-3 rounded-full bg-ssg-green p-1 text-white shadow"><CheckCircle2 size={14} /></div>
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-full bg-ssg-light px-2.5 py-1 text-xs font-semibold text-ssg-green">{displayPhotoLabel(photo)}</div>
                    </div>
                    {/* Note button — opens full modal with voice + auto-save */}
                    <button
                      type="button"
                      onClick={() => openPhotoModal(photo)}
                      className="flex w-full items-center gap-2 rounded-xl border border-black/8 bg-white px-3 py-2.5 text-left text-sm transition hover:border-ssg-green"
                    >
                      <Mic size={13} className="shrink-0 text-ssg-green" />
                      {photo.notes ? (
                        <span className="line-clamp-2 text-ssg-charcoal">{photo.notes}</span>
                      ) : (
                        <span className="italic text-ssg-muted">Add note</span>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {(queuedCount > 0 || uploadInFlight) ? (
        <div className="fixed inset-x-4 bottom-4 z-30 rounded-2xl bg-ssg-green px-4 py-3 text-white shadow-xl md:left-auto md:right-8 md:w-[22rem]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{uploadInFlight ? 'Uploading photos' : 'Photos queued'}</p>
              <p className="text-xs text-white/80">
                {uploadInFlight
                  ? `Uploading ${queue.filter((item) => item.status === 'uploading').length} photo${queue.filter((item) => item.status === 'uploading').length === 1 ? '' : 's'} at once${queuedCount > 0 ? `, ${queuedCount} more queued` : ''}.&`
                  : `${queuedCount} photo${queuedCount === 1 ? '' : 's'} waiting to upload.`}
              </p>
            </div>
            {uploadInFlight ? <Loader2 size={18} className="animate-spin" /> : null}
          </div>
        </div>
      ) : null}

      {modalPhoto ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 md:items-center md:p-6" onClick={() => void closePhotoModal()}>
          <div className="max-h-[95vh] w-full overflow-hidden rounded-t-[2rem] bg-white md:max-w-6xl md:rounded-[2rem]" onClick={(event) => event.stopPropagation()}>
            <div className="grid gap-0 md:grid-cols-[minmax(0,1.2fr)_24rem]">
              <div
                className="relative bg-black"
                onTouchStart={(event) => { const touch = event.changedTouches[0]; if (touch) (event.currentTarget as HTMLDivElement).dataset.touchX = String(touch.clientX); }}
                onTouchEnd={(event) => {
                  const touch = event.changedTouches[0];
                  const start = Number((event.currentTarget as HTMLDivElement).dataset.touchX ?? '0');
                  if (!touch || !start) return;
                  const deltaX = touch.clientX - start;
                  if (deltaX > 50) void goToPreviousModalPhoto();
                  if (deltaX < -50) void goToNextModalPhoto();
                }}
              >
                <button type="button" onClick={() => void goToPreviousModalPhoto()} disabled={modalPhotoIndex === 0} className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-2 text-ssg-charcoal shadow disabled:opacity-40"><ChevronLeft size={20} /></button>
                <img
                  ref={pinImageRef}
                  src={api.mediaUrl(modalPhoto.storage_url)}
                  alt={displayPhotoLabel(modalPhoto)}
                  onClick={(event) => void handlePinImageClick(event)}
                  className={['h-[42vh] w-full object-contain md:h-[76vh]', modalPhoto.is_elevation ? 'cursor-crosshair' : ''].join(' ')}
                />
                {modalPhoto.is_elevation ? pins.map((pin) => (
                  <button
                    key={pin.id}
                    type="button"
                    onPointerDown={(event) => handlePinPointerDown(event, pin.id)}
                    style={{
                      left: `${pin.x_pct}%`,
                      top: `${pin.y_pct}%`,
                      backgroundColor: PIN_COLOR_HEX[pin.color] ?? PIN_COLOR_HEX.red,
                    }}
                    className="absolute z-20 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow active:cursor-grabbing"
                    title={`Pin ${pin.label} - drag to reposition`}
                  >
                    {pin.label}
                  </button>
                )) : null}
                {modalPhoto.is_elevation ? (
                  <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                    Click the photo to drop a numbered pin
                  </div>
                ) : null}
                <button type="button" onClick={() => void goToNextModalPhoto()} disabled={modalPhotoIndex === project.photos.length - 1} className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-2 text-ssg-charcoal shadow disabled:opacity-40"><ChevronRight size={20} /></button>
              </div>

              <div className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="rounded-full bg-ssg-light px-2.5 py-1 text-xs font-semibold text-ssg-green">{displayPhotoLabel(modalPhoto)}</div>
                    <p className="mt-3 text-base font-semibold text-ssg-charcoal">{project.church_name || project.name}</p>
                    <p className="mt-1 text-sm text-ssg-muted">Uploaded {new Date(modalPhoto.uploaded_at).toLocaleDateString()}</p>
                  </div>
                  <button type="button" onClick={() => void closePhotoModal()} className="rounded-full p-2 text-ssg-muted hover:bg-ssg-light hover:text-ssg-charcoal"><X size={18} /></button>
                </div>

                <div className="rounded-2xl bg-[#f7f6f2] p-4 text-sm leading-6 text-ssg-charcoal">
                  <p><strong>Window:</strong> {photoWindowSummary(modalPhoto)}</p>
                  {modalPhoto.elevation ? <p><strong>Elevation:</strong> {modalPhoto.elevation}</p> : null}
                  <p><strong>Project:</strong> {project.name}</p>
                </div>

                <div className="rounded-2xl border border-black/10 p-4">
                  <label className="flex items-center justify-between gap-3">
                    <span>
                      <span className="text-sm font-semibold text-ssg-charcoal">Elevation reference photo</span>
                      <span className="mt-0.5 block text-xs text-ssg-muted">Wide exterior shot for the report&apos;s large annotated pages - click the photo to drop numbered pins.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(modalPhoto.is_elevation)}
                      onChange={() => void toggleElevationPhoto()}
                      disabled={savingElevation}
                      className="h-5 w-5 shrink-0 accent-ssg-green"
                    />
                  </label>

                  {modalPhoto.is_elevation ? (
                    <div className="mt-3 space-y-3 border-t border-black/10 pt-3">
                      <label className="flex items-center gap-2 text-xs text-ssg-muted">
                        Side of building
                        <select
                          className="input h-8 flex-1 text-sm"
                          value={modalPhoto.elevation ?? ''}
                          onChange={(event) => void setElevationSide(event.target.value)}
                        >
                          <option value="">Not set</option>
                          <option value="north">North</option>
                          <option value="south">South</option>
                          <option value="east">East</option>
                          <option value="west">West</option>
                        </select>
                      </label>
                      {pins.length === 0 ? (
                        <p className="text-xs text-ssg-muted">No pins yet - click anywhere on the photo to add one.</p>
                      ) : pins.map((pin) => (
                        <div key={pin.id} className="flex items-center gap-2">
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                            style={{ backgroundColor: PIN_COLOR_HEX[pin.color] ?? PIN_COLOR_HEX.red }}
                          >
                            {pin.label}
                          </span>
                          <input
                            className="input h-9 min-w-0 flex-1 text-sm"
                            value={pin.label}
                            onChange={(event) => updatePinLabel(pin.id, event.target.value)}
                            onBlur={(event) => void commitPinLabel(pin.id, event.target.value)}
                            placeholder="Window label"
                          />
                          <select
                            className="input h-9 w-28 text-sm"
                            value={pin.color}
                            onChange={(event) => void updatePinColor(pin.id, event.target.value as PhotoPin['color'])}
                          >
                            {PIN_COLORS.map((color) => (
                              <option key={color} value={color}>{color[0].toUpperCase() + color.slice(1)}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => void deletePin(pin.id)}
                            className="rounded-full p-1.5 text-ssg-muted hover:bg-red-50 hover:text-red-600"
                            aria-label="Delete pin"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-black/10 p-4">
                  <label className="label">Dimensions (inches)</label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="Width"
                      className="input h-9 text-sm"
                      value={dimWidth}
                      onChange={(event) => setDimWidth(event.target.value)}
                      onBlur={() => void commitDimensions()}
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="Height"
                      className="input h-9 text-sm"
                      value={dimHeight}
                      onChange={(event) => setDimHeight(event.target.value)}
                      onBlur={() => void commitDimensions()}
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="Depth"
                      className="input h-9 text-sm"
                      value={dimDepth}
                      onChange={(event) => setDimDepth(event.target.value)}
                      onBlur={() => void commitDimensions()}
                    />
                  </div>
                  {savingDimensions ? <p className="mt-1 text-xs text-ssg-muted">Saving…</p> : null}

                  {dimensionPresets.length > 0 ? (
                    <div className="mt-3 border-t border-black/10 pt-3">
                      <p className="mb-2 text-xs text-ssg-muted">Reuse a size already used in this project:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {dimensionPresets.map((preset) => (
                          <button
                            key={`${preset.width}x${preset.height}x${preset.depth ?? ''}`}
                            type="button"
                            onClick={() => applyDimensionPreset(preset)}
                            className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-ssg-light px-3 py-1 text-xs font-medium text-ssg-charcoal hover:border-ssg-green hover:text-ssg-green"
                          >
                            {preset.width}&Prime; x {preset.height}&Prime;{preset.depth != null ? ` x ${preset.depth}\u2033` : ''}
                            {preset.count > 1 ? <span className="text-ssg-muted">&middot;{preset.count}</span> : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label className="label">Notes</label>
                    <button
                      type="button"
                      onClick={toggleModalDictation}
                      className={['inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium transition', modalListening ? 'border-ssg-green bg-ssg-light text-ssg-green' : 'border-black/10 bg-white text-ssg-muted hover:border-ssg-green hover:text-ssg-green'].join(' ')}
                    >
                      {modalListening ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} />}
                      {modalListening ? 'Stop' : 'Voice'}
                    </button>
                  </div>
                  {modalListening && interimModalNote ? (
                    <div className="mb-2 rounded-xl bg-ssg-green/10 px-3 py-2 text-sm italic text-ssg-green">{interimModalNote}</div>
                  ) : null}
                  <textarea
                    className="input min-h-32 resize-none"
                    value={modalNote}
                    onChange={(event) => setModalNote(event.target.value)}
                    placeholder="Add shorthand and note (e.g. window 1 broken lead)"
                    readOnly={modalListening}
                  />
                  {savingNote ? <p className="mt-1 text-xs text-ssg-muted">Saving…</p> : null}
                </div>

                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => void downloadSinglePhoto(modalPhoto)} className="btn-secondary">
                    <Download size={16} />
                    Download
                  </button>
                  <button type="button" onClick={() => void deleteModalPhoto()} disabled={deletingPhoto} className="btn-ghost text-red-600 hover:bg-red-50">
                    <Trash2 size={16} />
                    {deletingPhoto ? 'Deleting...' : 'Delete'}
                  </button>
                  <button type="button" onClick={() => void saveModalNote()} disabled={savingNote} className="btn-primary ml-auto">
                    {savingNote ? <Loader2 size={16} className="animate-spin" /> : null}
                    {savingNote ? 'Saving...' : 'Save note'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
