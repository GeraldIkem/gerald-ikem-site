/**
 * Turns the browser's own timing entries for this page into trace spans.
 * Kept free of DOM access so it can be tested with plain objects.
 */

export type SpanKind = 'setup' | 'server' | 'transfer' | 'asset' | 'render';

export interface TraceSpan {
  id: string;
  label: string;
  /** One plain sentence on what the browser was doing. */
  about: string;
  kind: SpanKind;
  start: number;
  end: number;
  depth: number;
}

export interface TraceMark {
  id: string;
  label: string;
  about: string;
  at: number;
}

export interface PageTrace {
  spans: TraceSpan[];
  marks: TraceMark[];
  /** Milliseconds from navigation start to the last thing we measured. */
  total: number;
  /** The HTML came from the browser cache, so there was no network work to show. */
  fromCache: boolean;
  /** An existing connection was reused, so DNS, connect and TLS took no time. */
  reusedConnection: boolean;
}

/** The subset of PerformanceNavigationTiming this needs. */
export interface NavigationLike {
  redirectStart: number;
  redirectEnd: number;
  domainLookupStart: number;
  domainLookupEnd: number;
  connectStart: number;
  connectEnd: number;
  secureConnectionStart: number;
  requestStart: number;
  responseStart: number;
  responseEnd: number;
  domInteractive: number;
  domContentLoadedEventEnd: number;
  loadEventEnd: number;
  transferSize: number;
}

export interface ResourceLike {
  name: string;
  initiatorType: string;
  startTime: number;
  responseEnd: number;
}

export interface PaintLike {
  name: string;
  startTime: number;
}

/** Shorter than this and a span is noise, not information. */
const MIN_SPAN_MS = 0.5;

type AssetGroup = 'styles' | 'fonts' | 'scripts' | 'images';

const ASSET_COPY: Record<AssetGroup, { one: string; many: string; about: string }> = {
  styles: { one: 'Stylesheet', many: 'Stylesheets', about: 'Fetching the CSS that lays out the page.' },
  fonts: { one: 'Font', many: 'Fonts', about: 'Fetching the typefaces. They are served from this site, not a font CDN.' },
  scripts: { one: 'Script', many: 'Scripts', about: 'Fetching the small scripts behind the interactive parts.' },
  images: { one: 'Image', many: 'Images', about: 'Fetching images that appear near the top of the page.' },
};

