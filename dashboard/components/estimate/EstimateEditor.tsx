'use client';
import { useState, useCallback } from 'react';
import {
  Plus, Trash2, GripVertical, ChevronDown, ChevronUp,
  Tag, Save, Send, Download, Eye
} from 'lucide-react';
import clsx from 'clsx';
import {
  type LineItemDraft, type EstimateState,
  UNITS, newItem, newSection,
  lineTotal, subtotal, taxAmount, currency,
} from './types';

interface Props {
  state: EstimateState;
  onChange: (s: EstimateState) => void;
  onSave: () => Promise<void>;
  onSend: () => Promise<void>;
  onPreview: () => void;
  saving: boolean;
  sending: boolean;
  locked: boolean;
  estimateStatus?: string;
}

export default function EstimateEditor({
  state, onChange, onSave, onSend, onPreview,
  saving, sending, locked, estimateStatus,
}: Props) {
  const [taxOpen, setTaxOpen] = useState(state.tax_enabled);

  const update = useCallback((patch: Partial<EstimateState>) => {
    onChange({ ...state, ...patch });
  }, [state, onChange]);

  const updateLine = (key: string, field: keyof Omit<LineItemDraft, '_key' | 'type'>, value: string) => {
    update({ lines: state.lines.map(l => l._key === key ? { ...l, [field]: value } : l) });
  };

  const removeLine = (key: string) => {
    update({ lines: state.lines.filter(l => l._key !== key) });
  };

  const insertAfter = (key: string, item: LineItemDraft) => {
    const idx = state.lines.findIndex(l => l._key === key);
    const next = [...state.lines];
    next.splice(idx + 1, 0, item);
    update({ lines: next });
  };

  const sub   = subtotal(state.lines);
  const tax   = taxAmount(sub, state.tax_rate, state.tax_enabled);
  const grand = sub + tax;

  return (
    <div className="space-y-0 select-none">

      {/* ── Locked banner ─────────────────────────────────────────────── */}
      {locked && (
        <div className={clsx(
          'rounded-xl px-4 py-3 mb-4 text-sm font-medium flex items-center gap-2',
          estimateStatus === 'accepted' ? 'bg-green-50 text-green-800 border border-green-200' :
          estimateStatus === 'declined' ? 'bg-red-50 text-red-700 border border-red-200' :
          'bg-amber-50 text-amber-800 border border-amber-200',
        )}>
          <div className={clsx('w-2 h-2 rounded-full shrink-0',
            estimateStatus === 'accepted' ? 'bg-green-500' :
            estimateStatus === 'declined' ? 'bg-red-500' : 'bg-amber-400'
          )} />
          {estimateStatus === 'accepted' && 'Estimate accepted by customer — read only'}
          {estimateStatus === 'declined' && 'Estimate declined by customer — read only'}
          {estimateStatus === 'sent'     && 'Estimate sent to customer — awaiting response'}
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        {/* Table header row */}
        <div className="grid bg-ssg-dark text-white text-xs font-semibold uppercase tracking-wide px-5 py-3"
          style={{ gridTemplateColumns: '1fr 80px 90px 110px 100px 36px' }}
        >
          <span>Description</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Unit</span>
          <span className="text-right">Unit Price</span>
          <span className="text-right">Total</span>
          <span />
        </div>

        {/* Lines */}
        <div className="divide-y divide-gray-50">
          {state.lines.map((line, idx) => (
            line.type === 'section'
              ? <SectionRow key={line._key} line={line} locked={locked}
                  onDescChange={v => updateLine(line._key, 'description', v)}
                  onAddItem={() => insertAfter(line._key, newItem())}
                  onRemove={() => removeLine(line._key)} />
              : <ItemRow key={line._key} line={line} locked={locked} idx={idx}
                  onChange={(f, v) => updateLine(line._key, f, v)}
                  onInsertSection={() => insertAfter(line._key, newSection())}
                  onAddItem={() => insertAfter(line._key, newItem())}
                  onRemove={() => removeLine(line._key)} />
          ))}
        </div>

        {/* Add buttons */}
        {!locked && (
          <div className="px-5 py-3 flex gap-3 bg-gray-50 border-t border-gray-100">
            <button onClick={() => update({ lines: [...state.lines, newItem()] })}
              className="btn-ghost text-sm text-ssg-dark">
              <Plus size={15} /> Add Line Item
            </button>
            <button onClick={() => update({ lines: [...state.lines, newSection()] })}
              className="btn-ghost text-sm text-gray-500">
              <Tag size={14} /> Add Section Header
            </button>
          </div>
        )}
      </div>

      {/* ── Totals ────────────────────────────────────────────────────── */}
      <div className="flex justify-end mt-4">
        <div className="w-80 space-y-0 card overflow-hidden">
          <div className="flex justify-between px-5 py-3 text-sm border-b border-gray-50">
            <span className="text-gray-500">Subtotal</span>
            <span className="font-semibold">{currency(sub)}</span>
          </div>

          {/* Tax toggle */}
          <div className="border-b border-gray-50">
            <button
              className="flex items-center justify-between w-full px-5 py-3 text-sm hover:bg-gray-50 transition-colors"
              onClick={() => { setTaxOpen(v => !v); if (!state.tax_enabled) update({ tax_enabled: true }); }}
              disabled={locked}
            >
              <span className="text-gray-500">
                Tax {state.tax_enabled ? `(${state.tax_rate || 0}%)` : ''}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-semibold">{state.tax_enabled ? currency(tax) : '—'}</span>
                {!locked && (taxOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
              </span>
            </button>
            {taxOpen && !locked && (
              <div className="px-5 pb-3 flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={state.tax_enabled}
                    onChange={e => update({ tax_enabled: e.target.checked })}
                    className="accent-ssg-green" />
                  Apply tax
                </label>
                {state.tax_enabled && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <input type="number" min="0" max="100" step="0.1"
                      className="input w-20 text-right text-sm"
                      value={state.tax_rate}
                      onChange={e => update({ tax_rate: e.target.value })}
                      placeholder="8.5" />
                    <span className="text-sm text-gray-400">%</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Grand total */}
          <div className="flex justify-between items-center px-5 py-4 bg-ssg-dark">
            <span className="font-bold text-white text-base" style={{ fontFamily: 'Georgia, serif' }}>
              Total Due
            </span>
            <span className="font-bold text-ssg-green text-xl">
              {currency(grand)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Notes / Terms ─────────────────────────────────────────────── */}
      {!locked && (
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="label">Notes (customer-facing)</label>
            <textarea className="input h-24 resize-none text-sm"
              value={state.notes}
              onChange={e => update({ notes: e.target.value })}
              placeholder="Work scope notes, scheduling, special considerations…" />
          </div>
          <div>
            <label className="label">Terms & Conditions</label>
            <textarea className="input h-24 resize-none text-sm"
              value={state.terms}
              onChange={e => update({ terms: e.target.value })}
              placeholder="Payment terms, warranty, etc.  e.g. 50% deposit required, balance due on completion." />
          </div>
        </div>
      )}
      {locked && (state.notes || state.terms) && (
        <div className="grid grid-cols-2 gap-4 mt-4">
          {state.notes && (
            <div className="card p-4">
              <p className="text-xs font-semibold text-ssg-dark uppercase tracking-wide mb-2">Notes</p>
              <p className="text-sm text-gray-600 leading-relaxed">{state.notes}</p>
            </div>
          )}
          {state.terms && (
            <div className="card p-4">
              <p className="text-xs font-semibold text-ssg-dark uppercase tracking-wide mb-2">Terms</p>
              <p className="text-sm text-gray-600 leading-relaxed">{state.terms}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Action bar ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-2">
        <button onClick={onPreview} className="btn-ghost">
          <Eye size={15} /> Preview PDF
        </button>

        {!locked && (
          <>
            <button onClick={onSave} disabled={saving} className="btn-secondary ml-auto">
              <Save size={15} />
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
            <button onClick={onSend} disabled={sending} className="btn-primary">
              <Send size={15} />
              {sending ? 'Sending…' : 'Send to Customer'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionRow({ line, locked, onDescChange, onAddItem, onRemove }: {
  line: LineItemDraft;
  locked: boolean;
  onDescChange: (v: string) => void;
  onAddItem: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-5 py-2.5 bg-ssg-light border-l-4 border-ssg-green group">
      <Tag size={13} className="text-ssg-green shrink-0" />
      {locked ? (
        <span className="font-bold text-ssg-dark text-sm flex-1">{line.description}</span>
      ) : (
        <input
          className="flex-1 bg-transparent border-0 focus:outline-none font-bold text-ssg-dark text-sm"
          value={line.description}
          onChange={e => onDescChange(e.target.value)}
          placeholder="Section name…"
        />
      )}
      {!locked && (
        <button onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all">
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

function ItemRow({ line, locked, idx, onChange, onInsertSection, onAddItem, onRemove }: {
  line: LineItemDraft;
  locked: boolean;
  idx: number;
  onChange: (field: keyof Omit<LineItemDraft, '_key' | 'type'>, value: string) => void;
  onInsertSection: () => void;
  onAddItem: () => void;
  onRemove: () => void;
}) {
  const total = lineTotal(line);
  const isEven = idx % 2 === 0;

  return (
    <div
      className={clsx(
        'grid items-center px-5 py-2 group transition-colors',
        isEven ? 'bg-white' : 'bg-gray-50/50',
        !locked && 'hover:bg-ssg-lighter/30',
      )}
      style={{ gridTemplateColumns: '1fr 80px 90px 110px 100px 36px' }}
    >
      {/* Description */}
      {locked ? (
        <span className="text-sm text-gray-800 pr-3">{line.description}</span>
      ) : (
        <input
          className="text-sm bg-transparent border-0 focus:outline-none focus:bg-white focus:px-2 focus:rounded transition-all pr-3 w-full"
          value={line.description}
          onChange={e => onChange('description', e.target.value)}
          placeholder="Describe the work…"
        />
      )}

      {/* Qty */}
      {locked ? (
        <span className="text-sm text-gray-500 text-right">{line.quantity}</span>
      ) : (
        <input type="number" min="0" step="0.1"
          className="text-sm bg-transparent border-0 focus:outline-none focus:bg-white focus:rounded text-right w-full"
          value={line.quantity}
          onChange={e => onChange('quantity', e.target.value)}
        />
      )}

      {/* Unit */}
      {locked ? (
        <span className="text-sm text-gray-400 text-right">{line.unit}</span>
      ) : (
        <select
          className="text-sm bg-transparent border-0 focus:outline-none text-gray-500 text-right"
          value={line.unit}
          onChange={e => onChange('unit', e.target.value)}
        >
          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      )}

      {/* Unit price */}
      {locked ? (
        <span className="text-sm text-right">{currency(parseFloat(line.unit_price) || 0)}</span>
      ) : (
        <div className="flex items-center justify-end gap-1">
          <span className="text-gray-400 text-xs">$</span>
          <input type="number" min="0" step="0.01"
            className="text-sm bg-transparent border-0 focus:outline-none focus:bg-white focus:rounded text-right w-20"
            value={line.unit_price}
            onChange={e => onChange('unit_price', e.target.value)}
            placeholder="0.00"
          />
        </div>
      )}

      {/* Total */}
      <span className="text-sm font-semibold text-ssg-dark text-right">
        {currency(total)}
      </span>

      {/* Delete */}
      <div className="flex justify-center">
        {!locked && (
          <button onClick={onRemove}
            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all p-1">
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
