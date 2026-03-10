import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// KITA CUMA IMPORT LOGIN
import Login from './pages/Login';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Rute Penunjuk Jalan */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />

        {/* HANYA HALAMAN INI YANG HIDUP */}
        <Route path="/login" element={<Login />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;