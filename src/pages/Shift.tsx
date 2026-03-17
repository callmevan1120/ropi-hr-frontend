import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import BottomNav from '../components/BottomNav';

const Shift = () => {
  const navigate = useNavigate();
  const BACKEND = (import.meta as any).env?.VITE_API_URL || 'https://ropi-hr-backend.vercel.app';

  const [user, setUser] = useState<any>(null);
  const [shiftList, setShiftList] = useState<any[]>([]);
  const [approverList, setApproverList] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedShift, setSelectedShift] = useState<string>('');
  const [selectedApprover, setSelectedApprover] = useState<string>('');
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
        const resShifts = await fetch(`${BACKEND}/api/attendance/shifts`);
        const dataShifts = await resShifts.json();
        if (dataShifts.success && dataShifts.data) {
          const shiftsOutlet = dataShifts.data.filter((s: any) => s.name.includes('Shift') || s.name.includes('Middle'));
          setShiftList(shiftsOutlet.sort((a: any, b: any) => a.name.localeCompare(b.name)));
        }

        const resHr = await fetch(`${BACKEND}/api/attendance/hr-users`);
        const dataHr = await resHr.json();
        if (dataHr.success && dataHr.data.length > 0) {
          setApproverList(dataHr.data);
          setSelectedApprover(dataHr.data[0]);
        } else {
          setApproverList(['hrdrotiropi@gmail.com']);
          setSelectedApprover('hrdrotiropi@gmail.com');
        }
      } catch {
        setApproverList(['hrdrotiropi@gmail.com']);
        setSelectedApprover('hrdrotiropi@gmail.com');
      } finally { setIsLoading(false); }
    };
    fetchInitialData();
  }, [navigate]);

  const tanganiSubmit = async () => {
    const finalFrom = mode === 'single' ? selectedDate : fromDate;
    const finalTo = mode === 'single' ? selectedDate : toDate;
    if (!selectedShift || !finalFrom || !finalTo || !selectedApprover) { alert('Harap lengkapi semua field!'); return; }
    if (new Date(finalTo) < new Date(finalFrom)) { alert('Tanggal akhir tidak valid!'); return; }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${BACKEND}/api/attendance/shift-request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: user.employee_id, shift_type: selectedShift, from_date: finalFrom, to_date: finalTo, approver: selectedApprover }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert('Pengajuan Shift berhasil dikirim ke HRD!');
        localStorage.setItem('ropi_selected_shift', selectedShift);
        navigate('/home');
      } else { alert(`Gagal: ${data.message}`); }
    } catch { alert('Terjadi kesalahan jaringan.'); }
    setIsSubmitting(false);
  };

  return (
    <div className="bg-gray-100 flex justify-center min-h-screen font-sans text-[#3e2723]">
      <style>{`.no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
      <div className="w-full md:max-w-4xl lg:max-w-5xl bg-white md:rounded-[3rem] h-screen md:h-[600px] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-gray-200">
        
        <div className="hidden md:flex flex-col w-1/2 bg-[#3e2723] p-16 justify-center"><h1 className="text-5xl font-extrabold text-white">Ajukan <span className="text-[#fbc02d]">Shift</span></h1></div>

        <div className="flex-1 flex justify-center bg-gray-50 relative w-full md:w-1/2 h-full">
          <div className="w-full max-w-sm h-full flex flex-col relative mx-auto">
            <div className="bg-[#3e2723] pt-12 pb-6 px-6 shrink-0 shadow-md z-10 rounded-b-[1.5rem]">
              <div className="flex items-center gap-3">
                <Link to="/home" className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white"><i className="fa-solid fa-arrow-left"></i></Link>
                <h1 className="text-xl font-black text-[#fbc02d]">Ajukan Shift</h1>
              </div>
            </div>

            {/* FLOW SCROLL NORMAL - TIDAK ABSOLUTE */}
            <div className="flex-1 overflow-y-auto px-6 py-6 pb-24 no-scrollbar">
              <div className="bg-[#fff8e1] p-4 rounded-2xl mb-6 border border-[#fbc02d] shadow-sm">
                <p className="text-[#3e2723] text-xs font-bold leading-relaxed">🍞 Ajukan perubahan shift kamu. HR akan menerima notifikasi dan melakukan approval di ERPNext.</p>
              </div>

              {isLoading ? <p className="text-center">Loading...</p> : (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-2 bg-gray-200 p-1 rounded-2xl">
                    <button onClick={() => setMode('single')} className={`py-3 rounded-xl font-black text-sm ${mode === 'single' ? 'bg-[#3e2723] text-[#fbc02d]' : 'text-gray-500'}`}>1 Hari</button>
                    <button onClick={() => setMode('range')} className={`py-3 rounded-xl font-black text-sm ${mode === 'range' ? 'bg-[#3e2723] text-[#fbc02d]' : 'text-gray-500'}`}>Beberapa Hari</button>
                  </div>

                  {mode === 'single' ? (
                    <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-full bg-white border border-gray-200 p-4 rounded-2xl font-bold" />
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-full bg-white border border-gray-200 p-3 rounded-xl font-bold text-xs" />
                      <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-full bg-white border border-gray-200 p-3 rounded-xl font-bold text-xs" />
                    </div>
                  )}

                  <select value={selectedShift} onChange={e => setSelectedShift(e.target.value)} className="w-full bg-white border border-gray-200 p-4 rounded-2xl font-bold text-sm">
                    <option value="" disabled>-- Pilih Shift Baru --</option>
                    {shiftList.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                  </select>

                  <select value={selectedApprover} onChange={e => setSelectedApprover(e.target.value)} className="w-full bg-white border border-gray-200 p-4 rounded-2xl font-bold text-sm">
                    {approverList.map(usr => <option key={usr} value={usr}>{usr}</option>)}
                  </select>

                  {/* Tombol Submit sekarang menyatu dengan form, tidak melayang menutupi menu */}
                  <button onClick={tanganiSubmit} disabled={isSubmitting} className="w-full font-black py-4 mt-4 rounded-2xl shadow-lg bg-[#3e2723] text-[#fbc02d] text-base active:scale-95">
                    {isSubmitting ? 'Mengirim...' : 'Kirim Pengajuan Shift'}
                  </button>
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