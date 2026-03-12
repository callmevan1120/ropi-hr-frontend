import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

interface User {
  name: string;
  role?: string;
  employee_id: string;
  branch?: string;
}

interface LeaveHistory {
  leave_type: string;
  from_date: string;
  to_date: string;
  status: string;
  reason?: string;
}

const isCuti = (leaveType: string) => {
  const lower = leaveType.toLowerCase();
  return lower.includes('cuti') || lower.includes('tahunan');
};

const Cuti = () => {
  const navigate = useNavigate();
  const BACKEND = (import.meta as any).env?.VITE_API_URL || 'https://ropi-hr-backend.vercel.app';

  const [user, setUser] = useState<User | null>(null);
  const [leaveBalance, setLeaveBalance] = useState<string>('-');
  const [leaveHistory, setLeaveHistory] = useState<LeaveHistory[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem('ropi_user');
    if (!userData) {
      navigate('/');
      return;
    }
    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    fetchDataCuti(parsedUser.employee_id);
  }, [navigate]);

  const fetchDataCuti = async (employeeId: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${BACKEND}/api/leaves?employee_id=${encodeURIComponent(employeeId)}`);
      const data = await res.json();

      if (data.success) {
        const cutiOnly = (data.history || []).filter((item: LeaveHistory) => isCuti(item.leave_type));
        setLeaveHistory(cutiOnly);
        setLeaveBalance(data.balance !== undefined ? String(data.balance) : '0');
      } else {
        setLeaveBalance('0');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Gagal terhubung ke server.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getStatusBadge = (status: string) => {
    const s = status?.toLowerCase();
    if (s === 'approved') {
      return (
        <span className="flex items-center gap-1 bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded-full">
          <i className="fa-solid fa-circle-check text-[9px]"></i> Disetujui
        </span>
      );
    }
    if (s === 'rejected') {
      return (
        <span className="flex items-center gap-1 bg-red-100 text-red-600 text-[10px] font-black px-2 py-0.5 rounded-full">
          <i className="fa-solid fa-circle-xmark text-[9px]"></i> Ditolak
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 bg-yellow-100 text-yellow-700 text-[10px] font-black px-2 py-0.5 rounded-full">
        <i className="fa-solid fa-clock text-[9px]"></i> Menunggu
      </span>
    );
  };

  return (
    <div className="bg-gray-100 flex items-center justify-center min-h-screen font-sans text-[#3e2723] selection:bg-[#fbc02d] md:p-6 lg:p-10 w-full overflow-hidden">
      <style>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
      
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
          <div className="w-full max-w-sm bg-white h-full flex flex-col relative mx-auto">

            {/* Header */}
            <div className="bg-[#3e2723] pt-12 pb-6 px-6 shrink-0 shadow-md z-10 rounded-b-[1.5rem]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Link to="/home" className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform">
                    <i className="fa-solid fa-arrow-left"></i>
                  </Link>
                  <h1 className="text-xl font-black text-[#fbc02d]">Informasi Cuti</h1>
                </div>
                <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white">
                  <i className="fa-solid fa-calendar-check"></i>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar pb-24">

              {/* Sisa Kuota */}
              <div className="px-6 pt-5">
                <h3 className="font-black text-[#3e2723] text-base mb-3">Sisa Kuota Cuti</h3>
                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                  <div className="min-w-[140px] bg-white p-5 rounded-3xl shadow-sm border border-gray-100 text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-[#fbc02d]"></div>
                    <div className="w-16 h-16 rounded-full border-[5px] border-[#fbc02d] flex flex-col items-center justify-center mx-auto mb-2 mt-1 shadow-inner bg-[#fff8e1]">
                      <span className="text-xl font-black text-[#3e2723]">{leaveBalance}</span>
                    </div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide">Cuti Tahunan</p>
                  </div>
                </div>
                <p className="mt-3 text-[10px] text-gray-400 leading-relaxed italic bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                  * Jika ada ketidaksesuaian jatah atau ingin mengajukan cuti, harap hubungi bagian HRD.
                </p>
              </div>

              {/* Riwayat Cuti */}
              <div className="px-6 mt-6">
                <h3 className="font-black text-[#3e2723] text-base mb-4">Riwayat Cuti</h3>
                <div className="flex flex-col gap-3">
                  {isLoading ? (
                    <div className="bg-gray-50 rounded-2xl p-6 text-center text-gray-400 border border-gray-100">
                      <div className="w-6 h-6 border-2 border-[#fbc02d] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                      <p className="text-sm font-bold">Sinkronisasi data...</p>
                    </div>
                  ) : errorMsg ? (
                    <div className="text-center text-red-400 text-xs font-bold py-10">{errorMsg}</div>
                  ) : leaveHistory.length > 0 ? (
                    leaveHistory.map((item, index) => (
                      <div
                        key={index}
                        className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:border-[#fbc02d]/40 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[#fff8e1] rounded-full flex items-center justify-center shrink-0 border border-[#fbc02d]/20">
                              <i className="fa-solid fa-calendar-minus text-[#fbc02d] text-sm"></i>
                            </div>
                            <div>
                              <p className="text-sm font-black text-[#3e2723] leading-tight">{item.leave_type}</p>
                              <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-bold mt-0.5">
                                <span>{formatDate(item.from_date)}</span>
                                {item.from_date !== item.to_date && (
                                  <> <i className="fa-solid fa-arrow-right text-[8px] text-[#fbc02d]"></i> <span>{formatDate(item.to_date)}</span></>
                                )}
                              </div>
                            </div>
                          </div>
                          {getStatusBadge(item.status)}
                        </div>
                        {item.reason && (
                          <div className="mt-3 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                            <p className="text-[10px] text-gray-500 leading-relaxed font-medium">
                              "{item.reason}"
                            </p>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center bg-gray-50 rounded-3xl border border-dashed border-gray-200">
                      <div className="w-14 h-14 bg-white rounded-full shadow-sm flex items-center justify-center mb-3">
                        <i className="fa-solid fa-calendar-minus text-xl text-gray-300"></i>
                      </div>
                      <p className="text-sm font-black text-gray-500">Belum Ada Riwayat Cuti</p>
                      <p className="text-[10px] text-gray-400 mt-1 px-4">Riwayat cuti tahunan kamu akan otomatis muncul di sini.</p>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Navigation Bottom */}
            <nav className="absolute bottom-0 left-0 right-0 w-full bg-white border-t border-gray-100 px-4 py-3 flex justify-between z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.02)]">
              <Link to="/home" className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors">
                <i className="fa-solid fa-house text-xl mb-1"></i>
                <span className="text-[10px] font-black uppercase">Home</span>
              </Link>
              <Link to="/absen" className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors">
                <i className="fa-solid fa-clipboard-user text-xl mb-1"></i>
                <span className="text-[10px] font-black uppercase">Absen</span>
              </Link>
              <Link to="/izin" className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors">
                <i className="fa-solid fa-envelope-open-text text-xl mb-1"></i>
                <span className="text-[10px] font-black uppercase">Izin</span>
              </Link>
              <div className="flex flex-col items-center text-[#3e2723] w-1/4">
                <i className="fa-solid fa-calendar-minus text-xl mb-1 drop-shadow-md"></i>
                <span className="text-[10px] font-black uppercase">Cuti</span>
              </div>
            </nav>

          </div>
        </div>

      </div>
    </div>
  );
};

export default Cuti;