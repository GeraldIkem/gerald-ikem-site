import { describe, expect, it } from 'vitest';
import { layered, techOf } from '~/data/tech';

describe('techOf', () => {
  it('gives known tools their logo, colour and layer', () => {
    const spring = techOf('Spring Boot 4.1');
    expect(spring.layer).toBe('Services');
    expect(spring.color).toBe('#6DB33F');
    expect(spring.path).toBeTruthy();
  });

  it('does not mistake JavaScript for Java', () => {
    expect(techOf('JavaScript (ES modules)').layer).toBe('Interface');
    expect(techOf('Java 21').layer).toBe('Services');
  });

  it('falls back to initials for tools without a logo', () => {
    const tc = techOf('Testcontainers');
    expect(tc.path).toBeUndefined();
    expect(tc.initials).toBe('T');
    expect(tc.layer).toBe('Testing');
    expect(techOf('AWS S3').layer).toBe('Data');
  });
});

describe('layered', () => {
  it('orders layers from what you see down to what runs it, and skips empty ones', () => {
    const groups = layered(['Docker', 'React', 'PostgreSQL']);
    expect(groups.map((g) => g.label)).toEqual(['Interface', 'Data', 'Delivery']);
  });
});

describe('usage', async () => {
  const { usageOf, maxUsage } = await import('~/data/usage');

  it('counts each tool once per place, across versions', () => {
    const java = usageOf('Java 21');
    expect(java.where).toEqual(expect.arrayContaining(['Payaza', 'Linkify', 'Threadfern']));
    expect(usageOf('Java 17').count).toBe(java.count);
    expect(usageOf('JDBC').where).not.toContain('Payaza');
  });

  it('reports nothing for tools no project lists', () => {
    expect(usageOf('Kotlin').count).toBe(0);
    expect(maxUsage).toBeGreaterThanOrEqual(4);
  });
});
