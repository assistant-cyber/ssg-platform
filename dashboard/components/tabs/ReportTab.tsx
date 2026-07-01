'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileText,
  Loader2,
  Sparkles,
} from 'lucide-react';
import api, { type ProjectDetail, type Report } from '@/lib/api';
import {
  createEmptyReportDraft,
  DEFAULT_CONDITION_SCHEDULE_INTRO,
  DEFAULT_CONDITION_SCHEDULE_TITLE,
  findPhotoById,
  REPORT_SECTIONS,
  reportDraftFromNarrative,
  selectedPhotosForSection,
  type ReportConditionScheduleRow,
  type ReportDraft,
  type ReportSectionKey,
} from '@/lib/reportDraft';

interface Props {
  project: ProjectDetail;
  onRefresh: () => void;
}

type GenState = 'idle' | 'running' | 'done' | 'error';
type VoiceOption = 'pastoral_confident' | 'heritage_stewardship' | 'concise_executive';
const DEFAULT_REPORT_VOICE: VoiceOption = 'concise_executive';

function previewCardClass(editing: boolean) {
  return editing ? 'border-ssg-green ring-2 ring-ssg-green/15' : 'border-black/5';
}

function displayReportPhotoLabel(photo: ProjectDetail['photos'][number]) {
  if (photo.window_number) return `${photo.window_number}${photo.panel_letter ?? ''}`;
  if (photo.filename) return photo.filename.replace(/\.[^.]+$/, '');
  return 'Photo';
}

