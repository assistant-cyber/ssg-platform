'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, FileText, Loader2, Eye, Edit2, ChevronUp, ChevronDown, Save, CheckCircle2 } from 'lucide-react';
import api, { type ProjectDetail, type Report, type Proposal, type ProposalDraft, type ProposalWindowSection, type ProposalPhotoData } from '@/lib/api';
import { reportDraftFromNarrative, type ReportDraft } from '@/lib/reportDraft';

interface Props {
  project: ProjectDetail;
  onRefresh: () => void;
}

export default function CustomerPortalTab({ project, onRefresh }: Props) {
  const [report, setReport] = useState<Report | null>(project.latest_report ?? null);
  const [draft, setDraft] = useState<ReportDraft>(() => reportDraftFromNarrative(project.latest_report?.narrative, project));
  const [loading, setLoading] = useState(!project.latest_report);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  
  // Phase 5: Proposal state
  const [showProposalEditor, setShowProposalEditor] = useState(false);
  const [proposalDraft, setProposalDraft] = useState<ProposalDraft | null>(null);
  const [loadingProposal, setLoadingProposal] = useState(false);

  const portalUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/portal/${project.id}?code=${project.customer_access_code ?? ''}`;

  useEffect(() => {
    setReport(project.latest_report ?? null);
    setDraft(reportDraftFromNarrative(project.latest_report?.narrative, project));
    setLoading(false);
  }, [project]);

  useEffect(() => {
    if (project.latest_report) return;
    (async () => {
      try {
        const latest = await api.getReport(project.id);
        setReport(latest);
        setDraft(reportDraftFromNarrative(latest.narrative, project));
      } catch {
        // Initial load failure is silent — no published report yet is a valid state.
      } finally {
        setLoading(false);
      }
    })();
  }, [project.id, project.latest_report, project]);

  const publishedAt = draft._meta.portal_published_at;

  const savePublishState = async (portalPublishedAt: string | null) => {
    if (!report) return;
    setSaving(true);
    setSaveError(null);
    try {
      const nextNarrative = {
        ...(report.narrative ?? {}),
        _meta: {
          ...(report.narrative?._meta ?? {}),
          ...draft._meta,
          portal_published_at: portalPublishedAt,
        },
      };
      const saved = await api.saveReportDraft(project.id, nextNarrative);
      setReport(saved);
      setDraft(reportDraftFromNarrative(saved.narrative, project));
      await onRefresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to update publish state. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  
  // Phase 5: Load proposal draft
  const loadProposalDraft = async () => {
    setLoadingProposal(true);
    try {
      const data = await api.getProposalDraft(project.id);
      setProposalDraft(data);
      setShowProposalEditor(true);
    } catch (err) {
      console.error('Failed to load proposal draft:', err);
    } finally {
      setLoadingProposal(false);
    }
  };
  
  // Phase 5: Save draft edits
  const saveProposalDraft = async () => {
    if (!proposalDraft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await api.updateProposalDraft(project.id, proposalDraft);
      setProposalDraft(updated);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save proposal draft. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  
  // Phase 5: Generate & publish final PDF
  const generateProposal = async () => {
    if (!window.confirm('Generate final PDF from this draft? This will publish to the portal.')) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.generateProposal(project.id);
      await onRefresh();
      setShowProposalEditor(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to generate proposal. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ssg-muted">
        <Loader2 size={16} className="animate-spin" />
        Loading portal status...
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-5">
      {saveError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      ) : null}

      {/* Phase 5: Proposal Editor UI */}
      {showProposalEditor && proposalDraft ? (
        <ProposalEditor
          draft={proposalDraft}
          onChange={setProposalDraft}
          onSave={saveProposalDraft}
          onGenerate={generateProposal}
          onCancel={() => setShowProposalEditor(false)}
          saving={saving}
        />
      ) : null}
      
      {/* Phase 5: Proposal review/edit button */}
      <div className="card p-5 md:p-6">
        <h3 className="text-lg font-semibold text-ssg-charcoal">Proposal</h3>
        <p className="mt-2 text-sm text-ssg-muted">
          Review and edit the proposal before sending to the customer.
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void loadProposalDraft()}
            disabled={loadingProposal}
            className="btn-primary"
          >
            {loadingProposal ? <Loader2 size={16} className="animate-spin" /> : <Edit2 size={16} />}
            Review & Edit Proposal
          </button>
        </div>
      </div>

      {!report?.pdf_url || !publishedAt ? (
        <div className="card px-6 py-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ssg-light text-ssg-green">
            <FileText size={28} />
          </div>
          <p className="mt-5 text-lg font-semibold text-ssg-charcoal">No report sent yet</p>
          <p className="mt-2 text-[15px] text-ssg-muted">
            Generate and review a report first.
          </p>
        </div>
      ) : (
        <div className="card p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-ssg-charcoal">{draft._meta.report_title}</h3>
              <p className="mt-2 text-[15px] text-ssg-muted">
                Sent: {new Date(publishedAt).toLocaleString()}
              </p>
            </div>
            <a
              href={portalUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
            >
              <ExternalLink size={16} />
              View as Customer
            </a>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void savePublishState(null)}
              disabled={saving}
              className="btn-secondary"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              Unpublish
            </button>
            <button
              type="button"
              onClick={() => void savePublishState(new Date().toISOString())}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              Send New Version
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Proposal Editor Component ─────────────────────────────────────────────────

interface ProposalEditorProps {
  draft: ProposalDraft;
  onChange: (draft: ProposalDraft) => void;
  onSave: () => void;
  onGenerate: () => void;
  onCancel: () => void;
  saving: boolean;
}

function ProposalEditor({ draft, onChange, onSave, onGenerate, onCancel, saving }: ProposalEditorProps) {
  const [autosaveTimeout, setAutosaveTimeout] = useState<NodeJS.Timeout | null>(null);

  const updateWindow = (windowIndex: number, updates: Partial<ProposalWindowSection>) => {
    const nextWindows = [...draft.windows];
    nextWindows[windowIndex] = { ...nextWindows[windowIndex], ...updates };
    onChange({ ...draft, windows: nextWindows });
    
    // Debounced autosave
    if (autosaveTimeout) clearTimeout(autosaveTimeout);
    const timer = setTimeout(() => onSave(), 1500);
    setAutosaveTimeout(timer);
  };

  const togglePhoto = (windowIndex: number, photoIndex: number) => {
    const nextWindows = [...draft.windows];
    const window = nextWindows[windowIndex];
    const nextPhotos = [...window.photos];
    nextPhotos[photoIndex] = { ...nextPhotos[photoIndex], include: !nextPhotos[photoIndex].include };
    nextWindows[windowIndex] = { ...window, photos: nextPhotos };
    onChange({ ...draft, windows: nextWindows });
  };

  const moveWindow = (windowIndex: number, direction: 'up' | 'down') => {
    const nextWindows = [...draft.windows];
    const targetIndex = direction === 'up' ? windowIndex - 1 : windowIndex + 1;
    if (targetIndex < 0 || targetIndex >= nextWindows.length) return;
    [nextWindows[windowIndex], nextWindows[targetIndex]] = [nextWindows[targetIndex], nextWindows[windowIndex]];
    onChange({ ...draft, windows: nextWindows });
  };

  return (
    <div className="card p-5 md:p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-ssg-charcoal">Edit Proposal</h3>
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary"
        >
          Cancel
        </button>
      </div>
      
      <div className="mt-4 space-y-4">
        <p className="text-sm text-ssg-muted">
          {draft.windows.length} windows loaded. Edit window notes, toggle photos, adjust order below.
        </p>
        
        {draft.windows.map((window, windowIndex) => (
          <WindowSection
            key={window.window_id}
            window={window}
            windowIndex={windowIndex}
            totalWindows={draft.windows.length}
            onUpdate={(updates) => updateWindow(windowIndex, updates)}
            onTogglePhoto={(photoIndex) => togglePhoto(windowIndex, photoIndex)}
            onMove={(direction) => moveWindow(windowIndex, direction)}
          />
        ))}
        
        <div className="flex gap-3 border-t border-black/5 pt-5">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="btn-secondary"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Draft
          </button>
          <button
            type="button"
            onClick={onGenerate}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Generate & Publish
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Window Section Component ───────────────────────────────────────────────────

interface WindowSectionProps {
  window: ProposalWindowSection;
  windowIndex: number;
  totalWindows: number;
  onUpdate: (updates: Partial<ProposalWindowSection>) => void;
  onTogglePhoto: (photoIndex: number) => void;
  onMove: (direction: 'up' | 'down') => void;
}

function WindowSection({ window, windowIndex, totalWindows, onUpdate, onTogglePhoto, onMove }: WindowSectionProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-xl border border-black/5 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-black/5 bg-[#f7f6f2] px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 bg-white text-ssg-charcoal hover:bg-gray-50"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <div>
            <h4 className="font-semibold text-ssg-charcoal">
              Window {window.window_number}{window.window_name ? ` — ${window.window_name}` : ''}
            </h4>
            <p className="text-xs text-ssg-muted">
              {window.photos.filter(p => p.include).length} / {window.photos.length} photos included
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onMove('up')}
            disabled={windowIndex === 0}
            className="btn-ghost disabled:opacity-30"
            title="Move up"
          >
            <ChevronUp size={16} />
          </button>
          <button
            type="button"
            onClick={() => onMove('down')}
            disabled={windowIndex === totalWindows - 1}
            className="btn-ghost disabled:opacity-30"
            title="Move down"
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-ssg-charcoal mb-2">
              Window Notes
            </label>
            <textarea
              value={window.notes}
              onChange={(e) => onUpdate({ notes: e.target.value })}
              onBlur={() => {}} // Autosave handled in parent
              rows={3}
              className="input resize-none"
              placeholder="Narrative description for this window..."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-ssg-charcoal mb-2">
              Photos ({window.photos.length})
            </label>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {window.photos.map((photo, photoIndex) => (
                <PhotoTile
                  key={photo.photo_id}
                  photo={photo}
                  onToggle={() => onTogglePhoto(photoIndex)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Photo Tile Component ──────────────────────────────────────────────────────

interface PhotoTileProps {
  photo: ProposalPhotoData;
  onToggle: () => void;
}

function PhotoTile({ photo, onToggle }: PhotoTileProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        'overflow-hidden rounded-lg border text-left transition',
        photo.include ? 'border-ssg-green ring-2 ring-ssg-green/20' : 'border-black/10 opacity-50',
      ].join(' ')}
    >
      <div className="relative aspect-[4/3] bg-gray-100">
        <img
          src={api.mediaUrl(photo.storage_url)}
          alt={photo.label}
          className="h-full w-full object-cover"
        />
        <div className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-xs font-semibold text-ssg-charcoal shadow-sm">
          {photo.label}
        </div>
        <div className="absolute right-2 top-2">
          <span
            className={[
              'flex h-6 w-6 items-center justify-center rounded-full border bg-white/95',
              photo.include ? 'border-ssg-green text-ssg-green' : 'border-black/20 text-transparent',
            ].join(' ')}
          >
            <CheckCircle2 size={14} />
          </span>
        </div>
      </div>
      <div className="p-2">
        <p className="line-clamp-2 text-xs text-ssg-muted">
          {photo.notes || 'No notes'}
        </p>
      </div>
    </button>
  );
}
