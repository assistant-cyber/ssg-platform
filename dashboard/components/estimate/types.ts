/**
 * Estimate builder types.
 * Line items are stored flat; "section" items (unit === "§section") act as group headers.
 */

export interface LineItemDraft {
  _key: string;
  type: 'item' | 'section';
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
}

export interface EstimateState {
  lines: LineItemDraft[];
  tax_enabled: boolean;
  tax_rate: string;         // e.g. "8.5"
  notes: string;
  terms: string;
}

export const UNITS = ['panel', 'window', 'sq ft', 'lin ft', 'hr', 'lot', 'item', 'each'] as const;

export function newItem(description = ''): LineItemDraft {
  return {
    _key: crypto.randomUUID(),
    type: 'item',
    description,
    quantity: '1',
    unit: 'panel',
    unit_price: '',
  };
}

export function newSection(description = 'Section'): LineItemDraft {
  return {
    _key: crypto.randomUUID(),
    type: 'section',
    description,
    quantity: '0',
    unit: '§section',
    unit_price: '0',
  };
}

export function lineTotal(l: LineItemDraft): number {
  if (l.type === 'section') return 0;
  return (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0);
}

export function subtotal(lines: LineItemDraft[]): number {
  return lines.reduce((s, l) => s + lineTotal(l), 0);
}

export function taxAmount(sub: number, rate: string, enabled: boolean): number {
  if (!enabled) return 0;
  return sub * ((parseFloat(rate) || 0) / 100);
}

export function currency(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/** Convert LineItemDraft[] to backend payload */
export function toApiPayload(lines: LineItemDraft[]) {
  return lines.map((l, i) => ({
    description: l.type === 'section' ? `##${l.description}` : l.description,
    quantity: l.type === 'section' ? 0 : parseFloat(l.quantity) || 1,
    unit: l.unit,
    unit_price: l.type === 'section' ? 0 : parseFloat(l.unit_price) || 0,
    sort_order: i,
  }));
}

/** Convert backend line items back to LineItemDraft[] */
export function fromApiItems(items: any[]): LineItemDraft[] {
  if (!items?.length) return [newItem()];
  return items.map(li => ({
    _key: li.id ?? crypto.randomUUID(),
    type: li.unit === '§section' || li.description?.startsWith('##') ? 'section' : 'item',
    description: li.description?.startsWith('##')
      ? li.description.slice(2)
      : li.description ?? '',
    quantity: String(li.quantity ?? 1),
    unit: li.unit === '§section' ? '§section' : (li.unit ?? 'panel'),
    unit_price: String(li.unit_price ?? ''),
  } as LineItemDraft));
}
