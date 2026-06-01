import React, { useState, useEffect, useRef, useCallback } from "react";
import CameraView from "./components/CameraView";
import VoicePanel from "./components/VoicePanel";
import ChartPanel from "./components/ChartPanel";

// 三个固定问题
const QUESTIONS = [
  "有多少人用过 AI 编程",
  "有多少人用过 Agent",
  "有多少人在尝试 AI 创业",
];

// 测试模式：轮播这些图片模拟课堂视频(相对 dist/index.html 解析)
// Electron 用 file:// 加载,这里用绝对 file:// URL 更稳
const TEST_IMAGES = [
  "file:///D:/myhoney/opc-harness/dev/class/test_assets/class_lecture.jpg",
  "file:///D:/myhoney/opc-harness/dev/class/test_assets/class_circle.jpg",
  "file:///D:/myhoney/opc-harness/dev/class/test_assets/class_masked.jpg",
  "file:///D:/myhoney/opc-harness/dev/class/test_assets/class_few.jpg",
  "file:///D:/myhoney/opc-harness/dev/class/test_assets/class_teacher.jpg",
];

function App() {
  const [raisedCount, setRaisedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(-1); // -1 表示未选题
  const [statsHistory, setStatsHistory] = useState([]);
  const [testMode, setTestMode] = useState(false);

  const raisedRef = useRef(0);
  const totalRef = useRef(0);
  // 用 ref 暂存「确定」点击瞬间的快照，避免异步 setState 拿到旧值
  const capturedRef = useRef({ raised: 0, total: 0 });

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

  const handleSelectQuestion = useCallback((idx) => {
    setQuestionIndex(idx);
  }, []);

  // 教师点击「确定」：记录当前题 + 当前举手/总人数,自动重置
  const handleConfirm = useCallback(async () => {
    if (questionIndex < 0) return;
    if (totalRef.current <= 0) return; // 没识别到人脸,不允许

    capturedRef.current = { raised: raisedRef.current, total: totalRef.current };

    const record = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      question: QUESTIONS[questionIndex],
      total_count: capturedRef.current.total,
      raised_count: capturedRef.current.raised,
    };

    // 立即清零当前画面显示(避免教师感觉「确定」后还要等)
    handleRaisedCountChange(0);

    try {
      await window.api.saveStats(record);
      await refreshStats();
    } catch (err) {
      console.error("Save stats error:", err);
    }
  }, [questionIndex, handleRaisedCountChange, refreshStats]);

  const handleClearStats = useCallback(async () => {
    await window.api.clearStats();
    setStatsHistory([]);
    setQuestionIndex(-1);
  }, []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  const canConfirm = questionIndex >= 0 && totalCount > 0;
  const currentQuestionText =
    questionIndex >= 0 ? QUESTIONS[questionIndex] : "请选择一个题目";

  return (
    <div className="app">
      <header className="header">
        <h1>课堂观察</h1>
        <div className="status">
          <span className={`status-dot ${totalCount > 0 ? "active" : ""}`}></span>
          <span>{totalCount > 0 ? "识别中" : "等待人脸"}</span>
        </div>
        <label className="test-toggle">
          <input
            type="checkbox"
            checked={testMode}
            onChange={(e) => setTestMode(e.target.checked)}
          />
          测试模式
        </label>
      </header>

      <div className="camera-panel">
        <h2>摄像头监控</h2>
        <CameraView
          raisedCount={raisedCount}
          totalCount={totalCount}
          onRaisedCountChange={handleRaisedCountChange}
          onTotalCountChange={handleTotalCountChange}
          testImages={testMode ? TEST_IMAGES : null}
        />
      </div>

      <div className="stats-panel-right">
        <div className="stats-panel-header">
          <h2>问题统计</h2>
          <button className="btn-danger btn-clear" onClick={handleClearStats}>
            清空记录
          </button>
        </div>
        <div className="current-question">{currentQuestionText}</div>
        <div className="stat-summary">
          <span>
            举手 <strong>{raisedCount}</strong>
          </span>
          <span>
            总人数 <strong>{totalCount}</strong>
          </span>
          <span>
            举手率{" "}
            <strong>
              {totalCount > 0 ? ((raisedCount / totalCount) * 100).toFixed(0) : 0}%
            </strong>
          </span>
        </div>
        <ChartPanel statsHistory={statsHistory} questions={QUESTIONS} />
      </div>

      <div className="voice-section">
        <VoicePanel
          questionIndex={questionIndex}
          onSelect={handleSelectQuestion}
          onConfirm={handleConfirm}
          disabled={!canConfirm}
        />
      </div>
    </div>
  );
}

export default App;
