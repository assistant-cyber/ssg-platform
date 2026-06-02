import type { Photo, ProjectDetail } from '@/lib/api';

export const DEFAULT_CONDITION_SCHEDULE_TITLE = 'Appendix 4: Window Condition Schedule';
export const DEFAULT_CONDITION_SCHEDULE_INTRO = 'Per-window and per-panel assessment details. Red indicates critical condition, yellow indicates moderate, green indicates good condition.';

export const REPORT_SECTIONS = [
  {
    key: 'overview',
    title: 'Overview & Valuation',
    subtitle: 'Set the context and importance of the windows being assessed.',
    placeholder: 'Summarize the site visit, historical context, and the overall value of the stained glass collection.',
  },
  {
    key: 'current_condition',
    title: 'Current Condition',
    subtitle: 'Describe the visible condition issues the client needs to understand.',
    placeholder: 'Explain the lead deterioration, bowing, broken glass, frame issues, water ingress, and other observed defects.',
  },
  {
    key: 'causes',
    title: 'What Caused These Issues',
    subtitle: 'Break down the root causes in language a customer can understand.',
    placeholder: 'List the major causes, such as age, deferred maintenance, environmental stress, or structural movement.',
  },
  {
    key: 'hundred_year_plan',
    title: '100-Year Restoration Plan',
    subtitle: 'Lay out the restoration strategy and preservation approach.',
    placeholder: 'Describe the proposed restoration sequence, re-leading plan, glazing recommendations, and long-term stewardship strategy.',
  },
  {
    key: 'summary',
    title: 'Summary',
    subtitle: 'Close with the professional recommendation and next-step framing.',
    placeholder: 'Summarize the recommendation and explain that pricing or proposal details are provided separately.',
  },
] as const;

export type ReportSectionKey = typeof REPORT_SECTIONS[number]['key'];

export interface ReportSectionDraft {
  body: string;
  photo_ids: string[];
  title?: string;
  subtitle?: string;
}

export interface ReportMetaDraft {
  report_title: string;
  report_subtitle: string;
  report_label: string;
  cover_photo_id: string | null;
  ai_voice?: 'pastoral_confident' | 'heritage_stewardship' | 'concise_executive';
  ai_context?: string;
  report_downloaded_at?: string | null;
  portal_published_at?: string | null;
  portal_published_version_at?: string | null;
  estimate_briefs?: EstimateBriefDraft[];
  condition_schedule_title?: string;
  condition_schedule_intro?: string;
  condition_schedule_rows?: ReportConditionScheduleRow[];
}

export interface EstimateBriefDraft {
  id: string;
  photo_ids: string[];
  text: string;
  created_at: string;
  updated_at: string;
}

export interface ReportConditionScheduleRow {
  id: string;
  elev: string;
  cond: string;
  warp: string;
  lead: string;
  glass_breaks: string;
  wood_rot: string;
  paint_caulk: string;
  pieces: string;
  sqft: string;
  notes: string;
  is_window: boolean;
}

export interface ReportDraft {
  _meta: ReportMetaDraft;
  overview: ReportSectionDraft;
  current_condition: ReportSectionDraft;
  causes: ReportSectionDraft;
  hundred_year_plan: ReportSectionDraft;
  summary: ReportSectionDraft;
}

function normalizeSection(
  raw: unknown,
  fallbackTitle: string,
  fallbackSubtitle: string,
): ReportSectionDraft {
  if (typeof raw === 'string') {
    return {
      body: raw,
      photo_ids: [],
      title: fallbackTitle,
      subtitle: fallbackSubtitle,
    };
  }

  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    return {
      body: typeof record.body === 'string' ? record.body : '',
      photo_ids: Array.isArray(record.photo_ids)
        ? record.photo_ids.filter((value): value is string => typeof value === 'string')
        : [],
      title: typeof record.title === 'string' ? record.title : fallbackTitle,
      subtitle: typeof record.subtitle === 'string' ? record.subtitle : fallbackSubtitle,
    };
  }

  return {
    body: '',
    photo_ids: [],
    title: fallbackTitle,
    subtitle: fallbackSubtitle,
  };
}

