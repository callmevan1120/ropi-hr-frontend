import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import BottomNav from '../components/BottomNav';

interface User {
  name: string;
  role?: string;
  employee_id: string;
  branch?: string;
}

interface LeaveHistory {
  name: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  status: string;
  description?: string;
  total_leave_days?: number;
}

const isCuti = (leaveType: string) => {
  const lower = leaveType.toLowerCase();
  return lower.includes('cuti') || lower.includes('tahunan');
};

const Cuti = () => {
  const navigate = useNavigate();
  const BACKEND = (import.meta as any).env?.VITE_API_URL || 'https://ropi-hr-backend.vercel.app';

  const [user, setUser] = useState<User | null>(null);
  const [leaveBalance, setLeaveBalance] = useState<number>(0);
  const [leaveTotal, setLeaveTotal] = useState<number>(0);
  const [leaveHistory, setLeaveHistory] = useState<LeaveHistory[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // State untuk Form Pengajuan Cuti
  const [showForm, setShowForm] = useState<boolean>(false);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  
  // State untuk mencari nama persis "Cuti Tahunan" dari ERPNext
  const [exactCutiName, setExactCutiName] = useState<string>('Cuti Tahunan');

  useEffect(() => {
    const userData = localStorage.getItem('ropi_user');
    if (!userData) { navigate('/'); return; }
    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    
    fetchLeaveTypes();
    fetchDataCuti(parsedUser.employee_id);
  }, [navigate]);

  // Mencari nama tipe cuti yang valid di ERPNext
  const fetchLeaveTypes = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/attendance/leave-types`);
      const data = await res.json();
      if (data.success) {
        const cutiType = data.data.find((item: any) => isCuti(item.name));
        if (cutiType) {
          setExactCutiName(cutiType.name);
        }
      }
    } catch (err) { console.error('Gagal mengambil tipe cuti', err); }
  };

  const fetchDataCuti = async (employeeId: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const resBalance = await fetch(`${BACKEND}/api/leaves?employee_id=${encodeURIComponent(employeeId)}`);
      const dataBalance = await resBalance.json();
      if (dataBalance.success) {
        setLeaveBalance(dataBalance.balance !== undefined ? Number(dataBalance.balance) : 0);
        setLeaveTotal(dataBalance.total !== undefined ? Number(dataBalance.total) : 0);
      } else {
        setLeaveBalance(0);
        setLeaveTotal(0);
      }

      const resHistory = await fetch(`${BACKEND}/api/attendance/leave-history?employee_id=${encodeURIComponent(employeeId)}`);
      const dataHistory = await resHistory.json();
      
      if (dataHistory.success) {
        const cutiOnly = dataHistory.data.filter((item: LeaveHistory) => isCuti(item.leave_type));
        setLeaveHistory(cutiOnly);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Gagal terhubung ke server.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !fromDate || !toDate || !reason.trim()) {
      alert('Peringatan: Tanggal dan Alasan Cuti WAJIB diisi dengan jelas!');
      return;
    }
    
    if (reason.trim().length < 5) {
      alert('Peringatan: Alasan cuti terlalu singkat. Mohon jelaskan lebih detail.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const res = await fetch(`${BACKEND}/api/attendance/leave-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: user.employee_id,
          leave_type: exactCutiName, 
          from_date: fromDate,
          to_date: toDate,
          reason: reason,
        }),
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        alert('✅ Cuti berhasil diajukan! Menunggu persetujuan HRD.');
        setFromDate(''); setToDate(''); setReason('');
        setShowForm(false);
        fetchDataCuti(user.employee_id); 
      } else {
        alert(data.message || 'Gagal mengajukan cuti. Pastikan sisa kuota cuti mencukupi.');
      }
    } catch (err) {
      alert('Terjadi kesalahan koneksi ke server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getStatusBadge = (status: string) => {
    const s = status?.toLowerCase();
    if (s === 'approved') return (
      <span className="flex items-center gap-1 bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded-full border border-green-200">
        <i className="fa-solid fa-circle-check text-[9px]"></i> Disetujui
      </span>
    );
    if (s === 'rejected') return (
      <span className="flex items-center gap-1 bg-red-100 text-red-600 text-[10px] font-black px-2 py-0.5 rounded-full border border-red-200">
        <i className="fa-solid fa-circle-xmark text-[9px]"></i> Ditolak
      </span>
    );
    return (
      <span className="flex items-center gap-1 bg-yellow-100 text-yellow-700 text-[10px] font-black px-2 py-0.5 rounded-full border border-yellow-200">
        <i className="fa-solid fa-clock text-[9px]"></i> Menunggu
      </span>
    );
  };

  // LOGIKA WARNA KUOTA DINAMIS
  const getBalanceColorTheme = () => {
    if (leaveTotal === 0) return { bg: 'bg-gray-50', text: 'text-gray-400', border: 'border-gray-200', icon: 'text-gray-400', stroke: 'border-gray-300' };
    
    const ratio = leaveBalance / leaveTotal;
    
    // Sisa di atas 50% -> Hijau (Aman)
    if (ratio >= 0.5) return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', icon: 'text-green-500', stroke: 'border-green-500' };
    
    // Sisa di antara 25% - 50% -> Oranye/Kuning (Peringatan)
    if (ratio >= 0.25) return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', icon: 'text-orange-500', stroke: 'border-orange-400' };
    
    // Sisa di bawah 25% (atau habis) -> Merah (Bahaya)
    return { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', icon: 'text-red-500', stroke: 'border-red-500' };
  };

  const theme = getBalanceColorTheme();

  return (
    <div className="bg-gray-100 flex items-center justify-center min-h-screen font-sans text-[#3e2723] selection:bg-[#fbc02d] md:p-6 lg:p-10 w-full overflow-hidden">
      <style>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>

      <div className="w-full md:max-w-4xl lg:max-w-5xl bg-white md:rounded-[3rem] h-screen md:h-[600px] lg:h-[700px] relative shadow-2xl flex flex-col md:flex-row overflow-hidden border border-gray-200">

        {/* BAGIAN KIRI */}
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

        {/* BAGIAN KANAN */}
        <div className="flex-1 flex justify-center bg-gray-50 relative z-20 w-full md:w-1/2 h-full border-l border-gray-200">
          <div className="w-full max-w-sm bg-white h-full flex flex-col relative mx-auto">

            {/* Header */}
            <div className="bg-[#3e2723] pt-12 pb-6 px-6 shrink-0 shadow-md z-10 rounded-b-[1.5rem]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Link to="/home" className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform border border-white/10">
                    <i className="fa-solid fa-arrow-left"></i>
                  </Link>
                  <h1 className="text-xl font-black text-[#fbc02d]">Informasi Cuti</h1>
                </div>
                <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-[#fbc02d]">
                  <i className="fa-solid fa-plane-departure"></i>
                </div>
              </div>
              
              <div className="flex mt-5 bg-white/10 rounded-xl p-1 gap-1 border border-white/5">
                <button
                  onClick={() => setShowForm(true)}
                  className={`flex-1 py-2 rounded-lg text-[11px] font-black transition-all ${showForm ? 'bg-[#fbc02d] text-[#3e2723] shadow-md' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                >
                  <i className="fa-solid fa-calendar-plus mr-1.5"></i>Ajukan Cuti
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className={`flex-1 py-2 rounded-lg text-[11px] font-black transition-all ${!showForm ? 'bg-[#fbc02d] text-[#3e2723] shadow-md' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                >
                  <i className="fa-solid fa-clock-rotate-left mr-1.5"></i>Riwayat
                </button>
              </div>
            </div>

            {/* KONTEN */}
            <div className="flex-1 overflow-y-auto no-scrollbar pb-24 bg-gray-50">
              
              {/* FORM PENGAJUAN CUTI */}
              {showForm ? (
                <div className="px-6 pt-5">
                  {/* KOTAK PERINGATAN SYARAT CUTI */}
                  <div className="bg-[#fff8e1] p-4 rounded-2xl border border-[#fbc02d]/40 flex gap-3 shadow-sm items-start mb-6">
                    <i className="fa-solid fa-circle-info text-[#fbc02d] text-lg mt-0.5"></i>
                    <div>
                      <p className="text-[11px] text-[#3e2723] font-black leading-relaxed mb-1">
                        Syarat & Ketentuan Cuti:
                      </p>
                      <ul className="text-[10px] text-[#3e2723]/80 list-disc pl-3 flex flex-col gap-1 mb-2 font-medium">
                        <li>Hanya berlaku bagi karyawan dengan <b className="text-[#3e2723]">masa kerja &gt; 1 tahun</b>.</li>
                        <li>Alasan cuti <b className="text-[#3e2723]">wajib</b> diisi dengan jelas.</li>
                      </ul>
                      <p className="text-[11px] text-[#3e2723] font-medium leading-relaxed pt-2 border-t border-[#fbc02d]/20 flex items-center gap-1.5">
                        Kuota Cuti Tahunan: 
                        <span className={`font-black px-1.5 py-0.5 rounded-md ${theme.bg} ${theme.text} ${theme.border} border`}>
                          {leaveBalance} dari {leaveTotal} Hari
                        </span>
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-black text-[#3e2723] uppercase tracking-wider mb-1.5 block ml-1">Dari <span className="text-red-500">*</span></label>
                        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-[#3e2723] outline-none focus:border-[#fbc02d] focus:ring-2 focus:ring-[#fbc02d]/20 transition-all shadow-sm" required />
                      </div>
                      <div>
                        <label className="text-xs font-black text-[#3e2723] uppercase tracking-wider mb-1.5 block ml-1">Sampai <span className="text-red-500">*</span></label>
                        <input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-[#3e2723] outline-none focus:border-[#fbc02d] focus:ring-2 focus:ring-[#fbc02d]/20 transition-all shadow-sm" required />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-black text-[#3e2723] uppercase tracking-wider mb-1.5 block ml-1">
                        Alasan Cuti <span className="text-red-500">*</span>
                      </label>
                      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                        placeholder="Contoh: Menghadiri acara pernikahan keluarga di luar kota..."
                        className="w-full bg-white border border-gray-200 rounded-xl py-3 px-4 text-sm font-medium text-[#3e2723] outline-none focus:border-[#fbc02d] focus:ring-2 focus:ring-[#fbc02d]/20 transition-all resize-none shadow-sm"
                        required></textarea>
                    </div>

                    <button type="submit" disabled={isSubmitting || leaveBalance <= 0}
                      className={`w-full font-black text-base py-4 rounded-2xl active:scale-95 transition-all mt-4 flex justify-center items-center gap-2 shadow-md ${
                        leaveBalance <= 0 
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300' 
                        : 'bg-[#fbc02d] hover:bg-[#f9a825] text-[#3e2723] shadow-[#fbc02d]/30'
                      }`}>
                      {isSubmitting
                        ? <><i className="fa-solid fa-spinner fa-spin"></i> Memproses...</>
                        : <><i className="fa-solid fa-calendar-check"></i> {leaveBalance <= 0 ? 'Belum Memenuhi Syarat / Kuota Habis' : 'Kirim Pengajuan Cuti'}</>}
                    </button>
                  </form>
                </div>
              ) : (
                /* RIWAYAT & KUOTA CUTI */
                <>
                  <div className="px-6 pt-5">
                    <h3 className="font-black text-[#3e2723] text-sm uppercase tracking-wider mb-3">Sisa Kuota Cuti Tahunan</h3>
                    
                    {/* WIDGET SALDO DINAMIS */}
                    <div className={`p-5 rounded-3xl shadow-sm border flex items-center justify-between transition-colors ${theme.bg} ${theme.border}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-full border-4 flex items-center justify-center bg-white ${theme.stroke}`}>
                          <i className={`fa-solid fa-plane-departure text-lg ${theme.icon}`}></i>
                        </div>
                        <div>
                          <p className={`text-[10px] font-black uppercase tracking-wide opacity-70 ${theme.text}`}>
                            {leaveBalance <= 0 ? 'Tidak Tersedia' : 'Tersedia'}
                          </p>
                          <p className={`text-3xl font-black leading-none mt-0.5 ${theme.text}`}>
                            {leaveBalance} <span className="text-sm opacity-80 font-bold ml-1">/ {leaveTotal} Hari</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-6 mt-6">
                    <h3 className="font-black text-[#3e2723] text-sm uppercase tracking-wider mb-4">Riwayat Pengajuan</h3>
                    <div className="flex flex-col gap-3">
                      {isLoading ? (
                        <div className="bg-white rounded-2xl p-6 text-center text-gray-400 border border-gray-100 shadow-sm">
                          <div className="w-6 h-6 border-2 border-[#fbc02d] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                          <p className="text-sm font-bold">Sinkronisasi data...</p>
                        </div>
                      ) : errorMsg ? (
                        <div className="text-center text-red-400 text-xs font-bold py-10">{errorMsg}</div>
                      ) : leaveHistory.length > 0 ? (
                        leaveHistory.map((item, index) => (
                          <div key={index} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:border-[#fbc02d]/40 transition-colors">
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
                                      <><i className="fa-solid fa-arrow-right text-[8px] text-[#fbc02d]"></i><span>{formatDate(item.to_date)}</span></>
                                    )}
                                    {item.total_leave_days && (
                                      <span className="ml-1 text-gray-300">({item.total_leave_days} hari)</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {getStatusBadge(item.status)}
                            </div>
                            {/* ALASAN CUTI DITAMPILKAN DI RIWAYAT */}
                            {item.description && (
                              <div className="mt-3 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                                <p className="text-[10px] text-gray-500 leading-relaxed font-medium"><b>Alasan:</b> "{item.description}"</p>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-3xl border border-dashed border-gray-200 shadow-sm">
                          <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                            <i className="fa-solid fa-inbox text-xl text-gray-300"></i>
                          </div>
                          <p className="text-sm font-black text-gray-500">Belum Ada Riwayat Cuti</p>
                          <p className="text-[10px] text-gray-400 mt-1 px-4">Pengajuan cuti tahunan kamu akan otomatis muncul di sini.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

            </div>

            {/* BottomNav component */}
            <BottomNav />

          </div>
        </div>

      </div>
    </div>
  );
};

export default Cuti;