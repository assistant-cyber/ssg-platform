'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Mic } from 'lucide-react';
import api, { type Photo } from '@/lib/api';

interface Props {
  photos: Photo[];
  selectedPhotoIds: string[];
  onPhotoClick: (photo: Photo) => void;
  onToggleSelection: (photoId: string) => void;
}

interface WindowGroup {
  windowNumber: string;
  photos: Photo[];
}

function displayPhotoLabel(photo: Photo) {
  if (photo.filename) return photo.filename.replace(/\.[^.]+$/, '');
  if (photo.window_number) return `${photo.window_number}${photo.panel_letter ?? ''}`;
  return 'Photo';
}

export default function WindowGroupedGallery({
  photos,
  selectedPhotoIds,
  onPhotoClick,
  onToggleSelection,
}: Props) {
  const [collapsedWindows, setCollapsedWindows] = useState<Set<string>>(new Set());

  // Group photos by window_number
  const windowGroups: WindowGroup[] = [];
  const unassignedPhotos: Photo[] = [];
  const windowMap = new Map<string, Photo[]>();

  photos.forEach((photo) => {
    if (photo.window_number != null) {
      const windowNum = photo.window_number;
      if (!windowMap.has(windowNum)) {
        windowMap.set(windowNum, []);
      }
      windowMap.get(windowNum)!.push(photo);
    } else {
      unassignedPhotos.push(photo);
    }
  });

  // Sort windows numerically (parse as numbers for correct ordering)
  const windowNumbers = Array.from(windowMap.keys()).sort((a, b) => {
    const numA = parseInt(a, 10);
    const numB = parseInt(b, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });
  windowNumbers.forEach((windowNum) => {
    const windowPhotos = windowMap.get(windowNum)!;
    // Sort photos within window by panel_letter (a, b, c...)
    windowPhotos.sort((a, b) => {
      const letterA = a.panel_letter ?? '';
      const letterB = b.panel_letter ?? '';
      return letterA.localeCompare(letterB);
    });
    windowGroups.push({ windowNumber: windowNum, photos: windowPhotos });
  });

  const toggleWindowCollapse = (windowNum: string) => {
    setCollapsedWindows((prev) => {
      const next = new Set(prev);
      if (next.has(windowNum)) {
        next.delete(windowNum);
      } else {
        next.add(windowNum);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {windowGroups.map((group) => {
        const isCollapsed = collapsedWindows.has(group.windowNumber);
        return (
          <div key={group.windowNumber} className="space-y-3">
            <button
              type="button"
              onClick={() => toggleWindowCollapse(group.windowNumber)}
              className="flex w-full items-center gap-2 text-left"
            >
              {isCollapsed ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
              <h4 className="text-lg font-semibold text-ssg-charcoal">
                Window {group.windowNumber} — {group.photos.length} photo{group.photos.length === 1 ? '' : 's'}
              </h4>
            </button>

            {!isCollapsed && (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {group.photos.map((photo) => (
                  <div key={photo.id} className="card overflow-hidden text-left">
                    <div className="relative aspect-[4/3] bg-ssg-light">
                      <button
                        type="button"
                        onClick={() => onPhotoClick(photo)}
                        className="block h-full w-full"
                      >
                        <img
                          src={api.mediaUrl(photo.thumbnail_url || photo.storage_url)}
                          alt={displayPhotoLabel(photo)}
                          className="h-full w-full object-cover"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleSelection(photo.id)}
                        className={[
                          'absolute left-3 top-3 flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-xs font-semibold shadow-sm transition',
                          selectedPhotoIds.includes(photo.id)
                            ? 'border-ssg-green bg-ssg-green text-white'
                            : 'border-black/10 bg-white/95 text-ssg-charcoal hover:border-ssg-green hover:text-ssg-green',
                        ].join(' ')}
                        aria-label={selectedPhotoIds.includes(photo.id) ? 'Deselect photo' : 'Select photo'}
                      >
                        {selectedPhotoIds.includes(photo.id) ? 'Selected' : 'Select'}
                      </button>
                      {(photo.ai_panes != null || photo.ai_sqft != null) && (
                        <div className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                          {photo.ai_panes != null && `${photo.ai_panes} panes`}
                          {photo.ai_panes != null && photo.ai_sqft != null && ' · '}
                          {photo.ai_sqft != null && `${photo.ai_sqft} sqft`}
                        </div>
                      )}
                      <div className="absolute right-3 top-3 rounded-full bg-ssg-green p-1 text-white shadow">
                        <CheckCircle2 size={14} />
                      </div>
                    </div>
                    <div className="space-y-2 p-3">
                      <div className="flex items-center gap-2">
                        <div className="rounded-full bg-ssg-light px-2.5 py-1 text-xs font-semibold text-ssg-green">
                          {displayPhotoLabel(photo)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onPhotoClick(photo)}
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
          </div>
        );
      })}

      {unassignedPhotos.length > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => toggleWindowCollapse('unassigned')}
            className="flex w-full items-center gap-2 text-left"
          >
            {collapsedWindows.has('unassigned') ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
            <h4 className="text-lg font-semibold text-ssg-charcoal">
              Site &amp; Elevation — {unassignedPhotos.length} photo{unassignedPhotos.length === 1 ? '' : 's'}
            </h4>
          </button>

          {!collapsedWindows.has('unassigned') && (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {unassignedPhotos.map((photo) => (
                <div key={photo.id} className="card overflow-hidden text-left">
                  <div className="relative aspect-[4/3] bg-ssg-light">
                    <button
                      type="button"
                      onClick={() => onPhotoClick(photo)}
                      className="block h-full w-full"
                    >
                      <img
                        src={api.mediaUrl(photo.thumbnail_url || photo.storage_url)}
                        alt={displayPhotoLabel(photo)}
                        className="h-full w-full object-cover"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleSelection(photo.id)}
                      className={[
                        'absolute left-3 top-3 flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-xs font-semibold shadow-sm transition',
                        selectedPhotoIds.includes(photo.id)
                          ? 'border-ssg-green bg-ssg-green text-white'
                          : 'border-black/10 bg-white/95 text-ssg-charcoal hover:border-ssg-green hover:text-ssg-green',
                      ].join(' ')}
                      aria-label={selectedPhotoIds.includes(photo.id) ? 'Deselect photo' : 'Select photo'}
                    >
                      {selectedPhotoIds.includes(photo.id) ? 'Selected' : 'Select'}
                    </button>
                    {(photo.ai_panes != null || photo.ai_sqft != null) && (
                      <div className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                        {photo.ai_panes != null && `${photo.ai_panes} panes`}
                        {photo.ai_panes != null && photo.ai_sqft != null && ' · '}
                        {photo.ai_sqft != null && `${photo.ai_sqft} sqft`}
                      </div>
                    )}
                    <div className="absolute right-3 top-3 rounded-full bg-ssg-green p-1 text-white shadow">
                      <CheckCircle2 size={14} />
                    </div>
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-full bg-ssg-light px-2.5 py-1 text-xs font-semibold text-ssg-green">
                        {displayPhotoLabel(photo)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onPhotoClick(photo)}
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
        </div>
      )}
    </div>
  );
}
