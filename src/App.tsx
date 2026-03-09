import { BrowserRouter, Routes, Route } from 'react-router-dom';
// Pastikan meng-import komponen dari folder pages
import Login from './pages/Login';
import Home from './pages/Home';
import Absen from './pages/Absen';
import Cuti from './pages/Cuti';
import Profil from './pages/Profil';
import Shift from './pages/Shift';
import Izin from './pages/Izin';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<Home />} />
        <Route path="/absen" element={<Absen />} />
        <Route path="/cuti" element={<Cuti />} />
        <Route path="/profil" element={<Profil />} />
        <Route path="/shift" element={<Shift />} />
        <Route path="/izin" element={<Izin />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;