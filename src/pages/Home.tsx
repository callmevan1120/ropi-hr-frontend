import { useState, useEffect, useRef } from 'react';
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

interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'success' | 'error' | 'info';
}

// ─────────────────────────────────────────────────────────────────
// HELPER LOGIKA WAKTU (PORTED FROM ABSEN.TSX)
// ─────────────────────────────────────────────────────────────────
const formatJamLokal = (timeString?: string): string => {
  if (!timeString) return '-';
  const parts = timeString.split(' ');
  if (parts.length > 1) return parts[1].substring(0, 5);
  return timeString.substring(0, 5);
};

const toMenit = (jam: string): number => {
  if (!jam || jam === '-') return 0;
  const [h, m] = jam.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const formatDurasi = (totalMenit: number): string => {
  if (totalMenit < 60) return `${totalMenit}m`;
  const jam = Math.floor(totalMenit / 60);
  const sisaMenit = totalMenit % 60;
  return sisaMenit > 0 ? `${jam}j ${sisaMenit}m` : `${jam}j`;
};

const isRamadhan = (): boolean => {
  const now = new Date();
  const curr = (now.getMonth() + 1) * 100 + now.getDate();
  const tahun = now.getFullYear();
  // Mengikuti periode Ramadhan 2026 sesuai logika Absen.tsx
  if (tahun === 2026 && curr >= 218 && curr <= 319) return true;
  return false;
};

const getJamMasukJadwal = (branch?: string, role?: string): string => {
  const b = (branch || '').toLowerCase();
  const isKantor = b.includes('klaten') || b.includes('ph') || b.includes('jakarta');
  if (!isKantor) return '07:00'; // Default Outlet

  const ramadhan = isRamadhan();
  const isSatpam = (role || '').toLowerCase().includes('satpam');
  let jamIn = ramadhan ? '07:00' : '07:30';

  if (isSatpam) {
    const total = toMenit(jamIn) - 30;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  return jamIn;
};

const isKaryawanOutlet = (branch?: string): boolean => {
  if (!branch) return true;
  const b = branch.toLowerCase();
  return !(b.includes('klaten') || b.includes('ph') || b.includes('jakarta'));
};

const timeAgo = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Baru saja';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} hari lalu`;
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
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

  // STATE NOTIFIKASI
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotif, setShowNotif] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const userData = localStorage.getItem('ropi_user');
    if (!userData) { navigate('/'); return; }
    const parsedUser: User = JSON.parse(userData);
    setUser(parsedUser);

    if (parsedUser.role === 'HR' || parsedUser.role === 'HR Manager' || parsedUser.role === 'System Manager') {
      navigate('/hr-dashboard');
      return;
    }

    // Tampilkan status cache dulu agar UI tidak kosong saat loading
    const cachedStatus = localStorage.getItem('ropi_status_absen');
    if (cachedStatus) {
      setStatusAbsen(cachedStatus);
      setBtnConfig({
        text: 'Memperbarui...',
        icon: 'fa-spinner fa-spin',
        className: 'bg-gray-200 text-gray-500',
        mode: '',
      });
    }

    // Semua fetch paralel
    Promise.all([
      ambilStatusHariIni(parsedUser.employee_id, parsedUser),
      fetchNotifications(parsedUser.employee_id),
    ]).catch(() => {});
  }, [navigate]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotif(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchNotifications = async (employeeId: string) => {
    try {
      const res = await fetch(`${BACKEND}/api/notifications?employee_id=${encodeURIComponent(employeeId)}`);
      const data = await res.json();

      if (data.success && data.data) {
        setNotifications(data.data);

        const lastReadTime = localStorage.getItem('ropi_last_read_notif');
        if (!lastReadTime) {
          setUnreadCount(data.data.length);
        } else {
          const lastReadDate = new Date(lastReadTime).getTime();
          const unread = data.data.filter((n: Notification) => new Date(n.time).getTime() > lastReadDate);
          setUnreadCount(unread.length);
        }
      }
    } catch (e) {
      console.error('Gagal fetch notifikasi', e);
    }
  };

  const handleOpenNotif = () => {
    setShowNotif(!showNotif);
    if (!showNotif) {
      setUnreadCount(0);
      localStorage.setItem('ropi_last_read_notif', new Date().toISOString());
    }
  };

  const ambilStatusHariIni = async (employeeId: string, userData: User) => {
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
          const checkInLog = sorted.find((d: any) => d.log_type === 'IN');
          const sudahKeluar = sorted.some((d: any) => d.log_type === 'OUT');

          if (checkInLog) {
            const jamAbsen = formatJamLokal(checkInLog.time);
            const statusText = `✓ Absen MASUK terakhir pukul ${jamAbsen}`;
            setStatusAbsen(statusText);
            localStorage.setItem('ropi_status_absen', statusText);

            // LOGIKA DETEKSI TELAT HARI INI
            const jamJadwal = getJamMasukJadwal(userData.branch, userData.role);
            const selisih = toMenit(jamAbsen) - toMenit(jamJadwal);
            
            if (selisih > 0) {
              const lateId = `late-${tglHariIni}`;
              const lateNotif: Notification = {
                id: lateId,
                title: 'Absen Terlambat',
                message: `Waduh, kamu telat ${formatDurasi(selisih)} hari ini. Yuk besok lebih pagi lagi!`,
                time: checkInLog.time,
                type: 'error'
              };

              setNotifications(prev => {
                if (prev.find(n => n.id === lateId)) return prev;
                return [lateNotif, ...prev];
              });
            }

            if (!sudahKeluar) {
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

  const panduanOutlet = [
    {
      id: 'shift', title: '1. Aturan Pengajuan Shift (Wajib)',
      content: (
        <ul className="list-decimal pl-4 space-y-1.5">
          <li>Anda <strong>tidak bisa absen</strong> jika belum memiliki jadwal shift yang di-ACC HRD untuk hari ini.</li>
          <li>Masuk ke menu <strong>Pengajuan Shift</strong> untuk mengatur jadwal 1 hari atau beberapa hari ke depan.</li>
          <li>Jika ingin bertukar shift dengan teman, wajib mengajukan dari aplikasi agar HRD bisa mengubah jadwal resmi Anda di sistem.</li>
          <li>Tunggu hingga HRD melakukan <em>Approval</em>. Setelah di-ACC, Anda baru bisa membuka kamera absen.</li>
        </ul>
      )
    },
    {
      id: 'absen', title: '2. Cara Absen Harian',
      content: (
        <ul className="list-decimal pl-4 space-y-1.5">
          <li><strong>Validasi GPS:</strong> Klik tombol absen. Pastikan Anda berada di area Outlet.</li>
          <li><strong>Kamera & Deteksi Wajah:</strong> Izinkan akses kamera. Posisikan wajah Anda hingga sistem mendeteksi wajah.</li>
          <li><strong>Foto Pertama:</strong> Jepret foto <strong>Wajah + Tangan Kanan</strong> Anda.</li>
          <li><strong>Foto Kedua:</strong> Setelah itu, jepret foto tambahan untuk <strong>Wajah + Tangan Kiri</strong> Anda.</li>
          <li><strong>Tanda Tangan (TTD):</strong> Goreskan tanda tangan digital Anda pada kotak yang disediakan.</li>
          <li><strong>Kirim:</strong> Review kembali foto dan TTD Anda, lalu klik "Kirim" dan tunggu notifikasi berhasil.</li>
        </ul>
      )
    },
    {
      id: 'izin', title: '3. Pengajuan Izin & Cuti',
      content: (
        <>
          <p className="mb-2"><strong>Perbedaan Izin & Cuti:</strong></p>
          <ul className="list-disc pl-4 space-y-1.5">
            <li><strong>Izin:</strong> Untuk sakit atau keperluan mendadak. Wajib melampirkan foto/dokumen bukti.</li>
            <li><strong>Cuti:</strong> Pengambilan jatah cuti tahunan yang sudah direncanakan sebelumnya.</li>
          </ul>
        </>
      )
    },
    {
      id: 'error', title: '4. Solusi Jika Error',
      content: (
        <ul className="list-disc pl-4 space-y-2">
          <li><strong>Lokasi Jauh / Ditolak:</strong> Pastikan GPS HP di-setting "Akurasi Tinggi". Buka Google Maps sebentar agar GPS mendeteksi lokasi yang akurat, lalu coba lagi.</li>
          <li><strong>Kamera Blank:</strong> Gunakan browser Chrome/Safari versi terbaru dan pastikan Anda sudah mengizinkan akses kamera untuk web ini.</li>
        </ul>
      )
    }
  ];

  const panduanKantor = [
    {
      id: 'absen', title: '1. Cara Absen Harian',
      content: (
        <ul className="list-decimal pl-4 space-y-1.5">
          <li><strong>Validasi GPS:</strong> Klik tombol absen (Masuk/Keluar). Pastikan Anda berada di area kantor.</li>
          <li><strong>Kamera & Deteksi Wajah:</strong> Izinkan akses kamera. Posisikan wajah Anda hingga sistem mendeteksi wajah.</li>
          <li><strong>Foto Selfie:</strong> Jepret foto Selfie Wajah Anda dengan jelas.</li>
          <li><strong>Tanda Tangan (TTD):</strong> Goreskan tanda tangan digital Anda pada kotak yang disediakan.</li>
          <li><strong>Kirim:</strong> Review kembali foto dan TTD Anda, lalu klik "Kirim" dan tunggu hingga ada notifikasi berhasil.</li>
        </ul>
      )
    },
    {
      id: 'izin', title: '2. Pengajuan Izin & Cuti',
      content: (
        <>
          <p className="mb-2"><strong>Perbedaan Izin & Cuti:</strong></p>
          <ul className="list-disc pl-4 space-y-1.5">
            <li><strong>Izin:</strong> Untuk sakit atau keperluan mendadak. Wajib melampirkan foto/dokumen bukti.</li>
            <li><strong>Cuti:</strong> Pengambilan jatah cuti tahunan yang sudah direncanakan sebelumnya.</li>
          </ul>
        </>
      )
    },
    {
      id: 'error', title: '3. Solusi Jika Error',
      content: (
        <ul className="list-disc pl-4 space-y-2">
          <li><strong>Lokasi Jauh / Ditolak:</strong> Pastikan GPS HP di-setting "Akurasi Tinggi". Buka Google Maps sebentar agar GPS mendeteksi lokasi yang akurat, lalu coba absen lagi.</li>
          <li><strong>Kamera Blank:</strong> Gunakan browser Chrome/Safari versi terbaru dan pastikan Anda sudah mengizinkan akses kamera untuk web ini.</li>
        </ul>
      )
    }
  ];

  const listBukuPanduan = outlet ? panduanOutlet : panduanKantor;

  return (
    <div className="bg-gray-100 flex items-center justify-center min-h-screen font-sans text-[#3e2723] selection:bg-[#fbc02d] md:p-6 lg:p-10 w-full overflow-hidden">
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes bell-shake {
          0%, 100% { transform: rotate(0deg); }
          15% { transform: rotate(12deg); }
          30% { transform: rotate(-10deg); }
          45% { transform: rotate(8deg); }
          60% { transform: rotate(-6deg); }
          75% { transform: rotate(4deg); }
        }
        .bell-ring {
          animation: bell-shake 1.2s ease-in-out;
          transform-origin: top center;
        }
        @keyframes badge-pop {
          0% { transform: scale(0); }
          60% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        .badge-pop { animation: badge-pop 0.3s ease-out forwards; }
      `}</style>

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
          <div className="w-full max-w-sm bg-gray-50 h-full flex flex-col relative mx-auto shadow-none md:shadow-[0_0_15px_rgba(0,0,0,0.05)] overflow-hidden">

            {/* HEADER — safe-area-aware, compact */}
            <div className="bg-[#3e2723] px-5 pb-10 rounded-b-[2rem] shrink-0 shadow-sm relative z-40" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 1rem)' }}>
              <div className="flex justify-between items-center">
                {/* KIRI: Salam & Role */}
                <div className="flex-1 min-w-0 pr-3">
                  <h2 className="text-xl font-black text-[#fbc02d] leading-tight truncate">
                    Halo, <span>{user.name.split(' ')[0]}</span> 👋
                  </h2>
                  <p className="text-white/60 text-xs mt-0.5 truncate">{user.role || 'Staff Roti Ropi'}</p>
                </div>

                {/* KANAN: Bell Notification — compact & eyecatching */}
                <div className="relative shrink-0" ref={notifRef}>
                  <button
                    onClick={handleOpenNotif}
                    className={`
                      relative w-10 h-10 rounded-2xl flex items-center justify-center
                      transition-all duration-200 active:scale-90 border border-[#fbc02d]/30
                      ${showNotif
                        ? 'bg-[#fbc02d] text-[#3e2723] shadow-lg shadow-[#fbc02d]/40'
                        : 'bg-[#fbc02d]/10 text-[#fbc02d] hover:bg-[#fbc02d]/20 shadow-[0_0_15px_rgba(251,192,45,0.1)]'
                      }
                    `}
                    aria-label="Notifikasi"
                  >
                    <i className={`fa-solid fa-bell text-base ${unreadCount > 0 ? 'bell-ring' : ''}`}></i>

                    {/* Badge unread count */}
                    {unreadCount > 0 && (
                      <span className="badge-pop absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-[#3e2723] leading-none shadow-md">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>

                  {/* DROPDOWN NOTIFIKASI */}
                  {showNotif && (
                    <div className="absolute top-[48px] right-0 w-[300px] max-w-[85vw] bg-white rounded-3xl shadow-[0_15px_40px_rgba(0,0,0,0.15)] border border-gray-100 overflow-hidden flex flex-col z-50">
                      <div className="bg-gray-50 px-5 py-3.5 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="font-black text-[#3e2723] text-sm flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-[#fff8e1] flex items-center justify-center">
                            <i className="fa-solid fa-bell text-[#fbc02d] text-[9px]"></i>
                          </div>
                          Notifikasi
                        </h3>
                        <button
                          onClick={() => setShowNotif(false)}
                          className="w-6 h-6 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
                        >
                          <i className="fa-solid fa-xmark text-xs"></i>
                        </button>
                      </div>
                      <div className="max-h-[50vh] overflow-y-auto no-scrollbar flex flex-col bg-white">
                        {notifications.length === 0 ? (
                          <div className="py-10 text-center flex flex-col items-center">
                            <i className="fa-regular fa-bell-slash text-4xl text-gray-200 mb-3"></i>
                            <p className="text-xs text-gray-400 font-bold">Belum ada notifikasi.</p>
                          </div>
                        ) : (
                          notifications.map((notif) => (
                            <div key={notif.id} className="px-5 py-4 border-b border-gray-50 hover:bg-gray-50 transition-colors flex gap-3 items-start">
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm
                                ${notif.type === 'success' ? 'bg-green-100 text-green-500' :
                                  notif.type === 'error' ? 'bg-red-100 text-red-500' : 'bg-yellow-100 text-yellow-600'}`}>
                                <i className={`fa-solid ${notif.type === 'success' ? 'fa-check' : notif.type === 'error' ? 'fa-triangle-exclamation' : 'fa-clock'}`}></i>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-black text-[#3e2723] truncate leading-tight">{notif.title}</p>
                                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed font-medium">{notif.message}</p>
                                <p className="text-[9px] text-gray-400 font-bold mt-1.5 uppercase tracking-wide">{timeAgo(notif.time)}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CONTENT AREA */}
            <div className="flex-1 px-6 -mt-6 relative z-10 overflow-y-auto no-scrollbar pb-24">

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
                {listBukuPanduan.map(({ id, title, content }) => (
                  <div key={id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                    <button onClick={() => togglePanduan(id)} className="w-full px-4 py-3 flex justify-between items-center bg-gray-50/50">
                      <span className="font-bold text-[#3e2723] text-sm text-left">{title}</span>
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

            <BottomNav />

          </div>
        </div>

      </div>
    </div>
  );
};

export default Home;