import { projects } from '~/data/projects';
import { techOf } from '~/data/tech';

/**
 * Where each tool has been used: every project's stack, plus my day job.
 * Sizes on the stack charts come from these counts.
 */
const places: Array<{ place: string; stack: string[] }> = [
  {
    place: 'Payaza',
    stack: ['Java 17', 'Spring Boot', 'Spring Security', 'JPA and Hibernate', 'PostgreSQL', 'Redis', 'Docker', 'Kubernetes', 'AWS', 'GitHub Actions', 'JUnit 5'],
  },
  ...projects.map((project) => ({ place: project.name, stack: project.stack })),
];

const usage = new Map<string, Set<string>>();
for (const { place, stack } of places) {
  for (const name of stack) {
    const key = techOf(name).key;
    if (!usage.has(key)) usage.set(key, new Set());
    usage.get(key)!.add(place);
  }
}

export interface Usage {
  count: number;
  where: string[];
}

export function usageOf(name: string): Usage {
  const where = [...(usage.get(techOf(name).key) ?? [])];
  return { count: where.length, where };
}

export const maxUsage = Math.max(...[...usage.values()].map((set) => set.size));
