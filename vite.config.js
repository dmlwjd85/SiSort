import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Capacitor 네이티브 빌드: 반드시 '/' (에셋 경로)
// GitHub Pages: CI에서만 /SiSort/
// 로컬 개발: '/'
const base =
  process.env.CAPACITOR === 'true'
    ? '/'
    : process.env.GITHUB_ACTIONS === 'true'
      ? '/SiSort/'
      : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        /* 초기 파싱·캐시 효율: React / Firebase 분리 → 첫 상호작용까지 체감 개선 */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('firebase')) return 'firebase'
          if (id.includes('react-dom') || id.includes('node_modules/react/')) return 'react-vendor'
          if (id.includes('@capacitor')) return 'capacitor'
          return undefined
        },
      },
    },
  },
})
