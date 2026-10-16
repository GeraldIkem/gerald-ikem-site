import { describe, expect, it } from 'vitest';
import {
  COURT,
  PITCH,
  POOL,
  STEP,
  callFinish,
  callKick,
  callShot,
  clampAim,
  keeperStart,
  kick,
  newRace,
  nextKickSpot,
  nextSpot,
  nudgeAim,
  parseBest,
  pointsFrom,
  powerOf,
  settleKick,
  settleShot,
  shoot,
  stepRace,
  stroke,
  type Vec,
} from '~/lib/pastimes';

/** Press arrow keys on an aim, the way the keyboard does on the page. */
function press(aim: Vec, keys: string[], max: number): Vec {
  return keys.reduce((current, key) => nudgeAim(current, key, max) ?? current, aim);
}

const times = (n: number, key: string) => Array.from({ length: n }, () => key);

describe('aiming', () => {
  it('caps the pull at its longest and keeps the direction', () => {
    const aim = clampAim({ x: -300, y: -400 }, 100);
    expect(Math.hypot(aim.x, aim.y)).toBeCloseTo(100);
    expect(aim.x / aim.y).toBeCloseTo(0.75);
    expect(clampAim({ x: 3, y: 4 }, 100)).toEqual({ x: 3, y: 4 });
  });

  it('moves the tip of the aim with the arrow keys and ignores other keys', () => {
    expect(nudgeAim({ x: 0, y: 0 }, 'ArrowUp', 50)).toEqual({ x: 0, y: -2 });
    expect(nudgeAim({ x: 0, y: 0 }, 'ArrowRight', 50, 6)).toEqual({ x: 6, y: 0 });
    expect(nudgeAim({ x: 0, y: 0 }, 'a', 50)).toBeNull();
    expect(powerOf({ x: 0, y: -25 }, 50)).toBe(0.5);
  });
});

describe('basketball', () => {
  const first = COURT.spots[0];

  it('scores the shot the drawing plays by itself', () => {
    const shot = settleShot(shoot(first, COURT.demo));
    expect(shot.result?.made).toBe(true);
    expect(shot.points).toBe(2);
  });

  it('scores from the keyboard after three presses of the down arrow, as the browser test does', () => {
    const untouched = settleShot(shoot(first, COURT.aim));
    expect(untouched.result?.made).toBe(false);
    const aimed = press(COURT.aim, times(3, 'ArrowDown'), COURT.maxPull);
    expect(settleShot(shoot(first, aimed)).result?.made).toBe(true);
  });

  it('counts three from past the line', () => {
    expect(pointsFrom(COURT.three + 1)).toBe(3);
    expect(pointsFrom(COURT.three - 1)).toBe(2);
    expect(COURT.spots.some((x) => pointsFrom(x) === 3)).toBe(true);
  });

  it('can make it from every spot', () => {
    for (const spot of COURT.spots) {
      let made = false;
      for (let y = -110; y <= 0 && !made; y += 2) {
        for (let x = -110; x <= 0 && !made; x += 2) made = settleShot(shoot(spot, { x, y })).result?.made ?? false;
      }
      expect(made, `spot ${spot}`).toBe(true);
    }
  });

  it('tells an air ball from a miss off the rim or the glass', () => {
    expect(settleShot(shoot(first, { x: -20, y: -20 })).result).toEqual({ made: false, miss: 'air' });
    const misses = new Set<string>();
    for (let y = -110; y <= 0; y += 4) {
      for (let x = -110; x <= 0; x += 4) {
        const result = settleShot(shoot(first, { x, y })).result;
        if (result && !result.made) misses.add(result.miss);
      }
    }
    expect([...misses].sort()).toEqual(['air', 'glass', 'rim']);
  });

  it('moves the ball somewhere new after a make', () => {
    for (const spot of COURT.spots) {
      for (const r of [0, 0.5, 0.999]) expect(nextSpot(spot, () => r)).not.toBe(spot);
    }
  });

  it('says what happened and the score', () => {
    expect(callShot({ made: true, swish: false }, 2, { score: 4, streak: 1 })).toBe('2 points. Score 4.');
    expect(callShot({ made: true, swish: true }, 3, { score: 7, streak: 3 })).toBe('Swish. 3 points. Score 7. 3 in a row.');
    expect(callShot({ made: false, miss: 'rim' }, 2, { score: 7, streak: 0 })).toBe('Off the rim. Score 7.');
  });
});

