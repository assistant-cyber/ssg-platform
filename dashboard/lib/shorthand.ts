/**
 * Shorthand → Plain English translator for customer-facing notes.
 *
 * SSG techs type notes like: "1A w2 l1 b0 rot 61pc 30x36"
 * Customers see: "Window 1, Panel A — Moderate warping · Minor lead deterioration ·
 *                 No broken glass · Wood rot present · 61 glass pieces · 30″ × 36″ panel"
 */

const WARP_LABELS: Record<number, string> = {
  0: 'No warping',
  1: 'Very minor warping',
  2: 'Moderate warping',
  3: 'Significant warping',
  4: 'Severe warping',
  5: 'Critical warping',
};

const LEAD_LABELS: Record<number, string> = {
  0: 'Lead in good condition',
  1: 'Minor lead deterioration',
  2: 'Moderate lead deterioration',
  3: 'Significant lead deterioration',
  4: 'Severe lead deterioration',
  5: 'Critical lead failure',
};

export interface TranslatedNote {
  windowLabel: string;     // "Window 1, Panel A" or "Window 12 (overall)"
  conditions: string[];    // plain-English condition items
  dimensions: string;      // "30″ × 36″ panel" or ""
  overall: string;         // "48″ × 96″ overall window" or ""
  raw: string;
}

export function translateShorthand(raw: string): TranslatedNote | null {
  if (!raw?.trim()) return null;

  const text = raw.trim();
  const conditions: string[] = [];

  // ── Window / panel ID ────────────────────────────────────────────────────
  const idMatch = text.match(/^(\d+)([a-zA-Z])?/);
  if (!idMatch) {
    // Not standard shorthand — return as-is
    return {
      windowLabel: '',
      conditions: [],
      dimensions: '',
      overall: '',
      raw: text,
    };
  }

  const winNum = idMatch[1];
  const panel  = idMatch[2]?.toUpperCase() ?? '';
  const windowLabel = panel
    ? `Window ${winNum}, Panel ${panel}`
    : `Window ${winNum} (overall)`;

  const rest = text.slice(idMatch[0].length).trim();

  // ── Warping: w0–w5 ───────────────────────────────────────────────────────
  const warpMatch = rest.match(/\bw([0-5])\b/i);
  if (warpMatch) {
    const level = parseInt(warpMatch[1]);
    conditions.push(WARP_LABELS[level] ?? `Warping level ${level}`);
  }

  // ── Lead: l0–l5 ──────────────────────────────────────────────────────────
  const leadMatch = rest.match(/\bl([0-5])\b/i);
  if (leadMatch) {
    const level = parseInt(leadMatch[1]);
    conditions.push(LEAD_LABELS[level] ?? `Lead condition level ${level}`);
  }

  // ── Breaks: b0–b999 ──────────────────────────────────────────────────────
  const breakMatch = rest.match(/\bb(\d+)\b/i);
  if (breakMatch) {
    const count = parseInt(breakMatch[1]);
    conditions.push(
      count === 0 ? 'No broken glass' :
      count === 1 ? '1 broken glass piece' :
      `${count} broken glass pieces`
    );
  }

  // ── Wood rot: "rot" ───────────────────────────────────────────────────────
  if (/\brot\b/i.test(rest)) {
    conditions.push('Wood rot present in frame');
  }

  // ── Paint / caulk fail: standalone "p" ───────────────────────────────────
  const restNoPc = rest.replace(/\d+\s*pc\b/gi, '');
  if (/\bp\b(?!\w)/i.test(restNoPc)) {
    conditions.push('Failing paint or caulking');
  }

  // ── Pieces: NNpc ─────────────────────────────────────────────────────────
  const piecesMatch = rest.match(/\b(\d+)\s*pc\b/i);
  if (piecesMatch) {
    conditions.push(`${piecesMatch[1]} glass pieces in this panel`);
  }

  // ── Panel dimensions: WxH ────────────────────────────────────────────────
  const ovMatch   = rest.match(/\bov\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\b/i);
  const dimsMatch = rest.replace(/\bov\s*\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\b/gi, '')
                        .match(/\b(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\b/i);

  const dims    = dimsMatch  ? `${dimsMatch[1]}″ × ${dimsMatch[2]}″ panel`  : '';
  const overall = ovMatch    ? `${ovMatch[1]}″ × ${ovMatch[2]}″ overall window` : '';

  // Elevation keyword
  const elevMatch = rest.match(/\b(north|south|east|west|ne|nw|se|sw)\b/i);
  if (elevMatch) {
    conditions.push(`${capitalize(elevMatch[1])} elevation`);
  }

  // If no conditions were parsed and it doesn't look like shorthand
  if (!warpMatch && !leadMatch && !breakMatch && !piecesMatch && !dims && !overall) {
    // Might be free-form text — return as-is
    return {
      windowLabel,
      conditions: [],
      dimensions: '',
      overall: '',
      raw: text,
    };
  }

  return { windowLabel, conditions, dimensions: dims, overall, raw: text };
}

/** Format a TranslatedNote into a single readable string for display. */
export function formatNote(note: TranslatedNote | null, raw: string): string {
  if (!note) return raw ?? '';

  const parts: string[] = [];

  if (note.conditions.length) {
    parts.push(note.conditions.join(' · '));
  }
  if (note.dimensions) parts.push(note.dimensions);
  if (note.overall)    parts.push(note.overall);

  if (!parts.length) return raw;
  return parts.join(' · ');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
