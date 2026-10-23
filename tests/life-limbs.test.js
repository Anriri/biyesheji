import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const context = {};
vm.runInNewContext(readFileSync(new URL('../life-prototype/creature.js', import.meta.url), 'utf8'), context);
const { SoftSculpt, LimbSystem, SculptSession, attachment, limbGeometry, samplePose, makeContour } = context.CreatureMotion;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('肢体独立于身体：真实边缘可生成多个肢体，主体材料点完全保留', () => {
  const body = new SoftSculpt(), limbs = new LimbSystem(), before = JSON.stringify(body.shape);
  assert.equal(limbs.beginCreate({ x: 0, y: -110 }, body.shape), false, 'interior is not a new limb root');
  for (const slot of [0, 8, 14, 19, 24]) {
    const root = attachment(body.shape, slot);
    assert.ok(limbs.beginCreate(root, body.shape));
    limbs.move({ x: root.x + root.nx * 100 + root.tx * 25, y: root.y + root.ny * 100 + root.ty * 25 }, body.shape);
    assert.ok(limbs.release());
  }
  assert.equal(limbs.items.length, 5);
  assert.equal(new Set(limbs.items.map(item => item.id)).size, 5);
  assert.equal(JSON.stringify(body.shape), before);
});

test('平滑面状肢体：根部深入主体、圆润封口、长度方向弯曲和粗细独立可调', () => {
  const body = new SoftSculpt(), limbs = new LimbSystem(), root = attachment(body.shape, 8);
  limbs.beginCreate(root, body.shape);
  limbs.move({ x: root.x + 130, y: root.y - 35 }, body.shape); limbs.release();
  const limb = limbs.active, initial = limbGeometry(limb, body.shape);
  assert.match(initial.path, /^M .* C .* Z$/);
  assert.ok(initial.outline.length > 30);
  assert.doesNotMatch(initial.path, /NaN|Infinity/);
  limbs.beginEdit(limb.id, 'bend', initial.bend);
  limbs.move({ x: initial.bend.x, y: initial.bend.y - 32 }, body.shape); limbs.release();
  const curved = limbGeometry(limb, body.shape);
  assert.ok(dist(curved.bend, initial.bend) > 15);
  assert.ok(dist(curved.tip, initial.tip) < 1e-8);
  const originalWidth = limb.width;
  limbs.setWidth(32); assert.equal(limb.width, 32);
  assert.notEqual(limbGeometry(limb, body.shape).path, curved.path);
  assert.ok(dist(limbGeometry(limb, body.shape).tip, curved.tip) < 1e-8);
  limbs.setWidth(999); assert.equal(limb.width, 42);
  limbs.setWidth(-20); assert.equal(limb.width, 5);
  limbs.setWidth(originalWidth);
  const shape = body.shape.map(p => ({ x: p.x + 35, y: p.y - 20 }));
  const translated = limbGeometry(limb, shape);
  assert.ok(Math.abs(translated.root.x - curved.root.x - 35) < 1e-8);
  assert.ok(Math.abs(translated.tip.y - curved.tip.y + 20) < 1e-8);
  for (let t = 0; t < 8; t += .1) {
    const geometry = limbGeometry(limb, makeContour(t, samplePose(t), 1, body.shape));
    const midpoint = { x: (geometry.outline[0].x + geometry.outline.at(-1).x) / 2, y: (geometry.outline[0].y + geometry.outline.at(-1).y) / 2 };
    assert.ok((midpoint.x - geometry.root.x) * geometry.root.nx + (midpoint.y - geometry.root.y) * geometry.root.ny < -15, 'root must overlap the body throughout breathing');
  }
  limbs.beginEdit(limb.id, 'tip', limbGeometry(limb, body.shape).tip);
  limbs.move({ x: root.x + root.nx * 16, y: root.y + root.ny * 16 }, body.shape); limbs.release();
  assert.ok(Math.hypot(limb.bend.x, limb.bend.y) <= Math.hypot(limb.tip.x, limb.tip.y) * .65 + 1e-8, 'shortening a curved limb must not retain an oversized bend');
  assert.doesNotMatch(limbGeometry(limb, body.shape).path, /NaN|Infinity/);
});

test('统一撤销：创建、身体揉捏、弯曲、粗细、删除和重置按时间顺序恢复', () => {
  const body = new SoftSculpt(), session = new SculptSession(body), limbs = session.limbs;
  const initial = JSON.stringify(session.snapshot());
  const root = attachment(body.shape, 8), before = session.snapshot();
  limbs.beginCreate(root, body.shape); limbs.move({ x: root.x + 100, y: root.y }, body.shape); limbs.release(); session.remember(before);
  const created = JSON.stringify(session.snapshot());
  const beforeBody = session.snapshot();
  body.begin({ x: 0, y: -212 }); body.move({ x: 0, y: -250 }); body.release(); session.remember(beforeBody);
  const reshaped = JSON.stringify(session.snapshot());
  const beforeWidth = session.snapshot(); limbs.setWidth(30); session.remember(beforeWidth);
  const thick = JSON.stringify(session.snapshot());
  const beforeDelete = session.snapshot(); limbs.removeSelected(); session.remember(beforeDelete);
  assert.equal(limbs.items.length, 0);
  assert.ok(session.undo()); assert.equal(JSON.stringify(session.snapshot()), thick);
  assert.ok(session.reset()); assert.equal(limbs.items.length, 0);
  assert.ok(session.undo()); assert.equal(JSON.stringify(session.snapshot()), thick);
  assert.ok(session.undo()); assert.equal(JSON.stringify(session.snapshot()), reshaped);
  assert.ok(session.undo()); assert.equal(JSON.stringify(session.snapshot()), created);
  assert.ok(session.undo()); assert.equal(JSON.stringify(session.snapshot()), initial);
});
