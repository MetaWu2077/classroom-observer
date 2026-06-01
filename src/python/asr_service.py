import tempfile
import os
import shutil
import subprocess
import threading
import numpy as np

try:
    import whisper
    _WHISPER_IMPORT_ERROR = None
except Exception as e:
    whisper = None
    _WHISPER_IMPORT_ERROR = e

_model = None
_model_lock = threading.Lock()
_ffmpeg_checked = False
_ffmpeg_exe = None

def ensure_ffmpeg_available():
    global _ffmpeg_checked, _ffmpeg_exe
    if _ffmpeg_checked:
        return _ffmpeg_exe

    system_ffmpeg = shutil.which("ffmpeg")
    if system_ffmpeg:
        _ffmpeg_exe = system_ffmpeg
        _ffmpeg_checked = True
        return _ffmpeg_exe

    try:
        import imageio_ffmpeg

        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        if os.path.exists(ffmpeg_exe):
            _ffmpeg_exe = ffmpeg_exe
    except Exception:
        pass

    if not _ffmpeg_exe:
        raise RuntimeError(
            "FFmpeg not found. Please install FFmpeg or run: pip install imageio-ffmpeg"
        )

    _ffmpeg_checked = True
    return _ffmpeg_exe


def load_audio_with_ffmpeg(audio_path: str, ffmpeg_exe: str, sample_rate: int = 16000):
    cmd = [
        ffmpeg_exe,
        "-nostdin",
        "-threads", "0",
        "-i", audio_path,
        "-f", "s16le",
        "-ac", "1",
        "-acodec", "pcm_s16le",
        "-ar", str(sample_rate),
        "-",
    ]

    try:
        out = subprocess.run(cmd, capture_output=True, check=True).stdout
    except subprocess.CalledProcessError as e:
        stderr = e.stderr.decode(errors="ignore")
        raise RuntimeError(f"Failed to load audio: {stderr}") from e

    return np.frombuffer(out, np.int16).flatten().astype(np.float32) / 32768.0

def get_model():
    global _model
    if _WHISPER_IMPORT_ERROR is not None or whisper is None:
        raise RuntimeError(
            f"Whisper dependency unavailable: {_WHISPER_IMPORT_ERROR}. "
            "Please use Python 3.11/3.12 and reinstall dependencies."
        )
    if _model is None:
        # 多线程下加锁，避免首次并发请求重复加载模型。
        with _model_lock:
            if _model is None:
                _model = whisper.load_model("base")
    return _model

def transcribe(audio_bytes: bytes) -> str:
    """将音频数据转录为文字

    Args:
        audio_bytes: raw audio bytes (wav, webm or ogg format)

    Returns:
        转录文本
    """
    ffmpeg_exe = ensure_ffmpeg_available()
    model = get_model()

    # Detect format from first bytes
    if audio_bytes[:4] == b'RIFF':
        suffix = '.wav'
    elif audio_bytes[:4] == b'OggS':
        suffix = '.ogg'
    elif audio_bytes[:4] == b'fLaC':
        suffix = '.flac'
    else:
        suffix = '.webm'

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(audio_bytes)
        temp_path = f.name

    try:
        audio = load_audio_with_ffmpeg(temp_path, ffmpeg_exe)
        result = model.transcribe(audio, language="zh")
        return result["text"]
    except FileNotFoundError as e:
        raise RuntimeError(
            f"语音识别依赖缺失：{e}. 请安装 FFmpeg（或 pip install imageio-ffmpeg）"
        ) from e
    finally:
        os.unlink(temp_path)