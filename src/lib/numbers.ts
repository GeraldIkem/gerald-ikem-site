/** Helpers for animating and charting numbers that appear inside text. */

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

export interface NumberPart {
  value: number;
  decimals: number;
  grouped: boolean;
}

/** Split text into literal pieces and the numbers between them. */
export function splitNumbers(text: string): Array<string | NumberPart> {
  // Scientific notation and the like read badly mid-count, so leave them alone.
  if (/\d[eE][-+]?\d/.test(text)) return [text];
  const parts: Array<string | NumberPart> = [];
  let last = 0;
  for (const match of text.matchAll(NUMBER)) {
    const raw = match[0];
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    const decimals = raw.includes('.') ? raw.split('.')[1]!.length : 0;
    parts.push({ value: Number(raw.replace(/,/g, '')), decimals, grouped: raw.includes(',') });
    last = start + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function formatNumber(value: number, part: NumberPart): string {
  const fixed = value.toFixed(part.decimals);
  if (!part.grouped) return fixed;
  const [whole, fraction] = fixed.split('.');
  const withCommas = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${withCommas}.${fraction}` : withCommas;
}

/** Render `text` with every number at `progress` (0 to 1) of its final value. */
export function countFrame(parts: Array<string | NumberPart>, progress: number): string {
  return parts
    .map((part) => (typeof part === 'string' ? part : formatNumber(part.value * progress, part)))
    .join('');
}

/** The first number in a table cell, for drawing it as a bar. */
export function cellValue(cell: string): number | null {
  const match = /-?\d[\d,]*(?:\.\d+)?/.exec(cell);
  return match ? Number(match[0].replace(/,/g, '')) : null;
}