function valueOrEmpty(value: unknown) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function yesNo(value: boolean | null | undefined) {
  return value ? 'Yes' : '';
}

function sqft(width: number | null | undefined, height: number | null | undefined) {
  if (!width || !height) return '';
  return String(Math.ceil((width * height) / 144));
}

function severityToCondition(warping: number | null | undefined, leadDet: number | null | undefined) {
  if (warping === null || warping === undefined) {
    if (leadDet === null || leadDet === undefined) return '';
  }
  const maxSeverity = Math.max(warping ?? 0, leadDet ?? 0);
  if (maxSeverity >= 3) return 'Poor';
  if (maxSeverity === 2) return 'Fair';
  return 'Good';
}

function sortWindowRef(left: string, right: string) {
  const parse = (value: string) => {
    const match = /^(\d+)([A-Z]*)$/i.exec(value.trim());
    return {
      number: match ? Number(match[1]) : Number.MAX_SAFE_INTEGER,
      suffix: match ? match[2].toUpperCase() : value.toUpperCase(),
    };
  };

  const a = parse(left);
  const b = parse(right);
  if (a.number !== b.number) return a.number - b.number;
  return a.suffix.localeCompare(b.suffix);
}

function normalizeConditionScheduleRow(raw: unknown): ReportConditionScheduleRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id : typeof row.win_panel === 'string' ? row.win_panel : '';
  if (!id.trim()) return null;
  return {
    id: id.trim(),
    elev: typeof row.elev === 'string' ? row.elev : '',
    cond: typeof row.cond === 'string' ? row.cond : '',
    warp: valueOrEmpty(row.warp),
    lead: valueOrEmpty(row.lead),
    glass_breaks: typeof row.glass_breaks === 'string'
      ? row.glass_breaks
      : valueOrEmpty(row.breaks),
    wood_rot: typeof row.wood_rot === 'string' ? row.wood_rot : valueOrEmpty(row.wood_rot),
    paint_caulk: typeof row.paint_caulk === 'string'
      ? row.paint_caulk
      : typeof row.paint === 'string'
        ? row.paint
        : valueOrEmpty(row.paint),
    pieces: valueOrEmpty(row.pieces),
    sqft: valueOrEmpty(row.sqft),
    notes: typeof row.notes === 'string' ? row.notes : '',
    is_window: Boolean(row.is_window),
  };
}

