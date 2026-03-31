import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

const BottomNav = () => {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setShowMoreMenu(false);
  }, [location.pathname]);

  const getNavClass = (path: string) => {
    const isActive = location.pathname === path;
    return `flex flex-col items-center w-1/4 transition-colors active:scale-95 ${
      isActive ? 'text-[#3e2723] drop-shadow-md' : 'text-gray-300 hover:text-[#3e2723]'
    }`;
  };

  return (
    <>
      <nav className="absolute bottom-0 left-0 right-0 w-full bg-white border-t border-gray-100 px-4 py-3 flex justify-between z-40 shadow-[0_-5px_15px_rgba(0,0,0,0.02)]">
        <Link to="/home" className={getNavClass('/home')}>
          <i className="fa-solid fa-house text-xl mb-1"></i>
          <span className="text-[10px] font-black uppercase">Home</span>
        </Link>
        <Link to="/absen" className={getNavClass('/absen')}>
          <i className="fa-solid fa-clipboard-user text-xl mb-1"></i>
          <span className="text-[10px] font-black uppercase">Absen</span>
        </Link>
        <Link to="/izin" className={getNavClass('/izin')}>
          <i className="fa-solid fa-envelope-open-text text-xl mb-1"></i>
          <span className="text-[10px] font-black uppercase">Izin</span>
        </Link>
        <button onClick={() => setShowMoreMenu(true)} className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors active:scale-95">
          <i className="fa-solid fa-bars text-xl mb-1"></i>
          <span className="text-[10px] font-black uppercase">Menu</span>
        </button>
      </nav>

      {showMoreMenu && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowMoreMenu(false)}>
          <div className="bg-white w-full max-w-sm rounded-t-[2.5rem] p-6 shadow-2xl pb-10" style={{ animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' }} onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6"></div>
            <h3 className="text-[#3e2723] font-black text-lg mb-4 px-2">Menu Lainnya</h3>
            
            {/* GRID DIBUAT 4 KOLOM AGAR RAPI (Menu ke-5 otomatis turun ke bawah) */}
            <div className="grid grid-cols-4 gap-4">
              <Link to="/shift" className="flex flex-col items-center gap-2 group" onClick={() => setShowMoreMenu(false)}>
                <div className="w-14 h-14 bg-[#fff8e1] rounded-2xl flex items-center justify-center text-[#fbc02d] text-2xl group-hover:bg-[#fbc02d] group-hover:text-[#3e2723] transition-colors border border-[#fbc02d]/30">
                  <i className="fa-solid fa-calendar-day"></i>
                </div>
                <span className="text-[10px] font-bold text-[#3e2723]">Shift</span>
              </Link>
              
              <Link to="/cuti" className="flex flex-col items-center gap-2 group" onClick={() => setShowMoreMenu(false)}>
                <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500 text-2xl group-hover:bg-blue-500 group-hover:text-white transition-colors border border-blue-100">
                  <i className="fa-solid fa-calendar-minus"></i>
                </div>
                <span className="text-[10px] font-bold text-[#3e2723]">Cuti</span>
              </Link>

              {/* TOMBOL LEMBUR BARU DITAMBAHKAN DI SINI */}
              <Link to="/lembur" className="flex flex-col items-center gap-2 group" onClick={() => setShowMoreMenu(false)}>
                <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500 text-2xl group-hover:bg-indigo-500 group-hover:text-white transition-colors border border-indigo-100">
                  <i className="fa-solid fa-business-time"></i>
                </div>
                <span className="text-[10px] font-bold text-[#3e2723]">Lembur</span>
              </Link>
              
              <Link to="/slip-gaji" className="flex flex-col items-center gap-2 group" onClick={() => setShowMoreMenu(false)}>
                <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center text-green-500 text-2xl group-hover:bg-green-500 group-hover:text-white transition-colors border border-green-100">
                  <i className="fa-solid fa-money-check-dollar"></i>
                </div>
                <span className="text-[10px] font-bold text-[#3e2723]">Slip Gaji</span>
              </Link>
              
              <Link to="/profil" className="flex flex-col items-center gap-2 group" onClick={() => setShowMoreMenu(false)}>
                <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-500 text-2xl group-hover:bg-gray-200 transition-colors border border-gray-200">
                  <i className="fa-solid fa-user"></i>
                </div>
                <span className="text-[10px] font-bold text-[#3e2723]">Profil</span>
              </Link>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </>
  );
};

export default BottomNav;