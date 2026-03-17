import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import BottomNav from '../components/BottomNav';

declare global { interface Window { faceapi: any; } }

interface User {
  name: string; role?: string; employee_id: string; branch?: string;
}
interface Lokasi {
  nama: string; lat: number; lng: number; radius: number;
}
interface RiwayatAbsen {
  time?: string; attendance_date?: string; log_type: string;
  custom_foto_absen?: string; custom_verification_image?: string;
  custom_signature?: string; shift?: string;
}
interface LeaveRecord {
  name: string; leave_type: string; from_date: string; to_date: string; status: string;
}
interface ActiveShift {
  shift_name: string; start_time: string; end_time: string;
}

// ─── HELPERS ───────────────────────────────────────────────────────

const formatJamLokal = (t?: string) => {
  if (!t) return '-';
  const p = t.split(' ');
  return (p.length > 1 ? p[1] : t).substring(0, 5);
};
const formatDurasi = (m: number) => {
  if (m < 60) return `${m}m`;
  const j = Math.floor(m / 60), s = m % 60;
  return s > 0 ? `${j}j ${s}m` : `${j}j`;
};
const toMenit = (jam: string) => {
  if (!jam || jam === '-') return 0;
  const [h, m] = jam.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const parseLokalDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// ─── TIPE KARYAWAN ─────────────────────────────────────────────────

const isKaryawanOutlet = (branch?: string) => {
  if (!branch) return false;
  const b = branch.toLowerCase();
  return !b.includes('klaten') && !b.includes('ph') && !b.includes('jakarta');
};

// ─── SHIFT KANTOR (PH Klaten / Jakarta) ───────────────────────────

const isRamadhan = (d?: Date) => {
  const now = d || new Date();
  const [y, mo, tgl] = [now.getFullYear(), now.getMonth() + 1, now.getDate()];
  if (y === 2025 && mo === 3 && tgl >= 1 && tgl <= 30) return true;
  if (y === 2026 && mo === 2 && tgl >= 18) return true;
  if (y === 2026 && mo === 3 && tgl <= 19) return true;
  return false;
};
const getShiftKantor = (d: Date, branch?: string) => {
  const isFri = d.getDay() === 5, ram = isRamadhan(d);
  const bl = branch?.toLowerCase().includes('jakarta') ? 'Jakarta' : 'PH Klaten';
  return `${isFri ? 'Jumat' : 'Senin - Kamis'} (${bl} ${ram ? 'Ramadhan' : 'Non Ramadhan'})`;
};
const getJamShiftKantor = (
  rec: string | undefined, tgl: string, branch: string | undefined,
  master: Record<string, { in: string; out: string }>
): { in: string; out: string } => {
  if (rec && master[rec]) return master[rec];
  const d = parseLokalDate(tgl), nama = getShiftKantor(d, branch);
  if (master[nama]) return master[nama];
  const isFri = d.getDay() === 5, ram = isRamadhan(d);
  if (ram) return isFri ? { in: '07:00', out: '16:00' } : { in: '07:00', out: '15:30' };
  return isFri ? { in: '07:30', out: '17:00' } : { in: '07:30', out: '16:30' };
};

// ─── UNIFIED getJamShift + getNamaShift ───────────────────────────

const getJamShift = (
  rec: string | undefined, tgl: string, branch: string | undefined,
  master: Record<string, { in: string; out: string }>, active: ActiveShift | null
): { in: string; out: string } => {
  if (isKaryawanOutlet(branch)) {
    if (active) return { in: active.start_time, out: active.end_time };
    if (rec && master[rec]) return master[rec];
    return { in: '05:00', out: '13:00' };
  }
  return getJamShiftKantor(rec, tgl, branch, master);
};
const getNamaShift = (
  rec: string | undefined, tgl: string, branch: string | undefined,
  master: Record<string, { in: string; out: string }>, active: ActiveShift | null
): string => {
  if (isKaryawanOutlet(branch)) return active?.shift_name ?? rec ?? 'Shift Outlet';
  const d = parseLokalDate(tgl), hari = d.getDay();
  const isWknd = hari === 0 || hari === 6, lok = getShiftKantor(d, branch);
  if (isWknd || !rec) return lok;
  const rFri = rec.toLowerCase().includes('jumat'), rSen = rec.toLowerCase().includes('senin');
  if ((hari === 5 && rSen) || (hari !== 5 && !isWknd && rFri)) return lok;
  return rec;
};

// ─── HITUNGAN HARI KERJA ───────────────────────────────────────────

const hitungHari = (
  records: LeaveRecord[], fn: (r: LeaveRecord) => boolean,
  tahun: number, bulan: number
) => {
  const mulai = new Date(tahun, bulan, 1), akhir = new Date(tahun, bulan + 1, 0);
  return records.filter(fn).reduce((acc, r) => {
    const from = parseLokalDate(r.from_date), to = parseLokalDate(r.to_date);
    const s = from < mulai ? mulai : from, e = to > akhir ? akhir : to;
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1))
      if (d.getDay() !== 0 && d.getDay() !== 6) acc++;
    return acc;
  }, 0);
};

// ─── OVERLAY TIMESTAMP + LOKASI ───────────────────────────────────
// Render 2 baris di pojok kanan bawah foto:
//   Baris 1: HH:MM:SS  Sel, 17 Mar 2026
//   Baris 2: 📍 Nama Lokasi GPS
// namaLokasi diisi dari cekRadius (kantor) atau reverse geocode (outlet)

const drawOverlay = (ctx: CanvasRenderingContext2D, w: number, h: number, lokasi: string) => {
  const now      = new Date();
  const baris1   = `${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}  ${now.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}`;
  const baris2   = `\u{1F4CD} ${lokasi}`;
  const pad      = 7, fs = Math.max(10, Math.round(w * 0.036));
  ctx.font       = `bold ${fs}px monospace`;
  const tw1      = ctx.measureText(baris1).width;
  const tw2      = ctx.measureText(baris2).width;
  const bw       = Math.max(tw1, tw2) + pad * 2;
  const bh       = fs * 2 + pad * 3; // 2 baris + spacing antar baris
  const x        = 8, y = h - bh - 8;  // kiri bawah — aman dari crop object-cover
  ctx.fillStyle  = 'rgba(0,0,0,0.6)';
  ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 5); ctx.fill();
  ctx.fillStyle  = '#fff'; ctx.textBaseline = 'top';
  ctx.fillText(baris1, x + pad, y + pad);
  ctx.fillStyle  = '#fde68a'; // kuning muda untuk baris lokasi
  ctx.fillText(baris2, x + pad, y + pad + fs + 4);
};

// ═══════════════════════════════════════════════════════════════════
// KOMPONEN
// ═══════════════════════════════════════════════════════════════════

