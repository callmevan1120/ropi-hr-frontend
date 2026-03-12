import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';

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

const isRamadhan = (): boolean => {
  const now = new Date();
  const tahun = now.getFullYear();
  const bulan = now.getMonth() + 1;
  const tgl = now.getDate();
  if (tahun === 2025 && bulan === 3 && tgl >= 1 && tgl <= 30) return true;
  if (tahun === 2026 && bulan === 2 && tgl >= 18) return true;
  if (tahun === 2026 && bulan === 3 && tgl <= 19) return true;
  return false;
};

const getShiftKantor = (
  tanggal: Date,
  masterShifts: Record<string, { in: string; out: string }>,
  branch?: string
): string => {
  const hari = tanggal.getDay();
  const isFriday = hari === 5;
  const ramadhan = isRamadhan();
  const branchLabel = branch?.includes('Jakarta') ? 'Jakarta' : 'PH Klaten';
  const hariLabel = isFriday ? 'Jumat' : 'Senin - Kamis';
  const periodeLabel = ramadhan ? 'Ramadhan' : 'Non Ramadhan';
  return `${hariLabel} (${branchLabel} ${periodeLabel})`;
};

const getJamShift = (
  shiftNameFromRecord: string,
  tanggal: string,
  branchUser: string | undefined,
  masterShifts: Record<string, { in: string; out: string }>
): { in: string; out: string } => {
  if (shiftNameFromRecord && masterShifts[shiftNameFromRecord]) return masterShifts[shiftNameFromRecord];
  const tglDate = new Date(tanggal);
  const namaShift = getShiftKantor(tglDate, masterShifts, branchUser);
  if (namaShift && masterShifts[namaShift]) return masterShifts[namaShift];
  const hari = tglDate.getDay();
  const isFriday = hari === 5;
  const ramadhan = isRamadhan();
  if (ramadhan) return isFriday ? { in: '07:00', out: '16:00' } : { in: '07:00', out: '15:30' };
  return isFriday ? { in: '07:30', out: '17:00' } : { in: '07:30', out: '16:30' };
};

