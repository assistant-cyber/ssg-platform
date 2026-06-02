'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Users,
  X,
} from 'lucide-react';
import api, { type Photo, type Project, type ProjectDetail } from '@/lib/api';
import { clearAuth } from '@/lib/auth';
import { TEAM_MEMBERS } from '@/lib/team';
import StatusFilter from '@/components/projects/StatusFilter';
import Badge from '@/components/ui/Badge';

type Section = 'projects' | 'photos' | 'reports' | 'team' | 'settings';

const SECTION_COPY: Record<Exclude<Section, 'projects'>, { title: string; body: string; icon: typeof Camera }> = {
  photos: {
    title: 'All photos',
    body: '',
    icon: Camera,
  },
  reports: {
    title: 'Finished church reports',
    body: '',
    icon: FileText,
  },
  team: {
    title: 'Team directory',
    body: '',
    icon: Users,
  },
  settings: {
    title: 'Settings',
    body: 'Workspace controls and preferences stay pinned at the bottom of the rail.',
    icon: Settings,
  },
};

function projectMoment(project: Project) {
  return new Date(project.updated_at ?? project.created_at).getTime();
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'No date';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function photoMoment(photo: Photo) {
  return new Date(photo.uploaded_at).getTime();
}

function displayPhotoLabel(photo: Photo) {
  if (photo.filename) return photo.filename.replace(/\.[^.]+$/, '');
  if (photo.window_number) return `${photo.window_number}${photo.panel_letter ?? ''}`;
  return 'Photo';
}

function photoWindowSummary(photo: Photo) {
  return [photo.window_number, photo.panel_letter].filter(Boolean).join('') || photo.elevation || 'No window tag yet';
}

function normalizeRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function ProjectPhotoStrip({
  project,
  detail,
}: {
  project: Project;
  detail: ProjectDetail | null;
}) {
  const recentPhotos = useMemo(
    () => [...(detail?.photos ?? [])].sort((a, b) => photoMoment(b) - photoMoment(a)).slice(0, 4),
    [detail],
  );

  if (!recentPhotos.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-ssg-muted">
        No recent photos yet
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {recentPhotos.map((photo) => (
        <div
          key={photo.id}
          className="h-16 w-16 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 md:h-20 md:w-20"
        >
          <img
            src={api.mediaUrl(photo.thumbnail_url || photo.storage_url)}
            alt={project.name}
            className="h-full w-full object-cover"
          />
        </div>
      ))}
    </div>
  );
}

function ProjectListSection({
  title,
  eyebrow,
  body,
  projects,
  projectDetails,
  loading,
  onOpenProject,
  layout = 'vertical',
}: {
  title: string;
  eyebrow: string;
  body: string;
  projects: Project[];
  projectDetails: Record<string, ProjectDetail | null>;
  loading: boolean;
  onOpenProject: (projectId: string) => void;
  layout?: 'vertical' | 'horizontal';
}) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-100 px-5 py-5 md:px-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              {eyebrow}
            </p>
            <h2 className="mt-2 text-2xl text-ssg-charcoal">{title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ssg-slate">{body}</p>
          </div>
          <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-ssg-slate">
            List view
          </div>
        </div>
      </div>

      <div className="p-5 md:p-7">
        {loading ? (
          <div className={layout === 'horizontal' ? 'grid gap-3 md:grid-cols-2 xl:grid-cols-4' : 'space-y-3'}>
            {[...Array(4)].map((_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-[1.6rem] bg-slate-100" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-[1.6rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center">
            <p className="text-2xl text-ssg-charcoal">No matching projects</p>
            <p className="mt-2 text-sm text-ssg-slate">
              Adjust the search or filter, or create a new project to start filling this list.
            </p>
          </div>
        ) : (
          <div className={layout === 'horizontal' ? 'grid gap-3 md:grid-cols-2 xl:grid-cols-4' : 'space-y-3'}>
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => onOpenProject(project.id)}
                className={
                  layout === 'horizontal'
                    ? 'grid w-full grid-cols-1 gap-4 rounded-[1.6rem] border border-slate-200 bg-white px-5 py-5 text-left transition hover:bg-slate-50'
                    : 'grid w-full grid-cols-1 gap-4 rounded-[1.6rem] border border-slate-200 bg-white px-5 py-5 text-left transition hover:bg-slate-50 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.8fr)_auto]'
                }
              >
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-ssg-charcoal">{project.name}</p>
                  <p className="mt-1 truncate text-sm text-ssg-muted">
                    {project.church_name || 'Scottish Stained Glass project'}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-ssg-slate">
                    <Badge status={project.status} />
                    <span>{project.photo_count} photos</span>
                    <span>Updated {formatDate(project.updated_at ?? project.created_at)}</span>
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Recent Photos
                  </p>
                  <ProjectPhotoStrip project={project} detail={projectDetails[project.id] ?? null} />
                </div>

                <div className={layout === 'horizontal' ? 'hidden' : 'hidden items-center justify-end md:flex'}>
                  <ChevronRight size={18} className="text-ssg-muted" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PhotosSection({
  photos,
  loading,
}: {
  photos: Array<{ photo: Photo; project: Project }>;
  loading: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activeEntry = activeIndex === null ? null : photos[activeIndex] ?? null;

  useEffect(() => {
    if (!activeEntry) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveIndex(null);
      if (event.key === 'ArrowLeft') setActiveIndex((current) => (current === null ? current : Math.max(0, current - 1)));
      if (event.key === 'ArrowRight') setActiveIndex((current) => (
        current === null ? current : Math.min(photos.length - 1, current + 1)
      ));
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeEntry, photos.length]);

  const downloadVisiblePhotos = async () => {
    try {
      const blob = await api.downloadSelectedPhotos(photos.map(({ photo }) => photo.id));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'all-photos.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Download failed.';
      window.alert(message);
    }
  };

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-100 px-5 py-6 md:px-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Photo Library
            </p>
            <h2 className="mt-2 text-2xl text-ssg-charcoal">Newest photos first</h2>
            <p className="mt-2 text-sm leading-6 text-ssg-slate">
              Every uploaded image across the workspace, shown as a pure image grid and sorted by most recent upload.
            </p>
          </div>
          {photos.length > 0 ? (
            <button type="button" onClick={() => void downloadVisiblePhotos()} className="btn-secondary">
              <Download size={16} />
              Download all photos
            </button>
          ) : null}
        </div>
      </div>

      <div className="p-5 md:p-7">
        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {[...Array(10)].map((_, index) => (
              <div key={index} className="aspect-square animate-pulse rounded-[1.6rem] bg-slate-100" />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="rounded-[1.6rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center">
            <p className="text-2xl text-ssg-charcoal">No photos available</p>
            <p className="mt-2 text-sm text-ssg-slate">
              Photos will appear here as soon as teams upload them into project records.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {photos.map(({ photo, project }) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setActiveIndex(photos.findIndex((entry) => entry.photo.id === photo.id))}
                className="group aspect-square overflow-hidden rounded-[1.6rem] border border-slate-200 bg-slate-100 transition hover:bg-slate-50"
                title={project.name}
              >
                <img
                  src={api.mediaUrl(photo.thumbnail_url || photo.storage_url)}
                  alt={project.name}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {activeEntry ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 md:items-center md:p-6"
          onClick={() => setActiveIndex(null)}
        >
          <div
            className="max-h-[95vh] w-full overflow-hidden rounded-t-[2rem] bg-white md:max-w-6xl md:rounded-[2rem]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="grid gap-0 md:grid-cols-[minmax(0,1.2fr)_24rem]">
              <div
                className="relative bg-black"
                onTouchStart={(event) => {
                  const touch = event.changedTouches[0];
                  if (touch) (event.currentTarget as HTMLDivElement).dataset.touchX = String(touch.clientX);
                }}
                onTouchEnd={(event) => {
                  const touch = event.changedTouches[0];
                  const start = Number((event.currentTarget as HTMLDivElement).dataset.touchX ?? '0');
                  if (!touch || !start) return;
                  const deltaX = touch.clientX - start;
                  if (deltaX > 50) setActiveIndex((current) => (current === null ? current : Math.max(0, current - 1)));
                  if (deltaX < -50) setActiveIndex((current) => (current === null ? current : Math.min(photos.length - 1, current + 1)));
                }}
              >
                <button
                  type="button"
                  onClick={() => setActiveIndex((current) => (current === null ? current : Math.max(0, current - 1)))}
                  disabled={activeIndex === 0}
                  className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-2 text-ssg-charcoal shadow disabled:opacity-40"
                >
                  <ChevronLeft size={20} />
                </button>
                <img
                  src={api.mediaUrl(activeEntry.photo.storage_url)}
                  alt={displayPhotoLabel(activeEntry.photo)}
                  className="h-[42vh] w-full object-contain md:h-[76vh]"
                />
                <button
                  type="button"
                  onClick={() => setActiveIndex((current) => (
                    current === null ? current : Math.min(photos.length - 1, current + 1)
                  ))}
                  disabled={activeIndex === photos.length - 1}
                  className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-2 text-ssg-charcoal shadow disabled:opacity-40"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              <div className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="rounded-full bg-ssg-light px-2.5 py-1 text-xs font-semibold text-ssg-green">
                      {displayPhotoLabel(activeEntry.photo)}
                    </div>
                    <p className="mt-3 text-base font-semibold text-ssg-charcoal">
                      {activeEntry.project.church_name || activeEntry.project.name}
                    </p>
                    <p className="mt-2 text-sm text-ssg-muted">
                      Uploaded {formatDate(activeEntry.photo.uploaded_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveIndex(null)}
                    className="rounded-full p-2 text-ssg-muted hover:bg-ssg-light hover:text-ssg-charcoal"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="rounded-2xl bg-[#f7f6f2] p-4 text-sm leading-6 text-ssg-charcoal">
                  <p><strong>Project:</strong> {activeEntry.project.name}</p>
                  <p><strong>Window:</strong> {photoWindowSummary(activeEntry.photo)}</p>
                  {activeEntry.photo.elevation ? <p><strong>Elevation:</strong> {activeEntry.photo.elevation}</p> : null}
                  <p><strong>Notes:</strong> {activeEntry.photo.notes || 'No notes yet.'}</p>
                </div>

                <button
                  type="button"
                  onClick={() => void downloadVisiblePhotos()}
                  className="btn-secondary"
                >
                  <Download size={16} />
                  Download all photos
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ReportsSection({
  reports,
  loading,
  onOpenProject,
}: {
  reports: ProjectDetail[];
  loading: boolean;
  onOpenProject: (projectId: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-100 px-5 py-6 md:px-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
          Reports
        </p>
        <h2 className="mt-2 text-2xl text-ssg-charcoal">Finished church reports</h2>
        <p className="mt-2 text-sm leading-6 text-ssg-slate">
          Completed reports stay here for quick access back into the project record and customer-facing material.
        </p>
      </div>

      <div className="p-5 md:p-7">
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-[1.6rem] bg-[#f4f1eb]" />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-[1.6rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center">
            <p className="text-2xl text-ssg-charcoal">No finished reports yet</p>
            <p className="mt-2 text-sm text-ssg-slate">
              Reports will appear here after they are generated and attached to a church project.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((project) => (
              <button
                key={project.id}
                onClick={() => onOpenProject(project.id)}
                className="grid w-full grid-cols-1 gap-4 rounded-[1.6rem] border border-slate-200 bg-white px-5 py-5 text-left transition hover:bg-slate-50 md:grid-cols-[minmax(0,1.4fr)_180px_40px]"
              >
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-ssg-charcoal">
                    {project.church_name || project.name}
                  </p>
                  <p className="mt-1 truncate text-sm text-ssg-muted">
                    {project.name}
                  </p>
                </div>
                <div className="text-sm text-ssg-slate">
                  Finished {formatDate(project.latest_report?.generated_at)}
                </div>
                <div className="hidden justify-end md:flex">
                  <ChevronRight size={18} className="text-ssg-muted" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TeamSection() {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-100 px-5 py-6 md:px-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
          Team
        </p>
        <h2 className="mt-2 text-2xl text-ssg-charcoal">Users</h2>
      </div>

      <div className="p-5 md:p-7">
        <div className="overflow-hidden rounded-[1.6rem] border border-slate-200">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_180px_minmax(0,1.1fr)] gap-4 bg-slate-100 px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-ssg-muted md:grid">
            <span>Name</span>
            <span>Role</span>
            <span>Info</span>
          </div>

          <div className="divide-y divide-black/5">
            {TEAM_MEMBERS.map((member) => (
              <div
                key={member.id}
                className="grid grid-cols-1 gap-4 px-5 py-5 md:grid-cols-[minmax(0,1.4fr)_180px_minmax(0,1.1fr)] md:items-center"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-white">
                    {initialsFor(member.name)}
                  </div>
                  <p className="truncate text-base font-semibold text-ssg-charcoal">{member.name}</p>
                </div>

                <div>
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm font-medium text-ssg-charcoal">
                    {normalizeRole(member.role)}
                  </span>
                </div>

                <div className="space-y-2 text-sm text-ssg-slate">
                  <div className="flex items-center gap-2">
                    <Mail size={15} className="text-ssg-muted" />
                    <span className="truncate">{member.email}</span>
                  </div>
                  {member.phone ? (
                    <div className="flex items-center gap-2">
                      <Phone size={15} className="text-ssg-muted" />
                      <span>{member.phone}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SettingsSection() {
  const detail = SECTION_COPY.settings;
  const Icon = detail.icon;

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-100 px-5 py-6 md:px-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
          Workspace Section
        </p>
        <h2 className="mt-2 text-2xl text-ssg-charcoal">{detail.title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ssg-slate">{detail.body}</p>
      </div>

      <div className="p-5 md:p-7">
        <div className="rounded-[1.6rem] border border-slate-200 bg-slate-50 p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 text-ssg-slate">
              <Icon size={22} />
            </div>
            <div>
              <p className="text-lg font-semibold text-ssg-charcoal">Reserved for dashboard controls</p>
              <p className="text-sm text-ssg-slate">The layout slot is ready when settings needs to be built out.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProjectsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectDetails, setProjectDetails] = useState<Record<string, ProjectDetail | null>>({});
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    setDetailsLoading(true);
    setLoadError(null);

    try {
      const data = await api.listProjects();
      const sorted = data.sort((a, b) => projectMoment(b) - projectMoment(a));
      setProjects(sorted);

      const detailEntries = await Promise.all(
        sorted.map(async (project) => {
          try {
            const detail = await api.getProject(project.id);
            return [project.id, detail] as const;
          } catch {
            return [project.id, null] as const;
          }
        }),
      );

      setProjectDetails(Object.fromEntries(detailEntries));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load dashboard data.';

      if (/not authenticated|401/i.test(message)) {
        clearAuth();
        router.replace('/login');
        return;
      }

      setProjects([]);
      setProjectDetails({});
      setLoadError(message);
    } finally {
      setLoading(false);
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const section = useMemo((): Section => {
    const raw = searchParams.get('section');
    if (raw === 'photos' || raw === 'reports' || raw === 'team' || raw === 'settings') return raw;
    return 'projects';
  }, [searchParams]);

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        project.name.toLowerCase().includes(q) ||
        (project.church_name ?? '').toLowerCase().includes(q) ||
        (project.address_city ?? '').toLowerCase().includes(q) ||
        (project.address_state ?? '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects, search, statusFilter]);

  const recentProjects = useMemo(() => filteredProjects.slice(0, 4), [filteredProjects]);
  const totalPhotos = useMemo(
    () => filteredProjects.reduce((sum, project) => sum + (project.photo_count ?? 0), 0),
    [filteredProjects],
  );

  const allPhotos = useMemo(() => {
    return filteredProjects
      .flatMap((project) =>
        (projectDetails[project.id]?.photos ?? []).map((photo) => ({ photo, project })),
      )
      .sort((a, b) => photoMoment(b.photo) - photoMoment(a.photo));
  }, [filteredProjects, projectDetails]);

  const finishedReports = useMemo(() => {
    return filteredProjects
      .map((project) => projectDetails[project.id])
      .filter((detail): detail is ProjectDetail => Boolean(detail?.latest_report))
      .sort((a, b) => {
        const aTime = new Date(a.latest_report?.generated_at ?? 0).getTime();
        const bTime = new Date(b.latest_report?.generated_at ?? 0).getTime();
        return bTime - aTime;
      });
  }, [filteredProjects, projectDetails]);

  const sectionHeading =
    section === 'projects'
      ? {
          eyebrow: 'Dashboard',
          title: 'Projects',
          body: '',
        }
      : {
          eyebrow: 'Workspace',
          title: section.charAt(0).toUpperCase() + section.slice(1),
          body: SECTION_COPY[section].body,
        };

  return (
    <div className="pb-20 md:pb-10">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-[#f4f6f8]/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 pb-4 pt-20 md:px-8 md:pt-8">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  {sectionHeading.eyebrow}
                </p>
                <h1 className="mt-2 text-[2rem] font-semibold leading-none text-ssg-charcoal md:text-[2.6rem]">
                  {sectionHeading.title}
                </h1>
                {sectionHeading.body ? (
                  <p className="mt-3 text-sm leading-6 text-ssg-slate md:text-base">
                    {sectionHeading.body}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="relative min-w-[280px] flex-1 md:min-w-[360px]">
                  <Search
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ssg-muted"
                  />
                  <input
                    className="input border-white/80 bg-white pl-11"
                    placeholder="Search projects, churches, or locations"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <button onClick={() => void load()} className="btn-ghost border border-black/5 bg-white" disabled={loading}>
                  <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                  Refresh
                </button>
                <button onClick={() => router.push('/projects/new')} className="btn-primary whitespace-nowrap">
                  <Plus size={18} />
                  New Project
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-sm text-ssg-slate">
                <span className="rounded-full border border-slate-200 bg-white px-4 py-2">
                  {filteredProjects.length} projects
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-4 py-2">
                  {totalPhotos} photos
                </span>
                {section === 'reports' ? (
                  <span className="rounded-full border border-slate-200 bg-white px-4 py-2">
                    {finishedReports.length} finished reports
                  </span>
                ) : null}
                {section === 'team' ? (
                  <span className="rounded-full border border-slate-200 bg-white px-4 py-2">
                    {TEAM_MEMBERS.length} team members
                  </span>
                ) : null}
              </div>
              <StatusFilter value={statusFilter} onChange={setStatusFilter} />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8 md:py-8">
        {loadError ? (
          <section className="rounded-[2rem] border border-red-200 bg-red-50 px-6 py-6">
            <p className="text-lg font-semibold text-red-900">Unable to load the dashboard</p>
            <p className="mt-2 text-sm text-red-800">{loadError}</p>
          </section>
        ) : null}

        {section === 'projects' ? (
          <>
            <ProjectListSection
              title="New & recently opened projects"
              eyebrow="Quick Access"
              body="Keep active work at the top in the same list format, with the newest project photos visible in each row."
              projects={recentProjects}
              projectDetails={projectDetails}
              loading={loading || detailsLoading}
              onOpenProject={(projectId) => router.push(`/projects/${projectId}`)}
              layout="horizontal"
            />

            <ProjectListSection
              title="All projects"
              eyebrow="Project Library"
              body="Every project stays in the lower half for fast scanning, with the job name and its latest photos visible together."
              projects={filteredProjects}
              projectDetails={projectDetails}
              loading={loading || detailsLoading}
              onOpenProject={(projectId) => router.push(`/projects/${projectId}`)}
            />
          </>
        ) : null}

        {section === 'photos' ? (
          <PhotosSection photos={allPhotos} loading={loading || detailsLoading} />
        ) : null}

        {section === 'reports' ? (
          <ReportsSection
            reports={finishedReports}
            loading={loading || detailsLoading}
            onOpenProject={(projectId) => router.push(`/projects/${projectId}`)}
          />
        ) : null}

        {section === 'team' ? <TeamSection /> : null}
        {section === 'settings' ? <SettingsSection /> : null}
      </div>

      <button
        onClick={() => router.push('/projects/new')}
        className="btn-primary fixed bottom-5 right-5 z-20 h-14 w-14 rounded-full p-0 shadow-xl md:hidden"
        aria-label="New Project"
      >
        <Plus size={24} />
      </button>
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<div className="pb-20 md:pb-10" />}>
      <ProjectsPageContent />
    </Suspense>
  );
}
