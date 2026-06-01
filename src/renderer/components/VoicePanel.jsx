import React from "react";

// 底部操作栏：3 个固定问题按钮 + 「确定」按钮。
// questionIndex: 当前选中的问题下标(-1 表示未选)
// onSelect: 点击问题按钮
// onConfirm: 点击「确定」,记录当前题 + 举手数 + 总人数
// disabled: 举手数为 0 或未选问题/未识别到人脸时禁用确定
function VoicePanel({ questionIndex, onSelect, onConfirm, disabled }) {
  return (
    <div className="voice-bar">
      <div className="question-buttons">
        {[0, 1, 2].map((i) => (
          <button
            key={i}
            className={`btn-question ${questionIndex === i ? "active" : ""}`}
            onClick={() => onSelect(i)}
          >
            第 {i + 1} 题
          </button>
        ))}
      </div>
      <button
        className="btn-confirm"
        onClick={onConfirm}
        disabled={disabled}
      >
        确定
      </button>
    </div>
  );
}

export default VoicePanel;
