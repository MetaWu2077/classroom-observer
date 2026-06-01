import React, { useRef, useEffect, useCallback, useState } from "react";

// 每张测试图停留时间(含多帧稳化时间),改慢便于观察
const TEST_INTERVAL_MS = 3000;
// 每张图前先连发 N 帧让模型稳定(同一图重复检测,取最后几帧的稳定值)
const FRAMES_BEFORE_ADVANCE = 5;
// 单帧检测间隔(同一图内)
const FRAME_INTERVAL_MS = 600;

// 将图片 URL/路径转 base64（与摄像头帧走相同的 detectHands 通道）
async function fetchImageAsBase64(src) {
  const res = await fetch(src);
  if (!res.ok) throw new Error("fetch image failed: " + res.status);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        resolve(reader.result.split(",")[1]);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function CameraView({
  raisedCount,
  totalCount,
  onRaisedCountChange,
  onTotalCountChange,
  testImages, // 非空则进入测试模式：每 1.5s 轮播一项
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const testTimerRef = useRef(null);
  const frameCounterRef = useRef(0);
  const [testIndex, setTestIndex] = useState(0);
  // 用一个递增 tick 强制重渲染(同一张图内每帧更新)
  const [testTick, setTestTick] = useState(0);

  // 摄像头模式：抓帧 → 后端
  const detectFromCamera = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result.split(",")[1];
        try {
          const result = await window.api.detectHands(base64);
          if (result.raised_count !== undefined) {
            onRaisedCountChange(result.raised_count);
          }
          if (result.total_count !== undefined && onTotalCountChange) {
            onTotalCountChange(result.total_count);
          }
        } catch (err) {
          console.error("Detection error:", err);
        }
      };
      reader.readAsDataURL(blob);
    }, "image/jpeg");
  }, [onRaisedCountChange, onTotalCountChange]);

  // 测试模式：按当前 testIndex 取一张图发后端,然后推进
  const detectFromTestImage = useCallback(
    async (idx) => {
      if (!testImages || testImages.length === 0) return;
      const item = testImages[idx % testImages.length];
      const src = typeof item === "string" ? item : item?.src;
      if (!src) return;
      try {
        const base64 = await fetchImageAsBase64(src);
        const result = await window.api.detectHands(base64);
        if (result.raised_count !== undefined) {
          onRaisedCountChange(result.raised_count);
        }
        if (result.total_count !== undefined && onTotalCountChange) {
          onTotalCountChange(result.total_count);
        }
      } catch (err) {
        console.error("Test image detect error:", err);
      }
    },
    [testImages, onRaisedCountChange, onTotalCountChange]
  );

  useEffect(() => {
    // 测试模式：不开摄像头,直接轮播图片(每张停留 TEST_INTERVAL_MS,期间连发多帧让模型稳定)
    if (testImages && testImages.length > 0) {
      setTestIndex(0);
      frameCounterRef.current = 0;
      setTestTick(0);
      // 立即对第一张图发一帧
      detectFromTestImage(0);
      // 帧间定时器
      frameIntervalRef.current = setInterval(() => {
        frameCounterRef.current += 1;
        if (frameCounterRef.current >= FRAMES_BEFORE_ADVANCE) {
          // 切换到下一张
          frameCounterRef.current = 0;
          setTestIndex((prev) => (prev + 1) % testImages.length);
        } else {
          // 同一张图再发一帧(用 setTestTick 强制重渲染,显示当前帧数)
          detectFromTestImage(testIndex);
          setTestTick((t) => t + 1);
        }
      }, FRAME_INTERVAL_MS);
      return () => {
        if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
      };
    }

    // 摄像头模式
    let stream;
    const initCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        frameIntervalRef.current = setInterval(detectFromCamera, 500);
      } catch (err) {
        console.error("Failed to access camera:", err);
      }
    };
    initCamera();
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    };
  }, [detectFromCamera, detectFromTestImage, testImages]);

  const isTestMode = testImages && testImages.length > 0;
  const currentTestItem = isTestMode
    ? testImages[testIndex % testImages.length]
    : null;
  const currentSrc =
    typeof currentTestItem === "string"
      ? currentTestItem
      : currentTestItem?.src;

  return (
    <div className="camera-view">
      {isTestMode ? (
        <img
          className="test-image"
          src={currentSrc}
          alt="test classroom"
          key={currentSrc}
        />
      ) : (
        <video ref={videoRef} autoPlay playsInline muted />
      )}
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <div className="overlay">
        <div className="count-badge total-badge">总人数: {totalCount}</div>
        <div className="raised-count-badge">举手: {raisedCount}</div>
        {isTestMode && currentTestItem && typeof currentTestItem !== "string" ? (
          <div className="test-mode-badge">
            测试 {testIndex + 1}/{testImages.length} · 实际{" "}
            {currentTestItem.students}人 / 举手 {currentTestItem.raised} · 帧
            {frameCounterRef.current + 1}/{FRAMES_BEFORE_ADVANCE}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default CameraView;
