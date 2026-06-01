import mediapipe as mp
import numpy as np
import cv2
import os
import threading
import urllib.request

# BlazeFace 短距离人脸检测模型（适合摄像头近距离场景），首次运行自动下载。
FACE_DETECTOR_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_detector/"
    "blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
)


def ensure_face_detector_model() -> str:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    model_dir = os.path.join(base_dir, "models")
    os.makedirs(model_dir, exist_ok=True)
    model_path = os.path.join(model_dir, "blaze_face_short_range.tflite")
    if not os.path.exists(model_path):
        urllib.request.urlretrieve(FACE_DETECTOR_URL, model_path)
    return model_path


class FaceCounter:
    def __init__(self):
        model_path = ensure_face_detector_model()
        options = mp.tasks.vision.FaceDetectorOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=model_path),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            min_detection_confidence=0.3,
        )
        self.detector = mp.tasks.vision.FaceDetector.create_from_options(options)

    def count_faces(self, frame: np.ndarray) -> int:
        """统计画面中的人脸数量，作为课堂总人数。

        Args:
            frame: BGR 格式图像帧

        Returns:
            人脸数量
        """
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = self.detector.detect(mp_image)
        return len(result.detections) if result.detections else 0


_counter = None
_counter_lock = threading.Lock()


def get_face_counter():
    global _counter
    if _counter is None:
        # 多线程下加锁，避免首次并发请求重复初始化检测器。
        with _counter_lock:
            if _counter is None:
                _counter = FaceCounter()
    return _counter


def count_faces(frame: np.ndarray) -> int:
    return get_face_counter().count_faces(frame)
