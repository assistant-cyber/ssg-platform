'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Send, Trash2, X } from 'lucide-react';
import api, { type ProgressUpdate, type ProjectDetail } from '@/lib/api';

interface Props {
  project: ProjectDetail;
  onRefresh: () => void;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ProgressTab({ project, onRefresh }: Props) {
  const [updates, setUpdates] = useState<ProgressUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const [markingInProgress, setMarkingInProgress] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const data = await api.listProgressUpdates(project.id);
      setUpdates(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load progress updates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void load();
  }, [project.id]);

  const handleMarkInProgress = async () => {
    if (markingInProgress) return;
    setMarkingInProgress(true);
    try {
      await api.updateProject(project.id, { status: 'in_progress' });
      await onRefresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not update project status.');
    } finally {
      setMarkingInProgress(false);
    }
  };

  const handlePost = async () => {
    if (posting) return;
    if (!note.trim() && files.length === 0) {
      setPostError('Add a note and/or at least one photo before posting.');
      return;
    }
    setPosting(true);
    setPostError(null);
    try {
      await api.createProgressUpdate(project.id, note.trim(), files);
      setNote('');
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await load();
    } catch (error) {
      setPostError(error instanceof Error ? error.message : 'Failed to post update. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (updateId: string) => {
    const confirmed = window.confirm('Delete this progress update? This cannot be undone.');
    if (!confirmed) return;
    try {
      await api.deleteProgressUpdate(updateId);
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not delete this update.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Customer-Facing Timeline
            </p>
            <h2 className="mt-2 text-2xl text-ssg-charcoal">Project Updates</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ssg-slate">
              Post dated notes and in-progress photos here — the customer sees these on their
              portal page as the work happens. Separate from the assessment photo gallery.
            </p>
          </div>
          {project.status !== 'in_progress' ? (
            <button
              type="button"
              onClick={() => void handleMarkInProgress()}
              disabled={markingInProgress}
              className="btn-primary shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {markingInProgress ? <Loader2 size={16} className="animate-spin" /> : null}
              Mark Project In Progress
            </button>
          ) : (
            <span className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-ssg-green/15 bg-ssg-light px-4 text-sm font-medium text-ssg-green">
              <span className="h-2 w-2 rounded-full bg-ssg-green" />
              Project is In Progress
            </span>
          )}
        </div>
      </div>

      <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 md:p-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
          Post an Update
        </p>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={4}
          className="input mt-4 resize-none"
          placeholder="e.g. Removed window 3 for releading. Lead came was heavily oxidized and will be fully replaced."
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            className="hidden"
            id="progress-update-files"
          />
          <label
            htmlFor="progress-update-files"
            className="btn-secondary cursor-pointer"
          >
            <Camera size={16} />
            {files.length > 0 ? `${files.length} photo${files.length === 1 ? '' : 's'} selected` : 'Add photos'}
          </label>
          <button
            type="button"
            onClick={() => void handlePost()}
            disabled={posting}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {posting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Post Update
          </button>
        </div>

        {postError ? (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {postError}
          </p>
        ) : null}
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-[1.6rem] bg-slate-100" />
            ))}
          </div>
        ) : loadError ? (
          <div className="rounded-[1.6rem] border border-dashed border-red-200 bg-red-50 px-6 py-10 text-center text-sm text-red-700">
            {loadError}
          </div>
        ) : updates.length === 0 ? (
          <div className="rounded-[1.6rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center">
            <p className="text-2xl text-ssg-charcoal">No updates posted yet</p>
            <p className="mt-2 text-sm text-ssg-slate">
              Post your first update above once work begins on this project.
            </p>
          </div>
        ) : (
          updates.map((update) => (
            <div key={update.id} className="rounded-[1.6rem] border border-slate-200 bg-white p-5 md:p-7">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-ssg-slate">{formatDateTime(update.created_at)}</p>
                <button
                  type="button"
                  onClick={() => void handleDelete(update.id)}
                  className="rounded-full p-2 text-ssg-muted hover:bg-red-50 hover:text-red-700"
                  title="Delete update"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {update.note ? (
                <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-ssg-charcoal">{update.note}</p>
              ) : null}
              {update.photos.length > 0 ? (
                <div className="mt-4 grid grid-cols-3 gap-3 md:grid-cols-5">
                  {update.photos.map((photo) => (
                    <a
                      key={photo.id}
                      href={api.mediaUrl(photo.storage_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="aspect-square overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
                    >
                      <img
                        src={api.mediaUrl(photo.thumbnail_url || photo.storage_url)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
