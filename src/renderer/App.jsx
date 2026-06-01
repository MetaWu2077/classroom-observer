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

// 测试模式：轮播根目录下的 3 张 PNG,模拟不同密度的课堂场景
// path 走 IPC 让主进程读取(避开 renderer file:// CORS 限制)
// students/raised 用于 UI 角标对照模型输出
const TEST_IMAGES = [
  { path: "D:/myhoney/opc-harness/dev/class/1.png", students: 25, raised: 11 },
  { path: "D:/myhoney/opc-harness/dev/class/2.png", students: 25, raised: 2 },
  { path: "D:/myhoney/opc-harness/dev/class/3.png", students: 50, raised: 2 },
];

function App() {
  const [raisedCount, setRaisedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(-1); // -1 表示未选题
  const [statsHistory, setStatsHistory] = useState([]);
  const [testMode, setTestMode] = useState(false);
  // 人工校准：教师可微调举手数。null 表示用模型估算值,数字表示用教师覆盖。
  const [raisedOverride, setRaisedOverride] = useState(null);

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

  // 切换题目时清空人工校准
  const handleSelectQuestion = useCallback((idx) => {
    setQuestionIndex(idx);
    setRaisedOverride(null);
  }, []);

  // 教师点击「确定」：用人工校准值(若设了),否则用模型估算
  const handleConfirm = useCallback(async () => {
    if (questionIndex < 0) return;
    if (totalRef.current <= 0) return; // 没识别到人脸,不允许

    const finalRaised = raisedOverride !== null ? raisedOverride : raisedRef.current;
    capturedRef.current = { raised: finalRaised, total: totalRef.current };

    const record = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      question: QUESTIONS[questionIndex],
      total_count: capturedRef.current.total,
      raised_count: capturedRef.current.raised,
    };

    // 立即清零当前画面显示(避免教师感觉「确定」后还要等)
    handleRaisedCountChange(0);
    setRaisedOverride(null); // 校准也清掉

    try {
      await window.api.saveStats(record);
      await refreshStats();
    } catch (err) {
      console.error("Save stats error:", err);
    }
  }, [questionIndex, raisedOverride, handleRaisedCountChange, refreshStats]);

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
            模型估算举手 <strong>{raisedCount}</strong>
          </span>
          <span>
            总人数 <strong>{totalCount}</strong>
          </span>
          <span>
            模型估算率{" "}
            <strong>
              {totalCount > 0 ? ((raisedCount / totalCount) * 100).toFixed(0) : 0}%
            </strong>
          </span>
        </div>
        <div className="override-row">
          <label>
            实际举手
            <input
              type="number"
              min="0"
              max={totalCount}
              value={raisedOverride === null ? "" : raisedOverride}
              placeholder={`模型估算 ${raisedCount}`}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") {
                  setRaisedOverride(null);
                } else {
                  const n = parseInt(v, 10);
                  if (!isNaN(n) && n >= 0) {
                    setRaisedOverride(Math.min(n, totalCount));
                  }
                }
              }}
            />
            {raisedOverride !== null ? (
              <button
                className="btn-clear-override"
                onClick={() => setRaisedOverride(null)}
                title="清除校准,使用模型估算"
              >
                ✕
              </button>
            ) : null}
          </label>
          <span className="override-rate">
            实际率{" "}
            <strong>
              {totalCount > 0
                ? (
                    ((raisedOverride !== null ? raisedOverride : raisedCount) /
                      totalCount) *
                    100
                  ).toFixed(0)
                : 0}
              %
            </strong>
          </span>
        </div>
        <div className="accuracy-note">
          ⚠️ AI 生成的远景教室对模型有挑战,数值仅供参考,请以上方"实际举手"为准
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
