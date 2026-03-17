import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import BottomNav from '../components/BottomNav';

interface User {
  name: string;
  employee_id: string;
}

interface SlipRecord {
  name: string;
  start_date: string;
  end_date: string;
  net_pay: number;
  status: string;
}

const SlipGaji = () => {
  const navigate = useNavigate();
  const BACKEND = (import.meta as any).env?.VITE_API_URL || 'https://ropi-hr-backend.vercel.app';

  const [user, setUser] = useState<User | null>(null);
  const [slips, setSlips] = useState<SlipRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem('ropi_user');
    if (!userData) { navigate('/'); return; }
    
    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    fetchSlips(parsedUser.employee_id);
  }, [navigate]);

  const fetchSlips = async (employeeId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/payroll/slips?employee_id=${encodeURIComponent(employeeId)}`);
      const data = await res.json();
      if (data.success && data.data) {
        setSlips(data.data);
      }
    } catch (err) {
      console.error('Gagal menarik data slip gaji', err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatRupiah = (angka: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);
  };

  const formatPeriode = (start: string, end: string) => {
    const d1 = new Date(start);
    const month = d1.toLocaleDateString('id-ID', { month: 'long' });
    const year = d1.getFullYear();
    return `${month} ${year}`;
  };

  // Logic Download PDF dari API Nest.js yang menjembatani Frappe ERPNext
  const handleDownload = async (slipId: string) => {
    setIsDownloading(slipId);
    try {
      const res = await fetch(`${BACKEND}/api/payroll/download?slip_id=${encodeURIComponent(slipId)}`);
      if (!res.ok) throw new Error('Gagal download PDF');
      
      // Ubah response menjadi Blob PDF dan picu unduhan di browser
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Slip_Gaji_${slipId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('❌ Gagal mendownload dokumen PDF. Pastikan backend sudah siap dan dokumen sudah di-Submit di ERPNext.');
    } finally {
      setIsDownloading(null);
    }
  };

  return (
    <div className="bg-gray-100 flex items-center justify-center min-h-screen font-sans text-[#3e2723]">
      <style>{`.no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
      <div className="w-full md:max-w-4xl lg:max-w-5xl bg-white md:rounded-[3rem] h-screen md:h-[600px] lg:h-[700px] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-gray-200">
        
        {/* BAGIAN KIRI */}
        <div className="hidden md:flex flex-col w-1/2 bg-[#3e2723] p-16 justify-center">
           <h1 className="text-5xl font-extrabold text-white">Slip <span className="text-[#fbc02d]">Gaji</span></h1>
           <p className="text-white/70 mt-6">Pantau rincian pendapatan dan potongan bulanan kamu secara transparan dan aman.</p>
        </div>

        {/* BAGIAN KANAN */}
        <div className="flex-1 flex justify-center bg-gray-50 relative w-full md:w-1/2 h-full">
          <div className="w-full max-w-sm h-full flex flex-col relative mx-auto">
            
            <div className="bg-[#3e2723] pt-12 pb-6 px-6 shrink-0 shadow-md rounded-b-[1.5rem] z-10">
              <div className="flex items-center gap-3">
                <Link to="/home" className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform">
                  <i className="fa-solid fa-arrow-left"></i>
                </Link>
                <h1 className="text-xl font-black text-[#fbc02d]">Slip Gaji</h1>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pt-6 px-6 no-scrollbar pb-24">
              <div className="bg-green-50 border border-green-200 p-4 rounded-2xl flex gap-3 shadow-sm mb-6">
                <i className="fa-solid fa-shield-halved text-green-500 text-xl mt-0.5"></i>
                <p className="text-[10px] text-green-800 font-bold leading-relaxed">
                  Sistem RopiHR menjamin kerahasiaan data pendapatan Anda. Jangan sebarkan dokumen slip gaji Anda ke pihak luar.
                </p>
              </div>

              <h3 className="font-black text-[#3e2723] text-sm mb-4 uppercase tracking-wider flex items-center gap-2">
                <i className="fa-solid fa-money-check-dollar text-[#fbc02d]"></i> Riwayat Pendapatan
              </h3>

              {isLoading ? (
                <div className="text-center mt-10 text-gray-400 font-bold text-sm">
                  <i className="fa-solid fa-spinner fa-spin text-2xl text-[#fbc02d] mb-2 block"></i> Memuat Data...
                </div>
              ) : slips.length === 0 ? (
                <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-6 text-center shadow-sm">
                  <i className="fa-solid fa-folder-open text-3xl text-gray-300 block mb-2"></i>
                  <p className="text-sm font-bold text-gray-400">Belum ada slip gaji yang dirilis.</p>
                </div>
              ) : (
                slips.map((slip) => (
                  <div key={slip.name} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm mb-4 relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-[#fbc02d]"></div>
                    <div className="flex justify-between items-start mb-3 pl-1">
                      <div>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{slip.name}</p>
                        <p className="text-base font-black text-[#3e2723]">{formatPeriode(slip.start_date, slip.end_date)}</p>
                      </div>
                      <span className="bg-green-100 text-green-700 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md">
                        {slip.status === 'Submitted' ? 'Disahkan' : slip.status}
                      </span>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-3 flex justify-between items-center ml-1">
                      <p className="text-xs font-bold text-gray-500 uppercase">Take Home Pay</p>
                      <p className="text-lg font-black text-green-600">{formatRupiah(slip.net_pay)}</p>
                    </div>
                    <button 
                      onClick={() => handleDownload(slip.name)}
                      disabled={isDownloading === slip.name}
                      className={`w-full py-3.5 border rounded-xl text-xs font-black shadow-sm flex items-center justify-center gap-2 transition-all ml-1 ${
                        isDownloading === slip.name 
                          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                          : 'bg-white text-[#3e2723] border-gray-200 hover:bg-gray-50 active:scale-95'
                      }`}
                    >
                       {isDownloading === slip.name ? (
                         <><i className="fa-solid fa-spinner fa-spin"></i> Mengunduh...</>
                       ) : (
                         <><i className="fa-solid fa-file-pdf text-red-500 text-base"></i> Download Dokumen PDF</>
                       )}
                    </button>
                  </div>
                ))
              )}
            </div>

            <BottomNav />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SlipGaji;