export default function ReportTab({ project, onRefresh }: Props) {
  const [report, setReport] = useState<Report | null>(project.latest_report ?? null);
  const [draft, setDraft] = useState<ReportDraft>(() => reportDraftFromNarrative(project.latest_report?.narrative, project));
  const [loading, setLoading] = useState(!project.latest_report);
  const [saving, setSaving] = useState(false);
  const [genState, setGenState] = useState<GenState>('idle');
  const [editingSections, setEditingSections] = useState<Record<string, boolean>>({});
  const [editingAppendix, setEditingAppendix] = useState(false);
  const [aiVoice, setAiVoice] = useState<VoiceOption>(DEFAULT_REPORT_VOICE);
  const [aiContext, setAiContext] = useState('');
  const [aiWriting, setAiWriting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setReport(project.latest_report ?? null);
    setDraft(reportDraftFromNarrative(project.latest_report?.narrative, project));
    setAiVoice((project.latest_report?.narrative?._meta as { ai_voice?: VoiceOption } | undefined)?.ai_voice ?? DEFAULT_REPORT_VOICE);
    setAiContext((project.latest_report?.narrative?._meta as { ai_context?: string } | undefined)?.ai_context ?? '');
    setLoading(false);
    setIsDraftDirty(false);
  }, [project]);

  useEffect(() => () => {
    if (pollRef.current) clearTimeout(pollRef.current);
  }, []);

  useEffect(() => {
    if (project.latest_report) return;
    (async () => {
      try {
        const latest = await api.getReport(project.id);
        setReport(latest);
        setDraft(reportDraftFromNarrative(latest.narrative, project));
        setAiVoice((latest.narrative?._meta as { ai_voice?: VoiceOption } | undefined)?.ai_voice ?? DEFAULT_REPORT_VOICE);
        setAiContext((latest.narrative?._meta as { ai_context?: string } | undefined)?.ai_context ?? '');
      } catch {
        setDraft(createEmptyReportDraft(project));
      } finally {
        setLoading(false);
        setIsDraftDirty(false);
      }
    })();
  }, [project.id, project.latest_report, project]);

  const saveDraft = async (nextDraft = draft) => {
    setSaving(true);
    try {
      const saved = await api.saveReportDraft(project.id, nextDraft);
      setReport(saved);
      setDraft(reportDraftFromNarrative(saved.narrative, project));
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const pollReport = async (attempt = 0): Promise<void> => {
    if (attempt > 200) {
      setGenState('error');
      return;
    }
    try {
      const latest = await api.getReport(project.id);
      setReport(latest);
      setDraft(reportDraftFromNarrative(latest.narrative, project));
      if (latest.pdf_url) {
        setGenState('done');
        setIsDraftDirty(false);
        await onRefresh();
        return;
      }
      // The backend writes any error from the background task into the
      // report's narrative under _error. Surface it so the user knows
      // why their PDF never appeared.
      const err = (latest.narrative as { _error?: string } | null)?._error;
      if (err) {
        setGenState('error');
        return;
      }
    } catch {
      // keep polling
    }

    pollRef.current = setTimeout(() => {
      void pollReport(attempt + 1);
    }, 1500);
  };

  const handleGenerate = async () => {
    setGenState('running');
    try {
      const queued = await api.generateReport(project.id, draft, 'shorthand', true);
      setReport(queued);
      setDraft(reportDraftFromNarrative(queued.narrative, project));
      pollRef.current = setTimeout(() => {
        void pollReport();
      }, 1000);
    } catch {
      setGenState('error');
    }
  };

  const handleGenerateAiDraft = async () => {
    setAiWriting(true);
    setAiError(null);
    try {
      const generated = await api.generateAiReportDraft(project.id, {
        voice: aiVoice,
        additional_context: aiContext,
      });
      setReport(generated);
      setDraft(reportDraftFromNarrative(generated.narrative, project));
      setIsDraftDirty(true);
      await onRefresh();
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Unable to generate AI report draft.');
    } finally {
      setAiWriting(false);
    }
  };

  const updateSection = (
    sectionKey: ReportSectionKey,
    field: 'title' | 'subtitle' | 'body',
    value: string,
  ) => {
    setIsDraftDirty(true);
    setDraft((current) => ({
      ...current,
      _meta: {
        ...current._meta,
        ai_voice: aiVoice,
        ai_context: aiContext,
      },
      [sectionKey]: {
        ...current[sectionKey],
        [field]: value.replace(/—/g, ', '),
      },
    }));
  };

  const toggleSectionPhoto = (sectionKey: ReportSectionKey, photoId: string) => {
    setIsDraftDirty(true);
    setDraft((current) => {
      const selected = current[sectionKey].photo_ids;
      return {
        ...current,
        _meta: {
          ...current._meta,
          ai_voice: aiVoice,
          ai_context: aiContext,
        },
        [sectionKey]: {
          ...current[sectionKey],
          photo_ids: selected.includes(photoId)
            ? selected.filter((id) => id !== photoId)
            : [...selected, photoId],
        },
      };
    });
  };

  const toggleEdit = (sectionKey: ReportSectionKey) => {
    setEditingSections((current) => ({ ...current, [sectionKey]: !current[sectionKey] }));
  };

  const updateConditionScheduleMeta = (
    field: 'condition_schedule_title' | 'condition_schedule_intro',
    value: string,
  ) => {
    setIsDraftDirty(true);
    setDraft((current) => ({
      ...current,
      _meta: {
        ...current._meta,
        [field]: value,
      },
    }));
  };

  const updateConditionScheduleRow = (
    index: number,
    field: keyof ReportConditionScheduleRow,
    value: string,
  ) => {
    setIsDraftDirty(true);
    setDraft((current) => ({
      ...current,
      _meta: {
        ...current._meta,
        condition_schedule_rows: (current._meta.condition_schedule_rows ?? []).map((row, rowIndex) => (
          rowIndex === index
            ? {
                ...row,
                [field]: value.replace(/—/g, ', '),
              }
            : row
        )),
      },
    }));
  };

  const markDownloaded = async () => {
    const now = new Date().toISOString();
    const nextDraft: ReportDraft = {
      ...draft,
      _meta: {
        ...draft._meta,
        report_downloaded_at: now,
      },
    };
    setDraft(nextDraft);
    await saveDraft(nextDraft);
    if (report?.pdf_url) {
      window.open(api.mediaUrl(report.pdf_url), '_blank', 'noopener,noreferrer');
    }
  };

  const portalPublished = Boolean(draft._meta.portal_published_at);
  const coverPhoto = findPhotoById(project.photos, draft._meta.cover_photo_id) ?? project.photos[0] ?? null;

  const renderedPreview = useMemo(() => (
    <div className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-sm">
      <div
        className="px-6 py-8 text-white"
        style={{
          backgroundImage: coverPhoto
            ? `linear-gradient(180deg, rgba(20,26,20,0.34) 0%, rgba(20,26,20,0.78) 100%), url(${api.mediaUrl(coverPhoto.storage_url)})`
            : 'linear-gradient(135deg, #4a4a4a 0%, #72B034 100%)',
          backgroundPosition: 'center',
          backgroundSize: 'cover',
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/80">
          {draft._meta.report_label}
        </p>
        <h3 className="mt-3 text-3xl font-semibold">{draft._meta.report_title}</h3>
        <p className="mt-3 max-w-2xl text-sm text-white/82">{draft._meta.report_subtitle}</p>
      </div>

      <div className="space-y-4 p-4 md:p-5">
        {REPORT_SECTIONS.map((section) => (
          <div key={section.key} className="rounded-[1.5rem] border border-black/5 bg-ssg-lighter p-4">
            <p className="font-serif text-2xl font-semibold text-ssg-charcoal">
              {draft[section.key].title || section.title}
            </p>
            <p className="mt-1 text-sm text-ssg-muted">
              {draft[section.key].subtitle || section.subtitle}
            </p>
            <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-ssg-charcoal">
              {draft[section.key].body || 'Draft content will appear here after generation.'}
            </p>
          </div>
        ))}
      </div>
    </div>
  ), [coverPhoto, draft]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ssg-muted">
        <Loader2 size={16} className="animate-spin" />
        Loading report workspace...
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 pb-28">
        <section className="card p-5 md:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)] lg:items-start">
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-semibold text-ssg-charcoal">AI Report Writer</h3>
                <p className="mt-1 text-[15px] text-ssg-muted">
                  Write the full customer report in a consistently professional voice, then edit every section below before building the final PDF.
                </p>
              </div>

              <div className="rounded-2xl border border-black/5 bg-ssg-lighter p-4">
                <p className="text-sm font-semibold text-ssg-charcoal">Current workflow</p>
                <p className="mt-2 text-sm leading-6 text-ssg-muted">
                  1. Write full report.
                  <br />
                  2. Edit section copy and photo selections.
                  <br />
                  3. Build the customer PDF and publish it to the customer portal automatically.
                </p>
              </div>

              <label className="space-y-2">
                <span className="label mb-0">Extra context for AI</span>
                <textarea
                  value={aiContext}
                  onChange={(event) => {
                    const nextContext = event.target.value;
                    setAiContext(nextContext);
                    setIsDraftDirty(true);
                    setDraft((current) => ({
                      ...current,
                      _meta: {
                        ...current._meta,
                        ai_voice: aiVoice,
                        ai_context: nextContext,
                      },
                    }));
                  }}
                  className="input min-h-32 resize-y"
                  placeholder="Add anything the AI should know about this church, the intended tone, restoration priorities, historical context, or customer-specific framing."
                />
              </label>

              {aiError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {aiError}
                </div>
              ) : null}
            </div>

            <div className="rounded-[1.75rem] border border-black/5 bg-ssg-lighter p-4 md:p-5">
              <p className="text-sm font-semibold text-ssg-charcoal">Draft actions</p>
              <p className="mt-2 text-sm leading-6 text-ssg-muted">
                AI writes the first full version. Building the PDF also pushes the finished report to the customer portal.
              </p>

              <div className="mt-5 space-y-3">
                <button
                  type="button"
                  onClick={() => void handleGenerateAiDraft()}
                  disabled={aiWriting || !project.photos.length}
                  className="btn-primary w-full justify-center"
                >
                  {aiWriting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  {aiWriting ? 'Writing Report...' : 'Write Full Report'}
                </button>

                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={genState === 'running' || !project.photos.length}
                  className="btn-secondary w-full justify-center"
                >
                  {genState === 'running' ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                  {genState === 'running' ? 'Building PDF… (this can take a couple of minutes for large projects)' : 'Build PDF'}
                </button>
              </div>

              <p className="mt-4 text-xs leading-5 text-ssg-muted">
                {isDraftDirty
                  ? 'The editable draft has changes that are not reflected in the PDF yet.'
                  : report?.pdf_url
                    ? 'The current PDF matches the latest built draft.'
                    : 'No PDF has been built from this draft yet.'}
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          {REPORT_SECTIONS.map((section) => {
            const editing = Boolean(editingSections[section.key]);
            const photos = selectedPhotosForSection(draft, project.photos, section.key);
            return (
              <div key={section.key} className={`card p-5 md:p-6 ${previewCardClass(editing)}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-serif text-2xl font-semibold text-ssg-charcoal">
                      {draft[section.key].title || section.title}
                    </p>
                    <p className="mt-1 text-[15px] text-ssg-muted">
                      {draft[section.key].subtitle || section.subtitle}
                    </p>
                  </div>
                  <button type="button" onClick={() => toggleEdit(section.key)} className="btn-secondary">
                    <Edit3 size={16} />
                    {editing ? 'Done' : 'Edit'}
                  </button>
                </div>

                {editing ? (
                  <div className="mt-4 space-y-4">
                    <input
                      className="input"
                      value={draft[section.key].title || ''}
                      onChange={(event) => updateSection(section.key, 'title', event.target.value)}
                      placeholder="Section title"
                    />
                    <input
                      className="input"
                      value={draft[section.key].subtitle || ''}
                      onChange={(event) => updateSection(section.key, 'subtitle', event.target.value)}
                      placeholder="Section subtitle"
                    />
                    <textarea
                      className="input min-h-44 resize-y"
                      value={draft[section.key].body}
                      onChange={(event) => updateSection(section.key, 'body', event.target.value)}
                      placeholder={section.placeholder}
                    />
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-ssg-charcoal">Section photos</p>
                      <p className="text-xs text-ssg-muted">
                        Attach the exact photos that support the problems described here. Labels like `1A` are used to connect the text to real images.
                      </p>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {project.photos.map((photo) => {
                          const active = draft[section.key].photo_ids.includes(photo.id);
                          return (
                            <button
                              key={photo.id}
                              type="button"
                              onClick={() => toggleSectionPhoto(section.key, photo.id)}
                              className={[
                                'overflow-hidden rounded-2xl border text-left transition',
                                active ? 'border-ssg-green ring-2 ring-ssg-green/20' : 'border-black/5',
                              ].join(' ')}
                            >
                              <img
                                src={api.mediaUrl(photo.thumbnail_url || photo.storage_url)}
                                alt={photo.filename ?? 'Project photo'}
                                className="h-24 w-full object-cover"
                              />
                              <div className="p-2 text-xs font-medium text-ssg-charcoal">
                                <div>{displayReportPhotoLabel(photo)}</div>
                                <div className="mt-0.5 text-[11px] font-normal text-ssg-muted">
                                  {photo.filename?.replace(/\.[^.]+$/, '') || 'Photo'}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <button type="button" onClick={() => void saveDraft()} className="btn-primary">
                      {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                      {saving ? 'Saving...' : 'Save Section'}
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    <p className="whitespace-pre-wrap text-[15px] leading-7 text-ssg-charcoal">
                      {draft[section.key].body || 'No draft text yet.'}
                    </p>

                    {photos.length > 0 ? (
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {photos.map((photo) => (
                          <div key={photo.id} className="overflow-hidden rounded-2xl border border-black/5 bg-white">
                            <img
                              src={api.mediaUrl(photo.thumbnail_url || photo.storage_url)}
                              alt={photo.filename ?? 'Project photo'}
                              className="h-24 w-full object-cover"
                            />
                            <div className="p-2 text-xs font-medium text-ssg-charcoal">
                              <div>{displayReportPhotoLabel(photo)}</div>
                              <div className="mt-0.5 text-[11px] font-normal text-ssg-muted">
                                {photo.filename?.replace(/\.[^.]+$/, '') || 'Photo'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <section className={`card p-5 md:p-6 ${previewCardClass(editingAppendix)}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-serif text-2xl font-semibold text-ssg-charcoal">
                {draft._meta.condition_schedule_title || DEFAULT_CONDITION_SCHEDULE_TITLE}
              </p>
              <p className="mt-1 text-[15px] text-ssg-muted">
                This schedule controls the Appendix 4 table in the PDF and can be reviewed before publishing.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingAppendix((current) => !current)}
              className="btn-secondary"
            >
              <Edit3 size={16} />
              {editingAppendix ? 'Done' : 'Edit'}
            </button>
          </div>

          {editingAppendix ? (
            <div className="mt-4 space-y-4">
              <input
                className="input"
                value={draft._meta.condition_schedule_title || DEFAULT_CONDITION_SCHEDULE_TITLE}
                onChange={(event) => updateConditionScheduleMeta('condition_schedule_title', event.target.value)}
                placeholder="Appendix title"
              />
              <textarea
                className="input min-h-28 resize-y"
                value={draft._meta.condition_schedule_intro || DEFAULT_CONDITION_SCHEDULE_INTRO}
                onChange={(event) => updateConditionScheduleMeta('condition_schedule_intro', event.target.value)}
                placeholder="Explain how to read the condition schedule."
              />

              <div className="overflow-x-auto rounded-2xl border border-black/5">
                <table className="min-w-[76rem] divide-y divide-black/5 text-sm">
                  <thead className="bg-ssg-green text-white">
                    <tr>
                      {['Win/Panel', 'Elev', 'Cond', 'Warp', 'Lead', 'Breaks', 'Wood Rot', 'Paint/Caulk', 'Pieces', 'Sq Ft', 'Notes'].map((label) => (
                        <th key={label} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 bg-white">
                    {(draft._meta.condition_schedule_rows ?? []).map((row, index) => (
                      <tr key={`${row.id}-${index}`} className={row.is_window ? 'bg-ssg-lighter/70' : ''}>
                        <td className="px-2 py-2">
                          <input
                            className="input h-10 min-w-24"
                            value={row.id}
                            onChange={(event) => updateConditionScheduleRow(index, 'id', event.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="input h-10 min-w-20"
                            value={row.elev}
                            onChange={(event) => updateConditionScheduleRow(index, 'elev', event.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="input h-10 min-w-20"
                            value={row.cond}
                            onChange={(event) => updateConditionScheduleRow(index, 'cond', event.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="input h-10 min-w-16"
                            value={row.warp}
                            onChange={(event) => updateConditionScheduleRow(index, 'warp', event.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="input h-10 min-w-16"
                            value={row.lead}
                            onChange={(event) => updateConditionScheduleRow(index, 'lead', event.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="input h-10 min-w-16"
                            value={row.glass_breaks}
                            onChange={(event) => updateConditionScheduleRow(index, 'glass_breaks', event.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="input h-10 min-w-24"
                            value={row.wood_rot}
                            onChange={(event) => updateConditionScheduleRow(index, 'wood_rot', event.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="input h-10 min-w-28"
                            value={row.paint_caulk}
                            onChange={(event) => updateConditionScheduleRow(index, 'paint_caulk', event.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="input h-10 min-w-16"
                            value={row.pieces}
                            onChange={(event) => updateConditionScheduleRow(index, 'pieces', event.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="input h-10 min-w-16"
                            value={row.sqft}
                            onChange={(event) => updateConditionScheduleRow(index, 'sqft', event.target.value)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className="input h-10 min-w-[20rem]"
                            value={row.notes}
                            onChange={(event) => updateConditionScheduleRow(index, 'notes', event.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button type="button" onClick={() => void saveDraft()} className="btn-primary">
                {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                {saving ? 'Saving...' : 'Save Appendix'}
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <p className="text-[15px] leading-7 text-ssg-charcoal">
                {draft._meta.condition_schedule_intro || DEFAULT_CONDITION_SCHEDULE_INTRO}
              </p>

              <div className="overflow-x-auto rounded-2xl border border-black/5">
                <table className="min-w-[76rem] divide-y divide-black/5 text-sm">
                  <thead className="bg-ssg-green text-white">
                    <tr>
                      {['Win/Panel', 'Elev', 'Cond', 'Warp', 'Lead', 'Breaks', 'Wood Rot', 'Paint/Caulk', 'Pieces', 'Sq Ft', 'Notes'].map((label) => (
                        <th key={label} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 bg-white">
                    {(draft._meta.condition_schedule_rows ?? []).map((row, index) => (
                      <tr key={`${row.id}-${index}`} className={row.is_window ? 'bg-ssg-lighter/70 font-semibold' : ''}>
                        <td className="px-3 py-2 text-ssg-charcoal">{row.id}</td>
                        <td className="px-3 py-2 text-ssg-charcoal">{row.elev}</td>
                        <td className="px-3 py-2 text-ssg-charcoal">{row.is_window ? '' : row.cond}</td>
                        <td className="px-3 py-2 text-ssg-charcoal">{row.warp}</td>
                        <td className="px-3 py-2 text-ssg-charcoal">{row.lead}</td>
                        <td className="px-3 py-2 text-ssg-charcoal">{row.glass_breaks}</td>
                        <td className="px-3 py-2 text-ssg-charcoal">{row.wood_rot}</td>
                        <td className="px-3 py-2 text-ssg-charcoal">{row.paint_caulk}</td>
                        <td className="px-3 py-2 text-ssg-charcoal">{row.pieces}</td>
                        <td className="px-3 py-2 text-ssg-charcoal">{row.sqft}</td>
                        <td className="px-3 py-2 text-ssg-charcoal">{row.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Eye size={17} className="text-ssg-green" />
            <h3 className="text-lg font-semibold text-ssg-charcoal">Live preview</h3>
          </div>

          {report?.pdf_url && !isDraftDirty ? (
            <div className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-sm">
              <iframe
                title="Report PDF preview"
                src={api.mediaUrl(report.pdf_url)}
                className="h-[60rem] w-full"
              />
            </div>
          ) : (
            <div className="space-y-3">
              {report?.pdf_url && isDraftDirty ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  The PDF is out of date. Rebuild the customer PDF to reflect your latest AI or manual edits.
                </div>
              ) : null}
              {renderedPreview}
            </div>
          )}
        </section>
      </div>

      <div className="fixed inset-x-4 bottom-4 z-30 rounded-2xl bg-white p-4 shadow-xl md:left-auto md:right-8 md:w-[32rem]">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ssg-charcoal">Report actions</p>
              <p className="text-xs text-ssg-muted">
                Download the finished PDF. Building the PDF publishes it to the customer portal automatically.
              </p>
            </div>
            {portalPublished ? (
              <div className="inline-flex items-center gap-1 rounded-full bg-ssg-light px-3 py-1 text-xs font-semibold text-ssg-green">
                <CheckCircle2 size={13} />
                Published
              </div>
            ) : null}
          </div>

          {genState === 'error' ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="font-semibold">PDF build failed</p>
              <p className="mt-1 text-xs">
                {(report?.narrative as { _error?: string } | null)?._error
                  ?? 'The server did not produce a PDF. Try Build PDF again, or check Railway logs.'}
              </p>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!project.photos.length}
                className="mt-2 inline-flex items-center gap-1 rounded-full border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                Try again
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void markDownloaded()}
              disabled={!report?.pdf_url || saving}
              className="btn-secondary flex-1"
            >
              <Download size={16} />
              Download PDF
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
