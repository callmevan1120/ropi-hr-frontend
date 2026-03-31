import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import BottomNav from '../components/BottomNav';

interface User {
  name: string;
  employee_id: string;
}

interface OvertimeRecord {
  name: string;
  overtime_date: string;
  start_time: string;
  end_time: string;
  description: string;
  status: string;
  creation?: string;
}

const Lembur = () => {
  const navigate = useNavigate();
  const BACKEND = (import.meta as any).env?.VITE_API_URL || 'https://ropi-hr-backend.vercel.app';

  const [user, setUser] = useState<User | null>(null);

  // State Form
  const [overtimeDate, setOvertimeDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // State Riwayat
  const [overtimeHistory, setOvertimeHistory] = useState<OvertimeRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [showForm, setShowForm] = useState<boolean>(true);

  useEffect(() => {
    const userData = localStorage.getItem('ropi_user');
    if (!userData) { navigate('/'); return; }
    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    fetchOvertimeHistory(parsedUser.employee_id);
  }, [navigate]);

  const fetchOvertimeHistory = async (employeeId: string) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`${BACKEND}/api/attendance/overtime-history?employee_id=${employeeId}&_t=${Date.now()}`);
      const data = await res.json();
      if (data.success) {
        setOvertimeHistory(data.data || []);
      }
    } catch (err) {
      console.error('Gagal mengambil riwayat lembur', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !overtimeDate || !startTime || !endTime || !reason) {
      alert('Mohon lengkapi semua form yang wajib diisi!');
      return;
    }
    
    // Validasi jam
    if (startTime >= endTime) {
      alert('Jam selesai harus lebih besar dari jam mulai!');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${BACKEND}/api/attendance/overtime-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: user.employee_id,
          overtime_date: overtimeDate,
          start_time: startTime,
          end_time: endTime,
          description: reason,
        }),
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        alert('✅ Lembur berhasil diajukan! Menunggu persetujuan HRD.');
        setOvertimeDate(''); setStartTime(''); setEndTime(''); setReason('');
        fetchOvertimeHistory(user.employee_id);
        setShowForm(false);
      } else {
        alert(data.message || 'Gagal mengajukan lembur.');
      }
    } catch (err) {
      alert('Terjadi kesalahan koneksi ke server.');
    } finally {
      setIsSubmitting(false);
    }
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
        <i className="fa-solid fa-clock text-[9px]"></i> Pending
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { weekday:'short', day: '2-digit', month: 'long', year: 'numeric' });
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return '-';
    return timeStr.substring(0, 5);
  };

  return (
    <div className="bg-gray-100 flex items-center justify-center min-h-screen font-sans text-[#3e2723] selection:bg-[#fbc02d] md:p-6 lg:p-10 w-full overflow-hidden">
      <style>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>

      <div className="w-full md:max-w-4xl lg:max-w-5xl bg-white md:rounded-[3rem] h-screen md:h-[600px] lg:h-[700px] relative shadow-2xl flex flex-col md:flex-row overflow-hidden border border-gray-200">

        {/* BAGIAN KIRI (Desktop Info) - TEMA COKLAT KUNING */}
        <div className="hidden md:flex flex-col w-1/2 bg-[#3e2723] relative p-12 lg:p-16 justify-between overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <div className="absolute -top-20 -left-20 w-96 h-96 bg-[#fbc02d] rounded-full blur-3xl"></div>
            <div className="absolute bottom-10 -right-10 w-72 h-72 bg-orange-400 rounded-full blur-3xl"></div>
          </div>
          <div className="relative z-10">
            <div className="w-20 h-20 bg-[#fbc02d] rounded-2xl flex items-center justify-center mb-8 shadow-lg shadow-[#fbc02d]/20 rotate-3">
              <i className="fa-solid fa-business-time text-[#3e2723] text-4xl -rotate-3"></i>
            </div>
            <h1 className="text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">
              Ropi<span className="text-[#fbc02d]">HR</span> <br /> Overtime.
            </h1>
            <p className="text-white/70 mt-6 font-medium text-base lg:text-lg leading-relaxed max-w-sm">
              Ajukan jam lembur dengan mudah dan pantau status persetujuan dari HRD secara real-time.
            </p>
          </div>
        </div>

        {/* BAGIAN KANAN (Aplikasi HP) */}
        <div className="flex-1 flex justify-center bg-gray-50 relative z-20 w-full md:w-1/2 h-full border-l border-gray-200">
          <div className="w-full max-w-sm bg-gray-50 h-full flex flex-col relative mx-auto shadow-none md:shadow-[0_0_15px_rgba(0,0,0,0.05)] overflow-hidden">

            {/* Header Mobile - TEMA COKLAT */}
            <div className="bg-[#3e2723] pt-12 pb-6 px-6 shrink-0 shadow-md z-10 rounded-b-[1.5rem]">
              <div className="flex items-center gap-3">
                <Link to="/home" className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform border border-white/10 hover:bg-white/20">
                  <i className="fa-solid fa-arrow-left"></i>
                </Link>
                <h1 className="text-xl font-black text-white">Pengajuan Lembur</h1>
              </div>
              <div className="flex mt-5 bg-white/5 rounded-xl p-1 gap-1 border border-white/10">
                <button
                  onClick={() => setShowForm(true)}
                  className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${showForm ? 'bg-[#fbc02d] text-[#3e2723] shadow-md' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                >
                  <i className="fa-solid fa-paper-plane mr-1.5"></i>Ajukan
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${!showForm ? 'bg-[#fbc02d] text-[#3e2723] shadow-md' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                >
                  <i className="fa-solid fa-clock-rotate-left mr-1.5"></i>Riwayat
                </button>
              </div>
            </div>

            {/* KONTEN: FORM PENGAJUAN */}
            {showForm && (
              // FIX LAYOUT: Tambah pb-32 agar area scroll lebih panjang untuk ruang Pop-up Jam HP
              <div className="flex-1 overflow-y-auto pt-6 px-6 no-scrollbar pb-32 bg-gray-50">
                <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 flex gap-3 shadow-sm items-start mb-6">
                  <i className="fa-solid fa-circle-info text-amber-500 text-lg mt-0.5"></i>
                  <p className="text-[11px] text-amber-900 font-medium leading-relaxed">
                    Pastikan pengajuan lembur dilakukan maksimal dalam waktu 1×24 jam sebelum mengisi form ini!
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                  <div>
                    <label className="text-xs font-black text-[#3e2723] uppercase tracking-wider mb-1.5 block ml-1">
                      Tanggal Lembur <span className="text-red-500">*</span>
                    </label>
                    <input type="date" value={overtimeDate} onChange={(e) => setOvertimeDate(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-[#3e2723] outline-none focus:border-[#fbc02d] focus:ring-2 focus:ring-[#fbc02d]/20 transition-all shadow-sm" required />
                  </div>

                  {/* FIX LAYOUT JAM: Beri gap yang pas dan pastikan label rapi */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-black text-[#3e2723] uppercase tracking-wider mb-1.5 block ml-1">Dari Jam <span className="text-red-500">*</span></label>
                      <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-xl py-3 px-3 text-sm font-bold text-[#3e2723] outline-none focus:border-[#fbc02d] focus:ring-2 focus:ring-[#fbc02d]/20 transition-all shadow-sm" required />
                    </div>
                    <div>
                      <label className="text-xs font-black text-[#3e2723] uppercase tracking-wider mb-1.5 block ml-1">Sampai Jam <span className="text-red-500">*</span></label>
                      <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-xl py-3 px-3 text-sm font-bold text-[#3e2723] outline-none focus:border-[#fbc02d] focus:ring-2 focus:ring-[#fbc02d]/20 transition-all shadow-sm" required />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-black text-[#3e2723] uppercase tracking-wider mb-1.5 block ml-1">
                      Keterangan Pekerjaan <span className="text-red-500">*</span>
                    </label>
                    <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                      placeholder="Contoh: Closing outlet, rekap stok barang..."
                      className="w-full bg-white border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-[#3e2723] outline-none focus:border-[#fbc02d] focus:ring-2 focus:ring-[#fbc02d]/20 transition-all shadow-sm resize-none" required></textarea>
                  </div>

                  <button type="submit" disabled={isSubmitting}
                    className={`mt-2 w-full py-4 rounded-xl text-sm font-black transition-all active:scale-95 flex items-center justify-center gap-2 ${isSubmitting ? 'bg-[#fbc02d]/70 text-[#3e2723]/70 cursor-not-allowed' : 'bg-[#fbc02d] text-[#3e2723] hover:bg-[#f9a825] shadow-lg shadow-[#fbc02d]/30'}`}>
                    {isSubmitting ? (
                      <><i className="fa-solid fa-spinner fa-spin"></i> Memproses...</>
                    ) : (
                      <><i className="fa-solid fa-paper-plane"></i> Kirim Pengajuan Lembur</>
                    )}
                  </button>
                </form>
              </div>
            )}

            {/* KONTEN: RIWAYAT LEMBUR */}
            {!showForm && (
              <div className="flex-1 overflow-y-auto pt-6 px-6 no-scrollbar pb-32 bg-gray-50">
                {isLoadingHistory ? (
                  <div className="flex flex-col justify-center items-center h-40 text-gray-400">
                    <i className="fa-solid fa-circle-notch fa-spin text-3xl mb-3 text-[#fbc02d]"></i>
                    <p className="text-xs font-bold">Memuat riwayat...</p>
                  </div>
                ) : overtimeHistory.length === 0 ? (
                  <div className="flex flex-col justify-center items-center h-40 text-gray-400 bg-white rounded-2xl border border-gray-100 border-dashed">
                    <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                      <i className="fa-solid fa-folder-open text-gray-300 text-xl"></i>
                    </div>
                    <p className="text-xs font-bold">Belum ada riwayat lembur</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {overtimeHistory.map((item, idx) => (
                      <div key={idx} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden group hover:border-[#fbc02d]/50 transition-colors">
                        <div className="absolute top-0 left-0 w-1 h-full bg-[#fbc02d] rounded-l-2xl opacity-100"></div>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-0.5">TANGGAL LEMBUR</span>
                            <h3 className="text-sm font-black text-[#3e2723]">{formatDate(item.overtime_date)}</h3>
                          </div>
                          {getStatusBadge(item.status)}
                        </div>
                        <div className="flex items-center gap-2 mb-3 bg-gray-50 rounded-lg p-2 border border-gray-100">
                           <i className="fa-solid fa-clock text-[#fbc02d] text-xs"></i>
                           <span className="text-xs font-bold text-[#3e2723]">{formatTime(item.start_time)} - {formatTime(item.end_time)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-0.5">KETERANGAN</span>
                          <p className="text-xs text-gray-600 font-medium leading-relaxed bg-white border border-gray-100 p-2 rounded-lg italic">"{item.description}"</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <BottomNav />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Lembur;