import { Camera, MapPin, Calendar } from 'lucide-react';
import type { Project } from '@/lib/api';
import Badge from '@/components/ui/Badge';

interface Props { project: Project; onClick: () => void; }

const mosaicPattern = encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 160">
    <rect width="320" height="160" fill="#7AB33D"/>
    <rect x="18" y="18" width="58" height="38" rx="6" fill="#E8F0DC"/>
    <rect x="82" y="18" width="48" height="38" rx="6" fill="#C9963B"/>
    <rect x="136" y="18" width="74" height="38" rx="6" fill="#FFFFFF"/>
    <rect x="216" y="18" width="86" height="38" rx="6" fill="#5E9A28"/>
    <rect x="18" y="62" width="72" height="34" rx="6" fill="#FFFFFF"/>
    <rect x="96" y="62" width="56" height="34" rx="6" fill="#5E9A28"/>
    <rect x="158" y="62" width="60" height="34" rx="6" fill="#D5E6B7"/>
    <rect x="224" y="62" width="78" height="34" rx="6" fill="#C9963B"/>
    <rect x="18" y="102" width="46" height="40" rx="6" fill="#C9963B"/>
    <rect x="70" y="102" width="84" height="40" rx="6" fill="#E8F0DC"/>
    <rect x="160" y="102" width="58" height="40" rx="6" fill="#FFFFFF"/>
    <rect x="224" y="102" width="78" height="40" rx="6" fill="#4A4A4A"/>
  </svg>
`);

export default function ProjectCard({ project, onClick }: Props) {
  const addr = [project.address_city, project.address_state].filter(Boolean).join(', ');
  const date = new Date(project.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const displayTitle = project.name;
  const displaySubtitle = project.church_name && project.church_name !== project.name
    ? project.church_name
    : null;
  const hasPhotos = (project.photo_count ?? 0) > 0;

  return (
    <button
      onClick={onClick}
      className="card group w-full overflow-hidden text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(44,44,44,0.12)]"
    >
      <div
        className="relative h-[120px] border-b border-black/5 md:h-[148px]"
        style={{ backgroundImage: `url("data:image/svg+xml,${mosaicPattern}")`, backgroundSize: 'cover' }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-white/8 via-transparent to-black/10" />
        <div className="absolute left-4 top-4">
          <Badge status={project.status} />
        </div>
        <div className="absolute bottom-4 left-4 right-4">
          {hasPhotos ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-white/92 px-3 py-2 text-sm font-medium text-ssg-charcoal shadow-sm">
              <Camera size={16} className="text-ssg-green" />
              {project.photo_count} {project.photo_count === 1 ? 'photo' : 'photos'}
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-2xl bg-white/90 px-3 py-2 text-sm font-medium text-ssg-charcoal shadow-sm">
              <Camera size={16} className="text-ssg-green" />
              No photos yet
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-[1.1rem] font-semibold text-ssg-charcoal transition-colors group-hover:text-ssg-dark">
              {displayTitle}
            </p>
            {displaySubtitle ? (
              <p className="mt-1 truncate text-sm text-ssg-muted">{displaySubtitle}</p>
            ) : null}
          </div>
        </div>

        {addr && (
          <div className="flex items-center gap-2 text-[15px] text-ssg-muted">
            <MapPin size={16} />
            <span className="truncate">{addr}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-4 text-[15px] text-ssg-muted">
          <span className="flex items-center gap-2">
            <Calendar size={16} />
            {date}
          </span>
          {hasPhotos ? <span>{project.photo_count} uploaded</span> : <span>Ready for upload</span>}
        </div>
      </div>
    </button>
  );
}
