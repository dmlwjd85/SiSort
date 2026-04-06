import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages: https://dmlwjd85.github.io/sisort/ (저장소 이름이 sisort일 때)
// CI에서만 base를 /sisort/로 두고, 로컬 개발은 '/' 유지
const base = process.env.GITHUB_ACTIONS === 'true' ? '/sisort/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
})
