import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import BottomNav from '../components/BottomNav';

declare global { interface Window { faceapi: any; } }

interface User {
  name: string;
  role?: string;
  employee_id: string;
  branch?: string;
}

interface Lokasi {
  nama: string;
  lat: number;
  lng: number;
  radius: number;
}

interface RiwayatAbsen {
  time?: string;
  attendance_date?: string;
  log_type: string;
  custom_foto_absen?: string;
  custom_verification_image?: string;
  custom_signature?: string;
  shift?: string;
}

interface LeaveRecord {
  name: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  status: string;
}

interface ActiveShift {
  shift_name: string;
  start_time: string;
  end_time: string;
}

// ─────────────────────────────────────────────
// HELPER: format & hitung waktu
// ─────────────────────────────────────────────
const formatJamLokal = (timeString?: string): string => {
  if (!timeString) return '-';
  const parts = timeString.split(' ');
  if (parts.length > 1) return parts[1].substring(0, 5);
  return timeString.substring(0, 5);
};

const formatDurasi = (totalMenit: number): string => {
  if (totalMenit < 60) return `${totalMenit}m`;
  const jam = Math.floor(totalMenit / 60);
  const sisaMenit = totalMenit % 60;
  return sisaMenit > 0 ? `${jam}j ${sisaMenit}m` : `${jam}j`;
};

