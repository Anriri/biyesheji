import test from 'node:test';
import assert from 'node:assert/strict';
import { Sculpture, INITIAL, LIMITS, isValidShape, facePose, closedCurve, distance } from '../src/sculpture.js';
import { GestureFilter, measurePinch, pinchPoint } from '../src/gesture.js';
const settle = s => { for (let i = 0; i < 180; i++) s.tick(1 / 60); };
const edit = (s, point, dx, dy) => { assert.ok(s.begin(point)); s.move({ x: point.x + dx, y: point.y + dy }); return s.release(); };

test('头、耳朵、主体、四肢均有清晰分区；抓取不跳位', () => {
  const s = new Sculpture();
  for (const [p, kind] of [[{x:480,y:215},'head'],[{x:630,y:460},'rightEar'],[{x:326,y:480},'leftEar'],[{x:562,y:510},'body'],[{x:590,y:460},'rightArm'],[{x:370,y:466},'leftArm'],[{x:432,y:577},'leftFoot'],[{x:536,y:577},'rightFoot']]) assert.equal(s.hitTest(p)?.kind, kind);
  assert.equal(s.begin({x:5,y:5}), null);
  const origin={x:565,y:510};s.begin(origin);s.move(origin);
  assert.deepEqual(s.target, INITIAL);assert.equal(s.release(),false);
});

test('耳朵长度、厚度连续可变且达到边界后不能反复积累尖刺', () => {
  const s = new Sculpture();
  edit(s,{x:630,y:460},28,45);
  assert.ok(s.target.params.rightEarLength > 1.05);
  assert.ok(s.target.params.rightEarWidth > 1);
  assert.equal(s.target.params.leftEarLength,1);
  const old=s.target.params.rightEarLength;
  const hit=s.target.body.find(p=>p.u>6 && p.u<7);
  edit(s,hit,-5,-35);
  assert.ok(s.target.params.rightEarLength < old);
  for(let i=0;i<40;i++){
    const tip=s.target.body.find(p=>p.u>6 && p.u<7);
    edit(s,tip,10000,10000);
    assert.ok(s.target.params.rightEarLength<=LIMITS.rightEarLength[1]);
    assert.ok(s.target.params.rightEarWidth>=s.target.params.rightEarLength*.88);
    assert.equal(s.target.body.length,INITIAL.body.length);
    assert.ok(isValidShape(s.target.body,s.target.params));
  }
});

test('主体可胖、瘦、高、扁，保留完整主体与原先创造的耳朵', () => {
  const s=new Sculpture();edit(s,{x:630,y:460},20,35);
  const ear=s.target.params.rightEarLength;
  edit(s,{x:562,y:510},45,24);
  assert.ok(s.target.params.bodyWidth>1);
  assert.ok(s.target.params.bodyHeight>1);
  assert.equal(s.target.params.rightEarLength,ear);
  settle(s);const retained=structuredClone(s.target);
  settle(s);assert.deepEqual(s.target,retained);assert.notDeepEqual(s.target,INITIAL);
  const body=s.target.body.find(p=>p.u>18 && p.u<18.5);
  edit(s,body,-70,-65);
  assert.ok(s.target.params.bodyWidth<retained.params.bodyWidth);
  assert.ok(s.target.params.bodyHeight<retained.params.bodyHeight);
  assert.ok(isValidShape(s.target.body,s.target.params));
});

test('300 次极端混合操作：无自交、无积累长刺、无材料过度挤压', () => {
  const s=new Sculpture();let maxStrain=0;
  for(let i=0;i<300;i++){
    const point=s.target.body[(i*37)%s.target.body.length];
    edit(s,point,Math.sin(i*7)*1600,Math.cos(i*11)*1600);
    assert.ok(isValidShape(s.target.body,s.target.params),`invalid at ${i}`);
    for(const [key,[min,max]] of Object.entries(LIMITS))assert.ok(s.target.params[key]>=min-1e-9&&s.target.params[key]<=max+1e-9,key);
    s.target.body.forEach((p,j)=>{const ratio=distance(p,s.target.body[(j+1)%s.target.body.length])/distance(INITIAL.body[j],INITIAL.body[(j+1)%INITIAL.body.length]);maxStrain=Math.max(maxStrain,ratio);assert.ok(ratio>=.5-1e-9&&ratio<=2.35+1e-9);});
  }
  assert.equal(s.target.body.length,INITIAL.body.length);
  assert.ok(maxStrain<=2.35+1e-9);
});

test('五官保持刚性与面部安全区，弹性显示也不越过几何约束', () => {
  const s=new Sculpture();edit(s,{x:562,y:510},70,45);const p=facePose(s.target.params);
  assert.equal(p.scale,1);assert.equal(p.x,480);
  assert.ok(Math.abs(p.y-340)<7);
  for(let i=0;i<90;i++){s.tick(i===5?.5:1/60);assert.ok(isValidShape(s.display.body,s.display.params));}
  assert.ok(s.display.body.every(p=>Number.isFinite(p.x+p.y)));
});

test('松手轻微回弹并收敛于用户所选形态，不恢复初始模板', () => {
  const s=new Sculpture();s.begin({x:630,y:460});s.move({x:650,y:495});
  const chosen=s.target.params.rightEarLength;
  assert.ok(chosen>1.05);
  for(let i=0;i<6;i++)s.tick(1/60);
  s.release();let overshoot=false;
  for(let i=0;i<180;i++){s.tick(1/60);if(s.display.params.rightEarLength>chosen+.0001)overshoot=true;}
  assert.equal(overshoot,true);
  assert.ok(Math.abs(s.display.params.rightEarLength-chosen)<.0001);
  assert.equal(s.target.params.rightEarLength,chosen);
});

test('撤销完整恢复上一自定义形态；重置才回到初始形态', () => {
  const s=new Sculpture();edit(s,{x:630,y:460},15,35);const previous=structuredClone(s.target);
  edit(s,{x:562,y:510},40,20);assert.equal(s.undo(),true);assert.deepEqual(s.target,previous);
  assert.equal(s.undo(),true);assert.deepEqual(s.target,INITIAL);assert.equal(s.undo(),false);
  s.reset();assert.equal(s.history.length,0);assert.deepEqual(s.target,INITIAL);
  assert.match(closedCurve(s.target.body),/^M .* Z$/);
  assert.doesNotMatch(closedCurve(s.target.body),/NaN|Infinity/);
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
