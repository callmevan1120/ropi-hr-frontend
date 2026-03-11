import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

interface User {
  name: string;
  role?: string;
  employee_id: string;
  branch?: string;
}

interface BtnConfig {
  text: string;
  icon: string;
  className: string;
  mode: string;
}

// ── HELPER: KONVERSI UTC KE WIB ──
const formatJamLokal = (utcString?: string): string => {
  if (!utcString) return '-';
  let safeString = utcString.replace(' ', 'T');
  if (!safeString.endsWith('Z') && !safeString.includes('+')) {
    safeString += 'Z';
  }
  const date = new Date(safeString);
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace('.', ':');
};

const Home = () => {
  const navigate = useNavigate();
  const BACKEND = (import.meta as any).env?.VITE_API_URL || 'https://ropi-hr-backend.vercel.app';

  const [user, setUser] = useState<User>({ name: 'Karyawan', role: 'Staff Roti Ropi', employee_id: '' });
  const [statusAbsen, setStatusAbsen] = useState<string>('Mengecek status...');
  const [btnConfig, setBtnConfig] = useState<BtnConfig>({
    text: 'Menyiapkan Tombol...',
    icon: 'fa-spinner fa-spin',
    className: 'bg-gray-200 text-gray-500',
    mode: '',
  });

  const [bukaPanduan, setBukaPanduan] = useState<string | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem('ropi_user');
    if (!userData) {
      navigate('/');
      return;
    }
    const parsedUser: User = JSON.parse(userData);
    setUser(parsedUser);
    ambilStatusHariIni(parsedUser.employee_id);
  }, [navigate]);

  const ambilStatusHariIni = async (employeeId: string) => {
    try {
      const tglHariIni = new Date().toISOString().substring(0, 10);
      const res = await fetch(`${BACKEND}/api/attendance?employee_id=${encodeURIComponent(employeeId)}&from=${tglHariIni}&to=${tglHariIni}`);
      const data = await res.json();

      if (data.success && data.data && data.data.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sorted = data.data.sort((a: any, b: any) => b.time.localeCompare(a.time));

        // Cek keberadaan IN dan OUT khusus hari ini
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sudahMasuk = sorted.some((d: any) => d.log_type === 'IN');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sudahKeluar = sorted.some((d: any) => d.log_type === 'OUT');

        const terakhir = sorted[0];
        const jam = formatJamLokal(terakhir.time);
        const tipe = terakhir.log_type === 'IN' ? 'MASUK' : 'KELUAR';

        const statusText = `✓ Absen ${tipe} terakhir pukul ${jam}`;
        setStatusAbsen(statusText);
        localStorage.setItem('ropi_status_absen', statusText);

        // Sudah MASUK tapi belum KELUAR → tombol KELUAR
        // Belum MASUK, atau sudah MASUK & KELUAR → tombol MASUK
        if (sudahMasuk && !sudahKeluar) {
          setBtnConfig({
            text: 'Absen Keluar Sekarang',
            icon: 'fa-right-from-bracket',
            className: 'bg-red-500 text-white shadow-red-500/30',
            mode: 'KELUAR',
          });
        } else {
          setBtnConfig({
            text: 'Absen Masuk Sekarang',
            icon: 'fa-right-to-bracket',
            className: 'bg-green-500 text-white shadow-green-500/30',
            mode: 'MASUK',
          });
        }
      } else {
        setStatusAbsen('Belum ada catatan absen hari ini');
        localStorage.removeItem('ropi_status_absen');
        setBtnConfig({
          text: 'Absen Masuk Sekarang',
          icon: 'fa-right-to-bracket',
          className: 'bg-green-500 text-white shadow-green-500/30',
          mode: 'MASUK',
        });
      }
    } catch (e) {
      console.error('Gagal sinkronisasi status:', e);
      setStatusAbsen(localStorage.getItem('ropi_status_absen') || 'Gagal memuat status');
      setBtnConfig({
        text: 'Buka Kamera Absen',
        icon: 'fa-camera',
        className: 'bg-[#3e2723] text-[#fbc02d]',
        mode: 'MASUK',
      });
    }
  };

  const togglePanduan = (id: string) => {
    setBukaPanduan(bukaPanduan === id ? null : id);
  };

  return (
    <div className="bg-gray-100 flex justify-center min-h-screen font-sans">
      <div className="w-full max-w-sm bg-white min-h-screen flex flex-col shadow-2xl relative">

        {/* Header */}
        <div className="bg-[#3e2723] pt-12 pb-20 px-6 rounded-b-[2.5rem] shrink-0">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-black text-[#fbc02d]">
                Halo, <span>{user.name}</span> 👋
              </h2>
              <p className="text-white/70 text-sm mt-0.5">{user.role || 'Staff Roti Ropi'}</p>
            </div>
            <Link to="/profil" className="w-14 h-14 rounded-full bg-[#fbc02d] border-2 border-[#fbc02d] flex items-center justify-center text-[#3e2723] font-black text-xl shadow-lg active:scale-95 transition-transform">
              <span>{(user.name || 'K').charAt(0).toUpperCase()}</span>
            </Link>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-6 -mt-12 relative z-10 overflow-y-auto pb-24">
          <div className="bg-white rounded-3xl p-5 shadow-lg border border-gray-100 mb-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-[#fbc02d]"></div>
            <p className="text-gray-400 text-xs font-black uppercase tracking-wider mt-1 mb-1">Status Hari Ini</p>
            <p className="text-[#3e2723] font-bold text-sm mb-4">{statusAbsen}</p>

            <button
              onClick={() => navigate(`/absen?mode=${btnConfig.mode}&auto=true`)}
              className={`w-full font-black py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all text-lg shadow-lg ${btnConfig.className}`}
            >
              <i className={`fa-solid ${btnConfig.icon} fa-fw`}></i> {btnConfig.text}
            </button>
          </div>

          <h3 className="font-black text-[#3e2723] text-base mb-3">Menu Laporan</h3>
          <div className="flex flex-col gap-3 mb-8">
            {/* MENU IZIN */}
            <Link to="/izin" className="bg-[#fff8e1] p-4 rounded-2xl flex items-center justify-between active:scale-95 transition-all border border-transparent hover:border-[#fbc02d]">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-[#fbc02d] rounded-full flex items-center justify-center text-[#3e2723] text-lg shrink-0">
                  <i className="fa-solid fa-envelope-open-text"></i>
                </div>
                <div>
                  <p className="font-black text-[#3e2723] text-sm">Pengajuan Izin</p>
                  <p className="text-gray-400 text-xs">Izin sakit & keperluan lain</p>
                </div>
              </div>
              <i className="fa-solid fa-chevron-right text-gray-300 text-sm"></i>
            </Link>

            {/* MENU CUTI TAHUNAN */}
            <Link to="/cuti" className="bg-white p-4 rounded-2xl flex items-center justify-between active:scale-95 transition-all border border-gray-100 shadow-sm hover:border-[#fbc02d]/50">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 text-lg shrink-0">
                  <i className="fa-solid fa-calendar-minus"></i>
                </div>
                <div>
                  <p className="font-black text-[#3e2723] text-sm">Cuti Tahunan</p>
                  <p className="text-gray-400 text-xs">Cek sisa kuota cuti</p>
                </div>
              </div>
              <i className="fa-solid fa-chevron-right text-gray-300 text-sm"></i>
            </Link>

            {/* MENU REKAP ABSEN */}
            <Link to="/absen" className="bg-white p-4 rounded-2xl flex items-center justify-between active:scale-95 transition-all border border-gray-100 shadow-sm hover:border-[#fbc02d]/50">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-[#3e2723] rounded-full flex items-center justify-center text-[#fbc02d] text-lg shrink-0">
                  <i className="fa-solid fa-clipboard-list"></i>
                </div>
                <div>
                  <p className="font-black text-[#3e2723] text-sm">Riwayat Absen</p>
                  <p className="text-gray-400 text-xs">Rekap kehadiran bulanan</p>
                </div>
              </div>
              <i className="fa-solid fa-chevron-right text-gray-300 text-sm"></i>
            </Link>
          </div>

          {/* SECTION BUKU PANDUAN */}
          <h3 className="font-black text-[#3e2723] text-base mb-3 flex items-center gap-2">
            <i className="fa-solid fa-book-open text-[#fbc02d]"></i> Buku Panduan
          </h3>
          <div className="flex flex-col gap-2">

            {/* Panduan 1: Cara Absen */}
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <button
                onClick={() => togglePanduan('absen')}
                className="w-full px-4 py-3 flex justify-between items-center bg-gray-50/50"
              >
                <span className="font-bold text-[#3e2723] text-sm">1. Cara Absen Harian</span>
                <i className={`fa-solid fa-chevron-down text-gray-400 transition-transform ${bukaPanduan === 'absen' ? 'rotate-180' : ''}`}></i>
              </button>
              {bukaPanduan === 'absen' && (
                <div className="px-4 py-3 text-xs text-gray-600 border-t border-gray-100 leading-relaxed bg-white">
                  <ul className="list-decimal pl-4 space-y-1.5">
                    <li>Pastikan Anda berada di area kantor/outlet.</li>
                    <li>Klik tombol warna hijau/merah di atas (Absen Masuk/Keluar).</li>
                    <li>Izinkan akses lokasi (GPS) dan Kamera jika diminta browser.</li>
                    <li>Posisikan wajah Anda hingga kotak kamera berwarna hijau dan muncul teks "Jepret!".</li>
                    <li><strong>Penting:</strong> Pastikan Anda memegang mesin fingerprint/area sekitar sesuai instruksi HR.</li>
                    <li>Klik "Kirim" dan tunggu hingga ada notifikasi berhasil.</li>
                  </ul>
                </div>
              )}
            </div>

            {/* Panduan 2: Izin & Cuti */}
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <button
                onClick={() => togglePanduan('izin')}
                className="w-full px-4 py-3 flex justify-between items-center bg-gray-50/50"
              >
                <span className="font-bold text-[#3e2723] text-sm">2. Pengajuan Izin & Cuti</span>
                <i className={`fa-solid fa-chevron-down text-gray-400 transition-transform ${bukaPanduan === 'izin' ? 'rotate-180' : ''}`}></i>
              </button>
              {bukaPanduan === 'izin' && (
                <div className="px-4 py-3 text-xs text-gray-600 border-t border-gray-100 leading-relaxed bg-white">
                  <p className="mb-2"><strong>Perbedaan Izin & Cuti:</strong></p>
                  <ul className="list-disc pl-4 space-y-1.5 mb-2">
                    <li><strong>Izin:</strong> Untuk sakit atau keperluan mendadak/Penting. Wajib melampirkan bukti (Surat Dokter, dll).</li>
                    <li><strong>Cuti:</strong> Pengambilan jatah cuti tahunan yang sudah direncanakan.</li>
                  </ul>
                  <p>Buka menu "Pengajuan Izin" atau "Cuti Tahunan", isi tanggal mulai dan selesai, serta alasan yang jelas. Status pengajuan bisa dicek di riwayat.</p>
                </div>
              )}
            </div>

            {/* Panduan 3: Solusi Error */}
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <button
                onClick={() => togglePanduan('error')}
                className="w-full px-4 py-3 flex justify-between items-center bg-gray-50/50"
              >
                <span className="font-bold text-[#3e2723] text-sm">3. Solusi Jika Error</span>
                <i className={`fa-solid fa-chevron-down text-gray-400 transition-transform ${bukaPanduan === 'error' ? 'rotate-180' : ''}`}></i>
              </button>
              {bukaPanduan === 'error' && (
                <div className="px-4 py-3 text-xs text-gray-600 border-t border-gray-100 leading-relaxed bg-white">
                  <ul className="list-disc pl-4 space-y-2">
                    <li><strong>Lokasi Jauh/Tidak Sesuai:</strong> Pastikan GPS HP Anda menyala dan di-setting "Akurasi Tinggi". Buka Google Maps sebentar untuk memancing sinyal GPS, lalu coba absen lagi.</li>
                    <li><strong>Kamera Error:</strong> Pastikan Anda menggunakan browser Chrome/Safari terbaru dan sudah memberikan izin kamera.</li>
                    <li><strong>Layar Putih/Blank:</strong> Keluar dari akun (Logout) atau hapus cache browser Anda.</li>
                  </ul>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* NAVIGATION BOTTOM */}
        <nav className="absolute bottom-0 left-0 right-0 w-full bg-white border-t border-gray-100 px-4 py-3 flex justify-between z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.02)]">
          <div className="flex flex-col items-center text-[#3e2723] w-1/4">
            <i className="fa-solid fa-house text-xl mb-1"></i>
            <span className="text-[10px] font-black uppercase">Home</span>
          </div>
          <Link to="/absen" className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors">
            <i className="fa-solid fa-clipboard-user text-xl mb-1"></i>
            <span className="text-[10px] font-black uppercase">Absen</span>
          </Link>
          <Link to="/izin" className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors">
            <i className="fa-solid fa-envelope-open-text text-xl mb-1"></i>
            <span className="text-[10px] font-black uppercase">Izin</span>
          </Link>
          <Link to="/cuti" className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors">
            <i className="fa-solid fa-calendar-minus text-xl mb-1"></i>
            <span className="text-[10px] font-black uppercase">Cuti</span>
          </Link>
        </nav>
      </div>
    </div>
  );
};

export default Home;