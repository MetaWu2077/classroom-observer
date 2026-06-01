"""举手检测。

策略:
  1. YOLOv8 检测所有 person 框(课堂总人数 = person 数)
  2. 对每个 person 框,裁剪上半部(头部 + 手臂区域),用 MediaPipe Hands 检测手
  3. 若手部 wrist 关键点位于 person 框的上 30% 区域,记为举手
"""
import os
import threading
import urllib.request
import numpy as np
import cv2
import mediapipe as mp

from person_detector import detect_persons

# 兼容旧代码:仍保留 hand_landmarker.task 作为 MediaPipe Hands 模型
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


_hand_detector = None
_hand_lock = threading.Lock()


def get_hand_detector():
    """单例 MediaPipe HandLandmarker(tasks API),对每张图(IMAGE 模式)复用。"""
    global _hand_detector
    if _hand_detector is None:
        with _hand_lock:
            if _hand_detector is None:
                model_path = ensure_hand_landmarker_model()
                options = mp.tasks.vision.HandLandmarkerOptions(
                    base_options=mp.tasks.BaseOptions(model_asset_path=model_path),
                    running_mode=mp.tasks.vision.RunningMode.IMAGE,
                    num_hands=2,
                    min_hand_detection_confidence=0.2,
                    min_hand_presence_confidence=0.2,
                    min_tracking_confidence=0.2,
                )
                _hand_detector = mp.tasks.vision.HandLandmarker.create_from_options(
                    options
                )
    return _hand_detector


def _person_has_raised_hand(person_box, hand_landmarks) -> bool:
    """判断单个 person 框内检测到的手腕是否在 person 框的上 50% 区域(举手)。

    阈值放宽到 50% 是因为后排学生头部位置较低;只要手腕高于 person 框中线就算举手。
    """
    x1, y1, x2, y2 = person_box
    box_h = y2 - y1
    if box_h <= 0:
        return False
    raise_threshold_y = y1 + box_h * 0.50
    for hand in hand_landmarks:
        wrist = hand[0]
        wx = wrist.x * (x2 - x1) + x1
        wy = wrist.y * (y2 - y1) + y1
        if x1 <= wx <= x2 and wy < raise_threshold_y:
            return True
    return False


def detect_hands_in_person_crops(frame: np.ndarray, person_boxes, hand_detector) -> int:
    """对每个 person 框裁剪后跑 HandLandmarker,返回举手人数。"""
    raised = 0
    h, w = frame.shape[:2]
    for (x1, y1, x2, y2) in person_boxes:
        # 防越界
        x1c, y1c = max(0, x1), max(0, y1)
        x2c, y2c = min(w, x2), min(h, y2)
        if x2c - x1c < 8 or y2c - y1c < 8:
            continue
        crop = frame[y1c:y2c, x1c:x2c]
        rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = hand_detector.detect(mp_image)
        landmarks = result.hand_landmarks if result.hand_landmarks else []
        if _person_has_raised_hand((x1c, y1c, x2c, y2c), landmarks):
            raised += 1
    return raised


def detect_hands(frame_data: bytes) -> dict:
    """主入口:返回 {raised_count, total_count, positions, detected_count}。

    total_count = YOLO 检出的 person 数
    raised_count = 手腕在 person 框上 30% 区域的 person 数
    """
    nparr = np.frombuffer(frame_data, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame is None:
        return {
            "raised_count": 0,
            "positions": [],
            "detected_count": 0,
            "total_count": 0,
            "error": "Invalid image frame",
        }

    # 1. YOLO 找所有人(降低 conf 阈值以提高对后排/模糊人的检出率)
    try:
        person_boxes = detect_persons(frame, conf=0.15)
    except Exception as e:
        return {
            "raised_count": 0,
            "positions": [],
            "detected_count": 0,
            "total_count": 0,
            "error": f"person detect failed: {e}",
        }

    total_count = len(person_boxes)

    # 2. MediaPipe Hands 找举手
    raised_count = 0
    if total_count > 0:
        try:
            hand_detector = get_hand_detector()
            raised_count = detect_hands_in_person_crops(frame, person_boxes, hand_detector)
        except Exception as e:
            # 举手检测失败不应影响人数
            print(f"[hand detect warning] {e}")
            raised_count = 0

    return {
        "raised_count": raised_count,
        "positions": [b for b in person_boxes if b],  # 兼容旧字段,这里返回所有人框
        "detected_count": total_count,
        "total_count": total_count,
    }
