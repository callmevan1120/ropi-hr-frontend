import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Plugin react bawaanmu agar Vite paham kodingan JSX/TSX
  plugins: [
    react(),
    // 🚀 Tambahkan Mesin PWA di sini
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'Logo-Roti-ropi.png', 'icon-192.png', 'icon-512.png'],
      manifest: false, // Kita set false karena kamu sudah bikin manifest.json manual di folder public
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'], // Cache semua file tampilan agar bisa offline
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === self.location.origin,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ropi-hr-assets',
            },
          },
        ],
      },
    })
  ],
});