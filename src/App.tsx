import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Import semua halaman yang sudah kita "sehatkan"
import Login from './pages/Login';
import Home from './pages/Home';
import Absen from './pages/Absen';
import Cuti from './pages/Cuti';
import Profil from './pages/Profil';
import Izin from './pages/Izin';

//  IMPORT HALAMAN BARU DASHBOARD HR 
import DashboardHR from './pages/DashboardHR'; 

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 1. Rute Penunjuk Jalan (Default) */}
        {/* Jika user buka ropi-hr.vercel.app tanpa path, lempar ke /login */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* 2. Halaman Login */}
        <Route path="/login" element={<Login />} />

        {/* 3. Halaman Utama & Fitur (Semua Aktif!) */}
        <Route path="/home" element={<Home />} />
        <Route path="/absen" element={<Absen />} />
        <Route path="/cuti" element={<Cuti />} />
        <Route path="/profil" element={<Profil />} />
        <Route path="/izin" element={<Izin />} />
        
        {/*  RUTE BARU KHUSUS HR  */}
        <Route path="/hr-dashboard" element={<DashboardHR />} />

        {/* 4. Rute Sapu Jagat (Fallback) */}
        {/* Jika user ngetik rute aneh-aneh atau rute tidak ditemukan, balikkan ke login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;