import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages 프로젝트 페이지(201924611.github.io/onuljang/) 자산 경로
  base: '/onuljang/',
  plugins: [react()],
  server: { port: 5173 },
  preview: { port: 4173 },
});
