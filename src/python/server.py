import os
import sys
import json
import threading

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, request, jsonify
from asr_service import transcribe
from hand_detection import detect_hands

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max request size

# 统计数据持久化到脚本同级 data/stats.json，进程重启不丢失。
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
STATS_FILE = os.path.join(DATA_DIR, "stats.json")
_stats_lock = threading.Lock()


def _load_stats():
    """从磁盘加载统计历史；文件不存在或损坏时返回空列表。"""
    if not os.path.exists(STATS_FILE):
        return []
    try:
        with open(STATS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def _save_stats(history):
    """将统计历史写回磁盘。调用方需持有 _stats_lock。"""
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp_path = STATS_FILE + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, STATS_FILE)


stats_history = _load_stats()

@app.route("/transcribe", methods=["POST"])
def api_transcribe():
    """语音转文字"""
    try:
        audio_data = request.json.get("audio_data")
        if not audio_data:
            return jsonify({"error": "No audio data provided"}), 400

        if len(audio_data) < 100:
            return jsonify({"error": "Audio data too small"}), 400

        import base64
        audio_bytes = base64.b64decode(audio_data)

        if len(audio_bytes) < 1000:
            return jsonify({"error": "Audio too short"}), 400

        text = transcribe(audio_bytes)
        return jsonify({"text": text})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/detect_hands", methods=["POST"])
def api_detect_hands():
    """检测举手"""
    try:
        frame_data = request.json.get("frame_data")
        if not frame_data:
            return jsonify({"error": "No frame data provided"}), 400

        import base64
        frame_bytes = base64.b64decode(frame_data)
        result = detect_hands(frame_bytes)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/stats", methods=["POST", "GET", "DELETE"])
def api_stats():
    """统计相关"""
    global stats_history

    if request.method == "POST":
        try:
            data = request.json
            record = {
                "id": data.get("id", ""),
                "timestamp": data.get("timestamp", ""),
                "question": data.get("question", ""),
                "total_count": data.get("total_count", 0),
                "raised_count": data.get("raised_count", 0),
            }
            record["ratio"] = (record["raised_count"] / record["total_count"]) if record["total_count"] > 0 else 0
            with _stats_lock:
                stats_history.append(record)
                _save_stats(stats_history)
            return jsonify({"status": "ok", "record": record})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    elif request.method == "GET":
        with _stats_lock:
            return jsonify({"history": list(stats_history)})

    elif request.method == "DELETE":
        with _stats_lock:
            stats_history.clear()
            _save_stats(stats_history)
        return jsonify({"status": "ok"})

if __name__ == "__main__":
    # threaded=True：举手检测请求不会被较慢的 Whisper 转写阻塞。
    app.run(host="127.0.0.1", port=28765, debug=False, threaded=True)
