const OPTIONS = [
  { value: 'all',                label: 'All' },
  { value: 'active',             label: 'Assessment' },
  { value: 'assessment_complete',label: 'Assessment Done' },
  { value: 'accepted',           label: 'Accepted' },
  { value: 'report_generated',   label: 'Report Ready' },
  { value: 'estimate_sent',      label: 'Estimate Sent' },
  { value: 'declined',           label: 'Declined' },
];

interface Props { value: string; onChange: (v: string) => void; }

export default function StatusFilter({ value, onChange }: Props) {
  return (
    <>
      <div className="hidden md:block">
        <select
          className="input w-[220px]"
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          {OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="md:hidden -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {OPTIONS.slice(0, 4).map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={[
                'min-h-11 shrink-0 snap-start rounded-full px-4 text-[15px] font-medium transition',
                active
                  ? 'bg-ssg-green text-white'
                  : 'border border-black/10 bg-white text-ssg-charcoal',
              ].join(' ')}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
