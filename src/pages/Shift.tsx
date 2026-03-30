import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import BottomNav from '../components/BottomNav';

// ── Helpers ──────────────────────────────────────────────────────────
const isKaryawanKantor = (branch?: string): boolean => {
  if (!branch) return false;
  const b = branch.toLowerCase();
  return b.includes('klaten') || b.includes('ph') || b.includes('jakarta');
};
const isKaryawanOutlet = (branch?: string): boolean => !isKaryawanKantor(branch);

const formatTgl = (str?: string): string => {
  if (!str) return '-';
  const d = new Date(str);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

interface ShiftRecord {
  name: string;
  shift_type: string;
  from_date: string;
  to_date: string;
  status: string;
  docstatus: number;
  creation: string;
}

const STATUS_STYLE: Record<string, { bg: string; text: string; icon: string }> = {
  Approved: { bg: 'bg-green-100',  text: 'text-green-700',  icon: 'fa-circle-check'    },
  Rejected: { bg: 'bg-red-100',    text: 'text-red-600',    icon: 'fa-circle-xmark'    },
  Pending:  { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: 'fa-clock'           },
  Draft:    { bg: 'bg-gray-100',   text: 'text-gray-500',   icon: 'fa-file-pen'        },
};

// ── Komponen ─────────────────────────────────────────────────────────
const Shift = () => {
  const navigate = useNavigate();
  const BACKEND = (import.meta as any).env?.VITE_API_URL || 'https://ropi-hr-backend.vercel.app';

  const [user, setUser]               = useState<any>(null);
  const [isOutlet, setIsOutlet]       = useState(false);
  const [shiftList, setShiftList]     = useState<any[]>([]);
  const [approverList, setApproverList] = useState<string[]>([]);
  const [history, setHistory]         = useState<ShiftRecord[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab]     = useState<'form' | 'history'>('form');

  const [selectedShift,    setSelectedShift]    = useState('');
  const [selectedApprover, setSelectedApprover] = useState('');
  const [mode, setMode]                         = useState<'single' | 'range'>('single');

  const todayStr = new Date().toISOString().substring(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [fromDate, setFromDate]         = useState(todayStr);
  const [toDate, setToDate]             = useState(todayStr);

  // ── Load data awal ──────────────────────────────────────────────
  const SESSION_SHIFTS_KEY   = 'ropi_cache_shifts_raw';
  const SESSION_HR_KEY       = 'ropi_cache_hr_users';
  const CACHE_MAX_AGE_MS     = 5 * 60 * 1000;

  const readCache = (key: string): any | null => {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts > CACHE_MAX_AGE_MS) { sessionStorage.removeItem(key); return null; }
      return data;
    } catch { return null; }
  };

  const writeCache = (key: string, data: any) => {
    try { sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
  };

  useEffect(() => {
    const userData = localStorage.getItem('ropi_user');
    if (!userData) { navigate('/'); return; }
    const u = JSON.parse(userData);
    setUser(u);
    setIsOutlet(isKaryawanOutlet(u.branch));

    const savedShift = localStorage.getItem('ropi_selected_shift');
    if (savedShift) setSelectedShift(savedShift);

    const init = async () => {
      try {
        const isOutletUser = isKaryawanOutlet(u.branch);

        // Cek cache dulu untuk data statis
        const cachedShifts  = readCache(SESSION_SHIFTS_KEY);
        const cachedHrUsers = readCache(SESSION_HR_KEY);

        const fetches: Promise<any>[] = [
          cachedShifts  ? Promise.resolve(cachedShifts)  : fetch(`${BACKEND}/api/attendance/shifts`).then(r => r.json()),
          cachedHrUsers ? Promise.resolve(cachedHrUsers) : fetch(`${BACKEND}/api/attendance/hr-users`).then(r => r.json()),
        ];
        if (isOutletUser) {
          fetches.push(
            fetch(`${BACKEND}/api/attendance/shift-history?employee_id=${encodeURIComponent(u.employee_id)}`).then(r => r.json()),
          );
        }

        const [dataShifts, dataHr, dataHistory] = await Promise.all(fetches);

        if (dataShifts?.success && dataShifts.data) {
          if (!cachedShifts) writeCache(SESSION_SHIFTS_KEY, dataShifts);
          const outlet = dataShifts.data.filter(
            (s: any) => s.name.includes('Shift') || s.name.includes('Middle'),
          );
          setShiftList(outlet.sort((a: any, b: any) => a.name.localeCompare(b.name)));
        }

        const hrData = dataHr?.success !== undefined ? dataHr : cachedHrUsers;
        if (hrData && !cachedHrUsers) writeCache(SESSION_HR_KEY, dataHr);
        const list: string[] = hrData?.success && hrData.data?.length > 0
          ? hrData.data
          : ['hrdrotiropi@gmail.com'];
        setApproverList(list);
        setSelectedApprover(list[0]);

        if (isOutletUser && dataHistory?.success) {
          setHistory(dataHistory.data);
        }
      } catch {
        setApproverList(['hrdrotiropi@gmail.com']);
        setSelectedApprover('hrdrotiropi@gmail.com');
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [navigate]);

  const fetchHistory = async (employeeId: string) => {
    try {
      const res  = await fetch(`${BACKEND}/api/attendance/shift-history?employee_id=${encodeURIComponent(employeeId)}`);
      const data = await res.json();
      if (data.success) setHistory(data.data);
    } catch { /* silent */ }
  };

  // ── Submit ──────────────────────────────────────────────────────
  const tanganiSubmit = async () => {
    const finalFrom = mode === 'single' ? selectedDate : fromDate;
    const finalTo   = mode === 'single' ? selectedDate : toDate;
    if (!selectedShift || !finalFrom || !finalTo || !selectedApprover) {
      alert('Harap lengkapi semua field!'); return;
    }
    if (new Date(finalTo) < new Date(finalFrom)) {
      alert('Tanggal akhir tidak boleh sebelum tanggal mulai!'); return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${BACKEND}/api/attendance/shift-request`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id:  user.employee_id,
          shift_type:   selectedShift,
          from_date:    finalFrom,
          to_date:      finalTo,
          approver:     selectedApprover,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert('Pengajuan Shift berhasil dikirim ke HRD!');
        localStorage.setItem('ropi_selected_shift', selectedShift);
        // Refresh riwayat & pindah ke tab history
        await fetchHistory(user.employee_id);
        setActiveTab('history');
      } else {
        alert(`Gagal: ${data.message}`);
      }
    } catch {
      alert('Terjadi kesalahan jaringan.');
    }
    setIsSubmitting(false);
  };

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="bg-gray-100 flex justify-center min-h-screen font-sans text-[#3e2723]">
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}`}</style>

      <div className="w-full md:max-w-4xl lg:max-w-5xl bg-white md:rounded-[3rem] h-screen md:h-[600px] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-gray-200">

        {/* ── Desktop kiri ── */}
        <div className="hidden md:flex flex-col w-1/2 bg-[#3e2723] p-16 justify-between">
          <div>
            <div className="w-16 h-16 bg-[#fbc02d] rounded-2xl flex items-center justify-center mb-8 shadow-lg rotate-3">
              <i className="fa-solid fa-calendar-days text-[#3e2723] text-3xl -rotate-3" />
            </div>
            <h1 className="text-4xl font-extrabold text-white leading-tight">
              Ajukan<br /><span className="text-[#fbc02d]">Shift</span>
            </h1>
            <p className="text-white/60 mt-4 text-sm leading-relaxed max-w-xs">
              Kirim permintaan perubahan jadwal shift ke HRD. HR akan melakukan approval di ERPNext.
            </p>
          </div>
          <div className="bg-white/10 rounded-2xl p-4 border border-white/10">
            <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-1">Info</p>
            <p className="text-white/80 text-xs leading-relaxed">
              Shift Request yang sudah di-approve HRD akan otomatis aktif sebagai jadwal absensi kamu.
            </p>
          </div>
        </div>

        {/* ── Konten utama ── */}
        <div className="flex-1 flex justify-center bg-gray-50 relative w-full md:w-1/2 h-full">
          <div className="w-full max-w-sm h-full flex flex-col relative mx-auto">

            {/* Header */}
            <div className="bg-[#3e2723] pt-12 pb-4 px-6 shrink-0 shadow-md z-10 rounded-b-[1.5rem]">
              <div className="flex items-center gap-3 mb-4">
                <Link to="/home" className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white active:scale-95 hover:bg-white/30 transition-colors">
                  <i className="fa-solid fa-arrow-left" />
                </Link>
                <h1 className="text-xl font-black text-[#fbc02d]">Jadwal Shift</h1>
              </div>

              {/* Tab — hanya tampil untuk outlet */}
              {isOutlet && (
                <div className="grid grid-cols-2 gap-1 bg-white/10 p-1 rounded-xl">
                  {(['form', 'history'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`py-2 rounded-lg font-black text-xs transition-colors ${
                        activeTab === tab
                          ? 'bg-[#fbc02d] text-[#3e2723]'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      {tab === 'form' ? (
                        <><i className="fa-solid fa-paper-plane mr-1.5" />Ajukan</>
                      ) : (
                        <><i className="fa-solid fa-clock-rotate-left mr-1.5" />Riwayat</>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 pb-24 no-scrollbar">

              {/* ═══ KARYAWAN KANTOR — blocked ═══ */}
              {!isOutlet && (
                <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-4">
                  <div className="w-20 h-20 rounded-full bg-[#fff8e1] flex items-center justify-center shadow-inner">
                    <i className="fa-solid fa-lock text-[#fbc02d] text-3xl" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-[#3e2723] mb-2">Fitur Khusus Outlet</h2>
                    <p className="text-sm text-gray-500 leading-relaxed">
                      Pengajuan shift hanya untuk karyawan outlet. Jadwal kamu sebagai karyawan kantor sudah diatur otomatis oleh sistem.
                    </p>
                  </div>
                  <div className="w-full bg-[#fff8e1] border border-[#fbc02d]/40 rounded-2xl p-4">
                    <p className="text-xs font-bold text-[#3e2723] mb-1">Jadwalmu saat ini:</p>
                    <p className="text-xs text-[#3e2723]/70 leading-relaxed">
                      Senin–Kamis: 07:30–16:30 &nbsp;|&nbsp; Jumat: 07:30–17:00
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      (Ramadhan: Senin–Kamis 07:00–15:30 &nbsp;|&nbsp; Jumat 07:00–16:00)
                    </p>
                  </div>
                </div>
              )}

              {/* ═══ KARYAWAN OUTLET ═══ */}
              {isOutlet && isLoading && (
                <div className="flex items-center justify-center h-40">
                  <i className="fa-solid fa-spinner fa-spin text-2xl text-[#fbc02d]" />
                </div>
              )}

              {/* Tab: Form Pengajuan */}
              {isOutlet && !isLoading && activeTab === 'form' && (
                <div className="flex flex-col gap-4">
                  <div className="bg-[#fff8e1] p-4 rounded-2xl border border-[#fbc02d]/50 shadow-sm">
                    <p className="text-[#3e2723] text-xs font-bold leading-relaxed">
                      🍞 HR akan mendapat notifikasi dan melakukan approval di ERPNext.
                    </p>
                  </div>

                  {/* Toggle 1 hari / beberapa hari */}
                  <div>
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Periode</p>
                    <div className="grid grid-cols-2 gap-2 bg-gray-200 p-1 rounded-2xl">
                      {(['single', 'range'] as const).map(m => (
                        <button
                          key={m}
                          onClick={() => setMode(m)}
                          className={`py-3 rounded-xl font-black text-sm transition-colors ${
                            mode === m ? 'bg-[#3e2723] text-[#fbc02d]' : 'text-gray-500'
                          }`}
                        >
                          {m === 'single' ? '1 Hari' : 'Beberapa Hari'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Input tanggal */}
                  <div>
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Tanggal</p>
                    {mode === 'single' ? (
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={e => setSelectedDate(e.target.value)}
                        className="w-full bg-white border border-gray-200 p-4 rounded-2xl font-bold text-sm focus:outline-none focus:border-[#fbc02d]"
                      />
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 mb-1 pl-1">Dari</p>
                          <input
                            type="date"
                            value={fromDate}
                            onChange={e => setFromDate(e.target.value)}
                            className="w-full bg-white border border-gray-200 p-3 rounded-xl font-bold text-xs focus:outline-none focus:border-[#fbc02d]"
                          />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 mb-1 pl-1">Sampai</p>
                          <input
                            type="date"
                            value={toDate}
                            onChange={e => setToDate(e.target.value)}
                            className="w-full bg-white border border-gray-200 p-3 rounded-xl font-bold text-xs focus:outline-none focus:border-[#fbc02d]"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Pilih shift */}
                  <div>
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Shift</p>
                    <select
                      value={selectedShift}
                      onChange={e => setSelectedShift(e.target.value)}
                      className="w-full bg-white border border-gray-200 p-4 rounded-2xl font-bold text-sm focus:outline-none focus:border-[#fbc02d]"
                    >
                      <option value="" disabled>-- Pilih Shift --</option>
                      {shiftList.map(s => (
                        <option key={s.name} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Pilih approver */}
                  <div>
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Approver HRD</p>
                    <select
                      value={selectedApprover}
                      onChange={e => setSelectedApprover(e.target.value)}
                      className="w-full bg-white border border-gray-200 p-4 rounded-2xl font-bold text-sm focus:outline-none focus:border-[#fbc02d]"
                    >
                      {approverList.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={tanganiSubmit}
                    disabled={isSubmitting || !selectedShift}
                    className={`w-full font-black py-4 mt-2 rounded-2xl shadow-lg text-base active:scale-95 transition-all flex items-center justify-center gap-2 ${
                      isSubmitting || !selectedShift
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-[#3e2723] text-[#fbc02d]'
                    }`}
                  >
                    {isSubmitting
                      ? <><i className="fa-solid fa-spinner fa-spin" /> Mengirim...</>
                      : <><i className="fa-solid fa-paper-plane" /> Kirim Pengajuan</>
                    }
                  </button>
                </div>
              )}

              {/* Tab: Riwayat Pengajuan */}
              {isOutlet && !isLoading && activeTab === 'history' && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-black text-sm text-[#3e2723]">Riwayat Pengajuan Shift</h3>
                    <button
                      onClick={() => fetchHistory(user?.employee_id)}
                      className="w-8 h-8 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-400 hover:text-[#3e2723] hover:border-[#fbc02d] transition-colors"
                    >
                      <i className="fa-solid fa-rotate text-xs" />
                    </button>
                  </div>

                  {history.length === 0 ? (
                    <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-8 text-center shadow-sm">
                      <i className="fa-solid fa-calendar-xmark text-3xl text-gray-300 block mb-2" />
                      <p className="text-sm font-bold text-gray-400">Belum ada pengajuan shift</p>
                    </div>
                  ) : (
                    history.map(item => {
                      const statusKey = item.status || 'Draft';
                      const s = STATUS_STYLE[statusKey] ?? STATUS_STYLE['Draft'];
                      const isSameDay = item.from_date === item.to_date;
                      return (
                        <div
                          key={item.name}
                          className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 flex flex-col gap-2.5"
                        >
                          {/* Baris atas: shift name + badge status */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-black text-[#3e2723] text-sm leading-tight break-words">
                                {item.shift_type}
                              </p>
                              <p className="text-[10px] text-gray-400 font-bold mt-0.5">
                                {item.name}
                              </p>
                            </div>
                            <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black shrink-0 ${s.bg} ${s.text}`}>
                              <i className={`fa-solid ${s.icon} text-[9px]`} />
                              {statusKey}
                            </span>
                          </div>

                          {/* Baris bawah: tanggal */}
                          <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                            <i className="fa-solid fa-calendar-day text-[#fbc02d] text-xs shrink-0" />
                            <p className="text-xs font-bold text-[#3e2723]">
                              {isSameDay
                                ? formatTgl(item.from_date)
                                : `${formatTgl(item.from_date)} – ${formatTgl(item.to_date)}`
                              }
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <BottomNav />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Shift;