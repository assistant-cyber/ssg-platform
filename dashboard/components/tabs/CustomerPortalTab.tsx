'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, FileText, Loader2, Eye, Edit2 } from 'lucide-react';
import api, { type ProjectDetail, type Report, type Proposal } from '@/lib/api';
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
  
  // Phase 5: Proposal state
  const [showProposalEditor, setShowProposalEditor] = useState(false);
  const [proposalDraft, setProposalDraft] = useState<any>(null);
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
        // no published report yet
      } finally {
        setLoading(false);
      }
    })();
  }, [project.id, project.latest_report, project]);

  const publishedAt = draft._meta.portal_published_at;

  const savePublishState = async (portalPublishedAt: string | null) => {
    if (!report) return;
    setSaving(true);
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
    } finally {
      setSaving(false);
    }
  };
  
  // Phase 5: Load proposal draft
  const loadProposalDraft = async () => {
    setLoadingProposal(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/proposal-draft`);
      if (response.ok) {
        const data = await response.json();
        setProposalDraft(data);
        setShowProposalEditor(true);
      }
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
    try {
      const response = await fetch(`/api/projects/${project.id}/proposal-draft`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proposalDraft)
      });
      if (response.ok) {
        const updated = await response.json();
        setProposalDraft(updated);
      }
    } finally {
      setSaving(false);
    }
  };
  
  // Phase 5: Generate & publish final PDF
  const generateProposal = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/generate-proposal`, {
        method: 'POST'
      });
      if (response.ok) {
        await onRefresh();
        setShowProposalEditor(false);
      }
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
      {/* Phase 5: Proposal Editor UI stub */}
      {showProposalEditor && proposalDraft ? (
        <div className="card p-5 md:p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-ssg-charcoal">Edit Proposal</h3>
            <button
              type="button"
              onClick={() => setShowProposalEditor(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
          
          <div className="mt-4 space-y-4">
            <p className="text-sm text-ssg-muted">
              {proposalDraft.windows?.length || 0} windows loaded. 
              Edit window notes, toggle photos, adjust narrative below.
            </p>
            
            {/* TODO: Full editable UI for windows + photos + narrative */}
            <div className="rounded-lg border border-black/10 bg-gray-50 p-4 text-sm text-ssg-muted">
              <strong>Placeholder:</strong> Full proposal editing UI goes here.<br/>
              - Per-window sections (reorder, hide)<br/>
              - Per-photo toggles (include/exclude)<br/>
              - Editable text areas for window notes + narrative
            </div>
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void saveProposalDraft()}
                disabled={saving}
                className="btn-secondary"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                Save Draft
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Generate final PDF from this draft? This will publish to the portal.')) {
                    void generateProposal();
                  }
                }}
                disabled={saving}
                className="btn-primary"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                Generate & Publish
              </button>
            </div>
          </div>
        </div>
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
