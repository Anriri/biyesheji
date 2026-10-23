import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = {};
vm.runInNewContext(readFileSync(new URL('../life-prototype/creature.js', import.meta.url), 'utf8'), context);
const { samplePose, makeContour, closedPath, blinkAt } = context.CreatureMotion;
const { SoftSculpt, validShape, safeFace, renderedOutline, SCULPT_LIMITS } = context.CreatureMotion;
const area = points => Math.abs(points.reduce((sum, p, i) => {
  const q = points[(i + 1) % points.length];
  return sum + p.x * q.y - p.y * q.x;
}, 0)) / 2;

test('初生动画：浮动、摇晃和挤压幅度始终柔和，横纵比例保持面积感', () => {
  let lowest = Infinity, highest = -Infinity;
  for (let time = 0; time < 90; time += .05) {
    const pose = samplePose(time);
    assert.ok(pose.sy > .95 && pose.sy < 1.05);
    assert.ok(Math.abs(pose.sx * pose.sy - 1) < 1e-12);
    assert.ok(Math.abs(pose.tilt) < 1.81);
    assert.ok(Math.abs(pose.drift) < 4.81);
    assert.ok(pose.lift > -.71 && pose.lift < 14.31);
    lowest = Math.min(lowest, pose.lift); highest = Math.max(highest, pose.lift);
  }
  assert.ok(highest - lowest > 12);
  assert.ok(samplePose(0).sy < 1);
  assert.ok(samplePose(Math.PI / 1.04).sy > 1);
});

test('初生动画：连续 90 秒的轮廓保持圆润闭合，无尖点或面积突变', () => {
  const baseline = area(makeContour(0, samplePose(0)));
  for (let time = 0; time < 90; time += .15) {
    const points = makeContour(time, samplePose(time));
    assert.equal(points.length, 32);
    assert.ok(points.every(p => Number.isFinite(p.x + p.y) && Math.abs(p.x) < 155 && p.y > -235 && p.y < 12));
    assert.ok(Math.abs(area(points) / baseline - 1) < .04);
    for (let i = 0; i < points.length; i++) {
      const a = points[(i + 31) % 32], b = points[i], c = points[(i + 1) % 32];
      const cosine = ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) / (Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y));
      assert.ok(Math.acos(Math.min(1, Math.max(-1, cosine))) < .65);
    }
    assert.match(closedPath(points), /^M .* Z$/);
    assert.doesNotMatch(closedPath(points), /NaN|Infinity/);
    const next = makeContour(time + 1 / 60, samplePose(time + 1 / 60));
    assert.ok(points.every((p, i) => Math.hypot(p.x - next[i].x, p.y - next[i].y) < 1));
  }
});

test('初生动画：眨眼平滑闭合并重新睁开，不会一直闭眼', () => {
  assert.equal(blinkAt(-1), 1);
  assert.equal(blinkAt(0), 1);
  assert.ok(blinkAt(.11) <= .061);
  assert.ok(blinkAt(.20) > blinkAt(.13));
  assert.equal(blinkAt(.28), 1);
  assert.equal(blinkAt(12), 1);
});

test('初生动画：减少动态效果偏好只降低幅度，不停止生命感', () => {
  const normal = samplePose(2), gentle = samplePose(2, .45);
  assert.ok(gentle.lift > 0 && gentle.lift < normal.lift);
  assert.ok(Math.abs(gentle.sy - 1) < Math.abs(normal.sy - 1));
});

test('团子塑形：轮廓任意位置可抓取，相邻点柔软跟随，松手保留', () => {
  const sculpt = new SoftSculpt();
  const original = JSON.stringify(sculpt.shape);
  assert.equal(sculpt.begin({ x: 240, y: -100 }), false);
  assert.equal(sculpt.begin({ x: 111, y: -100 }), true);
  sculpt.move({ x: 111, y: -100 }); assert.equal(sculpt.release(), false);
  assert.equal(JSON.stringify(sculpt.shape), original);
  sculpt.begin({ x: 111, y: -100 }); sculpt.move({ x: 166, y: -100 });
  const held = JSON.stringify(sculpt.shape);
  assert.notEqual(held, original);
  assert.ok(validShape(sculpt.shape));
  assert.equal(sculpt.release(), true);
  for (let t = 0; t < 20; t += .1) makeContour(t, samplePose(t), 1, sculpt.shape);
  assert.equal(JSON.stringify(sculpt.shape), held, 'idle animation must never overwrite the user shape');
  assert.equal(sculpt.shape.length, 32);
});

test('团子塑形：压扁、拉长和局部编辑均有效，保留原有不对称形态', () => {
  const sculpt = new SoftSculpt();
  const height = () => Math.max(...sculpt.shape.map(p => p.y)) - Math.min(...sculpt.shape.map(p => p.y));
  const originalHeight = height();
  sculpt.begin({ x: 0, y: -212 }); sculpt.move({ x: 20, y: -168 }); sculpt.release();
  assert.ok(height() < originalHeight - 15);
  const flattened = JSON.stringify(sculpt.shape);
  sculpt.begin(sculpt.shape[0]); sculpt.move({ x: sculpt.shape[0].x - 24, y: sculpt.shape[0].y - 67 }); sculpt.release();
  assert.ok(height() > originalHeight);
  assert.notEqual(JSON.stringify(sculpt.shape), flattened);
  assert.ok(validShape(sculpt.shape));
});

