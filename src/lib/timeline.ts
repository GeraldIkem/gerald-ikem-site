/** Dates on the site are year-month strings, e.g. "2025-11". */
export type YearMonth = string;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthIndex(ym: YearMonth): number {
  const match = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!match) throw new Error(`Expected YYYY-MM, got "${ym}"`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`Month out of range in "${ym}"`);
  return year * 12 + (month - 1);
}

export function toYearMonth(date: Date): YearMonth {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonth(ym: YearMonth): string {
  const index = monthIndex(ym);
  return `${MONTHS[index % 12]} ${Math.floor(index / 12)}`;
}

export interface Span {
  start: YearMonth;
  /** Omit for something still going on. */
  end?: YearMonth;
  /** The end date is a plan, not a fact yet. */
  expected?: boolean;
}

export interface Axis {
  start: YearMonth;
  end: YearMonth;
}

export interface SpanGeometry {
  /** Percent of the axis width. */
  left: number;
  width: number;
  /** Part of the span that lies after `now`, as a percent of the span's own width. */
  futureShare: number;
  ongoing: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function spanGeometry(span: Span, axis: Axis, now: YearMonth): SpanGeometry {
  const axisStart = monthIndex(axis.start);
  const axisLength = monthIndex(axis.end) - axisStart;
  if (axisLength <= 0) throw new Error('Axis must end after it starts');

  const current = monthIndex(now);
  const start = monthIndex(span.start);
  // A span covers its end month, so it reaches the start of the following one.
  const end = (span.end ? monthIndex(span.end) : current) + 1;

  const left = clamp(((start - axisStart) / axisLength) * 100, 0, 100);
  const right = clamp(((end - axisStart) / axisLength) * 100, 0, 100);
  const width = Math.max(right - left, 0);
  const futureMonths = Math.max(end - Math.max(current + 1, start), 0);
  const futureShare = end > start ? clamp((futureMonths / (end - start)) * 100, 0, 100) : 0;

  return { left, width, futureShare, ongoing: !span.end };
}

export function formatRange(span: Span): string {
  const from = formatMonth(span.start);
  if (!span.end) return `${from} to now`;
  const to = formatMonth(span.end);
  return span.expected ? `${from} to ${to} (expected)` : `${from} to ${to}`;
}

/** Year ticks for an axis, as [label, percent] pairs. */
export function yearTicks(axis: Axis): Array<{ year: number; left: number }> {
  const start = monthIndex(axis.start);
  const end = monthIndex(axis.end);
  const ticks: Array<{ year: number; left: number }> = [];
  for (let year = Math.ceil(start / 12); year * 12 <= end; year++) {
    ticks.push({ year, left: ((year * 12 - start) / (end - start)) * 100 });
  }
  return ticks;
}
