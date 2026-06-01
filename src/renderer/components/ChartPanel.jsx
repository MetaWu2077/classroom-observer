import React from "react";
import ReactECharts from "echarts-for-react";

function ChartPanel({ statsHistory }) {
  if (statsHistory.length === 0) {
    return (
      <div className="chart-container">
        <p style={{ color: "#555", textAlign: "center", paddingTop: 80 }}>
          暂无统计数据
        </p>
      </div>
    );
  }

  const option = {
    title: {
      text: "统计结果",
      left: "center",
      textStyle: { color: "#00d9ff", fontSize: 16 },
    },
    tooltip: {
      trigger: "item",
      formatter: "{b}: {c} ({d}%)",
    },
    legend: {
      orient: "vertical",
      left: "left",
      textStyle: { color: "#888" },
    },
    series: [
      {
        name: "举手统计",
        type: "pie",
        radius: ["40%", "70%"],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: "#1a1a2e",
          borderWidth: 2,
        },
        label: {
          show: true,
          formatter: "{b}: {c}",
          color: "#eee",
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: "bold",
          },
        },
        data: statsHistory.map((record) => ({
          value: record.raised_count,
          name: record.question.slice(0, 20),
        })),
      },
    ],
    backgroundColor: "transparent",
  };

  return (
    <div className="chart-container">
      <ReactECharts option={option} style={{ width: "100%", height: "100%", minHeight: 180 }} />
    </div>
  );
}

export default ChartPanel;
