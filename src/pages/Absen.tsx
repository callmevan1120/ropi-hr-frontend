import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';

// ══════════════════════════════════════
// 1. INTERFACE TYPESCRIPT
// ══════════════════════════════════════
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

// ══════════════════════════════════════
// HELPER: KONVERSI JAM "HH:MM" → MENIT
// ══════════════════════════════════════
const toMenit = (jam: string): number => {
  const [h, m] = jam.split(':').map(Number);
  return h * 60 + m;
};

// ══════════════════════════════════════
// HELPER: CEK APAKAH SEKARANG BULAN RAMADHAN
// ══════════════════════════════════════
const isRamadhan = (): boolean => {
  const now = new Date();
  const tahun = now.getFullYear();
  const bulan = now.getMonth() + 1; // 1-indexed
  const tgl = now.getDate();

  if (tahun === 2025 && bulan === 3 && tgl >= 1 && tgl <= 30) return true;
  if (tahun === 2026 && bulan === 2 && tgl >= 18) return true;
  if (tahun === 2026 && bulan === 3 && tgl <= 19) return true;
  return false;
};

// ══════════════════════════════════════
// HELPER: DAPATKAN NAMA SHIFT YANG BERLAKU
// UNTUK USER KANTOR (OTOMATIS)
// ══════════════════════════════════════
const getShiftKantor = (
  tanggal: Date,
  masterShifts: Record<string, { in: string; out: string }>,
  branch?: string
): string => {
  const hari = tanggal.getDay(); // 0=Min, 1=Sen...5=Jum, 6=Sab
  const isFriday = hari === 5;
  const ramadhan = isRamadhan();

  const branchLabel = branch?.includes('Jakarta') ? 'Jakarta' : 'PH Klaten';
  const hariLabel = isFriday ? 'Jumat' : 'Senin - Kamis';
  const periodeLabel = ramadhan ? 'Ramadhan' : 'Non Ramadhan';

  const namaShift = `${hariLabel} (${branchLabel} ${periodeLabel})`;

  return masterShifts[namaShift] ? namaShift : namaShift;
};

// ══════════════════════════════════════
// HELPER: DAPATKAN JAM MASUK/KELUAR EFEKTIF
// ══════════════════════════════════════
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
  if (namaShift && masterShifts[namaShift]) {
    return masterShifts[namaShift];
  }

  // Fallback Hardcode jika master shift dari ERPNext belum selesai di-load
  const hari = tglDate.getDay();
  const isFriday = hari === 5;
  const ramadhan = isRamadhan();
  if (ramadhan) {
    return isFriday ? { in: '07:00', out: '16:00' } : { in: '07:00', out: '15:30' };
  } else {
    return isFriday ? { in: '07:30', out: '17:00' } : { in: '07:30', out: '16:30' };
  }
};

