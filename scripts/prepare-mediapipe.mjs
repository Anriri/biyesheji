import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'node_modules/@mediapipe/hands');
const destination = path.join(root, 'public/mediapipe/hands');
await mkdir(destination, { recursive: true });
let copied = 0;
for (const name of await readdir(source)) {
  if (!/\.(js|wasm|data|tflite|binarypb)$/.test(name)) continue;
  const from = path.join(source, name);
  const to = path.join(destination, name);
  const original = await stat(from);
  const current = await stat(to).catch(() => null);
  if (!current || current.size !== original.size || current.mtimeMs < original.mtimeMs) {
    await cp(from, to);
    copied++;
  }
}
console.log(`MediaPipe 本地资源就绪（更新 ${copied} 个文件）。`);