function deriveConditionScheduleRows(project: ProjectDetail): ReportConditionScheduleRow[] {
  const grouped = new Map<string, {
    overall: ReportConditionScheduleRow | null;
    panels: ReportConditionScheduleRow[];
  }>();

  for (const photo of project.photos) {
    const condition = photo.condition_data;
    const windowNumber = (condition?.window_num ?? photo.window_number ?? '').trim();
    if (!windowNumber) continue;

    const panelLetter = (condition?.panel_letter ?? photo.panel_letter ?? '').trim().toUpperCase();
    const elevation = (condition?.elevation ?? photo.elevation ?? '').trim().toUpperCase();
    const entry = grouped.get(windowNumber) ?? { overall: null, panels: [] };
    const isWindow = Boolean(condition?.is_overall_only || !panelLetter);
    const rowId = `${windowNumber}${panelLetter}`.trim();
    const row: ReportConditionScheduleRow = {
      id: rowId,
      elev: elevation,
      cond: severityToCondition(condition?.warping, condition?.lead_det),
      warp: valueOrEmpty(condition?.warping),
      lead: valueOrEmpty(condition?.lead_det),
      glass_breaks: valueOrEmpty(condition?.breaks),
      wood_rot: yesNo(condition?.wood_rot),
      paint_caulk: yesNo(condition?.paint_fail),
      pieces: valueOrEmpty(condition?.pieces),
      sqft: sqft(condition?.panel_w, condition?.panel_h),
      notes: (condition?.parsed_notes ?? photo.notes ?? '').trim(),
      is_window: isWindow,
    };

    if (isWindow) {
      entry.overall = {
        ...row,
        id: windowNumber,
        cond: '',
        warp: '',
        lead: '',
        glass_breaks: '',
        pieces: '',
        sqft: sqft(condition?.overall_w, condition?.overall_h),
        notes: '',
      };
    } else {
      entry.panels.push(row);
    }

    grouped.set(windowNumber, entry);
  }

  const rows: ReportConditionScheduleRow[] = [];
  const orderedWindows = Array.from(grouped.keys()).sort(sortWindowRef);
  for (const windowNumber of orderedWindows) {
    const entry = grouped.get(windowNumber);
    if (!entry) continue;

    const panelConditionRank = entry.panels.reduce((current, row) => {
      const rank = row.cond === 'Poor' ? 3 : row.cond === 'Fair' ? 2 : row.cond === 'Good' ? 1 : 0;
      return Math.max(current, rank);
    }, 0);
    const overallElevation = entry.overall?.elev || entry.panels.find((row) => row.elev)?.elev || '';
    const overallSqft = entry.overall?.sqft || '';
    const hasRot = entry.panels.some((row) => row.wood_rot === 'Yes') || entry.overall?.wood_rot === 'Yes';
    const hasPaint = entry.panels.some((row) => row.paint_caulk === 'Yes') || entry.overall?.paint_caulk === 'Yes';

    rows.push({
      id: windowNumber,
      elev: overallElevation,
      cond: panelConditionRank >= 3 ? 'Poor' : panelConditionRank === 2 ? 'Fair' : panelConditionRank === 1 ? 'Good' : '',
      warp: '',
      lead: '',
      glass_breaks: '',
      wood_rot: hasRot ? 'Yes' : '',
      paint_caulk: hasPaint ? 'Yes' : '',
      pieces: '',
      sqft: overallSqft,
      notes: '',
      is_window: true,
    });

    entry.panels.sort((left, right) => sortWindowRef(left.id, right.id));
    rows.push(...entry.panels);
  }

  return rows;
}

export function createEmptyReportDraft(project: ProjectDetail): ReportDraft {
  const coverPhotoId = project.photos[0]?.id ?? null;

  return {
    _meta: {
      report_title: project.church_name ?? project.name,
      report_subtitle: 'A cleaner, client-ready assessment draft built from field observations and photo evidence.',
      report_label: 'Assessment Report',
      cover_photo_id: coverPhotoId,
      ai_voice: 'concise_executive',
      ai_context: '',
      report_downloaded_at: null,
      portal_published_at: null,
      portal_published_version_at: null,
      estimate_briefs: [],
      condition_schedule_title: DEFAULT_CONDITION_SCHEDULE_TITLE,
      condition_schedule_intro: DEFAULT_CONDITION_SCHEDULE_INTRO,
      condition_schedule_rows: deriveConditionScheduleRows(project),
    },
    overview: normalizeSection(null, REPORT_SECTIONS[0].title, REPORT_SECTIONS[0].subtitle),
    current_condition: normalizeSection(null, REPORT_SECTIONS[1].title, REPORT_SECTIONS[1].subtitle),
    causes: normalizeSection(null, REPORT_SECTIONS[2].title, REPORT_SECTIONS[2].subtitle),
    hundred_year_plan: normalizeSection(null, REPORT_SECTIONS[3].title, REPORT_SECTIONS[3].subtitle),
    summary: normalizeSection(null, REPORT_SECTIONS[4].title, REPORT_SECTIONS[4].subtitle),
  };
}