const hitungHariKerjaDalamBulan = (
  records: LeaveRecord[],
  filterFn: (r: LeaveRecord) => boolean,
  tahunAktif: number,
  bulanAktif: number
): number => {
  const bulanMulai = new Date(tahunAktif, bulanAktif, 1);
  const bulanAkhir = new Date(tahunAktif, bulanAktif + 1, 0);
  return records.filter(filterFn).reduce((acc, r) => {
    const from = new Date(r.from_date);
    const to = new Date(r.to_date);
    const start = from < bulanMulai ? bulanMulai : from;
    const end = to > bulanAkhir ? bulanAkhir : to;
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
  const isLokasiKlaten = lokasi.includes('klaten') || lokasi.includes('ph');
  const isLokasiJakarta = lokasi.includes('jakarta');
  const isBranchKlaten = branch.includes('klaten') || branch.includes('ph');
  const isBranchJakarta = branch.includes('jakarta');
  if (isLokasiKlaten && !isBranchKlaten) return `Ditolak! Branch kamu (${branchUser}) tidak terdaftar di lokasi ini`;
  if (isLokasiJakarta && !isBranchJakarta) return `Ditolak! Branch kamu (${branchUser}) tidak terdaftar di lokasi ini`;
  return null;
};

const Absen = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const BACKEND = (import.meta as any).env?.VITE_API_URL || 'https://ropi-hr-backend.vercel.app';
  const ERPNEXT_URL = 'http://103.187.147.240';

  const LOKASI_FALLBACK: Lokasi[] = [{ nama: 'PH Klaten', lat: -7.6146229, lng: 110.6867057, radius: 70 }];
  const DAFTAR_IP_KANTOR = ['103.144.170.15'];

  const [user, setUser] = useState<User | null>(null);
  const [lokasiKantor, setLokasiKantor] = useState<Lokasi[]>(LOKASI_FALLBACK);
  const [dataRiwayat, setDataRiwayat] = useState<RiwayatAbsen[]>([]);
  const [bulanAktif, setBulanAktif] = useState(new Date().getMonth());
  const [tahunAktif, setTahunAktif] = useState(new Date().getFullYear());
  const [masterShifts, setMasterShifts] = useState<Record<string, { in: string; out: string }>>({});
  const [leaveRecords, setLeaveRecords] = useState<LeaveRecord[]>([]);
  const [lihatSemua, setLihatSemua] = useState(false);

  const [isModalAbsenOpen, setIsModalAbsenOpen] = useState(false);
  const [modeAbsen, setModeAbsen] = useState('MASUK');
  const [jamModal, setJamModal] = useState('--:--');
  const [gpsStatus, setGpsStatus] = useState({ tipe: 'loading', pesan: 'Mendeteksi lokasi...' });
  const [wajahStatus, setWajahStatus] = useState({ show: false, ok: false });
  const [kameraBorder, setKameraBorder] = useState('border-[#fbc02d]');

  // Step: 1=selfie wajah, 2=foto fingerprint, 3=TTD canvas, 4=preview & kirim
  const [cameraStep, setCameraStep] = useState(1);
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [fotoMesinBase64, setFotoMesinBase64] = useState<string | null>(null);
  const [ttdBase64, setTtdBase64] = useState<string | null>(null);
  const [isTtdEmpty, setIsTtdEmpty] = useState(true);

  const [jepretState, setJepretState] = useState({ aktif: false, teks: 'Cek Sistem...' });
  const [isKirimLoading, setIsKirimLoading] = useState(false);
  const [koordinatGPS, setKoordinatGPS] = useState<{ lat: number; lng: number } | null>(null);

  const [detailModal, setDetailModal] = useState<{
    show: boolean;
    tgl: string;
    inData?: RiwayatAbsen;
    outData?: RiwayatAbsen;
  }>({ show: false, tgl: '' });

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalDeteksiRef = useRef<number | null>(null);
  const intervalJamRef = useRef<number | null>(null);
  const ttdCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem('ropi_user');
    if (!userData) { navigate('/'); return; }
    const parsedUser = JSON.parse(userData);
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
    const isAuto = searchParams.get('auto');
    if (isAuto === 'true' && modeAuto && user) {
      setTimeout(() => bukaModalAbsen(modeAuto), 500);
    }
  }, [searchParams, user, navigate]);

  useEffect(() => { return () => matikanKamera(); }, []);

  // ── TTD CANVAS: setup event saat step 3 aktif ──
  useEffect(() => {
    if (cameraStep !== 3) return;

    const timer = setTimeout(() => {
      const canvas = ttdCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width || 300;
      canvas.height = 200;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const getPos = (e: MouseEvent | TouchEvent) => {
        const r = canvas.getBoundingClientRect();
        const scaleX = canvas.width / r.width;
        const scaleY = canvas.height / r.height;
        if (e instanceof TouchEvent && e.touches.length > 0) {
          return {
            x: (e.touches[0].clientX - r.left) * scaleX,
            y: (e.touches[0].clientY - r.top) * scaleY,
          };
        }
        return {
          x: ((e as MouseEvent).clientX - r.left) * scaleX,
          y: ((e as MouseEvent).clientY - r.top) * scaleY,
        };
      };

      const onStart = (e: MouseEvent | TouchEvent) => {
        e.preventDefault();
        isDrawingRef.current = true;
        lastPosRef.current = getPos(e);
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

      canvas.addEventListener('mousedown', onStart);
      canvas.addEventListener('mousemove', onMove);
      canvas.addEventListener('mouseup', onEnd);
      canvas.addEventListener('mouseleave', onEnd);
      canvas.addEventListener('touchstart', onStart, { passive: false });
      canvas.addEventListener('touchmove', onMove, { passive: false });
      canvas.addEventListener('touchend', onEnd);

      (canvas as any)._cleanup = () => {
        canvas.removeEventListener('mousedown', onStart);
        canvas.removeEventListener('mousemove', onMove);
        canvas.removeEventListener('mouseup', onEnd);
        canvas.removeEventListener('mouseleave', onEnd);
        canvas.removeEventListener('touchstart', onStart);
        canvas.removeEventListener('touchmove', onMove);
        canvas.removeEventListener('touchend', onEnd);
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

  const ambilMasterShift = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/attendance/shifts`);
      const data = await res.json();
      if (data.success && data.data) {
        const tempMap: Record<string, { in: string; out: string }> = {};
        data.data.forEach((s: any) => {
          tempMap[s.name] = {
            in: s.start_time ? s.start_time.substring(0, 5) : '07:00',
            out: s.end_time ? s.end_time.substring(0, 5) : '15:30',
          };
        });
        setMasterShifts(tempMap);
      }
    } catch { console.error('Gagal menarik shift'); }
  };

  const ambilLokasiKantor = async (branch?: string) => {
    try {
      const url = branch ? `${BACKEND}/api/locations/${encodeURIComponent(branch)}` : `${BACKEND}/api/locations`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.locations?.length > 0) setLokasiKantor(data.locations);
    } catch { console.warn('Pakai lokasi fallback'); }
  };

  const ambilRiwayatAbsen = async () => {
    if (!user) return;
    try {
      const dari = `${tahunAktif}-${String(bulanAktif + 1).padStart(2, '0')}-01`;
      const akhir = new Date(tahunAktif, bulanAktif + 1, 0);
      const sampai = `${tahunAktif}-${String(bulanAktif + 1).padStart(2, '00')}-${String(akhir.getDate()).padStart(2, '0')}`;
      const res = await fetch(`${BACKEND}/api/attendance?employee_id=${encodeURIComponent(user.employee_id)}&from=${dari}&to=${sampai}`);
      const data = await res.json();
      if (data.success && data.data) setDataRiwayat(data.data);
      else setDataRiwayat([]);
    } catch { setDataRiwayat([]); }
  };

  const ambilRiwayatIzin = async (employeeId: string) => {
    try {
      const res = await fetch(`${BACKEND}/api/attendance/leave-history?employee_id=${employeeId}`);
      const data = await res.json();
      if (data.success && data.data) {
        const filtered = data.data.filter((item: LeaveRecord) => {
          const from = new Date(item.from_date);
          const to = new Date(item.to_date);
          const bulanMulai = new Date(tahunAktif, bulanAktif, 1);
          const bulanAkhir = new Date(tahunAktif, bulanAktif + 1, 0);
          return from <= bulanAkhir && to >= bulanMulai;
        });
        setLeaveRecords(filtered);
      } else setLeaveRecords([]);
    } catch { setLeaveRecords([]); }
  };

  const getTanggalIzin = (): Set<string> => {
    const set = new Set<string>();
    leaveRecords.forEach(r => {
      const from = new Date(r.from_date);
      const to = new Date(r.to_date);
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        set.add(d.toISOString().substring(0, 10));
      }
    });
    return set;
  };

  const hitungJarak = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
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
    if (intervalJamRef.current) window.clearInterval(intervalJamRef.current);
    if (intervalDeteksiRef.current) window.clearInterval(intervalDeteksiRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  };

  const bukaModalAbsen = async (mode: string) => {
    setModeAbsen(mode);
    setFotoBase64(null);
    setFotoMesinBase64(null);
    setTtdBase64(null);
    setIsTtdEmpty(true);
    setCameraStep(1);
    setIsModalAbsenOpen(true);
    setKameraBorder('border-[#fbc02d]');
    setWajahStatus({ show: false, ok: false });
    setGpsStatus({ tipe: 'loading', pesan: 'Cek Wi-Fi & GPS...' });
    setJepretState({ aktif: false, teks: 'Loading...' });
    intervalJamRef.current = window.setInterval(() => setJamModal(new Date().toLocaleTimeString('id-ID')), 1000);

    let currentIP = '';
    try {
      const resIp = await fetch('https://api.ipify.org?format=json');
      const dataIp = await resIp.json();
      currentIP = dataIp.ip;
    } catch { console.warn('Gagal cek IP'); }

    const isIpValid = DAFTAR_IP_KANTOR.includes(currentIP);

    navigator.geolocation.getCurrentPosition(
      async pos => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const akurasi = pos.coords.accuracy;
        setKoordinatGPS(coords);
        const cek = cekRadius(coords.lat, coords.lng);
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
            await nyalakanKamera('user');
          }
        } else {
          let pesanError = 'Lokasi Ditolak.';
          if (!cek.valid) pesanError = `Jarak ${cek.jarak}m dari kantor (Max: ${cek.radius}m).`;
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
          await nyalakanKamera('user');
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

  const nyalakanKamera = async (mode: 'user' | 'environment') => {
    matikanKamera();
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 480 }, height: { ideal: 640 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
        await videoRef.current.play();
      }
      if (mode === 'user') {
        setJepretState({ aktif: false, teks: 'Muat AI...' });
        muatFaceAPI();
      } else {
        setJepretState({ aktif: true, teks: 'Jepret Fingerprint!' });
        setKameraBorder('border-blue-400');
        setWajahStatus({ show: false, ok: false });
      }
    } catch {
      setJepretState({ aktif: false, teks: 'Kamera Error' });
    }
  };

  const muatFaceAPI = () => {
    setWajahStatus({ show: true, ok: false });
    if (window.faceapi?.nets?.tinyFaceDetector?.isLoaded) { mulaiDeteksi(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js';
    script.onload = async () => {
      await window.faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model');
      mulaiDeteksi();
    };
    document.head.appendChild(script);
  };

  const mulaiDeteksi = () => {
    intervalDeteksiRef.current = window.setInterval(async () => {
      if (!window.faceapi || !videoRef.current || videoRef.current.paused || cameraStep !== 1) return;
      const hasil = await window.faceapi.detectAllFaces(videoRef.current, new window.faceapi.TinyFaceDetectorOptions());
      if (hasil.length > 0) {
        setWajahStatus({ show: true, ok: true });
        setJepretState({ aktif: true, teks: 'Jepret Wajah!' });
        setKameraBorder('border-green-400');
      } else {
        setWajahStatus({ show: true, ok: false });
        setJepretState({ aktif: false, teks: 'Cari Wajah...' });
        setKameraBorder('border-orange-300');
      }
    }, 600);
  };

  const jepretFoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    const MAX_HEIGHT = 640;
    const scaleSize = video.videoHeight > MAX_HEIGHT ? MAX_HEIGHT / video.videoHeight : 1;
    canvas.width = video.videoWidth * scaleSize;
    canvas.height = video.videoHeight * scaleSize;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (cameraStep === 1) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    const base64Data = canvas.toDataURL('image/jpeg', 0.6);

    if (cameraStep === 1) {
      if (intervalDeteksiRef.current) window.clearInterval(intervalDeteksiRef.current);
      setFotoBase64(base64Data);
      setCameraStep(2);
      setKameraBorder('border-blue-400');
      nyalakanKamera('environment');
    } else if (cameraStep === 2) {
      setFotoMesinBase64(base64Data);
      matikanKamera();
      setIsTtdEmpty(true);
      setCameraStep(3); // → TTD
      setKameraBorder('border-purple-400');
    }
  };

  const kirimAbsen = async () => {
    if (!fotoBase64 || !fotoMesinBase64 || !ttdBase64 || !user) return;
    setIsKirimLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/attendance/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: user.employee_id,
          tipe: modeAbsen === 'MASUK' ? 'IN' : 'OUT',
          latitude: koordinatGPS?.lat || LOKASI_FALLBACK[0].lat,
          longitude: koordinatGPS?.lng || LOKASI_FALLBACK[0].lng,
          branch: user.branch || '',
          image_verification: fotoBase64,
          custom_verification_image: fotoMesinBase64,
          custom_signature: ttdBase64,        // ← field TTD ke ERPNext
          shift: getShiftKantor(new Date(), masterShifts, user?.branch),
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

  // ── GROUP RIWAYAT per tanggal ──
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

  const rekapHadir = Object.keys(groupedRiwayat).length;
  let rekapTelat = 0;
  Object.entries(groupedRiwayat).forEach(([tgl, d]) => {
    if (d.in?.time) {
      const jamAbsen = formatJamLokal(d.in.time);
      const shiftInfo = getJamShift(d.in.shift || '', tgl, user?.branch, masterShifts);
      if (toMenit(jamAbsen) > toMenit(shiftInfo.in)) rekapTelat++;
    }
  });

  const rekapIzin = hitungHariKerjaDalamBulan(leaveRecords, r => !r.leave_type.toLowerCase().includes('tahunan') && r.status?.toLowerCase() !== 'rejected', tahunAktif, bulanAktif);
  const rekapCuti = hitungHariKerjaDalamBulan(leaveRecords, r => r.leave_type.toLowerCase().includes('tahunan') && r.status?.toLowerCase() !== 'rejected', tahunAktif, bulanAktif);

  const tanggalIzinSet = getTanggalIzin();
  const sortedTglKeys = Object.keys(groupedRiwayat).sort((a, b) => b.localeCompare(a));
  const tampilKeys = lihatSemua ? sortedTglKeys : sortedTglKeys.slice(0, 5);

  const renderKalender = () => {
    const hariPertama = new Date(tahunAktif, bulanAktif, 1).getDay();
    const totalHari = new Date(tahunAktif, bulanAktif + 1, 0).getDate();
    const blanks = Array.from({ length: hariPertama }, (_, i) => <div key={`b-${i}`} />);
    const days = Array.from({ length: totalHari }, (_, i) => {
      const d = i + 1;
      const isHariIni = d === new Date().getDate() && bulanAktif === new Date().getMonth() && tahunAktif === new Date().getFullYear();
      const strTgl = `${tahunAktif}-${String(bulanAktif + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dataIn = groupedRiwayat[strTgl]?.in;
      const checkin = dataIn?.time;
      const adaIzin = tanggalIzinSet.has(strTgl);
      let kelas = 'w-7 h-7 flex items-center justify-center mx-auto rounded-full text-xs relative ';
      let dot = null;
      if (isHariIni) {
        kelas += 'bg-[#3e2723] text-[#fbc02d] font-black';
      } else if (adaIzin && !checkin) {
        kelas += 'bg-blue-100 text-blue-600 font-bold';
        dot = <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-blue-400" />;
      } else if (checkin) {
        const shiftInfo = getJamShift(dataIn?.shift || '', strTgl, user?.branch, masterShifts);
        const isTelat = toMenit(formatJamLokal(checkin)) > toMenit(shiftInfo.in);
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
    <div className="bg-gray-100 flex justify-center h-screen overflow-hidden font-sans md:bg-[#3e2723]">
      <div className="w-full max-w-sm md:max-w-none md:w-full bg-white h-full flex flex-col md:flex-row shadow-2xl relative">

        {/* HEADER — mobile: top bar | desktop: sidebar kiri */}
        <div className="bg-[#3e2723] pt-12 pb-5 px-6 shrink-0 shadow-md z-10 md:pt-8 md:w-72 md:h-full md:flex md:flex-col md:shadow-[5px_0_30px_rgba(0,0,0,0.3)]">

          {/* Logo/judul */}
          <div className="flex items-center justify-between md:flex-col md:items-start md:gap-0 md:mb-8">
            <div className="flex items-center gap-3">
              <Link to="/home" className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform hover:bg-white/30">
                <i className="fa-solid fa-arrow-left" />
              </Link>
              <div>
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest hidden md:block">Ropi HR</p>
                <h1 className="text-xl font-black text-[#fbc02d]">Laporan Absen</h1>
              </div>
            </div>

            {/* Navigator bulan — mobile: inline | desktop: block di bawah judul */}
            <div className="flex items-center gap-1.5 md:mt-5 md:w-full md:justify-between">
              <button onClick={() => { if (bulanAktif === 0) { setBulanAktif(11); setTahunAktif(tahunAktif - 1); } else setBulanAktif(bulanAktif - 1); }} className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center text-white text-xs hover:bg-white/30"><i className="fa-solid fa-chevron-left" /></button>
              <span className="text-white text-xs font-bold min-w-[80px] text-center">{new Date(tahunAktif, bulanAktif, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</span>
              <button onClick={() => { if (bulanAktif === 11) { setBulanAktif(0); setTahunAktif(tahunAktif + 1); } else setBulanAktif(bulanAktif + 1); }} className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center text-white text-xs hover:bg-white/30"><i className="fa-solid fa-chevron-right" /></button>
            </div>
          </div>

          {/* Rekap chips */}
          <div className="mt-4 grid grid-cols-4 gap-2 md:grid-cols-2 md:gap-3">
            {[{ label: 'Hadir', value: rekapHadir, color: 'text-green-400' }, { label: 'Telat', value: rekapTelat, color: 'text-red-400' }, { label: 'Izin', value: rekapIzin, color: 'text-blue-300' }, { label: 'Cuti', value: rekapCuti, color: 'text-purple-300' }].map(item => (
              <div key={item.label} className="bg-white/10 rounded-xl py-2 text-center md:py-3">
                <p className={`text-xl font-black ${item.color} md:text-3xl`}>{item.value}</p>
                <p className="text-[9px] font-black text-white/60 uppercase tracking-wide">{item.label}</p>
              </div>
            ))}
          </div>

          {/* Desktop: user info + nav vertikal di sidebar */}
          <div className="hidden md:flex md:flex-col md:flex-1 md:mt-8">
            {user && (
              <div className="bg-white/10 rounded-2xl px-4 py-3 mb-6">
                <p className="text-[10px] text-white/50 font-bold uppercase mb-0.5">Karyawan</p>
                <p className="text-white font-black text-sm leading-tight">{user.name}</p>
                <p className="text-white/40 text-[10px] font-bold">{user.employee_id}</p>
              </div>
            )}
            <p className="text-[10px] text-white/30 font-bold uppercase tracking-wider mb-3 px-1">Menu</p>
            <nav className="flex flex-col gap-1">
              {[
                { to: '/home', icon: 'fa-house', label: 'Home' },
                { to: '/absen', icon: 'fa-clipboard-user', label: 'Absen', active: true },
                { to: '/izin', icon: 'fa-envelope-open-text', label: 'Izin' },
                { to: '/cuti', icon: 'fa-calendar-minus', label: 'Cuti' },
              ].map(item => (
                item.active
                  ? <div key={item.label} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#fbc02d] text-[#3e2723]">
                      <i className={`fa-solid ${item.icon} w-4`} />
                      <span className="font-black text-sm">{item.label}</span>
                    </div>
                  : <Link key={item.label} to={item.to} className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/60 hover:bg-white/10 hover:text-white transition-colors">
                      <i className={`fa-solid ${item.icon} w-4`} />
                      <span className="font-black text-sm">{item.label}</span>
                    </Link>
              ))}
            </nav>
          </div>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto pt-4 md:bg-gray-50">
          {leaveRecords.length > 0 && (
            <div className="px-4 md:px-8 mb-3 flex flex-wrap gap-1.5">
              {leaveRecords.map(r => {
                const statusColor = r.status?.toLowerCase() === 'approved' ? 'bg-blue-100 text-blue-700 border-blue-200' : r.status?.toLowerCase() === 'rejected' ? 'bg-red-100 text-red-600 border-red-200' : 'bg-yellow-100 text-yellow-700 border-yellow-200';
                const fromLabel = new Date(r.from_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                const toLabel = new Date(r.to_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                return (
                  <div key={r.name} className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full border ${statusColor}`}>
                    <i className="fa-solid fa-envelope-open-text text-[8px]" />
                    <span>{r.leave_type} · {fromLabel}{r.from_date !== r.to_date ? ` – ${toLabel}` : ''}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="px-4 md:px-8 mb-4">
            <div className="bg-white rounded-2xl p-3 md:p-5 shadow-sm border border-gray-100">
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

          <div className="px-4 md:px-8">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-black text-[#3e2723] text-sm">Riwayat Kehadiran</h3>
              <p className="text-[10px] text-gray-400"><i className="fa-solid fa-hand-pointer mr-1" />Klik untuk detail</p>
            </div>
            <div className="flex flex-col gap-2">
              {sortedTglKeys.length === 0 && leaveRecords.length === 0 ? (
                <div className="bg-gray-50 rounded-2xl p-6 text-center">
                  <i className="fa-solid fa-clipboard-list text-3xl text-gray-200 block mb-2" />
                  <p className="text-sm font-bold text-gray-400">Belum ada riwayat bulan ini</p>
                </div>
              ) : (
                <>
                  {tampilKeys.map(tgl => {
                    const d = groupedRiwayat[tgl];
                    const jamIn = formatJamLokal(d.in?.time);
                    const jamOut = formatJamLokal(d.out?.time);
                    const dateLabel = new Date(tgl).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
                    const shiftName = d.in?.shift || d.out?.shift || '';
                    const shiftInfo = getJamShift(shiftName, tgl, user?.branch, masterShifts);
                    const adaIzinHariIni = tanggalIzinSet.has(tgl);
                    let badgeEl = null;
                    if (jamIn !== '-') {
                      const selisih = toMenit(jamIn) - toMenit(shiftInfo.in);
                      badgeEl = selisih > 0 ? <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md">Telat {formatDurasi(selisih)}</span> : <span className="text-green-600 text-[9px] font-black">✓ Tepat</span>;
                    }
                    if (adaIzinHariIni && !badgeEl) badgeEl = <span className="bg-blue-100 text-blue-600 text-[9px] font-black px-1.5 py-0.5 rounded-md">Izin</span>;
                    let badgeCepat = null;
                    if (jamOut !== '-') {
                      const selisih = toMenit(shiftInfo.out) - toMenit(jamOut);
                      if (selisih > 0) badgeCepat = <span className="bg-orange-400 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md">Cepat {formatDurasi(selisih)}</span>;
                    }
                    let badgeBelumKeluar = null;
                    if (jamIn !== '-' && jamOut === '-') {
                      badgeBelumKeluar = <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md shadow-sm">Belum Keluar</span>;
                    }
                    return (
                      <div key={tgl} onClick={() => bukaDetail(tgl)} className="cursor-pointer bg-white px-4 py-3 rounded-2xl border border-gray-100 flex items-center gap-3 shadow-sm active:scale-95 transition-transform hover:border-[#fbc02d]/60 hover:shadow-md hover:bg-[#fffdf7]">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base shrink-0 ${d.in ? 'bg-green-50 text-green-500' : adaIzinHariIni ? 'bg-blue-50 text-blue-400' : 'bg-gray-50 text-gray-300'}`}>
                          <i className={`fa-solid ${d.in ? 'fa-check' : adaIzinHariIni ? 'fa-envelope-open-text' : 'fa-minus'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-[#3e2723] text-sm truncate">{dateLabel}</p>
                          <p className="text-[10px] text-gray-400">{jamIn} → {jamOut === '-' && badgeBelumKeluar ? <span className="text-red-400 italic mx-1">?</span> : jamOut} <span className="ml-1 text-[#fbc02d]">· {shiftInfo.in}–{shiftInfo.out}</span></p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">{badgeEl}{badgeCepat}{badgeBelumKeluar}</div>
                      </div>
                    );
                  })}
                  {sortedTglKeys.length > 5 && (
                    <button onClick={() => setLihatSemua(!lihatSemua)} className="w-full mt-1 py-3 rounded-2xl border border-dashed border-gray-300 text-xs font-black text-gray-400 hover:border-[#fbc02d] hover:text-[#3e2723] transition-colors flex items-center justify-center gap-2">
                      <i className={`fa-solid ${lihatSemua ? 'fa-chevron-up' : 'fa-chevron-down'}`} />
                      {lihatSemua ? 'Lebih Sedikit' : `Lihat Semua (${sortedTglKeys.length} hari)`}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM NAV — mobile only */}
        <nav className="shrink-0 w-full bg-white border-t border-gray-100 px-4 py-3 flex justify-between z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.02)] md:hidden">
          <Link to="/home" className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors"><i className="fa-solid fa-house text-xl mb-1" /><span className="text-[10px] font-black uppercase">Home</span></Link>
          <div className="flex flex-col items-center text-[#3e2723] w-1/4"><i className="fa-solid fa-clipboard-user text-xl mb-1 drop-shadow-md" /><span className="text-[10px] font-black uppercase">Absen</span></div>
          <Link to="/izin" className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors"><i className="fa-solid fa-envelope-open-text text-xl mb-1" /><span className="text-[10px] font-black uppercase">Izin</span></Link>
          <Link to="/cuti" className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors"><i className="fa-solid fa-calendar-minus text-xl mb-1" /><span className="text-[10px] font-black uppercase">Cuti</span></Link>
        </nav>

        {/* ══════════════════════════════════════════════════
            MODAL ABSEN — 3 LANGKAH + KONFIRMASI
            Step 1: Selfie wajah (face detection)
            Step 2: Foto mesin fingerprint (kamera belakang)
            Step 3: Tanda tangan canvas
            Step 4: Preview semua + kirim
            ══════════════════════════════════════════════════ */}
        {isModalAbsenOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8" style={{ background: 'rgba(62,39,35,0.92)', backdropFilter: 'blur(6px)' }}>
            <div className="bg-white w-full max-w-sm mx-auto md:max-w-lg md:rounded-[2rem] rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden mt-auto mb-auto md:mt-0" style={{ maxHeight: '90vh' }}>

              {/* ── HEADER cokelat ── */}
              <div className="bg-[#3e2723] px-5 pt-4 pb-4 shrink-0 relative flex flex-col gap-2">
                <div className="flex items-center justify-between w-full">
                  <p className="text-white text-2xl font-black leading-none">{jamModal}</p>
                  {/* 🔥 REVISI POSISI LABEL KELUAR AGAR TIDAK MENUMPUK 🔥 */}
                  <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${modeAbsen === 'MASUK' ? 'bg-green-500/30 border border-green-400/40' : 'bg-orange-500/30 border border-orange-400/40'}`}>
                    <div className={`w-2 h-2 rounded-full ${modeAbsen === 'MASUK' ? 'bg-green-400' : 'bg-orange-400'} animate-pulse`}></div>
                    <p className={`font-black text-xs uppercase tracking-wider ${modeAbsen === 'MASUK' ? 'text-green-300' : 'text-orange-300'}`}>
                      {modeAbsen}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between w-full mt-1">
                  {(cameraStep === 1 || cameraStep === 2) ? (
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold ${gpsStatus.tipe === 'error' ? 'bg-red-900/50 text-red-300' : gpsStatus.tipe === 'ok' ? 'bg-green-900/40 text-green-300' : 'bg-white/10 text-white/70'}`}>
                      {gpsStatus.tipe === 'loading' ? <i className="fa-solid fa-spinner fa-spin" /> : <i className={`fa-solid ${gpsStatus.tipe === 'error' ? 'fa-triangle-exclamation' : 'fa-location-dot'}`} />}
                      <span className="truncate max-w-[200px]">{gpsStatus.pesan}</span>
                    </div>
                  ) : (
                    <div className="flex-1"></div>
                  )}
                  
                  <div className="flex items-center gap-1">
                    {[{ n: 1, icon: 'fa-camera' }, { n: 2, icon: 'fa-fingerprint' }, { n: 3, icon: 'fa-pen-nib' }, { n: 4, icon: 'fa-paper-plane' }].map((s, i) => (
                      <div key={s.n} className="flex items-center gap-1">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black ${cameraStep > s.n ? 'bg-green-400 text-white' : cameraStep === s.n ? 'bg-[#fbc02d] text-[#3e2723]' : 'bg-white/20 text-white/50'}`}>
                          {cameraStep > s.n ? <i className="fa-solid fa-check" /> : <i className={`fa-solid ${s.icon}`} />}
                        </div>
                        {i < 3 && <div className={`w-1.5 h-0.5 rounded-full ${cameraStep > s.n ? 'bg-green-400' : 'bg-white/20'}`} />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── KONTEN KAMERA/TTD ── */}
              <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

                {/* STEP 1 & 2: KAMERA */}
                {(cameraStep === 1 || cameraStep === 2) && (
                  <>
                    {cameraStep === 1 && (
                      <div className="bg-red-50 border border-red-100 rounded-2xl px-3 py-2.5 flex gap-3 items-center shadow-sm">
                        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-500 shrink-0">
                          <i className="fa-solid fa-camera-rotate"></i>
                        </div>
                        <div>
                          <p className="text-red-700 text-xs font-black leading-tight">Selfie Wajah!</p>
                          <p className="text-red-500 text-[10px] font-bold leading-snug">Pastikan mesin fingerprint terlihat di belakangmu.</p>
                        </div>
                      </div>
                    )}
                    {cameraStep === 2 && (
                      <div className="bg-blue-50 border border-blue-100 rounded-2xl px-3 py-2.5 flex gap-3 items-center shadow-sm">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-500 shrink-0">
                          <i className="fa-solid fa-fingerprint"></i>
                        </div>
                        <div>
                          <p className="text-blue-700 text-xs font-black leading-tight">Foto Mesin!</p>
                          <p className="text-blue-500 text-[10px] font-bold leading-snug">Hari, tanggal & jam di layar mesin wajib terbaca.</p>
                        </div>
                      </div>
                    )}
                    {/* Viewfinder 4:3 */}
                    <div className={`w-full rounded-2xl overflow-hidden border-[3px] ${kameraBorder} bg-gray-900 relative transition-colors shadow-inner`} style={{ aspectRatio: '3/4' }}>
                      {cameraStep === 2 && (
                        <div className="absolute top-4 left-0 w-full z-30 flex justify-center px-4 pointer-events-none">
                          <span className="bg-white/90 text-[#3e2723] text-[10px] font-black px-4 py-2 rounded-full shadow-lg border border-gray-200">
                            Arahkan kamera ke layar mesin
                          </span>
                        </div>
                      )}
                      <video ref={videoRef} className="w-full h-full object-cover" playsInline muted style={{ transform: cameraStep === 1 ? 'scaleX(-1)' : 'none' }} />
                    </div>
                  </>
                )}

                {/* STEP 3: TTD */}
                {cameraStep === 3 && (
                  <>
                    <div className="bg-purple-50 border border-purple-100 rounded-2xl px-3 py-2.5 flex gap-3 items-center shadow-sm">
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-500 shrink-0">
                        <i className="fa-solid fa-pen-nib"></i>
                      </div>
                      <div>
                        <p className="text-purple-800 text-xs font-black leading-tight">Tanda Tangan</p>
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
                        <i className="fa-solid fa-eraser mr-1"></i>Hapus & Ulangi TTD
                      </button>
                    )}
                  </>
                )}

                {/* STEP 4: PREVIEW */}
                {cameraStep === 4 && (
                  <>
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl px-3 py-2.5 flex gap-3 items-center shadow-sm mb-1">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-500 shrink-0">
                        <i className="fa-solid fa-eye"></i>
                      </div>
                      <div>
                        <p className="text-blue-800 text-xs font-black leading-tight">Review Bukti Absen</p>
                        <p className="text-blue-500 text-[10px] font-bold mt-0.5">Pastikan semua foto jelas sebelum dikirim.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <p className="text-[10px] font-black text-gray-400 uppercase pl-1 text-center">📸 Selfie</p>
                        <div className="rounded-2xl overflow-hidden border-2 border-gray-200 shadow-sm bg-gray-50" style={{ aspectRatio: '3/4' }}>
                          <img src={fotoBase64!} className="w-full h-full object-cover" alt="Selfie" />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-[10px] font-black text-gray-400 uppercase pl-1 text-center">📠 Mesin</p>
                        <div className="rounded-2xl overflow-hidden border-2 border-gray-200 shadow-sm bg-gray-50" style={{ aspectRatio: '3/4' }}>
                          <img src={fotoMesinBase64!} className="w-full h-full object-cover" alt="Mesin" />
                        </div>
                      </div>
                    </div>
                    <div className="w-full rounded-2xl border-2 border-gray-200 bg-white px-3 pt-2 pb-3 shadow-sm mt-1 flex flex-col items-center">
                      <p className="text-[10px] font-black text-gray-400 uppercase mb-1">✍️ Tanda Tangan</p>
                      <div className="w-full border-t border-dashed border-gray-200 pt-1">
                        <img src={ttdBase64!} className="w-full object-contain" style={{ maxHeight: '60px' }} alt="TTD" />
                      </div>
                    </div>
                  </>
                )}

              </div>

              {/* ── FOOTER TOMBOL MODAL ── */}
              <div className="px-5 pb-6 pt-3 shrink-0 border-t border-gray-100 bg-gray-50">
                {(cameraStep === 1 || cameraStep === 2) && (
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={tutupModal} className="bg-white border border-gray-200 text-gray-500 font-black py-3.5 rounded-2xl active:scale-95 text-sm flex items-center justify-center gap-2 shadow-sm">
                      <i className="fa-solid fa-xmark" /> Batal
                    </button>
                    <button disabled={!jepretState.aktif} onClick={jepretFoto} className={`font-black py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-95 text-sm transition-all shadow-md ${jepretState.aktif ? (cameraStep === 1 ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white') : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                      <i className="fa-solid fa-camera shrink-0" />
                      <span>{jepretState.teks}</span>
                    </button>
                  </div>
                )}
                {cameraStep === 3 && (
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={tutupModal} className="bg-white border border-gray-200 text-gray-500 font-black py-3.5 rounded-2xl active:scale-95 text-sm flex items-center justify-center gap-2 shadow-sm">
                      <i className="fa-solid fa-xmark" /> Batal
                    </button>
                    <button onClick={simpanTTD} disabled={isTtdEmpty} className={`font-black py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-95 text-sm transition-all shadow-md ${!isTtdEmpty ? 'bg-purple-500 hover:bg-purple-600 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                      <i className="fa-solid fa-check shrink-0" /> Lanjut
                    </button>
                  </div>
                )}
                {cameraStep === 4 && (
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => bukaModalAbsen(modeAbsen)} className="bg-white border border-gray-200 text-gray-500 font-black py-3.5 rounded-2xl active:scale-95 flex items-center justify-center gap-2 text-sm shadow-sm">
                      <i className="fa-solid fa-rotate-right shrink-0" /> Ulangi
                    </button>
                    <button onClick={kirimAbsen} disabled={isKirimLoading} className="bg-[#3e2723] hover:bg-[#4e342e] text-[#fbc02d] font-black py-3.5 rounded-2xl shadow-md flex items-center justify-center gap-2 active:scale-95 text-sm transition-colors">
                      {isKirimLoading ? <i className="fa-solid fa-spinner fa-spin shrink-0" /> : <i className="fa-solid fa-paper-plane shrink-0" />}
                      {isKirimLoading ? 'Mengirim...' : 'Kirim Absen'}
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* ══════════════════════════════
            MODAL DETAIL RIWAYAT
            ══════════════════════════════ */}
        {detailModal.show && (() => {
          const shiftName = detailModal.inData?.shift || detailModal.outData?.shift || '';
          const shiftInfo = getJamShift(shiftName, detailModal.tgl, user?.branch, masterShifts);
          const tglDate = new Date(detailModal.tgl);
          const hariLabel = tglDate.toLocaleDateString('id-ID', { weekday: 'long' });
          const tglLabel = tglDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

          const inJam = detailModal.inData?.time ? formatJamLokal(detailModal.inData.time) : null;
          const outJam = detailModal.outData?.time ? formatJamLokal(detailModal.outData.time) : null;

          const FotoSlot = ({ src, label, badge, badgeColor }: { src?: string; label: string; badge: string; badgeColor: string }) => (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide pl-1 text-center">{label}</p>
              <div className="relative rounded-2xl overflow-hidden bg-gray-50 border border-gray-200 shadow-sm" style={{ aspectRatio: '3/4' }}>
                {src
                  ? <img src={prosesUrlFoto(src)} className="w-full h-full object-cover" alt={label} />
                  : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                      <i className="fa-solid fa-image-slash text-2xl text-gray-300" />
                      <p className="text-[10px] text-gray-300 font-bold">Tidak ada foto</p>
                    </div>
                  )
                }
                <div className={`absolute top-2 left-2 ${badgeColor} text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-sm border border-white/20`}>{badge}</div>
              </div>
            </div>
          );

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8" style={{ background: 'rgba(62,39,35,0.92)', backdropFilter: 'blur(6px)' }}>
              <div className="bg-white w-full max-w-sm mx-auto md:max-w-2xl md:rounded-[2rem] rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden mt-auto mb-auto md:mt-0" style={{ maxHeight: '90vh' }}>

                {/* ── HEADER MODAL ── */}
                <div className="bg-[#3e2723] px-5 pt-5 pb-5 shrink-0 relative">
                  <button onClick={() => setDetailModal({ show: false, tgl: '' })} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-red-500 transition-colors">
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                  <div className="flex items-start justify-between gap-2 pr-10">
                    <div>
                      <p className="text-[#fbc02d] text-[10px] font-black uppercase tracking-widest mb-0.5">{hariLabel}</p>
                      <h2 className="text-white text-xl font-black leading-tight">{tglLabel}</h2>
                    </div>
                  </div>

                  {/* Ringkasan jam masuk & keluar */}
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-3 flex flex-col justify-center relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-16 h-16 bg-green-500/10 rounded-full -mr-6 -mt-6 blur-md"></div>
                      <div className="flex items-center gap-1.5 mb-1 relative z-10">
                        <i className="fa-solid fa-right-to-bracket text-green-400 text-xs" />
                        <p className="text-green-400 text-[10px] font-black uppercase">Masuk</p>
                      </div>
                      <p className="text-white font-black text-2xl leading-none relative z-10">{inJam ?? <span className="text-white/20">–</span>}</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-3 flex flex-col justify-center relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-16 h-16 bg-orange-500/10 rounded-full -mr-6 -mt-6 blur-md"></div>
                      <div className="flex items-center gap-1.5 mb-1 relative z-10">
                        <i className="fa-solid fa-right-from-bracket text-orange-400 text-xs" />
                        <p className="text-orange-400 text-[10px] font-black uppercase">Keluar</p>
                      </div>
                      <p className="text-white font-black text-2xl leading-none relative z-10">{outJam ?? <span className="text-white/20">–</span>}</p>
                    </div>
                  </div>
                  
                  <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-white/50 bg-black/20 rounded-xl py-1.5">
                    <i className="fa-solid fa-clock"></i> Jadwal: <span className="text-white/80 font-bold">{shiftInfo.in} – {shiftInfo.out}</span>
                  </div>
                </div>

                {/* ── KONTEN FOTO ── */}
                <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-6 md:grid md:grid-cols-3 md:gap-5 md:items-start bg-gray-50">

                  {/* Selfie: Masuk | Keluar */}
                  <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-2 mb-3 border-b border-gray-50 pb-2">
                      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                        <i className="fa-solid fa-camera text-gray-500 text-[10px]" />
                      </div>
                      <p className="text-xs font-black text-[#3e2723] uppercase tracking-wider">Selfie Wajah</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FotoSlot src={detailModal.inData?.custom_foto_absen} label="Masuk" badge="Masuk" badgeColor="bg-green-500" />
                      <FotoSlot src={detailModal.outData?.custom_foto_absen} label="Keluar" badge="Keluar" badgeColor="bg-orange-500" />
                    </div>
                  </div>

                  {/* Mesin fingerprint: Masuk | Keluar */}
                  <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-2 mb-3 border-b border-gray-50 pb-2">
                      <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                        <i className="fa-solid fa-fingerprint text-blue-500 text-[10px]" />
                      </div>
                      <p className="text-xs font-black text-[#3e2723] uppercase tracking-wider">Mesin Finger</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FotoSlot src={detailModal.inData?.custom_verification_image} label="Masuk" badge="Masuk" badgeColor="bg-green-500" />
                      <FotoSlot src={detailModal.outData?.custom_verification_image} label="Keluar" badge="Keluar" badgeColor="bg-orange-500" />
                    </div>
                  </div>

                  {/* Tanda tangan: Masuk | Keluar */}
                  <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 md:col-span-3">
                    <div className="flex items-center gap-2 mb-3 border-b border-gray-50 pb-2">
                      <div className="w-6 h-6 rounded-full bg-purple-50 flex items-center justify-center shrink-0">
                        <i className="fa-solid fa-pen-nib text-purple-500 text-[10px]" />
                      </div>
                      <p className="text-xs font-black text-[#3e2723] uppercase tracking-wider">Tanda Tangan</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: 'Masuk', data: detailModal.inData },
                        { label: 'Keluar', data: detailModal.outData },
                      ].map(({ label, data }) => (
                        <div key={label} className="flex flex-col gap-1.5">
                          <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide pl-1 text-center">{label}</p>
                          <div className="rounded-2xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center relative shadow-inner" style={{ height: '80px' }}>
                            {data?.custom_signature
                              ? <img src={prosesUrlFoto(data.custom_signature)} className="w-full h-full object-contain p-2 mix-blend-multiply" alt={`TTD ${label}`} />
                              : (
                                <div className="flex items-center gap-2">
                                  <i className="fa-solid fa-pen-slash text-gray-300" />
                                  <p className="text-[10px] text-gray-400 font-bold">Belum ada TTD</p>
                                </div>
                              )
                            }
                            <div className="absolute top-1/2 left-0 w-full border-t border-dashed border-gray-200 -z-10"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

                {/* ── FOOTER ── */}
                <div className="p-4 shrink-0 bg-white border-t border-gray-100">
                  <button
                    onClick={() => setDetailModal({ show: false, tgl: '' })}
                    className="w-full bg-gray-100 hover:bg-gray-200 text-[#3e2723] font-black py-4 rounded-2xl active:scale-95 transition-colors flex items-center justify-center gap-2"
                  >
                    <i className="fa-solid fa-check text-[#fbc02d]" /> Mengerti & Tutup
                  </button>
                </div>

              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
};

export default Absen;