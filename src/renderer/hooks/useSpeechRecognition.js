import { useState, useRef, useCallback, useEffect } from "react";

// Whisper 中文常输出繁体，且会夹带语气词。匹配策略：
//   1) 关键词按“字”拆成等价类（简体/繁体/常见同音字归为一类）
//   2) 在归一化文本里做“模糊子序列匹配”——关键字按顺序出现即可，
//      相邻关键字之间允许夹最多 KEYWORD_GAP 个其他字（容忍语气词）。
const KEYWORD_GAP = 2;

// 每个目标字的可接受变体（简体 + 繁体 + 常见同音误识）。
const EQUIV = {
  做: ["做", "作", "坐", "佐", "座"],
  个: ["个", "個", "各", "格", "歌"],
  统: ["统", "統", "通", "桶", "同"],
  计: ["计", "計", "记", "記", "济", "继", "級", "级", "及"],
  好: ["好", "号", "號", "豪", "毫"],
  的: ["的", "得", "地", "嘚"],
  放: ["放", "房", "防", "芳"],
  下: ["下", "夏", "吓", "嚇"],
};

function toClasses(chars) {
  return chars.map((c) => new Set(EQUIV[c] || [c]));
}

const START_CLASSES = toClasses(["做", "个", "统", "计"]); // 做个统计
const STOP_CLASSES = toClasses(["好", "的", "放", "下"]); // 好的放下

// 每段录音时长。越短越实时，但太短 Whisper 中文识别质量差；3.5s 折中。
const WINDOW_MS = 3500;
// 转写队列上限：Whisper 跟不上时丢弃最旧的，避免延迟无限累积。
const MAX_QUEUE = 2;

// 去掉空格、标点和常见语气词，降低干扰。
const FILLER = /[\s，。、！？,.!?；;：:~～·啊呀呢吧嘛哦噢喔嗯额呃哈]/g;

function normalize(text) {
  return (text || "").replace(FILLER, "");
}

/**
 * 模糊子序列匹配：在 text 中寻找第一处满足 classes 顺序的子串。
 * 相邻关键字之间允许最多 maxGap 个无关字符。
 * @returns {{start:number,end:number}|null} 命中区间（end 为最后一个关键字之后的位置）
 */