test('团子塑形：撤销、可撤销的重置和历史上限不会复用可变引用', () => {
  const sculpt = new SoftSculpt(), original = JSON.stringify(sculpt.shape);
  sculpt.begin({ x: 111, y: -100 }); sculpt.move({ x: 156, y: -110 }); sculpt.release();
  const custom = JSON.stringify(sculpt.shape);
  assert.equal(sculpt.reset(), true); assert.equal(JSON.stringify(sculpt.shape), original);
  assert.equal(sculpt.undo(), true); assert.equal(JSON.stringify(sculpt.shape), custom);
  assert.equal(sculpt.undo(), true); assert.equal(JSON.stringify(sculpt.shape), original);
  assert.equal(sculpt.undo(), false);
  for (let i = 0; i < 60; i++) sculpt.remember(sculpt.shape);
  assert.equal(sculpt.history.length, 40);
  sculpt.shape[0].x += 1;
  assert.notEqual(sculpt.shape[0].x, sculpt.history[0][0].x);
});

test('团子塑形：200 次极端拖动不产生自交或尖刺，动画中的眼睛有安全位置', () => {
  const sculpt = new SoftSculpt();
  for (let i = 0; i < 200; i++) {
    const p = sculpt.shape[(i * 7) % 32];
    sculpt.begin(p); sculpt.move({ x: p.x + Math.sin(i * 3) * 1800, y: p.y + Math.cos(i * 5) * 1800 }); sculpt.release();
    assert.ok(validShape(sculpt.shape), `invalid at ${i}`);
    const animated = makeContour(i * .3, samplePose(i * .3), 1, sculpt.shape);
    assert.ok(safeFace(animated), `face has no safe placement at ${i}`);
    assert.equal(renderedOutline(animated).length, 96);
  }
});

test('增强塑形：同样大幅拖动的真实材料位移为旧版的 2–3 倍', () => {
  // Measured before this change: same untouched rest shape, same pointer paths.
  const cases = [
    [{ x: 111, y: -100 }, { x: 411, y: -100 }, 96.06281588206741],
    [{ x: 0, y: -212 }, { x: 0, y: -512 }, 67.11932754867507],
  ];
  for (const [from, to, previousDisplacement] of cases) {
    const sculpt = new SoftSculpt(), before = sculpt.shape.map(p => ({ ...p }));
    sculpt.begin(from); sculpt.move(to); sculpt.release();
    const displacement = Math.max(...sculpt.shape.map((p, i) => Math.hypot(p.x - before[i].x, p.y - before[i].y)));
    assert.ok(displacement > previousDisplacement * 2.5);
    assert.ok(displacement < previousDisplacement * 3);
    assert.ok(validShape(sculpt.shape));
    const near = 8, far = 24;
    if (from.x > 0) assert.ok(Math.hypot(sculpt.shape[near].x - before[near].x, sculpt.shape[near].y - before[near].y) > 4 * Math.hypot(sculpt.shape[far].x - before[far].x, sculpt.shape[far].y - before[far].y), 'must be local deformation, not whole-character scale');
  }
  assert.equal(SCULPT_LIMITS.travel, 300);
});

test('增强塑形：从上往下压成明显扁宽形态，横向拉宽和纵向拉长有效', () => {
  function dimensions(points) {
    return { w: Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)), h: Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)) };
  }
  const pancake = new SoftSculpt(), original = dimensions(pancake.shape);
  pancake.begin({ x: 0, y: -212 }); pancake.move({ x: 0, y: -62 }); pancake.release();
  const flat = dimensions(pancake.shape);
  assert.ok(flat.h < original.h * .46);
  assert.ok(flat.w > original.w * 1.25);
  assert.ok(flat.w / flat.h > 3);
  assert.ok(safeFace(pancake.shape));
  const wide = new SoftSculpt(); wide.begin({ x: 111, y: -100 }); wide.move({ x: 380, y: -100 }); wide.release();
  assert.ok(dimensions(wide.shape).w > original.w * 1.9);
  const tall = new SoftSculpt(); tall.begin({ x: 0, y: -212 }); tall.move({ x: 0, y: -480 }); tall.release();
  assert.ok(dimensions(tall.shape).h > original.h * 1.8);
});

test('增强塑形：不同位置的大幅编辑叠加，撤销精确恢复已有自定义轮廓', () => {
  const sculpt = new SoftSculpt();
  sculpt.begin({ x: 111, y: -100 }); sculpt.move({ x: 320, y: -100 }); sculpt.release();
  const first = JSON.stringify(sculpt.shape);
  const rightMax = Math.max(...sculpt.shape.map(p => p.x));
  const left = sculpt.shape.reduce((a, b) => a.x < b.x ? a : b);
  sculpt.begin(left); sculpt.move({ x: left.x - 140, y: left.y + 30 }); sculpt.release();
  assert.notEqual(JSON.stringify(sculpt.shape), first);
  assert.ok(Math.max(...sculpt.shape.map(p => p.x)) > rightMax - 45);
  assert.ok(Math.min(...sculpt.shape.map(p => p.x)) < -170);
  assert.ok(validShape(sculpt.shape));
  assert.ok(sculpt.undo()); assert.equal(JSON.stringify(sculpt.shape), first);
});