const Absen = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // KONFIGURASI
  const BACKEND = 'http://localhost:3333';
  const ERPNEXT_URL = 'http://103.187.147.240';
  const LOKASI_FALLBACK: Lokasi[] = [{ nama: 'PH Klaten', lat: -7.615, lng: 110.687, radius: 100 }];

  // ══════════════════════════════════════
  // 2. STATE MANAGEMENT
  // ══════════════════════════════════════
  const [user, setUser] = useState<User | null>(null);
  const [lokasiKantor, setLokasiKantor] = useState<Lokasi[]>(LOKASI_FALLBACK);
  const [dataRiwayat, setDataRiwayat] = useState<RiwayatAbsen[]>([]);
  const [bulanAktif, setBulanAktif] = useState(new Date().getMonth());
  const [tahunAktif, setTahunAktif] = useState(new Date().getFullYear());

  const [masterShifts, setMasterShifts] = useState<Record<string, { in: string; out: string }>>({});

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

  // ══════════════════════════════════════
  // 3. LIFECYCLE & FETCH DATA
  // ══════════════════════════════════════
  useEffect(() => {
    const userData = localStorage.getItem('ropi_user');
    if (!userData) { navigate('/'); return; }
    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    ambilLokasiKantor(parsedUser.branch);
    ambilMasterShift();
  }, [navigate]);

  useEffect(() => {
    if (user) ambilRiwayatAbsen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, bulanAktif, tahunAktif]);

  useEffect(() => {
    const modeAuto = searchParams.get('mode');
    const isAuto = searchParams.get('auto');
    // ✨ Pengecekan shift manual dihapus, langsung buka kamera
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
    } catch {
      console.error('Gagal menarik daftar shift dari ERPNext');
    }
  };

  const ambilLokasiKantor = async (branch?: string) => {
    try {
      const url = branch
        ? `${BACKEND}/api/locations/${encodeURIComponent(branch)}`
        : `${BACKEND}/api/locations`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.locations?.length > 0) setLokasiKantor(data.locations);
    } catch {
      console.warn('Pakai lokasi fallback');
    }
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
    } catch {
      setDataRiwayat([]);
    }
  };

  // ══════════════════════════════════════
  // 4. GPS & KAMERA
  // ══════════════════════════════════════
  const hitungJarak = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const bukaModalAbsen = (mode: string) => {
    setModeAbsen(mode);
    setFotoBase64(null);
    setIsModalAbsenOpen(true);
    setKameraBorder('border-[#fbc02d]');
    setWajahStatus({ show: false, ok: false });
    setGpsStatus({ tipe: 'loading', pesan: 'Mendeteksi lokasi...' });
    setJepretState({ aktif: false, teks: 'Menunggu GPS...' });

    intervalJamRef.current = window.setInterval(
      () => setJamModal(new Date().toLocaleTimeString('id-ID')),
      1000
    );

    navigator.geolocation.getCurrentPosition(
      async pos => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setKoordinatGPS(coords);
        const cek = cekRadius(coords.lat, coords.lng);
        if (!cek.valid) {
          setGpsStatus({ tipe: 'error', pesan: `Di luar radius! ${cek.jarak}m` });
          setJepretState({ aktif: false, teks: 'Lokasi tidak sesuai' });
        } else {
          setGpsStatus({ tipe: 'ok', pesan: `Lokasi: ${cek.nama} ✓` });
          await nyalakanKamera();
        }
      },
      () => {
        setGpsStatus({ tipe: 'error', pesan: 'GPS Mati / Ditolak' });
        setJepretState({ aktif: false, teks: 'Izinkan GPS' });
      },
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
        video: { facingMode: 'user', width: 640, height: 480 },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
        await videoRef.current.play();
      }
      muatFaceAPI();
    } catch {
      setJepretState({ aktif: false, teks: 'Kamera Gagal' });
    }
  };

  const muatFaceAPI = () => {
    setWajahStatus({ show: true, ok: false });
    if (window.faceapi?.nets?.tinyFaceDetector?.isLoaded) { mulaiDeteksi(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js';
    script.onload = async () => {
      await window.faceapi.nets.tinyFaceDetector.loadFromUri(
        'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'
      );
      mulaiDeteksi();
    };
    document.head.appendChild(script);
  };

  const mulaiDeteksi = () => {
    intervalDeteksiRef.current = window.setInterval(async () => {
      if (!window.faceapi || !videoRef.current || videoRef.current.paused) return;
      const hasil = await window.faceapi.detectAllFaces(
        videoRef.current,
        new window.faceapi.TinyFaceDetectorOptions()
      );
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
    const MAX_WIDTH = 480;
    const scaleSize = video.videoWidth > MAX_WIDTH ? MAX_WIDTH / video.videoWidth : 1;
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
          // ✨ KIRIM NAMA SHIFT KANTOR SECARA OTOMATIS
          shift: getShiftKantor(new Date(), masterShifts, user?.branch),
        }),
      });
      if (res.ok) {
        alert(`Absen ${modeAbsen} berhasil!`);
        tutupModal();
        ambilRiwayatAbsen();
      } else {
        alert('Absen gagal dikirim ke sistem.');
      }
    } catch {
      alert('Gagal konek ke server Express.js');
    }
    setIsKirimLoading(false);
  };

  // ════════════════════════════════════════════════════════════════
  // 5. GROUPING & REKAP (FIRST CHECK-IN & LAST CHECK-OUT LOGIC)
  // ════════════════════════════════════════════════════════════════
  const groupedRiwayat: Record<string, { in?: RiwayatAbsen; out?: RiwayatAbsen }> = {};
  dataRiwayat.forEach(item => {
    const tgl = item.time?.substring(0, 10) || item.attendance_date || '';
    if (!groupedRiwayat[tgl]) groupedRiwayat[tgl] = {};
    
    if (item.log_type === 'IN') {
      if (
        !groupedRiwayat[tgl].in ||
        (item.time && groupedRiwayat[tgl].in?.time && item.time < groupedRiwayat[tgl].in!.time!)
      )
        groupedRiwayat[tgl].in = item;
    }
    
    if (item.log_type === 'OUT') {
      if (
        !groupedRiwayat[tgl].out ||
        (item.time && groupedRiwayat[tgl].out?.time && item.time > groupedRiwayat[tgl].out!.time!)
      )
        groupedRiwayat[tgl].out = item;
    }
  });

  const rekapHadir = Object.keys(groupedRiwayat).length;
  let rekapTelat = 0;

  Object.entries(groupedRiwayat).forEach(([tgl, d]) => {
    if (d.in?.time) {
      const jamAbsen = d.in.time.substring(11, 16);
      const shiftInfo = getJamShift(d.in.shift || '', tgl, user?.branch, masterShifts);
      if (toMenit(jamAbsen) > toMenit(shiftInfo.in)) rekapTelat++;
    }
  });

  // ══════════════════════════════════════
  // 6. RENDER KALENDER
  // ══════════════════════════════════════
  const renderKalender = () => {
    const hariPertama = new Date(tahunAktif, bulanAktif, 1).getDay();
    const totalHari = new Date(tahunAktif, bulanAktif + 1, 0).getDate();
    const blanks = Array.from({ length: hariPertama }, (_, i) => <div key={`blank-${i}`}></div>);

    const days = Array.from({ length: totalHari }, (_, i) => {
      const d = i + 1;
      const isHariIni =
        d === new Date().getDate() && bulanAktif === new Date().getMonth();
      const strTgl = `${tahunAktif}-${String(bulanAktif + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dataIn = groupedRiwayat[strTgl]?.in;
      const checkin = dataIn?.time;

      let kelas =
        'w-8 h-8 flex items-center justify-center mx-auto rounded-full text-sm relative ';
      let dot = null;

      if (isHariIni) {
        kelas += 'bg-[#3e2723] text-[#fbc02d] font-black';
      } else if (checkin) {
        const shiftInfo = getJamShift(dataIn?.shift || '', strTgl, user?.branch, masterShifts);
        const isTelat = toMenit(checkin.substring(11, 16)) > toMenit(shiftInfo.in);
        kelas += isTelat ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700';
        dot = (
          <span
            className={`absolute -bottom-1 w-1.5 h-1.5 rounded-full ${isTelat ? 'bg-red-500' : 'bg-green-500'}`}
          ></span>
        );
      }

      return (
        <div key={d}>
          <div className={kelas}>
            {d}
            {dot}
          </div>
        </div>
      );
    });

    return [...blanks, ...days];
  };

  const bukaDetail = (tgl: string) => {
    setDetailModal({
      show: true,
      tgl,
      inData: groupedRiwayat[tgl]?.in,
      outData: groupedRiwayat[tgl]?.out,
    });
  };

  const prosesUrlFoto = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('data:image')) return url;
    if (url.startsWith('/files')) return ERPNEXT_URL + url;
    return url;
  };

  // ══════════════════════════════════════
  // RENDER UI
  // ══════════════════════════════════════
  return (
    <div className="bg-gray-100 flex justify-center min-h-screen font-sans">
      <div className="w-full max-w-sm bg-white min-h-screen flex flex-col shadow-2xl relative">

        {/* Header */}
        <div className="bg-[#3e2723] pt-12 pb-6 px-6 shrink-0 shadow-md z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                to="/home"
                className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform"
              >
                <i className="fa-solid fa-arrow-left"></i>
              </Link>
              <h1 className="text-xl font-black text-[#fbc02d]">Laporan Absen</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (bulanAktif === 0) { setBulanAktif(11); setTahunAktif(tahunAktif - 1); }
                  else setBulanAktif(bulanAktif - 1);
                }}
                className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white text-xs hover:bg-white/30"
              >
                <i className="fa-solid fa-chevron-left"></i>
              </button>
              <span className="text-white text-sm font-bold min-w-[90px] text-center">
                {new Date(tahunAktif, bulanAktif, 1).toLocaleDateString('id-ID', {
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
              <button
                onClick={() => {
                  if (bulanAktif === 11) { setBulanAktif(0); setTahunAktif(tahunAktif + 1); }
                  else setBulanAktif(bulanAktif + 1);
                }}
                className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white text-xs hover:bg-white/30"
              >
                <i className="fa-solid fa-chevron-right"></i>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-32 pt-6">

          <div className="px-6 grid grid-cols-3 gap-3">
            <div className="bg-green-50 rounded-2xl p-3 text-center border border-green-100 shadow-sm">
              <p className="text-2xl font-black text-green-600">{rekapHadir}</p>
              <p className="text-[10px] font-black text-green-500 uppercase tracking-wide">Hadir</p>
            </div>
            <div className="bg-red-50 rounded-2xl p-3 text-center border border-red-100 shadow-sm">
              <p className="text-2xl font-black text-red-500">{rekapTelat}</p>
              <p className="text-[10px] font-black text-red-400 uppercase tracking-wide">Telat</p>
            </div>
            <div className="bg-blue-50 rounded-2xl p-3 text-center border border-blue-100 shadow-sm">
              <p className="text-2xl font-black text-blue-500">-</p>
              <p className="text-[10px] font-black text-blue-400 uppercase tracking-wide">Izin/Cuti</p>
            </div>
          </div>

          <div className="px-6 mt-5">
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100">
              <div className="grid grid-cols-7 text-center text-[10px] font-black text-gray-400 mb-2">
                <div>Min</div><div>Sen</div><div>Sel</div><div>Rab</div><div>Kam</div><div>Jum</div><div>Sab</div>
              </div>
              <div className="grid grid-cols-7 gap-y-1 text-center text-sm font-bold">
                {renderKalender()}
              </div>
            </div>
          </div>

          <div className="px-6 mt-6">
            <h3 className="font-black text-[#3e2723] text-base mb-1">Riwayat Kehadiran</h3>
            <p className="text-[11px] text-gray-400 mb-3">
              <i className="fa-solid fa-circle-info mr-1"></i>
              Klik kartu untuk melihat foto detail absen.
            </p>
            <div className="flex flex-col gap-3">
              {Object.keys(groupedRiwayat).length === 0 ? (
                <div className="bg-gray-50 rounded-2xl p-6 text-center text-gray-400">
                  <i className="fa-solid fa-clipboard-list text-3xl mb-2 block text-gray-200"></i>
                  <p className="text-sm font-bold mt-2">Belum ada riwayat bulan ini</p>
                </div>
              ) : (
                Object.keys(groupedRiwayat)
                  .sort((a, b) => b.localeCompare(a))
                  .map(tgl => {
                    const d = groupedRiwayat[tgl];
                    const jamIn = d.in?.time?.substring(11, 16) || '-';
                    const jamOut = d.out?.time?.substring(11, 16) || '-';
                    const dateLabel = new Date(tgl).toLocaleDateString('id-ID', {
                      weekday: 'long', day: 'numeric', month: 'short',
                    });

                    const shiftName = d.in?.shift || d.out?.shift || '';
                    const shiftInfo = getJamShift(shiftName, tgl, user?.branch, masterShifts);

                    const shiftLabel = getShiftKantor(new Date(tgl), masterShifts, user?.branch) || 'Jadwal Kantor';

                    const badges = [];

                    if (jamIn !== '-') {
                      const selisihMenit = toMenit(jamIn) - toMenit(shiftInfo.in);
                      if (selisihMenit > 0) {
                        badges.push(
                          <span key="telat" className="bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-sm">
                            Telat {selisihMenit} mnt
                          </span>
                        );
                      }
                    }

                    if (jamOut !== '-') {
                      const selisihMenit = toMenit(shiftInfo.out) - toMenit(jamOut);
                      if (selisihMenit > 0) {
                        badges.push(
                          <span key="cepat" className="bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-sm">
                            Cepat {selisihMenit} mnt
                          </span>
                        );
                      }
                    }

                    if (jamIn !== '-' && badges.length === 0) {
                      badges.push(
                        <span key="tepat" className="text-green-600 text-[10px] font-black uppercase tracking-wider">
                          Sesuai Jadwal
                        </span>
                      );
                    }

                    return (
                      <div
                        key={tgl}
                        onClick={() => bukaDetail(tgl)}
                        className="cursor-pointer bg-white p-4 rounded-2xl border border-gray-100 flex justify-between items-center shadow-sm active:scale-95 transition-transform hover:border-[#fbc02d]/50"
                      >
                        <div className="flex gap-4 items-center">
                          <div
                            className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-inner ${d.in ? 'bg-green-50 text-green-500' : 'bg-gray-50 text-gray-400'}`}
                          >
                            <i className={`fa-solid ${d.in ? 'fa-check' : 'fa-minus'}`}></i>
                          </div>
                          <div>
                            <p className="font-bold text-[#3e2723] text-sm">{dateLabel}</p>
                            <p className="text-[11px] text-gray-400 font-medium">
                              Masuk: {jamIn} · Keluar: {jamOut}
                            </p>
                            <p className="text-[10px] text-[#fbc02d] font-bold mt-0.5">
                              Jadwal: {shiftInfo.in} – {shiftInfo.out}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 items-end">
                          {badges}
                          <span className="text-[8px] text-gray-400 font-bold uppercase truncate max-w-[80px] mt-1">
                            {shiftLabel}
                          </span>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>

        {/* ✨ NAVIGATION BOTTOM HANYA 3 MENU (Tanpa Shift) ✨ */}
        <nav className="absolute bottom-0 left-0 right-0 w-full bg-white border-t border-gray-100 px-6 py-4 flex justify-around z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.02)]">
          <Link
            to="/home"
            className="flex flex-col items-center text-gray-300 gap-1 hover:text-[#3e2723] transition-colors"
          >
            <i className="fa-solid fa-house text-xl"></i>
            <span className="text-[10px] font-black uppercase">Home</span>
          </Link>
          <div className="flex flex-col items-center text-[#3e2723] gap-1">
            <i className="fa-solid fa-clipboard-user text-xl drop-shadow-md"></i>
            <span className="text-[10px] font-black uppercase">Absen</span>
          </div>
          <Link
            to="/cuti"
            className="flex flex-col items-center text-gray-300 gap-1 hover:text-[#3e2723] transition-colors"
          >
            <i className="fa-solid fa-calendar-minus text-xl"></i>
            <span className="text-[10px] font-black uppercase">Cuti</span>
          </Link>
        </nav>

        {/* Modal Kamera Absen */}
        {isModalAbsenOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end"
            style={{ background: 'rgba(62,39,35,0.88)', backdropFilter: 'blur(4px)' }}
          >
            <div className="bg-white w-full max-w-sm mx-auto rounded-t-[2.5rem] flex flex-col items-center shadow-2xl p-6">
              <div className="w-14 h-1.5 bg-gray-200 rounded-full mb-4 shrink-0"></div>
              <p className="text-4xl font-black text-[#3e2723] tracking-tight mb-1">{jamModal}</p>
              <div
                className={`text-[10px] font-black uppercase tracking-widest px-4 py-1 rounded-full mb-3 ${modeAbsen === 'MASUK' ? 'bg-[#3e2723] text-[#fbc02d]' : 'bg-[#fbc02d] text-[#3e2723]'}`}
              >
                {modeAbsen}
              </div>

              <div
                className={`w-full mb-3 px-4 py-2.5 rounded-2xl text-sm font-bold flex items-center gap-2 justify-center ${
                  gpsStatus.tipe === 'error'
                    ? 'bg-red-50 text-red-600'
                    : gpsStatus.tipe === 'ok'
                    ? 'bg-green-50 text-green-700'
                    : 'bg-blue-50 text-blue-700'
                }`}
              >
                {gpsStatus.tipe === 'loading' && (
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                )}
                {gpsStatus.pesan}
              </div>

              {wajahStatus.show && !fotoBase64 && (
                <div
                  className={`w-full mb-3 px-4 py-2.5 rounded-2xl text-sm font-bold text-center shadow-inner ${
                    wajahStatus.ok ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
                  }`}
                >
                  <i className={`fa-solid ${wajahStatus.ok ? 'fa-face-smile' : 'fa-face-meh'} mr-1`}></i>
                  {wajahStatus.ok ? 'Wajah Terdeteksi ✓' : 'Arahkan wajah ke kamera...'}
                </div>
              )}

              <div
                className={`w-full h-[250px] rounded-3xl overflow-hidden border-4 ${kameraBorder} bg-[#fff8e1] flex items-center justify-center relative mb-4 transition-colors`}
              >
                {!fotoBase64 ? (
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover relative z-10"
                    style={{ transform: 'scaleX(-1)' }}
                    playsInline
                    muted
                  />
                ) : (
                  <img
                    src={fotoBase64}
                    className="w-full h-full object-cover relative z-20"
                    style={{ transform: 'scaleX(-1)' }}
                    alt="Preview"
                  />
                )}
              </div>

              {!fotoBase64 ? (
                <div className="w-full grid grid-cols-2 gap-3">
                  <button
                    onClick={tutupModal}
                    className="bg-gray-100 text-gray-500 font-black py-4 rounded-2xl active:scale-95 transition-transform"
                  >
                    Batal
                  </button>
                  <button
                    disabled={!jepretState.aktif}
                    onClick={jepretFoto}
                    className={`font-black py-4 rounded-2xl flex justify-center gap-2 active:scale-95 transition-all ${
                      jepretState.aktif
                        ? 'bg-[#3e2723] text-[#fbc02d] shadow-lg'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <i className="fa-solid fa-camera"></i> {jepretState.teks}
                  </button>
                </div>
              ) : (
                <div className="w-full grid grid-cols-2 gap-3">
                  <button
                    onClick={() => { setFotoBase64(null); nyalakanKamera(); }}
                    className="bg-gray-100 text-gray-500 font-black py-4 rounded-2xl active:scale-95 transition-transform"
                  >
                    <i className="fa-solid fa-rotate-right"></i> Ulangi
                  </button>
                  <button
                    onClick={kirimAbsen}
                    disabled={isKirimLoading}
                    className="bg-green-500 text-white font-black py-4 rounded-2xl shadow-lg flex justify-center gap-2 active:scale-95 transition-transform"
                  >
                    {isKirimLoading ? (
                      <i className="fa-solid fa-spinner fa-spin"></i>
                    ) : (
                      <i className="fa-solid fa-paper-plane"></i>
                    )}
                    {isKirimLoading ? 'Mengirim...' : 'Kirim'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal Detail */}
        {detailModal.show && (
          <div
            className="fixed inset-0 z-50 flex items-end"
            style={{ background: 'rgba(62,39,35,0.88)', backdropFilter: 'blur(4px)' }}
          >
            <div className="bg-white w-full max-w-sm mx-auto rounded-t-[2.5rem] flex flex-col items-center shadow-2xl p-6 h-[85vh]">
              <div className="w-14 h-1.5 bg-gray-200 rounded-full mb-4 shrink-0"></div>
              <h2 className="text-xl font-black text-[#3e2723] mb-1">
                {new Date(detailModal.tgl).toLocaleDateString('id-ID', {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                })}
              </h2>
              {(() => {
                const shiftName = detailModal.inData?.shift || detailModal.outData?.shift || '';
                const shiftInfo = getJamShift(shiftName, detailModal.tgl, user?.branch, masterShifts);
                const shiftLabel = getShiftKantor(new Date(detailModal.tgl), masterShifts, user?.branch) || 'Jadwal Kantor';
                return (
                  <div className="bg-[#fff8e1] border border-[#fbc02d]/30 rounded-xl px-4 py-2 mb-3 text-center">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wide">{shiftLabel}</p>
                    <p className="text-sm font-black text-[#3e2723]">{shiftInfo.in} – {shiftInfo.out}</p>
                  </div>
                );
              })()}

              <div className="w-full flex-1 overflow-y-auto pb-6 pt-2 flex flex-col gap-4">
                <div className="bg-green-50 p-4 rounded-3xl border border-green-100 flex flex-col">
                  <div className="self-start bg-green-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase mb-2 shadow-sm">
                    Absen Masuk
                  </div>
                  <p className="font-bold text-lg mb-2 text-green-800">
                    {detailModal.inData?.time
                      ? `Pukul: ${detailModal.inData.time.substring(11, 16)}`
                      : 'Belum Absen'}
                  </p>
                  <div className="w-full h-40 bg-gray-200 rounded-2xl overflow-hidden relative shadow-inner">
                    {detailModal.inData?.custom_foto_absen ? (
                      <img
                        src={prosesUrlFoto(detailModal.inData.custom_foto_absen)}
                        className="w-full h-full object-cover"
                        alt="IN"
                      />
                    ) : (
                      <p className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 font-bold">
                        Tidak ada foto
                      </p>
                    )}
                  </div>
                </div>

                <div className="bg-orange-50 p-4 rounded-3xl border border-orange-100 flex flex-col mt-2">
                  <div className="self-start bg-orange-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase mb-2 shadow-sm">
                    Absen Keluar
                  </div>
                  <p className="font-bold text-lg mb-2 text-orange-800">
                    {detailModal.outData?.time
                      ? `Pukul: ${detailModal.outData.time.substring(11, 16)}`
                      : 'Belum Absen'}
                  </p>
                  <div className="w-full h-40 bg-gray-200 rounded-2xl overflow-hidden relative shadow-inner">
                    {detailModal.outData?.custom_foto_absen ? (
                      <img
                        src={prosesUrlFoto(detailModal.outData.custom_foto_absen)}
                        className="w-full h-full object-cover"
                        alt="OUT"
                      />
                    ) : (
                      <p className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 font-bold">
                        Tidak ada foto
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setDetailModal({ show: false, tgl: '' })}
                className="w-full mt-2 bg-gray-100 text-gray-500 font-black py-4 rounded-2xl active:scale-95 transition-transform"
              >
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