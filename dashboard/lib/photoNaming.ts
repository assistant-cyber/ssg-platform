const WORD_TO_NUM: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const ONES = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TEENS_AND_BELOW = [
  'nineteen',
  'eighteen',
  'seventeen',
  'sixteen',
  'fifteen',
  'fourteen',
  'thirteen',
  'twelve',
  'eleven',
  'ten',
  'nine',
  'eight',
  'seven',
  'six',
  'five',
  'four',
  'three',
  'two',
  'one',
  'zero',
];
const TENS = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export interface ExistingPhotoSeed {
  filename?: string | null;
  notes?: string | null;
  panel_letter?: string | null;
  sort_order?: number;
  window_number?: string | null;
}

export interface UploadDraftInput {
  id: string;
  notes: string;
  originalName: string;
}

export interface UploadDraftPlan {
  id: string;
  didExpandShorthand: boolean;
  inferredWindow: string | null;
  normalizedNotes: string;
  predictedFilename: string;
  predictedLabel: string | null;
}

interface DraftContext {
  currentLabel: string | null;
  currentWindow: string | null;
  nextPanelIndex: number;
  inheritCounter: number;
}

interface ParsedLeadingLabel {
  explicitSequenceWindow: boolean;
  label: string;
  panelLetter: string | null;
  remainder: string;
  windowNumber: string | null;
}

interface NormalizedDraftResult {
  didExpandShorthand: boolean;
  inferredWindow: string | null;
  normalizedNotes: string;
  predictedFilenameSuffix?: string;
  predictedLabel: string | null;
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

function getExtension(filename: string): string {
  const match = filename.match(/(\.[^.]+)$/);
  return match ? match[1].toLowerCase() : '.jpg';
}

function parseWordNumber(text: string): { matchLength: number; numberString: string; trailingLetter: string } | null {
  const value = text.toLowerCase().trimStart();
  if (!value) return null;

  const trailingLetter = (remainder: string): { consumed: number; value: string } | null => {
    if (!remainder) return { consumed: 0, value: '' };
    const singleLetter = remainder.match(/^([a-z])(?![a-z])/);
    if (singleLetter) return { consumed: singleLetter[0].length, value: singleLetter[1].toUpperCase() };
    if (!/[a-z]/.test(remainder[0])) return { consumed: 0, value: '' };
    return null;
  };

  for (const ten of TENS) {
    if (!value.startsWith(ten)) continue;
    const separator = value.slice(ten.length).match(/^[\s-]+/)?.[0] ?? '';
    const rest = value.slice(ten.length + separator.length);
    let matchedOnes = false;

    for (const one of [...ONES].sort((a, b) => b.length - a.length)) {
      if (!rest.startsWith(one)) continue;
      matchedOnes = true;
      const remainder = rest.slice(one.length);
      const letter = trailingLetter(remainder);
      if (letter !== null) {
        return {
          matchLength: ten.length + separator.length + one.length + letter.consumed,
          numberString: String(WORD_TO_NUM[ten] + WORD_TO_NUM[one]),
          trailingLetter: letter.value,
        };
      }
      break;
    }

    if (matchedOnes) continue;
    const letter = trailingLetter(rest);
    if (letter !== null) {
      return {
        matchLength: ten.length + separator.length + letter.consumed,
        numberString: String(WORD_TO_NUM[ten]),
        trailingLetter: letter.value,
      };
    }
  }

  for (const word of TEENS_AND_BELOW) {
    if (!value.startsWith(word)) continue;
    const remainder = value.slice(word.length);
    const letter = trailingLetter(remainder);
    if (letter !== null) {
      return {
        matchLength: word.length + letter.consumed,
        numberString: String(WORD_TO_NUM[word]),
        trailingLetter: letter.value,
      };
    }
  }

  return null;
}

export function extractLabelFromDescription(notes: string): string | null {
  const trimmed = notes.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed) return null;

  const direction = lower.match(/^(north|south|east|west)\b/);
  if (direction) return direction[1][0].toUpperCase() + direction[1].slice(1);
  if (lower.startsWith('site notes')) return 'site_notes';

  const numeric = trimmed.match(/^(\d+)([a-zA-Z]?)/);
  if (numeric) return `${numeric[1]}${numeric[2].toUpperCase()}`;

  const windowDirective = parseWindowDirective(trimmed);
  if (windowDirective) return windowDirective.label;

