import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';

declare global { interface Window { faceapi: any; } }

interface User {
  name: string;
  role?: string;       // = designation dari ERPNext (Security/Satpam/dll)
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

// ─────────────────────────────────────────────
// HELPER: cek Ramadhan
// ─────────────────────────────────────────────
const isRamadhan = (tanggal?: Date): boolean => {
  const now = tanggal || new Date();
  const tahun = now.getFullYear();
  const bulan = now.getMonth() + 1;
  const tgl = now.getDate();
  if (tahun === 2025 && bulan === 3 && tgl >= 1 && tgl <= 30) return true;
  if (tahun === 2026 && bulan === 2 && tgl >= 18) return true;
  if (tahun === 2026 && bulan === 3 && tgl <= 19) return true;
  return false;
};

// ─────────────────────────────────────────────
// HELPER: klasifikasi karyawan
// isKaryawanKantor  → PH Klaten atau Jakarta  (selfie + TTD)
// isKaryawanOutlet  → cabang lain             (selfie kanan + selfie kiri + TTD)
// isSatpam          → Satpam / Security di kantor (jam ±30 menit)
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// HELPER: jam shift KANTOR (PH Klaten & Jakarta)
// Jadwal:
//   Senin–Kamis Ramadhan     07:00–15:30
//   Jumat Ramadhan           07:00–16:00
//   Senin–Kamis Non-Ramadhan 07:30–16:30
//   Jumat Non-Ramadhan       07:30–17:00
//
// Satpam: masuk 30 menit lebih awal, pulang 30 menit lebih lambat
// ─────────────────────────────────────────────
const getJamShiftKantor = (
  tglDate: Date,
  satpam: boolean
): { in: string; out: string } => {
  const hari = tglDate.getDay(); // 0=Min,5=Jum
  const isFriday = hari === 5;
  const ramadhan = isRamadhan(tglDate);

  let jamMasuk: string;
  let jamKeluar: string;

  if (ramadhan) {
    jamMasuk  = '07:00';
    jamKeluar = isFriday ? '16:00' : '15:30';
  } else {
    jamMasuk  = '07:30';
    jamKeluar = isFriday ? '17:00' : '16:30';
  }

  if (satpam) {
    return {
      in:  tambahMenit(jamMasuk,  -30),
      out: tambahMenit(jamKeluar,  30),
    };
  }

  return { in: jamMasuk, out: jamKeluar };
};

// ─────────────────────────────────────────────
// HELPER: resolusi nama shift → jam { in, out }
// Prioritas:
//   1. Outlet → pakai masterShifts dari ERPNext (shiftNameFromRecord)
//   2. Kantor/Satpam → hitung dari hari & Ramadhan
// ─────────────────────────────────────────────
const getJamShift = (
  shiftNameFromRecord: string | undefined,
  tgl: string,
  branchUser: string | undefined,
  roleUser: string | undefined,
  masterShifts: Record<string, { in: string; out: string }>
): { in: string; out: string } => {
  const tglDate = parseLokalDate(tgl);
  const kantor  = isKaryawanKantor(branchUser);

  // Karyawan outlet → ambil dari ERPNext shift
  if (!kantor) {
    if (shiftNameFromRecord && masterShifts[shiftNameFromRecord]) {
      return masterShifts[shiftNameFromRecord];
    }
    // fallback jika shift tidak ketemu di master
    return { in: '08:00', out: '17:00' };
  }

  // Karyawan/satpam kantor → hitung berdasarkan kalender
  const satpamFlag = isSatpam(roleUser);
  return getJamShiftKantor(tglDate, satpamFlag);
};

// ─────────────────────────────────────────────
// HELPER: nama shift untuk dikirim ke backend
// ─────────────────────────────────────────────
const getNamaShiftKantor = (
  tglDate: Date,
  branchUser: string | undefined,
  satpamFlag: boolean
): string => {
  const hari     = tglDate.getDay();
  const isFriday = hari === 5;
  const ramadhan = isRamadhan(tglDate);
  const branchLabel = (branchUser || '').toLowerCase().includes('jakarta') ? 'Jakarta' : 'PH Klaten';
  const hariLabel   = isFriday ? 'Jumat' : 'Senin - Kamis';
  const periodeLabel = ramadhan ? 'Ramadhan' : 'Non Ramadhan';
  const satpamLabel  = satpamFlag ? ' (Satpam)' : '';
  return `${hariLabel} (${branchLabel} ${periodeLabel})${satpamLabel}`;
};

// ─────────────────────────────────────────────
// HELPER: validasi nama shift dari record
//   → deteksi mismatch Senin-Kamis vs Jumat
// ─────────────────────────────────────────────
const validasiShiftName = (
  shiftFromRecord: string | undefined,
  tgl: string,
  branch: string | undefined,
  role: string | undefined,
  masterShifts: Record<string, { in: string; out: string }>
): string => {
  const tglDate   = parseLokalDate(tgl);
  const hari      = tglDate.getDay();
  const isFriday  = hari === 5;
  const isWeekend = hari === 0 || hari === 6;
  const kantor    = isKaryawanKantor(branch);
  const satpamFlag = isSatpam(role);

  // Outlet: pakai shift dari record (ERPNext)
  if (!kantor) {
    return shiftFromRecord || '';
  }

  // Kantor: hitung dari kalender, abaikan shift dari record jika mismatch
  const shiftLokal = getNamaShiftKantor(tglDate, branch, satpamFlag);

  if (isWeekend || !shiftFromRecord) return shiftLokal;

  const recordIsFriday = shiftFromRecord.toLowerCase().includes('jumat');
  const recordIsSenKam = shiftFromRecord.toLowerCase().includes('senin');

  if (isFriday && recordIsSenKam) {
    console.warn(`[ShiftValidasi] Override: record="${shiftFromRecord}" tapi hari=${hari} (Jumat). Pakai: "${shiftLokal}"`);
    return shiftLokal;
  }
  if (!isFriday && !isWeekend && recordIsFriday) {
    console.warn(`[ShiftValidasi] Override: record="${shiftFromRecord}" tapi hari=${hari}. Pakai: "${shiftLokal}"`);
    return shiftLokal;
  }

  return shiftFromRecord;
};

// ─────────────────────────────────────────────
// HELPER: hitung hari kerja izin/cuti dalam bulan
// ─────────────────────────────────────────────
const hitungHariKerjaDalamBulan = (
  records: LeaveRecord[],
  filterFn: (r: LeaveRecord) => boolean,
  tahunAktif: number,
  bulanAktif: number
): number => {
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

// ─────────────────────────────────────────────
// HELPER: cek branch vs lokasi absen
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// KOMPONEN UTAMA
// ─────────────────────────────────────────────
const Absen = () => {
  const navigate      = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const BACKEND      = (import.meta as any).env?.VITE_API_URL || 'https://ropi-hr-backend.vercel.app';
  const ERPNEXT_URL  = 'http://103.187.147.240';
  const LOKASI_FALLBACK: Lokasi[] = [{ nama: 'PH Klaten', lat: -7.6146229, lng: 110.6867057, radius: 70 }];
  const DAFTAR_IP_KANTOR = ['103.144.170.15'];

  // ── state data ──
  const [user,          setUser]          = useState<User | null>(null);
  const [lokasiKantor,  setLokasiKantor]  = useState<Lokasi[]>(LOKASI_FALLBACK);
  const [dataRiwayat,   setDataRiwayat]   = useState<RiwayatAbsen[]>([]);
  const [bulanAktif,    setBulanAktif]    = useState(new Date().getMonth());
  const [tahunAktif,    setTahunAktif]    = useState(new Date().getFullYear());
  const [masterShifts,  setMasterShifts]  = useState<Record<string, { in: string; out: string }>>({});
  const [leaveRecords,  setLeaveRecords]  = useState<LeaveRecord[]>([]);
  const [lihatSemua,    setLihatSemua]    = useState(false);

  // ── state modal absen ──
  const [isModalAbsenOpen, setIsModalAbsenOpen] = useState(false);
  const [modeAbsen,        setModeAbsen]        = useState('MASUK');
  const [jamModal,         setJamModal]         = useState('--:--');
  const [gpsStatus,        setGpsStatus]        = useState({ tipe: 'loading', pesan: 'Mendeteksi lokasi...' });
  const [wajahStatus,      setWajahStatus]      = useState({ show: false, ok: false });
  const [kameraBorder,     setKameraBorder]     = useState('border-[#fbc02d]');

  /**
   * cameraStep:
   *  KANTOR / SATPAM  : 1 (selfie) → 3 (TTD) → 4 (review)
   *  OUTLET           : 1 (selfie kanan) → 2 (selfie kiri) → 3 (TTD) → 4 (review)
   */
  const [cameraStep,        setCameraStep]        = useState(1);
  const [fotoBase64,        setFotoBase64]        = useState<string | null>(null);
  const [fotoKiriBase64,    setFotoKiriBase64]    = useState<string | null>(null); // outlet step-2
  const [ttdBase64,         setTtdBase64]         = useState<string | null>(null);
  const [isTtdEmpty,        setIsTtdEmpty]        = useState(true);
  const [jepretState,       setJepretState]       = useState({ aktif: false, teks: 'Cek Sistem...' });
  const [isKirimLoading,    setIsKirimLoading]    = useState(false);
  const [koordinatGPS,      setKoordinatGPS]      = useState<{ lat: number; lng: number } | null>(null);

  // ── state modal detail ──
  const [detailModal, setDetailModal] = useState<{
    show: boolean; tgl: string;
    inData?: RiwayatAbsen; outData?: RiwayatAbsen;
  }>({ show: false, tgl: '' });

  // ── refs ──
  const videoRef           = useRef<HTMLVideoElement>(null);
  const streamRef          = useRef<MediaStream | null>(null);
  const intervalDeteksiRef = useRef<number | null>(null);
  const intervalJamRef     = useRef<number | null>(null);
  const ttdCanvasRef       = useRef<HTMLCanvasElement>(null);
  const isDrawingRef       = useRef(false);
  const lastPosRef         = useRef<{ x: number; y: number } | null>(null);
  const cameraStepRef      = useRef(cameraStep);
  useEffect(() => { cameraStepRef.current = cameraStep; }, [cameraStep]);

  // ── derived ──
  const outlet  = isKaryawanOutlet(user?.branch);
  const satpam  = isSatpam(user?.role);

  // ─────────────────────────────────────────
  // Steps indicator
  // Kantor/Satpam : step 1, 3, 4
  // Outlet        : step 1, 2, 3, 4
  // ─────────────────────────────────────────
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

  // ─────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────
  useEffect(() => {
    const userData = localStorage.getItem('ropi_user');
    if (!userData) { navigate('/'); return; }
    const parsedUser: User = JSON.parse(userData);
    setUser(parsedUser);
    ambilLokasiKantor(parsedUser.branch);
    ambilMasterShift();
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

  // ─────────────────────────────────────────
  // Canvas TTD – setup event listener
  // ─────────────────────────────────────────
  useEffect(() => {
    if (cameraStep !== 3) return;

    const timer = setTimeout(() => {
      const canvas = ttdCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect  = canvas.getBoundingClientRect();
      canvas.width  = rect.width || 300;
      canvas.height = 200;
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

  // ─────────────────────────────────────────
  // API calls
  // ─────────────────────────────────────────
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

  // ─────────────────────────────────────────
  // GPS & kamera
  // ─────────────────────────────────────────
  const hitungJarak = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R    = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a    = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const cekRadius = (lat: number, lng: number) => {
    let terdekat = { valid: false, nama: '?', jarak: Infinity, radius: 100 };
    for (const k of lokasiKantor) {
      const jarak = Math.round(hitungJarak(lat, lng, k.lat, k.lng));
      if (jarak <= k.radius) return { valid: true, nama: k.nama, jarak, radius: k.radius };
      if (jarak < terdekat.jarak) terdekat = { valid: false, nama: k.nama, jarak, radius: k.radius };
    }
    return terdekat;
  };

  const matikanKamera = () => {
    if (intervalJamRef.current)     window.clearInterval(intervalJamRef.current);
    if (intervalDeteksiRef.current) window.clearInterval(intervalDeteksiRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
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

  // ─────────────────────────────────────────
  // Buka / tutup modal
  // ─────────────────────────────────────────
  const bukaModalAbsen = async (mode: string) => {
    setModeAbsen(mode);
    setFotoBase64(null);
    setFotoKiriBase64(null);
    setTtdBase64(null);
    setIsTtdEmpty(true);
    setCameraStep(1);
    setIsModalAbsenOpen(true);
    setKameraBorder('border-[#fbc02d]');
    setWajahStatus({ show: false, ok: false });
    setGpsStatus({ tipe: 'loading', pesan: 'Cek Wi-Fi & GPS...' });
    setJepretState({ aktif: false, teks: 'Loading...' });
    intervalJamRef.current = window.setInterval(() => setJamModal(new Date().toLocaleTimeString('id-ID')), 1000);

    // Cek IP kantor
    let currentIP = '';
    try {
      const resIp  = await fetch('https://api.ipify.org?format=json');
      const dataIp = await resIp.json();
      currentIP = dataIp.ip;
    } catch { console.warn('Gagal cek IP'); }
    const isIpValid = DAFTAR_IP_KANTOR.includes(currentIP);

    navigator.geolocation.getCurrentPosition(
      async pos => {
        const coords  = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const akurasi = pos.coords.accuracy;
        setKoordinatGPS(coords);
        const cek       = cekRadius(coords.lat, coords.lng);
        const isGpsValid = cek.valid && akurasi <= 70;

        if (isGpsValid || isIpValid) {
          let errorBranch = null;
          if (!isIpValid) errorBranch = cekBranchVsLokasi(user?.branch, cek.nama);
          if (errorBranch) {
            setGpsStatus({ tipe: 'error', pesan: errorBranch });
            setJepretState({ aktif: false, teks: 'Akses Ditolak' });
          } else {
            const namaLokasiTampil = cek.nama !== '?' ? cek.nama : LOKASI_FALLBACK[0].nama;
            const pesanValid = isIpValid
              ? `Valid: ${namaLokasiTampil} (via Wi-Fi) ✓`
              : `Valid: ${cek.nama} (Akurasi: ${Math.round(akurasi)}m) ✓`;
            setGpsStatus({ tipe: 'ok', pesan: pesanValid });
            setJepretState({ aktif: false, teks: 'Buka Kamera...' });
            await nyalakanKamera();
          }
        } else {
          let pesanError = 'Lokasi Ditolak.';
          if (!cek.valid)      pesanError = `Jarak ${cek.jarak}m dari kantor (Max: ${cek.radius}m).`;
          else if (akurasi > 70) pesanError = `Akurasi lemah (${Math.round(akurasi)}m). Butuh < 70m.`;
          setGpsStatus({ tipe: 'error', pesan: `${pesanError} (Bukan Wi-Fi)` });
          setJepretState({ aktif: false, teks: 'Ditolak' });
        }
      },
      async () => {
        if (isIpValid) {
          setKoordinatGPS({ lat: LOKASI_FALLBACK[0].lat, lng: LOKASI_FALLBACK[0].lng });
          setGpsStatus({ tipe: 'ok', pesan: `Valid: ${LOKASI_FALLBACK[0].nama} (via Wi-Fi) ✓` });
          setJepretState({ aktif: false, teks: 'Buka Kamera...' });
          await nyalakanKamera();
        } else {
          setGpsStatus({ tipe: 'error', pesan: 'GPS Ditolak & Bukan Wi-Fi Kantor' });
          setJepretState({ aktif: false, teks: 'Akses Ditolak' });
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  };

  const tutupModal = () => {
    matikanKamera();
    setIsModalAbsenOpen(false);
    setCameraStep(1);
    if (searchParams.has('auto')) setSearchParams({});
  };

  // ─────────────────────────────────────────
  // Jepret foto
  // ─────────────────────────────────────────
  const jepretFoto = () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas    = document.createElement('canvas');
    const MAX_SIZE  = 320;
    let w = video.videoWidth  || 480;
    let h = video.videoHeight || 640;
    const ratio = Math.min(MAX_SIZE / w, MAX_SIZE / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
    canvas.width  = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Mirror (selfie)
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    const base64 = canvas.toDataURL('image/jpeg', 0.3);

    if (cameraStep === 1) {
      // Foto pertama: wajah + tangan kanan (outlet) atau selfie biasa (kantor)
      setFotoBase64(base64);
      if (outlet) {
        // Lanjut ke step 2: foto wajah + tangan kiri
        setCameraStep(2);
        setKameraBorder('border-blue-400');
        setJepretState({ aktif: false, teks: 'Cari Wajah...' });
        setWajahStatus({ show: false, ok: false });
      } else {
        // Kantor/Satpam: langsung ke TTD
        if (intervalDeteksiRef.current) window.clearInterval(intervalDeteksiRef.current);
        matikanKamera();
        setCameraStep(3);
        setKameraBorder('border-purple-400');
      }
    } else if (cameraStep === 2) {
      // Foto kedua (outlet): wajah + tangan kiri
      setFotoKiriBase64(base64);
      if (intervalDeteksiRef.current) window.clearInterval(intervalDeteksiRef.current);
      matikanKamera();
      setIsTtdEmpty(true);
      setCameraStep(3);
      setKameraBorder('border-purple-400');
    }
  };

  // ─────────────────────────────────────────
  // TTD
  // ─────────────────────────────────────────
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

  // ─────────────────────────────────────────
  // Kirim absen ke backend
  // ─────────────────────────────────────────
  const kirimAbsen = async () => {
    if (!fotoBase64 || !ttdBase64 || !user) return;
    if (outlet && !fotoKiriBase64) return; // outlet wajib foto kiri

    setIsKirimLoading(true);

    // Nama shift yang dikirim ke backend
    const namaShiftKirim = outlet
      ? '' // outlet: backend ambil dari ERPNext berdasarkan employee_id & tanggal
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
          // foto utama: wajah (+tangan kanan untuk outlet)
          image_verification:        fotoBase64,
          // foto kiri hanya untuk outlet
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

  // ─────────────────────────────────────────
  // Group riwayat per tanggal
  // ─────────────────────────────────────────
  const groupedRiwayat: Record<string, { in?: RiwayatAbsen; out?: RiwayatAbsen }> = {};
  dataRiwayat.forEach(item => {
    const tgl = item.time?.substring(0, 10) || item.attendance_date || '';
    if (!groupedRiwayat[tgl]) groupedRiwayat[tgl] = {};
    if (item.log_type === 'IN') {
      if (!groupedRiwayat[tgl].in || (item.time && groupedRiwayat[tgl].in?.time && item.time < groupedRiwayat[tgl].in!.time!))
        groupedRiwayat[tgl].in = item;
    }
    if (item.log_type === 'OUT') {
      if (!groupedRiwayat[tgl].out || (item.time && groupedRiwayat[tgl].out?.time && item.time > groupedRiwayat[tgl].out!.time!))
        groupedRiwayat[tgl].out = item;
    }
  });

  // ─────────────────────────────────────────
  // Rekap bulanan
  // ─────────────────────────────────────────
  const rekapHadir = Object.keys(groupedRiwayat).length;
  let rekapTelat = 0;
  Object.entries(groupedRiwayat).forEach(([tgl, d]) => {
    if (d.in?.time) {
      const jamAbsen  = formatJamLokal(d.in.time);
      const shiftInfo = getJamShift(d.in.shift, tgl, user?.branch, user?.role, masterShifts);
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

  // ─────────────────────────────────────────
  // Render kalender mini
  // ─────────────────────────────────────────
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
        const shiftInfo = getJamShift(dataIn?.shift, strTgl, user?.branch, user?.role, masterShifts);
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

  // ─────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────
  return (
    <div className="bg-gray-100 flex items-center justify-center min-h-screen font-sans text-[#3e2723] selection:bg-[#fbc02d] md:p-6 lg:p-10 w-full overflow-hidden">
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>

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
          <div className="w-full max-w-sm bg-gray-50 h-full flex flex-col relative mx-auto overflow-hidden">

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
            <div className="flex-1 overflow-y-auto pb-24 pt-4 no-scrollbar">

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
                        const shiftInfo  = getJamShift(d.in?.shift || d.out?.shift, tgl, user?.branch, user?.role, masterShifts);
                        const shiftLabel = validasiShiftName(d.in?.shift || d.out?.shift, tgl, user?.branch, user?.role, masterShifts);
                        const adaIzinHariIni = tanggalIzinSet.has(tgl);
                        const dateLabel  = tglDate.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });

                        let badgeEl: React.ReactNode = null;
                        if (jamIn !== '-') {
                          const selisih = toMenit(jamIn) - toMenit(shiftInfo.in);
                          badgeEl = selisih > 0
                            ? <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md">Telat {formatDurasi(selisih)}</span>
                            : <span className="text-green-600 text-[9px] font-black">✓ Tepat</span>;
                        }
                        if (adaIzinHariIni && !badgeEl)
                          badgeEl = <span className="bg-blue-100 text-blue-600 text-[9px] font-black px-1.5 py-0.5 rounded-md">Izin</span>;

                        let badgeCepat: React.ReactNode = null;
                        if (jamOut !== '-') {
                          const selisih = toMenit(shiftInfo.out) - toMenit(jamOut);
                          if (selisih > 0)
                            badgeCepat = <span className="bg-orange-400 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md">Cepat {formatDurasi(selisih)}</span>;
                        }

                        let badgeBelumKeluar: React.ReactNode = null;
                        if (jamIn !== '-' && jamOut === '-')
                          badgeBelumKeluar = <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md shadow-sm">Belum Keluar</span>;

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
                            <div className="bg-gray-50 border border-gray-100 rounded-xl py-2 px-4 flex items-center justify-between">
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
            <nav className="absolute bottom-0 left-0 right-0 w-full bg-white border-t border-gray-100 px-4 py-3 flex justify-between z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.02)]">
              <Link to="/home" className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors"><i className="fa-solid fa-house text-xl mb-1" /><span className="text-[10px] font-black uppercase">Home</span></Link>
              <div className="flex flex-col items-center text-[#3e2723] w-1/4"><i className="fa-solid fa-clipboard-user text-xl mb-1 drop-shadow-md" /><span className="text-[10px] font-black uppercase">Absen</span></div>
              <Link to="/izin" className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors"><i className="fa-solid fa-envelope-open-text text-xl mb-1" /><span className="text-[10px] font-black uppercase">Izin</span></Link>
              <Link to="/cuti" className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors"><i className="fa-solid fa-calendar-minus text-xl mb-1" /><span className="text-[10px] font-black uppercase">Cuti</span></Link>
            </nav>

            {/* ══════════════════════════════════
                MODAL ABSEN
            ══════════════════════════════════ */}
            {isModalAbsenOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8" style={{ background: 'rgba(62,39,35,0.92)', backdropFilter: 'blur(6px)' }}>
                <div className="bg-white w-full max-w-sm mx-auto md:max-w-lg md:rounded-[2rem] rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden mt-auto mb-auto md:mt-0" style={{ maxHeight: '90vh' }}>

                  {/* Header modal */}
                  <div className="bg-[#3e2723] px-5 pt-4 pb-4 shrink-0">
                    <div className="flex items-center justify-between w-full">
                      <p className="text-white text-2xl font-black leading-none">{jamModal}</p>
                      <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${modeAbsen === 'MASUK' ? 'bg-green-500/30 border border-green-400/40' : 'bg-orange-500/30 border border-orange-400/40'}`}>
                        <div className={`w-2 h-2 rounded-full ${modeAbsen === 'MASUK' ? 'bg-green-400' : 'bg-orange-400'} animate-pulse`} />
                        <p className={`font-black text-xs uppercase tracking-wider ${modeAbsen === 'MASUK' ? 'text-green-300' : 'text-orange-300'}`}>{modeAbsen}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between w-full mt-2">
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

                    {/* ── Step 1: Selfie wajah (+ tangan kanan untuk outlet) ── */}
                    {cameraStep === 1 && (
                      <>
                        <div className="bg-red-50 border border-red-100 rounded-2xl px-3 py-2.5 flex gap-3 items-center shadow-sm">
                          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-500 shrink-0"><i className="fa-solid fa-camera-rotate" /></div>
                          <div>
                            <p className="text-red-700 text-xs font-black leading-tight">
                              {outlet ? 'Selfie + Tangan Kanan' : satpam ? 'Selfie Wajah (Satpam)' : 'Selfie Wajah'}
                            </p>
                            <p className="text-red-500 text-[10px] font-bold leading-snug">
                              {outlet
                                ? 'Perlihatkan wajah & kuku tangan kananmu dengan jelas.'
                                : 'Pastikan wajah terlihat jelas di kamera.'}
                            </p>
                          </div>
                        </div>
                        <div className={`w-full rounded-2xl overflow-hidden border-[3px] ${kameraBorder} bg-gray-900 relative transition-colors shadow-inner`} style={{ aspectRatio: '3/4' }}>
                          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted style={{ transform: 'scaleX(-1)' }} />
                          {wajahStatus.show && (
                            <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black shadow-md ${wajahStatus.ok ? 'bg-green-500 text-white' : 'bg-orange-400 text-white'}`}>
                              <i className={`fa-solid ${wajahStatus.ok ? 'fa-face-smile' : 'fa-face-meh'} text-xs`} />
                              {wajahStatus.ok ? 'Wajah terdeteksi' : 'Cari wajah...'}
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* ── Step 2: Selfie wajah + tangan kiri (outlet only) ── */}
                    {cameraStep === 2 && outlet && (
                      <>
                        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-3 py-2.5 flex gap-3 items-center shadow-sm">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-500 shrink-0"><i className="fa-solid fa-hand" /></div>
                          <div>
                            <p className="text-blue-700 text-xs font-black leading-tight">Selfie + Tangan Kiri</p>
                            <p className="text-blue-500 text-[10px] font-bold leading-snug">Perlihatkan wajah & kuku tangan kirimu dengan jelas.</p>
                          </div>
                        </div>
                        <div className={`w-full rounded-2xl overflow-hidden border-[3px] ${kameraBorder} bg-gray-900 relative transition-colors shadow-inner`} style={{ aspectRatio: '3/4' }}>
                          <div className="absolute top-3 left-0 w-full z-30 flex justify-center px-4 pointer-events-none">
                            <span className="bg-white/90 text-[#3e2723] text-[10px] font-black px-4 py-1.5 rounded-full shadow-lg border border-gray-200">Arahkan tangan kiri ke kamera</span>
                          </div>
                          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted style={{ transform: 'scaleX(-1)' }} />
                          {wajahStatus.show && (
                            <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black shadow-md ${wajahStatus.ok ? 'bg-blue-500 text-white' : 'bg-orange-400 text-white'}`}>
                              <i className={`fa-solid ${wajahStatus.ok ? 'fa-face-smile' : 'fa-face-meh'} text-xs`} />
                              {wajahStatus.ok ? 'Wajah terdeteksi' : 'Cari wajah...'}
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* ── Step 3: Tanda tangan ── */}
                    {cameraStep === 3 && (
                      <>
                        <div className="bg-purple-50 border border-purple-100 rounded-2xl px-3 py-2.5 flex gap-3 items-center shadow-sm">
                          <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-500 shrink-0"><i className="fa-solid fa-pen-nib" /></div>
                          <div>
                            <p className="text-purple-800 text-xs font-black leading-tight">Tanda Tangan Digital</p>
                            <p className="text-purple-500 text-[10px] font-bold mt-0.5">Goreskan jari di dalam kotak putih di bawah ini.</p>
                          </div>
                        </div>
                        <div className="w-full rounded-2xl overflow-hidden border-[3px] border-purple-200 bg-white shadow-inner relative" style={{ touchAction: 'none' }}>
                          <canvas ref={ttdCanvasRef} className="w-full block" style={{ height: '240px', cursor: 'crosshair' }} />
                          {isTtdEmpty && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="w-20 h-20 border-4 border-dashed border-gray-200 rounded-full flex items-center justify-center opacity-50">
                                <span className="text-gray-300 text-xl font-black">TTD</span>
                              </div>
                            </div>
                          )}
                        </div>
                        {!isTtdEmpty && (
                          <button onClick={bersihkanTTD} className="text-[10px] font-bold text-red-500 hover:underline text-center w-full">
                            <i className="fa-solid fa-eraser mr-1" />Hapus & Ulangi TTD
                          </button>
                        )}
                      </>
                    )}

                    {/* ── Step 4: Review & kirim ── */}
                    {cameraStep === 4 && (
                      <>
                        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-3 py-2.5 flex gap-3 items-center shadow-sm">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-500 shrink-0"><i className="fa-solid fa-eye" /></div>
                          <div>
                            <p className="text-blue-800 text-xs font-black leading-tight">Review Bukti Absen</p>
                            <p className="text-blue-500 text-[10px] font-bold mt-0.5">Pastikan semua foto jelas sebelum dikirim.</p>
                          </div>
                        </div>

                        {/* Foto selfie */}
                        <div className={`grid ${outlet ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
                          <div className="flex flex-col gap-1">
                            <p className="text-[10px] font-black text-gray-400 uppercase pl-1 text-center">
                              {outlet ? '📸 Wajah + Kanan' : '📸 Selfie Wajah'}
                            </p>
                            <div className={`rounded-2xl overflow-hidden border-2 border-gray-200 shadow-sm bg-gray-50 ${outlet ? '' : 'w-1/2 mx-auto'}`} style={{ aspectRatio: '3/4' }}>
                              <img src={fotoBase64!} className="w-full h-full object-cover" alt="Selfie" />
                            </div>
                          </div>
                          {outlet && (
                            <div className="flex flex-col gap-1">
                              <p className="text-[10px] font-black text-gray-400 uppercase pl-1 text-center">📸 Wajah + Kiri</p>
                              <div className="rounded-2xl overflow-hidden border-2 border-gray-200 shadow-sm bg-gray-50" style={{ aspectRatio: '3/4' }}>
                                <img src={fotoKiriBase64!} className="w-full h-full object-cover" alt="Kiri" />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* TTD */}
                        <div className="w-full rounded-2xl border-2 border-gray-200 bg-white px-3 pt-2 pb-3 shadow-sm flex flex-col items-center">
                          <p className="text-[10px] font-black text-gray-400 uppercase mb-1">✍️ Tanda Tangan</p>
                          <div className="w-full border-t border-dashed border-gray-200 pt-1">
                            <img src={ttdBase64!} className="w-full object-contain" style={{ maxHeight: '60px' }} alt="TTD" />
                          </div>
                        </div>
                      </>
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
                detailModal.tgl, user?.branch, user?.role, masterShifts
              );
              const shiftLabel = validasiShiftName(
                detailModal.inData?.shift || detailModal.outData?.shift,
                detailModal.tgl, user?.branch, user?.role, masterShifts
              );
              const hariLabel = tglDate.toLocaleDateString('id-ID', { weekday: 'long' });
              const tglLabel  = tglDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
              const inJam     = detailModal.inData?.time  ? formatJamLokal(detailModal.inData.time)  : null;
              const outJam    = detailModal.outData?.time ? formatJamLokal(detailModal.outData.time) : null;

              const hasVerifImage = !!(detailModal.inData?.custom_verification_image || detailModal.outData?.custom_verification_image);

              const FotoSlot = ({ src, label, badge, badgeColor }: { src?: string; label: string; badge: string; badgeColor: string }) => (
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide pl-1 text-center">{label}</p>
                  <div className="relative rounded-2xl overflow-hidden bg-gray-50 border border-gray-200 shadow-sm" style={{ aspectRatio: '3/4' }}>
                    {src
                      ? <img src={prosesUrlFoto(src)} className="w-full h-full object-cover" alt={label} />
                      : <div className="absolute inset-0 flex flex-col items-center justify-center gap-1"><i className="fa-solid fa-image-slash text-2xl text-gray-300" /><p className="text-[10px] text-gray-300 font-bold">Tidak ada foto</p></div>
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

                    <div className={`flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-6 md:grid ${hasVerifImage ? 'md:grid-cols-3' : 'md:grid-cols-2'} md:gap-5 md:items-start bg-gray-50`}>
                      {/* Selfie utama */}
                      <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100">
                        <div className="flex items-center gap-2 mb-3 border-b border-gray-50 pb-2">
                          <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><i className="fa-solid fa-camera text-gray-500 text-[10px]" /></div>
                          <p className="text-xs font-black text-[#3e2723] uppercase tracking-wider">{hasVerifImage ? 'Wajah + Kanan' : 'Selfie Wajah'}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <FotoSlot src={detailModal.inData?.custom_foto_absen}  label="Masuk"  badge="Masuk"  badgeColor="bg-green-500" />
                          <FotoSlot src={detailModal.outData?.custom_foto_absen} label="Keluar" badge="Keluar" badgeColor="bg-orange-500" />
                        </div>
                      </div>

                      {/* Foto verifikasi kiri (outlet) */}
                      {hasVerifImage && (
                        <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100">
                          <div className="flex items-center gap-2 mb-3 border-b border-gray-50 pb-2">
                            <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center shrink-0"><i className="fa-solid fa-hand text-blue-500 text-[10px]" /></div>
                            <p className="text-xs font-black text-[#3e2723] uppercase tracking-wider">Wajah + Kiri</p>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <FotoSlot src={detailModal.inData?.custom_verification_image}  label="Masuk"  badge="Masuk"  badgeColor="bg-green-500" />
                            <FotoSlot src={detailModal.outData?.custom_verification_image} label="Keluar" badge="Keluar" badgeColor="bg-orange-500" />
                          </div>
                        </div>
                      )}

                      {/* Tanda tangan */}
                      <div className={`bg-white p-4 rounded-3xl shadow-sm border border-gray-100 ${hasVerifImage ? 'md:col-span-3' : 'md:col-span-2'}`}>
                        <div className="flex items-center gap-2 mb-3 border-b border-gray-50 pb-2">
                          <div className="w-6 h-6 rounded-full bg-purple-50 flex items-center justify-center shrink-0"><i className="fa-solid fa-pen-nib text-purple-500 text-[10px]" /></div>
                          <p className="text-xs font-black text-[#3e2723] uppercase tracking-wider">Tanda Tangan</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          {[{ label: 'Masuk', data: detailModal.inData }, { label: 'Keluar', data: detailModal.outData }].map(({ label, data }) => (
                            <div key={label} className="flex flex-col gap-1.5">
                              <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide pl-1 text-center">{label}</p>
                              <div className="rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center relative shadow-inner" style={{ height: '80px' }}>
                                {data?.custom_signature
                                  ? <img src={prosesUrlFoto(data.custom_signature)} className="w-full h-full object-contain p-2 mix-blend-multiply" alt={`TTD ${label}`} />
                                  : <div className="flex items-center gap-2"><i className="fa-solid fa-pen-slash text-gray-300" /><p className="text-[10px] text-gray-400 font-bold">Belum ada TTD</p></div>
                                }
                                <div className="absolute top-1/2 left-0 w-full border-t border-dashed border-gray-200 -z-10" />
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