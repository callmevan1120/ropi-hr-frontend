import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Kita pasang "kacamata" React agar Vite paham kodingan JSX/TSX
  plugins: [react()],
  
  // Catatan: Kita hapus rollupOptions karena di React (SPA), 
  // Vite cukup membaca satu file utama yaitu index.html -> src/main.tsx
});