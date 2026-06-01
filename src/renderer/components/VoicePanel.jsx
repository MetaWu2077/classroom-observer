import React from "react";

// 底部语音输入条：单行文本框 + 实时模式开关。
// phase: off | listening | capturing —— capturing 时文本框变色提醒。
// heardText: 最近一次识别到的原文，聆听态下显示，便于确认麦克风/识别是否正常。
function VoicePanel({ enabled, phase, liveText, heardText, supported, onToggle }) {
  const placeholder = !supported
    ? "当前环境不支持录音/语音识别"
    : phase === "listening"
    ? "实时聆听中… 说“做个统计”开始"
    : phase === "capturing"
    ? "正在采集问题… 说“好的放下”结束"
    : "点击右侧按钮进入实时语音模式";

  // 采集态显示问题文本；聆听态显示最近识别到的原文（灰字提示）。
  const value = phase === "capturing" ? liveText : "";

  return (
    <div className="voice-bar">
      <div className="voice-input-wrap">
        <input
          type="text"
          className={`voice-input ${phase === "capturing" ? "capturing" : ""}`}
          value={value}
          placeholder={placeholder}
          readOnly
        />
        {enabled && phase === "listening" && heardText ? (
          <div className="voice-heard">识别到：{heardText}</div>
        ) : null}
      </div>
      <button
        className={`btn-primary voice-toggle ${enabled ? "active" : ""}`}
        onClick={onToggle}
        disabled={!supported}
      >
        {enabled ? "停止" : "实时语音"}
      </button>
    </div>
  );
}

export default VoicePanel;
