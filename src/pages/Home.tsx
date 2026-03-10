import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

interface User {
  name: string;
  role?: string;
  employee_id: string;
  branch?: string;
}

interface BtnConfig {
  text: string;
  icon: string;
  className: string;
  mode: string;
}

const Home = () => {
  const navigate = useNavigate();
  const BACKEND = (import.meta as any).env?.VITE_API_URL || 'https://ropi-hr-backend.vercel.app'; 

  const [user, setUser] = useState<User>({ name: 'Karyawan', role: 'Staff Roti Ropi', employee_id: '' });
  const [statusAbsen, setStatusAbsen] = useState<string>('Mengecek status...');
  const [btnConfig, setBtnConfig] = useState<BtnConfig>({
    text: 'Menyiapkan Tombol...',
    icon: 'fa-spinner fa-spin',
    className: 'bg-gray-200 text-gray-500',
    mode: '',
  });

  useEffect(() => {
    const userData = localStorage.getItem('ropi_user');
    if (!userData) {
      navigate('/');
      return;
    }
    const parsedUser: User = JSON.parse(userData);
    setUser(parsedUser);
    ambilStatusHariIni(parsedUser.employee_id);
  }, [navigate]);

  const ambilStatusHariIni = async (employeeId: string) => {
    try {
      const tglHariIni = new Date().toISOString().substring(0, 10);
      const res = await fetch(`${BACKEND}/api/attendance?employee_id=${encodeURIComponent(employeeId)}&from=${tglHariIni}&to=${tglHariIni}`);
      const data = await res.json();

      if (data.success && data.data && data.data.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const terakhir = data.data.sort((a: any, b: any) => b.time.localeCompare(a.time))[0];
        const jam = terakhir.time.substring(11, 16);
        const tipe = terakhir.log_type === 'IN' ? 'MASUK' : 'KELUAR';

        const statusText = `✓ Absen ${tipe} pukul ${jam}`;
        setStatusAbsen(statusText);
        localStorage.setItem('ropi_status_absen', statusText);

        if (terakhir.log_type === 'IN') {
          setBtnConfig({
            text: 'Absen Keluar Sekarang',
            icon: 'fa-right-from-bracket',
            className: 'bg-red-500 text-white shadow-red-500/30',
            mode: 'KELUAR',
          });
        } else {
          setBtnConfig({
            text: 'Absen Masuk Sekarang',
            icon: 'fa-right-to-bracket',
            className: 'bg-green-500 text-white shadow-green-500/30',
            mode: 'MASUK',
          });
        }
      } else {
        setStatusAbsen('Belum ada catatan absen hari ini');
        localStorage.removeItem('ropi_status_absen');
        setBtnConfig({
          text: 'Absen Masuk Sekarang',
          icon: 'fa-right-to-bracket',
          className: 'bg-green-500 text-white shadow-green-500/30',
          mode: 'MASUK',
        });
      }
    } catch (e) {
      console.error('Gagal sinkronisasi status:', e);
      setStatusAbsen(localStorage.getItem('ropi_status_absen') || 'Gagal memuat status');
      setBtnConfig({
        text: 'Buka Kamera Absen',
        icon: 'fa-camera',
        className: 'bg-[#3e2723] text-[#fbc02d]',
        mode: 'MASUK',
      });
    }
  };

  return (
    <div className="bg-gray-100 flex justify-center min-h-screen font-sans">
      <div className="w-full max-w-sm bg-white min-h-screen flex flex-col shadow-2xl relative">
        
        {/* Header */}
        <div className="bg-[#3e2723] pt-12 pb-20 px-6 rounded-b-[2.5rem] shrink-0">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-black text-[#fbc02d]">
                Halo, <span>{user.name}</span> 👋
              </h2>
              <p className="text-white/70 text-sm mt-0.5">{user.role || 'Staff Roti Ropi'}</p>
            </div>
            <Link to="/profil" className="w-14 h-14 rounded-full bg-[#fbc02d] border-2 border-[#fbc02d] flex items-center justify-center text-[#3e2723] font-black text-xl shadow-lg active:scale-95 transition-transform">
              <span>{(user.name || 'K').charAt(0).toUpperCase()}</span>
            </Link>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-6 -mt-12 relative z-10 overflow-y-auto pb-24">
          <div className="bg-white rounded-3xl p-5 shadow-lg border border-gray-100 mb-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-[#fbc02d]"></div>
            <p className="text-gray-400 text-xs font-black uppercase tracking-wider mt-1 mb-1">Status Hari Ini</p>
            <p className="text-[#3e2723] font-bold text-sm mb-4">{statusAbsen}</p>
            
            <button
              onClick={() => navigate(`/absen?mode=${btnConfig.mode}&auto=true`)}
              className={`w-full font-black py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all text-lg shadow-lg ${btnConfig.className}`}
            >
              <i className={`fa-solid ${btnConfig.icon} fa-fw`}></i> {btnConfig.text}
            </button>
          </div>

          <h3 className="font-black text-[#3e2723] text-base mb-3">Menu Laporan</h3>
          <div className="flex flex-col gap-3">
            
            {/* MENU IZIN (BARU) */}
            <Link to="/izin" className="bg-[#fff8e1] p-4 rounded-2xl flex items-center justify-between active:scale-95 transition-all border border-transparent hover:border-[#fbc02d]">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-[#fbc02d] rounded-full flex items-center justify-center text-[#3e2723] text-lg shrink-0">
                  <i className="fa-solid fa-envelope-open-text"></i>
                </div>
                <div>
                  <p className="font-black text-[#3e2723] text-sm">Pengajuan Izin</p>
                  <p className="text-gray-400 text-xs">Izin sakit & keperluan lain</p>
                </div>
              </div>
              <i className="fa-solid fa-chevron-right text-gray-300 text-sm"></i>
            </Link>

            {/* MENU CUTI TAHUNAN */}
            <Link to="/cuti" className="bg-white p-4 rounded-2xl flex items-center justify-between active:scale-95 transition-all border border-gray-100 shadow-sm hover:border-[#fbc02d]/50">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 text-lg shrink-0">
                  <i className="fa-solid fa-calendar-minus"></i>
                </div>
                <div>
                  <p className="font-black text-[#3e2723] text-sm">Cuti Tahunan</p>
                  <p className="text-gray-400 text-xs">Cek sisa kuota cuti</p>
                </div>
              </div>
              <i className="fa-solid fa-chevron-right text-gray-300 text-sm"></i>
            </Link>

            {/* MENU REKAP ABSEN */}
            <Link to="/absen" className="bg-white p-4 rounded-2xl flex items-center justify-between active:scale-95 transition-all border border-gray-100 shadow-sm hover:border-[#fbc02d]/50">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-[#3e2723] rounded-full flex items-center justify-center text-[#fbc02d] text-lg shrink-0">
                  <i className="fa-solid fa-clipboard-list"></i>
                </div>
                <div>
                  <p className="font-black text-[#3e2723] text-sm">Riwayat Absen</p>
                  <p className="text-gray-400 text-xs">Rekap kehadiran bulanan</p>
                </div>
              </div>
              <i className="fa-solid fa-chevron-right text-gray-300 text-sm"></i>
            </Link>
          </div>
        </div>

        {/* ✨ NAVIGATION BOTTOM: 4 TOMBOL ✨ */}
        <nav className="absolute bottom-0 left-0 right-0 w-full bg-white border-t border-gray-100 px-4 py-3 flex justify-between z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.02)]">
          <div className="flex flex-col items-center text-[#3e2723] w-1/4">
            <i className="fa-solid fa-house text-xl mb-1"></i>
            <span className="text-[10px] font-black uppercase">Home</span>
          </div>
          <Link to="/absen" className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors">
            <i className="fa-solid fa-clipboard-user text-xl mb-1"></i>
            <span className="text-[10px] font-black uppercase">Absen</span>
          </Link>
          <Link to="/izin" className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors">
            <i className="fa-solid fa-envelope-open-text text-xl mb-1"></i>
            <span className="text-[10px] font-black uppercase">Izin</span>
          </Link>
          <Link to="/cuti" className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors">
            <i className="fa-solid fa-calendar-minus text-xl mb-1"></i>
            <span className="text-[10px] font-black uppercase">Cuti</span>
          </Link>
        </nav>
      </div>
    </div>
  );
};

export default Home;