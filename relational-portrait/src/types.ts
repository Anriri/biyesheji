export type Phase = "memory" | "portrait" | "interaction" | "future" | "final";
export type LayerId =
  | "background"
  | "architecture"
  | "water"
  | "objects"
  | "connections";
export interface Participant {
  id: string;
  name: string;
  memory: string;
  future: string;
  memoryTags: string[];
  futureTags: string[];
}
export interface Layer {
  id: LayerId;
  name: string;
  x: number;
  y: number;
  z: number;
  scale: number;
  opacity: number;
  visible: boolean;
  custom?: string;
}
export interface Signals {
  proximity: number;
  synchrony: number;
  hands: number;
  expression: number;
}
export interface Frame {
  t: number;
  signals: Signals;
  source: "manual" | "camera";
  bodies?: BodyPosition[];
}
export interface BodyPosition {
  x: number;
  y: number;
}
export interface Plan {
  tags: string[];
  palette: string;
  environment: "pond" | "ocean" | "landscape";
  architecture: "campus" | "arch";
  object: "fish" | "memento";
  seed: number;
}
export interface Artwork {
  format: "relational-portrait";
  version: 1;
  title: string;
  participants: Participant[];
  layers: Layer[];
  plan: Plan;
  futurePlan: Plan | null;
  futureAt: number | null;
  frames: Frame[];
  duration: number;
  createdAt: string;
}
export const DEFAULT_SIGNALS: Signals = {
  proximity: 0.45,
  synchrony: 0.3,
  hands: 0.12,
  expression: 0.35,
};
export const DEFAULT_LAYERS: Layer[] = [
  {
    id: "background",
    name: "Sky & distance",
    x: 0,
    y: 0,
    z: -4,
    scale: 1,
    opacity: 1,
    visible: true,
  },
  {
    id: "architecture",
    name: "Campus fragments",
    x: 0,
    y: 0,
    z: -1.3,
    scale: 1,
    opacity: 1,
    visible: true,
  },
  {
    id: "water",
    name: "Memory pool",
    x: 0,
    y: 0,
    z: 0.2,
    scale: 1,
    opacity: 0.95,
    visible: true,
  },
  {
    id: "objects",
    name: "Fish & objects",
    x: 0,
    y: 0,
    z: 1.1,
    scale: 1,
    opacity: 1,
    visible: true,
  },
  {
    id: "connections",
    name: "Relational traces",
    x: 0,
    y: 0,
    z: 0.6,
    scale: 1,
    opacity: 0.75,
    visible: true,
  },
];
export const DEFAULT_PARTICIPANTS: Participant[] = [
  {
    id: "p1",
    name: "Participant A",
    memory: "We used to sit beside the campus pond on summer evenings.",
    future: "I hope we can travel to the ocean together.",
    memoryTags: ["Campus", "Pond", "Summer", "Companionship", "Nostalgia"],
    futureTags: [],
  },
  {
    id: "p2",
    name: "Participant B",
    memory:
      "I remember watching the fish and walking through the university corridors together.",
    future: "I want to return to our university someday.",
    memoryTags: ["Campus", "Fish", "Corridor", "Companionship", "Nostalgia"],
    futureTags: [],
  },
];
