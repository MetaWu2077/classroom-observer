# Classroom Observer 课堂观察应用

教师通过摄像头实时观察学生情况，**自动统计举手人数**与**举手率**，配合**语音指令**自动记录每道题的结果。

![workflow](https://img.shields.io/badge/Electron-28-47848F) ![react](https://img.shields.io/badge/React-18-61DAFB) ![python](https://img.shields.io/badge/Python-3.11%2B-3776AB)

## 功能特性

- 🎥 **实时举手检测**：MediaPipe Hands 检测画面中举手的学生，每 500ms 刷新一次
- 👥 **自动总人数识别**：MediaPipe BlazeFace 数画面中的人脸数，无需人工输入班级人数
- 🎤 **实时语音控制**（基于本地 Whisper + 繁简/语气词模糊匹配）：
  - 「做个统计」→ 进入问题采集态（文本框变黄）
  - 「好的放下」→ 结束采集，自动保存「问题 + 举手数 + 总人数」
- 📊 **可视化统计**：每道题按问题饼图展示举手人数，统计落盘到 JSON，重启不丢
- 🪟 **Electron 桌面应用**：单机本地运行，无需联网（语音识别除外）

## 界面布局

```
┌─────────────────┬─────────────────┐
│  摄像头监控     │  问题统计       │
│  (举手 + 总人数)│  (当前问题/饼图)│
├─────────────────┴─────────────────┤
│  [ 语音输入文本框 ]  [ 实时语音 ]  │
└───────────────────────────────────┘
```

## 架构

```
Electron 主进程 (src/main/index.js)
   │  IPC 桥 (src/preload/index.js)
   │
   ▼
React 渲染进程 (src/renderer/)
   ├─ CameraView    每 500ms 发帧给后端
   ├─ VoicePanel    MediaRecorder → 后端 Whisper
   └─ ChartPanel    统计饼图
   │
   │  HTTP (127.0.0.1:28765)
   ▼
Flask Python 服务 (src/python/)
   ├─ /transcribe    Whisper (本地)
   ├─ /detect_hands  MediaPipe Hands + BlazeFace
   └─ /stats         JSON 文件持久化
```

## 快速开始

### 环境要求

- **Node.js 18+**
- **Python 3.11+** (MediaPipe 需要较新版本)

### 安装

```bash
# 1. 安装 Node 依赖
npm install

# 2. 安装 Python 依赖
pip install -r src/python/requirements.txt
```

### 启动

```bash
npm run dev
```

这条命令会自动：
1. 用 Vite 打包前端到 `src/renderer/dist/`
2. 启动 Flask 后端服务（端口 28765）
3. 启动 Electron 窗口

**首次运行**会下载约 140MB 的 Whisper `base` 模型 + 7.5MB 的 MediaPipe hand landmarker，缓存到本地后下次启动直接使用。

### 单独命令

```bash
npm run build:renderer   # 只打包前端
npm run python           # 只起后端
npm start                # 只起 Electron（需先 build:renderer）
```

## 使用流程

1. **开启摄像头**：应用启动后自动请求摄像头权限
2. **开始上课**：举手人数和总人数实时显示在摄像头叠加层
3. **提出问题**：点击右下「实时语音」按钮开启语音模式
4. **说出关键词**：
   - 「现在我们**做个统计**，xxx」(进入采集态，文本框变黄)
   - 「**好的放下**」(结束采集，自动保存一条记录)
5. **查看统计**：右上饼图实时更新每道题的举手人数

## 性能与限制

- **延迟**：语音识别每 3.5 秒一段，"做个统计"说出后约 1～3 秒进入采集态
- **识别准确率**：Whisper `base` 模型在中文 + 短音频下偶有同音误识，关键词已做模糊匹配容错
- **人脸数识别**：学生侧脸/低头/遮挡时可能漏检，记录的是按下结束词那一刻的识别值
- **模型不随仓库分发**：`.gitignore` 排除了 `src/python/models/*.tflite` 和 `*.task`，首次启动自动下载

## 项目结构

```
src/
├── main/                  Electron 主进程
│   └── index.js           spawn Python 子进程、IPC 桥
├── preload/
│   └── index.js           contextBridge 暴露 window.api
├── renderer/              React 渲染进程
│   ├── App.jsx            主组件（状态机、音视频同步）
│   ├── main.jsx           入口
│   ├── components/
│   │   ├── CameraView.jsx 摄像头 + 举手检测循环
│   │   ├── VoicePanel.jsx 底部语音输入条
│   │   └── ChartPanel.jsx 统计饼图
│   ├── hooks/
│   │   └── useSpeechRecognition.js  实时语音 + 关键词模糊匹配
│   ├── styles/main.css
│   └── index.html
└── python/                Flask 后端
    ├── server.py          路由 + 持久化
    ├── asr_service.py     Whisper 封装
    ├── hand_detection.py  MediaPipe Hands + BlazeFace
    ├── face_detection.py  人脸数单独模块
    ├── models/            MediaPipe 模型（gitignored，首次自动下载）
    └── data/stats.json    统计落盘（gitignored）
```

## License

MIT
