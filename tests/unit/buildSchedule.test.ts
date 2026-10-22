import { Group, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { SPEEDS, buildSchedule, dropOffset, pieceProgress, speedRate, stepTimes } from '~/lib/buildSchedule';

describe('buildSchedule', () => {
  it('orders pieces by building step and staggers pieces within a step', () => {
    const { items, steps } = buildSchedule([0, 0, 1, 3], { targetMs: 300, dropMs: 100 });
    expect(steps).toBe(3);
    expect(items.map((item) => item.step)).toEqual([0, 0, 1, 2]);
    expect(items[1]!.startMs).toBeGreaterThan(items[0]!.startMs);
    expect(items[2]!.startMs).toBeGreaterThan(items[1]!.startMs);
  });

  it('keeps a huge build to a watchable length', () => {
    // Roughly the 1989 Batmobile: 3,306 pieces over 651 steps.
    const steps = Array.from({ length: 3306 }, (_, i) => Math.floor(i / 5.08));
    const { durationMs } = buildSchedule(steps);
    expect(durationMs).toBeLessThan(17_000);
    expect(durationMs).toBeGreaterThan(10_000);
  });

  it('paces a set with few, crowded steps piece by piece', () => {
    // Like the Mustang: about 1,470 pieces in 23 steps.
    const steps = Array.from({ length: 1470 }, (_, i) => Math.floor(i / 64));
    const { items } = buildSchedule(steps);
    const gaps = items.slice(1, 60).map((item, i) => item.startMs - items[i]!.startMs);
    expect(Math.max(...gaps)).toBeLessThan(20);
    expect(Math.min(...gaps)).toBeGreaterThan(0);
  });

  it('keeps the file order inside a step even when steps are listed out of order', () => {
    const { items } = buildSchedule([2, 0, 0, 1]);
    expect(items.map((item) => item.step)).toEqual([2, 0, 0, 1]);
    expect(items[1]!.startMs).toBeLessThan(items[2]!.startMs);
    expect(items[3]!.startMs).toBeLessThan(items[0]!.startMs);
  });
});

describe('stepTimes', () => {
  it('finds when each step starts and when its last piece lands', () => {
    const items = [
      { step: 0, startMs: 0 },
      { step: 0, startMs: 50 },
      { step: 1, startMs: 120 },
      { step: 1, startMs: 170 },
    ];
    expect(stepTimes(items, 2, 100)).toEqual({ starts: [0, 120], ends: [150, 270] });
  });
});

describe('pieceProgress', () => {
  const piece = { step: 3, startMs: 1000 };

  it('drops a piece in over its drop time', () => {
    expect(pieceProgress(piece, 900, 400)).toBe(0);
    expect(pieceProgress(piece, 1200, 400)).toBe(0.5);
    expect(pieceProgress(piece, 2000, 400)).toBe(1);
  });

  it('stands still at the end of a step whatever the time', () => {
    // Stepped to the end of step 3: in place, even though by the clock it would still be falling.
    expect(pieceProgress(piece, 1100, 400, 3, 3)).toBe(1);
    // Stepped back to the end of step 2: gone, even though by the clock it would be in place.
    expect(pieceProgress(piece, 5000, 400, 2, 2)).toBe(0);
    // Stepping forward into step 3 drops it in by the clock.
    expect(pieceProgress(piece, 1200, 400, 2, 3)).toBe(0.5);
  });
});

describe('speeds', () => {
  it('runs 1× at half the pace the builds first had, and 2× at that pace', () => {
    expect(SPEEDS[0]).toBe(1);
    expect(speedRate(1)).toBe(0.5);
    expect(speedRate(2)).toBe(1);
    expect(speedRate(4)).toBe(2);
  });
});

describe('dropOffset', () => {
  it('lifts straight up in world space even inside a flipped parent', () => {
    const root = new Group();
    root.rotation.x = Math.PI; // LDraw models are upside down in three.js terms.
    const piece = new Group();
    root.add(piece);
    root.updateMatrixWorld(true);

    const offset = dropOffset(piece, 10);
    piece.position.add(offset);
    root.updateMatrixWorld(true);
    const world = piece.getWorldPosition(new Vector3());
    expect(world.x).toBeCloseTo(0);
    expect(world.y).toBeCloseTo(10);
    expect(world.z).toBeCloseTo(0);
  });
});
