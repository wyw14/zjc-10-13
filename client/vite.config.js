import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5213,
    proxy: {
      '/api': {
        target: 'http://localhost:3113',
        changeOrigin: true
      }
    }
  }
})
