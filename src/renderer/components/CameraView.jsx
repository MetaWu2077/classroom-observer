import React, { useRef, useEffect, useCallback } from "react";

const TEST_INTERVAL_MS = 1500;

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
  testImages, // 非空则进入测试模式：轮流播放图片
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const testIndexRef = useRef(0);
  const testTimerRef = useRef(null);

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

  // 测试模式：轮流播放图片
  const detectFromTestImage = useCallback(async () => {
    if (!testImages || testImages.length === 0) return;
    const src = testImages[testIndexRef.current % testImages.length];
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
    testIndexRef.current = (testIndexRef.current + 1) % testImages.length;
  }, [testImages, onRaisedCountChange, onTotalCountChange]);

  useEffect(() => {
    // 测试模式：不开摄像头,直接轮播图片
    if (testImages && testImages.length > 0) {
      testIndexRef.current = 0;
      detectFromTestImage(); // 立即跑一次
      testTimerRef.current = setInterval(detectFromTestImage, TEST_INTERVAL_MS);
      return () => {
        if (testTimerRef.current) clearInterval(testTimerRef.current);
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

  return (
    <div className="camera-view">
      {isTestMode ? (
        <img
          className="test-image"
          src={testImages[testIndexRef.current % testImages.length]}
          alt="test classroom"
        />
      ) : (
        <video ref={videoRef} autoPlay playsInline muted />
      )}
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <div className="overlay">
        <div className="count-badge total-badge">总人数: {totalCount}</div>
        <div className="raised-count-badge">举手: {raisedCount}</div>
        {isTestMode ? (
          <div className="test-mode-badge">测试模式</div>
        ) : null}
      </div>
    </div>
  );
}

export default CameraView;
