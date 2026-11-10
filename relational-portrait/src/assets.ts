import type { LayerId, Plan } from "./types";
const svg = (body: string, w = 1000, h = 700) =>
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`,
  );
export function createAssets(plan: Plan): Record<LayerId, string> {
  const sky = svg(
    `<defs><linearGradient id="s" x2="0" y2="1"><stop stop-color="${plan.palette}"/><stop offset=".7" stop-color="#eaf2f8"/><stop offset="1" stop-color="#f7f7ed"/></linearGradient><radialGradient id="m"><stop stop-color="#fdfef8"/><stop offset="1" stop-color="#f7fbff" stop-opacity=".8"/></radialGradient></defs><path fill="url(#s)" d="M0 0H1000V700H0Z"/><circle cx="744" cy="195" r="74" fill="url(#m)"/><path d="M0 515Q175 430 320 499T630 468T1000 500V700H0Z" fill="#cadbe9" opacity=".45"/><path d="M0 575Q200 500 400 560T1000 540V700H0Z" fill="#dce6ed" opacity=".6"/>`,
  );
  let windows = "";
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 3; j++)
      windows += `<path d="M${398 + j * 45} ${201 + i * 50}v-18a12 12 0 0 1 24 0v18z" fill="#89abc7" opacity="${0.35 + i * 0.04}"/>`;
  const building = svg(
    `<defs><linearGradient id="b"><stop stop-color="#f7faf6"/><stop offset="1" stop-color="#c1d0e4"/></linearGradient></defs><path d="M363 139l190 25v319l-190-12Z" fill="url(#b)"/><path d="M553 164l59-39v302l-59 56Z" fill="#a4b8d3"/><path d="M363 139l63-35 186 21-59 39Z" fill="#f8fcfb"/>${windows}<path d="M453 470v-49a21 21 0 0 1 42 0v55" fill="#6988b4"/><path d="M359 145v-8l194 25v9Z" fill="#fff"/><path d="M367 320l186 24v8l-186-24Z" fill="#fff" opacity=".7"/><path d="M184 536v-25h32v-26h32v-26h32v-26h32v-26h32v-26h33v-26h33v42h-24v26h-33v26h-32v26h-33v26h-32v26h-32v26h-32v25Z" fill="#e8eef1"/><path d="M184 536h33v-25h32v-26h32v-26h32v-26h33v-26h32v-26h32" fill="none" stroke="#8da7c7" stroke-width="3"/>`,
  );
  const arch = svg(
    `<defs><linearGradient id="a"><stop stop-color="#f4f8fb"/><stop offset="1" stop-color="#a4bfdf"/></linearGradient></defs><path d="M360 530V273a140 140 0 0 1 280 0v257h-60V273a80 80 0 0 0-160 0v257Z" fill="url(#a)"/><path d="M640 530l35-18V273a175 175 0 0 0-175-175v35a140 140 0 0 1 140 140Z" fill="#90a9cd"/>`,
  );
  const water = svg(
    `<defs><radialGradient id="w" cx=".45" cy=".25" r=".8"><stop stop-color="#d8eff0"/><stop offset=".4" stop-color="#a7c9e8"/><stop offset=".8" stop-color="#7e9cd8"/><stop offset="1" stop-color="#b5b8e8"/></radialGradient></defs><path d="M95 418C113 307 282 257 494 270s388 71 410 155c30 116-161 166-388 151S70 540 95 418Z" fill="#e7edf8"/><path d="M111 414C132 320 292 280 495 292s365 63 389 134c26 90-164 135-367 124S88 507 111 414Z" fill="url(#w)"/><ellipse cx="495" cy="411" rx="294" ry="65" fill="none" stroke="#edfaff" stroke-width="1.7" opacity=".65"/><path d="M199 420q180 71 422 21M349 364q145-29 309 12M632 467q75-5 117-20" fill="none" stroke="#e6faff" stroke-width="2" opacity=".7"/>`,
  );
  const fish = svg(
    `<defs><linearGradient id="f"><stop stop-color="#eef9fc"/><stop offset=".4" stop-color="#c5d8f6"/><stop offset=".75" stop-color="#2b5ce4"/><stop offset="1" stop-color="#102dd0"/></linearGradient></defs><path d="M77 100C118 30 226 27 277 99c-57 68-150 68-200 1L22 52l13 49-14 51Z" fill="url(#f)"/><path d="M160 48l37-31 18 30M155 147l38 22 15-22" fill="#7094ee" opacity=".8"/><path d="M109 99q73-31 132-4" stroke="#fff" fill="none" stroke-width="2" opacity=".75"/><circle cx="248" cy="91" r="3.5" fill="#2038a0"/>`,
    300,
    200,
  );
  const memento = svg(
    `<path d="M100 20l75 44v88l-75 45-75-45V64Z" fill="#d7e2f4"/><path d="M100 20v89l75-45M100 109v88L25 152V64Z" fill="#7798ed"/><path d="M100 109l75 43" stroke="#244ee1" stroke-width="2"/>`,
    200,
    210,
  );
  const connection = svg(
    `<path d="M60 500C170 100 310 650 500 300S750 280 950 120M80 560C270 580 280 210 570 400S740 570 955 245" stroke="#5f79d6" stroke-width="2" fill="none" opacity=".8"/>`,
  );
  return {
    background: sky,
    architecture: plan.architecture === "campus" ? building : arch,
    water,
    objects: plan.object === "fish" ? fish : memento,
    connections: connection,
  };
}
export const OCEAN_ASSET = svg(
  `<defs><linearGradient id="o" x2="0" y2="1"><stop stop-color="#d2edf2" stop-opacity=".1"/><stop offset=".4" stop-color="#a1c9e1"/><stop offset=".78" stop-color="#668edf" stop-opacity=".9"/><stop offset="1" stop-color="#668edf" stop-opacity="0"/></linearGradient></defs><path fill="url(#o)" d="M0 300Q220 265 440 290T1000 275V700H0Z"/><path d="M50 365q200-32 500-6t420-14M120 410q320-30 710 0M90 475q360 30 740-5" fill="none" stroke="#f4ffff" opacity=".65" stroke-width="2"/>`,
);
