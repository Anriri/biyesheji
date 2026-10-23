import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const context = {};
vm.runInNewContext(readFileSync(new URL('../life-prototype/creature.js', import.meta.url), 'utf8'), context);
const { SoftSculpt, SculptSession, PaintState, bindPaintPoint, paintPoint, paintPath, limbGeometries, attachment, validateArtwork } = context.CreatureMotion;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const style = { color: '#ff477e', width: 20, erase: false };

test('材料笔迹：落笔位置重建准确，平移和非均匀拉伸后随皮肤移动', () => {
  const body = new SoftSculpt();
  for (const p of [{ x: 0, y: -120 }, { x: 65, y: -80 }, { x: -40, y: -170 }]) {
    const weights = bindPaintPoint(p, body.shape);
    assert.ok(distance(p, paintPoint(weights, body.shape)) < 1e-8);
    const stretched = body.shape.map(v => ({ x: v.x * 1.7 + 32, y: v.y * .6 - 21 }));
    assert.ok(distance(paintPoint(weights, stretched), { x: p.x * 1.7 + 32, y: p.y * .6 - 21 }) < 1e-8);
    assert.doesNotMatch(paintPath([weights], stretched), /NaN|Infinity/);
  }
});

test('涂色独立：底色不改笔迹或几何，离开轮廓再进入时不跨空白连线', () => {
  const body = new SoftSculpt(), paint = new PaintState(), shape = JSON.stringify(body.shape);
  paint.sample('body', { x: 0, y: -100 }, body.shape, style);
  paint.sample('body', { x: 25, y: -80 }, body.shape, style); paint.end();
  const stroke = JSON.stringify(paint.strokes);
  paint.setColor('body', '#bce8d4'); paint.setColor('limb:1', '#338aff');
  assert.equal(JSON.stringify(paint.strokes), stroke); assert.equal(JSON.stringify(body.shape), shape);
  assert.equal(paint.color('body'), '#bce8d4'); assert.equal(paint.color('limb:1'), '#338aff');
  paint.sample('body', { x: 20, y: -70 }, body.shape, style);
  paint.sample(null); paint.sample('body', { x: -20, y: -130 }, body.shape, style); paint.end();
  assert.equal(paint.strokes.length, 3);
});

test('统一历史：擦除后能重画，撤销重做保持笔迹快照不变，新操作清空重做', () => {
  const session = new SculptSession(new SoftSculpt());
  function stroke(erase, color) {
    const before = session.snapshot(); session.paint.sample('body', { x: 0, y: -100 }, session.body.shape, { ...style, erase, color }); session.paint.end(); session.remember(before);
  }
  stroke(false, '#ff477e'); const first = JSON.stringify(session.paint.strokes);
  stroke(true, '#000000'); stroke(false, '#338aff');
  assert.deepEqual(Array.from(session.paint.strokes, s => s.erase), [false, true, false]);
  assert.ok(session.undo()); assert.equal(session.paint.strokes.length, 2);
  assert.ok(session.undo()); assert.equal(JSON.stringify(session.paint.strokes), first);
  assert.ok(session.redo()); assert.equal(session.paint.strokes.length, 2);
  assert.ok(session.redo()); assert.equal(session.paint.strokes.length, 3);
  assert.ok(session.undo()); stroke(false, '#39ff14'); assert.equal(session.redo(), false);
  assert.equal(JSON.stringify(session.history[0].paint.strokes), '[]');
});

test('分枝涂色：锚点随父段回弯，删除和恢复子树时图案与颜色也恢复', () => {
  const session = new SculptSession(new SoftSculpt()), limbs = session.limbs;
  const root = attachment(session.body.shape, 8);
  limbs.beginCreate(root, session.body.shape); limbs.move({ x: root.x + 140, y: root.y }, session.body.shape); limbs.release();
  const parent = limbs.active, parentGeometry = limbGeometries(limbs.items, session.body.shape).get(parent.id);
  const childRoot = attachment(parentGeometry.surface, 14);
  limbs.beginCreate(childRoot, session.body.shape, parent.id); limbs.move({ x: childRoot.x + childRoot.nx * 80, y: childRoot.y + childRoot.ny * 80 }, session.body.shape); limbs.release();
  const child = limbs.active, geometry = limbGeometries(limbs.items, session.body.shape).get(child.id);
  session.paint.sample(`limb:${child.id}`, geometry.bend, geometry.surface, style); session.paint.end(); session.paint.setColor(`limb:${child.id}`, '#ffd9b3');
  const saved = JSON.stringify(session.paint.snapshot());
  parent.tip = { x: -40, y: 150 };
  const moved = limbGeometries(limbs.items, session.body.shape).get(child.id), point = paintPoint(session.paint.strokes[0].points[0], moved.surface);
  assert.ok(Number.isFinite(point.x + point.y)); assert.ok(distance(point, geometry.bend) > 20);
  const before = session.snapshot(); limbs.selected = parent.id; limbs.removeSelected(); session.paint.prune(limbs.items.map(l => l.id)); session.remember(before);
  assert.equal(session.paint.strokes.length, 0);
  assert.ok(session.undo()); assert.equal(JSON.stringify(session.paint.snapshot()), saved);
});

test('作品文件：完整往返恢复，损坏、孤立分支、非法颜色或锚点不覆盖当前作品', () => {
  const session = new SculptSession(new SoftSculpt());
  session.paint.setColor('body', '#bce8d4'); session.paint.sample('body', { x: 0, y: -100 }, session.body.shape, style); session.paint.end();
  const exported = JSON.parse(JSON.stringify(session.export())), restored = new SculptSession(new SoftSculpt());
  restored.load(exported); assert.equal(JSON.stringify(restored.export()), JSON.stringify(exported));
  const original = JSON.stringify(restored.export());
  const mutations = [
    d => { d.version = 2; }, d => { d.state.paint.colors.body = 'url(javascript:bad)'; },
    d => { d.state.paint.strokes[0].part = 'limb:99'; }, d => { d.state.paint.strokes[0].points[0] = [1]; },
    d => { d.state.shape[0].x = 999999; }, d => { d.state.paint.strokes[0].points[0][0] = Infinity; },
    d => { d.state.shape[0] = null; },
    d => { d.state.limbs = [{ id: 1, parentId: 2, slot: 8, tip: { x: 80, y: 0 }, bend: { x: 0, y: 0 }, width: 17, curlSide: 1 }, { id: 2, parentId: 1, slot: 8, tip: { x: 80, y: 0 }, bend: { x: 0, y: 0 }, width: 17, curlSide: 1 }]; },
  ];
  for (const change of mutations) {
    const invalid = JSON.parse(JSON.stringify(exported)); change(invalid);
    assert.throws(() => restored.load(invalid)); assert.equal(JSON.stringify(restored.export()), original);
  }
  assert.ok(validateArtwork(exported));
});