export function classifyResource(resource: ResourceLike): AssetGroup | null {
  const path = resource.name.split(/[?#]/)[0]?.toLowerCase() ?? '';
  if (/\.(woff2?|ttf|otf)$/.test(path)) return 'fonts';
  if (/\.css$/.test(path)) return 'styles';
  if (/\.(m?js)$/.test(path) || resource.initiatorType === 'script') return 'scripts';
  if (/\.(png|jpe?g|webp|avif|gif|svg)$/.test(path) || resource.initiatorType === 'img') return 'images';
  return null;
}

const round = (value: number) => Math.round(value * 10) / 10;

export function buildPageTrace(
  nav: NavigationLike,
  resources: ResourceLike[] = [],
  paints: PaintLike[] = [],
): PageTrace {
  const spans: TraceSpan[] = [];
  const add = (span: Omit<TraceSpan, 'depth'>, depth = 1) => {
    if (span.end - span.start >= MIN_SPAN_MS) {
      spans.push({ ...span, start: round(span.start), end: round(span.end), depth });
    }
  };

  if (nav.redirectEnd > 0) {
    add({
      id: 'redirect',
      label: 'Redirect',
      about: 'Following a redirect to this address.',
      kind: 'setup',
      start: nav.redirectStart,
      end: nav.redirectEnd,
    });
  }

  add({
    id: 'dns',
    label: 'Finding the server',
    about: 'A DNS lookup: turning the domain name into an IP address.',
    kind: 'setup',
    start: nav.domainLookupStart,
    end: nav.domainLookupEnd,
  });

  const tlsStart = nav.secureConnectionStart > 0 ? nav.secureConnectionStart : nav.connectEnd;
  add({
    id: 'connect',
    label: 'Connecting',
    about: 'Opening a TCP connection to the server.',
    kind: 'setup',
    start: nav.connectStart,
    end: tlsStart,
  });
  add({
    id: 'tls',
    label: 'Securing the connection',
    about: 'The TLS handshake that makes the connection HTTPS.',
    kind: 'setup',
    start: tlsStart,
    end: nav.connectEnd,
  });
  add({
    id: 'wait',
    label: 'Waiting for a reply',
    about: 'From sending the request to the first byte coming back, often called time to first byte.',
    kind: 'server',
    start: nav.requestStart,
    end: nav.responseStart,
  });
  add({
    id: 'download',
    label: 'Downloading the HTML',
    about: 'Receiving the page itself.',
    kind: 'transfer',
    start: nav.responseStart,
    end: nav.responseEnd,
  });

  const groups = new Map<AssetGroup, { start: number; end: number; count: number }>();
  for (const resource of resources) {
    const group = classifyResource(resource);
    if (!group || resource.responseEnd <= 0) continue;
    const current = groups.get(group);
    groups.set(group, {
      start: Math.min(current?.start ?? Infinity, resource.startTime),
      end: Math.max(current?.end ?? 0, resource.responseEnd),
      count: (current?.count ?? 0) + 1,
    });
  }
  const groupOrder: AssetGroup[] = ['styles', 'fonts', 'scripts', 'images'];
  for (const group of groupOrder) {
    const timing = groups.get(group);
    if (!timing) continue;
    const copy = ASSET_COPY[group];
    add({
      id: group,
      label: timing.count === 1 ? copy.one : `${copy.many} (${timing.count})`,
      about: copy.about,
      kind: 'asset',
      start: timing.start,
      end: timing.end,
    });
  }

  if (nav.domInteractive > nav.responseEnd) {
    add({
      id: 'parse',
      label: 'Building the page',
      about: 'Parsing the HTML into the document you are looking at.',
      kind: 'render',
      start: nav.responseEnd,
      end: nav.domInteractive,
    });
  }

  const marks: TraceMark[] = [];
  const fcp = paints.find((paint) => paint.name === 'first-contentful-paint');
  if (fcp) {
    marks.push({
      id: 'fcp',
      label: 'First text on screen',
      about: 'First contentful paint: the moment the browser first drew text.',
      at: round(fcp.startTime),
    });
  }

  const ready = nav.loadEventEnd > 0 ? nav.loadEventEnd : nav.domContentLoadedEventEnd;
  const lastSpanEnd = spans.reduce((max, span) => Math.max(max, span.end), 0);
  const lastMark = marks.reduce((max, mark) => Math.max(max, mark.at), 0);
  const total = round(Math.max(ready, lastSpanEnd, lastMark));

  spans.unshift({
    id: 'page',
    label: 'This page',
    about: 'Everything from your click to the page being ready.',
    kind: 'transfer',
    start: 0,
    end: total,
    depth: 0,
  });

  const reusedConnection = nav.connectEnd - nav.domainLookupStart < MIN_SPAN_MS;
  const fromCache = nav.transferSize === 0 && nav.responseEnd - nav.requestStart < 5;

  return { spans, marks, total, fromCache, reusedConnection };
}

/** Round axis steps (1, 2, 5, 10, 20, 50 and so on) giving about `lines` gridlines. */
export function niceStep(total: number, lines = 3): number {
  if (total <= 0) return 1;
  const rough = total / lines;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const factor = normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10;
  return factor * magnitude;
}

export function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms >= 100) return `${Math.round(ms)} ms`;
  return `${ms.toFixed(1)} ms`;
}

/** Axis labels: whole numbers only, so they stay short. */
export function formatTick(ms: number): string {
  if (ms === 0) return '0';
  if (ms >= 1000) return `${Number((ms / 1000).toFixed(2))} s`;
  return `${Math.round(ms)} ms`;
}
