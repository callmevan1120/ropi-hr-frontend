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

// Helper: apakah tipe ini termasuk CUTI (bukan izin)
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
        // Filter hanya yang merupakan CUTI (bukan izin)
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
    <div className="bg-gray-100 flex justify-center min-h-screen font-sans">
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="w-full max-w-sm bg-white min-h-screen flex flex-col shadow-2xl relative">

        {/* Header */}
        <div className="bg-[#3e2723] pt-12 pb-6 px-6 shrink-0 shadow-md z-10">
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
        <div className="flex-1 overflow-y-auto no-scrollbar">

          {/* Sisa Kuota */}
          <div className="px-6 pt-5">
            <h3 className="font-black text-[#3e2723] text-base mb-3">Sisa Kuota Cuti</h3>
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
              <div className="min-w-[140px] bg-white p-5 rounded-3xl shadow-sm border border-gray-100 text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-[#fbc02d]"></div>
                <div className="w-16 h-16 rounded-full border-[5px] border-[#fbc02d] flex flex-col items-center justify-center mx-auto mb-2 mt-1">
                  <span className="text-lg font-black text-[#3e2723]">{leaveBalance}</span>
                </div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide">Cuti Tahunan</p>
              </div>
            </div>
            <p className="mt-3 text-[10px] text-gray-400 leading-relaxed italic">
              * Jika ada ketidaksesuaian jatah atau ingin mengajukan cuti, harap hubungi bagian HRD.
            </p>
          </div>

          {/* Riwayat Cuti */}
          <div className="px-6 mt-8">
            <h3 className="font-black text-[#3e2723] text-base mb-4">Riwayat Cuti</h3>
            <div className="flex flex-col gap-3">
              {isLoading ? (
                <div className="bg-gray-50 rounded-2xl p-6 text-center text-gray-400">
                  <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-sm font-bold">Sinkronisasi data...</p>
                </div>
              ) : errorMsg ? (
                <div className="text-center text-red-400 text-xs font-bold py-10">{errorMsg}</div>
              ) : leaveHistory.length > 0 ? (
                leaveHistory.map((item, index) => (
                  <div
                    key={index}
                    className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-[#fff8e1] rounded-full flex items-center justify-center shrink-0">
                          <i className="fa-solid fa-calendar-minus text-[#fbc02d] text-sm"></i>
                        </div>
                        <p className="text-sm font-black text-[#3e2723] leading-tight">{item.leave_type}</p>
                      </div>
                      {getStatusBadge(item.status)}
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium pl-10">
                      <i className="fa-regular fa-calendar text-[10px]"></i>
                      <span>
                        {formatDate(item.from_date)}
                        {item.from_date !== item.to_date && (
                          <> &rarr; {formatDate(item.to_date)}</>
                        )}
                      </span>
                    </div>

                    {item.reason && (
                      <p className="text-[11px] text-gray-400 pl-10 mt-2 leading-relaxed italic">
                        <i className="fa-solid fa-quote-left text-[8px] mr-1 text-gray-300"></i>
                        {item.reason}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 bg-[#fff8e1] rounded-full flex items-center justify-center mb-4">
                    <i className="fa-solid fa-calendar-minus text-2xl text-[#fbc02d]"></i>
                  </div>
                  <p className="text-sm font-black text-[#3e2723]">Belum Ada Riwayat Cuti</p>
                  <p className="text-[11px] text-gray-400 mt-1">Riwayat cuti tahunan kamu akan muncul di sini</p>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Navigation Bottom */}
        <nav className="shrink-0 w-full bg-white border-t border-gray-100 px-4 py-3 flex justify-between z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.02)]">
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
  );
};

export default Cuti;