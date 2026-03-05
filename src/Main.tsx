import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Mencari <div id="root"> di index.html dan menyuntikkan React ke dalamnya
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);