describe('football', () => {
  const first = PITCH.spots[0];
  const middle = keeperStart(0);

  it('scores the kick the drawing plays by itself', () => {
    expect(settleKick(kick(first, PITCH.demo, middle)).result).toBe('goal');
  });

  it('scores from the keyboard after six presses of the up arrow, as the browser test does', () => {
    expect(settleKick(kick(first, PITCH.aim, middle)).result).toBe('saved');
    const aimed = press(PITCH.aim, times(6, 'ArrowUp'), PITCH.maxPull);
    expect(settleKick(kick(first, aimed, middle)).result).toBe('goal');
  });

  it('sends a hard kick straight up the pitch out of play from every spot', () => {
    for (const spot of PITCH.spots) {
      expect(settleKick(kick(spot, { x: 0, y: -PITCH.maxPull }, middle)).result, JSON.stringify(spot)).toBe('out');
    }
  });

  it('calls a kick out of play, wide, or too soft', () => {
    expect(settleKick(kick(first, { x: 0, y: -90 }, middle)).result).toBe('out');
    expect(settleKick(kick(first, { x: 70, y: -40 }, middle)).result).toBe('wide');
    expect(settleKick(kick(first, { x: 20, y: 0 }, middle)).result).toBe('short');
  });

  it('beats the keeper only away from him', () => {
    // Straight at him from in front of the goal is saved, however hard.
    expect(settleKick(kick({ x: 240, y: middle }, { x: 90, y: 0 }, middle)).result).toBe('saved');
  });

  it('can score from every spot', () => {
    for (const spot of PITCH.spots) {
      let scored = false;
      for (let y = -90; y <= 90 && !scored; y += 2) {
        for (let x = 0; x <= 90 && !scored; x += 2) scored = settleKick(kick(spot, { x, y }, middle)).result === 'goal';
      }
      expect(scored, JSON.stringify(spot)).toBe(true);
    }
  });

  it('sets the keeper up in the middle first, then somewhere in his goal', () => {
    expect(middle).toBe((PITCH.goal.top + PITCH.goal.bottom) / 2);
    for (const r of [0, 1]) {
      const y = keeperStart(3, () => r);
      expect(y).toBeGreaterThan(PITCH.goal.top);
      expect(y).toBeLessThan(PITCH.goal.bottom);
    }
    expect(nextKickSpot(2, () => 0)).not.toBe(2);
    expect(nextKickSpot(2, () => 0)).not.toBe(0);
  });

  it('says what happened and the tally', () => {
    expect(callKick('goal', 1, 1)).toBe('Goal! 1 of 1.');
    expect(callKick('out', 1, 2)).toBe('Out of play. 1 of 2.');
  });
});

describe('swimming', () => {
  function swim(rate: number) {
    const race = newRace();
    let t = 0;
    let next = 0;
    let arm: 'left' | 'right' = 'left';
    while (!race.finished && t < 60) {
      if (t >= next) {
        stroke(race, arm);
        arm = arm === 'left' ? 'right' : 'left';
        next += 1 / rate;
      }
      stepRace(race);
      t += STEP;
    }
    return race;
  }

  it('only counts strokes taken in turn', () => {
    const race = newRace();
    expect(stroke(race, 'left')).toBe(true);
    expect(stroke(race, 'left')).toBe(false);
    expect(stroke(race, 'right')).toBe(true);
    expect(race.strokes).toBe(2);
  });

  it('starts the clock on the first stroke', () => {
    const race = newRace();
    stepRace(race, 1);
    expect(race.time).toBeNull();
    stroke(race, 'right');
    stepRace(race, 0.5);
    expect(race.time).toBeCloseTo(0.5);
  });

  it('takes a few seconds flat out and longer at an easy pace', () => {
    const fast = swim(6);
    const easy = swim(3);
    expect(fast.finished && easy.finished).toBe(true);
    expect(fast.x).toBe(POOL.finish);
    expect(fast.time!).toBeGreaterThan(3.5);
    expect(fast.time!).toBeLessThan(easy.time!);
    expect(easy.time!).toBeLessThan(12);
  });

  it('reads only sensible best times back', () => {
    expect(parseBest('5.62')).toBe(5.62);
    expect(parseBest(null)).toBeNull();
    expect(parseBest('soon')).toBeNull();
    expect(parseBest('-1')).toBeNull();
  });

  it('says the time and whether it is a best', () => {
    expect(callFinish(5.6234, null)).toBe('Finished in 5.62 seconds. New best.');
    expect(callFinish(5.1, 5.62)).toBe('Finished in 5.10 seconds. New best.');
    expect(callFinish(6, 5.62)).toBe('Finished in 6.00 seconds. Best 5.62.');
  });
});
