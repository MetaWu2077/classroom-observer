import mediapipe as mp
import numpy as np
import cv2
import os
import threading
import urllib.request

HAND_LANDMARKER_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/1/hand_landmarker.task"
)


def ensure_hand_landmarker_model() -> str:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    model_dir = os.path.join(base_dir, "models")
    os.makedirs(model_dir, exist_ok=True)
    model_path = os.path.join(model_dir, "hand_landmarker.task")
    if not os.path.exists(model_path):
        urllib.request.urlretrieve(HAND_LANDMARKER_URL, model_path)
    return model_path

class HandDetector:
    def __init__(self):
        self.backend = "none"
        self.hands = None
        self.hand_landmarker = None
        self.mp_landmark = None

        if hasattr(mp, "solutions") and hasattr(mp.solutions, "hands"):
            self.mp_hands = mp.solutions.hands
            self.mp_landmark = self.mp_hands.HandLandmark
            self.hands = self.mp_hands.Hands(
                static_image_mode=False,
                max_num_hands=10,
                min_detection_confidence=0.2,
                min_tracking_confidence=0.2,
            )
            self.backend = "solutions"
            return

        model_path = ensure_hand_landmarker_model()
        options = mp.tasks.vision.HandLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=model_path),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_hands=10,
            min_hand_detection_confidence=0.2,
            min_hand_presence_confidence=0.2,
            min_tracking_confidence=0.2,
        )
        self.hand_landmarker = mp.tasks.vision.HandLandmarker.create_from_options(options)
        self.backend = "tasks"

    def detect_raised_hands(self, frame: np.ndarray) -> tuple[int, list, int]:
        """检测举手动作

        Args:
            frame: BGR格式的图像帧

        Returns:
            (举手人数, 举手的位置列表, 检测到的手数)
        """
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        if self.backend == "solutions":
            result = self.hands.process(rgb)
            landmarks_sets = result.multi_hand_landmarks if result.multi_hand_landmarks else []
            if not landmarks_sets:
                # 兜底策略：当手较小或光线较差时，放大图像再尝试一次检测。
                enlarged = cv2.resize(rgb, None, fx=1.6, fy=1.6, interpolation=cv2.INTER_CUBIC)
                result = self.hands.process(enlarged)
                landmarks_sets = result.multi_hand_landmarks if result.multi_hand_landmarks else []
            get_landmark = lambda lms, idx: lms.landmark[idx]
            wrist_idx, index_tip_idx, middle_tip_idx, ring_tip_idx, pinky_tip_idx = (
                self.mp_landmark.WRIST,
                self.mp_landmark.INDEX_FINGER_TIP,
                self.mp_landmark.MIDDLE_FINGER_TIP,
                self.mp_landmark.RING_FINGER_TIP,
                self.mp_landmark.PINKY_TIP,
            )
        else:
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = self.hand_landmarker.detect(mp_image)
            landmarks_sets = result.hand_landmarks if result.hand_landmarks else []
            if not landmarks_sets:
                enlarged = cv2.resize(rgb, None, fx=1.6, fy=1.6, interpolation=cv2.INTER_CUBIC)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=enlarged)
                result = self.hand_landmarker.detect(mp_image)
                landmarks_sets = result.hand_landmarks if result.hand_landmarks else []
            get_landmark = lambda lms, idx: lms[idx]
            wrist_idx, index_tip_idx, middle_tip_idx, ring_tip_idx, pinky_tip_idx = (0, 8, 12, 16, 20)

        raised_hands = []
        detected_count = len(landmarks_sets)
        for idx, landmarks in enumerate(landmarks_sets):
            wrist = get_landmark(landmarks, wrist_idx)
            index_tip = get_landmark(landmarks, index_tip_idx)
            middle_tip = get_landmark(landmarks, middle_tip_idx)
            ring_tip = get_landmark(landmarks, ring_tip_idx)
            pinky_tip = get_landmark(landmarks, pinky_tip_idx)

            # 降低举手判定阈值：至少一个指尖高于手腕，即可认为有举手动作。
            finger_tips_above_wrist = sum(
                tip.y < (wrist.y - 0.01)
                for tip in [index_tip, middle_tip, ring_tip, pinky_tip]
            )
            if finger_tips_above_wrist >= 1:
                raised_hands.append(idx)

        return len(raised_hands), raised_hands, detected_count

_detector = None
_detector_lock = threading.Lock()

def get_detector():
    global _detector
    if _detector is None:
        # 多线程下加锁，避免首次并发请求重复初始化检测器。
        with _detector_lock:
            if _detector is None:
                _detector = HandDetector()
    return _detector

def detect_hands(frame_data: bytes) -> dict:
    """检测举手并统计总人数

    Args:
        frame_data: JPEG格式的图像数据

    Returns:
        {"raised_count": int, "positions": list, "detected_count": int, "total_count": int}
    """
    nparr = np.frombuffer(frame_data, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame is None:
        return {"raised_count": 0, "positions": [], "detected_count": 0, "total_count": 0, "error": "Invalid image frame"}

    detector = get_detector()
    raised_count, positions, detected_count = detector.detect_raised_hands(frame)

    # 同帧统计人脸数作为课堂总人数。人脸检测失败不应阻断举手结果。
    try:
        from face_detection import count_faces
        total_count = count_faces(frame)
    except Exception:
        total_count = 0

    return {
        "raised_count": raised_count,
        "positions": positions,
        "detected_count": detected_count,
        "total_count": total_count,
    }