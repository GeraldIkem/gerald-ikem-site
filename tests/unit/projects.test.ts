import { describe, expect, it } from 'vitest';
import { projectBySlug, projects } from '~/data/projects';

describe('projects', () => {
  it('has unique slugs and a page’s worth of content each', () => {
    expect(new Set(projects.map((p) => p.slug)).size).toBe(projects.length);
    for (const project of projects) {
      expect(project.facts).toHaveLength(4);
      expect(project.sections.length).toBeGreaterThanOrEqual(3);
      expect(project.limits.length).toBeGreaterThan(0);
      expect(project.url).toMatch(/^https:\/\//);
    }
  });

  it('finds a project by its slug', () => {
    expect(projectBySlug('linkify')?.name).toBe('Linkify');
    expect(projectBySlug('this-is-it')).toBeUndefined();
  });
});