export function reportDraftFromNarrative(
  narrative: Record<string, unknown> | null | undefined,
  project: ProjectDetail,
): ReportDraft {
  const base = createEmptyReportDraft(project);

  if (!narrative || typeof narrative !== 'object') {
    return base;
  }

  const meta = narrative._meta;
  if (meta && typeof meta === 'object') {
    const metaRecord = meta as Record<string, unknown>;
    base._meta = {
      report_title: typeof metaRecord.report_title === 'string'
        ? metaRecord.report_title
        : base._meta.report_title,
      report_subtitle: typeof metaRecord.report_subtitle === 'string'
        ? metaRecord.report_subtitle
        : base._meta.report_subtitle,
      report_label: typeof metaRecord.report_label === 'string'
        ? metaRecord.report_label
        : base._meta.report_label,
      cover_photo_id: typeof metaRecord.cover_photo_id === 'string'
        ? metaRecord.cover_photo_id
        : base._meta.cover_photo_id,
      ai_voice: metaRecord.ai_voice === 'heritage_stewardship'
        || metaRecord.ai_voice === 'concise_executive'
        || metaRecord.ai_voice === 'pastoral_confident'
        ? metaRecord.ai_voice
        : 'concise_executive',
      ai_context: typeof metaRecord.ai_context === 'string'
        ? metaRecord.ai_context
        : '',
      report_downloaded_at: typeof metaRecord.report_downloaded_at === 'string'
        ? metaRecord.report_downloaded_at
        : null,
      portal_published_at: typeof metaRecord.portal_published_at === 'string'
        ? metaRecord.portal_published_at
        : null,
      portal_published_version_at: typeof metaRecord.portal_published_version_at === 'string'
        ? metaRecord.portal_published_version_at
        : null,
      estimate_briefs: Array.isArray(metaRecord.estimate_briefs)
        ? metaRecord.estimate_briefs.filter((value): value is EstimateBriefDraft => {
            if (!value || typeof value !== 'object') return false;
            const record = value as Record<string, unknown>;
            return (
              typeof record.id === 'string'
              && typeof record.text === 'string'
              && typeof record.created_at === 'string'
              && typeof record.updated_at === 'string'
              && Array.isArray(record.photo_ids)
            );
          }).map((value) => ({
            id: value.id,
            text: value.text,
            created_at: value.created_at,
            updated_at: value.updated_at,
            photo_ids: value.photo_ids.filter((photoId): photoId is string => typeof photoId === 'string'),
          }))
        : [],
      condition_schedule_title: typeof metaRecord.condition_schedule_title === 'string'
        ? metaRecord.condition_schedule_title
        : DEFAULT_CONDITION_SCHEDULE_TITLE,
      condition_schedule_intro: typeof metaRecord.condition_schedule_intro === 'string'
        ? metaRecord.condition_schedule_intro
        : DEFAULT_CONDITION_SCHEDULE_INTRO,
      condition_schedule_rows: Array.isArray(metaRecord.condition_schedule_rows)
        ? metaRecord.condition_schedule_rows
          .map((value) => normalizeConditionScheduleRow(value))
          .filter((value): value is ReportConditionScheduleRow => Boolean(value))
        : deriveConditionScheduleRows(project),
    };
  }

  for (const section of REPORT_SECTIONS) {
    base[section.key] = normalizeSection(
      narrative[section.key],
      section.title,
      section.subtitle,
    );
  }

  return base;
}

export function estimateBriefsFromNarrative(narrative: Record<string, unknown> | null | undefined) {
  const meta = narrative?._meta;
  if (!meta || typeof meta !== 'object') return [];
  const briefs = (meta as Record<string, unknown>).estimate_briefs;
  if (!Array.isArray(briefs)) return [];
  return briefs.filter((value): value is EstimateBriefDraft => {
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    return typeof record.id === 'string' && typeof record.text === 'string' && Array.isArray(record.photo_ids);
  }).map((value) => ({
    id: value.id,
    text: value.text,
    created_at: typeof value.created_at === 'string' ? value.created_at : new Date().toISOString(),
    updated_at: typeof value.updated_at === 'string' ? value.updated_at : new Date().toISOString(),
    photo_ids: value.photo_ids.filter((photoId): photoId is string => typeof photoId === 'string'),
  }));
}

export function findPhotoById(photos: Photo[], photoId: string | null | undefined) {
  if (!photoId) return null;
  return photos.find((photo) => photo.id === photoId) ?? null;
}

export function selectedPhotosForSection(
  draft: ReportDraft,
  photos: Photo[],
  sectionKey: ReportSectionKey,
) {
  const ids = draft[sectionKey].photo_ids;
  return ids
    .map((photoId) => findPhotoById(photos, photoId))
    .filter((photo): photo is Photo => Boolean(photo));
}
