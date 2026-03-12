import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

import './index.css'; 

// 🚀 DAFTARKAN SERVICE WORKER PWA
// @ts-ignore  <-- INI JURUS NINJA NYA BIAR MERAHNYA HILANG
import { registerSW } from 'virtual:pwa-register';

// Panggil pendaftar otomatis agar fitur "Install ke HP" aktif
registerSW({ immediate: true });

// Mencari <div id="root"> di index.html
const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error("❌ Elemen root tidak ditemukan! Cek file index.html kamu.");
}

// Log untuk memastikan JavaScript sudah jalan sampai baris terakhir
console.log("🚀 RopiHR: System Ready!");