'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Camera, DollarSign, FileSpreadsheet, Trash2, Users, X } from 'lucide-react';
import api, { type ProjectDetail } from '@/lib/api';
import { clearAuth } from '@/lib/auth';
import Badge from '@/components/ui/Badge';
import PhotosTab from '@/components/tabs/PhotosTab';
import ReportTab from '@/components/tabs/ReportTab';
import EstimateTab from '@/components/tabs/EstimateTab';
import CustomerPortalTab from '@/components/tabs/CustomerPortalTab';
import BrandWordmark from '@/components/layout/BrandWordmark';

const TABS = [
  { id: 'photos',   label: 'Photos & Notes',    icon: Camera },
  { id: 'estimate', label: 'Estimate',          icon: DollarSign },
  { id: 'report',   label: 'Generate Report',   icon: FileSpreadsheet },
  { id: 'portal',   label: 'Customer Portal',   icon: Users },
] as const;

type TabId = typeof TABS[number]['id'];

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('photos');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const reload = async () => {
    setLoadError(null);
    try {
      const data = await api.getProject(id);
      setProject(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load this project.';

      if (/not authenticated|401/i.test(message)) {
        clearAuth();
        router.replace('/login');
        return;
      }

      setProject(null);
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, [id]);

  const handleDeleteProject = async () => {
    if (!project || deleting) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      await api.deleteProject(project.id);
      router.push('/projects');
      router.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete this project.');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-4" />
        <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-4 md:p-8">
        <div className="mx-auto max-w-3xl rounded-[1.6rem] border border-black/5 bg-white px-6 py-10 text-center shadow-sm">
          <p className="text-lg font-semibold text-ssg-charcoal">
            {loadError ? 'Unable to load this project' : 'Project not found'}
          </p>
          <p className="mt-2 text-sm text-ssg-muted">
            {loadError ?? 'The project record could not be found.'}
          </p>
        </div>
      </div>
    );
  }

  const addr = [project.address_street, project.address_city, project.address_state]
    .filter(Boolean).join(', ');
  const createdLabel = new Date(project.created_at).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="min-h-screen">
      <div className="border-b border-black/5 bg-ssg-lighter px-4 pb-4 pt-20 md:px-8 md:py-6">
        <div className="mb-4 flex items-center gap-3 pl-16 md:hidden">
          <button
            type="button"
            onClick={() => router.push('/projects')}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-black/10 bg-white px-4 text-[15px] font-medium text-ssg-charcoal shadow-sm transition-colors hover:border-black/20 hover:text-ssg-dark"
          >
            <ArrowLeft size={15} />
            Back
          </button>
        </div>

        <button
          type="button"
          onClick={() => router.push('/projects')}
          className="mb-4 hidden min-h-11 items-center gap-2 text-[15px] text-ssg-muted transition-colors hover:text-ssg-dark md:flex"
        >
          <ArrowLeft size={15} />
          All Projects
        </button>

        <div className="space-y-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-[1.85rem] font-semibold text-ssg-charcoal md:text-[2.5rem]">
                  {project.name}
                </h1>
                <Badge status={project.status} />
              </div>
              {project.church_name && project.church_name !== project.name ? (
                <p className="text-[15px] text-ssg-muted">{project.church_name}</p>
              ) : null}
              {addr ? <p className="text-[15px] text-ssg-muted">{addr}</p> : null}
              <p className="text-[15px] text-ssg-muted">
                Created: {createdLabel}
                <span className="px-2">•</span>
                Photos: {project.photos.length}
              </p>
            </div>

            <div className="hidden pt-1 md:block">
              <BrandWordmark dark compact />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setConfirmDelete(true);
              }}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-all hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={16} />
              Delete Project
            </button>
          </div>

          <div className="-mb-px overflow-x-auto">
            <div className="flex min-w-max gap-6 pr-4">
            {TABS.map(({ id: tid, label, icon: Icon }) => (
              <button
                key={tid}
                onClick={() => setActiveTab(tid)}
                className={[
                  'flex min-h-11 items-center gap-2 border-b-2 pb-3 text-[15px] font-medium transition-all',
                  activeTab === tid
                    ? 'border-ssg-green font-semibold text-ssg-green'
                    : 'border-transparent text-ssg-muted hover:text-ssg-charcoal',
                ].join(' ')}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-8">
        {activeTab === 'photos' && (
          <PhotosTab project={project} onRefresh={reload} />
        )}
        {activeTab === 'estimate' && (
          <EstimateTab project={project} onRefresh={reload} />
        )}
        {activeTab === 'report' && (
          <ReportTab project={project} onRefresh={reload} />
        )}
        {activeTab === 'portal' && (
          <CustomerPortalTab project={project} onRefresh={reload} />
        )}
      </div>

      {confirmDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 md:items-center md:p-6"
          onClick={() => {
            if (deleting) return;
            setConfirmDelete(false);
            setDeleteError(null);
          }}
        >
          <div
            className="w-full rounded-t-[2rem] bg-white p-6 md:max-w-lg md:rounded-[2rem]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-1 rounded-full bg-red-100 p-2 text-red-700">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-ssg-charcoal">
                    Are you sure you want to delete this?
                  </h3>
                  <p className="mt-2 text-[15px] text-ssg-muted">
                    This will permanently remove the entire project, including its photos, report data, estimate data, and customer access.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (deleting) return;
                  setConfirmDelete(false);
                  setDeleteError(null);
                }}
                className="rounded-full p-2 text-ssg-muted hover:bg-ssg-light hover:text-ssg-charcoal disabled:cursor-not-allowed disabled:opacity-50"
                disabled={deleting}
              >
                <X size={18} />
              </button>
            </div>

            {deleteError ? (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {deleteError}
              </p>
            ) : null}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(false);
                  setDeleteError(null);
                }}
                className="btn-secondary flex-1"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteProject()}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={deleting}
              >
                <Trash2 size={16} />
                {deleting ? 'Deleting...' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
