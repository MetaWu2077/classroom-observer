"""YOLOv8-based person detection.

YOLOv8n person 检测,替代原 BlazeFace(对密集远景人脸无能)。
YOLOv8n 在 COCO 预训练,class 0 = person,对密集远景有显著更好的检测率。
"""
import os
import threading
import cv2
import numpy as np

try:
    from ultralytics import YOLO
except Exception as e:
    YOLO = None
    _IMPORT_ERROR = e
else:
    _IMPORT_ERROR = None


_MODEL_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "models",
    "yolov8n.pt",
)

_model = None
_model_lock = threading.Lock()


def get_model():
    """懒加载 YOLO 模型,多线程安全。"""
    global _model
    if YOLO is None:
        raise RuntimeError(
            f"ultralytics 未安装: {_IMPORT_ERROR}. 请运行: pip install ultralytics"
        )
    if _model is None:
        with _model_lock:
            if _model is None:
                _model = YOLO(_MODEL_PATH)
    return _model


def detect_persons(frame: np.ndarray, conf: float = 0.25):
    """返回画面中所有 person 的 (x1, y1, x2, y2) 边界框列表。

    Args:
        frame: BGR 图像
        conf: 置信度阈值
    """
    model = get_model()
    results = model(frame, classes=[0], conf=conf, verbose=False)
    boxes = []
    r = results[0]
    if r.boxes is None:
        return boxes
    for b in r.boxes:
        x1, y1, x2, y2 = b.xyxy[0].cpu().numpy().tolist()
        boxes.append((int(x1), int(y1), int(x2), int(y2)))
    return boxes
