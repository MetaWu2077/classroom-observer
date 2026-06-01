import React, { useRef, useEffect, useCallback } from "react";

function CameraView({ raisedCount, totalCount, onRaisedCountChange, onTotalCountChange }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const frameIntervalRef = useRef(null);

  const detectHands = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!video.videoWidth) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

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

  useEffect(() => {
    let stream;

    const initCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        frameIntervalRef.current = setInterval(detectHands, 500);
      } catch (err) {
        console.error("Failed to access camera:", err);
      }
    };

    initCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
      }
    };
  }, [detectHands]);

  return (
    <div className="camera-view">
      <video ref={videoRef} autoPlay playsInline muted />
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <div className="overlay">
        <div className="count-badge total-badge">总人数: {totalCount}</div>
        <div className="raised-count-badge">举手: {raisedCount}</div>
      </div>
    </div>
  );
}

export default CameraView;