  const wordNumber = parseWordNumber(trimmed);
  if (wordNumber) return `${wordNumber.numberString}${wordNumber.trailingLetter}`;

  return null;
}

export function extractLabelParts(notes: string): { panelLetter: string | null; windowNumber: string | null } {
  const trimmed = notes.trim();
  if (!trimmed) return { panelLetter: null, windowNumber: null };

  const numeric = trimmed.match(/^(\d+)([a-zA-Z]?)/);
  if (numeric) {
    return {
      windowNumber: numeric[1],
      panelLetter: numeric[2] ? numeric[2].toUpperCase() : null,
    };
  }

  const windowDirective = parseWindowDirective(trimmed);
  if (windowDirective) {
    return {
      windowNumber: windowDirective.windowNumber,
      panelLetter: windowDirective.panelLetter,
    };
  }

  const wordNumber = parseWordNumber(trimmed);
  if (wordNumber) {
    return {
      windowNumber: wordNumber.numberString,
      panelLetter: wordNumber.trailingLetter || null,
    };
  }

  return { panelLetter: null, windowNumber: null };
}

function cleanupRemainder(text: string) {
  return text.trimStart().replace(/^[-:.,]+\s*/, '').trim();
}

function panelLettersToIndex(panelLetters: string | null) {
  if (!panelLetters) return -1;
  if (!/^[A-Z]+$/.test(panelLetters)) return -1;

  let value = 0;
  for (const letter of panelLetters) {
    value = (value * 26) + (letter.charCodeAt(0) - 64);
  }
  return value - 1;
}

function panelIndexToLetters(index: number) {
  let current = index;
  let result = '';

  do {
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);

  return result;
}

function parseWindowDirective(notes: string): ParsedLeadingLabel | null {
  const trimmed = notes.trim();
  const prefix = trimmed.match(/^(window|photo)\b/i);
  if (!prefix) return null;

  const remainderAfterPrefix = trimmed.slice(prefix[0].length).trimStart();
  if (!remainderAfterPrefix) return null;

  const numeric = remainderAfterPrefix.match(/^(\d+)([a-zA-Z]?)/);
  if (numeric) {
    const windowNumber = numeric[1];
    const panelLetter = numeric[2] ? numeric[2].toUpperCase() : 'A';
    return {
      explicitSequenceWindow: true,
      label: `${windowNumber}${panelLetter}`,
      panelLetter,
      remainder: cleanupRemainder(remainderAfterPrefix.slice(numeric[0].length)),
      windowNumber,
    };
  }

  const wordNumber = parseWordNumber(remainderAfterPrefix);
  if (!wordNumber) return null;
  const windowNumber = wordNumber.numberString;
  const panelLetter = wordNumber.trailingLetter || 'A';

  return {
    explicitSequenceWindow: true,
    label: `${windowNumber}${panelLetter}`,
    panelLetter,
    remainder: cleanupRemainder(remainderAfterPrefix.slice(wordNumber.matchLength)),
    windowNumber,
  };
}

function parseExplicitLabel(notes: string): ParsedLeadingLabel | null {
  const trimmed = notes.trim();
  if (!trimmed) return null;

  const windowDirective = parseWindowDirective(trimmed);
  if (windowDirective) return windowDirective;

  const numeric = trimmed.match(/^(\d+)([a-zA-Z]?)/);
  if (numeric) {
    return {
      explicitSequenceWindow: Boolean(numeric[2]),
      label: `${numeric[1]}${numeric[2].toUpperCase()}`,
      panelLetter: numeric[2] ? numeric[2].toUpperCase() : null,
      remainder: cleanupRemainder(trimmed.slice(numeric[0].length)),
      windowNumber: numeric[1],
    };
  }

  const wordNumber = parseWordNumber(trimmed);
  if (wordNumber) {
    return {
      explicitSequenceWindow: Boolean(wordNumber.trailingLetter),
      label: `${wordNumber.numberString}${wordNumber.trailingLetter}`,
      panelLetter: wordNumber.trailingLetter || null,
      remainder: cleanupRemainder(trimmed.slice(wordNumber.matchLength)),
      windowNumber: wordNumber.numberString,
    };
  }

  return null;
}

