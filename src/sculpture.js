export const WIDTH = 960;
export const HEIGHT = 700;
const copy = value => structuredClone(value);
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mix = (a, b, t) => Object.fromEntries(Object.keys(a).map(key => [key, a[key] + (b[key] - a[key]) * t]));

export function closedCurve(points) {
  let path = `M ${points[0].x} ${points[0].y}`;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[(i + n - 1) % n], b = points[i], c = points[(i + 1) % n], d = points[(i + 2) % n];
    path += ` C ${b.x + (c.x - a.x) / 6} ${b.y + (c.y - a.y) / 6}, ${c.x - (d.x - b.x) / 6} ${c.y - (d.y - b.y) / 6}, ${c.x} ${c.y}`;
  }
  return path + ' Z';
}

// Arc-length remeshing supplies new material for new tentacles, instead of eight fixed handles.
// Mapping samples onto all arrays together preserves skin coordinates and spring continuity.
function remesh(points, companions = [], spacing = 6) {
  const lengths = points.map((p, i) => distance(p, points[(i + 1) % points.length]));
  const perimeter = lengths.reduce((a, b) => a + b, 0);
  const count = clamp(Math.ceil(perimeter / spacing), 80, 2400);
  const result = Array.from({ length: 1 + companions.length }, () => []);
  let index = 0, traversed = 0;
  for (let i = 0; i < count; i++) {
    const offset = perimeter * i / count;
    while (index < points.length - 1 && traversed + lengths[index] < offset) traversed += lengths[index++];
    const t = lengths[index] ? (offset - traversed) / lengths[index] : 0;
    [points, ...companions].forEach((array, n) => result[n].push(mix(array[index], array[(index + 1) % array.length], t)));
  }
  return result;
}

function initialContour() {
  const controls = [
    [480, 213], [548, 227], [588, 263], [606, 309],
    [619, 363], [645, 439], [643, 468], [631, 479], [615, 463],
    [593, 387], [582, 366], [566, 398], [537, 419],
    [553, 458], [569, 510], [558, 552], [536, 578],
    [510, 575], [485, 559], [460, 578], [432, 577], [407, 555],
    [395, 520], [404, 468], [424, 420], [390, 401], [373, 370],
    [354, 428], [339, 479], [326, 494], [313, 484], [315, 462],
    [333, 390], [341, 314], [354, 272], [399, 231],
  ].map(([x, y]) => ({ x, y }));
  const samples = [];
  for (let i = 0; i < controls.length; i++) {
    const a = controls[(i + controls.length - 1) % controls.length], b = controls[i], c = controls[(i + 1) % controls.length], d = controls[(i + 2) % controls.length];
    for (let j = 0; j < 10; j++) {
      const t = j / 10, t2 = t * t, t3 = t2 * t;
      const point = {};
      for (const axis of ['x', 'y']) point[axis] = 0.5 * (2 * b[axis] + (-a[axis] + c[axis]) * t + (2 * a[axis] - 5 * b[axis] + 4 * c[axis] - d[axis]) * t2 + (-a[axis] + 3 * b[axis] - 3 * c[axis] + d[axis]) * t3);
      samples.push(point);
    }
  }
  return remesh(samples)[0].map(p => ({ ...p, rx: p.x, ry: p.y }));
}
export const INITIAL = { body: initialContour() };

