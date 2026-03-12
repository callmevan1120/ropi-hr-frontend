import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

// ══════════════════════════════════════
// 1. INTERFACE TYPESCRIPT
// ══════════════════════════════════════
interface User {
  name: string;
  role?: string;
  employee_id: string;
  email?: string;
}

const Profil = () => {
  const navigate = useNavigate();

  // ══════════════════════════════════════
  // 2. STATE MANAGEMENT
  // ══════════════════════════════════════
  const [user, setUser] = useState<User | null>(null);

  // ══════════════════════════════════════
  // 3. LIFECYCLE (Cek Sesi Login)
  // ══════════════════════════════════════
  useEffect(() => {
    const userDataString = localStorage.getItem('ropi_user');
    if (!userDataString) {
      navigate('/');
      return;
    }
    const parsedUser: User = JSON.parse(userDataString);
    setUser(parsedUser);
  }, [navigate]);

  // ══════════════════════════════════════
  // 4. FUNGSI LOGOUT
  // ══════════════════════════════════════
  const handleLogout = () => {
    const yakin = window.confirm('Apakah Anda yakin ingin keluar dari RopiHR?');
    if (yakin) {
      localStorage.removeItem('ropi_user');
      localStorage.removeItem('ropi_status_absen');
      navigate('/');
    }
  };

  // ══════════════════════════════════════
  // 5. RENDER UI
  // ══════════════════════════════════════
  if (!user) return null; // Cegah render jika data belum siap

  const inisial = (user.name || 'K').charAt(0).toUpperCase();
  const avatarUrl = `https://ui-avatars.com/api/?name=${inisial}&background=fbc02d&color=3e2723&size=128&bold=true`;

  return (
    <div className="bg-gray-100 flex items-center justify-center min-h-screen font-sans text-[#3e2723] selection:bg-[#fbc02d] md:p-6 lg:p-10 w-full overflow-hidden">
      
      {/* CSS Khusus untuk menyembunyikan scrollbar */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* ── BUNGKUS UTAMA RESPONSIVE (SPLIT SCREEN) ── */}
      <div className="w-full md:max-w-4xl lg:max-w-5xl bg-white md:rounded-[3rem] h-screen md:h-[600px] lg:h-[700px] relative shadow-2xl flex flex-col md:flex-row overflow-hidden border border-gray-200">
        
        {/* BAGIAN KIRI: ILLUSTRASI PC */}
        <div className="hidden md:flex flex-col w-1/2 bg-[#3e2723] relative p-12 lg:p-16 justify-between overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <div className="absolute -top-20 -left-20 w-96 h-96 bg-[#fbc02d] rounded-full blur-3xl"></div>
            <div className="absolute bottom-10 -right-10 w-72 h-72 bg-orange-400 rounded-full blur-3xl"></div>
          </div>
          <div className="relative z-10">
            <div className="w-20 h-20 bg-[#fbc02d] rounded-2xl flex items-center justify-center mb-8 shadow-lg shadow-[#fbc02d]/20 rotate-3">
              <i className="fa-solid fa-bread-slice text-[#3e2723] text-4xl -rotate-3"></i>
            </div>
            <h1 className="text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">
              Ropi<span className="text-[#fbc02d]">HR</span> <br /> Workspace.
            </h1>
            <p className="text-white/70 mt-6 font-medium text-base lg:text-lg leading-relaxed max-w-sm">
              Sistem absensi dan laporan terpadu untuk Karyawan dan Manajemen Roti Ropi.
            </p>
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 bg-white/10 p-4 rounded-2xl border border-white/5 backdrop-blur-sm w-max">
              <div className="w-10 h-10 rounded-full bg-green-400/20 flex items-center justify-center text-green-400">
                <i className="fa-solid fa-shield-halved"></i>
              </div>
              <div>
                <p className="text-white font-bold text-sm">Aman & Terintegrasi</p>
                <p className="text-white/50 text-xs">Terkoneksi langsung ke ERPNext</p>
              </div>
            </div>
          </div>
        </div>

        {/* BAGIAN KANAN: APLIKASI MOBILE */}
        <div className="flex-1 flex justify-center bg-gray-50 relative z-20 w-full md:w-1/2 h-full border-l border-gray-200">
          <div className="w-full max-w-sm bg-gray-50 h-full flex flex-col relative mx-auto shadow-none md:shadow-[0_0_15px_rgba(0,0,0,0.05)] overflow-hidden">
            
            {/* Header */}
            <header className="pt-8 pb-4 px-6 bg-white border-b border-gray-100 flex items-center gap-4 sticky top-0 z-10 shrink-0">
              <Link to="/home" className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-[#3e2723] hover:bg-gray-200 transition-all active:scale-95">
                <i className="fa-solid fa-arrow-left text-lg"></i>
              </Link>
              <h2 className="text-2xl font-black text-[#3e2723]">Profil Saya</h2>
            </header>

            {/* Content */}
            <main className="flex-1 p-6 overflow-y-auto no-scrollbar bg-gray-50">
              
              {/* Kartu Profil Utama */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 text-center mb-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-[#fbc02d]"></div>
                
                <img 
                  src={avatarUrl} 
                  alt="Avatar"
                  className="w-24 h-24 rounded-full mx-auto mb-4 border-4 border-[#fff8e1] shadow-sm"
                />
                
                <h3 className="text-2xl font-black text-[#3e2723]">{user.name || 'Karyawan'}</h3>
                <p className="text-gray-500 font-bold mb-2">{user.role || 'Staff Roti Ropi'}</p>
                <p className="text-sm bg-[#fff8e1] text-[#3e2723] px-3 py-1 rounded-full inline-block font-semibold border border-[#fbc02d]/30">
                  ID: <span>{user.employee_id || 'Belum Terhubung'}</span>
                </p>
              </div>

              {/* Kartu Info Kontak */}
              <div className="bg-white rounded-3xl p-2 shadow-sm border border-gray-100 mb-8">
                <div className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 bg-[#fff8e1] rounded-full flex items-center justify-center shrink-0">
                    <i className="fa-regular fa-envelope text-[#fbc02d] text-lg"></i>
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-0.5">Email Akses</p>
                    <p className="font-bold text-[#3e2723] truncate">{user.email || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Tombol Logout */}
              <button 
                onClick={handleLogout} 
                className="w-full bg-red-50 text-red-600 font-black py-4 rounded-2xl border border-red-100 hover:bg-red-100 active:scale-95 transition-all flex justify-center items-center shadow-sm"
              >
                <i className="fa-solid fa-arrow-right-from-bracket mr-2 text-lg"></i> Keluar (Logout)
              </button>
              
            </main>

          </div>
        </div>

      </div>
    </div>
  );
};

export default Profil;