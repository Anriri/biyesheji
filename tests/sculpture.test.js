import test from 'node:test';
import assert from 'node:assert/strict';
import { Sculpture, INITIAL, closedCurve, skinPoint, distance } from '../src/sculpture.js';
import { GestureFilter, measurePinch, pinchPoint } from '../src/gesture.js';

const settle = sculpture => { for (let i = 0; i < 240; i++) sculpture.tick(1 / 60); };
const pull = (sculpture, near, destination) => {
  const hit = sculpture.hitTest(near);
  assert.ok(hit, 'material should be reachable');
  const origin = hit.point;
  const grab = sculpture.begin(origin);
  assert.ok(grab);
  sculpture.move(destination);
  const tip = { ...sculpture.target.body[sculpture.grab.index] };
  sculpture.release();
  settle(sculpture);
  return tip;
};

test('整个轮廓与内部均可抓取，首次捏合不跳位', () => {
  const sculpture = new Sculpture();
  assert.ok(sculpture.hitTest({ x: 480, y: 330 }));
  assert.ok(sculpture.hitTest({ x: 480, y: 220 }));
  assert.ok(sculpture.hitTest({ x: 325, y: 480 }));
  assert.equal(sculpture.begin({ x: 10, y: 10 }), null);
  const hand = { x: 570, y: 500 };
  sculpture.begin(hand);
  const before = structuredClone(sculpture.target);
  sculpture.move(hand);
  assert.deepEqual(sculpture.target, before);
  assert.equal(sculpture.release(), false);
});

test('可从身体反复拉出六根触须，无固定身体控制点；旧触须保留', () => {
  const sculpture = new Sculpture();
  const initialCount = sculpture.target.body.length;
  const pulls = [
    [{ x: 404, y: 468 }, { x: 235, y: 433 }],
    [{ x: 398, y: 520 }, { x: 200, y: 570 }],
    [{ x: 432, y: 577 }, { x: 370, y: 645 }],
    [{ x: 536, y: 578 }, { x: 625, y: 641 }],
    [{ x: 565, y: 512 }, { x: 790, y: 556 }],
    [{ x: 549, y: 459 }, { x: 769, y: 424 }],
  ];
  const tips = pulls.map(([from, to]) => pull(sculpture, from, to));
  assert.equal(sculpture.changes, 6);
  assert.ok(sculpture.target.body.length > initialCount);
  for (const tip of tips) assert.ok(Math.min(...sculpture.target.body.map(p => distance(p, tip))) < 18, 'older tentacle tips must remain');
  assert.ok(Math.min(...sculpture.target.body.map(p => p.x)) < 220);
  assert.ok(Math.max(...sculpture.target.body.map(p => p.x)) > 770);
  assert.doesNotMatch(closedCurve(sculpture.target.body), /NaN|Infinity/);
});

test('已有触须可以再抓取、侧向分叉，松开不恢复原形', () => {
  const sculpture = new Sculpture();
  const first = pull(sculpture, { x: 564, y: 510 }, { x: 820, y: 510 });
  sculpture.radius = 19;
  const branch = pull(sculpture, { x: 710, y: 503 }, { x: 710, y: 354 });
  assert.ok(branch.y < 365);
  assert.ok(Math.min(...sculpture.target.body.map(p => distance(p, first))) < 15);
  const retained = structuredClone(sculpture.target);
  settle(sculpture);
  assert.deepEqual(sculpture.target, retained);
  assert.ok(sculpture.display.body.every((p, i) => distance(p, retained.body[i]) < .05));
});

test('笔触粗细改变受影响的材料范围，向上、向内、向侧面均可移动', () => {
  const thin = new Sculpture(), broad = new Sculpture();
  thin.radius = 18; broad.radius = 82;
  const changed = sculpture => {
    sculpture.begin({ x: 560, y: 510 });
    const before = sculpture.grab.snapshot.body;
    sculpture.move({ x: 715, y: 380 });
    return sculpture.target.body.filter((p, i) => distance(p, before[i]) > 10).length;
  };
  assert.ok(changed(broad) > changed(thin) * 2);
});

test('撤销恢复完整轮廓，重置清空历史，极端拉伸仍在画布内', () => {
  const sculpture = new Sculpture();
  const before = structuredClone(sculpture.target);
  pull(sculpture, { x: 565, y: 510 }, { x: 10000, y: -10000 });
  assert.ok(sculpture.target.body.every(p => p.x >= 25 && p.x <= 935 && p.y >= 40 && p.y <= 656));
  assert.equal(sculpture.undo(), true);
  assert.deepEqual(sculpture.target, before);
  assert.equal(sculpture.undo(), false);
  pull(sculpture, { x: 565, y: 510 }, { x: 750, y: 510 });
  sculpture.reset();
  assert.deepEqual(sculpture.target, INITIAL);
  assert.equal(sculpture.history.length, 0);
  assert.equal(sculpture.changes, 0);
});

test('变形后表情材质绑定与闭合曲线始终是有限数值', () => {
  const sculpture = new Sculpture();
  pull(sculpture, { x: 550, y: 240 }, { x: 720, y: 100 });
  const face = skinPoint({ x: 480, y: 340 }, sculpture.target.body);
  assert.ok(Number.isFinite(face.x) && Number.isFinite(face.y));
  const path = closedCurve(sculpture.target.body);
  assert.match(path, /^M /); assert.match(path, / Z$/);
  assert.doesNotMatch(path, /NaN|Infinity/);
});

const hand = (gap = 0.02) => {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  points[5] = { x: 0.4, y: 0.6 };
  points[17] = { x: 0.6, y: 0.6 };
  points[4] = { x: 0.3, y: 0.3 };
  points[8] = { x: 0.3 + gap, y: 0.3 };
  return points;
};

test('捏合检测按掌宽归一化，镜像后的光标朝向一致', () => {
  assert.ok(measurePinch(hand(0.02)) < 0.32);
  assert.ok(measurePinch(hand(0.15)) > 0.48);
  assert.deepEqual(pinchPoint(hand(0.02)), { x: 0.69, y: 0.3 });
});

test('捏合有时间防抖和不同的进入/退出阈值，避免抖动反复抓取', () => {
  const filter = new GestureFilter();
  assert.equal(filter.update(hand(0.02), 0).pinched, false);
  assert.equal(filter.update(hand(0.02), 40).started, false);
  assert.equal(filter.update(hand(0.02), 80).started, true);
  assert.equal(filter.update(hand(0.075), 100).pinched, true);
  assert.equal(filter.update(hand(0.15), 120).ended, false);
  assert.equal(filter.update(hand(0.15), 200).ended, true);
  assert.equal(filter.update(hand(0.15), 220).ended, false);
  filter.reset();
  assert.equal(filter.pinched, false);
  assert.equal(filter.point, null);
});
