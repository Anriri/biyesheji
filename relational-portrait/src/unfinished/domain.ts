import { z } from "zod";
export const axes = ["career", "relationships", "exploration", "rest"] as const;
export type Axis = (typeof axes)[number];
export const labels: Record<Axis, string> = {
  career: "事业与创造",
  relationships: "关系与陪伴",
  exploration: "探索与自由",
  rest: "休息与享受",
};
export const PointsSchema = z
  .object({
    career: z.number().int().min(0).max(12),
    relationships: z.number().int().min(0).max(12),
    exploration: z.number().int().min(0).max(12),
    rest: z.number().int().min(0).max(12),
  })
  .strict();
export type Points = z.infer<typeof PointsSchema>;
export const emptyPoints = (): Points => ({
  career: 0,
  relationships: 0,
  exploration: 0,
  rest: 0,
});
export const total = (p: Points) => axes.reduce((s, k) => s + p[k], 0);
const text = (max: number) => z.string().trim().min(1).max(max);
export const SelfSchema = z
  .object({
    keep: z.string().max(400),
    change: z.string().max(400),
    description: text(1800),
    tags: z.array(text(30)).max(12),
  })
  .strict();
export type Self = z.infer<typeof SelfSchema>;
export const CandidateSchema = z
  .object({
    id: text(30),
    title: text(40),
    sourceQuotes: z.array(text(250)).min(1).max(3),
    qualities: z
      .array(z.object({ trait: text(50), property: text(80) }).strict())
      .length(2),
    impossibleObject: text(220),
    spatialRule: text(220),
    clothing: text(180),
    color: text(100),
    material: text(100),
    lighting: text(100),
    variables: z
      .array(
        z
          .object({
            axis: z.enum(axes),
            area: text(80),
            less: text(160),
            more: text(160),
          })
          .strict(),
      )
      .length(4),
    links: z
      .array(z.object({ choice: text(100), design: text(220) }).strict())
      .min(1)
      .max(3),
  })
  .strict();
export type Candidate = z.infer<typeof CandidateSchema>;
export const ContextSchema = z
  .object({
    self: SelfSchema,
    wish: text(500),
    points: PointsSchema,
    style: text(500),
  })
  .strict()
  .refine((c) => total(c.points) === 12, { message: "请分完 12 个投入点。" });
export type Context = z.infer<typeof ContextSchema>;
export const PlansSchema = z
  .object({ candidates: z.array(CandidateSchema).length(2) })
  .strict();
export const imageData = z
  .string()
  .max(16_000_000)
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/);
export const PortraitRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    context: ContextSchema,
    plan: CandidateSchema,
    photo: imageData.optional(),
    mode: z.enum(["initial", "edit"]),
    baseImage: imageData.optional(),
    original: ContextSchema.optional(),
  })
  .strict();
export type PortraitRequest = z.infer<typeof PortraitRequestSchema>;
export interface Portrait {
  id: "v1" | "v2";
  image: string;
  context: Context;
  plan: Candidate;
  links: Candidate["links"];
  createdAt: string;
  mode: "demo" | "live";
}
export const PortraitSchema = z
  .object({
    id: z.enum(["v1", "v2"]),
    image: imageData,
    context: ContextSchema,
    plan: CandidateSchema,
    links: z
      .array(z.object({ choice: text(100), design: text(220) }).strict())
      .max(3),
    createdAt: z.iso.datetime(),
    mode: z.enum(["demo", "live"]),
  })
  .strict();
export const ArchiveSchema = z
  .object({
    format: z.literal("unfinished-portrait"),
    version: z.literal(1),
    savedAt: z.iso.datetime(),
    portrait: PortraitSchema,
    reflection: text(1000),
  })
  .strict();
export type Archive = z.infer<typeof ArchiveSchema>;
export const differences = (a: Points, b: Points) =>
  axes.map((axis) => ({
    axis,
    label: labels[axis],
    before: a[axis],
    after: b[axis],
    delta: b[axis] - a[axis],
  }));
