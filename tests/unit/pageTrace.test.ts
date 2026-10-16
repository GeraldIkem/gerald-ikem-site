import { describe, expect, it } from 'vitest';
import { buildPageTrace, classifyResource, formatMs, formatTick, niceStep, type NavigationLike } from '~/lib/pageTrace';

const coldVisit: NavigationLike = {
  redirectStart: 0,
  redirectEnd: 0,
  domainLookupStart: 2,
  domainLookupEnd: 30,
  connectStart: 30,
  secureConnectionStart: 55,
  connectEnd: 90,
  requestStart: 91,
  responseStart: 140,
  responseEnd: 150,
  domInteractive: 190,
  domContentLoadedEventEnd: 200,
  loadEventEnd: 320,
  transferSize: 14_000,
};

describe('buildPageTrace', () => {
  it('turns a first visit into DNS, connect, TLS, wait and download spans', () => {
    const trace = buildPageTrace(coldVisit);
    const ids = trace.spans.map((span) => span.id);
    expect(ids).toEqual(['page', 'dns', 'connect', 'tls', 'wait', 'download', 'parse']);
    expect(trace.spans.find((span) => span.id === 'tls')).toMatchObject({ start: 55, end: 90 });
    expect(trace.total).toBe(320);
    expect(trace.reusedConnection).toBe(false);
    expect(trace.fromCache).toBe(false);
  });

  it('drops steps that took no time and says the connection was reused', () => {
    const warm = { ...coldVisit, domainLookupStart: 5, domainLookupEnd: 5, connectStart: 5, connectEnd: 5, secureConnectionStart: 0 };
    const trace = buildPageTrace(warm);
    expect(trace.spans.map((span) => span.id)).not.toContain('dns');
    expect(trace.spans.map((span) => span.id)).not.toContain('tls');
    expect(trace.reusedConnection).toBe(true);
  });

  it('notices a page served from the browser cache', () => {
    const cached = { ...coldVisit, transferSize: 0, requestStart: 3, responseStart: 4, responseEnd: 5 };
    expect(buildPageTrace(cached).fromCache).toBe(true);
  });

  it('groups resources by kind and counts them', () => {
    const trace = buildPageTrace(coldVisit, [
      { name: 'https://x.dev/_astro/a.woff2', initiatorType: 'css', startTime: 160, responseEnd: 210 },
      { name: 'https://x.dev/_astro/b.woff2?v=2', initiatorType: 'link', startTime: 155, responseEnd: 240 },
      { name: 'https://x.dev/_astro/page.css', initiatorType: 'link', startTime: 150, responseEnd: 170 },
      { name: 'https://x.dev/favicon.ico', initiatorType: 'other', startTime: 400, responseEnd: 410 },
    ]);
    const fonts = trace.spans.find((span) => span.id === 'fonts');
    expect(fonts).toMatchObject({ label: 'Fonts (2)', start: 155, end: 240 });
    expect(trace.spans.find((span) => span.id === 'styles')?.label).toBe('Stylesheet');
    expect(trace.spans.map((span) => span.id)).not.toContain('images');
  });

  it('adds first contentful paint as a mark', () => {
    const trace = buildPageTrace(coldVisit, [], [{ name: 'first-contentful-paint', startTime: 210.44 }]);
    expect(trace.marks).toEqual([expect.objectContaining({ id: 'fcp', at: 210.4 })]);
  });

  it('never ends before its last span', () => {
    const early = { ...coldVisit, loadEventEnd: 0, domContentLoadedEventEnd: 120 };
    const trace = buildPageTrace(early);
    expect(trace.total).toBeGreaterThanOrEqual(190);
  });
});

describe('classifyResource', () => {
  it('reads the file extension before the initiator', () => {
    expect(classifyResource({ name: '/a.js', initiatorType: 'script', startTime: 0, responseEnd: 1 })).toBe('scripts');
    expect(classifyResource({ name: '/a.webp', initiatorType: 'img', startTime: 0, responseEnd: 1 })).toBe('images');
    expect(classifyResource({ name: '/api/thing', initiatorType: 'fetch', startTime: 0, responseEnd: 1 })).toBeNull();
  });
});

describe('axis helpers', () => {
  it('picks round steps', () => {
    expect(niceStep(93)).toBe(20);
    expect(niceStep(1170)).toBe(500);
    expect(niceStep(1170, 2)).toBe(500);
    expect(niceStep(0)).toBe(1);
  });

  it('formats durations and ticks', () => {
    expect(formatMs(4.25)).toBe('4.3 ms');
    expect(formatMs(212.4)).toBe('212 ms');
    expect(formatMs(1500)).toBe('1.50 s');
    expect(formatTick(0)).toBe('0');
    expect(formatTick(1500)).toBe('1.5 s');
  });
});
