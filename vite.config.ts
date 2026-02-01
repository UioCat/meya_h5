import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    host: '0.0.0.0', // 关键：监听所有网卡
    port: 8888,      // 可选，默认就是 5000
    strictPort: true // 可选，端口被占用就直接失败
  }
});
