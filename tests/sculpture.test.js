import test from 'node:test';
import assert from 'node:assert/strict';
import { Sculpture, INITIAL, closedCurve, earPath } from '../src/sculpture.js';
import { GestureFilter, measurePinch, pinchPoint } from '../src/gesture.js';

test('耳朵抓取使用移动差值，不跳到手指位置；松手保留形状', () => {
  const sculpture = new Sculpture();
  const origin = { x: 410, y: 140 };
  assert.deepEqual(sculpture.begin(origin), { kind: 'ears', index: 0 });
  sculpture.move(origin);
  assert.deepEqual(sculpture.target.ears, INITIAL.ears);
  sculpture.move({ x: 350, y: 70 });
  assert.deepEqual(sculpture.target.ears[0], { x: 333, y: 48 });
  assert.deepEqual(sculpture.target.ears[1], INITIAL.ears[1]);
  assert.equal(sculpture.release(), true);
  const saved = structuredClone(sculpture.target);
  for (let i = 0; i < 240; i++) sculpture.tick(1 / 60);
  assert.deepEqual(sculpture.target, saved);
  assert.ok(Math.abs(sculpture.display.ears[0].x - saved.ears[0].x) < 0.01);
  assert.equal(sculpture.changes, 1);
});

test('身体宽度与高度可连续改变，邻点柔和跟随，顶部保持连接', () => {
  const sculpture = new Sculpture();
  assert.deepEqual(sculpture.begin({ x: 585, y: 480 }), { kind: 'body', index: 2 });
  sculpture.move({ x: 705, y: 480 });
  assert.equal(sculpture.target.body[2].x, 705);
  assert.ok(sculpture.target.body[3].x > INITIAL.body[3].x);
  assert.deepEqual(sculpture.target.body[0], INITIAL.body[0]);
  sculpture.release();
  sculpture.begin({ x: 480, y: 579 });
  sculpture.move({ x: 480, y: 629 });
  assert.equal(sculpture.target.body[4].y, 629);
  sculpture.release();
  assert.equal(sculpture.changes, 2);
});

test('画布外抓取无效，极端拉伸被限制，重置恢复初始形态', () => {
  const sculpture = new Sculpture();
  assert.equal(sculpture.begin({ x: 10, y: 10 }), null);
  assert.equal(sculpture.release(), false);
  sculpture.begin(INITIAL.ears[1]);
  sculpture.move({ x: 10000, y: -10000 });
  assert.equal(sculpture.target.ears[1].x, 870);
  assert.equal(sculpture.target.ears[1].y, 48);
  sculpture.release();
  assert.notDeepEqual(sculpture.target, INITIAL);
  sculpture.reset();
  assert.deepEqual(sculpture.target, INITIAL);
  assert.equal(sculpture.changes, 0);
});

test('形变轮廓为有限数值的闭合贝塞尔路径', () => {
  for (const path of [closedCurve(INITIAL.body), earPath(0, INITIAL.ears[0]), earPath(1, { x: 800, y: 48 }, true)]) {
    assert.match(path, /^M /);
    assert.match(path.trim(), /Z$/);
    assert.doesNotMatch(path, /NaN|Infinity/);
    assert.match(path, /C /);
  }
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
