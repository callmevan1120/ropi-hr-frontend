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
  shift?: string;
}

interface LeaveRecord {
  name: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  status: string;
}

// ── HELPER: KONVERSI UTC KE WIB (VERSI DIPAKSA) ──
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
    hour12: false 
  }).replace('.', ':');
};

const toMenit = (jam: string): number => {
  const [h, m] = jam.split(':').map(Number);
  return h * 60 + m;
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
  if (shiftNameFromRecord && masterShifts[shiftNameFromRecord]) {
    return masterShifts[shiftNameFromRecord];
  }
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

const Absen = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const BACKEND = (import.meta as any).env?.VITE_API_URL || 'https://ropi-hr-backend.vercel.app';
  const ERPNEXT_URL = 'http://103.187.147.240';
  const LOKASI_FALLBACK: Lokasi[] = [{ nama: 'PH Klaten', lat: -7.615, lng: 110.687, radius: 100 }];

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
  const [fotoBase64, setFotoBase64] = useState<string | null>(null);
  const [jepretState, setJepretState] = useState({ aktif: false, teks: 'Menunggu GPS...' });
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

  useEffect(() => {
    setLihatSemua(false);
  }, [bulanAktif, tahunAktif]);

  useEffect(() => {
    const modeAuto = searchParams.get('mode');
    const isAuto = searchParams.get('auto');
    if (isAuto === 'true' && modeAuto && user) {
      setTimeout(() => bukaModalAbsen(modeAuto), 500);
    }
  }, [searchParams, user, navigate]);

  useEffect(() => {
    return () => matikanKamera();
  }, []);

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
    } catch { console.error('Gagal menarik daftar shift'); }
  };

  const ambilLokasiKantor = async (branch?: string) => {
    try {
      const url = branch
        ? `${BACKEND}/api/locations/${encodeURIComponent(branch)}`
        : `${BACKEND}/api/locations`;
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
      const sampai = `${tahunAktif}-${String(bulanAktif + 1).padStart(2, '0')}-${String(akhir.getDate()).padStart(2, '0')}`;
      const res = await fetch(
        `${BACKEND}/api/attendance?employee_id=${encodeURIComponent(user.employee_id)}&from=${dari}&to=${sampai}`
      );
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

  const bukaModalAbsen = (mode: string) => {
    setModeAbsen(mode);
    setFotoBase64(null);
    setIsModalAbsenOpen(true);
    setKameraBorder('border-[#fbc02d]');
    setWajahStatus({ show: false, ok: false });
    setGpsStatus({ tipe: 'loading', pesan: 'Mendeteksi lokasi...' });
    setJepretState({ aktif: false, teks: 'Menunggu GPS...' });
    intervalJamRef.current = window.setInterval(() => setJamModal(new Date().toLocaleTimeString('id-ID')), 1000);
    
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setKoordinatGPS(coords);
        const cek = cekRadius(coords.lat, coords.lng);
        
        if (!cek.valid) {
          setGpsStatus({ tipe: 'error', pesan: `Di luar radius! ${cek.jarak}m` });
          setJepretState({ aktif: false, teks: 'Lokasi tidak sesuai' });
        } else {
          // 🔥 VALIDASI KETAT: Blokir Akun Outlet (Shift 1/dll) di PH Klaten 🔥
          const lokasiTerdeteksi = cek.nama.toLowerCase();
          const cabangUser = (user?.branch || '').toLowerCase();
          
          const isLokasiPusat = lokasiTerdeteksi.includes('klaten') || lokasiTerdeteksi.includes('ph');
          const isUserPusat = cabangUser.includes('klaten') || cabangUser.includes('ph');

          if (isLokasiPusat && !isUserPusat) {
            setGpsStatus({ tipe: 'error', pesan: `Ditolak! Anda terdaftar di Cabang: ${user?.branch || 'Lain'}` });
            setJepretState({ aktif: false, teks: 'Akses Ditolak' });
          } else {
            setGpsStatus({ tipe: 'ok', pesan: `Lokasi: ${cek.nama} ✓` });
            await nyalakanKamera();
          }
        }
      },
      () => { setGpsStatus({ tipe: 'error', pesan: 'GPS Mati / Ditolak' }); setJepretState({ aktif: false, teks: 'Izinkan GPS' }); },
      { enableHighAccuracy: true }
    );
  };

  const tutupModal = () => {
    matikanKamera();
    setIsModalAbsenOpen(false);
    if (searchParams.has('auto')) setSearchParams({});
  };

  const nyalakanKamera = async () => {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 640 } },
      });
      if (videoRef.current) { videoRef.current.srcObject = streamRef.current; await videoRef.current.play(); }
      muatFaceAPI();
    } catch { setJepretState({ aktif: false, teks: 'Kamera Gagal' }); }
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
      if (!window.faceapi || !videoRef.current || videoRef.current.paused) return;
      const hasil = await window.faceapi.detectAllFaces(videoRef.current, new window.faceapi.TinyFaceDetectorOptions());
      if (hasil.length > 0) {
        setWajahStatus({ show: true, ok: true });
        setJepretState({ aktif: true, teks: 'Jepret!' });
        setKameraBorder('border-green-400');
      } else {
        setWajahStatus({ show: true, ok: false });
        setJepretState({ aktif: false, teks: 'Cari wajah...' });
        setKameraBorder('border-orange-300');
      }
    }, 600);
  };

  const jepretFoto = () => {
    if (intervalDeteksiRef.current) window.clearInterval(intervalDeteksiRef.current);
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    const MAX_HEIGHT = 640;
    const scaleSize = video.videoHeight > MAX_HEIGHT ? MAX_HEIGHT / video.videoHeight : 1;
    canvas.width = video.videoWidth * scaleSize;
    canvas.height = video.videoHeight * scaleSize;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFotoBase64(canvas.toDataURL('image/jpeg', 0.6));
    setWajahStatus({ show: false, ok: false });
    setKameraBorder('border-[#3e2723]');
  };

  const kirimAbsen = async () => {
    if (!koordinatGPS || !fotoBase64 || !user) return;
    setIsKirimLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/attendance/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: user.employee_id,
          tipe: modeAbsen === 'MASUK' ? 'IN' : 'OUT',
          latitude: koordinatGPS.lat,
          longitude: koordinatGPS.lng,
          branch: user.branch || '',
          image_verification: fotoBase64,
          shift: getShiftKantor(new Date(), masterShifts, user?.branch),
        }),
      });
      if (res.ok) { alert(`Absen ${modeAbsen} berhasil!`); tutupModal(); ambilRiwayatAbsen(); }
      else alert('Absen gagal dikirim ke sistem.');
    } catch { alert('Gagal konek ke server.'); }
    setIsKirimLoading(false);
  };

  // ════════════════════════════
  // GROUPING & REKAP (SUDAH WIB)
  // ════════════════════════════
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

  const rekapIzin = hitungHariKerjaDalamBulan(
    leaveRecords,
    r => !r.leave_type.toLowerCase().includes('tahunan') && r.status?.toLowerCase() !== 'rejected',
    tahunAktif, bulanAktif
  );
  const rekapCuti = hitungHariKerjaDalamBulan(
    leaveRecords,
    r => r.leave_type.toLowerCase().includes('tahunan') && r.status?.toLowerCase() !== 'rejected',
    tahunAktif, bulanAktif
  );

  const tanggalIzinSet = getTanggalIzin();
  const sortedTglKeys = Object.keys(groupedRiwayat).sort((a, b) => b.localeCompare(a));
  const tampilKeys = lihatSemua ? sortedTglKeys : sortedTglKeys.slice(0, 5);

  // ════════════════════════════
  // RENDER KALENDER (SUDAH WIB)
  // ════════════════════════════
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

      return (
        <div key={d}>
          <div className={kelas}>{d}{dot}</div>
        </div>
      );
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
    <div className="bg-gray-100 flex justify-center min-h-screen font-sans">
      <div className="w-full max-w-sm bg-white min-h-screen flex flex-col shadow-2xl relative">

        {/* ── HEADER ── */}
        <div className="bg-[#3e2723] pt-12 pb-5 px-6 shrink-0 shadow-md z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/home" className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform">
                <i className="fa-solid fa-arrow-left" />
              </Link>
              <h1 className="text-xl font-black text-[#fbc02d]">Laporan Absen</h1>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { if (bulanAktif === 0) { setBulanAktif(11); setTahunAktif(tahunAktif - 1); } else setBulanAktif(bulanAktif - 1); }}
                className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center text-white text-xs hover:bg-white/30"
              ><i className="fa-solid fa-chevron-left" /></button>
              <span className="text-white text-xs font-bold min-w-[80px] text-center">
                {new Date(tahunAktif, bulanAktif, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
              </span>
              <button
                onClick={() => { if (bulanAktif === 11) { setBulanAktif(0); setTahunAktif(tahunAktif + 1); } else setBulanAktif(bulanAktif + 1); }}
                className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center text-white text-xs hover:bg-white/30"
              ><i className="fa-solid fa-chevron-right" /></button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            {[
              { label: 'Hadir', value: rekapHadir, color: 'text-green-400' },
              { label: 'Telat', value: rekapTelat, color: 'text-red-400' },
              { label: 'Izin', value: rekapIzin, color: 'text-blue-300' },
              { label: 'Cuti', value: rekapCuti, color: 'text-purple-300' },
            ].map(item => (
              <div key={item.label} className="bg-white/10 rounded-xl py-2 text-center">
                <p className={`text-xl font-black ${item.color}`}>{item.value}</p>
                <p className="text-[9px] font-black text-white/60 uppercase tracking-wide">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── CONTENT ── */}
        <div className="flex-1 overflow-y-auto pb-32 pt-4">

          {leaveRecords.length > 0 && (
            <div className="px-4 mb-3 flex flex-wrap gap-1.5">
              {leaveRecords.map(r => {
                const statusColor =
                  r.status?.toLowerCase() === 'approved' ? 'bg-blue-100 text-blue-700 border-blue-200'
                  : r.status?.toLowerCase() === 'rejected' ? 'bg-red-100 text-red-600 border-red-200'
                  : 'bg-yellow-100 text-yellow-700 border-yellow-200';
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

          <div className="px-4 mb-4">
            <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100">
              <div className="grid grid-cols-7 text-center text-[9px] font-black text-gray-400 mb-1.5">
                {['Min','Sen','Sel','Rab','Kam','Jum','Sab'].map(h => <div key={h}>{h}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5 text-center">
                {renderKalender()}
              </div>
              <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100">
                {[
                  { color: 'bg-green-400', label: 'Tepat' },
                  { color: 'bg-red-400', label: 'Telat' },
                  { color: 'bg-blue-400', label: 'Izin' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${l.color} inline-block`} />
                    <span className="text-[9px] text-gray-400 font-bold">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="px-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-black text-[#3e2723] text-sm">Riwayat Kehadiran</h3>
              <p className="text-[10px] text-gray-400">
                <i className="fa-solid fa-hand-pointer mr-1" />Klik untuk detail
              </p>
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
                      badgeEl = selisih > 0
                        ? <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md">Telat {selisih}m</span>
                        : <span className="text-green-600 text-[9px] font-black">✓ Tepat</span>;
                    }
                    if (adaIzinHariIni && !badgeEl) {
                      badgeEl = <span className="bg-blue-100 text-blue-600 text-[9px] font-black px-1.5 py-0.5 rounded-md">Izin</span>;
                    }

                    let badgeCepat = null;
                    if (jamOut !== '-') {
                      const selisih = toMenit(shiftInfo.out) - toMenit(jamOut);
                      if (selisih > 0) {
                        badgeCepat = <span className="bg-orange-400 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md">Cepat {selisih}m</span>;
                      }
                    }

                    return (
                      <div
                        key={tgl}
                        onClick={() => bukaDetail(tgl)}
                        className="cursor-pointer bg-white px-4 py-3 rounded-2xl border border-gray-100 flex items-center gap-3 shadow-sm active:scale-95 transition-transform hover:border-[#fbc02d]/40"
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base shrink-0 ${d.in ? 'bg-green-50 text-green-500' : adaIzinHariIni ? 'bg-blue-50 text-blue-400' : 'bg-gray-50 text-gray-300'}`}>
                          <i className={`fa-solid ${d.in ? 'fa-check' : adaIzinHariIni ? 'fa-envelope-open-text' : 'fa-minus'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-[#3e2723] text-sm truncate">{dateLabel}</p>
                          <p className="text-[10px] text-gray-400">
                            {jamIn} → {jamOut}
                            <span className="ml-1 text-[#fbc02d]">· {shiftInfo.in}–{shiftInfo.out}</span>
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {badgeEl}
                          {badgeCepat}
                        </div>
                      </div>
                    );
                  })}

                  {sortedTglKeys.length > 5 && (
                    <button
                      onClick={() => setLihatSemua(!lihatSemua)}
                      className="w-full mt-1 py-3 rounded-2xl border border-dashed border-gray-300 text-xs font-black text-gray-400 hover:border-[#fbc02d] hover:text-[#3e2723] transition-colors flex items-center justify-center gap-2"
                    >
                      <i className={`fa-solid ${lihatSemua ? 'fa-chevron-up' : 'fa-chevron-down'}`} />
                      {lihatSemua ? 'Lebih Sedikit' : `Lihat Semua (${sortedTglKeys.length} hari)`}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── NAVIGATION BOTTOM ── */}
        <nav className="absolute bottom-0 left-0 right-0 w-full bg-white border-t border-gray-100 px-4 py-3 flex justify-between z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.02)]">
          <Link to="/home" className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors">
            <i className="fa-solid fa-house text-xl mb-1" /><span className="text-[10px] font-black uppercase">Home</span>
          </Link>
          <div className="flex flex-col items-center text-[#3e2723] w-1/4">
            <i className="fa-solid fa-clipboard-user text-xl mb-1 drop-shadow-md" /><span className="text-[10px] font-black uppercase">Absen</span>
          </div>
          <Link to="/izin" className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors">
            <i className="fa-solid fa-envelope-open-text text-xl mb-1" /><span className="text-[10px] font-black uppercase">Izin</span>
          </Link>
          <Link to="/cuti" className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors">
            <i className="fa-solid fa-calendar-minus text-xl mb-1" /><span className="text-[10px] font-black uppercase">Cuti</span>
          </Link>
        </nav>

        {/* ── MODAL KAMERA (DENGAN REVISI KOTAK GPS & VALIDASI KETAT) ── */}
        {isModalAbsenOpen && (
          <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(62,39,35,0.88)', backdropFilter: 'blur(4px)' }}>
            <div className="bg-white w-full max-w-sm mx-auto rounded-t-[2.5rem] flex flex-col items-center shadow-2xl p-6 pb-10">
              <div className="w-14 h-1.5 bg-gray-200 rounded-full mb-4 shrink-0" />
              <p className="text-4xl font-black text-[#3e2723] tracking-tight mb-1">{jamModal}</p>
              <div className={`text-[10px] font-black uppercase tracking-widest px-4 py-1 rounded-full mb-3 ${modeAbsen === 'MASUK' ? 'bg-[#3e2723] text-[#fbc02d]' : 'bg-[#fbc02d] text-[#3e2723]'}`}>
                {modeAbsen}
              </div>
              
              {/* 🔥 REVISI: Kotak GPS Flex Center & FontAwesome Spinner 🔥 */}
              <div className={`w-full mb-3 px-4 py-3 rounded-2xl text-xs font-black shadow-sm border flex items-center justify-center gap-2 transition-colors ${
                gpsStatus.tipe === 'error' ? 'bg-red-50 text-red-600 border-red-100' : 
                gpsStatus.tipe === 'ok' ? 'bg-green-50 text-green-700 border-green-100' : 
                'bg-blue-50 text-blue-700 border-blue-100'
              }`}>
                {gpsStatus.tipe === 'loading' ? (
                  <i className="fa-solid fa-spinner fa-spin text-sm" />
                ) : (
                  <i className={`fa-solid ${gpsStatus.tipe === 'error' ? 'fa-triangle-exclamation' : 'fa-location-dot'} text-sm`} />
                )}
                <span>{gpsStatus.pesan}</span>
              </div>

              <div className={`w-full h-[340px] rounded-3xl overflow-hidden border-4 ${kameraBorder} bg-[#fff8e1] flex items-center justify-center relative mb-4 transition-colors`}>
                {!fotoBase64
                  ? <video ref={videoRef} className="w-full h-full object-cover z-10" style={{ transform: 'scaleX(-1)' }} playsInline muted />
                  : <img src={fotoBase64} className="w-full h-full object-cover z-20" style={{ transform: 'scaleX(-1)' }} alt="Preview" />
                }
              </div>

              {!fotoBase64 ? (
                <div className="w-full grid grid-cols-2 gap-3">
                  <button onClick={tutupModal} className="bg-gray-100 text-gray-500 font-black py-4 rounded-2xl active:scale-95">Batal</button>
                  <button disabled={!jepretState.aktif} onClick={jepretFoto} className={`font-black py-4 rounded-2xl flex justify-center gap-2 active:scale-95 ${jepretState.aktif ? 'bg-[#3e2723] text-[#fbc02d] shadow-lg' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                    <i className="fa-solid fa-camera" /> {jepretState.teks}
                  </button>
                </div>
              ) : (
                <div className="w-full grid grid-cols-2 gap-3">
                  <button onClick={() => { setFotoBase64(null); nyalakanKamera(); }} className="bg-gray-100 text-gray-500 font-black py-4 rounded-2xl active:scale-95">
                    <i className="fa-solid fa-rotate-right" /> Ulangi
                  </button>
                  <button onClick={kirimAbsen} disabled={isKirimLoading} className="bg-green-500 text-white font-black py-4 rounded-2xl shadow-lg flex justify-center gap-2 active:scale-95">
                    {isKirimLoading ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-paper-plane" />}
                    {isKirimLoading ? 'Mengirim...' : 'Kirim'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── MODAL DETAIL ── */}
        {detailModal.show && (
          <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(62,39,35,0.88)', backdropFilter: 'blur(4px)' }}>
            <div className="bg-white w-full max-w-sm mx-auto rounded-t-[2.5rem] flex flex-col items-center shadow-2xl p-6 pb-10 h-[85vh]">
              <div className="w-14 h-1.5 bg-gray-200 rounded-full mb-4 shrink-0" />
              <h2 className="text-xl font-black text-[#3e2723] mb-1">
                {new Date(detailModal.tgl).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </h2>
              {(() => {
                const shiftName = detailModal.inData?.shift || detailModal.outData?.shift || '';
                const shiftInfo = getJamShift(shiftName, detailModal.tgl, user?.branch, masterShifts);
                const shiftLabel = getShiftKantor(new Date(detailModal.tgl), masterShifts, user?.branch) || 'Jadwal Kantor';
                return (
                  <div className="bg-[#fff8e1] border border-[#fbc02d]/30 rounded-xl px-4 py-2 mb-3 text-center">
                    <p className="text-[10px] text-gray-500 font-bold uppercase">{shiftLabel}</p>
                    <p className="text-sm font-black text-[#3e2723]">{shiftInfo.in} – {shiftInfo.out}</p>
                  </div>
                );
              })()}
              <div className="w-full flex-1 overflow-y-auto pb-6 pt-2 flex flex-col gap-4">
                {[
                  { label: 'Absen Masuk', color: 'green', data: detailModal.inData },
                  { label: 'Absen Keluar', color: 'orange', data: detailModal.outData },
                ].map(({ label, color, data }) => (
                  <div key={label} className={`bg-${color}-50 p-4 rounded-3xl border border-${color}-100 flex flex-col`}>
                    <div className={`self-start bg-${color}-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase mb-2`}>{label}</div>
                    
                    <p className={`font-bold text-lg mb-2 text-${color}-800`}>
                      {data?.time ? `Pukul: ${formatJamLokal(data.time)}` : 'Belum Absen'}
                    </p>
                    
                    <div className="w-full h-40 bg-gray-200 rounded-2xl overflow-hidden relative">
                      {data?.custom_foto_absen
                        ? <img src={prosesUrlFoto(data.custom_foto_absen)} className="w-full h-full object-cover" alt={label} />
                        : <p className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 font-bold">Tidak ada foto</p>
                      }
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setDetailModal({ show: false, tgl: '' })} className="w-full mt-2 bg-gray-100 text-gray-500 font-black py-4 rounded-2xl active:scale-95">
                Tutup Detail
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Absen;