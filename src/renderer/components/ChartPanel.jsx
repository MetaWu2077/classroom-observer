import React from "react";
import ReactECharts from "echarts-for-react";

const PIE_COLORS = ["#00d9ff", "#00ff88", "#ffcc00", "#ff77ff"];

// 3 饼并排：每饼对应一个固定问题,只显示「举手」一项。
// statsHistory 可能有 0、1、2、3 条；不足 3 条时其余占位。
function ChartPanel({ statsHistory = [], questions = [] }) {
  // 按问题文本分组,取该问题最新一条记录
  const latestByQuestion = new Map();
  for (const r of statsHistory) {
    if (!questions.includes(r.question)) continue;
    const prev = latestByQuestion.get(r.question);
    if (!prev || prev.timestamp < r.timestamp) {
      latestByQuestion.set(r.question, r);
    }
  }

  return (
    <div className="chart-grid">
      {questions.slice(0, 3).map((q, i) => {
        const r = latestByQuestion.get(q);
        const option = r
          ? {
              color: PIE_COLORS,
              tooltip: {
                trigger: "item",
                formatter: "{b}: {c} ({d}%)",
              },
              series: [
                {
                  name: q,
                  type: "pie",
                  radius: ["45%", "75%"],
                  avoidLabelOverlap: false,
                  itemStyle: {
                    borderRadius: 6,
                    borderColor: "#16213e",
                    borderWidth: 2,
                  },
                  label: { show: false },
                  labelLine: { show: false },
                  data: [
                    { value: r.raised_count, name: "举手" },
                    {
                      value: Math.max(0, r.total_count - r.raised_count),
                      name: "未举手",
                    },
                  ],
                },
              ],
              backgroundColor: "transparent",
            }
          : null;

        return (
          <div className="chart-cell" key={i}>
            <div className="chart-cell-title">
              {`第 ${i + 1} 题 · ${q}`}
            </div>
            <div className="chart-cell-body">
              {r ? (
                <ReactECharts
                  option={option}
                  style={{ width: "100%", height: "100%" }}
                />
              ) : (
                <div className="chart-empty">未记录</div>
              )}
            </div>
            <div className="chart-cell-footer">
              {r ? (
                <>
                  举手 <strong>{r.raised_count}</strong> /{" "}
                  总数 <strong>{r.total_count}</strong>
                </>
              ) : (
                "—"
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ChartPanel;
