import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const Shift = () => {
  const navigate = useNavigate();
  const BACKEND = 'http://localhost:3333';

  const [user, setUser] = useState<any>(null);
  const [shiftList, setShiftList] = useState<any[]>([]);
  const [approverList, setApproverList] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State pilihan
  const [selectedShift, setSelectedShift] = useState<string>('');
  const [selectedApprover, setSelectedApprover] = useState<string>('');

  // Mode: 'single' atau 'range'
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const todayStr = new Date().toISOString().substring(0, 10);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [fromDate, setFromDate] = useState<string>(todayStr);
  const [toDate, setToDate] = useState<string>(todayStr);

  useEffect(() => {
    const userData = localStorage.getItem('ropi_user');
    if (!userData) { navigate('/'); return; }
    setUser(JSON.parse(userData));

    const savedShift = localStorage.getItem('ropi_selected_shift');
    if (savedShift) setSelectedShift(savedShift);

    const fetchInitialData = async () => {
      try {
        // Ambil Shift
        const resShifts = await fetch(`${BACKEND}/api/attendance/shifts`);
        const dataShifts = await resShifts.json();
        if (dataShifts.success && dataShifts.data) {
          const shiftsOutlet = dataShifts.data.filter((s: any) =>
            s.name.includes('Shift') || s.name.includes('Middle')
          );
          shiftsOutlet.sort((a: any, b: any) => a.name.localeCompare(b.name));
          setShiftList(shiftsOutlet);
        }

        // Ambil Approver
        const resHr = await fetch(`${BACKEND}/api/attendance/hr-users`);
        const dataHr = await resHr.json();
        if (dataHr.success && dataHr.data.length > 0) {
          setApproverList(dataHr.data);
          setSelectedApprover(dataHr.data[0]); // Set default approver
        } else {
          // Fallback jika API HR gagal
          const fallbackApprover = 'hrdrotiropi@gmail.com';
          setApproverList([fallbackApprover]);
          setSelectedApprover(fallbackApprover);
        }
      } catch {
        console.error('Gagal menarik data dari ERPNext');
        const fallbackApprover = 'hrdrotiropi@gmail.com';
        setApproverList([fallbackApprover]);
        setSelectedApprover(fallbackApprover);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialData();
  }, [navigate]);

  // Hitung jumlah hari range
  const hitungHari = () => {
    if (mode === 'single') return 1;
    const diff = new Date(toDate).getTime() - new Date(fromDate).getTime();
    return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)) + 1);
  };

  const tanganiSubmit = async () => {
    const finalFrom = mode === 'single' ? selectedDate : fromDate;
    const finalTo = mode === 'single' ? selectedDate : toDate;

    if (!selectedShift || !finalFrom || !finalTo || !selectedApprover) {
      alert('Harap lengkapi semua field!');
      return;
    }
    if (new Date(finalTo) < new Date(finalFrom)) {
      alert('Tanggal akhir tidak boleh sebelum tanggal mulai!');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${BACKEND}/api/attendance/shift-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: user.employee_id,
          shift_type: selectedShift,
          from_date: finalFrom,
          to_date: finalTo,
          approver: selectedApprover,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert('Pengajuan Shift berhasil dikirim ke HRD!');
        localStorage.setItem('ropi_selected_shift', selectedShift);
        navigate('/home');
      } else {
        alert(`Gagal: ${data.message || 'Cek koneksi ke server'}`);
      }
    } catch {
      alert('Terjadi kesalahan jaringan.');
    }
    setIsSubmitting(false);
  };

  const jumlahHari = hitungHari();

  return (
    <div className="bg-gray-100 flex justify-center min-h-screen font-sans">
      <div className="w-full max-w-sm bg-white min-h-screen flex flex-col shadow-2xl relative">

        {/* Header */}
        <div className="bg-[#3e2723] pt-12 pb-6 px-6 shrink-0 shadow-md z-10">
          <div className="flex items-center gap-3">
            <Link to="/home" className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform">
              <i className="fa-solid fa-arrow-left"></i>
            </Link>
            <div>
              <h1 className="text-xl font-black text-[#fbc02d]">Ajukan Shift</h1>
              <p className="text-white/60 text-[11px] font-medium">Tukar atau ganti shift kerja</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 pb-44">

          <div className="bg-[#fff8e1] p-4 rounded-2xl mb-6 border border-[#fbc02d] shadow-sm">
            <p className="text-[#3e2723] text-sm font-bold leading-relaxed">
              🍞 Ajukan perubahan shift kamu. HR akan menerima notifikasi dan melakukan approval di ERPNext.
            </p>
          </div>

          {isLoading ? (
            <div className="text-center py-10 text-gray-400 font-bold text-sm flex flex-col items-center gap-3">
              <i className="fa-solid fa-spinner fa-spin text-3xl text-[#fbc02d]"></i>
              <p>Menarik data shift dari ERPNext...</p>
            </div>
          ) : (
            <div className="flex flex-col gap-5">

              {/* Toggle Mode */}
              <div>
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">
                  Tipe Pengajuan
                </p>
                <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-2xl">
                  <button
                    onClick={() => setMode('single')}
                    className={`py-3 rounded-xl font-black text-sm transition-all ${
                      mode === 'single'
                        ? 'bg-[#3e2723] text-[#fbc02d] shadow-md'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    <i className="fa-solid fa-calendar-day mr-2"></i>1 Hari
                  </button>
                  <button
                    onClick={() => setMode('range')}
                    className={`py-3 rounded-xl font-black text-sm transition-all ${
                      mode === 'range'
                        ? 'bg-[#3e2723] text-[#fbc02d] shadow-md'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    <i className="fa-solid fa-calendar-week mr-2"></i>Beberapa Hari
                  </button>
                </div>
              </div>

              {/* Input Tanggal */}
              {mode === 'single' ? (
                <div>
                  <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                    Tanggal Shift
                  </p>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 p-4 rounded-2xl text-sm font-bold text-[#3e2723] outline-none focus:border-[#fbc02d]"
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                      Tanggal Mulai
                    </p>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={e => {
                        setFromDate(e.target.value);
                        // Pastikan toDate tidak sebelum fromDate
                        if (e.target.value > toDate) setToDate(e.target.value);
                      }}
                      className="w-full bg-gray-50 border border-gray-200 p-4 rounded-2xl text-sm font-bold text-[#3e2723] outline-none focus:border-[#fbc02d]"
                    />
                  </div>
                  <div>
                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                      Tanggal Akhir
                    </p>
                    <input
                      type="date"
                      value={toDate}
                      min={fromDate}
                      onChange={e => setToDate(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 p-4 rounded-2xl text-sm font-bold text-[#3e2723] outline-none focus:border-[#fbc02d]"
                    />
                  </div>
                  {/* Info jumlah hari */}
                  <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 flex items-center gap-2">
                    <i className="fa-solid fa-circle-info text-blue-400"></i>
                    <p className="text-sm font-bold text-blue-600">
                      Total: <span className="text-blue-700">{jumlahHari} hari</span>
                      {' '}({new Date(fromDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                      {' – '}
                      {new Date(toDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })})
                    </p>
                  </div>
                </div>
              )}

              {/* Pilih Shift */}
              <div>
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                  Pilih Shift Kerja
                </p>
                <div className="relative">
                  <select
                    value={selectedShift}
                    onChange={e => setSelectedShift(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 p-4 rounded-2xl text-sm font-bold text-[#3e2723] outline-none focus:border-[#fbc02d] appearance-none pr-10"
                  >
                    <option value="" disabled>-- Klik untuk memilih --</option>
                    {shiftList.map(item => (
                      <option key={item.name} value={item.name}>{item.name}</option>
                    ))}
                  </select>
                  <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                </div>
              </div>

              {/* Approver Dinamis */}
              <div>
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">
                  Kirim Ke (HR Approver)
                </p>
                <div className="relative">
                  <select
                    value={selectedApprover}
                    onChange={e => setSelectedApprover(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 p-4 rounded-2xl text-sm font-bold text-[#3e2723] outline-none focus:border-[#fbc02d] appearance-none pr-10"
                  >
                    <option value="" disabled>-- Pilih Atasan / HR --</option>
                    {approverList.map(usr => (
                      <option key={usr} value={usr}>{usr}</option>
                    ))}
                  </select>
                  <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <nav className="absolute bottom-0 left-0 right-0 w-full bg-white border-t border-gray-100 px-6 py-3 flex justify-around z-20">
          <Link to="/home" className="flex flex-col items-center text-gray-300 gap-0.5 hover:text-[#3e2723] transition-colors">
            <i className="fa-solid fa-house text-xl"></i>
            <span className="text-[10px] font-black uppercase">Home</span>
          </Link>
          <Link to="/absen" className="flex flex-col items-center text-gray-300 gap-0.5 hover:text-[#3e2723] transition-colors">
            <i className="fa-solid fa-clipboard-user text-xl"></i>
            <span className="text-[10px] font-black uppercase">Absen</span>
          </Link>
          <Link to="/shift" className="flex flex-col items-center text-[#3e2723] gap-0.5">
            <i className="fa-solid fa-calendar-day text-xl"></i>
            <span className="text-[10px] font-black uppercase">Shift</span>
          </Link>
          <Link to="/cuti" className="flex flex-col items-center text-gray-300 gap-0.5 hover:text-[#3e2723] transition-colors">
            <i className="fa-solid fa-calendar-minus text-xl"></i>
            <span className="text-[10px] font-black uppercase">Cuti</span>
          </Link>
        </nav>

        {/* Button Submit */}
        <div className="absolute bottom-[64px] left-0 right-0 p-6 bg-gradient-to-t from-white via-white to-transparent pointer-events-none">
          <button
            onClick={tanganiSubmit}
            disabled={isLoading || isSubmitting}
            className={`w-full font-black py-4 rounded-2xl shadow-xl transition-transform pointer-events-auto ${
              isLoading || isSubmitting
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-[#3e2723] text-[#fbc02d] active:scale-95 text-lg'
            }`}
          >
            {isSubmitting
              ? <span><i className="fa-solid fa-spinner fa-spin mr-2"></i>Mengirim...</span>
              : mode === 'single'
              ? 'Ajukan Shift Sekarang'
              : `Ajukan Shift (${jumlahHari} Hari)`
            }
          </button>
        </div>

      </div>
    </div>
  );
};

export default Shift;