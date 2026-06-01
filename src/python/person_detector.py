"""YOLOv8-based person detection with NMS.

替代原来的 face_detection(BlazeFace short_range 对大合影的密集小脸无能)。
YOLOv8n + imgsz=1280 在密集远景的召回率比 640 高 2-3 倍,且延迟仍 < 200ms。
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

# imgsz=1280 是关键:让小脸/小头在神经网络输入中占更大比例
IMGSZ = 1280
# 置信度阈值放宽到 0.15,捕获后排模糊人
CONF = 0.15
# NMS IoU 阈值 0.35(密集场景下默认 0.7 太松,会保留大量重叠框)
NMS_IOU = 0.35

_model = None
_model_lock = threading.Lock()


def get_model():
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


def _nms(boxes, scores, iou_thr):
    if len(boxes) == 0:
        return []
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(int(i))
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        w = np.maximum(0.0, xx2 - xx1)
        h = np.maximum(0.0, yy2 - yy1)
        inter = w * h
        iou = inter / (areas[i] + areas[order[1:]] - inter + 1e-9)
        inds = np.where(iou <= iou_thr)[0]
        order = order[inds + 1]
    return keep


def detect_persons(frame: np.ndarray, conf: float = CONF, imgsz: int = IMGSZ):
    """返回画面中所有 person 的 (x1, y1, x2, y2) 边界框列表(已 NMS 去重)。

    Args:
        frame: BGR 图像
        conf: 置信度阈值
        imgsz: 神经网络输入尺寸(默认 1280,大合影用更大值召回率高)
    """
    model = get_model()
    results = model(frame, classes=[0], conf=conf, imgsz=imgsz, verbose=False)
    r = results[0]
    if r.boxes is None or len(r.boxes) == 0:
        return []
    boxes = r.boxes.xyxy.cpu().numpy()
    scores = r.boxes.conf.cpu().numpy()
    keep = _nms(boxes, scores, NMS_IOU)
    out = []
    for i in keep:
        x1, y1, x2, y2 = boxes[i].tolist()
        out.append((int(x1), int(y1), int(x2), int(y2)))
    return out
