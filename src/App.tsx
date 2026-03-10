import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Import semua halaman yang SUDAH kita perbaiki
import Login from './pages/Login';
import Home from './pages/Home';
import Absen from './pages/Absen';
import Cuti from './pages/Cuti';
import Profil from './pages/Profil';
import Izin from './pages/Izin';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Rute Penunjuk Jalan (Penting biar ga layar putih pas buka web awal) */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />

        {/* Rute Utama Aplikasi */}
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<Home />} />
        <Route path="/absen" element={<Absen />} />
        <Route path="/cuti" element={<Cuti />} />
        <Route path="/profil" element={<Profil />} />
        <Route path="/izin" element={<Izin />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;