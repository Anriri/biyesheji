import {cp,mkdir,rm} from 'node:fs/promises';
await rm('public/vision/wasm',{recursive:true,force:true});
await mkdir('public/vision',{recursive:true});
await cp('node_modules/@mediapipe/tasks-vision/wasm','public/vision/wasm',{recursive:true});
console.log('MediaPipe WASM copied locally. Pose model: public/models/pose_landmarker_lite.task');
