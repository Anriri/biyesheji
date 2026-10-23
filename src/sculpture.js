export const WIDTH = 960;
export const HEIGHT = 700;
const copy = (v) => structuredClone(v);
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const INITIAL = {
  ears: [{ x: 393, y: 118 }, { x: 566, y: 108 }],
  body: [
    { x: 480, y: 364 }, { x: 553, y: 399 },
    { x: 585, y: 480 }, { x: 556, y: 556 },
    { x: 480, y: 579 }, { x: 408, y: 556 },
    { x: 375, y: 480 }, { x: 405, y: 399 },
  ],
};
export const EAR_BASES = [{ x: 427, y: 265 }, { x: 531, y: 261 }];

export function closedCurve(points) {
  const n = points.length;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < n; i++) {
    const a = points[(i + n - 1) % n];
    const b = points[i];
    const c = points[(i + 1) % n];
    const d = points[(i + 2) % n];
    path += ` C ${b.x + (c.x - a.x) / 6} ${b.y + (c.y - a.y) / 6}, ${c.x - (d.x - b.x) / 6} ${c.y - (d.y - b.y) / 6}, ${c.x} ${c.y}`;
  }
  return path + ' Z';
}

export function earPath(index, tip, inset = false) {
  const base = EAR_BASES[index];
  const dx = tip.x - base.x;
  const dy = tip.y - base.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length;
  const ny = dx / length;
  const width = inset ? 11 : 29;
  const root = { x: base.x + dx * (inset ? 0.2 : 0), y: base.y + dy * (inset ? 0.2 : 0) };
  const end = { x: tip.x - dx * (inset ? 0.10 : 0), y: tip.y - dy * (inset ? 0.10 : 0) };
  return `M ${root.x - nx * width} ${root.y - ny * width}
    C ${base.x + dx * 0.42 - nx * width * 1.15} ${base.y + dy * 0.42 - ny * width * 1.15}, ${end.x - nx * width} ${end.y - ny * width}, ${end.x} ${end.y}
    C ${end.x + nx * width} ${end.y + ny * width}, ${base.x + dx * 0.42 + nx * width * 1.15} ${base.y + dy * 0.42 + ny * width * 1.15}, ${root.x + nx * width} ${root.y + ny * width} Z`;
}

function segmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return distance(point, { x: a.x + dx * t, y: a.y + dy * t });
}

function inside(point, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

export class Sculpture {
  constructor() { this.reset(); }

  reset() {
    this.target = copy(INITIAL);
    this.display = copy(INITIAL);
    this.velocity = { ears: [{ x: 0, y: 0 }, { x: 0, y: 0 }], body: INITIAL.body.map(() => ({ x: 0, y: 0 })) };
    this.grab = null;
    this.changes = 0;
  }

  hitTest(point) {
    const ears = this.target.ears.map((tip, index) => ({ kind: 'ears', index, distance: segmentDistance(point, EAR_BASES[index], tip) }));
    const ear = ears.sort((a, b) => a.distance - b.distance)[0];
    if (ear.distance < 53 && point.y < 285) return { kind: ear.kind, index: ear.index };
    const body = this.target.body.map((p, index) => ({ kind: 'body', index, distance: distance(p, point) })).filter(p => p.index !== 0);
    const nearest = body.sort((a, b) => a.distance - b.distance)[0];
    if (point.y > 365 && (nearest.distance < 68 || inside(point, this.target.body))) return { kind: nearest.kind, index: nearest.index };
    return null;
  }

  begin(point) {
    const hit = this.hitTest(point);
    if (!hit) return null;
    this.grab = { ...hit, origin: { ...point }, snapshot: copy(this.target), moved: false };
    return hit;
  }

  move(point) {
    if (!this.grab) return;
    const { kind, index, origin, snapshot } = this.grab;
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    if (Math.hypot(dx, dy) > 8) this.grab.moved = true;
    if (kind === 'ears') {
      const base = EAR_BASES[index];
      const next = { x: clamp(snapshot.ears[index].x + dx, 90, 870), y: clamp(snapshot.ears[index].y + dy, 48, 247) };
      // Keep a minimum ear length, including when the hand moves toward its root.
      const len = distance(base, next);
      if (len < 65) {
        next.x = base.x + ((next.x - base.x) / (len || 1)) * 65;
        next.y = base.y + ((next.y - base.y) / (len || 1)) * 65;
      }
      this.target.ears[index] = next;
    } else {
      // A soft neighborhood, rather than a single polygon vertex, gives a clay-like pull.
      for (let i = 1; i < snapshot.body.length; i++) {
        const steps = Math.min(Math.abs(i - index), 8 - Math.abs(i - index));
        const weight = steps === 0 ? 1 : steps === 1 ? 0.48 : steps === 2 ? 0.12 : 0;
        const p = snapshot.body[i];
        const leftSide = i >= 5;
        const rightSide = i <= 3;
        this.target.body[i] = {
          x: clamp(p.x + dx * weight, leftSide ? 175 : rightSide ? 510 : 355, leftSide ? 450 : rightSide ? 785 : 605),
          y: clamp(p.y + dy * weight, i === 1 || i === 7 ? 380 : i === 2 || i === 6 ? 420 : 505, 636),
        };
      }
    }
  }

  release() {
    if (!this.grab) return false;
    const changed = this.grab.moved;
    if (changed) this.changes++;
    this.grab = null;
    return changed;
  }

  tick(dt) {
    const step = clamp(dt * 60, 0.1, 2);
    const stiffness = this.grab ? 0.19 : 0.13;
    const friction = Math.pow(this.grab ? 0.57 : 0.73, step);
    for (const kind of ['ears', 'body']) {
      this.target[kind].forEach((p, i) => {
        for (const axis of ['x', 'y']) {
          this.velocity[kind][i][axis] = (this.velocity[kind][i][axis] + (p[axis] - this.display[kind][i][axis]) * stiffness * step) * friction;
          this.display[kind][i][axis] += this.velocity[kind][i][axis] * step;
        }
      });
    }
  }
}
