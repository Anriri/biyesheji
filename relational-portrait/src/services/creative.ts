import type { Participant, Plan } from "../types.ts";
export interface CreativeService {
  extract(
    participants: Participant[],
    phase: "memory" | "future",
  ): Promise<{ id: string; tags: string[] }[]>;
  compose(tags: string[], phase: "memory" | "future"): Promise<Plan>;
}
const DICTIONARY: [string, RegExp][] = [
  ["Campus", /campus|university|college|school|校园|大学|学校/i],
  ["Pond", /pond|lake|池塘|湖/i],
  ["Fish", /fish|鱼/i],
  ["Summer", /summer|暑假|夏/i],
  ["Corridor", /corridor|hallway|走廊|长廊/i],
  ["Companionship", /together|\bwe\b|\bour\b|friend|一起|陪伴|朋友|我们/i],
  ["Nostalgia", /remember|used to|nostalgi|过去|记得|回忆|曾经/i],
  ["Ocean", /ocean|sea\b|beach|海洋|大海|海边/i],
  ["Travel", /travel|journey|trip|旅行|旅途/i],
  ["University", /university|大学/i],
  ["Reunion", /return|reunion|again|重逢|再见|回到/i],
  ["Night", /night|moon|星|月|夜/i],
  ["Garden", /garden|flower|花园|花/i],
  ["Home", /home|house|家/i],
  ["Rain", /rain|雨/i],
];
export function extractKeywords(
  text: string,
  phase: "memory" | "future" = "memory",
): string[] {
  const tags = DICTIONARY.filter(
    ([name, pattern]) =>
      pattern.test(text) &&
      !(phase === "memory" && name === "University") &&
      !(phase === "future" && name === "Campus"),
  ).map(([name]) => name);
  if (tags.length) return tags;
  const stop = new Set(
    "the a an and to for of in on with is was were it i you we our my this that have had be do want hope can could would from at as not me us".split(
      " ",
    ),
  );
  return [
    ...new Set(
      (text.toLowerCase().match(/[\p{L}]{3,}/gu) || []).filter(
        (w) => !stop.has(w),
      ),
    ),
  ]
    .slice(0, 6)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
}
export function planFromTags(
  tags: string[],
  phase: "memory" | "future" = "memory",
): Plan {
  const unique = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  const text = unique.join(" ").toLowerCase();
  let seed = 2166136261;
  for (const char of text)
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  return {
    tags: unique,
    seed,
    palette: /night|nostalgia|夜/.test(text) ? "#c8c3e9" : "#c8e5f2",
    environment: /ocean|sea|海/.test(text)
      ? "ocean"
      : /pond|water|lake|池|湖/.test(text)
        ? "pond"
        : "landscape",
    architecture: /campus|university|corridor|home|大学|校园/.test(text)
      ? "campus"
      : "arch",
    object: /fish|pond|ocean|鱼|海/.test(text) ? "fish" : "memento",
  };
}
export const localCreativeService: CreativeService = {
  async extract(people, phase) {
    return people.map((p) => ({
      id: p.id,
      tags: extractKeywords(p[phase], phase),
    }));
  },
  async compose(tags, phase) {
    return planFromTags(tags, phase);
  },
};