const Absen = () => {
  const navigate  = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const BACKEND      = (import.meta as any).env?.VITE_API_URL || 'https://ropi-hr-backend.vercel.app';
  const ERPNEXT_URL  = 'http://103.187.147.240';
  const LOK_FALLBACK: Lokasi[] = [{ nama: 'PH Klaten', lat: -7.6146229, lng: 110.6867057, radius: 70 }];

  const [user,          setUser]         = useState<User | null>(null);
  const [activeShift,   setActiveShift]  = useState<ActiveShift | null>(null);
  const [shiftLoading,  setShiftLoading] = useState(false);
  const [shiftError,    setShiftError]   = useState<string | null>(null);
  const [lokasiKantor,  setLokasiKantor] = useState<Lokasi[]>(LOK_FALLBACK);
  const [dataRiwayat,   setDataRiwayat]  = useState<RiwayatAbsen[]>([]);
  const [bulanAktif,    setBulanAktif]   = useState(new Date().getMonth());
  const [tahunAktif,    setTahunAktif]   = useState(new Date().getFullYear());
  const [masterShifts,  setMasterShifts] = useState<Record<string, { in: string; out: string }>>({});
  const [leaveRecords,  setLeaveRecords] = useState<LeaveRecord[]>([]);
  const [lihatSemua,    setLihatSemua]   = useState(false);

  // Modal absen — 3 step: 1=Selfie 2=TTD 3=Review
  const [isModalOpen,   setIsModalOpen]   = useState(false);
  const [modeAbsen,     setModeAbsen]     = useState('MASUK');
  const [jamModal,      setJamModal]      = useState('--:--');
  const [gpsStatus,     setGpsStatus]     = useState({ tipe: 'loading', pesan: 'Mendeteksi lokasi...' });
  const [wajahStatus,   setWajahStatus]   = useState({ show: false, ok: false });
  const [kameraBorder,  setKameraBorder]  = useState('border-[#fbc02d]');
  const [cameraStep,    setCameraStep]    = useState(1);
  const [fotoBase64,    setFotoBase64]    = useState<string | null>(null);
  const [ttdBase64,     setTtdBase64]     = useState<string | null>(null);
  const [isTtdEmpty,    setIsTtdEmpty]    = useState(true);
  const [jepretState,   setJepretState]   = useState({ aktif: false, teks: 'Cek Sistem...' });
  const [isKirimLoad,   setIsKirimLoad]   = useState(false);
  const [koordinatGPS,  setKoordinatGPS]  = useState<{ lat: number; lng: number } | null>(null);
  const [namaLokasi,    setNamaLokasi]    = useState<string>('Mendeteksi...');

  // Modal detail
  const [detailModal, setDetailModal] = useState<{
    show: boolean; tgl: string; inData?: RiwayatAbsen; outData?: RiwayatAbsen;
  }>({ show: false, tgl: '' });

  const videoRef      = useRef<HTMLVideoElement>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const deteksiRef    = useRef<number | null>(null);
  const jamIntervalRef= useRef<number | null>(null);
  const ttdCanvasRef  = useRef<HTMLCanvasElement>(null);
  const isDrawingRef  = useRef(false);
  const lastPosRef    = useRef<{ x: number; y: number } | null>(null);

  // ── Init ──────────────────────────────────────────────────────────
  useEffect(() => {
    const ud = localStorage.getItem('ropi_user');
    if (!ud) { navigate('/'); return; }
    const u = JSON.parse(ud);
    setUser(u);
    ambilLokasiKantor(u.branch);
    ambilMasterShift();
    if (isKaryawanOutlet(u.branch)) ambilActiveShift(u.employee_id);
  }, [navigate]);

  useEffect(() => {
    if (user) { ambilRiwayat(); ambilIzin(user.employee_id); }
  }, [user, bulanAktif, tahunAktif]);

  useEffect(() => { setLihatSemua(false); }, [bulanAktif, tahunAktif]);

  useEffect(() => {
    const mode = searchParams.get('mode'), auto = searchParams.get('auto');
    if (auto === 'true' && mode && user) setTimeout(() => bukaModal(mode), 500);
  }, [searchParams, user]);

  useEffect(() => () => matikanKamera(), []);

  // TTD canvas setup (step 2)
  useEffect(() => {
    if (cameraStep !== 2) return;
    const timer = setTimeout(() => {
      const canvas = ttdCanvasRef.current; if (!canvas) return;
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width || 300; canvas.height = 200;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';

      const getPos = (e: MouseEvent | TouchEvent) => {
        const r = canvas.getBoundingClientRect();
        const sx = canvas.width / r.width, sy = canvas.height / r.height;
        if (e instanceof TouchEvent && e.touches.length > 0)
          return { x: (e.touches[0].clientX - r.left) * sx, y: (e.touches[0].clientY - r.top) * sy };
        return { x: ((e as MouseEvent).clientX - r.left) * sx, y: ((e as MouseEvent).clientY - r.top) * sy };
      };
      const onStart = (e: MouseEvent | TouchEvent) => { e.preventDefault(); isDrawingRef.current = true; lastPosRef.current = getPos(e); };
      const onMove  = (e: MouseEvent | TouchEvent) => {
        e.preventDefault();
        if (!isDrawingRef.current || !lastPosRef.current) return;
        const pos = getPos(e);
        ctx.beginPath(); ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
        ctx.lineTo(pos.x, pos.y); ctx.stroke();
        lastPosRef.current = pos; setIsTtdEmpty(false);
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
    return () => { clearTimeout(timer); const c = ttdCanvasRef.current; if (c && (c as any)._cleanup) (c as any)._cleanup(); };
  }, [cameraStep]);

  // ── Data Fetching ─────────────────────────────────────────────────

  const ambilActiveShift = async (empId: string) => {
    setShiftLoading(true); setShiftError(null);
    try {
      const r = await fetch(`${BACKEND}/api/attendance/active-shift?employee_id=${encodeURIComponent(empId)}`);
      const d = await r.json();
      if (d.success) setActiveShift({ shift_name: d.shift_name, start_time: d.start_time, end_time: d.end_time });
      else setShiftError(d.message || 'Shift belum diset oleh HRD.');
    } catch { setShiftError('Gagal membaca shift dari server.'); }
    finally { setShiftLoading(false); }
  };

  const ambilMasterShift = async () => {
    try {
      const r = await fetch(`${BACKEND}/api/attendance/shifts`);
      const d = await r.json();
      if (d.success && d.data) {
        const fmtT = (raw: string) => { if (!raw) return '00:00'; const p = raw.split(' '); return p[p.length - 1].substring(0, 5); };
        const m: Record<string, { in: string; out: string }> = {};
        d.data.forEach((s: any) => { m[s.name] = { in: fmtT(s.start_time), out: fmtT(s.end_time) }; });
        setMasterShifts(m);
      }
    } catch { /* skip */ }
  };

  const ambilLokasiKantor = async (branch?: string) => {
    try {
      const url = branch ? `${BACKEND}/api/locations/${encodeURIComponent(branch)}` : `${BACKEND}/api/locations`;
      const r   = await fetch(url); const d = await r.json();
      if (d.success && d.locations?.length > 0) setLokasiKantor(d.locations);
    } catch { /* pakai fallback */ }
  };

  const ambilRiwayat = async () => {
    if (!user) return;
    try {
      const dari   = `${tahunAktif}-${String(bulanAktif + 1).padStart(2, '0')}-01`;
      const akhir  = new Date(tahunAktif, bulanAktif + 1, 0);
      const sampai = `${tahunAktif}-${String(bulanAktif + 1).padStart(2, '0')}-${String(akhir.getDate()).padStart(2, '0')}`;
      const r = await fetch(`${BACKEND}/api/attendance?employee_id=${encodeURIComponent(user.employee_id)}&from=${dari}&to=${sampai}`);
      const d = await r.json();
      setDataRiwayat(d.success && d.data ? d.data : []);
    } catch { setDataRiwayat([]); }
  };

  const ambilIzin = async (empId: string) => {
    try {
      const r = await fetch(`${BACKEND}/api/attendance/leave-history?employee_id=${empId}`);
      const d = await r.json();
      if (d.success && d.data) {
        const mulai = new Date(tahunAktif, bulanAktif, 1), akhir = new Date(tahunAktif, bulanAktif + 1, 0);
        setLeaveRecords(d.data.filter((i: LeaveRecord) => parseLokalDate(i.from_date) <= akhir && parseLokalDate(i.to_date) >= mulai));
      } else setLeaveRecords([]);
    } catch { setLeaveRecords([]); }
  };

  // ── GPS & Modal ───────────────────────────────────────────────────

  const hitungJarak = (la1: number, lo1: number, la2: number, lo2: number) => {
    const R = 6371000, dL = (la2 - la1) * Math.PI / 180, dG = (lo2 - lo1) * Math.PI / 180;
    const a = Math.sin(dL / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dG / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };
  const cekRadius = (lat: number, lng: number) => {
    let best = { valid: false, nama: '?', jarak: Infinity, radius: 100 };
    for (const k of lokasiKantor) {
      const j = Math.round(hitungJarak(lat, lng, k.lat, k.lng));
      if (j <= k.radius) return { valid: true, nama: k.nama, jarak: j, radius: k.radius };
      if (j < best.jarak) best = { valid: false, nama: k.nama, jarak: j, radius: k.radius };
    }
    return best;
  };

  const matikanKamera = () => {
    if (jamIntervalRef.current) window.clearInterval(jamIntervalRef.current);
    if (deteksiRef.current)     window.clearInterval(deteksiRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  };

  // Reverse geocode pakai Nominatim (OpenStreetMap) — gratis, no API key
  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
        { headers: { 'Accept-Language': 'id' } }
      );
      const d = await r.json();
      // Ambil nama yang paling relevan: nama gedung/jalan → kelurahan → kecamatan → kota
      const a = d.address || {};
      return (
        a.building || a.amenity || a.road ||
        a.suburb || a.neighbourhood ||
        a.village || a.town || a.city ||
        d.display_name?.split(',')[0] || 'Lokasi Tidak Dikenal'
      );
    } catch {
      return 'GPS Aktif';
    }
  };

  const bukaModal = async (mode: string) => {
    // Blok jika outlet belum dapat shift assignment dari HRD
    if (isKaryawanOutlet(user?.branch) && !activeShift) {
      alert('\u26A0\uFE0F Shift kamu belum diatur oleh HRD. Hubungi HR terlebih dahulu.'); return;
    }
    setModeAbsen(mode); setFotoBase64(null); setTtdBase64(null); setIsTtdEmpty(true);
    setCameraStep(1); setIsModalOpen(true); setKameraBorder('border-[#fbc02d]');
    setWajahStatus({ show: false, ok: false });
    setNamaLokasi('Mendeteksi...');
    setGpsStatus({ tipe: 'loading', pesan: 'Cek lokasi GPS...' });
    setJepretState({ aktif: false, teks: 'Loading...' });
    jamIntervalRef.current = window.setInterval(() => setJamModal(new Date().toLocaleTimeString('id-ID')), 1000);

    const isOutlet = isKaryawanOutlet(user?.branch);

    // Radius akurasi GPS yang masih diterima:
    // Kantor (PH Klaten/Jakarta): max 70m  — area kecil, presisi tinggi
    // Outlet (RS, Swalayan, dll): max 150m — gedung besar, GPS bisa drift
    const MAX_AKURASI = isOutlet ? 150 : 70;

    // Radius lokasi default:
    // Kantor: radius dari data backend (biasanya 70m)
    // Outlet: minimal 250m — cukup untuk gedung RS / swalayan besar
    const RADIUS_MIN_OUTLET = 250;
    const lokasiEfektif: Lokasi[] = lokasiKantor.map(l => ({
      ...l,
      radius: isOutlet && l.radius < RADIUS_MIN_OUTLET ? RADIUS_MIN_OUTLET : l.radius,
    }));

    const cekEfektif = (lat: number, lng: number) => {
      let best = { valid: false, nama: '?', jarak: Infinity, radius: RADIUS_MIN_OUTLET };
      for (const k of lokasiEfektif) {
        const j = Math.round(hitungJarak(lat, lng, k.lat, k.lng));
        if (j <= k.radius) return { valid: true, nama: k.nama, jarak: j, radius: k.radius };
        if (j < best.jarak) best = { valid: false, nama: k.nama, jarak: j, radius: k.radius };
      }
      return best;
    };

    navigator.geolocation.getCurrentPosition(
      async pos => {
        const coords  = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const akurasi = Math.round(pos.coords.accuracy);
        setKoordinatGPS(coords);

        const cek = cekEfektif(coords.lat, coords.lng);

        if (cek.valid && akurasi <= MAX_AKURASI) {
          setGpsStatus({ tipe: 'ok', pesan: `Valid: ${cek.nama} (\u00B1${akurasi}m) \u2713` });
          if (isOutlet) {
            // Outlet: nama lokasi lebih informatif dari reverse geocode
            reverseGeocode(coords.lat, coords.lng).then(nama => setNamaLokasi(nama));
          } else {
            setNamaLokasi(cek.nama);
          }
          await nyalakanKamera();
        } else {
          const pesanError = akurasi > MAX_AKURASI
            ? `Akurasi GPS lemah (\u00B1${akurasi}m, butuh \u2264${MAX_AKURASI}m). Buka Google Maps lalu coba lagi.`
            : `Jarak ${cek.jarak}m dari ${cek.nama} (maks. ${cek.radius}m).`;
          setGpsStatus({ tipe: 'error', pesan: pesanError });
          setNamaLokasi('Lokasi Tidak Valid');
          setJepretState({ aktif: false, teks: 'Ditolak' });
        }
      },
      () => {
        // Semua karyawan wajib GPS — tidak ada fallback
        setNamaLokasi('GPS Diperlukan');
        setGpsStatus({ tipe: 'error', pesan: 'Izinkan akses GPS di browser lalu refresh halaman.' });
        setJepretState({ aktif: false, teks: 'GPS Ditolak' });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
    );
  };

  const tutupModal = () => { matikanKamera(); setIsModalOpen(false); setCameraStep(1); if (searchParams.has('auto')) setSearchParams({}); };

  const nyalakanKamera = async () => {
    matikanKamera();
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } } });
      if (videoRef.current) { videoRef.current.srcObject = streamRef.current; await videoRef.current.play(); }
      setJepretState({ aktif: false, teks: 'Muat AI...' }); muatFaceAPI();
    } catch { setJepretState({ aktif: false, teks: 'Kamera Error' }); }
  };

  const muatFaceAPI = () => {
    setWajahStatus({ show: true, ok: false });
    if (window.faceapi?.nets?.tinyFaceDetector?.isLoaded) { mulaiDeteksi(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js';
    s.onload = async () => { await window.faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'); mulaiDeteksi(); };
    document.head.appendChild(s);
  };

  const mulaiDeteksi = () => {
    deteksiRef.current = window.setInterval(async () => {
      if (!window.faceapi || !videoRef.current || videoRef.current.paused || cameraStep !== 1) return;
      const h = await window.faceapi.detectAllFaces(videoRef.current, new window.faceapi.TinyFaceDetectorOptions());
      if (h.length > 0) { setWajahStatus({ show: true, ok: true }); setJepretState({ aktif: true, teks: 'Jepret!' }); setKameraBorder('border-green-400'); }
      else { setWajahStatus({ show: true, ok: false }); setJepretState({ aktif: false, teks: 'Cari Wajah...' }); setKameraBorder('border-orange-300'); }
    }, 600);
  };

  // Jepret selfie + timestamp overlay
  // Strategi 2 canvas:
  //   canvasDisplay → resolusi penuh (max 720px), kualitas tinggi, untuk preview
  //   saat kirim    → kompres dari canvasDisplay ke resolusi lebih kecil
  const jepretFoto = () => {
    const video = videoRef.current; if (!video) return;

    // Resolusi penuh untuk preview — max 720px agar foto tajam di layar HP
    const MAX_DISPLAY = 720;
    let w = video.videoWidth || 720, h = video.videoHeight || 960;
    if (w > MAX_DISPLAY || h > MAX_DISPLAY) {
      const r = Math.min(MAX_DISPLAY / w, MAX_DISPLAY / h);
      w = Math.round(w * r); h = Math.round(h * r);
    }

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(w, 0); ctx.scale(-1, 1);       // mirror selfie
    ctx.drawImage(video, 0, 0, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);          // reset transform
    drawOverlay(ctx, w, h, namaLokasi);           // timestamp + lokasi overlay

    if (deteksiRef.current) window.clearInterval(deteksiRef.current);
    matikanKamera();

    // Simpan sebagai display quality (kualitas tinggi untuk preview)
    setFotoBase64(canvas.toDataURL('image/jpeg', 0.85));
    setIsTtdEmpty(true); setCameraStep(2); setKameraBorder('border-purple-400');
  };

  const bersihkanTTD = () => {
    const c = ttdCanvasRef.current; if (!c) return;
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); setIsTtdEmpty(true);
  };
  const simpanTTD = () => { const c = ttdCanvasRef.current; if (!c) return; setTtdBase64(c.toDataURL('image/png')); setCameraStep(3); };

  // Kompres foto dari resolusi display (720px) ke resolusi kirim (400px) saat submit
  // Ini memastikan preview tajam tapi payload ke server tetap kecil
  const kompresUntukKirim = (base64Display: string): Promise<string> => {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const MAX_KIRIM = 400;
        let w = img.width, h = img.height;
        if (w > MAX_KIRIM || h > MAX_KIRIM) {
          const r = Math.min(MAX_KIRIM / w, MAX_KIRIM / h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.45));
      };
      img.src = base64Display;
    });
  };

  const kirimAbsen = async () => {
    if (!fotoBase64 || !ttdBase64 || !user) return;
    setIsKirimLoad(true);
    try {
      // Kompres foto untuk pengiriman — preview tetap tajam di layar
      const fotoKirim = await kompresUntukKirim(fotoBase64);

      const res = await fetch(`${BACKEND}/api/attendance/checkin`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: user.employee_id,
          tipe:        modeAbsen === 'MASUK' ? 'IN' : 'OUT',
          latitude:    koordinatGPS?.lat ?? LOK_FALLBACK[0].lat,
          longitude:   koordinatGPS?.lng ?? LOK_FALLBACK[0].lng,
          branch:      user.branch || '',
          image_verification: fotoKirim,    // selfie terkompresi untuk backend
          custom_signature:   ttdBase64,
        }),
      });
      if (res.ok) { alert(`Absen ${modeAbsen} berhasil!`); tutupModal(); ambilRiwayat(); }
      else { const e = await res.json().catch(() => null); alert(e?.message || 'Absen gagal dikirim.'); }
    } catch { alert('Gagal konek ke server.'); }
    setIsKirimLoad(false);
  };

  // ── Rekap ────────────────────────────────────────────────────────

  const grouped: Record<string, { in?: RiwayatAbsen; out?: RiwayatAbsen }> = {};
  dataRiwayat.forEach(item => {
    const tgl = item.time?.substring(0, 10) || item.attendance_date || '';
    if (!grouped[tgl]) grouped[tgl] = {};
    if (item.log_type === 'IN' && (!grouped[tgl].in || (item.time ?? '') < (grouped[tgl].in!.time ?? ''))) grouped[tgl].in = item;
    if (item.log_type === 'OUT' && (!grouped[tgl].out || (item.time ?? '') > (grouped[tgl].out!.time ?? ''))) grouped[tgl].out = item;
  });

  const rekapHadir = Object.keys(grouped).length;
  let rekapTelat = 0;
  Object.entries(grouped).forEach(([tgl, d]) => {
    if (d.in?.time) {
      const sn = getNamaShift(d.in.shift, tgl, user?.branch, masterShifts, activeShift);
      if (toMenit(formatJamLokal(d.in.time)) > toMenit(getJamShift(sn, tgl, user?.branch, masterShifts, activeShift).in)) rekapTelat++;
    }
  });
  const rekapIzin = hitungHari(leaveRecords, r => !r.leave_type.toLowerCase().includes('tahunan') && r.status?.toLowerCase() !== 'rejected', tahunAktif, bulanAktif);
  const rekapCuti = hitungHari(leaveRecords, r => r.leave_type.toLowerCase().includes('tahunan') && r.status?.toLowerCase() !== 'rejected', tahunAktif, bulanAktif);

  const izinSet: Set<string> = new Set();
  leaveRecords.forEach(r => {
    for (let d = new Date(parseLokalDate(r.from_date)); d <= parseLokalDate(r.to_date); d.setDate(d.getDate() + 1))
      izinSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  });

  const sortedKeys  = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  const tampilKeys  = lihatSemua ? sortedKeys : sortedKeys.slice(0, 5);

  const renderKalender = () => {
    const hp = new Date(tahunAktif, bulanAktif, 1).getDay();
    const th = new Date(tahunAktif, bulanAktif + 1, 0).getDate();
    const blanks = Array.from({ length: hp }, (_, i) => <div key={`b${i}`} />);
    const days = Array.from({ length: th }, (_, i) => {
      const d = i + 1, isToday = d === new Date().getDate() && bulanAktif === new Date().getMonth() && tahunAktif === new Date().getFullYear();
      const strTgl = `${tahunAktif}-${String(bulanAktif + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dataIn = grouped[strTgl]?.in, checkin = dataIn?.time, adaIzin = izinSet.has(strTgl);
      let kelas = 'w-7 h-7 flex items-center justify-center mx-auto rounded-full text-xs relative ';
      let dot: any = null;
      if (isToday) kelas += 'bg-[#3e2723] text-[#fbc02d] font-black';
      else if (adaIzin && !checkin) { kelas += 'bg-blue-100 text-blue-600 font-bold'; dot = <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-blue-400" />; }
      else if (checkin) {
        const si = getJamShift(getNamaShift(dataIn?.shift, strTgl, user?.branch, masterShifts, activeShift), strTgl, user?.branch, masterShifts, activeShift);
        const late = toMenit(formatJamLokal(checkin)) > toMenit(si.in);
        kelas += late ? 'bg-red-100 text-red-600 font-bold' : 'bg-green-100 text-green-700 font-bold';
        dot = <span className={`absolute -bottom-0.5 w-1 h-1 rounded-full ${late ? 'bg-red-400' : 'bg-green-400'}`} />;
      } else kelas += 'text-gray-400';
      return <div key={d}><div className={kelas}>{d}{dot}</div></div>;
    });
    return [...blanks, ...days];
  };

  const prosesUrlFoto = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('data:image')) return url;
    if (url.startsWith('/files')) return `${BACKEND}/api/attendance/file?path=${encodeURIComponent(url)}`;
    return url;
  };

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  return (
    <div className="bg-gray-100 flex items-center justify-center min-h-screen font-sans text-[#3e2723] selection:bg-[#fbc02d] md:p-6 lg:p-10 w-full overflow-hidden">
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>

      <div className="w-full md:max-w-4xl lg:max-w-5xl bg-white md:rounded-[3rem] h-screen md:h-[600px] lg:h-[700px] relative shadow-2xl flex flex-col md:flex-row overflow-hidden border border-gray-200">

        {/* KIRI */}
        <div className="hidden md:flex flex-col w-1/2 bg-[#3e2723] relative p-12 lg:p-16 justify-between overflow-hidden">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="absolute -top-20 -left-20 w-96 h-96 bg-[#fbc02d] rounded-full blur-3xl" />
            <div className="absolute bottom-10 -right-10 w-72 h-72 bg-orange-400 rounded-full blur-3xl" />
          </div>
          <div className="relative z-10">
            <div className="w-20 h-20 bg-[#fbc02d] rounded-2xl flex items-center justify-center mb-8 shadow-lg rotate-3">
              <i className="fa-solid fa-bread-slice text-[#3e2723] text-4xl -rotate-3" />
            </div>
            <h1 className="text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">
              Ropi<span className="text-[#fbc02d]">HR</span><br />Workspace.
            </h1>
            <p className="text-white/70 mt-6 font-medium text-base lg:text-lg leading-relaxed max-w-sm">
              Sistem absensi dan laporan terpadu untuk Karyawan dan Manajemen Roti Ropi.
            </p>
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 bg-white/10 p-4 rounded-2xl border border-white/5 w-max">
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

        {/* KANAN */}
        <div className="flex-1 flex justify-center bg-gray-50 relative z-20 w-full md:w-1/2 h-full border-l border-gray-200">
          <div className="w-full max-w-sm bg-gray-50 h-full flex flex-col relative mx-auto overflow-hidden">

            {/* HEADER */}
            <div className="bg-[#3e2723] pt-12 pb-5 px-6 shrink-0 shadow-md z-10 rounded-b-[1.5rem]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Link to="/home" className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform">
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

              {/* Shift badge outlet */}
              {isKaryawanOutlet(user?.branch) && (
                <div className="mt-3 flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2 border border-white/10 min-h-[32px]">
                  <i className={`fa-solid ${shiftLoading ? 'fa-spinner fa-spin' : shiftError ? 'fa-triangle-exclamation text-orange-300' : 'fa-clock text-[#fbc02d]'} text-xs shrink-0`} />
                  {shiftLoading && <p className="text-white/60 text-[10px] font-bold">Memuat shift dari ERPNext...</p>}
                  {shiftError && <p className="text-orange-300 text-[10px] font-bold flex-1 leading-tight">{shiftError} <Link to="/shift" className="underline">→ Minta HRD</Link></p>}
                  {activeShift && !shiftLoading && (
                    <p className="text-[10px] font-bold text-white/80 flex-1 truncate">
                      Shift: <span className="text-[#fbc02d]">{activeShift.shift_name}</span>
                      <span className="text-white/50 ml-1">({activeShift.start_time}–{activeShift.end_time})</span>
                    </p>
                  )}
                </div>
              )}

              <div className="mt-4 grid grid-cols-4 gap-2">
                {[{ label: 'Hadir', v: rekapHadir, c: 'text-green-400' }, { label: 'Telat', v: rekapTelat, c: 'text-red-400' }, { label: 'Izin', v: rekapIzin, c: 'text-blue-300' }, { label: 'Cuti', v: rekapCuti, c: 'text-purple-300' }].map(x => (
                  <div key={x.label} className="bg-white/10 rounded-xl py-2 text-center">
                    <p className={`text-xl font-black ${x.c}`}>{x.v}</p>
                    <p className="text-[9px] font-black text-white/60 uppercase tracking-wide">{x.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* CONTENT */}
            <div className="flex-1 overflow-y-auto pb-24 pt-4 no-scrollbar">
              {leaveRecords.length > 0 && (
                <div className="px-6 mb-3 flex flex-wrap gap-1.5">
                  {leaveRecords.map(r => {
                    const sc = r.status?.toLowerCase();
                    const clr = sc === 'approved' ? 'bg-blue-100 text-blue-700 border-blue-200' : sc === 'rejected' ? 'bg-red-100 text-red-600 border-red-200' : 'bg-yellow-100 text-yellow-700 border-yellow-200';
                    const fl = parseLokalDate(r.from_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                    const tl = parseLokalDate(r.to_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                    return (
                      <div key={r.name} className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full border ${clr}`}>
                        <i className="fa-solid fa-envelope-open-text text-[8px]" />
                        <span>{r.leave_type} · {fl}{r.from_date !== r.to_date ? ` – ${tl}` : ''}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="px-6 mb-4">
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <div className="grid grid-cols-7 text-center text-[9px] font-black text-gray-400 mb-1.5">
                    {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map(h => <div key={h}>{h}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-y-0.5 text-center">{renderKalender()}</div>
                  <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100">
                    {[{ c: 'bg-green-400', l: 'Tepat' }, { c: 'bg-red-400', l: 'Telat' }, { c: 'bg-blue-400', l: 'Izin' }].map(x => (
                      <div key={x.l} className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${x.c} inline-block`} />
                        <span className="text-[9px] text-gray-400 font-bold">{x.l}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="px-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-black text-[#3e2723] text-sm">Riwayat Kehadiran</h3>
                  <p className="text-[10px] text-gray-400"><i className="fa-solid fa-hand-pointer mr-1" />Klik untuk detail</p>
                </div>
                <div className="flex flex-col gap-2">
                  {sortedKeys.length === 0 && leaveRecords.length === 0 ? (
                    <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-6 text-center shadow-sm">
                      <i className="fa-solid fa-clipboard-list text-3xl text-gray-300 block mb-2" />
                      <p className="text-sm font-bold text-gray-400">Belum ada riwayat bulan ini</p>
                    </div>
                  ) : (
                    <>
                      {tampilKeys.map(tgl => {
                        const d = grouped[tgl];
                        const jamIn  = formatJamLokal(d.in?.time);
                        const jamOut = formatJamLokal(d.out?.time);
                        const sn     = getNamaShift(d.in?.shift || d.out?.shift, tgl, user?.branch, masterShifts, activeShift);
                        const si     = getJamShift(sn, tgl, user?.branch, masterShifts, activeShift);
                        const adaIzin = izinSet.has(tgl);
                        const dl = parseLokalDate(tgl).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
                        let badgeEl: any = null;
                        if (jamIn !== '-') {
                          const sel = toMenit(jamIn) - toMenit(si.in);
                          badgeEl = sel > 0 ? <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md">Telat {formatDurasi(sel)}</span> : <span className="text-green-600 text-[9px] font-black">✓ Tepat</span>;
                        }
                        if (adaIzin && !badgeEl) badgeEl = <span className="bg-blue-100 text-blue-600 text-[9px] font-black px-1.5 py-0.5 rounded-md">Izin</span>;
                        let badgeCepat: any = null;
                        if (jamOut !== '-') { const sel = toMenit(si.out) - toMenit(jamOut); if (sel > 0) badgeCepat = <span className="bg-orange-400 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md">Cepat {formatDurasi(sel)}</span>; }
                        const belumKeluar = jamIn !== '-' && jamOut === '-' ? <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md">Belum Keluar</span> : null;
                        return (
                          <div key={tgl} onClick={() => setDetailModal({ show: true, tgl, inData: d.in, outData: d.out })} className="cursor-pointer bg-white px-4 py-3 rounded-2xl border border-gray-100 flex items-center gap-3 shadow-sm active:scale-95 transition-transform hover:border-[#fbc02d]/40">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${d.in ? 'bg-green-50 text-green-500' : adaIzin ? 'bg-blue-50 text-blue-400' : 'bg-gray-50 text-gray-300'}`}>
                              <i className={`fa-solid ${d.in ? 'fa-check' : adaIzin ? 'fa-envelope-open-text' : 'fa-minus'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-[#3e2723] text-sm truncate">{dl}</p>
                              <p className="text-[9px] font-bold text-gray-400 mb-0.5 truncate">{sn}</p>
                              <p className="text-[10px] text-gray-400">{jamIn} → {belumKeluar ? <span className="text-red-400 italic mx-1">?</span> : jamOut} <span className="ml-1 text-[#fbc02d]">· {si.in}–{si.out}</span></p>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">{badgeEl}{badgeCepat}{belumKeluar}</div>
                          </div>
                        );
                      })}
                      {sortedKeys.length > 5 && (
                        <button onClick={() => setLihatSemua(!lihatSemua)} className="w-full mt-1 py-3 rounded-2xl border border-dashed border-gray-300 text-xs font-black text-gray-400 hover:border-[#fbc02d] hover:text-[#3e2723] hover:bg-white transition-colors flex items-center justify-center gap-2">
                          <i className={`fa-solid ${lihatSemua ? 'fa-chevron-up' : 'fa-chevron-down'}`} />
                          {lihatSemua ? 'Lebih Sedikit' : `Lihat Semua (${sortedKeys.length} hari)`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <BottomNav />

            {/* ─── MODAL ABSEN ─── */}
            {isModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8" style={{ background: 'rgba(62,39,35,0.92)', backdropFilter: 'blur(6px)' }}>
                <div className="bg-white w-full max-w-sm mx-auto md:max-w-lg md:rounded-[2rem] rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden" style={{ maxHeight: '90vh' }}>

                  {/* Header modal */}
                  <div className="bg-[#3e2723] px-5 pt-4 pb-4 shrink-0 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <p className="text-white text-2xl font-black">{jamModal}</p>
                      <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${modeAbsen === 'MASUK' ? 'bg-green-500/30 border border-green-400/40' : 'bg-orange-500/30 border border-orange-400/40'}`}>
                        <div className={`w-2 h-2 rounded-full ${modeAbsen === 'MASUK' ? 'bg-green-400' : 'bg-orange-400'} animate-pulse`} />
                        <p className={`font-black text-xs uppercase ${modeAbsen === 'MASUK' ? 'text-green-300' : 'text-orange-300'}`}>{modeAbsen}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      {cameraStep === 1 ? (
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold truncate max-w-[55%] ${gpsStatus.tipe === 'error' ? 'bg-red-900/50 text-red-300' : gpsStatus.tipe === 'ok' ? 'bg-green-900/40 text-green-300' : 'bg-white/10 text-white/70'}`}>
                          {gpsStatus.tipe === 'loading' ? <i className="fa-solid fa-spinner fa-spin shrink-0" /> : <i className={`fa-solid ${gpsStatus.tipe === 'error' ? 'fa-triangle-exclamation' : 'fa-location-dot'} shrink-0`} />}
                          <span className="truncate">{gpsStatus.pesan}</span>
                        </div>
                      ) : <div />}
                      {/* Step indicator 3 langkah */}
                      <div className="flex items-center gap-1">
                        {[{ n: 1, icon: 'fa-camera' }, { n: 2, icon: 'fa-pen-nib' }, { n: 3, icon: 'fa-paper-plane' }].map((s, i) => (
                          <div key={s.n} className="flex items-center gap-1">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black ${cameraStep > s.n ? 'bg-green-400 text-white' : cameraStep === s.n ? 'bg-[#fbc02d] text-[#3e2723]' : 'bg-white/20 text-white/50'}`}>
                              {cameraStep > s.n ? <i className="fa-solid fa-check" /> : <i className={`fa-solid ${s.icon}`} />}
                            </div>
                            {i < 2 && <div className={`w-1.5 h-0.5 rounded-full ${cameraStep > s.n ? 'bg-green-400' : 'bg-white/20'}`} />}
                          </div>
                        ))}
                      </div>
                    </div>
                    {activeShift && isKaryawanOutlet(user?.branch) && (
                      <p className="text-[10px] text-white/60 font-bold truncate">
                        Shift: <span className="text-[#fbc02d]">{activeShift.shift_name}</span>
                        <span className="ml-1">({activeShift.start_time}–{activeShift.end_time})</span>
                      </p>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 bg-gray-50">

                    {/* STEP 1 — Selfie */}
                    {cameraStep === 1 && (
                      <>
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-3 py-2.5 flex gap-3 items-start shadow-sm">
                          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0 mt-0.5"><i className="fa-solid fa-camera-rotate" /></div>
                          <div>
                            <p className="text-amber-800 text-xs font-black">Selfie Absen</p>
                            <p className="text-amber-600 text-[10px] font-bold mt-0.5 leading-snug">
                              Pastikan <strong>wajah jelas</strong> dan <strong>background tempat kerja</strong> terlihat. Timestamp otomatis tercetak di foto.
                            </p>
                          </div>
                        </div>
                        <div className={`w-full rounded-2xl overflow-hidden border-[3px] ${kameraBorder} bg-gray-900 relative transition-colors shadow-inner`} style={{ aspectRatio: '3/4' }}>
                          {wajahStatus.show && (
                            <div className={`absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-black shadow-lg ${wajahStatus.ok ? 'bg-green-500 text-white' : 'bg-orange-400 text-white'}`}>
                              <i className={`fa-solid ${wajahStatus.ok ? 'fa-face-smile' : 'fa-face-meh'}`} />
                              {wajahStatus.ok ? 'Wajah Terdeteksi' : 'Cari Wajah...'}
                            </div>
                          )}
                          {/* Live overlay preview — posisi kiri bawah, sama dengan yang dicetak ke foto */}
                          <div className="absolute bottom-3 left-3 z-20 bg-black/60 rounded-md px-2 py-1.5 pointer-events-none select-none">
                            <p className="text-white text-[9px] font-mono leading-tight">{jamModal}</p>
                            <p className="text-yellow-200 text-[9px] font-mono leading-tight">📍 {namaLokasi}</p>
                          </div>
                          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted style={{ transform: 'scaleX(-1)' }} />
                        </div>
                      </>
                    )}

                    {/* STEP 2 — TTD */}
                    {cameraStep === 2 && (
                      <>
                        <div className="bg-purple-50 border border-purple-100 rounded-2xl px-3 py-2.5 flex gap-3 items-center shadow-sm">
                          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-500 shrink-0"><i className="fa-solid fa-pen-nib" /></div>
                          <div>
                            <p className="text-purple-800 text-xs font-black">Tanda Tangan</p>
                            <p className="text-purple-500 text-[10px] font-bold mt-0.5">Goreskan jari di dalam kotak putih di bawah ini.</p>
                          </div>
                        </div>
                        <div className="w-full rounded-2xl overflow-hidden border-[3px] border-purple-200 bg-white shadow-inner relative" style={{ touchAction: 'none' }}>
                          <canvas ref={ttdCanvasRef} className="w-full block" style={{ height: '240px', cursor: 'crosshair' }} />
                          {isTtdEmpty && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><p className="text-gray-300 text-sm font-bold select-none">✍ Tanda tangan di sini</p></div>}
                        </div>
                        {fotoBase64 && (
                          <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-2xl px-3 py-2">
                            <img src={fotoBase64} className="w-10 h-14 object-cover rounded-lg border border-green-200 shrink-0" alt="selfie" />
                            <div><p className="text-green-700 text-xs font-black">✓ Foto tersimpan</p><p className="text-green-500 text-[10px] font-bold">Timestamp sudah tercetak</p></div>
                          </div>
                        )}
                      </>
                    )}

                    {/* STEP 3 — Review */}
                    {cameraStep === 3 && (
                      <div className="flex flex-col gap-4">
                        <div className="bg-green-50 border border-green-100 rounded-2xl px-4 py-3 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0"><i className="fa-solid fa-circle-check text-green-500 text-xl" /></div>
                          <div><p className="text-green-800 font-black text-sm">Data siap dikirim!</p><p className="text-green-600 text-[10px] font-bold">Cek kembali foto & TTD sebelum kirim.</p></div>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-wide mb-1.5 text-center">Foto Selfie + Timestamp</p>
                          <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-gray-900 w-full">
                            {fotoBase64
                              ? <img src={fotoBase64} className="w-full h-auto block" alt="Selfie" />
                              : <div className="h-48 flex items-center justify-center"><i className="fa-solid fa-image-slash text-gray-500 text-2xl" /></div>}
                          </div>
                        </div>
                        {ttdBase64 && (
                          <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-wide mb-1.5 text-center">Tanda Tangan</p>
                            <div className="rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm" style={{ height: '80px' }}>
                              <img src={ttdBase64} className="w-full h-full object-contain p-2 mix-blend-multiply" alt="TTD" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                  </div>

                  {/* Footer tombol */}
                  <div className="px-5 pb-5 pt-3 shrink-0 bg-white border-t border-gray-100 flex flex-col gap-2">
                    {cameraStep === 1 && (
                      <div className="flex gap-2">
                        <button onClick={tutupModal} className="flex-1 bg-gray-100 text-[#3e2723] font-black py-3.5 rounded-2xl text-sm active:scale-95 flex items-center justify-center gap-2 hover:bg-gray-200"><i className="fa-solid fa-xmark" />Batal</button>
                        <button onClick={jepretFoto} disabled={!jepretState.aktif} className={`flex-1 font-black py-3.5 rounded-2xl text-sm active:scale-95 flex items-center justify-center gap-2 ${jepretState.aktif ? 'bg-[#fbc02d] text-[#3e2723] shadow-md' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}><i className="fa-solid fa-camera" />{jepretState.teks}</button>
                      </div>
                    )}
                    {cameraStep === 2 && (
                      <div className="flex gap-2">
                        <button onClick={() => { setFotoBase64(null); setIsTtdEmpty(true); setCameraStep(1); nyalakanKamera(); }} className="flex-1 bg-gray-100 text-[#3e2723] font-black py-3.5 rounded-2xl text-sm active:scale-95 flex items-center justify-center gap-2 hover:bg-gray-200"><i className="fa-solid fa-arrow-left" />Ulang Foto</button>
                        <button onClick={simpanTTD} disabled={isTtdEmpty} className={`flex-1 font-black py-3.5 rounded-2xl text-sm active:scale-95 flex items-center justify-center gap-2 ${!isTtdEmpty ? 'bg-[#fbc02d] text-[#3e2723] shadow-md' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}><i className="fa-solid fa-check" />Simpan TTD</button>
                      </div>
                    )}
                    {cameraStep === 3 && (
                      <div className="flex gap-2">
                        <button onClick={() => { setTtdBase64(null); setIsTtdEmpty(true); setCameraStep(2); }} className="flex-1 bg-gray-100 text-[#3e2723] font-black py-3.5 rounded-2xl text-sm active:scale-95 flex items-center justify-center gap-2 hover:bg-gray-200"><i className="fa-solid fa-arrow-left" />Ulang TTD</button>
                        <button onClick={kirimAbsen} disabled={isKirimLoad} className="flex-1 bg-[#3e2723] text-[#fbc02d] font-black py-3.5 rounded-2xl text-sm active:scale-95 shadow-lg flex items-center justify-center gap-2 hover:bg-[#4e342e]">
                          {isKirimLoad ? <><i className="fa-solid fa-spinner fa-spin" />Mengirim...</> : <><i className="fa-solid fa-paper-plane" />Kirim Absen</>}
                        </button>
                      </div>
                    )}
                    {cameraStep === 2 && !isTtdEmpty && (
                      <button onClick={bersihkanTTD} className="text-[10px] text-gray-400 font-bold text-center"><i className="fa-solid fa-eraser mr-1" />Hapus Tanda Tangan</button>
                    )}
                  </div>

                </div>
              </div>
            )}

            {/* ─── MODAL DETAIL RIWAYAT ─── */}
            {detailModal.show && (() => {
              const tglDate   = parseLokalDate(detailModal.tgl);
              const shiftRaw  = detailModal.inData?.shift || detailModal.outData?.shift;
              const shiftName = getNamaShift(shiftRaw, detailModal.tgl, user?.branch, masterShifts, activeShift);
              const shiftInfo = getJamShift(shiftName, detailModal.tgl, user?.branch, masterShifts, activeShift);
              const inJam     = detailModal.inData?.time  ? formatJamLokal(detailModal.inData.time)  : null;
              const outJam    = detailModal.outData?.time ? formatJamLokal(detailModal.outData.time) : null;

              const FotoSlot = ({ src, label, badge, bc }: { src?: string; label: string; badge: string; bc: string }) => (
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide text-center">{label}</p>
                  <div className="relative rounded-2xl overflow-hidden bg-gray-50 border border-gray-200 shadow-sm" style={{ aspectRatio: '3/4' }}>
                    {src ? <img src={prosesUrlFoto(src)} className="w-full h-full object-cover" alt={label} />
                      : <div className="absolute inset-0 flex flex-col items-center justify-center gap-1"><i className="fa-solid fa-image-slash text-2xl text-gray-300" /><p className="text-[10px] text-gray-300 font-bold">Tidak ada foto</p></div>}
                    <div className={`absolute top-2 left-2 ${bc} text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-sm border border-white/20`}>{badge}</div>
                  </div>
                </div>
              );

              return (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8" style={{ background: 'rgba(62,39,35,0.92)', backdropFilter: 'blur(6px)' }}>
                  <div className="bg-white w-full max-w-sm mx-auto md:max-w-2xl md:rounded-[2rem] rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden" style={{ maxHeight: '90vh' }}>
                    <div className="bg-[#3e2723] px-5 pt-5 pb-5 shrink-0 relative">
                      <button onClick={() => setDetailModal({ show: false, tgl: '' })} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-red-500 transition-colors"><i className="fa-solid fa-xmark" /></button>
                      <p className="text-[#fbc02d] text-[10px] font-black uppercase tracking-widest mb-0.5">{tglDate.toLocaleDateString('id-ID', { weekday: 'long' })}</p>
                      <h2 className="text-white text-xl font-black pr-10">{tglDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</h2>
                      <div className="mt-5 grid grid-cols-2 gap-3">
                        {[{ jam: inJam, label: 'Masuk', clr: 'green', icon: 'fa-right-to-bracket' }, { jam: outJam, label: 'Keluar', clr: 'orange', icon: 'fa-right-from-bracket' }].map(x => (
                          <div key={x.label} className="bg-white/5 border border-white/10 rounded-2xl p-3 flex flex-col justify-center overflow-hidden relative">
                            <div className="flex items-center gap-1.5 mb-1"><i className={`fa-solid ${x.icon} text-${x.clr}-400 text-xs`} /><p className={`text-${x.clr}-400 text-[10px] font-black uppercase`}>{x.label}</p></div>
                            <p className="text-white font-black text-2xl leading-none">{x.jam ?? <span className="text-white/20">–</span>}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-white/50 bg-black/20 rounded-xl py-1.5 px-3 flex-wrap text-center">
                        <i className="fa-solid fa-clock" />
                        <span>Jadwal: <span className="text-white/80 font-bold">{shiftName}</span></span>
                        <span className="text-white/30">·</span>
                        <span className="text-white/80 font-bold">{shiftInfo.in} – {shiftInfo.out}</span>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5 md:grid md:grid-cols-2 md:gap-5 bg-gray-50 no-scrollbar">
                      <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100">
                        <div className="flex items-center gap-2 mb-3 border-b border-gray-50 pb-2">
                          <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><i className="fa-solid fa-camera text-gray-500 text-[10px]" /></div>
                          <p className="text-xs font-black text-[#3e2723] uppercase tracking-wider">Foto Selfie</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <FotoSlot src={detailModal.inData?.custom_foto_absen}  label="Masuk"  badge="Masuk"  bc="bg-green-500" />
                          <FotoSlot src={detailModal.outData?.custom_foto_absen} label="Keluar" badge="Keluar" bc="bg-orange-500" />
                        </div>
                      </div>
                      <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100">
                        <div className="flex items-center gap-2 mb-3 border-b border-gray-50 pb-2">
                          <div className="w-6 h-6 rounded-full bg-purple-50 flex items-center justify-center shrink-0"><i className="fa-solid fa-pen-nib text-purple-500 text-[10px]" /></div>
                          <p className="text-xs font-black text-[#3e2723] uppercase tracking-wider">Tanda Tangan</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {[{ label: 'Masuk', data: detailModal.inData }, { label: 'Keluar', data: detailModal.outData }].map(({ label, data }) => (
                            <div key={label} className="flex flex-col gap-1.5">
                              <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide text-center">{label}</p>
                              <div className="rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center shadow-inner" style={{ height: '80px' }}>
                                {data?.custom_signature
                                  ? <img src={prosesUrlFoto(data.custom_signature)} className="w-full h-full object-contain p-2 mix-blend-multiply" alt={`TTD ${label}`} />
                                  : <div className="flex items-center gap-1.5"><i className="fa-solid fa-pen-slash text-gray-300" /><p className="text-[10px] text-gray-400 font-bold">Belum ada</p></div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
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