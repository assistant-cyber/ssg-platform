'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  Loader2,
  MessageSquare,
  Phone,
  X,
  XCircle,
} from 'lucide-react';

import BrandWordmark from '@/components/layout/BrandWordmark';
import { fromApiItems, lineTotal, subtotal, currency } from '@/components/estimate/types';
import api, {
  portalApi,
  type Estimate,
  type ProjectDetail,
  type Proposal,
  type Report,
} from '@/lib/api';
import { formatNote, translateShorthand } from '@/lib/shorthand';

type Stage = 'loading' | 'auth-error' | 'ready';

function statusLabel(status: string) {
  return {
    active: 'Assessment in progress',
    assessment_complete: 'Assessment complete',
    report_generated: 'Report published',
    estimate_sent: 'Estimate ready',
    accepted: 'Project approved',
    declined: 'Estimate declined',
  }[status] ?? status;
}

function PhotoModal({
  src,
  caption,
  onClose,
}: {
  src: string;
  caption: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/70 p-0 md:items-center md:justify-center md:p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full rounded-t-[28px] bg-white p-4 shadow-2xl md:max-w-5xl md:rounded-[28px] md:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-black/5 bg-white text-ssg-charcoal shadow-sm"
        >
          <X size={20} />
        </button>
        <div className="overflow-hidden rounded-[24px] border border-black/5 bg-[#f5f4f0]">
          <img src={src} alt={caption} className="max-h-[78vh] w-full object-contain" />
        </div>
        {caption ? <p className="mt-4 text-[15px] text-ssg-muted">{caption}</p> : null}
      </div>
    </div>
  );
}

function PortalHeader() {
  return (
    <header className="border-b border-black/5 bg-white/96 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
        <BrandWordmark dark compact />
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Customer Portal
          </p>
          <p className="mt-1 text-sm text-ssg-muted">Private project access</p>
        </div>
      </div>
    </header>
  );
}

function SectionCard({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-[0_20px_50px_rgba(23,26,31,0.06)]">
      <div className="border-b border-black/5 px-5 py-5 md:px-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              {eyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-semibold leading-none text-ssg-charcoal md:text-[2rem]">{title}</h2>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </div>
      <div className="px-5 py-5 md:px-7 md:py-6">{children}</div>
    </section>
  );
}

export default function CustomerPortalPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f4f3ef]">
          <PortalHeader />
          <div className="flex min-h-[calc(100vh-76px)] items-center justify-center px-6">
            <div className="rounded-[28px] border border-black/5 bg-white px-8 py-10 text-center shadow-[0_20px_50px_rgba(23,26,31,0.06)]">
              <Loader2 size={40} className="mx-auto animate-spin text-ssg-green" />
              <p className="mt-4 text-lg font-semibold text-ssg-charcoal">Loading your project portal...</p>
              <p className="mt-2 text-sm text-ssg-muted">Preparing reports, photos, and project status.</p>
            </div>
          </div>
        </div>
      }
    >
      <CustomerPortalPageContent />
    </Suspense>
  );
}

function CustomerPortalPageContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const projectId = params.id;
  const code = searchParams.get('code') ?? '';

  const [stage, setStage] = useState<Stage>('loading');
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [error, setError] = useState('');

  const [responding, setResponding] = useState<'accept' | 'decline' | null>(null);
  const [showChangesForm, setShowChangesForm] = useState(false);
  const [changesNote, setChangesNote] = useState('');
  const [changesSubmitting, setChangesSubmitting] = useState(false);
  const [changesSent, setChangesSent] = useState(false);

  const [modalSrc, setModalSrc] = useState('');
  const [modalCaption, setModalCaption] = useState('');

  const proposalPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (proposalPollRef.current) clearTimeout(proposalPollRef.current);
    };
  }, []);

  useEffect(() => {
    (async () => {
      if (!code) {
        setError('No access code was included in this link.');
        setStage('auth-error');
        return;
      }

      try {
        const auth = await portalApi.login(code);
        portalApi.setToken(auth.access_token);
      } catch {
        setError('This access code is not valid. Please use the latest link from Scottish Stained Glass.');
        setStage('auth-error');
        return;
      }

      try {
        const loadedProject = await portalApi.getProject(projectId);
        setProject(loadedProject);

        try {
          const loadedEstimate = await portalApi.getEstimate(projectId);
          if (['sent', 'accepted', 'declined'].includes(loadedEstimate.status)) {
            setEstimate(loadedEstimate);
          }
        } catch {}

        try {
          const loadedReport = await portalApi.getReport(projectId);
          if (loadedReport.pdf_url) setReport(loadedReport);
        } catch {}

        try {
          const loadedProposal = await portalApi.getProposal(projectId);
          setProposal(loadedProposal);
        } catch {}

        setStage('ready');
      } catch {
        setError('We could not load this project right now. Please contact Scottish Stained Glass for assistance.');
        setStage('auth-error');
      }
    })();
  }, [code, projectId]);

  const pollProposal = async (attempt = 0): Promise<void> => {
    if (attempt > 40) return;
    try {
      const nextProposal = await portalApi.getProposal(projectId);
      setProposal(nextProposal);
      if (nextProposal.pdf_url) return;
    } catch {}
    proposalPollRef.current = setTimeout(() => {
      void pollProposal(attempt + 1);
    }, 3000);
  };

  const handleAccept = async () => {
    if (!project || responding) return;
    const confirmed = window.confirm(
      'Accept this estimate? Scottish Stained Glass will be notified and will follow up within 2 business days.',
    );
    if (!confirmed) return;

    setResponding('accept');
    try {
      await portalApi.request('POST', `/projects/${project.id}/estimate/respond`, { action: 'accept' });
      const refreshedEstimate = await portalApi.getEstimate(project.id).catch(() => null);
      if (refreshedEstimate) setEstimate(refreshedEstimate);
      const refreshedProject = await portalApi.getProject(project.id);
      setProject(refreshedProject);

      try {
        const createdProposal = await portalApi.generateProposal(project.id);
        setProposal(createdProposal);
        void pollProposal();
      } catch {}
    } catch (err: any) {
      window.alert(`Could not submit your response: ${err?.message ?? 'Please try again.'}`);
    } finally {
      setResponding(null);
    }
  };

  const handleDecline = async () => {
    if (!project || responding) return;
    const confirmed = window.confirm(
      'Decline this estimate? Our team can still follow up if you would like to discuss options.',
    );
    if (!confirmed) return;

    setResponding('decline');
    try {
      await portalApi.request('POST', `/projects/${project.id}/estimate/respond`, { action: 'decline' });
      const refreshedEstimate = await portalApi.getEstimate(project.id).catch(() => null);
      if (refreshedEstimate) setEstimate(refreshedEstimate);
      const refreshedProject = await portalApi.getProject(project.id);
      setProject(refreshedProject);
    } catch (err: any) {
      window.alert(`Could not submit your response: ${err?.message ?? 'Please try again.'}`);
    } finally {
      setResponding(null);
    }
  };

  const handleChanges = async () => {
    if (!project || !changesNote.trim()) return;
    setChangesSubmitting(true);
    try {
      await portalApi.request('PATCH', `/projects/${project.id}`, {
        general_notes: `Customer request (${new Date().toLocaleDateString()}): ${changesNote.trim()}`,
      });
      setChangesSent(true);
      setShowChangesForm(false);
    } finally {
      setChangesSubmitting(false);
    }
  };

  const lineItems = useMemo(() => (estimate ? fromApiItems(estimate.line_items) : []), [estimate]);
  const estimateTotal = useMemo(() => subtotal(lineItems), [lineItems]);
  const address = useMemo(
    () => [project?.address_street, project?.address_city, project?.address_state].filter(Boolean).join(', '),
    [project?.address_city, project?.address_state, project?.address_street],
  );

  if (stage === 'loading') {
    return (
      <div className="min-h-screen bg-[#f4f3ef]">
        <PortalHeader />
        <div className="flex min-h-[calc(100vh-76px)] items-center justify-center px-6">
          <div className="rounded-[28px] border border-black/5 bg-white px-8 py-10 text-center shadow-[0_20px_50px_rgba(23,26,31,0.06)]">
            <Loader2 size={40} className="mx-auto animate-spin text-ssg-green" />
            <p className="mt-4 text-lg font-semibold text-ssg-charcoal">Loading your project portal...</p>
            <p className="mt-2 text-sm text-ssg-muted">Preparing reports, photos, and project status.</p>
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'auth-error') {
    return (
      <div className="min-h-screen bg-[#f4f3ef]">
        <PortalHeader />
        <div className="mx-auto flex min-h-[calc(100vh-76px)] max-w-xl items-center justify-center px-4 py-10">
          <div className="w-full rounded-[28px] border border-black/5 bg-white px-6 py-10 text-center shadow-[0_20px_50px_rgba(23,26,31,0.06)] md:px-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#f8fbf3] text-ssg-green">
              <AlertCircle size={30} />
            </div>
            <h1 className="mt-5 text-[30px] text-ssg-charcoal">Access Error</h1>
            <p className="mt-3 text-[15px] leading-7 text-ssg-muted">{error}</p>
            <p className="mt-6 text-sm text-ssg-muted">
              If you need a new link, contact Scottish Stained Glass directly.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="min-h-screen bg-[#f4f3ef] text-ssg-charcoal">
      <PortalHeader />

      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <section className="overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_24px_60px_rgba(23,26,31,0.07)]">
          <div className="px-5 py-6 md:px-8 md:py-8">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Project Portal
              </p>
              <h1 className="mt-2 text-[2.2rem] font-semibold leading-none text-ssg-charcoal md:text-[3rem]">
                {project.church_name || project.name}
              </h1>
              {address ? <p className="mt-3 max-w-2xl text-sm leading-6 text-ssg-slate md:text-base">{address}</p> : null}

              <div className="mt-6 flex flex-wrap gap-3">
                <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-ssg-green/15 bg-ssg-light px-4 text-sm font-medium text-ssg-green">
                  <span className="h-2 w-2 rounded-full bg-ssg-green" />
                  {statusLabel(project.status)}
                </span>
                <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-ssg-slate">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                  {project.photos.length} photos
                </span>
                {report?.pdf_url ? (
                  <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-ssg-slate">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Report available
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <div className="mt-6 space-y-5">
          <SectionCard
            eyebrow="Published Document"
            title="Assessment Report"
            action={
              report?.pdf_url ? (
                <div className="flex flex-wrap gap-3">
                  <a
                    href={api.mediaUrl(report.pdf_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary"
                  >
                    <Download size={16} />
                    Download PDF
                  </a>
                  <a
                    href={api.mediaUrl(report.pdf_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary"
                  >
                    <ExternalLink size={16} />
                    Open
                  </a>
                </div>
              ) : null
            }
          >
            {report?.pdf_url ? (
              <div className="space-y-5">
                <div className="rounded-[24px] border border-black/5 bg-[#f7f6f2] p-5">
                  <p className="text-[15px] leading-7 text-ssg-charcoal">
                    Your stained glass assessment report is ready. It includes the overall findings,
                    condition notes, and recommended restoration direction for this project.
                  </p>
                </div>
                <div className="overflow-hidden rounded-[24px] border border-black/5 bg-white">
                  <iframe
                    title="Assessment Report Preview"
                    src={api.mediaUrl(report.pdf_url)}
                    className="h-[680px] w-full bg-white"
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-black/10 bg-[#faf9f6] px-5 py-12 text-center">
                <Loader2 size={28} className="mx-auto animate-spin text-ssg-green" />
                <p className="mt-4 text-lg font-semibold text-ssg-charcoal">Your report is being prepared</p>
                <p className="mt-2 text-[15px] text-ssg-muted">
                  Scottish Stained Glass is finalizing the assessment documentation for this project.
                </p>
              </div>
            )}
          </SectionCard>

          <SectionCard eyebrow="Field Documentation" title={`Project Photos (${project.photos.length})`}>
            {project.photos.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-black/10 bg-[#faf9f6] px-5 py-12 text-center">
                <Camera size={28} className="mx-auto text-ssg-green" />
                <p className="mt-4 text-lg font-semibold text-ssg-charcoal">No photos available yet</p>
                <p className="mt-2 text-[15px] text-ssg-muted">
                  Once the field assessment is complete, the project photos will appear here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {project.photos.map((photo) => {
                  const thumbUrl = photo.thumbnail_url ? api.mediaUrl(photo.thumbnail_url) : api.mediaUrl(photo.storage_url);
                  const fullUrl = api.mediaUrl(photo.storage_url);
                  const translated = photo.notes ? translateShorthand(photo.notes) : null;
                  const note = translated ? formatNote(translated, photo.notes ?? '') : photo.notes ?? '';
                  const windowLabel =
                    translated?.windowLabel ||
                    (photo.window_number ? `Window ${photo.window_number}${photo.panel_letter ?? ''}` : '');

                  return (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => {
                        setModalSrc(fullUrl);
                        setModalCaption([windowLabel, note].filter(Boolean).join(': '));
                      }}
                      className="group overflow-hidden rounded-[22px] border border-black/5 bg-white text-left shadow-[0_12px_30px_rgba(23,26,31,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(23,26,31,0.09)]"
                    >
                      <div className="relative aspect-[4/3] overflow-hidden bg-[#f1f0eb]">
                        <img
                          src={thumbUrl}
                          alt={windowLabel || 'Project photo'}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                        />
                        <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/92 text-ssg-charcoal shadow-sm">
                          <Eye size={16} />
                        </span>
                      </div>
                      <div className="space-y-2 px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-ssg-green" />
                          <p className="truncate text-sm font-semibold text-ssg-charcoal">
                            {windowLabel || 'Project photo'}
                          </p>
                        </div>
                        <p className="line-clamp-2 text-sm leading-6 text-ssg-muted">
                          {note || 'Assessment image'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {estimate ? (
            <SectionCard eyebrow="Project Pricing" title="Estimate Review">
              <EstimateCard
                estimate={estimate}
                lineItems={lineItems}
                total={estimateTotal}
                responding={responding}
                changesSent={changesSent}
                onAccept={handleAccept}
                onDecline={handleDecline}
                onShowChanges={() => setShowChangesForm((value) => !value)}
              />

              {showChangesForm && !changesSent ? (
                <div className="mt-5 rounded-[24px] border border-black/5 bg-[#f7f6f2] p-5">
                  <p className="text-[15px] font-semibold text-ssg-charcoal">Send a note to Scottish Stained Glass</p>
                  <textarea
                    value={changesNote}
                    onChange={(event) => setChangesNote(event.target.value)}
                    rows={5}
                    className="input mt-4 resize-none"
                    placeholder="Please describe the questions or changes you would like to discuss."
                  />
                  <div className="mt-4 flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowChangesForm(false)}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleChanges()}
                      disabled={changesSubmitting || !changesNote.trim()}
                      className="btn-primary"
                    >
                      {changesSubmitting ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16} />}
                      Send Message
                    </button>
                  </div>
                </div>
              ) : null}

              {changesSent ? (
                <div className="mt-5 flex min-h-11 items-center gap-3 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  <CheckCircle2 size={18} />
                  Your note was sent. Our team will follow up soon.
                </div>
              ) : null}
            </SectionCard>
          ) : null}

          {(estimate?.status === 'accepted' || proposal) ? (
            <SectionCard eyebrow="Next Step" title="Project Proposal">
              {proposal?.pdf_url ? (
                <div className="space-y-4">
                  <p className="text-[15px] leading-7 text-ssg-charcoal">
                    Your formal project proposal is ready. This document includes the scope of work,
                    investment breakdown, and the package needed to move into scheduling.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <a
                      href={api.mediaUrl(proposal.pdf_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-primary"
                    >
                      <Download size={16} />
                      Download Proposal
                    </a>
                    <a
                      href={api.mediaUrl(proposal.pdf_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary"
                    >
                      <ExternalLink size={16} />
                      Open Proposal
                    </a>
                  </div>
                  {!proposal.viewed_by_customer ? (
                    <p className="inline-flex min-h-10 items-center gap-2 rounded-full border border-ssg-green/15 bg-ssg-light px-4 text-sm font-medium text-ssg-green">
                      <span className="h-2 w-2 rounded-full bg-ssg-green" />
                      New document available for review.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-[24px] border border-dashed border-black/10 bg-[#faf9f6] px-5 py-12 text-center">
                  <Loader2 size={28} className="mx-auto animate-spin text-ssg-green" />
                  <p className="mt-4 text-lg font-semibold text-ssg-charcoal">Preparing your proposal</p>
                  <p className="mt-2 text-[15px] text-ssg-muted">
                    This usually takes less than a minute after estimate approval.
                  </p>
                </div>
              )}
            </SectionCard>
          ) : null}

          <section className="overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-[0_20px_50px_rgba(23,26,31,0.06)]">
            <div className="grid gap-4 px-5 py-5 md:grid-cols-[1.4fr_0.8fr] md:px-7 md:py-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Need Help
                </p>
                <h2 className="mt-2 text-2xl font-semibold leading-none text-ssg-charcoal md:text-[2rem]">Questions about your project?</h2>
                <p className="mt-2 text-[15px] leading-7 text-ssg-muted">
                  Reach out to Scottish Stained Glass and our team will help with report questions,
                  estimate details, or next-step planning.
                </p>
              </div>
              <div className="rounded-[22px] border border-black/5 bg-[#f7f6f2] px-5 py-5 text-[15px] leading-7 text-ssg-charcoal">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ssg-light text-ssg-green">
                    <Phone size={18} />
                  </div>
                  <div>
                    <p><strong>Phone:</strong> (720) 703-2247</p>
                    <p><strong>Email:</strong> derek@scottishgroupcompanies.com</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer className="py-8 text-center">
          <div className="flex justify-center">
            <BrandWordmark dark />
          </div>
          <p className="mt-2 text-sm text-ssg-muted">This portal is private and intended only for the project contact.</p>
        </footer>
      </main>

      {modalSrc ? (
        <PhotoModal
          src={modalSrc}
          caption={modalCaption}
          onClose={() => {
            setModalSrc('');
            setModalCaption('');
          }}
        />
      ) : null}
    </div>
  );
}

function EstimateCard({
  estimate,
  lineItems,
  total,
  responding,
  changesSent,
  onAccept,
  onDecline,
  onShowChanges,
}: {
  estimate: Estimate;
  lineItems: ReturnType<typeof fromApiItems>;
  total: number;
  responding: 'accept' | 'decline' | null;
  changesSent: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onShowChanges: () => void;
}) {
  const isSent = estimate.status === 'sent';
  const isAccepted = estimate.status === 'accepted';
  const isDeclined = estimate.status === 'declined';

  return (
    <div className="space-y-5">
      {isAccepted ? (
        <div className="flex min-h-11 items-center gap-3 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          <CheckCircle2 size={18} />
          This estimate has been approved.
        </div>
      ) : null}
      {isDeclined ? (
        <div className="flex min-h-11 items-center gap-3 rounded-[20px] border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600">
          <XCircle size={18} />
          A decline response has been recorded. Our team can still follow up with alternatives.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[24px] border border-black/5 bg-white">
        <div className="grid grid-cols-[1fr_110px] border-b border-black/5 bg-[#f7f6f2] px-4 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-ssg-muted md:px-5">
          <span>Description</span>
          <span className="text-right">Amount</span>
        </div>
        <div className="divide-y divide-black/5">
          {lineItems.map((line, index) => {
            if (line.type === 'section') {
              return (
                <div
                  key={line._key}
                  className="border-l-2 border-ssg-green/70 bg-[#f8fbf3] px-4 py-3 text-sm font-semibold text-ssg-green md:px-5"
                >
                  {line.description}
                </div>
              );
            }

            const totalLine = lineTotal(line);
            return (
              <div
                key={line._key}
                className={`grid grid-cols-[1fr_110px] px-4 py-4 text-sm md:px-5 ${index % 2 === 0 ? 'bg-white' : 'bg-[#fcfcfa]'}`}
              >
                <div className="pr-4">
                  <p className="text-ssg-charcoal">{line.description}</p>
                  {line.quantity !== '1' ? (
                    <p className="mt-1 text-xs text-ssg-muted">
                      {line.quantity} {line.unit}
                    </p>
                  ) : null}
                </div>
                <div className="text-right font-semibold text-ssg-green">{currency(totalLine)}</div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t border-black/5 bg-[#f7f6f2] px-4 py-4 md:px-5">
          <span className="text-[18px] text-ssg-charcoal">Total Investment</span>
          <span className="text-2xl font-semibold text-ssg-charcoal">{currency(total)}</span>
        </div>
      </div>

      {estimate.notes ? (
        <div className="rounded-[24px] border border-black/5 bg-[#f7f6f2] px-5 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ssg-muted">Notes</p>
          <p className="mt-3 text-[15px] leading-7 text-ssg-charcoal">{estimate.notes}</p>
        </div>
      ) : null}

      {isSent && !changesSent ? (
        <div className="rounded-[24px] border border-black/5 bg-white px-5 py-5">
          <p className="text-[15px] leading-7 text-ssg-charcoal">
            Review the estimate above. If you are ready to move forward, accept the estimate.
            If you have questions or would like adjustments, send a change request.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onAccept}
              disabled={responding !== null}
              className="btn-primary flex-1"
            >
              {responding === 'accept' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Accept Estimate
            </button>
            <button
              type="button"
              onClick={onShowChanges}
              className="btn-secondary flex-1"
            >
              <MessageSquare size={16} />
              Request Changes
            </button>
            <button
              type="button"
              onClick={onDecline}
              disabled={responding !== null}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {responding === 'decline' ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
              Decline
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
