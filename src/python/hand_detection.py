"""举手 + 人数检测。

策略:
  1. YOLOv8(imgsz=1280, conf=0.15, NMS=0.35) 检 person → 总人数
  2. 对每个 person 框:
     - 裁出上 40% (头部 + 举手区) 与中 35% (躯干区) 两个色块
     - 计算两个区域的「肤色像素比例」
     - upper 显著高于 middle(举手时头部上方露出更多肤色/亮色手部)→ 举手

MediaPipe Hands 路径保留作为可选回退(对小尺寸手不擅长,默认禁用)。
"""
import os
import threading
import urllib.request
import numpy as np
import cv2

from person_detector import detect_persons

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
    """MediaPipe HandLandmarker 单例(密集教室场景下不擅长,默认未启用)"""
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


def _skin_mask(rgb):
    """肤色掩码 + 亮色衣物(白 T 恤在举手时也常见)
    YCrCb 双范围肤色 + HSV 亮色衣物掩码。
    """
    ycrcb = cv2.cvtColor(rgb, cv2.COLOR_RGB2YCrCb)
    m1 = cv2.inRange(ycrcb, (0, 133, 77), (255, 173, 127))
    m2 = cv2.inRange(ycrcb, (0, 120, 60), (255, 180, 135))
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    m3 = cv2.inRange(hsv, (0, 0, 200), (180, 60, 255))
    return (m1 | m2 | m3) > 0


def _person_raised_by_skin(bgr_crop, box_h):
    """根据 person 框内肤色/亮色像素分布判断举手。

    举手时,头部上方会有一块与躯干颜色明显不同的肤色/白色手部。
    """
    upper = bgr_crop[0:int(box_h * 0.40)]
    middle = bgr_crop[int(box_h * 0.40):int(box_h * 0.75)]
    if upper.size == 0 or middle.size == 0:
        return False, 0.0, 0.0
    u_mask = _skin_mask(cv2.cvtColor(upper, cv2.COLOR_BGR2RGB))
    m_mask = _skin_mask(cv2.cvtColor(middle, cv2.COLOR_BGR2RGB))
    u_ratio = float(u_mask.sum()) / u_mask.size
    m_ratio = float(m_mask.sum()) / m_mask.size
    return (u_ratio - m_ratio) > 0.08 and u_ratio > 0.18, u_ratio, m_ratio


def _person_raised_by_mediapipe(bgr_crop, hand_detector):
    """回退方案:MediaPipe Hands 检测手腕是否在 person 框上半"""
    rgb = cv2.cvtColor(bgr_crop, cv2.COLOR_BGR2RGB)
    import mediapipe as mp
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = hand_detector.detect(mp_image)
    if not result.hand_landmarks:
        return False
    h, w, _ = bgr_crop.shape
    threshold_y = h * 0.50
    for hand in result.hand_landmarks:
        wrist = hand[0]
        if wrist.y * h < threshold_y:
            return True
    return False


def detect_hands(frame_data: bytes) -> dict:
    """主入口。

    Returns:
        {
          raised_count: int,  # 举手人数
          positions: list,    # person 框
          detected_count: int,
          total_count: int,    # YOLO person 总数
        }
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

    # 1. YOLO 找所有 person
    try:
        person_boxes = detect_persons(frame)
    except Exception as e:
        return {
            "raised_count": 0,
            "positions": [],
            "detected_count": 0,
            "total_count": 0,
            "error": f"person detect failed: {e}",
        }

    total_count = len(person_boxes)

    # 2. 肤色举手判定
    raised_count = 0
    h, w = frame.shape[:2]
    for (x1, y1, x2, y2) in person_boxes:
        x1c, y1c = max(0, x1), max(0, y1)
        x2c, y2c = min(w, x2), min(h, y2)
        if x2c - x1c < 20 or y2c - y1c < 20:
            continue
        crop = frame[y1c:y2c, x1c:x2c]
        is_raised, _, _ = _person_raised_by_skin(crop, y2c - y1c)
        if is_raised:
            raised_count += 1

    return {
        "raised_count": raised_count,
        "positions": [b for b in person_boxes if b],
        "detected_count": total_count,
        "total_count": total_count,
    }