function normalizeDraftNotes(notes: string, context: DraftContext): NormalizedDraftResult {
  const trimmed = notes.trim();
  const explicit = parseExplicitLabel(trimmed);
  if (explicit) {
    const nextPanelIndex = explicit.panelLetter ? panelLettersToIndex(explicit.panelLetter) + 1 : 0;
    context.currentLabel = explicit.label;
    context.currentWindow = explicit.windowNumber ?? context.currentWindow;
    context.nextPanelIndex = Math.max(nextPanelIndex, 0);
    context.inheritCounter = 0;

    return {
      didExpandShorthand: explicit.explicitSequenceWindow,
      inferredWindow: explicit.windowNumber ?? context.currentWindow,
      normalizedNotes: explicit.remainder ? `${explicit.label} ${explicit.remainder}` : explicit.label,
      predictedLabel: explicit.label,
    };
  }

  const panelOnly = trimmed.match(/^([a-zA-Z])(?=(\s|$))(.*)$/);
  if (panelOnly && context.currentWindow) {
    const nextLabel = `${context.currentWindow}${panelOnly[1].toUpperCase()}`;
    context.currentLabel = nextLabel;
    context.nextPanelIndex = panelLettersToIndex(panelOnly[1].toUpperCase()) + 1;
    context.inheritCounter = 0;

    return {
      didExpandShorthand: true,
      inferredWindow: context.currentWindow,
      normalizedNotes: `${nextLabel}${panelOnly[3]}`,
      predictedLabel: nextLabel,
    };
  }

  if (context.currentWindow) {
    const nextPanelLetter = panelIndexToLetters(context.nextPanelIndex);
    const nextLabel = `${context.currentWindow}${nextPanelLetter}`;
    context.currentLabel = nextLabel;
    context.nextPanelIndex += 1;
    context.inheritCounter = 0;

    return {
      didExpandShorthand: true,
      inferredWindow: context.currentWindow,
      normalizedNotes: trimmed ? `${nextLabel} ${trimmed}` : nextLabel,
      predictedLabel: nextLabel,
    };
  }

  if (trimmed && context.currentLabel) {
    context.inheritCounter += 1;
    return {
      didExpandShorthand: false,
      inferredWindow: context.currentWindow,
      normalizedNotes: trimmed,
      predictedLabel: context.currentLabel,
      predictedFilenameSuffix: `(${context.inheritCounter})`,
    };
  }

  return {
    didExpandShorthand: false,
    inferredWindow: context.currentWindow,
    normalizedNotes: trimmed,
    predictedLabel: null,
  };
}

function seedContext(existing: ExistingPhotoSeed[]): DraftContext {
  const sorted = [...existing].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  let currentLabel: string | null = null;
  let currentWindow: string | null = null;
  let nextPanelIndex = 0;

  for (const photo of sorted) {
    const noteLabel = extractLabelFromDescription(photo.notes ?? '');
    const filenameLabel = photo.filename ? stripExtension(photo.filename) : null;
    const explicitWindow = photo.window_number ?? null;
    const explicitPanel = photo.panel_letter ?? null;
    const label = explicitWindow
      ? `${explicitWindow}${explicitPanel ?? ''}`
      : noteLabel ?? filenameLabel;

    if (label) {
      currentLabel = label;
    }

    if (explicitWindow) {
      currentWindow = explicitWindow;
      nextPanelIndex = explicitPanel ? panelLettersToIndex(explicitPanel.toUpperCase()) + 1 : 0;
    } else if (noteLabel) {
      const parts = extractLabelParts(photo.notes ?? '');
      currentWindow = parts.windowNumber ?? currentWindow;
      if (parts.panelLetter) {
        nextPanelIndex = panelLettersToIndex(parts.panelLetter) + 1;
      }
    }
  }

  return {
    currentLabel,
    currentWindow,
    nextPanelIndex,
    inheritCounter: 0,
  };
}

export function buildUploadDraftPlans(
  drafts: UploadDraftInput[],
  existing: ExistingPhotoSeed[] = [],
): UploadDraftPlan[] {
  const context = seedContext(existing);

  return drafts.map((draft) => {
    const ext = getExtension(draft.originalName);
    const normalized = normalizeDraftNotes(draft.notes, context);

    let predictedFilename = draft.originalName;
    if (normalized.predictedLabel) {
      predictedFilename = `${normalized.predictedLabel}${normalized.predictedFilenameSuffix ?? ''}${ext}`;
    }

    return {
      id: draft.id,
      didExpandShorthand: normalized.didExpandShorthand,
      inferredWindow: normalized.inferredWindow ?? null,
      normalizedNotes: normalized.normalizedNotes,
      predictedFilename,
      predictedLabel: normalized.predictedLabel,
    };
  });
}
