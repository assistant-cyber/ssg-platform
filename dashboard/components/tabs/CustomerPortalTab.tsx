'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, FileText, Loader2 } from 'lucide-react';
import api, { type ProjectDetail, type Report } from '@/lib/api';
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
