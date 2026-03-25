import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import BottomNav from '../components/BottomNav';

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

const formatJamLokal = (timeString?: string): string => {
  if (!timeString) return '-';
  const parts = timeString.split(' ');
  if (parts.length > 1) return parts[1].substring(0, 5);
  return timeString.substring(0, 5);
};

// HELPER: Cek apakah user karyawan outlet
const isKaryawanOutlet = (branch?: string): boolean => {
  if (!branch) return true; // Default to true if no branch
  const b = branch.toLowerCase();
  return !(b.includes('klaten') || b.includes('ph') || b.includes('jakarta'));
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
    if (!userData) { navigate('/'); return; }
    const parsedUser: User = JSON.parse(userData);
    setUser(parsedUser);

    if (parsedUser.role === 'HR' || parsedUser.role === 'HR Manager' || parsedUser.role === 'System Manager') {
      navigate('/hr-dashboard');
      return;
    }

    ambilStatusHariIni(parsedUser.employee_id);
  }, [navigate]);

  const ambilStatusHariIni = async (employeeId: string) => {
    try {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const tglHariIni = `${yyyy}-${mm}-${dd}`;

      const res = await fetch(`${BACKEND}/api/attendance?employee_id=${encodeURIComponent(employeeId)}&from=${tglHariIni}&to=${tglHariIni}`);
      const data = await res.json();

      const setTombolMasukAwal = () => {
        setStatusAbsen('Belum ada catatan absen hari ini');
        localStorage.removeItem('ropi_status_absen');
        setBtnConfig({
          text: 'Absen Masuk Sekarang',
          icon: 'fa-right-to-bracket',
          className: 'bg-green-500 hover:bg-green-400 text-white shadow-lg shadow-green-500/30',
          mode: 'MASUK',
        });
      };

      if (data.success && data.data && data.data.length > 0) {
        const absenHariIni = data.data.filter((item: any) => {
          const tglAbsen = item.time ? item.time.substring(0, 10) : item.attendance_date;
          return tglAbsen === tglHariIni;
        });

        if (absenHariIni.length > 0) {
          const sorted = absenHariIni.sort((a: any, b: any) => b.time.localeCompare(a.time));
          const sudahMasuk = sorted.some((d: any) => d.log_type === 'IN');
          const sudahKeluar = sorted.some((d: any) => d.log_type === 'OUT');

          const terakhir = sorted[0];
          const jam = formatJamLokal(terakhir.time);
          const tipe = terakhir.log_type === 'IN' ? 'MASUK' : 'KELUAR';

          const statusText = `✓ Absen ${tipe} terakhir pukul ${jam}`;
          setStatusAbsen(statusText);
          localStorage.setItem('ropi_status_absen', statusText);

          if (sudahMasuk && !sudahKeluar) {
            setBtnConfig({
              text: 'Absen Keluar Sekarang',
              icon: 'fa-right-from-bracket',
              className: 'bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/30',
              mode: 'KELUAR',
            });
          } else {
            setBtnConfig({
              text: 'Absen Masuk Sekarang',
              icon: 'fa-right-to-bracket',
              className: 'bg-green-500 hover:bg-green-400 text-white shadow-lg shadow-green-500/30',
              mode: 'MASUK',
            });
          }
        } else {
          setTombolMasukAwal();
        }
      } else {
        setTombolMasukAwal();
      }
    } catch (e) {
      console.error('Gagal sinkronisasi status:', e);
      setStatusAbsen(localStorage.getItem('ropi_status_absen') || 'Gagal memuat status');
      setBtnConfig({
        text: 'Buka Kamera Absen',
        icon: 'fa-camera',
        className: 'bg-[#3e2723] hover:bg-[#4e342e] text-[#fbc02d] shadow-lg shadow-[#3e2723]/20',
        mode: 'MASUK',
      });
    }
  };

  const togglePanduan = (id: string) => {
    setBukaPanduan(bukaPanduan === id ? null : id);
  };

  const outlet = isKaryawanOutlet(user.branch);

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
          <div className="w-full max-w-sm bg-gray-50 h-full flex flex-col relative mx-auto">

            {/* HEADER */}
            <div className="bg-[#3e2723] pt-12 pb-24 px-6 rounded-b-[2.5rem] shrink-0 shadow-sm relative z-0">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-black text-[#fbc02d] leading-tight">
                    Halo, <span>{user.name.split(' ')[0]}</span> 👋
                  </h2>
                  <p className="text-white/70 text-sm mt-0.5">{user.role || 'Staff Roti Ropi'}</p>
                </div>
                <Link to="/profil" className="w-14 h-14 rounded-full bg-[#fff8e1] border-2 border-[#fbc02d] flex items-center justify-center text-[#3e2723] font-black text-2xl shadow-lg active:scale-95 transition-transform">
                  <span>{(user.name || 'K').charAt(0).toUpperCase()}</span>
                </Link>
              </div>
            </div>

            {/* CONTENT AREA */}
            <div className="flex-1 px-6 -mt-16 relative z-10 overflow-y-auto no-scrollbar pb-24">

              <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mb-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#fbc02d] to-yellow-300"></div>
                <p className="text-gray-400 text-[10px] font-black uppercase tracking-wider mt-1 mb-1">Status Hari Ini</p>
                <p className="text-[#3e2723] font-bold text-sm mb-5 bg-gray-50 p-2.5 rounded-xl border border-gray-100 inline-block w-full">{statusAbsen}</p>

                <button
                  onClick={() => navigate(`/absen?mode=${btnConfig.mode}&auto=true`)}
                  className={`w-full font-black py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all text-lg ${btnConfig.className}`}
                >
                  <i className={`fa-solid ${btnConfig.icon} fa-fw text-xl`}></i> {btnConfig.text}
                </button>
              </div>

              <h3 className="font-black text-[#3e2723] text-sm mb-3 ml-1 uppercase tracking-wide">Menu Laporan</h3>
              <div className="flex flex-col gap-3 mb-8">
                <Link to="/izin" className="bg-white p-4 rounded-2xl flex items-center justify-between active:scale-95 transition-all border border-gray-100 shadow-sm hover:border-[#fbc02d]/50 group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#fff8e1] rounded-full flex items-center justify-center text-[#fbc02d] text-xl shrink-0 group-hover:bg-[#fbc02d] group-hover:text-[#3e2723] transition-colors">
                      <i className="fa-solid fa-envelope-open-text"></i>
                    </div>
                    <div>
                      <p className="font-black text-[#3e2723] text-sm">Pengajuan Izin</p>
                      <p className="text-gray-400 text-[10px] font-bold uppercase mt-0.5">Sakit & Keperluan</p>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 group-hover:bg-[#fff8e1] group-hover:text-[#fbc02d] transition-colors">
                    <i className="fa-solid fa-chevron-right text-xs"></i>
                  </div>
                </Link>

                <Link to="/cuti" className="bg-white p-4 rounded-2xl flex items-center justify-between active:scale-95 transition-all border border-gray-100 shadow-sm hover:border-blue-400/50 group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 text-xl shrink-0 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                      <i className="fa-solid fa-calendar-minus"></i>
                    </div>
                    <div>
                      <p className="font-black text-[#3e2723] text-sm">Cuti Tahunan</p>
                      <p className="text-gray-400 text-[10px] font-bold uppercase mt-0.5">Cek Sisa Kuota</p>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                    <i className="fa-solid fa-chevron-right text-xs"></i>
                  </div>
                </Link>

                <Link to="/absen" className="bg-white p-4 rounded-2xl flex items-center justify-between active:scale-95 transition-all border border-gray-100 shadow-sm hover:border-[#3e2723]/50 group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 text-xl shrink-0 group-hover:bg-[#3e2723] group-hover:text-[#fbc02d] transition-colors">
                      <i className="fa-solid fa-clipboard-list"></i>
                    </div>
                    <div>
                      <p className="font-black text-[#3e2723] text-sm">Riwayat Absen</p>
                      <p className="text-gray-400 text-[10px] font-bold uppercase mt-0.5">Kehadiran Bulanan</p>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 group-hover:bg-gray-200 group-hover:text-[#3e2723] transition-colors">
                    <i className="fa-solid fa-chevron-right text-xs"></i>
                  </div>
                </Link>

                {/* Menu Pengajuan Shift hanya muncul untuk Outlet */}
                {outlet && (
                  <Link to="/shift" className="bg-white p-4 rounded-2xl flex items-center justify-between active:scale-95 transition-all border border-gray-100 shadow-sm hover:border-purple-400/50 group">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-purple-50 rounded-full flex items-center justify-center text-purple-500 text-xl shrink-0 group-hover:bg-purple-500 group-hover:text-white transition-colors">
                        <i className="fa-solid fa-calendar-days"></i>
                      </div>
                      <div>
                        <p className="font-black text-[#3e2723] text-sm">Pengajuan Shift</p>
                        <p className="text-gray-400 text-[10px] font-bold uppercase mt-0.5">Ubah / Tukar Shift</p>
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 group-hover:bg-purple-50 group-hover:text-purple-500 transition-colors">
                      <i className="fa-solid fa-chevron-right text-xs"></i>
                    </div>
                  </Link>
                )}
              </div>

              {/* BUKU PANDUAN */}
              <h3 className="font-black text-[#3e2723] text-sm mb-3 ml-1 uppercase tracking-wide flex items-center gap-2">
                <i className="fa-solid fa-book-open text-[#fbc02d]"></i> Buku Panduan
              </h3>
              <div className="flex flex-col gap-2">
                {[
                  {
                    id: 'absen', title: '1. Cara Absen Harian',
                    content: (
                      <ul className="list-decimal pl-4 space-y-1.5">
                        <li><strong>Validasi GPS:</strong> Klik tombol absen. Sistem akan mengecek lokasi Anda terlebih dahulu. Pastikan Anda berada di area kantor/outlet.</li>
                        <li><strong>Kamera & Deteksi Wajah:</strong> Izinkan akses kamera. Posisikan wajah Anda hingga sistem mendeteksi wajah (muncul teks "Jepret!").</li>
                        <li><strong>Foto Pertama:</strong> Jepret foto Wajah + Tangan Kanan (sesuai instruksi HR/pegang mesin kasir).</li>
                        {outlet && (
                          <li><strong>Foto Kedua (Khusus Outlet):</strong> Jepret foto tambahan untuk Wajah + Tangan Kiri.</li>
                        )}
                        <li><strong>Tanda Tangan (TTD):</strong> Goreskan tanda tangan digital Anda pada kotak yang disediakan.</li>
                        <li><strong>Kirim:</strong> Review kembali foto dan TTD Anda, lalu klik tombol "Kirim" dan tunggu hingga berhasil.</li>
                      </ul>
                    )
                  },
                  // PANDUAN KHUSUS KARYAWAN OUTLET DITAMBAHKAN DI SINI
                  ...(outlet ? [{
                    id: 'shift', title: '2. Aturan Pengajuan Shift (Outlet)',
                    content: (
                      <>
                        <p className="mb-2"><strong>Wajib bagi karyawan Outlet:</strong></p>
                        <ul className="list-disc pl-4 space-y-1.5">
                          <li>Anda <strong>tidak bisa absen</strong> jika belum memiliki jadwal shift yang di-ACC HRD.</li>
                          <li>Masuk ke menu <strong>Pengajuan Shift</strong> untuk mengatur jadwal 1 hari atau beberapa hari ke depan.</li>
                          <li>Jika ingin tukar shift dengan teman, wajib mengajukan dari aplikasi agar HRD bisa mengubah jadwal resmi Anda di sistem.</li>
                          <li>Tunggu hingga HRD melakukan <em>Approval</em>. Setelah di-ACC, Anda baru bisa membuka kamera absen.</li>
                        </ul>
                      </>
                    )
                  }] : []),
                  {
                    id: 'izin', title: outlet ? '3. Pengajuan Izin & Cuti' : '2. Pengajuan Izin & Cuti',
                    content: (
                      <>
                        <p className="mb-2"><strong>Perbedaan Izin & Cuti:</strong></p>
                        <ul className="list-disc pl-4 space-y-1.5">
                          <li><strong>Izin:</strong> Untuk sakit atau keperluan mendadak. Wajib melampirkan bukti.</li>
                          <li><strong>Cuti:</strong> Pengambilan jatah cuti tahunan yang sudah direncanakan.</li>
                        </ul>
                      </>
                    )
                  },
                  {
                    id: 'error', title: outlet ? '4. Solusi Jika Error' : '3. Solusi Jika Error',
                    content: (
                      <ul className="list-disc pl-4 space-y-2">
                        <li><strong>Lokasi Jauh:</strong> Pastikan GPS di-setting "Akurasi Tinggi". Buka Google Maps sebentar, lalu coba lagi.</li>
                        <li><strong>Kamera Error:</strong> Gunakan browser Chrome/Safari terbaru dan izinkan akses kamera.</li>
                        <li><strong>Layar Putih/Blank:</strong> Logout atau hapus cache browser Anda.</li>
                      </ul>
                    )
                  },
                ].map(({ id, title, content }) => (
                  <div key={id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                    <button onClick={() => togglePanduan(id)} className="w-full px-4 py-3 flex justify-between items-center bg-gray-50/50">
                      <span className="font-bold text-[#3e2723] text-sm">{title}</span>
                      <i className={`fa-solid fa-chevron-down text-gray-400 transition-transform ${bukaPanduan === id ? 'rotate-180' : ''}`}></i>
                    </button>
                    {bukaPanduan === id && (
                      <div className="px-4 py-3 text-xs text-gray-600 border-t border-gray-100 leading-relaxed bg-white">
                        {content}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* BottomNav component */}
            <BottomNav />

          </div>
        </div>

      </div>
    </div>
  );
};

export default Home;