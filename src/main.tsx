import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; // Pastikan CSS kamu ter-import jika ada

// 🚀 DAFTARKAN SERVICE WORKER PWA DI SINI
import { registerSW } from 'virtual:pwa-register';

// Panggil pendaftar otomatis agar PWA aktif
registerSW({ immediate: true });

// Mencari <div id="root"> di index.html dan menyuntikkan React ke dalamnya
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);