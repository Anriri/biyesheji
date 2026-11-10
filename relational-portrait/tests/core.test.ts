import test from "node:test";
import assert from "node:assert/strict";
import {
  extractKeywords,
  planFromTags,
  localCreativeService,
} from "../src/services/creative.ts";
import {
  matchBodies,
  motionSignals,
  poseSample,
} from "../src/services/tracking.ts";
import { newWork, validateWork, replaceParticipant, appendFrame } from "../src/work.ts";
import { sampleSignals } from "../src/engine.ts";
test("memory and future extraction map the provided examples, remain editable, and accept non-English input", async () => {
  const w = newWork();
  const p = await localCreativeService.extract(w.participants, "memory");
  const tags = new Set(p.flatMap((p) => p.tags));
  for (const k of [
    "Campus",
    "Pond",
    "Fish",
    "Summer",
    "Corridor",
    "Companionship",
    "Nostalgia",
  ])
    assert.ok(tags.has(k));
  const future = new Set(
    (await localCreativeService.extract(w.participants, "future")).flatMap(
      (p) => p.tags,
    ),
  );
  for (const k of ["Ocean", "Travel", "University", "Reunion"])
    assert.ok(future.has(k));
  assert.ok(extractKeywords("我们曾经在大学的池塘边看鱼").includes("Fish"));
  assert.ok(extractKeywords("Ancient amber notebooks").includes("Amber"));
});
test("semantic tags change independent content choices instead of returning one fixed picture", () => {
  const a = planFromTags(["Campus", "Fish", "Pond"]),
    b = planFromTags(["Travel", "Ocean"]);
  assert.equal(a.architecture, "campus");
  assert.equal(a.environment, "pond");
  assert.equal(b.environment, "ocean");
  assert.notEqual(a.seed, b.seed);
  assert.equal(planFromTags(["Amber"]).object, "memento");
});
test("pose sample uses mirror coordinates, visibility thresholds and raised wrists, no mental-state classifier", () => {
  const l = Array.from({ length: 33 }, () => ({
    x: 0.2,
    y: 0.7,
    z: 0,
    visibility: 1,
  }));
  l[11].y = l[12].y = 0.45;
  l[15].y = 0.1;
  const p = poseSample(l)!;
  assert.ok(Math.abs(p.x - 0.8) < 0.001);
  assert.equal(p.raised, 1);
  l[11].visibility = l[12].visibility = 0;
  assert.equal(poseSample(l), null);
});
test("identity association survives detector ordering changes; missing/still bodies do not fake synchrony", () => {
  let bodies = matchBodies(
    [],
    [
      { x: 0.2, y: 0.5, raised: 0 },
      { x: 0.8, y: 0.5, raised: 0 },
    ],
    100,
  );
  bodies = matchBodies(
    bodies,
    [
      { x: 0.7, y: 0.5, raised: 1 },
      { x: 0.3, y: 0.5, raised: 0 },
    ],
    200,
  );
  assert.equal(bodies[0].id, "body-0");
  assert.ok(bodies[0].x < 0.4);
  const still = bodies.map((b) => ({ ...b, vx: 0, vy: 0 }));
  assert.equal(motionSignals(still, 0.4).synchrony, 0);
  assert.equal(motionSignals([still[0]], 0.4).synchrony, 0);
});
test("closer bodies converge, same-direction movement coordinates, raised hands lift; supports more than two", () => {
  const body = (id: string, x: number, vx = 0.15) => ({
    id,
    x,
    y: 0.5,
    vx,
    vy: 0,
    raised: 0.8,
    at: 100,
  });
  const near = motionSignals([body("a", 0.4), body("b", 0.55)], 0.3),
    far = motionSignals([body("a", 0.1), body("b", 0.9)], 0.3);
  assert.ok(near.proximity > far.proximity + 0.5);
  assert.ok(near.synchrony > 0);
  assert.equal(
    motionSignals([body("a", 0.4), body("b", 0.55, -0.15)], 0.3).synchrony,
    0,
  );
  assert.ok(near.hands > 0.7);
  assert.ok(
    Number.isFinite(
      motionSignals([body("a", 0.1), body("b", 0.5), body("c", 0.8)], 0.3)
        .proximity,
    ),
  );
});
test("recorded timeline interpolates and clamps without regenerating assets", () => {
  const s = { proximity: 0, synchrony: 0, hands: 0, expression: 0 };
  const f = [
    { t: 0, signals: s, source: "manual" as const },
    { t: 10, signals: { ...s, proximity: 1 }, source: "manual" as const },
  ];
  assert.equal(sampleSignals(f, 5).proximity, 0.5);
  assert.equal(sampleSignals(f, 20).proximity, 1);
});
test("rapid input before a render frame keeps every action in a monotonic timeline", () => {
  const w = newWork();
  let frames = appendFrame(w.frames, 0, { ...w.frames[0].signals, proximity: 0 }, "manual");
  frames = appendFrame(frames, 0, { ...w.frames[0].signals, proximity: 1 }, "manual");
  assert.equal(frames.length, 3);
  assert.equal(frames[1].signals.proximity, 0);
  assert.equal(frames[2].signals.proximity, 1);
  assert.ok(frames[2].t > frames[1].t && frames[1].t > frames[0].t);
  assert.doesNotThrow(() => validateWork({ ...w, frames, duration: frames.at(-1)!.t }));
});
test("JSON round trip preserves input and independent layers; invalid files cannot inject remote textures", () => {
  const w = newWork();
  assert.deepEqual(
    validateWork(JSON.parse(JSON.stringify(w))).participants,
    w.participants,
  );
  assert.equal(
    replaceParticipant(w.participants, w.participants[0].id, {
      name: "New name",
    })[1].name,
    w.participants[1].name,
  );
  const bad = structuredClone(w);
  bad.layers[0].custom = "https://tracker.invalid/image.png";
  assert.throws(() => validateWork(bad));
  const bad2 = structuredClone(w);
  bad2.frames[0].signals.proximity = NaN;
  assert.throws(() => validateWork(bad2));
});
