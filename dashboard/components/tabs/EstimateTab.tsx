'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Sparkles, Trash2, X } from 'lucide-react';
import api, { type Photo, type ProjectDetail, type Report } from '@/lib/api';
import {
  createEmptyReportDraft,
  estimateBriefsFromNarrative,
  type EstimateBriefDraft,
  type ReportDraft,
  reportDraftFromNarrative,
} from '@/lib/reportDraft';

interface Props {
  project: ProjectDetail;
  onRefresh: () => void;
}

function emptyDraft(project: ProjectDetail, narrative?: Record<string, unknown> | null): ReportDraft {
  return narrative ? reportDraftFromNarrative(narrative, project) : createEmptyReportDraft(project);
}

function selectedPhotos(photos: Photo[], ids: string[]) {
  return ids
    .map((id) => photos.find((photo) => photo.id === id) ?? null)
    .filter((photo): photo is Photo => Boolean(photo));
}

function photoLabel(photo: Photo) {
  if (photo.filename) return photo.filename.replace(/\.[^.]+$/, '');
  if (photo.window_number) return `${photo.window_number}${photo.panel_letter ?? ''}`;
  return 'Photo';
}

export default function EstimateTab({ project, onRefresh }: Props) {
  const [report, setReport] = useState<Report | null>(project.latest_report ?? null);
  const [draft, setDraft] = useState<ReportDraft>(() => emptyDraft(project, project.latest_report?.narrative));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [briefModalOpen, setBriefModalOpen] = useState(false);
  const [editingBriefId, setEditingBriefId] = useState<string | null>(null);
  const [briefText, setBriefText] = useState('');
  const [saving, setSaving] = useState(false);
  const [improving, setImproving] = useState(false);
  const [loading, setLoading] = useState(!project.latest_report);

  useEffect(() => {
    setReport(project.latest_report ?? null);
    setDraft(emptyDraft(project, project.latest_report?.narrative));
    setLoading(false);
  }, [project]);

  useEffect(() => {
    if (project.latest_report) return;
    (async () => {
      try {
        const latest = await api.getReport(project.id);
        setReport(latest);
        setDraft(emptyDraft(project, latest.narrative));
      } catch {
        setDraft(createEmptyReportDraft(project));
      } finally {
        setLoading(false);
      }
    })();
  }, [project.id, project.latest_report, project]);

  const briefs = useMemo(() => draft._meta.estimate_briefs ?? [], [draft]);
  const selectedCount = selectedIds.length;

  const persistDraft = async (nextDraft: ReportDraft) => {
    const saved = await api.saveReportDraft(project.id, nextDraft);
    setReport(saved);
    setDraft(emptyDraft(project, saved.narrative));
    await onRefresh();
  };

  const togglePhoto = (photoId: string) => {
    setSelectedIds((current) => (
      current.includes(photoId)
        ? current.filter((id) => id !== photoId)
        : [...current, photoId]
    ));
  };

  const openBriefModal = (brief?: EstimateBriefDraft) => {
    if (brief) {
      setEditingBriefId(brief.id);
      setSelectedIds(brief.photo_ids);
      setBriefText(brief.text);
    } else {
      setEditingBriefId(null);
      setBriefText('');
    }
    setBriefModalOpen(true);
  };

  const closeBriefModal = () => {
    setBriefModalOpen(false);
    setEditingBriefId(null);
    setBriefText('');
  };

  const saveBrief = async () => {
    if (!selectedIds.length || !briefText.trim()) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const nextBrief: EstimateBriefDraft = {
        id: editingBriefId ?? `brief-${Date.now()}`,
        photo_ids: selectedIds,
        text: briefText.trim(),
        created_at: briefs.find((brief) => brief.id === editingBriefId)?.created_at ?? now,
        updated_at: now,
      };

      const nextDraft: ReportDraft = {
        ...draft,
        _meta: {
          ...draft._meta,
          estimate_briefs: editingBriefId
            ? briefs.map((brief) => (brief.id === editingBriefId ? nextBrief : brief))
            : [...briefs, nextBrief],
        },
      };

      await persistDraft(nextDraft);
      setSelectedIds([]);
      closeBriefModal();
    } finally {
      setSaving(false);
    }
  };

  const removeBrief = async (briefId: string) => {
    const nextDraft: ReportDraft = {
      ...draft,
      _meta: {
        ...draft._meta,
        estimate_briefs: briefs.filter((brief) => brief.id !== briefId),
      },
    };
    await persistDraft(nextDraft);
  };

  const improveBrief = async () => {
    if (!briefText.trim()) return;
    setImproving(true);
    try {
      const improved = await api.improveBrief(project.id, briefText);
      setBriefText(improved.text.replace(/—/g, ', '));
    } finally {
      setImproving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ssg-muted">
        <Loader2 size={16} className="animate-spin" />
        Loading estimate workspace...
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <section className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold text-ssg-charcoal">Select project photos</h3>
            <p className="text-[15px] text-ssg-muted">
              Tap photos to build grouped work briefs for the estimator.
            </p>
          </div>

          {project.photos.length === 0 ? (
            <div className="card px-6 py-16 text-center">
              <p className="text-lg font-semibold text-ssg-charcoal">No photos available</p>
              <p className="mt-2 text-[15px] text-ssg-muted">
                Upload project photos first, then come back here to write briefs.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {project.photos.map((photo) => {
                const active = selectedIds.includes(photo.id);
                return (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => togglePhoto(photo.id)}
                    className={[
                      'card overflow-hidden border text-left transition',
                      active ? 'border-ssg-green ring-2 ring-ssg-green/20' : 'border-black/5',
                    ].join(' ')}
                  >
                    <div className="relative aspect-[4/3]">
                      <img
                        src={api.mediaUrl(photo.thumbnail_url || photo.storage_url)}
                        alt={photoLabel(photo)}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute left-3 top-3">
                        <span
                          className={[
                            'flex h-6 w-6 items-center justify-center rounded-full border bg-white/95',
                            active ? 'border-ssg-green text-ssg-green' : 'border-black/15 text-transparent',
                          ].join(' ')}
                        >
                          <CheckCircle2 size={14} />
                        </span>
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="truncate text-sm font-semibold text-ssg-charcoal">{photoLabel(photo)}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-ssg-muted">
                        {photo.notes?.trim() || 'Tap to select this photo'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold text-ssg-charcoal">Saved briefs</h3>
            <p className="text-[15px] text-ssg-muted">
              Each brief groups selected photos with a polished internal description of needed work.
            </p>
          </div>

          {briefs.length === 0 ? (
            <div className="card px-6 py-14 text-center">
              <p className="text-lg font-semibold text-ssg-charcoal">No briefs yet</p>
              <p className="mt-2 text-[15px] text-ssg-muted">
                Select project photos and write the first brief.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {briefs.map((brief) => {
                const photos = selectedPhotos(project.photos, brief.photo_ids);
                return (
                  <div key={brief.id} className="card p-4 md:p-5">
                    <div className="grid gap-4 md:grid-cols-[13rem_minmax(0,1fr)]">
                      <div className="grid grid-cols-3 gap-2 md:grid-cols-2">
                        {photos.map((photo) => (
                          <img
                            key={photo.id}
                            src={api.mediaUrl(photo.thumbnail_url || photo.storage_url)}
                            alt={photoLabel(photo)}
                            className="h-24 w-full rounded-2xl object-cover"
                          />
                        ))}
                      </div>

                      <div className="space-y-3">
                        <p className="whitespace-pre-wrap text-[15px] leading-7 text-ssg-charcoal">
                          {brief.text}
                        </p>
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => openBriefModal(brief)}
                            className="btn-secondary"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeBrief(brief.id)}
                            className="btn-ghost text-red-600 hover:bg-red-50"
                          >
                            <Trash2 size={16} />
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {selectedCount > 0 ? (
        <div className="fixed inset-x-4 bottom-4 z-30 rounded-2xl bg-ssg-green px-4 py-3 text-white shadow-xl md:left-auto md:right-8 md:w-[24rem]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Selected ({selectedCount})</p>
              <p className="text-xs text-white/80">Create a grouped brief from these photos.</p>
            </div>
            <button
              type="button"
              onClick={() => openBriefModal()}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-ssg-green"
            >
              Write Brief
            </button>
          </div>
        </div>
      ) : null}

      {briefModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 md:items-center md:p-6"
          onClick={closeBriefModal}
        >
          <div
            className="w-full overflow-hidden rounded-t-[2rem] bg-white md:max-w-3xl md:rounded-[2rem]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="space-y-5 p-5 md:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-ssg-charcoal">Write Brief</h3>
                  <p className="text-[15px] text-ssg-muted">
                    Describe what these photos show and what work is needed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeBriefModal}
                  className="rounded-full p-2 text-ssg-muted hover:bg-ssg-light hover:text-ssg-charcoal"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-1">
                {selectedPhotos(project.photos, selectedIds).map((photo) => (
                  <img
                    key={photo.id}
                    src={api.mediaUrl(photo.thumbnail_url || photo.storage_url)}
                    alt={photoLabel(photo)}
                    className="h-20 w-20 rounded-2xl object-cover"
                  />
                ))}
              </div>

              <div>
                <label className="label">Brief</label>
                <textarea
                  className="input min-h-36 resize-none"
                  value={briefText}
                  onChange={(event) => setBriefText(event.target.value.replace(/—/g, ', '))}
                  placeholder="Describe what these photos show and what work is needed."
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={improveBrief}
                  disabled={improving || !briefText.trim()}
                  className="btn-secondary"
                >
                  {improving ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  Improve with AI
                </button>
                <button
                  type="button"
                  onClick={saveBrief}
                  disabled={saving || !briefText.trim() || !selectedIds.length}
                  className="btn-primary ml-auto"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                  {saving ? 'Saving...' : 'Save Brief'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
