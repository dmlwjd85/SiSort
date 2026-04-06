import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages: 저장소 github.com/dmlwjd85/SiSort → 보통 /SiSort/ (저장소 표기와 동일)
// CI에서만 base를 설정하고, 로컬 개발은 '/' 유지
const base = process.env.GITHUB_ACTIONS === 'true' ? '/SiSort/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
})