export function revision(original: Context, next: Context, plan: Candidate) {
  const points = differences(original.points, next.points).filter(
    (d) => d.delta !== 0,
  );
  const wishChanged = original.wish !== next.wish;
  const regions = [...points]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 2)
    .map((d) => {
      const variable = plan.variables.find((v) => v.axis === d.axis)!;
      return {
        area: variable.area,
        intention: d.delta > 0 ? variable.more : variable.less,
        axis: d.axis,
      };
    });
  if (wishChanged && !regions.length)
    regions.push({
      axis: "exploration",
      area: plan.variables.find((v) => v.axis === "exploration")!.area,
      intention: `在同一局部区域呼应新愿望：${next.wish}；保持既有隐喻。`,
    });
  return {
    points,
    wishChanged,
    oldWish: original.wish,
    newWish: next.wish,
    regions,
  };
}
export function validatePlan(plan: Candidate, context: Context) {
  const source = [
    context.self.description,
    context.self.keep,
    context.self.change,
    context.wish,
    ...context.self.tags,
  ];
  if (plan.sourceQuotes.some((q) => !source.some((s) => s.includes(q))))
    throw new Error("视觉方案引用了未提供的原话，请重新整理。");
  if (new Set(plan.variables.map((v) => v.axis)).size !== 4)
    throw new Error("视觉方案的选择变量不完整，请重试。");
  return plan;
}
export function summarize(self: Omit<Self, "description">) {
  return [
    self.tags.length ? `我倾向于${self.tags.join("、")}。` : "",
    self.keep ? `我想保留${self.keep}。` : "",
    self.change ? `我希望改变${self.change}。` : "",
  ]
    .filter(Boolean)
    .join("");
}
export const exampleSelf: Self = {
  tags: ["习惯独处", "喜欢尝试"],
  keep: "独处时在速写本里画画的习惯",
  change: "总把想去的地方留到以后",
  description:
    "我习惯独处，喜欢在速写本里画画。我想保留这份安静，也想改变总把想去的地方留到以后的习惯。",
};
export const exampleWish =
  "十年后，我想拥有自己的创作空间，也能定期到山里旅行。";
export const exampleStyle =
  "暖白与炭黑，少量酸橙绿；有触感的纸面，先锋时装摄影。";
const variables: Candidate["variables"] = [
  {
    axis: "career",
    area: "衣服的纸质褶层",
    less: "减轻衣服褶层的密度，保持既有轮廓",
    more: "在原来的衣服褶层内增加有秩序的纸面密度",
  },
  {
    axis: "relationships",
    area: "弧面内侧的连接处",
    less: "让内侧弧片留出更清晰的间隙",
    more: "让原有内侧弧片柔和相接，形成可以共享的座台",
  },
  {
    axis: "exploration",
    area: "画面右侧的弧形开口",
    less: "让房间的右侧弧面向内合拢",
    more: "沿原来的弧度向画外展开，露出远方地形",
  },
  {
    axis: "rest",
    area: "人物身侧的承托面",
    less: "略微收紧承托面的宽度",
    more: "将同一承托面拓宽，像柔软的纸面躺椅",
  },
];
export function examplePlans(context: Context): Candidate[] {
  const quotes = [
    context.self.keep || context.self.description,
    context.self.change || context.wish,
  ].map((s) => s.slice(0, 180));
  return [
    {
      id: "paper-room",
      title: "一间向远方展开的房间",
      sourceQuotes: quotes,
      qualities: [
        { trait: "保留安静", property: "向内包裹" },
        { trait: "容许探索", property: "向外延展" },
      ],
      impossibleObject:
        "一条纸瓷质地的巨大弧面，同时是房间、地面与远处的山脊。",
      spatialRule: "室内与远方地形占据同一张纸的两面。",
      clothing: "外套的纸质褶层延续弧面，少量酸橙绿里衬。",
      color: "暖白、炭黑，少量酸橙绿",
      material: "纸瓷、哑光织物",
      lighting: "干净的时装摄影柔光",
      variables,
      links: [
        {
          choice: "保留独处与画画",
          design: "包裹的纸面形成安静空间；手中的速写本保持日常动作。",
        },
        { choice: "为探索留出投入", design: "右侧弧面沿同一轮廓向远处展开。" },
      ],
    },
    {
      id: "folded-horizon",
      title: "把地平线折进日常",
      sourceQuotes: quotes,
      qualities: [
        { trait: "日常的秩序", property: "可折叠的边界" },
        { trait: "向外的好奇", property: "可伸展的地平线" },
      ],
      impossibleObject: "一条折成房间的纸质地平线，轻薄的表面承担建筑的重量。",
      spatialRule: "地平线越过人物身侧，成为可以倚靠的室内曲面。",
      clothing: "衣服用折页般的负空间回应地平线。",
      color: "暖白与冷灰，少量酸橙绿",
      material: "折纸、哑光陶瓷",
      lighting: "克制的编辑摄影光线",
      variables,
      links: [
        {
          choice: "日常仍然留在身边",
          design: "速写本和熟悉的站姿保持可辨认。",
        },
        {
          choice: "探索得到更大空间",
          design: "折叠的边界向画外伸展，设计意图是容纳新的路线。",
        },
      ],
    },
  ];
}

export function revisionLinks(
  original: Context,
  next: Context,
  plan: Candidate,
): Candidate["links"] {
  const change = revision(original, next, plan);
  return change.regions.map((r) => ({
    choice: change.points.length
      ? `${labels[r.axis]} ${original.points[r.axis]} → ${next.points[r.axis]}`
      : "愿望调整",
    design:
      r.intention.length > 220 ? r.intention.slice(0, 219) + "…" : r.intention,
  }));
}
