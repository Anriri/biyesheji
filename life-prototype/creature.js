/* Classic script by design: no imports, fetches, dependencies, camera, or local server. */
(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const ease = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };

  function samplePose(time, amount = 1) {
    const phase = time * 1.04;
    // Squash and lift share one phase: the low pose is wider, the rising pose taller.
    // Incommensurate secondary rhythms keep the idle motion from feeling like a pendulum.
    const lift = (6.8 * (1 - Math.cos(phase)) + .7 * Math.sin(time * .37)) * amount;
    const sy = 1 + (-.039 * Math.cos(phase) + .006 * Math.sin(2 * phase - .6)) * amount;
    return {
      lift,
      sy,
      sx: 1 / sy,
      drift: (3.5 * Math.sin(time * .64 + .7) + 1.3 * Math.sin(time * 1.17)) * amount,
      tilt: (1.35 * Math.sin(time * .71) + .45 * Math.sin(time * 1.09 + .9)) * amount,
      bend: (2.0 * Math.sin(time * .71 - .55) + .8 * Math.sin(time * 1.04 - .8)) * amount,
    };
  }

  function makeContour(time, pose, amount = 1, shape = null) {
    const points = [];
    for (let i = 0; i < 32; i++) {
      const angle = TAU * i / 32;
      const rest = 1 + .042 * Math.sin(3 * angle + .6) + .018 * Math.cos(2 * angle - .8);
      const ripple = amount * (.011 * Math.sin(2 * angle - time * 1.30) + .007 * Math.sin(3 * angle + time * .81 + .8));
      const x = (shape ? shape[i].x : Math.sin(angle) * 112 * (1 - .16 * Math.cos(angle)) * rest) + Math.sin(angle) * 112 * (1 - .16 * Math.cos(angle)) * ripple;
      const y = (shape ? shape[i].y : -108 - Math.cos(angle) * 106 * rest) - Math.cos(angle) * 106 * ripple;
      const topWeight = clamp(-y / 215, 0, 1);
      points.push({ x: x * pose.sx + pose.bend * topWeight * topWeight, y: y * pose.sy });
    }
    return points;
  }

  // C2-continuous cubic B-spline: every segment stays inside its local control hull.
  function closedPath(points) {
    const n = points.length;
    const a = points[n - 1], b = points[0], c = points[1];
    let d = `M ${(a.x + 4 * b.x + c.x) / 6} ${(a.y + 4 * b.y + c.y) / 6}`;
    for (let i = 0; i < n; i++) {
      const p = points[i], q = points[(i + 1) % n], r = points[(i + 2) % n];
      d += ` C ${(2 * p.x + q.x) / 3} ${(2 * p.y + q.y) / 3}, ${(p.x + 2 * q.x) / 3} ${(p.y + 2 * q.y) / 3}, ${(p.x + 4 * q.x + r.x) / 6} ${(p.y + 4 * q.y + r.y) / 6}`;
    }
    return d + ' Z';
  }

  function blinkAt(elapsed) {
    if (elapsed < 0 || elapsed > .27) return 1;
    if (elapsed < .095) return 1 - .94 * ease(elapsed / .095);
    if (elapsed < .125) return .06;
    return .06 + .94 * ease((elapsed - .125) / .145);
  }

  const identityPose = { sx: 1, sy: 1, bend: 0 };
  const REST = makeContour(0, identityPose, 0);
  const clone = points => points.map(p => ({ x: p.x, y: p.y }));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function area(points) {
    return Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.y - p.y * q.x; }, 0)) / 2;
  }
  function inside(point, points) {
    let result = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
  }
  function renderedOutline(points) {
    const outline = [];
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const a = points[(i + n - 1) % n], b = points[i], c = points[(i + 1) % n], d = points[(i + 2) % n];
      for (let j = 0; j < 3; j++) {
        const t = j / 3, m = 1 - t;
        outline.push({
          x: (m ** 3 * a.x + (3 * t ** 3 - 6 * t * t + 4) * b.x + (-3 * t ** 3 + 3 * t * t + 3 * t + 1) * c.x + t ** 3 * d.x) / 6,
          y: (m ** 3 * a.y + (3 * t ** 3 - 6 * t * t + 4) * b.y + (-3 * t ** 3 + 3 * t * t + 3 * t + 1) * c.y + t ** 3 * d.y) / 6,
        });
      }
    }
    return outline;
  }
  // A local material binding moves the eyes with the dough, while keeping both eyes rigid.
  const faceWeights = REST.map(p => 1 / ((p.x * p.x + (p.y + 120) ** 2 + 700) ** 2));
  const weightSum = faceWeights.reduce((a, b) => a + b, 0);
  function faceAnchor(points) {
    return points.reduce((anchor, p, i) => {
      const weight = faceWeights[i] / weightSum;
      anchor.x += (p.x - REST[i].x) * weight;
      anchor.y += (p.y - REST[i].y) * weight;
      return anchor;
    }, { x: 0, y: -120 });
  }
  function safeFace(points, desired = faceAnchor(points), extraPadding = 0) {
    const outline = renderedOutline(points);
    const center = points.reduce((a, p) => ({ x: a.x + p.x / points.length, y: a.y + p.y / points.length }), { x: 0, y: 0 });
    function fits(p) {
      // Full, open eyes plus padding must fit the actual B-spline, not only its control hull.
      for (const side of [-29, 29]) for (let i = 0; i < 8; i++) {
        const angle = i * TAU / 8;
        if (!inside({ x: p.x + side + (15 + extraPadding) * Math.cos(angle), y: p.y + (21 + extraPadding) * Math.sin(angle) }, outline)) return false;
      }
      return true;
    }
    if (fits(desired)) return desired;
    for (let i = 1; i <= 10; i++) {
      const t = i / 10, candidate = { x: desired.x + (center.x - desired.x) * t, y: desired.y + (center.y - desired.y) * t };
      if (fits(candidate)) return candidate;
    }
    const offsets = [];
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const stepX = Math.max(12, (Math.max(...xs) - Math.min(...xs)) * .10);
    const stepY = Math.max(12, (Math.max(...ys) - Math.min(...ys)) * .09);
    for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) offsets.push({ x: x * stepX, y: y * stepY });
    offsets.sort((a, b) => a.x * a.x + a.y * a.y - b.x * b.x - b.y * b.y);
    for (const offset of offsets) {
      const candidate = { x: center.x + offset.x, y: center.y + offset.y };
      if (fits(candidate)) return candidate;
    }
    return null;
  }
  const REST_AREA = area(REST);
  const restEdges = REST.map((p, i) => distance(p, REST[(i + 1) % REST.length]));
  const SCULPT_LIMITS = Object.freeze({ travel: 300, width: 620, height: 435, minWidth: 110, minHeight: 88 });
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  function validShape(points) {
    if (points.length !== REST.length || points.some(p => !Number.isFinite(p.x + p.y) || Math.abs(p.x) > 365 || p.y < -410 || p.y > 85)) return false;
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
    if (width < SCULPT_LIMITS.minWidth || width > SCULPT_LIMITS.width || height < SCULPT_LIMITS.minHeight || height > SCULPT_LIMITS.height) return false;
    const ratio = area(points) / REST_AREA;
    // Size is bounded per axis, not by a shared area budget. A wide custom shape
    // still needs room to grow upwards without undoing its previous sculpting.
    if (ratio < .38) return false;
    let perimeter = 0;
    for (let i = 0; i < points.length; i++) {
      const prev = points[(i + points.length - 1) % points.length], a = points[i], b = points[(i + 1) % points.length];
      const edge = distance(a, b), strain = edge / restEdges[i]; perimeter += edge;
      if (strain < .30 || strain > 3.8) return false;
      const cosine = ((a.x - prev.x) * (b.x - a.x) + (a.y - prev.y) * (b.y - a.y)) / (distance(prev, a) * edge || 1);
      if (Math.acos(clamp(cosine, -1, 1)) > .86) return false;
      for (let j = i + 2; j < points.length; j++) {
        if (i === 0 && j === points.length - 1) continue;
        const c = points[j], d = points[(j + 1) % points.length];
        if (cross(a, b, c) * cross(a, b, d) < -1e-8 && cross(c, d, a) * cross(c, d, b) < -1e-8) return false;
      }
    }
    // Reserve extra clearance for breathing, contour recoil and independent gaze motion.
    return perimeter < 2 * (width + height) * 1.15 && safeFace(points, faceAnchor(points), 3) !== null;
  }

  function axisTravel(before, changes, axis, low, high, maxSpan, minSpan) {
    // Project only the blocked component of a pull. At the right/width boundary,
    // a tiny horizontal pointer drift must not cancel a valid vertical edit.
    let fraction = 1;
    before.forEach((p, i) => {
      const delta = changes[i][axis];
      if (delta > 0) fraction = Math.min(fraction, (high - p[axis]) / delta);
      if (delta < 0) fraction = Math.min(fraction, (low - p[axis]) / delta);
      before.forEach((q, j) => {
        const relative = delta - changes[j][axis];
        if (relative > 0) fraction = Math.min(fraction, (maxSpan - p[axis] + q[axis]) / relative);
      });
    });
    fraction = clamp(fraction, 0, 1);
    const span = t => {
      const values = before.map((p, i) => p[axis] + changes[i][axis] * t);
      return Math.max(...values) - Math.min(...values);
    };
    if (span(fraction) < minSpan) {
      let a = 0, b = fraction;
      for (let i = 0; i < 12; i++) {
        const mid = (a + b) / 2;
        if (span(mid) >= minSpan) a = mid; else b = mid;
      }
      fraction = a;
    }
    return fraction;
  }

  function relaxContour(candidate) {
    const points = clone(candidate);
    // Repair the few material edges/corners that reached a limit, rather than
    // cancelling the entire grab because one vertex cannot move as requested.
    for (let pass = 0; pass < 24; pass++) {
      let repaired = false;
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        const edge = distance(a, b), target = clamp(edge, restEdges[i] * .305, restEdges[i] * 3.79);
        if (Math.abs(target - edge) > 1e-6 && edge > 1e-8) {
          const scale = (edge - target) / edge * .5;
          const dx = (b.x - a.x) * scale, dy = (b.y - a.y) * scale;
          a.x += dx; a.y += dy; b.x -= dx; b.y -= dy;
          repaired = true;
        }
      }
      const next = clone(points);
      for (let i = 0; i < points.length; i++) {
        const a = points[(i + points.length - 1) % points.length], p = points[i], b = points[(i + 1) % points.length];
        const cosine = ((p.x - a.x) * (b.x - p.x) + (p.y - a.y) * (b.y - p.y)) / (distance(a, p) * distance(p, b) || 1);
        if (Math.acos(clamp(cosine, -1, 1)) > .85) {
          next[i].x += ((a.x + b.x) / 2 - p.x) * .22;
          next[i].y += ((a.y + b.y) / 2 - p.y) * .22;
          repaired = true;
        }
      }
      points.forEach((p, i) => { p.x = next[i].x; p.y = next[i].y; });
      if (!repaired) break;
    }
    return points;
  }
  class SoftSculpt {
    constructor() { this.shape = clone(REST); this.history = []; this.grab = null; }
    hitTest(point, shape = this.shape) {
      let nearest = { distance: Infinity };
      shape.forEach((a, i) => {
        const b = shape[(i + 1) % shape.length];
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        const p = { x: a.x + dx * t, y: a.y + dy * t };
        if (distance(point, p) < nearest.distance) nearest = { index: i, t, distance: distance(point, p) };
      });
      return nearest.distance <= 22 || inside(point, shape) ? nearest : null;
    }
    begin(point, hit = this.hitTest(point)) {
      if (!hit) return false;
      const arcs = [0];
      for (let i = 0; i < this.shape.length; i++) arcs.push(arcs[i] + distance(this.shape[i], this.shape[(i + 1) % this.shape.length]));
      const total = arcs.at(-1), contact = arcs[hit.index] + (arcs[hit.index + 1] - arcs[hit.index]) * hit.t;
      const materialDistance = arcs.slice(0, -1).map(a => {
        const d = Math.abs(a - contact), arc = Math.min(d, total - d);
        return arc;
      });
      const a = this.shape[hit.index], b = this.shape[(hit.index + 1) % this.shape.length];
      const edge = distance(a, b);
      const normal = { x: (b.y - a.y) / edge, y: -(b.x - a.x) / edge };
      const xs = this.shape.map(p => p.x), ys = this.shape.map(p => p.y);
      const bounds = { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2 };
      this.grab = { origin: { x: point.x, y: point.y }, before: clone(this.shape), materialDistance, normal, bounds, radius: clamp(total * .12, 82, 120) };
      return true;
    }
    move(point) {
      if (!this.grab || !Number.isFinite(point.x + point.y)) return;
      const { origin, before, materialDistance, normal, bounds, radius } = this.grab;
      let dx = point.x - origin.x, dy = point.y - origin.y;
      const length = Math.hypot(dx, dy), limit = length > SCULPT_LIMITS.travel ? SCULPT_LIMITS.travel / length : 1;
      dx *= limit; dy *= limit;
      // Long pulls recruit more neighboring material instead of turning a narrow patch
      // into a spike. All changes are relative to this grab's custom starting shape.
      const reach = radius + Math.min(Math.hypot(dx, dy) * .20, 58);
      const weights = materialDistance.map(arc => Math.exp(-.5 * (arc / reach) ** 2));
      const pressure = Math.max(0, -(dx * normal.x + dy * normal.y));
      const verticalPress = clamp((Math.abs(normal.y) - .60) / .40, 0, 1);
      const horizontalPress = clamp((Math.abs(normal.x) - .60) / .40, 0, 1);
      // Inward pressure lets the dough flow across the other axis: a top press makes
      // a pancake, while a sideways squeeze makes a taller, narrower form.
      const spreadX = clamp(pressure / bounds.height, 0, .75) * verticalPress * .65;
      const spreadY = clamp(pressure / bounds.width, 0, .75) * horizontalPress * .45;
      const changes = before.map((p, i) => ({ x: dx * weights[i], y: dy * weights[i] }));
      const tx = axisTravel(before, changes, 'x', -365, 365, SCULPT_LIMITS.width, SCULPT_LIMITS.minWidth);
      const ty = axisTravel(before, changes, 'y', -410, 85, SCULPT_LIMITS.height, SCULPT_LIMITS.minHeight);
      const primary = before.map((p, i) => ({
        x: p.x + changes[i].x * tx,
        y: p.y + changes[i].y * ty,
      }));
      const flow = before.map((p, i) => {
        // Fade pressure redistribution to zero outside this neighborhood. A small
        // corner push must not inflate a distant tip or reshape the whole body.
        const local = 1 - ease((materialDistance[i] / reach - 1.5) / 1.5);
        return { x: (p.x - bounds.cx) * spreadX * local, y: (p.y - bounds.cy) * spreadY * local };
      });
      // Pressure flow is secondary: reaching a distant boundary must not suppress
      // the user's inward handle motion. Fit flow into space left AFTER that move.
      const fx = axisTravel(primary, flow, 'x', -365, 365, SCULPT_LIMITS.width, SCULPT_LIMITS.minWidth);
      const fy = axisTravel(primary, flow, 'y', -410, 85, SCULPT_LIMITS.height, SCULPT_LIMITS.minHeight);
      const at = (t, pressureFlow = 1) => before.map((p, i) => ({
        x: p.x + (changes[i].x * tx + flow[i].x * fx * pressureFlow) * t,
        y: p.y + (changes[i].y * ty + flow[i].y * fy * pressureFlow) * t,
      }));
      const candidate = at(1);
      if (validShape(candidate)) { this.shape = candidate; return; }
      const relaxed = relaxContour(candidate);
      if (validShape(relaxed)) { this.shape = relaxed; return; }
      const withoutFlow = relaxContour(at(1, 0));
      if (validShape(withoutFlow)) { this.shape = withoutFlow; return; }
      let low = 0, high = 1, accepted = clone(before);
      for (let i = 0; i < 10; i++) {
        const t = (low + high) / 2;
        let shape = at(t);
        if (!validShape(shape)) shape = relaxContour(shape);
        if (validShape(shape)) { low = t; accepted = shape; } else high = t;
      }
      this.shape = accepted;
    }
    release() {
      if (!this.grab) return false;
      const changed = this.shape.some((p, i) => distance(p, this.grab.before[i]) > .6);
      if (changed) this.remember(this.grab.before);
      else this.shape = clone(this.grab.before);
      this.grab = null;
      return changed;
    }
    remember(shape) { this.history.push(clone(shape)); if (this.history.length > 40) this.history.shift(); }
    undo() {
      if (this.grab) this.release();
      const shape = this.history.pop(); if (!shape) return false;
      this.shape = clone(shape); return true;
    }
    get changed() { return this.shape.some((p, i) => distance(p, REST[i]) > .6); }
    reset() {
      if (this.grab) this.release();
      if (!this.changed) return false;
      this.remember(this.shape); this.shape = clone(REST); return true;
    }
  }

  const copyData = value => JSON.parse(JSON.stringify(value));
  function attachment(shape, slot) {
    slot = (slot % shape.length + shape.length) % shape.length;
    const i = Math.floor(slot) % shape.length, t = slot - Math.floor(slot), m = 1 - t;
    const a = shape[(i + shape.length - 1) % shape.length], b = shape[i], c = shape[(i + 1) % shape.length], d = shape[(i + 2) % shape.length];
    const evaluate = axis => (m ** 3 * a[axis] + (3 * t ** 3 - 6 * t * t + 4) * b[axis] + (-3 * t ** 3 + 3 * t * t + 3 * t + 1) * c[axis] + t ** 3 * d[axis]) / 6;
    const derivative = axis => (-3 * m * m * a[axis] + (9 * t * t - 12 * t) * b[axis] + (-9 * t * t + 6 * t + 3) * c[axis] + 3 * t * t * d[axis]) / 6;
    const dx = derivative('x'), dy = derivative('y'), length = Math.hypot(dx, dy) || 1;
    return { x: evaluate('x'), y: evaluate('y'), nx: dy / length, ny: -dx / length, tx: dx / length, ty: dy / length };
  }
  const fromLocal = (root, p) => ({ x: root.x + root.nx * p.x + root.tx * p.y, y: root.y + root.ny * p.x + root.ty * p.y });
  const toLocal = (root, p) => ({ x: (p.x - root.x) * root.nx + (p.y - root.y) * root.ny, y: (p.x - root.x) * root.tx + (p.y - root.y) * root.ty });
  const limbBendLimit = limb => Math.max(60, limb.width * 3, Math.hypot(limb.tip.x, limb.tip.y) * 1.25);
  function limbGeometry(limb, shape, pose = limb, parentWidth = null) {
    const root = attachment(shape, limb.slot), tip = fromLocal(root, pose.tip);
    const length = Math.hypot(pose.tip.x, pose.tip.y);
    const depth = parentWidth === null ? limb.width * .8 + 12 : Math.max(2, Math.min(limb.width * .8 + 12, parentWidth * .55));
    const start = fromLocal(root, { x: -depth, y: 0 });
    // Turning back past the root needs room for a rounded hook. A fixed departure
    // tangent followed by a collinear reversed tip would otherwise make a cusp.
    const curl = ease(-pose.tip.x / Math.max(30, length * .65));
    const side = limb.curlSide || Math.sign(pose.tip.y) || 1;
    const c1 = fromLocal(root, { x: length * .34 + (length * .35 + limb.width) * curl, y: 0 });
    const control = { x: pose.tip.x * .68 + pose.bend.x + (length * .15 + limb.width) * curl, y: pose.tip.y * .68 + pose.bend.y + side * (length * .75 + limb.width * 2) * curl };
    const fold = ease(-control.x / Math.max(30, length * .65)) * (1 - ease(Math.abs(control.y) / (length * .35 + limb.width * 2)));
    control.y += side * (length * .5 + limb.width * 2) * fold;
    const c2 = fromLocal(root, control);
    const left = [], right = [];
    let endNormal;
    for (let i = 0; i <= 18; i++) {
      const t = i / 18, m = 1 - t;
      const p = { x: m ** 3 * start.x + 3 * m * m * t * c1.x + 3 * m * t * t * c2.x + t ** 3 * tip.x, y: m ** 3 * start.y + 3 * m * m * t * c1.y + 3 * m * t * t * c2.y + t ** 3 * tip.y };
      let dx = 3 * m * m * (c1.x - start.x) + 6 * m * t * (c2.x - c1.x) + 3 * t * t * (tip.x - c2.x);
      let dy = 3 * m * m * (c1.y - start.y) + 6 * m * t * (c2.y - c1.y) + 3 * t * t * (tip.y - c2.y);
      if (Math.hypot(dx, dy) < 1e-6) { dx = tip.x - c1.x; dy = tip.y - c1.y; }
      if (Math.hypot(dx, dy) < 1e-6) { dx = root.nx; dy = root.ny; }
      const norm = Math.hypot(dx, dy) || 1, nx = -dy / norm, ny = dx / norm;
      const radius = limb.width * (.62 + .78 * (1 - t) ** 3);
      left.push({ x: p.x + nx * radius, y: p.y + ny * radius });
      right.push({ x: p.x - nx * radius, y: p.y - ny * radius });
      if (i === 18) endNormal = Math.atan2(ny, nx);
    }
    const cap = [];
    for (let i = 1; i < 8; i++) {
      const angle = endNormal - Math.PI * i / 8;
      cap.push({ x: tip.x + Math.cos(angle) * limb.width * .62, y: tip.y + Math.sin(angle) * limb.width * .62 });
    }
    // A flared web meets the body's own tangent on both sides of the root.
    // It fills the concave junction that a plain overlaid tube would leave sharp.
    const speed = distance(attachment(shape, limb.slot - .05), attachment(shape, limb.slot + .05)) * 10;
    const spread = Math.min(2.8, limb.width * 1.8 / Math.max(3, speed));
    function web(side, edge) {
      const shoulder = attachment(shape, limb.slot + spread * side);
      const start = { x: shoulder.x - shoulder.nx * 3, y: shoulder.y - shoulder.ny * 3 };
      const end = edge[6], previous = edge[5], next = edge[7];
      const norm = distance(previous, next) || 1;
      const handle = Math.min(limb.width * .9, distance(start, end) * .65);
      const a = { x: start.x - shoulder.tx * side * handle, y: start.y - shoulder.ty * side * handle };
      const b = { x: end.x - (next.x - previous.x) / norm * handle, y: end.y - (next.y - previous.y) / norm * handle };
      return Array.from({ length: 7 }, (_, i) => {
        const t = i / 6, m = 1 - t;
        return { x: m ** 3 * start.x + 3 * m * m * t * a.x + 3 * m * t * t * b.x + t ** 3 * end.x, y: m ** 3 * start.y + 3 * m * m * t * a.y + 3 * m * t * t * b.y + t ** 3 * end.y };
      });
    }
    const outline = [left[0], ...web(1, left), ...left.slice(7), ...cap, ...right.slice(7).reverse(), ...web(-1, right).reverse(), right[0]];
    const bend = { x: (start.x + 3 * c1.x + 3 * c2.x + tip.x) / 8, y: (start.y + 3 * c1.y + 3 * c2.y + tip.y) / 8 };
    // Child roots use the very same spline as the visible skin, with outward
    // normals. The tube contour has the opposite winding to the body contour.
    // Keep material slots stable even when a limb curls across itself. Choosing
    // winding from its changing signed area could flip every child attachment.
    const surface = outline.slice().reverse();
    return { root, tip, bend, outline, surface, path: closedPath(outline) };
  }
  function limbGeometries(items, shape, poses = new Map()) {
    const geometries = new Map(), remaining = new Set(items);
    // Parent-first resolution also supports restored snapshots in any order.
    while (remaining.size) {
      let resolved = false;
      for (const limb of remaining) {
        const parent = limb.parentId == null ? null : geometries.get(limb.parentId);
        if (limb.parentId != null && !parent) continue;
        const parentItem = limb.parentId == null ? null : items.find(item => item.id === limb.parentId);
        geometries.set(limb.id, limbGeometry(limb, parent ? parent.surface : shape, poses.get(limb.id) || limb, parentItem?.width ?? null));
        remaining.delete(limb); resolved = true;
      }
      if (!resolved) break; // Never hang on an orphaned or cyclic external snapshot.
    }
    return geometries;
  }
  class LimbSystem {
    constructor() { this.items = []; this.selected = null; this.grab = null; this.nextId = 1; }
    get active() { return this.items.find(limb => limb.id === this.selected) || null; }
    surfaceFor(parentId, shape, poses = new Map()) {
      return parentId == null ? shape : limbGeometries(this.items, shape, poses).get(parentId)?.surface;
    }
    beginCreate(point, shape, parentId = null, poses = new Map()) {
      const surface = this.surfaceFor(parentId, shape, poses);
      if (!surface) return false;
      let closest = { distance: Infinity };
      for (let i = 0; i < surface.length * 12; i++) {
        const slot = i / 12, p = attachment(surface, slot), d = distance(point, p);
        if (d < closest.distance) closest = { distance: d, slot };
      }
      if (closest.distance > 25) return false;
      const parent = this.items.find(item => item.id === parentId);
      const limb = { id: this.nextId++, parentId, slot: closest.slot, tip: { x: 16, y: 0 }, bend: { x: 0, y: 0 }, curlSide: 1, width: parent ? clamp(parent.width * .6, 5, 17) : 17 };
      this.items.push(limb); this.selected = limb.id;
      this.grab = { kind: 'create', id: limb.id, before: copyData(limb), origin: { ...point } };
      return true;
    }
    beginEdit(id, kind, point) {
      const limb = this.items.find(item => item.id === id); if (!limb) return false;
      this.selected = id;
      this.grab = { id, kind, before: copyData(limb), origin: { ...point } };
      return true;
    }
    move(point, shape, poses = new Map()) {
      if (!this.grab || !Number.isFinite(point.x + point.y)) return;
      const limb = this.active;
      if (!limb) return;
      const surface = this.surfaceFor(limb.parentId, shape, poses);
      if (!surface) return;
      const root = attachment(surface, limb.slot), local = toLocal(root, point);
      if (this.grab.kind === 'bend') {
        const origin = toLocal(root, this.grab.origin), max = limbBendLimit(limb);
        let x = this.grab.before.bend.x + (local.x - origin.x) * 8 / 3;
        let y = this.grab.before.bend.y + (local.y - origin.y) * 8 / 3;
        const factor = Math.min(1, max / (Math.hypot(x, y) || 1));
        limb.bend = { x: x * factor, y: y * factor };
      } else {
        // Bound distance only, never the angle or sign of the normal component.
        let x = local.x, y = local.y;
        const factor = Math.min(1, 300 / Math.hypot(x, y));
        limb.tip = { x: x * factor, y: y * factor };
        if (this.grab.kind === 'create' && x > 0 && Math.abs(y) > limb.width * .4) limb.curlSide = Math.sign(y);
        const bend = this.grab.before.bend;
        const bendScale = Math.min(1, limbBendLimit(limb) / (Math.hypot(bend.x, bend.y) || 1));
        limb.bend = { x: bend.x * bendScale, y: bend.y * bendScale };
      }
    }
    release() {
      if (!this.grab) return false;
      const limb = this.active, grab = this.grab; this.grab = null;
      return JSON.stringify(limb) !== JSON.stringify(grab.before) || grab.kind === 'create';
    }
    removeSelected() {
      if (!this.active) return false;
      const removed = new Set([this.selected]);
      let previous;
      do {
        previous = removed.size;
        for (const item of this.items) if (removed.has(item.parentId)) removed.add(item.id);
      } while (previous !== removed.size);
      this.items = this.items.filter(item => !removed.has(item.id)); this.selected = null; this.grab = null; return true;
    }
    setWidth(value) { if (this.active && Number.isFinite(Number(value))) this.active.width = clamp(Number(value), 5, 42); }
  }
  class SculptSession {
    constructor(body) { this.body = body; this.limbs = new LimbSystem(); this.history = []; }
    snapshot() { return { shape: clone(this.body.shape), limbs: copyData(this.limbs.items), selected: this.limbs.selected }; }
    remember(before) {
      const now = this.snapshot();
      if (JSON.stringify([before.shape, before.limbs]) === JSON.stringify([now.shape, now.limbs])) return false;
      this.history.push(copyData(before)); if (this.history.length > 40) this.history.shift(); return true;
    }
    undo() {
      const previous = this.history.pop(); if (!previous) return false;
      this.body.shape = clone(previous.shape); this.body.grab = null; this.body.history = [];
      this.limbs.items = copyData(previous.limbs); this.limbs.selected = previous.selected; this.limbs.grab = null; return true;
    }
    reset() {
      const before = this.snapshot(); this.body.shape = clone(REST); this.body.grab = null;
      this.limbs.items = []; this.limbs.selected = null; this.limbs.grab = null; return this.remember(before);
    }
  }

  // Also used by the small, dependency-free numerical regression test.
  globalThis.CreatureMotion = Object.freeze({ samplePose, makeContour, closedPath, blinkAt, SoftSculpt, validShape, safeFace, renderedOutline, SCULPT_LIMITS, attachment, limbGeometry, limbGeometries, LimbSystem, SculptSession });
  if (typeof document === 'undefined') return;

  const body = document.getElementById('body');
  const creature = document.getElementById('creature');
  const floor = document.getElementById('floor');
  const eyeLeft = document.getElementById('eye-left');
  const eyeRight = document.getElementById('eye-right');
  const scene = document.querySelector('.scene');
  const undoButton = document.getElementById('undo');
  const resetButton = document.getElementById('reset');
  const sculpt = new SoftSculpt();
  const session = new SculptSession(sculpt), limbs = session.limbs;
  const limbLayer = document.getElementById('limbs'), handleLayer = document.getElementById('limb-controls');
  const bodyMode = document.getElementById('body-mode'), limbMode = document.getElementById('limb-mode');
  const widthControl = document.getElementById('width-control'), widthInput = document.getElementById('limb-width');
  const deleteButton = document.getElementById('delete-limb'), hint = document.getElementById('interaction-hint');
  const limbNodes = new Map(), limbMotion = new Map();
  let workspace = { left: 0, top: 80, right: 640, bottom: 560 };
  let camera = { x: 0, y: 80, width: 640, height: 480 };
  let mode = 'body', widthBefore = null;
  let livePose = samplePose(0);
  let drag = null;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let amount = reduced.matches ? .45 : 1;
  reduced.addEventListener?.('change', event => { amount = event.matches ? .45 : 1; });

  let seed = 0x7193;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let time = 0;
  let recoilUntil = -Infinity;
  let lastFrame = null;
  let frameId;
  let blinkStart = 2.4;
  let doubleBlink = false;
  let gazeNext = 1.8;
  const gaze = { x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0 };
  const points = makeContour(0, samplePose(0, amount), amount);
  const velocities = points.map(() => ({ x: 0, y: 0 }));
  let lastSafePoints = clone(points);
  let lastSafeFace = { x: 0, y: -120 };

  function integrate(dt, target) {
    const steps = Math.max(1, Math.ceil(dt * 120));
    const h = dt / steps;
    for (let step = 0; step < steps; step++) {
      points.forEach((point, i) => {
        // The perimeter lags the center of mass slightly, giving a soft delayed recoil.
        const recoiling = time < recoilUntil;
        const stiffness = (sculpt.grab ? 360 : recoiling ? 100 : 90) + 9 * Math.sin(i * TAU / points.length);
        for (const axis of ['x', 'y']) {
          velocities[i][axis] += (stiffness * (target[i][axis] - point[axis]) - (sculpt.grab ? 28 : recoiling ? 10.5 : 13.5) * velocities[i][axis]) * h;
          point[axis] += velocities[i][axis] * h;
        }
      });
      for (const axis of ['x', 'y']) {
        const velocity = axis === 'x' ? 'vx' : 'vy';
        const desired = axis === 'x' ? gaze.targetX : gaze.targetY;
        gaze[velocity] += (24 * (desired - gaze[axis]) - 10 * gaze[velocity]) * h;
        gaze[axis] += gaze[velocity] * h;
      }
    }
  }

  function render(pose) {
    const anchor = faceAnchor(points);
    let face = safeFace(points, { x: anchor.x + gaze.x, y: anchor.y + gaze.y }) || safeFace(points);
    if (face) {
      lastSafePoints = clone(points); lastSafeFace = face;
    } else {
      // Guard rare spring overshoots without changing the user's saved sculpt target.
      // Keep the most recent safe custom contour; never expose eyes outside the skin.
      points.forEach((p, i) => { p.x = lastSafePoints[i].x; p.y = lastSafePoints[i].y; velocities[i].x = 0; velocities[i].y = 0; });
      face = lastSafeFace;
    }
    body.setAttribute('d', closedPath(points));
    renderLimbs(pose);
    creature.setAttribute('transform', `translate(${320 + pose.drift} ${428 - pose.lift}) rotate(${pose.tilt})`);
    fitWorkspace(pose);
    floor.setAttribute('cx', 320 + pose.drift * .3);
    floor.setAttribute('rx', (Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x))) * .47 - pose.lift * .8);
    floor.setAttribute('opacity', .95 - pose.lift * .019);
    const blink = blinkAt(time - blinkStart);
    const faceY = face.y;
    const faceX = face.x;
    eyeLeft.setAttribute('cx', -29 + faceX);
    eyeRight.setAttribute('cx', 29 + faceX);
    for (const eye of [eyeLeft, eyeRight]) {
      eye.setAttribute('cy', faceY);
      eye.setAttribute('ry', 15.5 * blink);
    }
  }

  function frame(timestamp) {
    const dt = lastFrame === null ? 0 : clamp((timestamp - lastFrame) / 1000, 0, .04);
    lastFrame = timestamp;
    time += dt;
    if (time > blinkStart + .27) {
      if (!doubleBlink && random() < .11) { blinkStart = time + .16; doubleBlink = true; }
      else { blinkStart = time + 2.8 + random() * 3.4; doubleBlink = false; }
    }
    if (time >= gazeNext) {
      const centered = random() < .38;
      gaze.targetX = centered ? 0 : (random() - .5) * 9;
      gaze.targetY = centered ? 0 : (random() - .5) * 4;
      gazeNext = time + 2.7 + random() * 3.2;
    }
    const pose = samplePose(time, amount);
    livePose = pose;
    if (drag?.moved) moveDrag(dragPoint(drag.clientX, drag.clientY, pose));
    integrate(dt, makeContour(time, pose, amount, sculpt.shape));
    integrateLimbs(dt);
    render(pose);
    frameId = requestAnimationFrame(frame);
  }

  function updateControls() {
    undoButton.disabled = session.history.length === 0 && !drag;
    resetButton.disabled = !sculpt.changed && limbs.items.length === 0;
    bodyMode.setAttribute('aria-pressed', String(mode === 'body'));
    limbMode.setAttribute('aria-pressed', String(mode === 'limb'));
    widthControl.hidden = deleteButton.hidden = !limbs.active;
    if (limbs.active) widthInput.value = limbs.active.width;
    deleteButton.title = '删除选中肢体及其子分支，可撤销';
    hint.textContent = limbs.active ? `${mode === 'limb' ? '边缘外拉可再分枝' : '切换「长出肢体」可分枝'} · 圆点调长短和弯曲 · 滑块调粗细 · 删除会移除整支` : mode === 'limb' ? '从身体或已有肢体边缘向外拖，继续长出分枝 · 单击肢体可选中' : '拖动身体揉捏 · 切换「长出肢体」可从身体或肢体边缘拉出分枝';
  }
  function svgNode(tag, attributes) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }
  function fitWorkspace(pose) {
    if (!limbs.items.length) workspace = { left: 0, top: 80, right: 640, bottom: 560 };
    else if (!drag) {
      const box = document.getElementById('skin').getBBox(), angle = pose.tilt * Math.PI / 180;
      for (const x of [box.x, box.x + box.width]) for (const y of [box.y, box.y + box.height]) {
        const px = 320 + pose.drift + x * Math.cos(angle) - y * Math.sin(angle);
        const py = 428 - pose.lift + x * Math.sin(angle) + y * Math.cos(angle);
        workspace.left = Math.min(workspace.left, px - 35); workspace.right = Math.max(workspace.right, px + 35);
        workspace.top = Math.min(workspace.top, py - 35); workspace.bottom = Math.max(workspace.bottom, py + 65);
      }
    }
    // Expand the workspace after release so long legs/tails remain reachable.
    // This is a view transform only; no body or limb geometry is rescaled.
    const scale = Math.max((workspace.right - workspace.left) / 640, (workspace.bottom - workspace.top) / 480);
    const target = { x: (workspace.left + workspace.right - 640 * scale) / 2, y: (workspace.top + workspace.bottom - 480 * scale) / 2, width: 640 * scale, height: 480 * scale };
    for (const key of Object.keys(camera)) camera[key] += (target[key] - camera[key]) * .13;
    scene.setAttribute('viewBox', `${camera.x} ${camera.y} ${camera.width} ${camera.height}`);
  }
  function integrateLimbs(dt) {
    const ids = new Set(limbs.items.map(item => item.id));
    for (const id of limbMotion.keys()) if (!ids.has(id)) limbMotion.delete(id);
    for (const limb of limbs.items) {
      if (!limbMotion.has(limb.id)) limbMotion.set(limb.id, { tip: { ...limb.tip }, bend: { ...limb.bend }, velocity: [0, 0, 0, 0] });
      const motion = limbMotion.get(limb.id), held = limbs.grab?.id === limb.id;
      const steps = Math.max(1, Math.ceil(dt * 120)), h = dt / steps;
      for (let step = 0; step < steps; step++) for (const [i, [key, axis]] of [['tip','x'],['tip','y'],['bend','x'],['bend','y']].entries()) {
        motion.velocity[i] += ((held ? 350 : 100) * (limb[key][axis] - motion[key][axis]) - (held ? 28 : 10.5) * motion.velocity[i]) * h;
        motion[key][axis] += motion.velocity[i] * h;
      }
    }
  }
  function renderLimbs() {
    const geometries = limbGeometries(limbs.items, points, limbMotion);
    const ids = new Set(limbs.items.map(item => item.id));
    for (const [id, node] of limbNodes) if (!ids.has(id)) { node.remove(); limbNodes.delete(id); }
    if (!limbs.active && handleLayer.childElementCount) handleLayer.replaceChildren();
    for (const limb of limbs.items) {
      if (!limbNodes.has(limb.id)) {
        const node = svgNode('path', { class: 'limb-skin', 'data-limb': limb.id, 'aria-label': `肢体 ${limb.id}` });
        limbLayer.append(node); limbNodes.set(limb.id, node);
      }
      const geometry = geometries.get(limb.id);
      if (!geometry) continue;
      limbNodes.get(limb.id).setAttribute('d', geometry.path);
      if (limbs.selected === limb.id) {
        // Keep the actual controls mounted while animating. Recreating them each
        // frame would invalidate pointer/focus targets between press and drag.
        if (handleLayer.dataset.selected !== String(limb.id) || !handleLayer.childElementCount) {
          handleLayer.replaceChildren(svgNode('path', { class: 'limb-guide' }));
          handleLayer.dataset.selected = limb.id;
          for (const kind of ['tip', 'bend']) handleLayer.append(svgNode('circle', { class: `limb-handle ${kind}`, r: kind === 'tip' ? 6 : 5, 'data-limb': limb.id, 'data-handle': kind, 'aria-label': kind === 'tip' ? '肢体末端' : '肢体弯曲' }));
        }
        handleLayer.querySelector('.limb-guide').setAttribute('d', `M ${geometry.root.x} ${geometry.root.y} Q ${geometry.bend.x} ${geometry.bend.y} ${geometry.tip.x} ${geometry.tip.y}`);
        for (const [kind, p] of [['tip', geometry.tip], ['bend', geometry.bend]]) {
          const handle = handleLayer.querySelector(`.${kind}`);
          handle.setAttribute('cx', p.x); handle.setAttribute('cy', p.y);
        }
      }
    }
  }
  function moveDrag(point) {
    if (drag?.kind === 'body') sculpt.move(point); else limbs.move(point, points, limbMotion);
  }
  function displayPoint(clientX, clientY, pose = livePose) {
    const stage = new DOMPoint(clientX, clientY).matrixTransform(scene.getScreenCTM().inverse());
    const dx = stage.x - 320 - pose.drift, dy = stage.y - 428 + pose.lift;
    const angle = pose.tilt * Math.PI / 180;
    return { x: dx * Math.cos(angle) + dy * Math.sin(angle), y: -dx * Math.sin(angle) + dy * Math.cos(angle) };
  }
  function dragPoint(clientX, clientY, pose = livePose) {
    return drag?.kind === 'body' ? modelPoint(clientX, clientY, pose) : displayPoint(clientX, clientY, pose);
  }
  function modelPoint(clientX, clientY, pose = livePose) {
    const stage = new DOMPoint(clientX, clientY).matrixTransform(scene.getScreenCTM().inverse());
    const dx = stage.x - 320 - pose.drift, dy = stage.y - 428 + pose.lift;
    const radians = pose.tilt * Math.PI / 180;
    const x = dx * Math.cos(radians) + dy * Math.sin(radians);
    const y = (-dx * Math.sin(radians) + dy * Math.cos(radians)) / pose.sy;
    const topWeight = clamp(-y / 215, 0, 1);
    return { x: (x - pose.bend * topWeight * topWeight) / pose.sx, y };
  }
  scene.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag) return;
    const target = event.target.closest('[data-limb]');
    const point = target || mode === 'limb' ? displayPoint(event.clientX, event.clientY) : modelPoint(event.clientX, event.clientY);
    const before = session.snapshot();
    let kind;
    if (target) {
      const id = Number(target.dataset.limb);
      limbs.selected = id;
      if (!target.dataset.handle && mode === 'limb') {
        if (!limbs.beginCreate(point, points, id, limbMotion)) { updateControls(); return; }
      } else if (!target.dataset.handle) { updateControls(); renderLimbs(); return; }
      else if (!limbs.beginEdit(id, target.dataset.handle, point)) return;
      kind = 'limb';
    } else if (mode === 'limb') {
      if (!limbs.beginCreate(point, points)) { limbs.selected = null; updateControls(); return; }
      kind = 'limb';
    } else {
      // During recoil the visible skin can differ from its saved target. Bind the
      // visible material edge while preserving the existing sculpt baseline.
      const hit = sculpt.hitTest(displayPoint(event.clientX, event.clientY), points);
      if (!hit || !sculpt.begin(point, hit)) { limbs.selected = null; updateControls(); return; }
      limbs.selected = null; kind = 'body';
    }
    event.preventDefault();
    drag = { kind, before, restoreSelection: target ? Number(target.dataset.limb) : before.selected, id: event.pointerId, clientX: event.clientX, clientY: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    scene.setPointerCapture(event.pointerId); scene.classList.add('is-sculpting'); updateControls();
  });
  scene.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    drag.clientX = event.clientX; drag.clientY = event.clientY;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 3) drag.moved = true;
    if (drag.moved) moveDrag(dragPoint(event.clientX, event.clientY));
  });
  function finishDrag(event, recoil = true) {
    if (!drag || (event && event.pointerId !== drag.id)) return;
    const { id, kind, before } = drag;
    if (drag.moved) moveDrag(dragPoint(drag.clientX, drag.clientY));
    if (kind === 'body') {
      const bodyBefore = sculpt.grab?.before;
      const changed = sculpt.release();
      if (changed && recoil && amount > 0) {
        recoilUntil = time + 1.4;
        points.forEach((p, i) => {
          velocities[i].x -= clamp((sculpt.shape[i].x - bodyBefore[i].x) * 1.15, -165, 165) * amount;
          velocities[i].y -= clamp((sculpt.shape[i].y - bodyBefore[i].y) * 1.15, -165, 165) * amount;
        });
      }
    } else {
      const grab = limbs.grab, limb = limbs.active;
      if (grab?.kind === 'create' && (!drag.moved || Math.hypot(limb.tip.x, limb.tip.y) < 23)) {
        limbs.removeSelected(); limbs.selected = drag.restoreSelection;
      }
      else {
        const changed = limbs.release(), motion = limbMotion.get(limb?.id);
        if (changed && recoil && motion) {
          for (const [i, [key, axis]] of [['tip','x'],['tip','y'],['bend','x'],['bend','y']].entries()) {
            motion.velocity[i] -= clamp((limb[key][axis] - grab.before[key][axis]) * .9, -110, 110) * amount;
          }
        }
      }
    }
    session.remember(before);
    drag = null; scene.classList.remove('is-sculpting');
    if (scene.hasPointerCapture(id)) scene.releasePointerCapture(id);
    updateControls();
  }
  scene.addEventListener('pointerup', finishDrag);
  scene.addEventListener('pointercancel', finishDrag);
  scene.addEventListener('lostpointercapture', finishDrag);
  function softenMomentum() { recoilUntil = -Infinity; velocities.forEach(v => { v.x *= .2; v.y *= .2; }); }
  function undo() { finishWidth(); finishDrag(null, false); session.undo(); limbMotion.clear(); softenMomentum(); updateControls(); }
  function reset() { finishWidth(); finishDrag(null, false); session.reset(); limbMotion.clear(); softenMomentum(); updateControls(); }
  undoButton.addEventListener('click', undo);
  resetButton.addEventListener('click', reset);
  function setMode(value) { finishWidth(); finishDrag(); mode = value; limbs.selected = null; updateControls(); }
  bodyMode.addEventListener('click', () => setMode('body'));
  limbMode.addEventListener('click', () => setMode('limb'));
  function finishWidth() { if (widthBefore) { session.remember(widthBefore); widthBefore = null; updateControls(); } }
  widthInput.addEventListener('input', () => { widthBefore ||= session.snapshot(); limbs.setWidth(widthInput.value); });
  widthInput.addEventListener('change', finishWidth);
  widthInput.addEventListener('blur', finishWidth);
  function deleteSelected() { finishWidth(); finishDrag(); const before = session.snapshot(); if (limbs.removeSelected()) session.remember(before); updateControls(); }
  deleteButton.addEventListener('click', deleteSelected);
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
    if (event.key === 'Escape') { finishDrag(); limbs.selected = null; updateControls(); }
    if ((event.key === 'Delete' || event.key === 'Backspace') && event.target.tagName !== 'INPUT') { event.preventDefault(); deleteSelected(); }
  });
  updateControls();

  // Pausing the simulation clock avoids a jump or fast-forward after a hidden tab resumes.
  document.addEventListener('visibilitychange', () => {
    finishDrag(null, false);
    cancelAnimationFrame(frameId);
    lastFrame = null;
    if (!document.hidden) frameId = requestAnimationFrame(frame);
  });
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frameId); lastFrame = null; });
  window.addEventListener('pageshow', event => {
    if (event.persisted && !document.hidden) { cancelAnimationFrame(frameId); lastFrame = null; frameId = requestAnimationFrame(frame); }
  });
  render(samplePose(0, amount));
  frameId = requestAnimationFrame(frame);
})();
