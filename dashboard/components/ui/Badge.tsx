import clsx from 'clsx';

const STATUS: Record<string, { label: string; cls: string }> = {
  active:               { label: 'Assessment',       cls: 'border border-slate-300 bg-slate-100 text-slate-700' },
  assessment_complete:  { label: 'Assessment Done',  cls: 'border border-slate-300 bg-slate-100 text-slate-700' },
  report_generated:     { label: 'Report Ready',     cls: 'border border-slate-300 bg-slate-100 text-slate-700' },
  estimate_sent:        { label: 'Estimate Sent',    cls: 'border border-slate-300 bg-white text-slate-600' },
  accepted:             { label: 'Accepted',         cls: 'bg-ssg-green text-white' },
  declined:             { label: 'Declined',         cls: 'bg-white text-red-700 border border-red-200' },
};

export default function Badge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span
      className={clsx(
        'whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]',
        s.cls,
      )}
    >
      {s.label}
    </span>
  );
}
