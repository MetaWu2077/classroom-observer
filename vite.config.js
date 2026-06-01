import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Electron 通过 file:// 加载渲染进程产物，必须使用相对路径（base: "./"）。
export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
