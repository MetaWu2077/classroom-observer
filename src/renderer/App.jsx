import React, { useState, useEffect, useRef, useCallback } from "react";
import CameraView from "./components/CameraView";
import VoicePanel from "./components/VoicePanel";
import ChartPanel from "./components/ChartPanel";
import useSpeechRecognition from "./hooks/useSpeechRecognition";

function App() {
  const [raisedCount, setRaisedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0); // 总人数来自视频人脸识别
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [statsHistory, setStatsHistory] = useState([]);

  // 用 ref 保存最新计数，供语音回调在保存时读取实时值。
  const raisedRef = useRef(0);
  const totalRef = useRef(0);

  const handleRaisedCountChange = useCallback((count) => {
    raisedRef.current = count;
    setRaisedCount(count);
  }, []);

  const handleTotalCountChange = useCallback((count) => {
    totalRef.current = count;
    setTotalCount(count);
  }, []);

  const refreshStats = useCallback(async () => {
    try {
      const result = await window.api.getStats();
      setStatsHistory(result.history || []);
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  }, []);

  // 语音侦测到“好的放下”时触发：把当前问题与举手/总人数存为一条记录。
  const handleVoiceCapture = useCallback(async (question) => {
    setCurrentQuestion(question);

    const record = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      question,
      total_count: totalRef.current,
      raised_count: raisedRef.current,
    };

    try {
      await window.api.saveStats(record);
      await refreshStats();
    } catch (err) {
      console.error("Save stats error:", err);
    }
  }, [refreshStats]);

  const { enabled, phase, liveText, heardText, supported, toggle } = useSpeechRecognition(handleVoiceCapture);

  // capturing 阶段把实时听到的问题同步到统计区显示。
  useEffect(() => {
    if (phase === "capturing") {
      setCurrentQuestion(liveText);
    }
  }, [phase, liveText]);

  const handleClearStats = async () => {
    await window.api.clearStats();
    setStatsHistory([]);
  };

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  return (
    <div className="app">
      <header className="header">
        <h1>课堂观察</h1>
        <div className="status">
          <span className={`status-dot ${enabled ? "active" : ""}`}></span>
          <span>
            {phase === "capturing"
              ? "采集中"
              : phase === "listening"
              ? "聆听中"
              : "系统就绪"}
          </span>
        </div>
      </header>

      <div className="camera-panel">
        <h2>摄像头监控</h2>
        <CameraView
          raisedCount={raisedCount}
          totalCount={totalCount}
          onRaisedCountChange={handleRaisedCountChange}
          onTotalCountChange={handleTotalCountChange}
        />
      </div>

      <div className="stats-panel-right">
        <div className="stats-panel-header">
          <h2>问题统计</h2>
          <button className="btn-danger btn-clear" onClick={handleClearStats}>
            清空记录
          </button>
        </div>
        <div className="current-question">
          {currentQuestion || "暂无问题"}
        </div>
        <div className="stat-summary">
          <span>举手 <strong>{raisedCount}</strong></span>
          <span>总人数 <strong>{totalCount}</strong></span>
          <span>
            举手率{" "}
            <strong>
              {totalCount > 0 ? ((raisedCount / totalCount) * 100).toFixed(0) : 0}%
            </strong>
          </span>
        </div>
        <ChartPanel statsHistory={statsHistory} />
      </div>

      <div className="voice-section">
        <VoicePanel
          enabled={enabled}
          phase={phase}
          liveText={liveText}
          heardText={heardText}
          supported={supported}
          onToggle={toggle}
        />
      </div>
    </div>
  );
}

export default App;
