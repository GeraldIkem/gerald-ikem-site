import { Vector3, type Object3D } from 'three';

export interface Scheduled {
  /** Index of the building step this piece belongs to, counted from 0. */
  step: number;
  /** When its drop starts, in ms from the start of the build. */
  startMs: number;
}

export interface Schedule {
  items: Scheduled[];
  steps: number;
  durationMs: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Times every piece of a build. Pieces land one after another in instruction
 * order, with a short pause where one step ends and the next begins, and the
 * whole build fits in roughly `targetMs` however many pieces the set has.
 */
export function buildSchedule(buildingSteps: number[], { dropMs = 520, targetMs = 12_000 } = {}): Schedule {
  const distinct = [...new Set(buildingSteps)].sort((a, b) => a - b);
  const stepIndex = new Map(distinct.map((value, i) => [value, i]));
  const steps = distinct.length;
  const pieces = buildingSteps.length;

  const perPiece = clamp(targetMs / Math.max(pieces, 1), 4, 140);
  const stepPause = clamp((targetMs * 0.15) / Math.max(steps, 1), 0, 200);

  // Stable sort by step keeps the file's own order inside each step.
  const order = buildingSteps
    .map((raw, original) => ({ original, step: stepIndex.get(raw) ?? 0 }))
    .sort((a, b) => a.step - b.step || a.original - b.original);

  const items: Scheduled[] = new Array(pieces);
  order.forEach(({ original, step }, position) => {
    items[original] = { step, startMs: position * perPiece + step * stepPause };
  });

  const last = items.reduce((max, item) => Math.max(max, item.startMs), 0);
  return { items, steps, durationMs: last + dropMs };
}

/**
 * The offset, in the object's own parent space, that lifts it `height` units
 * straight up in world space. Sub-models can be rotated or mirrored, so "up"
 * has to be worked out per piece.
 */
export function dropOffset(object: Object3D, height: number): Vector3 {
  const parent = object.parent;
  const world = object.getWorldPosition(new Vector3());
  if (!parent) return new Vector3(0, height, 0);
  const from = parent.worldToLocal(world.clone());
  const to = parent.worldToLocal(world.clone().add(new Vector3(0, height, 0)));
  return to.sub(from);
}