function fuzzyFind(text, classes, maxGap) {
  for (let i = 0; i < text.length; i++) {
    if (!classes[0].has(text[i])) continue;
    let last = i;
    let ok = true;
    for (let k = 1; k < classes.length; k++) {
      let found = -1;
      const limit = Math.min(text.length - 1, last + 1 + maxGap);
      for (let j = last + 1; j <= limit; j++) {
        if (classes[k].has(text[j])) {
          found = j;
          break;
        }
      }
      if (found === -1) {
        ok = false;
        break;
      }
      last = found;
    }
    if (ok) return { start: i, end: last + 1 };
  }
  return null;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        resolve(reader.result.split(",")[1]);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 实时语音状态机（分块录音 + 后端 Whisper 转写，兼容 Electron）：
 *   off       —— 开关关闭
 *   listening —— 等待“做个统计”，文本框灰字显示实时识别内容
 *   capturing —— 已侦测到“做个统计”，采集问题，直到“好的放下”
 */
export default function useSpeechRecognition(onCapture) {
  const [enabled, setEnabled] = useState(false);
  const [phase, setPhase] = useState("off");
  const [liveText, setLiveText] = useState("");
  const [heardText, setHeardText] = useState(""); // 最近识别到的原文（聆听态显示，便于排查）
  const [supported, setSupported] = useState(true);

  const enabledRef = useRef(false);
  const phaseRef = useRef("off");
  const transcriptRef = useRef("");
  const streamRef = useRef(null);
  const queueRef = useRef([]);
  const inFlightRef = useRef(false);
  const onCaptureRef = useRef(onCapture);

  useEffect(() => {
    onCaptureRef.current = onCapture;
  }, [onCapture]);

  const setPhaseBoth = useCallback((p) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  // 基于累积文本 transcriptRef 驱动状态机。
  const process = useCallback(() => {
    transcriptRef.current = normalize(transcriptRef.current);

    if (phaseRef.current === "listening") {
      const hit = fuzzyFind(transcriptRef.current, START_CLASSES, KEYWORD_GAP);
      if (hit) {
        // 进入采集态，保留关键词之后的内容作为问题开头。
        transcriptRef.current = transcriptRef.current.slice(hit.end);
        setPhaseBoth("capturing");
        setLiveText(transcriptRef.current);
      } else {
        // 仅保留尾部，避免缓冲无限增长。
        if (transcriptRef.current.length > 60) {
          transcriptRef.current = transcriptRef.current.slice(-40);
        }
        return;
      }
    }

    if (phaseRef.current === "capturing") {
      const cnorm = transcriptRef.current;
      const hit = fuzzyFind(cnorm, STOP_CLASSES, KEYWORD_GAP);
      if (hit) {
        const question = cnorm.slice(0, hit.start).trim();
        setPhaseBoth("listening");
        setLiveText("");
        transcriptRef.current = "";
        if (question && onCaptureRef.current) {
          onCaptureRef.current(question);
        }
      } else {
        setLiveText(cnorm);
      }
    }
  }, [setPhaseBoth]);

  const drain = useCallback(async () => {
    if (inFlightRef.current) return;
    const blob = queueRef.current.shift();
    if (!blob) return;

    inFlightRef.current = true;
    try {
      const base64 = await blobToBase64(blob);
      const res = await window.api.transcribe(base64);
      if (res && res.text) {
        const text = res.text.trim();
        console.debug("[ASR]", text);
        setHeardText(text); // 始终把最近识别原文显示出来，便于排查
        transcriptRef.current += text;
        process();
      } else if (res && res.error) {
        console.warn("[ASR error]", res.error);
        setHeardText("（识别失败：" + res.error + "）");
      }
    } catch (err) {
      console.error("transcribe error:", err);
    } finally {
      inFlightRef.current = false;
      if (queueRef.current.length) drain();
    }
  }, [process]);

  const recordOnce = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !enabledRef.current) return;

    let rec;
    try {
      rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
    } catch (e) {
      rec = new MediaRecorder(stream);
    }
    const chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      if (enabledRef.current) recordOnce(); // 立即开启下一段，缩小录音间隙
      const blob = new Blob(chunks, { type: "audio/webm" });
      if (blob.size > 2000) {
        queueRef.current.push(blob);
        if (queueRef.current.length > MAX_QUEUE) queueRef.current.shift();
        drain();
      }
    };

    rec.start();
    setTimeout(() => {
      if (rec.state === "recording") {
        try {
          rec.stop();
        } catch (e) {
          /* ignore */
        }
      }
    }, WINDOW_MS);
  }, [drain]);

  const toggle = useCallback(async () => {
    if (enabledRef.current) {
      enabledRef.current = false;
      setEnabled(false);
      setPhaseBoth("off");
      setLiveText("");
      setHeardText("");
      transcriptRef.current = "";
      queueRef.current = [];
      const s = streamRef.current;
      if (s) {
        s.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    } else {
      if (!window.MediaRecorder || !navigator.mediaDevices) {
        setSupported(false);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        enabledRef.current = true;
        setEnabled(true);
        setPhaseBoth("listening");
        transcriptRef.current = "";
        queueRef.current = [];
        recordOnce();
      } catch (err) {
        console.error("麦克风开启失败:", err);
        setSupported(false);
      }
    }
  }, [recordOnce, setPhaseBoth]);

  useEffect(() => {
    return () => {
      enabledRef.current = false;
      const s = streamRef.current;
      if (s) s.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { enabled, phase, liveText, heardText, supported, toggle };
}