const toMenit = (jam: string): number => {
  if (!jam || jam === '-') return 0;
  const [h, m] = jam.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const tambahMenit = (jam: string, menit: number): string => {
  const total = toMenit(jam) + menit;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const parseLokalDate = (tglStr: string): Date => {
  const [y, m, d] = tglStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Ramadhan 2025 : 1 Mar – 30 Mar 2025
// Ramadhan 2026 : 18 Feb – 19 Mar 2026
// Ramadhan 2027 : 9 Feb – 9 Mar 2027 (estimasi, perbarui jika perlu)
const isRamadhan = (tanggal?: Date): boolean => {
  const now   = tanggal || new Date();
  const tahun = now.getFullYear();
  const bulan = now.getMonth() + 1; // 1–12
  const tgl   = now.getDate();

  // Encode sebagai angka MMDD untuk perbandingan rentang
  const curr  = bulan * 100 + tgl;
  if (tahun === 2025 && curr >= 301  && curr <= 330)  return true; // 1–30 Mar 2025
  if (tahun === 2026 && curr >= 218  && curr <= 319)  return true; // 18 Feb – 19 Mar 2026
  if (tahun === 2027 && curr >= 209  && curr <= 309)  return true; // 9 Feb – 9 Mar 2027
  return false;
};

const isKaryawanKantor = (branch?: string): boolean => {
  if (!branch) return false;
  const b = branch.toLowerCase();
  return b.includes('klaten') || b.includes('ph') || b.includes('jakarta');
};

const isKaryawanOutlet = (branch?: string): boolean => !isKaryawanKantor(branch);

const isSatpam = (role?: string): boolean => {
  const des = (role || '').toLowerCase();
  return des.includes('satpam') || des.includes('security') || des.includes('sekuriti');
};

// ─── Tabel jam kantor (PH Klaten & Jakarta sama) ───────────────────
//  Periode        | Hari           | Masuk | Pulang | Satpam masuk | Satpam pulang
//  Non Ramadhan   | Senin – Kamis  | 07:30 | 16:30  | 07:00        | 17:00
//  Non Ramadhan   | Jumat          | 07:30 | 17:00  | 07:00        | 17:30
//  Ramadhan       | Senin – Kamis  | 07:00 | 15:30  | 06:30        | 16:00
//  Ramadhan       | Jumat          | 07:00 | 16:00  | 06:30        | 16:30
// ───────────────────────────────────────────────────────────────────
const getJamShiftKantor = (tglDate: Date, satpam: boolean): { in: string; out: string } => {
  const hari     = tglDate.getDay(); // 0=Min,1=Sen,...,5=Jum,6=Sab
  const isFriday = hari === 5;
  const ramadhan = isRamadhan(tglDate);

  // Jam dasar karyawan kantor
  const jamMasuk  = '07:30'; // Non Ramadhan default
  const jamKeluar = isFriday ? '17:00' : '16:30';

  const jamMasukR  = '07:00'; // Ramadhan
  const jamKeluarR = isFriday ? '16:00' : '15:30';

  const baseIn  = ramadhan ? jamMasukR  : jamMasuk;
  const baseOut = ramadhan ? jamKeluarR : jamKeluar;

  if (satpam) {
    // Satpam: 30 menit lebih awal masuk, 30 menit lebih lambat pulang
    return { in: tambahMenit(baseIn, -30), out: tambahMenit(baseOut, 30) };
  }
  return { in: baseIn, out: baseOut };
};

// Nama shift kantor harus SAMA PERSIS dengan Shift Type di ERPNext
// Format: "{HariLabel} ({BranchLabel} {PeriodeLabel})"
// Contoh : "Senin - Kamis (PH Klaten Non Ramadhan)"
//          "Jumat (Jakarta Ramadhan)"
// Catatan: Satpam TIDAK memiliki Shift Type terpisah di ERPNext →
//          gunakan nama shift kantor biasa (jam ditangani di getJamShiftKantor)
const getNamaShiftKantor = (tglDate: Date, branchUser: string | undefined, _satpamFlag: boolean): string => {
  const hari         = tglDate.getDay();
  const isFriday     = hari === 5;
  const ramadhan     = isRamadhan(tglDate);

  const branchLabel  = (branchUser || '').toLowerCase().includes('jakarta') ? 'Jakarta' : 'PH Klaten';
  const hariLabel    = isFriday ? 'Jumat' : 'Senin - Kamis';
  const periodeLabel = ramadhan ? 'Ramadhan' : 'Non Ramadhan';

  return `${hariLabel} (${branchLabel} ${periodeLabel})`;
};

const getJamShift = (
  shiftNameFromRecord: string | undefined,
  tgl: string,
  branchUser: string | undefined,
  roleUser: string | undefined,
  masterShifts: Record<string, { in: string; out: string }>,
  activeShift: ActiveShift | null
): { in: string; out: string } => {
  const tglDate = parseLokalDate(tgl);
  const kantor  = isKaryawanKantor(branchUser);

  if (!kantor) {
    if (activeShift && shiftNameFromRecord === activeShift.shift_name) {
      return { in: activeShift.start_time, out: activeShift.end_time };
    }
    if (shiftNameFromRecord && masterShifts[shiftNameFromRecord]) {
      return masterShifts[shiftNameFromRecord];
    }
    return { in: '06:00', out: '14:00' };
  }

  const satpamFlag = isSatpam(roleUser);
  return getJamShiftKantor(tglDate, satpamFlag);
};

const validasiShiftName = (
  shiftFromRecord: string | undefined,
  tgl: string,
  branch: string | undefined,
  role: string | undefined,
  activeShift: ActiveShift | null
): string => {
  const tglDate   = parseLokalDate(tgl);
  const hari      = tglDate.getDay();
  const isFriday  = hari === 5;
  const isWeekend = hari === 0 || hari === 6;
  const kantor    = isKaryawanKantor(branch);
  const satpamFlag = isSatpam(role);

  if (!kantor) {
    return shiftFromRecord || activeShift?.shift_name || 'Shift Outlet';
  }

  const shiftLokal = getNamaShiftKantor(tglDate, branch, satpamFlag);

  if (isWeekend || !shiftFromRecord) return shiftLokal;

  const recordIsFriday = shiftFromRecord.toLowerCase().includes('jumat');
  const recordIsSenKam = shiftFromRecord.toLowerCase().includes('senin');

  if (isFriday && recordIsSenKam) return shiftLokal;
  if (!isFriday && !isWeekend && recordIsFriday) return shiftLokal;

  // Jika record dari ERPNext sudah dalam format lama (tanpa kurung), normalisasi
  if (shiftFromRecord && !shiftFromRecord.includes('(') && !shiftFromRecord.includes(')')) {
    return shiftLokal; // gunakan format lokal yang sudah benar
  }

  return shiftFromRecord;
};

const hitungHariKerjaDalamBulan = (records: LeaveRecord[], filterFn: (r: LeaveRecord) => boolean, tahunAktif: number, bulanAktif: number): number => {
  const bulanMulai = new Date(tahunAktif, bulanAktif, 1);
  const bulanAkhir = new Date(tahunAktif, bulanAktif + 1, 0);
  return records.filter(filterFn).reduce((acc, r) => {
    const from  = parseLokalDate(r.from_date);
    const to    = parseLokalDate(r.to_date);
    const start = from < bulanMulai ? bulanMulai : from;
    const end   = to > bulanAkhir ? bulanAkhir : to;
    let hari = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0 && d.getDay() !== 6) hari++;
    }
    return acc + hari;
  }, 0);
};

const cekBranchVsLokasi = (branchUser: string | undefined, namaLokasi: string): string | null => {
  const branch = (branchUser || '').toLowerCase().trim();
  const lokasi = namaLokasi.toLowerCase().trim();
  if (!branch) return null;
  const isLokasiKlaten  = lokasi.includes('klaten') || lokasi.includes('ph');
  const isLokasiJakarta = lokasi.includes('jakarta');
  const isBranchKlaten  = branch.includes('klaten') || branch.includes('ph');
  const isBranchJakarta = branch.includes('jakarta');

  if (isLokasiKlaten  && !isBranchKlaten)  return `Ditolak! Branch kamu (${branchUser}) tidak terdaftar di lokasi ini`;
  if (isLokasiJakarta && !isBranchJakarta) return `Ditolak! Branch kamu (${branchUser}) tidak terdaftar di lokasi ini`;
  return null;
};

const hitungJarak = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R    = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─────────────────────────────────────────────
// OVERLAY WATERMARK: Logo + 3 Baris Estetik
// ─────────────────────────────────────────────
const drawOverlay = async (ctx: CanvasRenderingContext2D, w: number, h: number, lokasi: string) => {
  const now = new Date();
  const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';
  const tgl = now.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const loc = `📍 ${lokasi}`;

  const pad = 12;
  const gap = 4;
  const logoSize = 46;

  const fsJam = 22; 
  const fsTglLoc = 12; 

  ctx.font = `900 ${fsJam}px sans-serif`;
  const twJam = ctx.measureText(jam).width;
  ctx.font = `600 ${fsTglLoc}px sans-serif`;
  const twTgl = ctx.measureText(tgl).width;
  const twLoc = ctx.measureText(loc).width;

  const textW = Math.max(twJam, twTgl, twLoc);
  const bw = pad + logoSize + 10 + textW + pad;
  const bh = pad + fsJam + gap + fsTglLoc + gap + fsTglLoc + pad;

  const x = 12;
  const y = h - bh - 12;

  const grad = ctx.createLinearGradient(x, y, x + bw, y + bh);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
  
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x, y, bw, bh, 12);
  ctx.fill();

  const textX = x + pad + logoSize + 10;
  let textY = y + pad;

  ctx.fillStyle = '#fbc02d'; 
  ctx.font = `900 ${fsJam}px sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(jam, textX, textY);
  textY += fsJam + gap;

  ctx.fillStyle = '#ffffff';
  ctx.font = `600 ${fsTglLoc}px sans-serif`;
  ctx.fillText(tgl, textX, textY);
  textY += fsTglLoc + gap;

  ctx.fillStyle = '#cbd5e1'; 
  let finalLoc = loc;
  if (finalLoc.length > 30) finalLoc = finalLoc.substring(0, 30) + '...';
  ctx.fillText(finalLoc, textX, textY);

  return new Promise<void>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = '/Logo-Roti-ropi.png';
    img.onload = () => {
      const logoY = y + (bh - logoSize) / 2;
      ctx.drawImage(img, x + pad, logoY, logoSize, logoSize);
      resolve();
    };
    img.onerror = () => resolve(); 
  });
};

// ─────────────────────────────────────────────
// KOMPONEN UTAMA
// ─────────────────────────────────────────────
const Absen = () => {
  const navigate      = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const BACKEND      = (import.meta as any).env?.VITE_API_URL || 'https://ropi-hr-backend.vercel.app';
  const ERPNEXT_URL  = 'http://103.187.147.240';
  const LOKASI_FALLBACK: Lokasi[] = [{ nama: 'PH Klaten', lat: -7.6146229, lng: 110.6867057, radius: 70 }];

  const [user,          setUser]          = useState<User | null>(null);
  const [lokasiKantor,  setLokasiKantor]  = useState<Lokasi[]>(LOKASI_FALLBACK);
  const [dataRiwayat,   setDataRiwayat]   = useState<RiwayatAbsen[]>([]);
  const [bulanAktif,    setBulanAktif]    = useState(new Date().getMonth());
  const [tahunAktif,    setTahunAktif]    = useState(new Date().getFullYear());
  const [masterShifts,  setMasterShifts]  = useState<Record<string, { in: string; out: string }>>({});
  const [leaveRecords,  setLeaveRecords]  = useState<LeaveRecord[]>([]);
  const [lihatSemua,    setLihatSemua]    = useState(false);

  const [activeShift,   setActiveShift]   = useState<ActiveShift | null>(null);
  const [shiftLoading,  setShiftLoading]  = useState(false);
  const [shiftError,    setShiftError]    = useState<string | null>(null);

  const [isModalAbsenOpen, setIsModalAbsenOpen] = useState(false);
  const [modeAbsen,        setModeAbsen]        = useState('MASUK');
  const [jamModal,         setJamModal]         = useState('--:--');
  const [gpsStatus,        setGpsStatus]        = useState({ tipe: 'loading', pesan: 'Mendeteksi lokasi...' });
  const [wajahStatus,      setWajahStatus]      = useState({ show: false, ok: false });
  const [kameraBorder,     setKameraBorder]     = useState('border-[#fbc02d]');
  const [namaLokasi,       setNamaLokasi]       = useState<string>('Mendeteksi...');

  const [cameraStep,        setCameraStep]        = useState(1);
  const [fotoBase64,        setFotoBase64]        = useState<string | null>(null);
  const [fotoKiriBase64,    setFotoKiriBase64]    = useState<string | null>(null); 
  const [ttdBase64,         setTtdBase64]         = useState<string | null>(null);
  const [isTtdEmpty,        setIsTtdEmpty]        = useState(true);
  const [jepretState,       setJepretState]       = useState({ aktif: false, teks: 'Cek Sistem...' });
  const [isKirimLoading,    setIsKirimLoading]    = useState(false);
  const [koordinatGPS,      setKoordinatGPS]      = useState<{ lat: number; lng: number } | null>(null);

  const [detailModal, setDetailModal] = useState<{
    show: boolean; tgl: string;
    inData?: RiwayatAbsen; outData?: RiwayatAbsen;
  }>({ show: false, tgl: '' });

  const videoRef           = useRef<HTMLVideoElement>(null);
  const streamRef          = useRef<MediaStream | null>(null);
  const intervalDeteksiRef = useRef<number | null>(null);
  const intervalJamRef     = useRef<number | null>(null);
  const ttdCanvasRef       = useRef<HTMLCanvasElement>(null);
  const isDrawingRef       = useRef(false);
  const lastPosRef         = useRef<{ x: number; y: number } | null>(null);
  const cameraStepRef      = useRef(cameraStep);
  useEffect(() => { cameraStepRef.current = cameraStep; }, [cameraStep]);

  const outlet  = isKaryawanOutlet(user?.branch);
  const satpam  = isSatpam(user?.role);

  const stepsData = outlet
    ? [
        { n: 1, icon: 'fa-camera',    label: 'Wajah+Kanan' },
        { n: 2, icon: 'fa-hand',      label: 'Wajah+Kiri'  },
        { n: 3, icon: 'fa-pen-nib',   label: 'TTD'         },
        { n: 4, icon: 'fa-paper-plane', label: 'Kirim'     },
      ]
    : [
        { n: 1, icon: 'fa-camera',    label: 'Selfie'  },
        { n: 3, icon: 'fa-pen-nib',   label: 'TTD'     },
        { n: 4, icon: 'fa-paper-plane', label: 'Kirim' },
      ];

  useEffect(() => {
    const userData = localStorage.getItem('ropi_user');
    if (!userData) { navigate('/'); return; }
    const parsedUser: User = JSON.parse(userData);
    setUser(parsedUser);
    ambilLokasiKantor(parsedUser.branch);
    ambilMasterShift();

    if (isKaryawanOutlet(parsedUser.branch)) {
      ambilActiveShift(parsedUser.employee_id);
    }
  }, [navigate]);

  useEffect(() => {
    if (user) {
      ambilRiwayatAbsen();
      ambilRiwayatIzin(user.employee_id);
    }
  }, [user, bulanAktif, tahunAktif]);

  useEffect(() => { setLihatSemua(false); }, [bulanAktif, tahunAktif]);

  useEffect(() => {
    const modeAuto = searchParams.get('mode');
    const isAuto   = searchParams.get('auto');
    if (isAuto === 'true' && modeAuto && user) {
      setTimeout(() => bukaModalAbsen(modeAuto), 500);
    }
  }, [searchParams, user]);

  useEffect(() => { return () => matikanKamera(); }, []);

  useEffect(() => {
    if (cameraStep !== 3) return;

    const timer = setTimeout(() => {
      const canvas = ttdCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect  = canvas.getBoundingClientRect();
      canvas.width  = rect.width || 300;
      canvas.height = rect.height || 300; 
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth   = 2.5;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';

      const getPos = (e: MouseEvent | TouchEvent) => {
        const r      = canvas.getBoundingClientRect();
        const scaleX = canvas.width  / r.width;
        const scaleY = canvas.height / r.height;
        if (e instanceof TouchEvent && e.touches.length > 0) {
          return {
            x: (e.touches[0].clientX - r.left) * scaleX,
            y: (e.touches[0].clientY - r.top)  * scaleY,
          };
        }
        return {
          x: ((e as MouseEvent).clientX - r.left) * scaleX,
          y: ((e as MouseEvent).clientY - r.top)  * scaleY,
        };
      };

      const onStart = (e: MouseEvent | TouchEvent) => {
        e.preventDefault();
        isDrawingRef.current  = true;
        lastPosRef.current    = getPos(e);
      };
      const onMove = (e: MouseEvent | TouchEvent) => {
        e.preventDefault();
        if (!isDrawingRef.current || !lastPosRef.current) return;
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        lastPosRef.current = pos;
        setIsTtdEmpty(false);
      };
      const onEnd = () => { isDrawingRef.current = false; lastPosRef.current = null; };

      canvas.addEventListener('mousedown',  onStart);
      canvas.addEventListener('mousemove',  onMove);
      canvas.addEventListener('mouseup',    onEnd);
      canvas.addEventListener('mouseleave', onEnd);
      canvas.addEventListener('touchstart', onStart, { passive: false });
      canvas.addEventListener('touchmove',  onMove,  { passive: false });
      canvas.addEventListener('touchend',   onEnd);

      (canvas as any)._cleanup = () => {
        canvas.removeEventListener('mousedown',  onStart);
        canvas.removeEventListener('mousemove',  onMove);
        canvas.removeEventListener('mouseup',    onEnd);
        canvas.removeEventListener('mouseleave', onEnd);
        canvas.removeEventListener('touchstart', onStart);
        canvas.removeEventListener('touchmove',  onMove);
        canvas.removeEventListener('touchend',   onEnd);
      };
    }, 100);

    return () => {
      clearTimeout(timer);
      const canvas = ttdCanvasRef.current;
      if (canvas && (canvas as any)._cleanup) (canvas as any)._cleanup();
    };
  }, [cameraStep]);

  const bersihkanTTD = () => {
    const canvas = ttdCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setIsTtdEmpty(true);
  };

  const simpanTTD = () => {
    const canvas = ttdCanvasRef.current;
    if (!canvas) return;
    setTtdBase64(canvas.toDataURL('image/png'));
    setCameraStep(4);
  };

  const ambilActiveShift = async (empId: string) => {
    setShiftLoading(true);
    setShiftError(null);
    try {
      const res = await fetch(`${BACKEND}/api/attendance/active-shift?employee_id=${encodeURIComponent(empId)}`);
      const data = await res.json();
      if (data.success) {
        setActiveShift({
          shift_name: data.shift_name,
          start_time: data.start_time,
          end_time: data.end_time
        });
      } else {
        setShiftError(data.message || 'Belum ada Shift. Ajukan HRD.');
      }
    } catch {
      setShiftError('Gagal membaca shift.');
    } finally {
      setShiftLoading(false);
    }
  };

  const ambilMasterShift = async () => {
    try {
      const res  = await fetch(`${BACKEND}/api/attendance/shifts`);
      const data = await res.json();
      if (data.success && data.data) {
        const tempMap: Record<string, { in: string; out: string }> = {};
        data.data.forEach((s: any) => {
          tempMap[s.name] = {
            in:  s.start_time ? s.start_time.substring(0, 5) : '07:00',
            out: s.end_time   ? s.end_time.substring(0, 5)   : '15:30',
          };
        });
        setMasterShifts(tempMap);
      }
    } catch { console.error('Gagal menarik shift'); }
  };

  const ambilLokasiKantor = async (branch?: string) => {
    try {
      const url  = branch ? `${BACKEND}/api/locations/${encodeURIComponent(branch)}` : `${BACKEND}/api/locations`;
      const res  = await fetch(url);
      const data = await res.json();
      if (data.success && data.locations?.length > 0) setLokasiKantor(data.locations);
    } catch { console.warn('Pakai lokasi fallback'); }
  };

  const ambilRiwayatAbsen = async () => {
    if (!user) return;
    try {
      const dari   = `${tahunAktif}-${String(bulanAktif + 1).padStart(2, '0')}-01`;
      const akhir  = new Date(tahunAktif, bulanAktif + 1, 0);
      const sampai = `${tahunAktif}-${String(bulanAktif + 1).padStart(2, '0')}-${String(akhir.getDate()).padStart(2, '0')}`;
      const res    = await fetch(`${BACKEND}/api/attendance?employee_id=${encodeURIComponent(user.employee_id)}&from=${dari}&to=${sampai}`);
      const data   = await res.json();
      if (data.success && data.data) setDataRiwayat(data.data);
      else setDataRiwayat([]);
    } catch { setDataRiwayat([]); }
  };

  const ambilRiwayatIzin = async (employeeId: string) => {
    try {
      const res  = await fetch(`${BACKEND}/api/attendance/leave-history?employee_id=${employeeId}`);
      const data = await res.json();
      if (data.success && data.data) {
        const filtered = data.data.filter((item: LeaveRecord) => {
          const from       = parseLokalDate(item.from_date);
          const to         = parseLokalDate(item.to_date);
          const bulanMulai = new Date(tahunAktif, bulanAktif, 1);
          const bulanAkhir = new Date(tahunAktif, bulanAktif + 1, 0);
          return from <= bulanAkhir && to >= bulanMulai;
        });
        setLeaveRecords(filtered);
      } else setLeaveRecords([]);
    } catch { setLeaveRecords([]); }
  };

  const matikanKamera = () => {
    if (intervalJamRef.current)     window.clearInterval(intervalJamRef.current);
    if (intervalDeteksiRef.current) window.clearInterval(intervalDeteksiRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  };

  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`);
      const d = await r.json();
      const a = d.address || {};
      return a.building || a.amenity || a.road || a.suburb || a.village || d.display_name?.split(',')[0] || 'Lokasi GPS';
    } catch { return 'GPS Aktif'; }
  };

  const bukaModalAbsen = async (mode: string) => {
    if (outlet && !activeShift) {
      alert('⚠️ Shift kamu hari ini belum diatur/di-ACC oleh HRD. Silakan ajukan shift atau hubungi HRD terlebih dahulu.');
      return;
    }

    setModeAbsen(mode);
    setFotoBase64(null);
    setFotoKiriBase64(null);
    setTtdBase64(null);
    setIsTtdEmpty(true);
    setCameraStep(1);
    setIsModalAbsenOpen(true);
    setKameraBorder('border-[#fbc02d]');
    setWajahStatus({ show: false, ok: false });
    setGpsStatus({ tipe: 'loading', pesan: 'Mendeteksi koordinat GPS...' });
    setJepretState({ aktif: false, teks: 'Loading...' });
    setNamaLokasi('Mendeteksi...');
    
    intervalJamRef.current = window.setInterval(() => setJamModal(new Date().toLocaleTimeString('id-ID')), 1000);

    const MAX_AKURASI = 300; 
    const RADIUS_MIN = 100;  

    navigator.geolocation.getCurrentPosition(
      async pos => {
        const coords  = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const akurasi = pos.coords.accuracy;
        setKoordinatGPS(coords);
        
        let terdekat = { valid: false, nama: '?', jarak: Infinity, radius: 100 };
        for (const k of lokasiKantor) {
          const r = Math.max(k.radius, RADIUS_MIN);
          const jarak = Math.round(hitungJarak(coords.lat, coords.lng, k.lat, k.lng));
          if (jarak <= r) {
            terdekat = { valid: true, nama: k.nama, jarak, radius: r };
            break;
          }
          if (jarak < terdekat.jarak) {
            terdekat = { valid: false, nama: k.nama, jarak, radius: r };
          }
        }

        if (terdekat.valid && akurasi <= MAX_AKURASI) {
          let errorBranch = cekBranchVsLokasi(user?.branch, terdekat.nama);
          
          if (errorBranch) {
            setGpsStatus({ tipe: 'error', pesan: errorBranch });
            setJepretState({ aktif: false, teks: 'Akses Ditolak' });
          } else {
            let nm = terdekat.nama;
            if (outlet) {
               nm = user?.branch || await reverseGeocode(coords.lat, coords.lng);
            }
            
            setNamaLokasi(nm);
            setGpsStatus({ tipe: 'ok', pesan: `Valid: ${nm} (Akurasi: ${Math.round(akurasi)}m) ✓` });
            setJepretState({ aktif: false, teks: 'Buka Kamera...' });
            await nyalakanKamera();
          }
        } else {
          setNamaLokasi('Lokasi Ditolak');
          let pesanError = `Jarak ${terdekat.jarak}m (Maks: ${terdekat.radius}m).`;
          if (akurasi > MAX_AKURASI) pesanError = `Akurasi lemah (${Math.round(akurasi)}m). Butuh < ${MAX_AKURASI}m.`;
          
          setGpsStatus({ tipe: 'error', pesan: pesanError });
          setJepretState({ aktif: false, teks: 'Ditolak' });
        }
      },
      async () => {
        setNamaLokasi('GPS Nonaktif');
        setGpsStatus({ tipe: 'error', pesan: 'Mohon izinkan akses GPS dari browser.' });
        setJepretState({ aktif: false, teks: 'Akses Ditolak' });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  };

  const tutupModal = () => {
    matikanKamera();
    setIsModalAbsenOpen(false);
    setCameraStep(1);
    if (searchParams.has('auto')) setSearchParams({});
  };

  const nyalakanKamera = async () => {
    matikanKamera();
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 640 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
        await videoRef.current.play();
      }
      setJepretState({ aktif: false, teks: 'Muat AI...' });
      muatFaceAPI();
    } catch {
      setJepretState({ aktif: false, teks: 'Kamera Error' });
    }
  };

  const muatFaceAPI = () => {
    setWajahStatus({ show: true, ok: false });
    if (window.faceapi?.nets?.tinyFaceDetector?.isLoaded) { mulaiDeteksi(); return; }
    const script    = document.createElement('script');
    script.src      = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js';
    script.onload   = async () => {
      await window.faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model');
      mulaiDeteksi();
    };
    document.head.appendChild(script);
  };

  const mulaiDeteksi = () => {
    intervalDeteksiRef.current = window.setInterval(async () => {
      const step = cameraStepRef.current;
      if (!window.faceapi || !videoRef.current || videoRef.current.paused || (step !== 1 && step !== 2)) return;
      const hasil = await window.faceapi.detectAllFaces(videoRef.current, new window.faceapi.TinyFaceDetectorOptions());
      if (hasil.length > 0) {
        setWajahStatus({ show: true, ok: true });
        const teks = step === 2 ? 'Jepret Kiri!' : 'Jepret Wajah!';
        setJepretState({ aktif: true, teks });
        setKameraBorder('border-green-400');
      } else {
        setWajahStatus({ show: true, ok: false });
        setJepretState({ aktif: false, teks: 'Cari Wajah...' });
        setKameraBorder('border-orange-300');
      }
    }, 600);
  };

  const jepretFoto = async () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    const TARGET_W = 480;
    const TARGET_H = 640;
    canvas.width = TARGET_W;
    canvas.height = TARGET_H;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      const videoRatio = video.videoWidth / video.videoHeight;
      const targetRatio = TARGET_W / TARGET_H;

      let sourceX = 0, sourceY = 0, sourceW = video.videoWidth, sourceH = video.videoHeight;

      if (videoRatio > targetRatio) {
        sourceW = video.videoHeight * targetRatio;
        sourceX = (video.videoWidth - sourceW) / 2;
      } else {
        sourceH = video.videoWidth / targetRatio;
        sourceY = (video.videoHeight - sourceH) / 2;
      }

      ctx.save();
      if (cameraStep === 1 || cameraStep === 2) {
        ctx.translate(TARGET_W, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, sourceX, sourceY, sourceW, sourceH, 0, 0, TARGET_W, TARGET_H);
      ctx.restore();

      await drawOverlay(ctx, TARGET_W, TARGET_H, namaLokasi);
    }

    const base64 = canvas.toDataURL('image/jpeg', 0.6);

    if (cameraStep === 1) {
      setFotoBase64(base64);
      if (outlet) {
        setCameraStep(2);
        setKameraBorder('border-blue-400');
        setJepretState({ aktif: false, teks: 'Cari Wajah...' });
        setWajahStatus({ show: false, ok: false });
      } else {
        if (intervalDeteksiRef.current) window.clearInterval(intervalDeteksiRef.current);
        matikanKamera();
        setCameraStep(3);
        setKameraBorder('border-purple-400');
      }
    } else if (cameraStep === 2) {
      setFotoKiriBase64(base64);
      if (intervalDeteksiRef.current) window.clearInterval(intervalDeteksiRef.current);
      matikanKamera();
      setIsTtdEmpty(true);
      setCameraStep(3);
      setKameraBorder('border-purple-400');
    }
  };

  const kirimAbsen = async () => {
    if (!fotoBase64 || (!fotoKiriBase64 && outlet) || !ttdBase64 || !user) return;
    setIsKirimLoading(true);

    const namaShiftKirim = outlet
      ? activeShift?.shift_name || '' 
      : getNamaShiftKantor(new Date(), user.branch, satpam);

    try {
      const res = await fetch(`${BACKEND}/api/attendance/checkin`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id:               user.employee_id,
          tipe:                      modeAbsen === 'MASUK' ? 'IN' : 'OUT',
          latitude:                  koordinatGPS?.lat || LOKASI_FALLBACK[0].lat,
          longitude:                 koordinatGPS?.lng || LOKASI_FALLBACK[0].lng,
          branch:                    user.branch || '',
          image_verification:        fotoBase64,
          custom_verification_image: outlet ? fotoKiriBase64 : undefined,
          custom_signature:          ttdBase64,
          shift:                     namaShiftKirim,
        }),
      });

      if (res.ok) {
        alert(`Absen ${modeAbsen} berhasil dikirim!`);
        tutupModal();
        ambilRiwayatAbsen();
      } else {
        const errData = await res.json().catch(() => null);
        alert(errData?.message || 'Absen gagal dikirim ke sistem.');
      }
    } catch { alert('Gagal konek ke server.'); }

    setIsKirimLoading(false);
  };

  const groupedRiwayat: Record<string, { in?: RiwayatAbsen; out?: RiwayatAbsen }> = {};
  dataRiwayat.forEach(item => {
    const tgl = item.time?.substring(0, 10) || item.attendance_date || '';
    if (!groupedRiwayat[tgl]) groupedRiwayat[tgl] = {};
    
    if (item.log_type === 'IN') {
      const currentInTime = groupedRiwayat[tgl].in?.time;
      if (!groupedRiwayat[tgl].in || (item.time && currentInTime && item.time < currentInTime)) {
        groupedRiwayat[tgl].in = item;
      }
    }
    if (item.log_type === 'OUT') {
      const currentOutTime = groupedRiwayat[tgl].out?.time;
      if (!groupedRiwayat[tgl].out || (item.time && currentOutTime && item.time > currentOutTime)) {
        groupedRiwayat[tgl].out = item;
      }
    }
  });

  const rekapHadir = Object.keys(groupedRiwayat).length;
  let rekapTelat = 0;
  Object.entries(groupedRiwayat).forEach(([tgl, d]) => {
    if (d.in?.time) {
      const jamAbsen  = formatJamLokal(d.in.time);
      const shiftInfo = getJamShift(d.in.shift, tgl, user?.branch, user?.role, masterShifts, activeShift);
      if (toMenit(jamAbsen) > toMenit(shiftInfo.in)) rekapTelat++;
    }
  });

  const rekapIzin  = hitungHariKerjaDalamBulan(leaveRecords, r => !r.leave_type.toLowerCase().includes('tahunan') && r.status?.toLowerCase() !== 'rejected', tahunAktif, bulanAktif);
  const rekapCuti  = hitungHariKerjaDalamBulan(leaveRecords, r =>  r.leave_type.toLowerCase().includes('tahunan') && r.status?.toLowerCase() !== 'rejected', tahunAktif, bulanAktif);

  const tanggalIzinSet  = (() => {
    const set = new Set<string>();
    leaveRecords.forEach(r => {
      const from = parseLokalDate(r.from_date);
      const to   = parseLokalDate(r.to_date);
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }
    });
    return set;
  })();

  const sortedTglKeys = Object.keys(groupedRiwayat).sort((a, b) => b.localeCompare(a));
  const tampilKeys    = lihatSemua ? sortedTglKeys : sortedTglKeys.slice(0, 5);

  const renderKalender = () => {
    const hariPertama = new Date(tahunAktif, bulanAktif, 1).getDay();
    const totalHari   = new Date(tahunAktif, bulanAktif + 1, 0).getDate();
    const blanks      = Array.from({ length: hariPertama }, (_, i) => <div key={`b-${i}`} />);
    const days        = Array.from({ length: totalHari }, (_, i) => {
      const d        = i + 1;
      const isHariIni = d === new Date().getDate() && bulanAktif === new Date().getMonth() && tahunAktif === new Date().getFullYear();
      const strTgl   = `${tahunAktif}-${String(bulanAktif + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dataIn   = groupedRiwayat[strTgl]?.in;
      const checkin  = dataIn?.time;
      const adaIzin  = tanggalIzinSet.has(strTgl);
      let kelas = 'w-7 h-7 flex items-center justify-center mx-auto rounded-full text-xs relative ';
      
      let dot: React.ReactNode = null;
      if (isHariIni) {
        kelas += 'bg-[#3e2723] text-[#fbc02d] font-black';
      } else if (adaIzin && !checkin) {
        kelas += 'bg-blue-100 text-blue-600 font-bold';
        dot = <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-blue-400" />;
      } else if (checkin) {
        const shiftInfo = getJamShift(dataIn?.shift, strTgl, user?.branch, user?.role, masterShifts, activeShift);
        const isTelat   = toMenit(formatJamLokal(checkin)) > toMenit(shiftInfo.in);
        kelas += isTelat ? 'bg-red-100 text-red-600 font-bold' : 'bg-green-100 text-green-700 font-bold';
        dot = <span className={`absolute -bottom-0.5 w-1 h-1 rounded-full ${isTelat ? 'bg-red-400' : 'bg-green-400'}`} />;
      } else {
        kelas += 'text-gray-400';
      }
      return <div key={d}><div className={kelas}>{d}{dot}</div></div>;
    });
    return [...blanks, ...days];
  };

  const bukaDetail = (tgl: string) => {
    setDetailModal({ show: true, tgl, inData: groupedRiwayat[tgl]?.in, outData: groupedRiwayat[tgl]?.out });
  };

  const prosesUrlFoto = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('data:image')) return url;
    if (url.startsWith('/files')) return ERPNEXT_URL + url;
    return url;
  };

  return (
    <div className="bg-gray-100 flex items-center justify-center min-h-screen font-sans text-[#3e2723] selection:bg-[#fbc02d] md:p-6 lg:p-10 w-full overflow-hidden">
      <style>{`.hide-scrollbar::-webkit-scrollbar{display:none}.hide-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>

      <div className="w-full md:max-w-4xl lg:max-w-5xl bg-white md:rounded-[3rem] h-screen md:h-[600px] lg:h-[700px] relative shadow-2xl flex flex-col md:flex-row overflow-hidden border border-gray-200">

        {/* ── KIRI (desktop) ── */}
        <div className="hidden md:flex flex-col w-1/2 bg-[#3e2723] relative p-12 lg:p-16 justify-between overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <div className="absolute -top-20 -left-20 w-96 h-96 bg-[#fbc02d] rounded-full blur-3xl" />
            <div className="absolute bottom-10 -right-10 w-72 h-72 bg-orange-400 rounded-full blur-3xl" />
          </div>
          <div className="relative z-10">
            <div className="w-20 h-20 bg-[#fbc02d] rounded-2xl flex items-center justify-center mb-8 shadow-lg shadow-[#fbc02d]/20 rotate-3">
              <i className="fa-solid fa-bread-slice text-[#3e2723] text-4xl -rotate-3" />
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
                <i className="fa-solid fa-shield-halved" />
              </div>
              <div>
                <p className="text-white font-bold text-sm">Aman & Terintegrasi</p>
                <p className="text-white/50 text-xs">Terkoneksi langsung ke ERPNext</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── KANAN ── */}
        <div className="flex-1 flex justify-center bg-gray-50 relative z-20 w-full md:w-1/2 h-full border-l border-gray-200">
          <div className="w-full max-w-sm bg-gray-50 h-full flex flex-col relative mx-auto shadow-none md:shadow-[0_0_15px_rgba(0,0,0,0.05)] overflow-hidden">

            {/* HEADER */}
            <div className="bg-[#3e2723] pt-12 pb-5 px-6 shrink-0 shadow-md z-10 rounded-b-[1.5rem]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Link to="/home" className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform hover:bg-white/30">
                    <i className="fa-solid fa-arrow-left" />
                  </Link>
                  <h1 className="text-xl font-black text-[#fbc02d]">Laporan Absen</h1>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => { if (bulanAktif === 0) { setBulanAktif(11); setTahunAktif(t => t - 1); } else setBulanAktif(b => b - 1); }} className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center text-white text-xs hover:bg-white/30"><i className="fa-solid fa-chevron-left" /></button>
                  <span className="text-white text-xs font-bold min-w-[80px] text-center">{new Date(tahunAktif, bulanAktif, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</span>
                  <button onClick={() => { if (bulanAktif === 11) { setBulanAktif(0); setTahunAktif(t => t + 1); } else setBulanAktif(b => b + 1); }} className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center text-white text-xs hover:bg-white/30"><i className="fa-solid fa-chevron-right" /></button>
                </div>
              </div>

              {/* Status Badge Khusus Outlet (Menampilkan Jadwal Shift Hari Ini) */}
              {outlet && (
                <div className="mt-3 flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2 border border-white/10 min-h-[32px]">
                  <i className={`fa-solid ${shiftLoading ? 'fa-spinner fa-spin' : shiftError ? 'fa-triangle-exclamation text-orange-300' : 'fa-clock text-[#fbc02d]'} text-xs shrink-0`} />
                  {shiftLoading && <p className="text-white/60 text-[10px] font-bold">Membaca shift aktif...</p>}
                  {shiftError && <p className="text-orange-300 text-[10px] font-bold flex-1 leading-tight">{shiftError} <Link to="/shift" className="underline">Ajukan</Link></p>}
                  {activeShift && !shiftLoading && (
                    <p className="text-[10px] font-bold text-white/80 flex-1 truncate">
                      Shift: <span className="text-[#fbc02d]">{activeShift.shift_name}</span>
                      <span className="text-white/50 ml-1">({activeShift.start_time}–{activeShift.end_time})</span>
                    </p>
                  )}
                </div>
              )}

              <div className="mt-4 grid grid-cols-4 gap-2">
                {[
                  { label: 'Hadir', value: rekapHadir, color: 'text-green-400' },
                  { label: 'Telat', value: rekapTelat, color: 'text-red-400' },
                  { label: 'Izin',  value: rekapIzin,  color: 'text-blue-300' },
                  { label: 'Cuti',  value: rekapCuti,  color: 'text-purple-300' },
                ].map(item => (
                  <div key={item.label} className="bg-white/10 rounded-xl py-2 text-center">
                    <p className={`text-xl font-black ${item.color}`}>{item.value}</p>
                    <p className="text-[9px] font-black text-white/60 uppercase tracking-wide">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* KONTEN */}
            <div className="flex-1 overflow-y-auto pb-24 pt-4 hide-scrollbar">

              {/* Badge izin aktif */}
              {leaveRecords.length > 0 && (
                <div className="px-6 mb-3 flex flex-wrap gap-1.5">
                  {leaveRecords.map(r => {
                    const statusColor = r.status?.toLowerCase() === 'approved'
                      ? 'bg-blue-100 text-blue-700 border-blue-200'
                      : r.status?.toLowerCase() === 'rejected'
                        ? 'bg-red-100 text-red-600 border-red-200'
                        : 'bg-yellow-100 text-yellow-700 border-yellow-200';
                    const fromLabel = parseLokalDate(r.from_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                    const toLabel   = parseLokalDate(r.to_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                    return (
                      <div key={r.name} className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full border ${statusColor}`}>
                        <i className="fa-solid fa-envelope-open-text text-[8px]" />
                        <span>{r.leave_type} · {fromLabel}{r.from_date !== r.to_date ? ` – ${toLabel}` : ''}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Kalender mini */}
              <div className="px-6 mb-4">
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <div className="grid grid-cols-7 text-center text-[9px] font-black text-gray-400 mb-1.5">
                    {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map(h => <div key={h}>{h}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-y-0.5 text-center">{renderKalender()}</div>
                  <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100">
                    {[{ color: 'bg-green-400', label: 'Tepat' }, { color: 'bg-red-400', label: 'Telat' }, { color: 'bg-blue-400', label: 'Izin' }].map(l => (
                      <div key={l.label} className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${l.color} inline-block`} />
                        <span className="text-[9px] text-gray-400 font-bold">{l.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Riwayat kehadiran */}
              <div className="px-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-black text-[#3e2723] text-sm">Riwayat Kehadiran</h3>
                  <p className="text-[10px] text-gray-400"><i className="fa-solid fa-hand-pointer mr-1" />Klik untuk detail</p>
                </div>
                <div className="flex flex-col gap-2">
                  {sortedTglKeys.length === 0 && leaveRecords.length === 0 ? (
                    <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-6 text-center shadow-sm">
                      <i className="fa-solid fa-clipboard-list text-3xl text-gray-300 block mb-2" />
                      <p className="text-sm font-bold text-gray-400">Belum ada riwayat bulan ini</p>
                    </div>
                  ) : (
                    <>
                      {tampilKeys.map(tgl => {
                        const d          = groupedRiwayat[tgl];
                        const jamIn      = formatJamLokal(d.in?.time);
                        const jamOut     = formatJamLokal(d.out?.time);
                        const tglDate    = parseLokalDate(tgl);
                        const shiftInfo  = getJamShift(d.in?.shift || d.out?.shift, tgl, user?.branch, user?.role, masterShifts, activeShift);
                        const shiftLabel = validasiShiftName(d.in?.shift || d.out?.shift, tgl, user?.branch, user?.role, activeShift);
                        const adaIzinHariIni = tanggalIzinSet.has(tgl);
                        const dateLabel  = tglDate.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });

                        let badgeEl: React.ReactNode = null;
                        if (jamIn !== '-') {
                          const selisih = toMenit(jamIn) - toMenit(shiftInfo.in);
                          badgeEl = selisih > 0
                            ? <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md">Telat {formatDurasi(selisih)}</span>
                            : <span className="text-green-600 text-[9px] font-black">✓ Tepat</span>;
                        }
                        if (adaIzinHariIni && !badgeEl) {
                          badgeEl = <span className="bg-blue-100 text-blue-600 text-[9px] font-black px-1.5 py-0.5 rounded-md">Izin</span>;
                        }

                        let badgeCepat: React.ReactNode = null;
                        if (jamOut !== '-') {
                          const selisih = toMenit(shiftInfo.out) - toMenit(jamOut);
                          if (selisih > 0) {
                            badgeCepat = <span className="bg-orange-400 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md">Cepat {formatDurasi(selisih)}</span>;
                          }
                        }

                        let badgeBelumKeluar: React.ReactNode = null;
                        if (jamIn !== '-' && jamOut === '-') {
                          badgeBelumKeluar = <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md shadow-sm">Belum Keluar</span>;
                        }

                        return (
                          <div key={tgl} onClick={() => bukaDetail(tgl)} className="cursor-pointer bg-white px-4 py-3 rounded-2xl border border-gray-100 flex flex-col gap-3 shadow-sm active:scale-95 transition-transform hover:border-[#fbc02d]/40">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base shrink-0 ${d.in ? 'bg-green-50 text-green-500' : adaIzinHariIni ? 'bg-blue-50 text-blue-400' : 'bg-gray-50 text-gray-300'}`}>
                                  <i className={`fa-solid ${d.in ? 'fa-check' : adaIzinHariIni ? 'fa-envelope-open-text' : 'fa-minus'}`} />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-[#3e2723] text-sm truncate">{dateLabel}</p>
                                  <p className="text-[9px] font-bold text-gray-400 truncate">{shiftLabel || '-'}</p>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                {badgeEl}{badgeCepat}{badgeBelumKeluar}
                              </div>
                            </div>
                            
                            <div className="bg-gray-50 border border-gray-100 rounded-xl py-2 px-4 flex items-center justify-between mt-0.5">
                              <div className="flex flex-col">
                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Aktual</span>
                                <div className="flex items-center gap-1.5 text-xs font-black text-[#3e2723]">
                                  <span>{jamIn}</span>
                                  <i className="fa-solid fa-arrow-right text-gray-300 text-[9px]" />
                                  <span>{jamOut === '-' && badgeBelumKeluar ? <span className="text-red-400 italic">?</span> : jamOut}</span>
                                </div>
                              </div>
                              <div className="h-6 w-px bg-gray-200" />
                              <div className="flex flex-col items-end">
                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Jadwal</span>
                                <div className="flex items-center gap-1.5 text-xs font-black text-[#fbc02d]">
                                  <span>{shiftInfo.in}</span>
                                  <span className="text-gray-300 text-[10px]">-</span>
                                  <span>{shiftInfo.out}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {sortedTglKeys.length > 5 && (
                        <button onClick={() => setLihatSemua(v => !v)} className="w-full mt-1 py-3 rounded-2xl border border-dashed border-gray-300 text-xs font-black text-gray-400 hover:border-[#fbc02d] hover:text-[#3e2723] hover:bg-white transition-colors flex items-center justify-center gap-2">
                          <i className={`fa-solid ${lihatSemua ? 'fa-chevron-up' : 'fa-chevron-down'}`} />
                          {lihatSemua ? 'Lebih Sedikit' : `Lihat Semua (${sortedTglKeys.length} hari)`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* BOTTOM NAV */}
            <BottomNav />

            {/* ══════════════════════════════════
                MODAL ABSEN
            ══════════════════════════════════ */}
            {isModalAbsenOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8" style={{ background: 'rgba(62,39,35,0.92)', backdropFilter: 'blur(6px)' }}>
                <div className="bg-white w-full max-w-sm mx-auto md:max-w-lg md:rounded-[2rem] rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden mt-auto mb-auto md:mt-0" style={{ maxHeight: '90vh' }}>

                  {/* Header modal */}
                  <div className="bg-[#3e2723] px-5 pt-4 pb-4 shrink-0">
                    <div className="flex items-start justify-between w-full">
                      <div className="flex flex-col gap-1 w-[70%]">
                        <p className="text-white text-2xl font-black leading-none">{jamModal}</p>
                        <p className="text-[#fbc02d] text-[9px] font-bold tracking-wide mt-1">
                          <i className="fa-solid fa-clock mr-1" />
                          {outlet 
                            ? activeShift 
                                ? `${activeShift.shift_name} • ${activeShift.start_time}-${activeShift.end_time}` 
                                : 'Jadwal Shift belum diatur HRD'
                            : `${getNamaShiftKantor(new Date(), user?.branch, satpam)} • ${getJamShiftKantor(new Date(), satpam).in}-${getJamShiftKantor(new Date(), satpam).out}`
                          }
                        </p>
                      </div>
                      <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 h-fit shrink-0 ${modeAbsen === 'MASUK' ? 'bg-green-500/30 border border-green-400/40' : 'bg-orange-500/30 border border-orange-400/40'}`}>
                        <div className={`w-2 h-2 rounded-full ${modeAbsen === 'MASUK' ? 'bg-green-400' : 'bg-orange-400'} animate-pulse`} />
                        <p className={`font-black text-xs uppercase tracking-wider ${modeAbsen === 'MASUK' ? 'text-green-300' : 'text-orange-300'}`}>{modeAbsen}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between w-full mt-3">
                      {/* Status GPS */}
                      {(cameraStep === 1 || cameraStep === 2) ? (
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold ${gpsStatus.tipe === 'error' ? 'bg-red-900/50 text-red-300' : gpsStatus.tipe === 'ok' ? 'bg-green-900/40 text-green-300' : 'bg-white/10 text-white/70'}`}>
                          {gpsStatus.tipe === 'loading' ? <i className="fa-solid fa-spinner fa-spin" /> : <i className={`fa-solid ${gpsStatus.tipe === 'error' ? 'fa-triangle-exclamation' : 'fa-location-dot'}`} />}
                          <span className="truncate max-w-[180px]">{gpsStatus.pesan}</span>
                        </div>
                      ) : <div className="flex-1" />}

                      {/* Step indicator */}
                      <div className="flex items-center gap-1 ml-2">
                        {stepsData.map((s, i) => (
                          <div key={s.n} className="flex items-center gap-1">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black ${cameraStep > s.n ? 'bg-green-400 text-white' : cameraStep === s.n ? 'bg-[#fbc02d] text-[#3e2723]' : 'bg-white/20 text-white/50'}`}>
                              {cameraStep > s.n ? <i className="fa-solid fa-check" /> : <i className={`fa-solid ${s.icon}`} />}
                            </div>
                            {i < stepsData.length - 1 && <div className={`w-1.5 h-0.5 rounded-full ${cameraStep > s.n ? 'bg-green-400' : 'bg-white/20'}`} />}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Body modal */}
                  <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

                    {/* ── Step 1 & 2: Kamera Wajah digabung agar tidak black screen ── */}
                    {(cameraStep === 1 || cameraStep === 2) && (
                      <>
                        <div className={`bg-${cameraStep === 1 ? 'red' : 'blue'}-50 border border-${cameraStep === 1 ? 'red' : 'blue'}-100 rounded-2xl px-3 py-2.5 flex gap-3 items-center shadow-sm`}>
                          <div className={`w-8 h-8 rounded-full bg-${cameraStep === 1 ? 'red' : 'blue'}-100 flex items-center justify-center text-${cameraStep === 1 ? 'red' : 'blue'}-500 shrink-0`}>
                            <i className={`fa-solid ${cameraStep === 1 ? 'fa-camera-rotate' : 'fa-hand'}`} />
                          </div>
                          <div>
                            <p className={`text-${cameraStep === 1 ? 'red' : 'blue'}-700 text-xs font-black leading-tight`}>
                              {cameraStep === 1 
                                ? (outlet ? 'Selfie + Tangan Kanan' : satpam ? 'Selfie Wajah (Satpam)' : 'Selfie Wajah')
                                : 'Selfie + Tangan Kiri'
                              }
                            </p>
                            <p className={`text-${cameraStep === 1 ? 'red' : 'blue'}-500 text-[10px] font-bold leading-snug`}>
                              {cameraStep === 1 
                                ? (outlet ? 'Perlihatkan wajah & kuku tangan kananmu dengan jelas.' : 'Pastikan wajah terlihat jelas di kamera.')
                                : 'Perlihatkan wajah & kuku tangan kirimu dengan jelas.'
                              }
                            </p>
                          </div>
                        </div>

                        {/* Kontainer Video 3:4 */}
                        <div className={`w-full rounded-2xl overflow-hidden border-[3px] ${kameraBorder} bg-black relative transition-colors shadow-inner flex items-center justify-center aspect-[3/4]`}>
                          
                          {/* Instruksi khusus Step 2 outlet */}
                          {cameraStep === 2 && outlet && (
                            <div className="absolute top-4 z-30 flex justify-center px-4 pointer-events-none">
                              <span className="bg-white/90 text-[#3e2723] text-[10px] font-black px-4 py-2 rounded-full shadow-lg border border-gray-200">Arahkan tangan kiri ke kamera</span>
                            </div>
                          )}

                          {/* Video */}
                          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted style={{ transform: 'scaleX(-1)' }} />
                          
                          {/* Live Overlay Info (Tampilan di layar HP sebelum jepret) */}
                          <div className="absolute bottom-3 left-3 z-20 bg-black/60 rounded-md px-2 py-1.5 pointer-events-none select-none">
                            <p className="text-white text-[9px] font-mono leading-tight">{jamModal}</p>
                            <p className="text-yellow-200 text-[9px] font-mono leading-tight">📍 {namaLokasi}</p>
                          </div>

                          {/* Indikator Wajah AI */}
                          {wajahStatus.show && (
                            <div className={`absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black shadow-md ${wajahStatus.ok ? 'bg-green-500 text-white' : 'bg-orange-400 text-white'}`}>
                              <i className={`fa-solid ${wajahStatus.ok ? 'fa-face-smile' : 'fa-face-meh'} text-xs`} />
                              {wajahStatus.ok ? 'Wajah Terdeteksi' : 'Cari Wajah...'}
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* ── Step 3: Tanda tangan (Square Ratio) ── */}
                    {cameraStep === 3 && (
                      <>
                        <div className="bg-purple-50 border border-purple-100 rounded-2xl px-3 py-2.5 flex gap-3 items-center shadow-sm">
                          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-500 shrink-0"><i className="fa-solid fa-pen-nib" /></div>
                          <div>
                            <p className="text-purple-800 text-xs font-black leading-tight">Tanda Tangan Digital</p>
                            <p className="text-purple-500 text-[10px] font-bold mt-0.5">Goreskan jari di dalam kotak putih di bawah ini.</p>
                          </div>
                        </div>
                        <div className="w-full rounded-2xl overflow-hidden border-[3px] border-purple-200 bg-white shadow-inner relative aspect-square" style={{ touchAction: 'none' }}>
                          <canvas ref={ttdCanvasRef} className="w-full h-full block cursor-crosshair" />
                          {isTtdEmpty && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="w-20 h-20 border-4 border-dashed border-gray-200 rounded-full flex items-center justify-center opacity-50">
                                <span className="text-gray-300 text-xl font-black">TTD</span>
                              </div>
                            </div>
                          )}
                        </div>
                        {!isTtdEmpty && (
                          <button onClick={bersihkanTTD} className="text-[10px] font-bold text-red-500 hover:underline text-center w-full mt-1">
                            <i className="fa-solid fa-eraser mr-1" />Hapus & Ulangi TTD
                          </button>
                        )}
                      </>
                    )}

                    {/* ── Step 4: Review & kirim ── */}
                    {cameraStep === 4 && (
                      <div className="flex flex-col gap-4">
                        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-3 py-2.5 flex gap-3 items-center shadow-sm">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-500 shrink-0"><i className="fa-solid fa-eye" /></div>
                          <div>
                            <p className="text-blue-800 text-xs font-black leading-tight">Review Bukti Absen</p>
                            <p className="text-blue-500 text-[10px] font-bold mt-0.5">Pastikan semua foto jelas sebelum dikirim.</p>
                          </div>
                        </div>

                        {/* CAROUSEL KHUSUS OUTLET ATAU KOTAK KANTOR */}
                        {outlet ? (
                          <div className="flex flex-col gap-2 w-full">
                            <div className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory hide-scrollbar w-full">
                              {/* Foto 1 */}
                              <div className="shrink-0 w-[85%] snap-center flex flex-col gap-1.5">
                                <p className="text-[10px] font-black text-gray-400 uppercase text-center">📸 Wajah + Kanan</p>
                                <div className="rounded-2xl overflow-hidden border-2 border-gray-200 shadow-sm bg-black aspect-[3/4] flex items-center justify-center">
                                  <img src={fotoBase64 || ''} className="w-full h-full object-contain" alt="Kanan" />
                                </div>
                              </div>
                              {/* Foto 2 */}
                              <div className="shrink-0 w-[85%] snap-center flex flex-col gap-1.5">
                                <p className="text-[10px] font-black text-gray-400 uppercase text-center">📸 Wajah + Kiri</p>
                                <div className="rounded-2xl overflow-hidden border-2 border-gray-200 shadow-sm bg-black aspect-[3/4] flex items-center justify-center">
                                  <img src={fotoKiriBase64 || ''} className="w-full h-full object-contain" alt="Kiri" />
                                </div>
                              </div>
                              {/* TTD */}
                              <div className="shrink-0 w-[85%] snap-center flex flex-col gap-1.5">
                                <p className="text-[10px] font-black text-gray-400 uppercase text-center">✍️ Tanda Tangan</p>
                                <div className="rounded-2xl border-2 border-gray-200 bg-white p-2 shadow-sm aspect-[3/4] flex items-center justify-center">
                                  <img src={ttdBase64 || ''} className="w-full h-auto max-h-full object-contain mix-blend-multiply" alt="TTD" />
                                </div>
                              </div>
                            </div>
                            <div className="flex justify-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-gray-300 animate-pulse"></span>
                              <span className="w-2 h-2 rounded-full bg-gray-300 animate-pulse delay-75"></span>
                              <span className="w-2 h-2 rounded-full bg-gray-300 animate-pulse delay-150"></span>
                            </div>
                            <p className="text-[9px] text-center text-gray-400 font-bold italic">Geser untuk melihat semua foto & TTD →</p>
                          </div>
                        ) : (
                          // Layout Kantor biasa
                          <>
                            <div className="flex flex-col gap-1">
                              <p className="text-[10px] font-black text-gray-400 uppercase pl-1 text-center">📸 Selfie Wajah</p>
                              <div className="rounded-2xl overflow-hidden border-2 border-gray-200 shadow-sm bg-black flex items-center justify-center max-w-[240px] mx-auto w-full aspect-[3/4]">
                                <img src={fotoBase64 || ''} className="w-full h-full object-contain" alt="Selfie" />
                              </div>
                            </div>

                            <div className="w-full max-w-[240px] mx-auto rounded-2xl border border-gray-200 bg-white p-3 shadow-sm flex flex-col items-center">
                              <p className="text-[10px] font-black text-gray-400 uppercase mb-2 border-b border-dashed border-gray-200 w-full text-center pb-1">✍️ Tanda Tangan</p>
                              <div className="w-full aspect-square flex items-center justify-center">
                                <img src={ttdBase64 || ''} className="max-w-full max-h-full object-contain mix-blend-multiply" alt="TTD" />
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer modal – tombol aksi */}
                  <div className="px-5 pb-6 pt-3 shrink-0 border-t border-gray-100 bg-gray-50">

                    {/* Step 1 & 2: Batal / Jepret */}
                    {(cameraStep === 1 || cameraStep === 2) && (
                      <div className="grid grid-cols-2 gap-3">
                        <button onClick={tutupModal} className="bg-white border border-gray-200 text-gray-500 font-black py-3.5 rounded-2xl active:scale-95 text-sm flex items-center justify-center gap-2 shadow-sm">
                          <i className="fa-solid fa-xmark" /> Batal
                        </button>
                        <button
                          disabled={!jepretState.aktif}
                          onClick={jepretFoto}
                          className={`font-black py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-95 text-sm transition-all shadow-md ${
                            jepretState.aktif
                              ? cameraStep === 2
                                ? 'bg-blue-500 hover:bg-blue-600 text-white'
                                : 'bg-green-500 hover:bg-green-600 text-white'
                              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          <i className="fa-solid fa-camera shrink-0" />
                          <span>{jepretState.teks}</span>
                        </button>
                      </div>
                    )}

                    {/* Step 3: Batal / Lanjut */}
                    {cameraStep === 3 && (
                      <div className="grid grid-cols-2 gap-3">
                        <button onClick={tutupModal} className="bg-white border border-gray-200 text-gray-500 font-black py-3.5 rounded-2xl active:scale-95 text-sm flex items-center justify-center gap-2 shadow-sm">
                          <i className="fa-solid fa-xmark" /> Batal
                        </button>
                        <button
                          onClick={simpanTTD}
                          disabled={isTtdEmpty}
                          className={`font-black py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-95 text-sm transition-all shadow-md ${
                            !isTtdEmpty ? 'bg-purple-500 hover:bg-purple-600 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          <i className="fa-solid fa-check shrink-0" /> Lanjut
                        </button>
                      </div>
                    )}

                    {/* Step 4: Ulangi / Kirim */}
                    {cameraStep === 4 && (
                      <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => bukaModalAbsen(modeAbsen)} className="bg-white border border-gray-200 text-gray-500 font-black py-3.5 rounded-2xl active:scale-95 flex items-center justify-center gap-2 text-sm shadow-sm">
                          <i className="fa-solid fa-rotate-right shrink-0" /> Ulangi
                        </button>
                        <button
                          onClick={kirimAbsen}
                          disabled={isKirimLoading}
                          className="bg-[#3e2723] hover:bg-[#4e342e] text-[#fbc02d] font-black py-3.5 rounded-2xl shadow-md flex items-center justify-center gap-2 active:scale-95 text-sm transition-colors"
                        >
                          {isKirimLoading ? <i className="fa-solid fa-spinner fa-spin shrink-0" /> : <i className="fa-solid fa-paper-plane shrink-0" />}
                          {isKirimLoading ? 'Mengirim...' : 'Kirim Absen'}
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )}

            {/* ══════════════════════════════════
                MODAL DETAIL RIWAYAT
            ══════════════════════════════════ */}
            {detailModal.show && (() => {
              const tglDate   = parseLokalDate(detailModal.tgl);
              const shiftInfo = getJamShift(
                detailModal.inData?.shift || detailModal.outData?.shift,
                detailModal.tgl, user?.branch, user?.role, masterShifts, activeShift
              );
              const shiftLabel = validasiShiftName(
                detailModal.inData?.shift || detailModal.outData?.shift,
                detailModal.tgl, user?.branch, user?.role, activeShift
              );
              const hariLabel = tglDate.toLocaleDateString('id-ID', { weekday: 'long' });
              const tglLabel  = tglDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
              const inJam     = detailModal.inData?.time  ? formatJamLokal(detailModal.inData.time)  : null;
              const outJam    = detailModal.outData?.time ? formatJamLokal(detailModal.outData.time) : null;

              const hasVerifImage = !!(detailModal.inData?.custom_verification_image || detailModal.outData?.custom_verification_image);

              const FotoSlot = ({ src, label, badge, badgeColor }: { src?: string; label: string; badge: string; badgeColor: string }) => (
                <div className="flex flex-col gap-1 w-full max-w-[240px] mx-auto shrink-0 snap-center">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide pl-1 text-center">{label}</p>
                  <div className="relative rounded-2xl overflow-hidden bg-black border border-gray-200 shadow-sm flex items-center justify-center aspect-[3/4]">
                    {src
                      ? <img src={prosesUrlFoto(src)} className="w-full h-full object-contain" alt={label} />
                      : <div className="absolute inset-0 flex flex-col items-center justify-center gap-1"><i className="fa-solid fa-image-slash text-2xl text-gray-500" /><p className="text-[10px] text-gray-500 font-bold">Tidak ada foto</p></div>
                    }
                    <div className={`absolute top-2 left-2 ${badgeColor} text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-sm border border-white/20`}>{badge}</div>
                  </div>
                </div>
              );

              return (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8" style={{ background: 'rgba(62,39,35,0.92)', backdropFilter: 'blur(6px)' }}>
                  <div className="bg-white w-full max-w-sm mx-auto md:max-w-2xl md:rounded-[2rem] rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden mt-auto mb-auto md:mt-0" style={{ maxHeight: '90vh' }}>

                    <div className="bg-[#3e2723] px-5 pt-5 pb-5 shrink-0 relative">
                      <button onClick={() => setDetailModal({ show: false, tgl: '' })} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-red-500 transition-colors">
                        <i className="fa-solid fa-xmark" />
                      </button>
                      <div className="pr-10">
                        <p className="text-[#fbc02d] text-[10px] font-black uppercase tracking-widest mb-0.5">{hariLabel}</p>
                        <h2 className="text-white text-xl font-black leading-tight">{tglLabel}</h2>
                      </div>
                      <div className="mt-5 grid grid-cols-2 gap-3">
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-3 flex flex-col justify-center relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-16 h-16 bg-green-500/10 rounded-full -mr-6 -mt-6 blur-md" />
                          <div className="flex items-center gap-1.5 mb-1"><i className="fa-solid fa-right-to-bracket text-green-400 text-xs" /><p className="text-green-400 text-[10px] font-black uppercase">Masuk</p></div>
                          <p className="text-white font-black text-2xl leading-none">{inJam ?? <span className="text-white/20">–</span>}</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-3 flex flex-col justify-center relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-16 h-16 bg-orange-500/10 rounded-full -mr-6 -mt-6 blur-md" />
                          <div className="flex items-center gap-1.5 mb-1"><i className="fa-solid fa-right-from-bracket text-orange-400 text-xs" /><p className="text-orange-400 text-[10px] font-black uppercase">Keluar</p></div>
                          <p className="text-white font-black text-2xl leading-none">{outJam ?? <span className="text-white/20">–</span>}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-white/50 bg-black/20 rounded-xl py-1.5 px-3 flex-wrap text-center">
                        <i className="fa-solid fa-clock" />
                        <span>Jadwal: <span className="text-white/80 font-bold">{shiftLabel || '-'}</span></span>
                        <span className="text-white/30">·</span>
                        <span className="text-white/80 font-bold">{shiftInfo.in} – {shiftInfo.out}</span>
                        {satpam && <span className="text-yellow-300 font-black text-[9px] ml-1">(Satpam)</span>}
                      </div>
                    </div>

                    <div className={`flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-6 bg-gray-50`}>
                      
                      {/* Kalau Outlet (Punya Foto Kiri), pakai carousel biar rapi di HP */}
                      {hasVerifImage ? (
                        <div className="flex flex-col gap-6 w-full">
                           {/* CONTAINER MASUK */}
                           <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 flex flex-col gap-3">
                              <div className="flex items-center gap-2 border-b border-gray-50 pb-2">
                                <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center shrink-0"><i className="fa-solid fa-camera text-blue-500 text-[10px]" /></div>
                                <p className="text-xs font-black text-[#3e2723] uppercase tracking-wider">Foto Masuk</p>
                              </div>
                              <div className="flex overflow-x-auto gap-4 pb-2 snap-x snap-mandatory hide-scrollbar">
                                 <FotoSlot src={detailModal.inData?.custom_foto_absen} label="Wajah + Kanan" badge="Masuk" badgeColor="bg-green-500" />
                                 <FotoSlot src={detailModal.inData?.custom_verification_image} label="Wajah + Kiri" badge="Masuk" badgeColor="bg-green-500" />
                                 <div className="flex flex-col gap-1 w-full max-w-[240px] mx-auto shrink-0 snap-center">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide pl-1 text-center">Tanda Tangan</p>
                                    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden flex items-center justify-center relative shadow-inner aspect-[3/4]">
                                       {detailModal.inData?.custom_signature ? <img src={prosesUrlFoto(detailModal.inData.custom_signature)} className="w-full h-auto object-contain mix-blend-multiply" alt="TTD Masuk" /> : <div className="flex flex-col items-center gap-1"><i className="fa-solid fa-pen-slash text-gray-300 text-xl" /><p className="text-[9px] text-gray-400 font-bold">Belum ada TTD</p></div>}
                                       <div className="absolute top-2 left-2 bg-green-500 text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-sm border border-white/20">Masuk</div>
                                    </div>
                                 </div>
                              </div>
                              <p className="text-[9px] text-center text-gray-400 italic">Geser untuk melihat semua foto Masuk →</p>
                           </div>

                           {/* CONTAINER KELUAR */}
                           {detailModal.outData && (
                             <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 flex flex-col gap-3">
                                <div className="flex items-center gap-2 border-b border-gray-50 pb-2">
                                  <div className="w-6 h-6 rounded-full bg-orange-50 flex items-center justify-center shrink-0"><i className="fa-solid fa-camera text-orange-500 text-[10px]" /></div>
                                  <p className="text-xs font-black text-[#3e2723] uppercase tracking-wider">Foto Keluar</p>
                                </div>
                                <div className="flex overflow-x-auto gap-4 pb-2 snap-x snap-mandatory hide-scrollbar">
                                   <FotoSlot src={detailModal.outData?.custom_foto_absen} label="Wajah + Kanan" badge="Keluar" badgeColor="bg-orange-500" />
                                   <FotoSlot src={detailModal.outData?.custom_verification_image} label="Wajah + Kiri" badge="Keluar" badgeColor="bg-orange-500" />
                                   <div className="flex flex-col gap-1 w-full max-w-[240px] mx-auto shrink-0 snap-center">
                                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide pl-1 text-center">Tanda Tangan</p>
                                      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden flex items-center justify-center relative shadow-inner aspect-[3/4]">
                                         {detailModal.outData?.custom_signature ? <img src={prosesUrlFoto(detailModal.outData.custom_signature)} className="w-full h-full object-contain p-2 mix-blend-multiply" alt="TTD Keluar" /> : <div className="flex flex-col items-center gap-1"><i className="fa-solid fa-pen-slash text-gray-300 text-xl" /><p className="text-[9px] text-gray-400 font-bold">Belum ada TTD</p></div>}
                                         <div className="absolute top-2 left-2 bg-orange-500 text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-sm border border-white/20">Keluar</div>
                                      </div>
                                   </div>
                                </div>
                                <p className="text-[9px] text-center text-gray-400 italic">Geser untuk melihat semua foto Keluar →</p>
                             </div>
                           )}
                        </div>
                      ) : (
                        // Layout Kantor Biasa (Grid statis)
                        <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start w-full">
                          <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100">
                            <div className="flex items-center gap-2 mb-3 border-b border-gray-50 pb-2">
                              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><i className="fa-solid fa-camera text-gray-500 text-[10px]" /></div>
                              <p className="text-xs font-black text-[#3e2723] uppercase tracking-wider">Selfie Wajah</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <FotoSlot src={detailModal.inData?.custom_foto_absen}  label="Masuk"  badge="Masuk"  badgeColor="bg-green-500" />
                              <FotoSlot src={detailModal.outData?.custom_foto_absen} label="Keluar" badge="Keluar" badgeColor="bg-orange-500" />
                            </div>
                          </div>

                          <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100">
                            <div className="flex items-center gap-2 mb-3 border-b border-gray-50 pb-2">
                              <div className="w-6 h-6 rounded-full bg-purple-50 flex items-center justify-center shrink-0"><i className="fa-solid fa-pen-nib text-purple-500 text-[10px]" /></div>
                              <p className="text-xs font-black text-[#3e2723] uppercase tracking-wider">Tanda Tangan</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              {[{ label: 'Masuk', data: detailModal.inData }, { label: 'Keluar', data: detailModal.outData }].map(({ label, data }) => (
                                <div key={label} className="flex flex-col gap-1.5">
                                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide pl-1 text-center">{label}</p>
                                  <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden flex items-center justify-center relative shadow-inner aspect-[3/4]">
                                    {data?.custom_signature
                                      ? <img src={prosesUrlFoto(data.custom_signature)} className="w-full h-auto object-contain mix-blend-multiply" alt={`TTD ${label}`} />
                                      : <div className="flex flex-col items-center gap-1"><i className="fa-solid fa-pen-slash text-gray-300 text-xl" /><p className="text-[9px] text-gray-400 font-bold">Belum ada</p></div>
                                    }
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="p-4 shrink-0 bg-white border-t border-gray-100">
                      <button onClick={() => setDetailModal({ show: false, tgl: '' })} className="w-full bg-gray-100 hover:bg-gray-200 text-[#3e2723] font-black py-4 rounded-2xl active:scale-95 transition-colors flex items-center justify-center gap-2">
                        <i className="fa-solid fa-check text-[#fbc02d]" /> Mengerti & Tutup
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

          </div>
        </div>
      </div>
    </div>
  );
};

export default Absen;