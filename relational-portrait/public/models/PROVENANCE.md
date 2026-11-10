# Pose model

`pose_landmarker_lite.task` is the MediaPipe Pose Landmarker Lite model bundle (5,777,746 bytes).

Official model URL:
https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task

This workspace cannot reach the Google Storage domain. The binary was obtained from the published npm tarball `expo-pose-landmarker@0.1.1`, path `android/src/main/assets/pose_landmarker_lite.task`, without installing or executing the package. Its bytes were independently compared to `pose-landmarker-react-native@0.1.0`, path `android/src/main/assets/models/pose_landmarker_lite.task`: the hashes match.

SHA-256: `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`

Archive members: `pose_detector.tflite`, `pose_landmarks_detector.tflite`.
MediaPipe / Google model: Apache License 2.0. See LICENSE.txt. The wrapper packages are not application dependencies. Camera frames are processed locally.

# Face model

`face_landmarker.task`: MediaPipe Face Landmarker with blendshapes, 3,758,596 bytes.
Official model URL: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

Google Storage is inaccessible from this workspace. The bundle was extracted without executing wrapper code from the npm tarball `ugx-face-liveness@2.7.2`, `package/assets/models-v2/face_landmarker.task`. The wrapper is not a dependency and none of its liveness code is used. SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`.

Bundle entries: `face_detector.tflite`, `face_landmarks_detector.tflite`, `geometry_pipeline_metadata_landmarks.binarypb`, `face_blendshapes.tflite`. MediaPipe / Google model, Apache License 2.0 (LICENSE.txt). The pinned bundle is checked before loading; browser inference is tested separately. Face frames and landmarks are never exported.