function project(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  const position = { x: a.x + dx * t, y: a.y + dy * t };
  return { point: position, t, distance: distance(point, position) };
}
function inside(point, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

// Bind painted facial features to the original material, even as the contour is remeshed.
export function skinPoint(point, contour) {
  let sum = 0, dx = 0, dy = 0;
  contour.forEach((p, i) => {
    const next = contour[(i + 1) % contour.length], prev = contour[(i + contour.length - 1) % contour.length];
    const material = (Math.hypot(next.rx - p.rx, next.ry - p.ry) + Math.hypot(prev.rx - p.rx, prev.ry - p.ry)) / 2;
    const squared = (p.rx - point.x) ** 2 + (p.ry - point.y) ** 2 + 500;
    const weight = material / (squared * squared);
    sum += weight; dx += (p.x - p.rx) * weight; dy += (p.y - p.ry) * weight;
  });
  return { x: point.x + dx / (sum || 1), y: point.y + dy / (sum || 1) };
}

export class Sculpture {
  constructor() { this.radius = 32; this.reset(); }
  reset() {
    this.target = copy(INITIAL); this.display = copy(INITIAL);
    this.velocity = { body: INITIAL.body.map(() => ({ x: 0, y: 0 })) };
    this.grab = null; this.changes = 0; this.history = [];
  }
  hitTest(point) {
    let nearest = { distance: Infinity };
    const contour = this.target.body;
    contour.forEach((p, index) => {
      const hit = project(point, p, contour[(index + 1) % contour.length]);
      if (hit.distance < nearest.distance) nearest = { ...hit, kind: 'body', index };
    });
    return nearest.distance < 38 || inside(point, contour) ? nearest : null;
  }
  begin(point) {
    if (!this.hitTest(point)) return null;
    const before = copy(this.target);
    const [body, displayed, velocity] = remesh(this.target.body, [this.display.body, this.velocity.body]);
    this.target.body = body; this.display.body = displayed; this.velocity.body = velocity;
    let hit = this.hitTest(point);
    const index = hit.index + 1;
    // Insert the exact contact point so both thin and broad brushes remain continuous.
    for (const array of [this.target.body, this.display.body, this.velocity.body]) array.splice(index, 0, mix(array[hit.index], array[(hit.index + 1) % array.length], hit.t));
    hit = { ...hit, index };
    const snapshot = copy(this.target);
    const arcs = [0];
    for (let i = 1; i <= this.target.body.length; i++) arcs[i] = arcs[i - 1] + distance(this.target.body[i - 1], this.target.body[i % this.target.body.length]);
    const perimeter = arcs.at(-1);
    const weights = arcs.slice(0, -1).map(offset => {
      const delta = Math.abs(offset - arcs[index]);
      const arc = Math.min(delta, perimeter - delta);
      return Math.exp(-1.5 * (Math.max(0, arc - 7) / this.radius) ** 2);
    });
    this.grab = { ...hit, origin: { ...point }, snapshot, before, weights, moved: false };
    return hit;
  }
  move(point) {
    if (!this.grab) return;
    const { origin, snapshot, weights } = this.grab;
    // Clamp the contact point itself; the rest is free to move in every direction.
    const anchor = snapshot.body[this.grab.index];
    const dx = clamp(point.x - origin.x, 25 - anchor.x, WIDTH - 25 - anchor.x);
    const dy = clamp(point.y - origin.y, 40 - anchor.y, HEIGHT - 44 - anchor.y);
    if (Math.hypot(dx, dy) > 5) this.grab.moved = true;
    this.target.body = snapshot.body.map((p, i) => ({ ...p, x: clamp(p.x + dx * weights[i], 25, WIDTH - 25), y: clamp(p.y + dy * weights[i], 40, HEIGHT - 44) }));
  }
  release() {
    if (!this.grab) return false;
    const changed = this.grab.moved;
    if (changed) {
      this.history.push(this.grab.before);
      if (this.history.length > 40) this.history.shift();
      this.changes++;
    }
    this.grab = null;
    return changed;
  }
  undo() {
    if (this.grab) this.release();
    const previous = this.history.pop();
    if (!previous) return false;
    this.target = copy(previous); this.display = copy(previous);
    this.velocity.body = previous.body.map(() => ({ x: 0, y: 0 }));
    this.changes = Math.max(0, this.changes - 1);
    return true;
  }
  tick(dt) {
    const step = clamp(dt * 60, 0.1, 2);
    const stiffness = this.grab ? 0.19 : 0.13;
    const friction = Math.pow(this.grab ? 0.57 : 0.73, step);
    this.target.body.forEach((p, i) => {
      for (const axis of ['x', 'y']) {
        this.velocity.body[i][axis] = (this.velocity.body[i][axis] + (p[axis] - this.display.body[i][axis]) * stiffness * step) * friction;
        this.display.body[i][axis] += this.velocity.body[i][axis] * step;
      }
    });
  }
}
