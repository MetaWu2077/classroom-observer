import React, { useRef, useEffect, useCallback, useState } from "react";

// 测试模式节奏(放慢,留出足够时间给后端推理 + UI 观察)
// 每张图连续检测 N 帧,每帧间隔 FRAME_MS 毫秒
// 每张图总停留时间 ≈ FRAMES_PER_IMAGE * FRAME_MS
const FRAMES_PER_IMAGE = 2;
const FRAME_MS = 6000; // 单帧间隔,大图(MediaPipe 推理 + IPC 读 6MB PNG)需要时间

// 测试图源改成普通路径字符串数组(IPC 读),不再依赖 fetch(file://)
async function readImageAsDataUrl(path) {
  return await window.api.readLocalFile(path);
}

function CameraView({
  raisedCount,
  totalCount,
  onRaisedCountChange,
  onTotalCountChange,
  testImages, // 非空则进入测试模式：依次轮播每张图,每张多帧稳化
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const [testIndex, setTestIndex] = useState(0);
  const [testFrame, setTestFrame] = useState(0); // 0..FRAMES_PER_IMAGE-1
  const [imageDataUrl, setImageDataUrl] = useState(""); // 当前测试图 data URL
  const [imageError, setImageError] = useState("");

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

  // 测试模式：单次检测当前图
  const detectOnce = useCallback(
    async (item) => {
      const path = typeof item === "string" ? item : item?.path || item?.src;
      if (!path) return;
      try {
        const dataUrl = await readImageAsDataUrl(path);
        // 第一次加载时更新显示图
        setImageDataUrl((prev) => prev || dataUrl);
        setImageError("");
        const base64 = dataUrl.split(",")[1];
        const result = await window.api.detectHands(base64);
        if (result.raised_count !== undefined) {
          onRaisedCountChange(result.raised_count);
        }
        if (result.total_count !== undefined && onTotalCountChange) {
          onTotalCountChange(result.total_count);
        }
      } catch (err) {
        console.error("Test image detect error:", err);
        setImageError(String(err.message || err));
      }
    },
    [onRaisedCountChange, onTotalCountChange]
  );

  useEffect(() => {
    // 测试模式
    if (testImages && testImages.length > 0) {
      const isTestObjects = typeof testImages[0] === "object";
      let mounted = true;
      let timer = null;

      const run = async (idx, frame) => {
        if (!mounted) return;
        const item = testImages[idx];
        // 当图序号变化时,加载新图
        if (frame === 0) {
          setImageDataUrl("");
          setTestFrame(0);
          try {
            const dataUrl = await readImageAsDataUrl(
              isTestObjects ? item.path : item
            );
            if (mounted) {
              setImageDataUrl(dataUrl);
              setImageError("");
            }
          } catch (err) {
            if (mounted) setImageError(String(err.message || err));
            return;
          }
        }
        // 检测一帧
        await detectOnce(item);
        if (!mounted) return;
        setTestFrame(frame);
        // 决定下一帧
        if (frame + 1 < FRAMES_PER_IMAGE) {
          // 同一图下一帧
          timer = setTimeout(() => run(idx, frame + 1), FRAME_MS);
        } else {
          // 切换到下一图
          timer = setTimeout(
            () => run((idx + 1) % testImages.length, 0),
            FRAME_MS
          );
          if (mounted) {
            setTestIndex((idx + 1) % testImages.length);
          }
        }
      };

      run(0, 0);

      return () => {
        mounted = false;
        if (timer) clearTimeout(timer);
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
  }, [detectFromCamera, detectOnce, testImages]);

  const isTestMode = testImages && testImages.length > 0;
  const currentTestItem = isTestMode
    ? testImages[testIndex % testImages.length]
    : null;
  const currentItemInfo =
    currentTestItem && typeof currentTestItem === "object" ? currentTestItem : null;

  return (
    <div className="camera-view">
      {isTestMode ? (
        imageDataUrl ? (
          <img
            className="test-image"
            src={imageDataUrl}
            alt="test classroom"
          />
        ) : (
          <div className="test-loading">
            {imageError ? `加载失败: ${imageError}` : "加载测试图中…"}
          </div>
        )
      ) : (
        <video ref={videoRef} autoPlay playsInline muted />
      )}
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <div className="overlay">
        <div className="count-badge total-badge">总人数: {totalCount}</div>
        <div className="raised-count-badge">举手: {raisedCount}</div>
        {isTestMode && currentItemInfo ? (
          <div className="test-mode-badge">
            测试 {testIndex + 1}/{testImages.length} · 实际{" "}
            {currentItemInfo.students}人 / 举手 {currentItemInfo.raised} · 帧{" "}
            {testFrame + 1}/{FRAMES_PER_IMAGE}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default CameraView;
