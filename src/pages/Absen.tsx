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

interface OvertimeRecord {
  name: string;
  overtime_date: string;
  start_time: string;
  end_time: string;
  status: string;
  description?: string;
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

const isRamadhan = (tanggal?: Date): boolean => {
  const now   = tanggal || new Date();
  const tahun = now.getFullYear();
  const bulan = now.getMonth() + 1;
  const tgl   = now.getDate();
  const curr  = bulan * 100 + tgl;
  if (tahun === 2025 && curr >= 301  && curr <= 330)  return true;
  if (tahun === 2026 && curr >= 218  && curr <= 319)  return true;
  if (tahun === 2027 && curr >= 209  && curr <= 309)  return true;
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

const getJamShiftKantor = (tglDate: Date, satpam: boolean): { in: string; out: string } => {
  const hari     = tglDate.getDay();
  const isFriday = hari === 5;
  const ramadhan = isRamadhan(tglDate);

  const jamMasuk  = '07:30';
  const jamKeluar = isFriday ? '17:00' : '16:30';

  const jamMasukR  = '07:00';
  const jamKeluarR = isFriday ? '16:00' : '15:30';

  const baseIn  = ramadhan ? jamMasukR  : jamMasuk;
  const baseOut = ramadhan ? jamKeluarR : jamKeluar;

  if (satpam) {
    return { in: tambahMenit(baseIn, -30), out: tambahMenit(baseOut, 30) };
  }
  return { in: baseIn, out: baseOut };
};

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
  if (shiftFromRecord && !shiftFromRecord.includes('(') && !shiftFromRecord.includes(')')) return shiftLokal;
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

  if (isLokasiKlaten  && !isBranchKlaten)  return `Bukan lokasi kamu`;
  if (isLokasiJakarta && !isBranchJakarta) return `Bukan lokasi kamu`;
  return null;
};

const hitungJarak = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R    = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

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

const Absen = () => {
  const navigate      = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const BACKEND      = (import.meta as any).env?.VITE_API_URL || 'https://ropi-hr-backend.vercel.app';
  const LOKASI_FALLBACK: Lokasi[] = [{ nama: 'PH Klaten', lat: -7.6146229, lng: 110.6867057, radius: 70 }];

  const [user,          setUser]          = useState<User | null>(null);
  const [lokasiKantor,  setLokasiKantor]  = useState<Lokasi[]>(LOKASI_FALLBACK);
  const [dataRiwayat,   setDataRiwayat]   = useState<RiwayatAbsen[]>([]);
  const [bulanAktif,    setBulanAktif]    = useState(new Date().getMonth());
  const [tahunAktif,    setTahunAktif]    = useState(new Date().getFullYear());
  const [masterShifts,  setMasterShifts]  = useState<Record<string, { in: string; out: string }>>({});
  const [leaveRecords,  setLeaveRecords]  = useState<LeaveRecord[]>([]);
  const [overtimeRecords, setOvertimeRecords] = useState<OvertimeRecord[]>([]);
  const [lihatSemua,    setLihatSemua]    = useState(false);

  const [activeShift,   setActiveShift]   = useState<ActiveShift | null>(null);
  const [shiftLoading,  setShiftLoading]  = useState(false);
  const [shiftError,    setShiftError]    = useState<string | null>(null);

  const shiftLoadingRef = useRef(shiftLoading);
  useEffect(() => { shiftLoadingRef.current = shiftLoading; }, [shiftLoading]);
  const activeShiftRef = useRef(activeShift);
  useEffect(() => { activeShiftRef.current = activeShift; }, [activeShift]);

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
  const [jepretState,       setJepretState]       = useState({ aktif: false, teks: 'Cek Sistem...' });
  const [isKirimLoading,    setIsKirimLoading]    = useState(false);
  const [koordinatGPS,      setKoordinatGPS]      = useState<{ lat: number; lng: number } | null>(null);

  const [detailModal, setDetailModal] = useState<{
    show: boolean; tgl: string;
    inData?: RiwayatAbsen; outData?: RiwayatAbsen;
  }>({ show: false, tgl: '' });

  const [toastMsg, setToastMsg] = useState<{ show: boolean; type: 'success' | 'late'; title: string; desc: string } | null>(null);

  const videoRef           = useRef<HTMLVideoElement>(null);
  const streamRef          = useRef<MediaStream | null>(null);
  const intervalDeteksiRef = useRef<number | null>(null);
  const intervalJamRef     = useRef<number | null>(null);
  const cameraStepRef      = useRef(cameraStep);
  useEffect(() => { cameraStepRef.current = cameraStep; }, [cameraStep]);

  const outlet  = isKaryawanOutlet(user?.branch);
  const satpam  = isSatpam(user?.role);

  const stepsData = outlet
    ? [
        { n: 1, icon: 'fa-camera',      label: 'Wajah+Kanan' },
        { n: 2, icon: 'fa-hand',        label: 'Wajah+Kiri'  },
        { n: 3, icon: 'fa-paper-plane', label: 'Kirim'       },
      ]
    : [
        { n: 1, icon: 'fa-camera',      label: 'Selfie'  },
        { n: 3, icon: 'fa-paper-plane', label: 'Kirim' },
      ];

  useEffect(() => {
    const userData = localStorage.getItem('ropi_user');
    if (!userData) { navigate('/'); return; }
    const parsedUser: User = JSON.parse(userData);
    setUser(parsedUser);
    ambilMasterShift();

    if (isKaryawanOutlet(parsedUser.branch)) {
      // REVISI: Untuk outlet, aktif shift dulu → lalu ambil lokasi dari shift tersebut.
      // ambilLokasiKantor dipanggil SETELAH ambilActiveShift selesai (via callback).
      ambilActiveShiftDanLokasi(parsedUser.employee_id, parsedUser.branch);
    } else {
      // Kantor: pakai endpoint lokasi berbasis branch (tidak bergantung shift)
      ambilLokasiKantor(parsedUser.branch);
    }
  }, [navigate]);

  useEffect(() => {
    if (user) {
      ambilRiwayatAbsen();
      ambilRiwayatIzin(user.employee_id);
      ambilRiwayatLembur(user.employee_id);
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

  // ─────────────────────────────────────────────────────────────────
  // REVISI: ambilActiveShiftDanLokasi — satu fungsi gabungan untuk
  // karyawan outlet agar urutan fetch terjamin:
  //   1. Fetch active shift dari ERPNext (sudah ada)
  //   2. Dari nama shift yang aktif, fetch lokasi shift type
  //   3. Jika tidak dapat lokasi dari shift → fallback ke /api/locations
  // ─────────────────────────────────────────────────────────────────
  const ambilActiveShiftDanLokasi = async (empId: string, branch?: string) => {
    setShiftLoading(true);
    setShiftError(null);
    try {
      const res  = await fetch(`${BACKEND}/api/attendance/active-shift?employee_id=${encodeURIComponent(empId)}&_t=${Date.now()}`);
      const data = await res.json();

      if (data.success) {
        const shift: ActiveShift = {
          shift_name: data.shift_name,
          start_time: data.start_time,
          end_time:   data.end_time,
        };
        setActiveShift(shift);

        // REVISI: Setelah dapat shift_name, coba tarik lokasi dari
        // endpoint baru /api/attendance/shift-locations?shift_name=...
        // yang akan mengembalikan koordinat dari Shift Location ERPNext.
        const lokasiDariShift = await ambilLokasiDariShift(shift.shift_name, branch);
        if (lokasiDariShift.length > 0) {
          setLokasiKantor(lokasiDariShift);
        } else {
          // Fallback: coba endpoint lokasi lama berbasis branch
          await ambilLokasiKantor(branch);
        }
      } else {
        setShiftError(data.message || 'Belum ada Shift. Ajukan HRD.');
        // Tetap coba ambil lokasi walau belum ada shift aktif
        await ambilLokasiKantor(branch);
      }
    } catch {
      setShiftError('Gagal membaca shift.');
      await ambilLokasiKantor(branch);
    } finally {
      setShiftLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────
  // REVISI: Fungsi baru — ambil lokasi dari Shift Type ERPNext
  // Endpoint baru: GET /api/attendance/shift-locations?shift_name=...
  // Response: { success: true, locations: [{ nama, lat, lng, radius }] }
  // ─────────────────────────────────────────────────────────────────
  const ambilLokasiDariShift = async (shiftName: string, branch?: string): Promise<Lokasi[]> => {
    try {
      const res  = await fetch(
        `${BACKEND}/api/attendance/shift-locations?shift_name=${encodeURIComponent(shiftName)}&_t=${Date.now()}`
      );
      const data = await res.json();

      if (data.success && Array.isArray(data.locations) && data.locations.length > 0) {
        return data.locations as Lokasi[];
      }
      return [];
    } catch {
      return [];
    }
  };

  // ─────────────────────────────────────────────────────────────────
  // ambilLokasiKantor — tetap dipakai sebagai fallback untuk kantor
  // dan outlet yang shift-nya belum punya Shift Location di ERPNext
  // ─────────────────────────────────────────────────────────────────
  const ambilLokasiKantor = async (branch?: string) => {
    try {
      const url  = branch
        ? `${BACKEND}/api/locations/${encodeURIComponent(branch)}?_t=${Date.now()}`
        : `${BACKEND}/api/locations?_t=${Date.now()}`;
      const res  = await fetch(url);
      const data = await res.json();
      if (data.success && data.locations?.length > 0) setLokasiKantor(data.locations);
    } catch { console.warn('Pakai lokasi fallback'); }
  };

  // Fungsi ini sekarang hanya dipakai untuk karyawan outlet yang
  // perlu refresh manual shift (tanpa reload lokasi ulang).
  const ambilActiveShift = async (empId: string) => {
    setShiftLoading(true);
    setShiftError(null);
    try {
      const res  = await fetch(`${BACKEND}/api/attendance/active-shift?employee_id=${encodeURIComponent(empId)}&_t=${Date.now()}`);
      const data = await res.json();
      if (data.success) {
        setActiveShift({ shift_name: data.shift_name, start_time: data.start_time, end_time: data.end_time });
      } else {
        setShiftError(data.message || 'Belum ada Shift. Ajukan HRD.');
      }
    } catch {
      setShiftError('Gagal membaca shift.');
    } finally {
      setShiftLoading(false);
    }
  };

  const ambilRiwayatLembur = async (employeeId: string) => {
    try {
      const res  = await fetch(`${BACKEND}/api/attendance/overtime-history?employee_id=${employeeId}&_t=${Date.now()}`);
      const data = await res.json();
      if (data.success && data.data) setOvertimeRecords(data.data);
    } catch (e) { console.error(e); }
  };

  const ambilMasterShift = async () => {
    try {
      const res  = await fetch(`${BACKEND}/api/attendance/shifts?_t=${Date.now()}`);
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

  const ambilRiwayatAbsen = async () => {
    if (!user) return;
    try {
      const dari   = `${tahunAktif}-${String(bulanAktif + 1).padStart(2, '0')}-01`;
      const akhir  = new Date(tahunAktif, bulanAktif + 1, 0);
      const sampai = `${tahunAktif}-${String(bulanAktif + 1).padStart(2, '0')}-${String(akhir.getDate()).padStart(2, '0')}`;

      const res  = await fetch(`${BACKEND}/api/attendance?employee_id=${encodeURIComponent(user.employee_id)}&from=${dari}&to=${sampai}&_t=${Date.now()}`);
      const data = await res.json();
      if (data.success && data.data) setDataRiwayat(data.data);
      else setDataRiwayat([]);
    } catch { setDataRiwayat([]); }
  };

  const ambilRiwayatIzin = async (employeeId: string) => {
    try {
      const res  = await fetch(`${BACKEND}/api/attendance/leave-history?employee_id=${employeeId}&_t=${Date.now()}`);
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
    if (outlet && shiftLoadingRef.current) {
      await new Promise<void>(resolve => {
        let waited = 0;
        const check = setInterval(() => {
          waited += 300;
          if (!shiftLoadingRef.current || waited >= 6000) {
            clearInterval(check);
            resolve();
          }
        }, 300);
      });
    }

    if (outlet && !activeShiftRef.current) {
      alert('⚠️ Shift kamu hari ini belum diatur/di-ACC oleh HRD. Silakan ajukan shift atau hubungi HRD terlebih dahulu.');
      return;
    }

    setModeAbsen(mode);
    setFotoBase64(null);
    setFotoKiriBase64(null);
    setCameraStep(1);
    setIsModalAbsenOpen(true);
    setKameraBorder('border-[#fbc02d]');
    setWajahStatus({ show: false, ok: false });
    setGpsStatus({ tipe: 'loading', pesan: 'Mendeteksi koordinat GPS...' });
    setJepretState({ aktif: false, teks: 'Loading...' });
    setNamaLokasi('Mendeteksi...');

    intervalJamRef.current = window.setInterval(() => setJamModal(new Date().toLocaleTimeString('id-ID')), 1000);

    const MAX_AKURASI = 300;
    const RADIUS_MIN  = 100;

    navigator.geolocation.getCurrentPosition(
      async pos => {
        const coords  = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const akurasi = pos.coords.accuracy;
        setKoordinatGPS(coords);

        let terdekat = { valid: false, nama: '?', jarak: Infinity, radius: 100 };
        for (const k of lokasiKantor) {
          const r     = Math.max(k.radius, RADIUS_MIN);
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
          const errorBranch = cekBranchVsLokasi(user?.branch, terdekat.nama);

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
          let pesanError = `Kamu di luar area (${terdekat.jarak}m, maks ${terdekat.radius}m)`;
          if (akurasi > MAX_AKURASI) pesanError = `Sinyal GPS lemah, pindah ke area terbuka`;

          setGpsStatus({ tipe: 'error', pesan: pesanError });
          setJepretState({ aktif: false, teks: 'Ditolak' });
        }
      },
      async () => {
        setNamaLokasi('GPS Nonaktif');
        setGpsStatus({ tipe: 'error', pesan: 'Izinkan akses lokasi di browser' });
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
      const videoRatio  = video.videoWidth / video.videoHeight;
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
        setKameraBorder('border-gray-200');
      }
    } else if (cameraStep === 2) {
      setFotoKiriBase64(base64);
      if (intervalDeteksiRef.current) window.clearInterval(intervalDeteksiRef.current);
      matikanKamera();
      setCameraStep(3);
      setKameraBorder('border-gray-200');
    }
  };

  const kirimAbsen = async () => {
    if (!fotoBase64 || (!fotoKiriBase64 && outlet) || !user) return;
    setIsKirimLoading(true);

    const namaShiftKirim = outlet
      ? activeShiftRef.current?.shift_name || ''
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
          shift:                     namaShiftKirim,
        }),
      });

      if (res.ok) {
        tutupModal();

        const nowUtc  = new Date();
        const wibTime = new Date(nowUtc.getTime() + 7 * 60 * 60 * 1000);
        const yyyy    = wibTime.getUTCFullYear();
        const mm      = String(wibTime.getUTCMonth() + 1).padStart(2, '0');
        const dd      = String(wibTime.getUTCDate()).padStart(2, '0');
        const tglStr  = `${yyyy}-${mm}-${dd}`;

        const jamSekarang = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(/\./g, ':');

        if (modeAbsen === 'MASUK') {
          const shiftInfo  = getJamShift(namaShiftKirim, tglStr, user.branch, user.role, masterShifts, activeShiftRef.current);
          const selisih    = toMenit(jamSekarang) - toMenit(shiftInfo.in);

          if (selisih > 0) {
            const isAlreadyCounted = dataRiwayat.some(r => r.log_type === 'IN' && (r.time?.includes(tglStr) || r.attendance_date?.includes(tglStr)));
            const finalTelatCount  = isAlreadyCounted ? rekapTelat : rekapTelat + 1;

            setToastMsg({
              show: true,
              type: 'late',
              title: 'Kamu Terlambat!',
              desc: `Masuk telat ${formatDurasi(selisih)} hari ini. (Total ${finalTelatCount}x telat bulan ini)`
            });
          } else {
            setToastMsg({
              show: true, type: 'success', title: 'Absen Masuk Berhasil', desc: 'Kamu datang tepat waktu. Semangat bekerja!'
            });
          }
        } else {
          setToastMsg({
            show: true, type: 'success', title: 'Absen Keluar Berhasil', desc: 'Hati-hati di jalan pulang, selamat beristirahat!'
          });
        }

        setTimeout(() => setToastMsg(null), 8000);
        ambilRiwayatAbsen();
      } else {
        const errData = await res.json().catch(() => null);
        const errMsg  = errData?.message || 'Absen gagal dikirim ke sistem.';

        if (errMsg.length > 100) {
          alert('Terjadi kesalahan pada sistem. Silakan coba lagi atau lapor admin.\n\nDetail:\n' + errMsg.substring(0, 150) + '...');
        } else {
          alert(errMsg);
        }
      }
    } catch { alert('Gagal konek ke server.'); }

    setIsKirimLoading(false);
  };

  const groupedRiwayat: Record<string, { in?: RiwayatAbsen; out?: RiwayatAbsen }> = {};
  dataRiwayat.forEach(item => {
    const tgl = item.time?.substring(0, 10) || item.attendance_date || '';
    if (!groupedRiwayat[tgl]) groupedRiwayat[tgl] = {};

    if (item.log_type === 'IN') {
      const curr = groupedRiwayat[tgl].in;
      if (!curr) {
        groupedRiwayat[tgl].in = item;
      } else {
        const currHasPic = !!curr.custom_foto_absen;
        const itemHasPic = !!item.custom_foto_absen;
        if (!currHasPic && itemHasPic) {
          groupedRiwayat[tgl].in = item;
        } else if (currHasPic === itemHasPic && item.time && curr.time && item.time < curr.time) {
          groupedRiwayat[tgl].in = item;
        }
      }
    }

    if (item.log_type === 'OUT') {
      const curr = groupedRiwayat[tgl].out;
      if (!curr) {
        groupedRiwayat[tgl].out = item;
      } else {
        const currHasPic = !!curr.custom_foto_absen;
        const itemHasPic = !!item.custom_foto_absen;
        if (!currHasPic && itemHasPic) {
          groupedRiwayat[tgl].out = item;
        } else if (currHasPic === itemHasPic && item.time && curr.time && item.time > curr.time) {
          groupedRiwayat[tgl].out = item;
        }
      }
    }
  });

  let rekapTelat = 0;
  const rekapHadir = Object.keys(groupedRiwayat).length;
  Object.entries(groupedRiwayat).forEach(([tgl, d]) => {
    if (d.in?.time) {
      const jamAbsen  = formatJamLokal(d.in.time);
      const shiftInfo = getJamShift(d.in.shift, tgl, user?.branch, user?.role, masterShifts, activeShift);
      if (toMenit(jamAbsen) > toMenit(shiftInfo.in)) rekapTelat++;
    }
  });

  const rekapIzin  = hitungHariKerjaDalamBulan(leaveRecords, r => !r.leave_type.toLowerCase().includes('tahunan') && r.status?.toLowerCase() === 'approved', tahunAktif, bulanAktif);
  const rekapCuti  = hitungHariKerjaDalamBulan(leaveRecords, r =>  r.leave_type.toLowerCase().includes('tahunan') && r.status?.toLowerCase() === 'approved', tahunAktif, bulanAktif);

  const rekapLemburMenit = overtimeRecords.reduce((acc, r) => {
    if (r.status.toLowerCase() === 'approved') {
      const d = parseLokalDate(r.overtime_date);
      if (d.getMonth() === bulanAktif && d.getFullYear() === tahunAktif) {
        const diff = toMenit(r.end_time) - toMenit(r.start_time);
        return acc + (diff > 0 ? diff : 0);
      }
    }
    return acc;
  }, 0);

  const tanggalIzinSet = new Set<string>();
  const tanggalCutiSet = new Set<string>();

  leaveRecords.forEach(r => {
    if (r.status?.toLowerCase() !== 'approved') return;

    const isCuti = r.leave_type.toLowerCase().includes('tahunan');
    const from = parseLokalDate(r.from_date);
    const to   = parseLokalDate(r.to_date);
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (isCuti) {
        tanggalCutiSet.add(dateStr);
      } else {
        tanggalIzinSet.add(dateStr);
      }
    }
  });

  const sortedTglKeys = Object.keys(groupedRiwayat).sort((a, b) => b.localeCompare(a));
  const tampilKeys    = lihatSemua ? sortedTglKeys : sortedTglKeys.slice(0, 5);

  const renderKalender = () => {
    const hariPertama = new Date(tahunAktif, bulanAktif, 1).getDay();
    const totalHari   = new Date(tahunAktif, bulanAktif + 1, 0).getDate();
    const blanks      = Array.from({ length: hariPertama }, (_, i) => <div key={`b-${i}`} />);
    const days        = Array.from({ length: totalHari }, (_, i) => {
      const d         = i + 1;
      const isHariIni = d === new Date().getDate() && bulanAktif === new Date().getMonth() && tahunAktif === new Date().getFullYear();
      const strTgl    = `${tahunAktif}-${String(bulanAktif + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dataIn    = groupedRiwayat[strTgl]?.in;
      const checkin   = dataIn?.time;
      const adaIzin   = tanggalIzinSet.has(strTgl);
      const adaCuti   = tanggalCutiSet.has(strTgl);
      let kelas = 'w-7 h-7 flex items-center justify-center mx-auto rounded-full text-xs relative ';

      let dot: React.ReactNode = null;
      if (isHariIni) {
        kelas += 'bg-[#3e2723] text-[#fbc02d] font-black';
      } else if (adaCuti && !checkin) {
        kelas += 'bg-teal-100 text-teal-700 font-bold';
        dot = <span className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-teal-400" />;
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
    if (url.startsWith('/files') || url.startsWith('/private')) return `${BACKEND}/api/attendance/file?path=${encodeURIComponent(url)}`;
    if (url.startsWith('http')) return url;
    return url;
  };

  return (
    <div className="bg-gray-100 flex items-center justify-center min-h-screen font-sans text-[#3e2723] selection:bg-[#fbc02d] md:p-6 lg:p-10 w-full overflow-hidden relative">
      <style>{`.hide-scrollbar::-webkit-scrollbar{display:none}.hide-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
      @keyframes bounceIn {
        0% { opacity: 0; transform: translateY(-30px) scale(0.9); }
        50% { opacity: 1; transform: translateY(5px) scale(1.02); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      .animate-bounceIn { animation: bounceIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>

      {/* ── TOAST POPUP NOTIFIKASI ── */}
      {toastMsg && (
        <div className="fixed top-6 left-0 w-full flex justify-center z-[9999] pointer-events-none px-4">
          <div className={`pointer-events-auto animate-bounceIn w-full max-w-sm flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border-2 ${
            toastMsg.type === 'late'
              ? 'bg-[#dc2626] border-[#ef4444] shadow-red-600/50'
              : 'bg-[#16a34a] border-[#22c55e] shadow-green-600/50'
          }`}>
            <div className="shrink-0 flex items-center justify-center">
               <i className={`fa-solid ${toastMsg.type === 'late' ? 'fa-triangle-exclamation text-3xl animate-pulse text-yellow-300' : 'fa-circle-check text-3xl text-white'}`}></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-white uppercase tracking-wider leading-tight drop-shadow-sm">{toastMsg.title}</p>
              <p className="text-[11px] font-medium text-white/90 mt-0.5 leading-snug">{toastMsg.desc}</p>
            </div>
            <button onClick={() => setToastMsg(null)} className="shrink-0 text-white/60 hover:text-white active:scale-95 p-1 ml-1 transition-colors">
               <i className="fa-solid fa-xmark text-xl"></i>
            </button>
          </div>
        </div>
      )}

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

              {/* Status Badge Khusus Outlet */}
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

              {/* HEADER PROPORSIONAL (1 BARIS SAJA DENGAN 5 KOLOM) */}
              <div className="mt-4 grid grid-cols-5 gap-1.5">
                {[
                  { label: 'Hadir',  value: rekapHadir,                   color: 'text-green-400'  },
                  { label: 'Telat',  value: rekapTelat,                   color: 'text-red-400'    },
                  { label: 'Izin',   value: rekapIzin,                    color: 'text-blue-300'   },
                  { label: 'Cuti',   value: rekapCuti,                    color: 'text-teal-400'   },
                  { label: 'Lembur', value: formatDurasi(rekapLemburMenit), color: 'text-purple-400' },
                ].map(item => (
                  <div key={item.label} className="bg-white/10 rounded-xl py-2 px-1 flex flex-col justify-center items-center text-center overflow-hidden">
                    <p className={`text-sm font-black ${item.color} truncate w-full`}>{item.value}</p>
                    <p className="text-[8px] font-black text-white/60 uppercase tracking-wide mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* KONTEN */}
            <div className="flex-1 overflow-y-auto pb-24 pt-4 hide-scrollbar">

              {/* Kalender mini */}
              <div className="px-6 mb-4">
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <div className="grid grid-cols-7 text-center text-[9px] font-black text-gray-400 mb-1.5">
                    {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map(h => <div key={h}>{h}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-y-0.5 text-center">{renderKalender()}</div>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    {[
                      { color: 'bg-green-400', label: 'Tepat' },
                      { color: 'bg-red-400',   label: 'Telat' },
                      { color: 'bg-blue-400',  label: 'Izin'  },
                      { color: 'bg-teal-400',  label: 'Cuti'  },
                    ].map(l => (
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
                        const adaCutiHariIni = tanggalCutiSet.has(tgl);
                        const dateLabel  = tglDate.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });

                        const lemburHariIni = overtimeRecords.find(o => o.overtime_date === tgl && o.status?.toLowerCase() === 'approved');

                        let badgeLembur: React.ReactNode = null;
                        if (lemburHariIni) {
                          const durasi = toMenit(lemburHariIni.end_time) - toMenit(lemburHariIni.start_time);
                          badgeLembur = <span className="bg-purple-100 text-purple-600 text-[10px] font-black px-2 py-1 rounded-md shadow-sm border border-purple-200">Lembur {formatDurasi(durasi)}</span>;
                        }

                        let badgeEl: React.ReactNode = null;
                        if (jamIn !== '-') {
                          const isTelat = toMenit(jamIn) > toMenit(shiftInfo.in);
                          badgeEl = (
                            <span className={`text-[10px] font-black px-2 py-1 rounded-md shadow-sm border ${isTelat ? 'bg-red-50 text-red-500 border-red-200' : 'bg-green-50 text-green-600 border-green-200'}`}>
                              {isTelat ? `Telat ${formatDurasi(toMenit(jamIn) - toMenit(shiftInfo.in))}` : 'Tepat Waktu'}
                            </span>
                          );
                        }

                        return (
                          <button
                            key={tgl}
                            onClick={() => bukaDetail(tgl)}
                            className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 text-left active:scale-[0.98] transition-transform hover:border-[#fbc02d]/50"
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div>
                                <p className="text-xs font-black text-[#3e2723]">{dateLabel}</p>
                                <p className="text-[10px] text-gray-400 font-bold mt-0.5 truncate max-w-[140px]">{shiftLabel}</p>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                {badgeEl}
                                {badgeLembur}
                                {adaIzinHariIni && !d.in && <span className="bg-blue-50 text-blue-600 text-[10px] font-black px-2 py-1 rounded-md border border-blue-200">Izin</span>}
                                {adaCutiHariIni && !d.in && <span className="bg-teal-50 text-teal-600 text-[10px] font-black px-2 py-1 rounded-md border border-teal-200">Cuti</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                                  <i className="fa-solid fa-right-to-bracket text-green-600 text-[8px]" />
                                </div>
                                <span className="text-xs font-black text-[#3e2723]">{jamIn}</span>
                                <span className="text-[9px] text-gray-400">({shiftInfo.in})</span>
                              </div>
                              <i className="fa-solid fa-arrow-right text-gray-300 text-[8px]" />
                              <div className="flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                                  <i className="fa-solid fa-right-from-bracket text-orange-500 text-[8px]" />
                                </div>
                                <span className="text-xs font-black text-[#3e2723]">{jamOut}</span>
                                <span className="text-[9px] text-gray-400">({shiftInfo.out})</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}

                      {sortedTglKeys.length > 5 && (
                        <button
                          onClick={() => setLihatSemua(!lihatSemua)}
                          className="w-full bg-white border border-dashed border-gray-200 rounded-2xl py-3 text-xs font-black text-gray-400 hover:border-[#fbc02d] hover:text-[#3e2723] transition-colors"
                        >
                          {lihatSemua ? 'Sembunyikan' : `Lihat Semua (${sortedTglKeys.length})`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <BottomNav />
          </div>
        </div>
      </div>

      {/* ── MODAL ABSEN ── */}
      {isModalAbsenOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4">
          <div className="w-full md:max-w-sm bg-white md:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">

            {/* Modal Header */}
            <div className={`shrink-0 px-5 pt-5 pb-4 ${modeAbsen === 'MASUK' ? 'bg-[#3e2723]' : 'bg-orange-700'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${modeAbsen === 'MASUK' ? 'bg-green-400/20 text-green-400' : 'bg-orange-300/20 text-orange-300'}`}>
                    <i className={`fa-solid ${modeAbsen === 'MASUK' ? 'fa-right-to-bracket' : 'fa-right-from-bracket'} text-sm`} />
                  </div>
                  <div>
                    <h2 className="text-white font-black text-base leading-tight">Absen {modeAbsen}</h2>
                    <p className="text-white/60 text-[10px] font-bold">{jamModal}</p>
                  </div>
                </div>
                <button onClick={tutupModal} className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 active:scale-95 transition-all">
                  <i className="fa-solid fa-xmark text-sm" />
                </button>
              </div>

              {/* Step indicator */}
              <div className="flex items-center gap-2">
                {stepsData.map((step, idx) => {
                  const done    = cameraStep > step.n;
                  const current = cameraStep === step.n;
                  return (
                    <React.Fragment key={step.n}>
                      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all ${
                        done    ? 'bg-green-400/20 text-green-400' :
                        current ? 'bg-white/20 text-white' :
                                  'bg-white/5 text-white/30'
                      }`}>
                        <i className={`fa-solid ${done ? 'fa-check' : step.icon} text-[10px]`} />
                        <span className="text-[10px] font-black">{step.label}</span>
                      </div>
                      {idx < stepsData.length - 1 && <div className="flex-1 h-px bg-white/10" />}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto hide-scrollbar">

              {/* GPS Status */}
              <div className={`mx-4 mt-4 px-4 py-2.5 rounded-2xl flex items-center gap-2 text-xs font-bold ${
                gpsStatus.tipe === 'ok'      ? 'bg-green-50 text-green-700 border border-green-200' :
                gpsStatus.tipe === 'error'   ? 'bg-red-50 text-red-600 border border-red-200' :
                                               'bg-gray-50 text-gray-500 border border-gray-200'
              }`}>
                <i className={`fa-solid ${
                  gpsStatus.tipe === 'ok'    ? 'fa-location-dot text-green-500' :
                  gpsStatus.tipe === 'error' ? 'fa-triangle-exclamation text-red-400' :
                                               'fa-spinner fa-spin text-gray-400'
                } text-sm shrink-0`} />
                <span className="leading-tight">{gpsStatus.pesan}</span>
              </div>

              {/* Kamera (step 1 & 2) */}
              {(cameraStep === 1 || cameraStep === 2) && (
                <div className="px-4 pt-4 flex flex-col gap-3">
                  {cameraStep === 2 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-2.5 flex items-center gap-2">
                      <i className="fa-solid fa-hand text-blue-500 text-sm" />
                      <p className="text-xs font-bold text-blue-700">Sekarang foto dari sisi <span className="font-black">kiri</span> wajahmu</p>
                    </div>
                  )}

                  <div className={`relative rounded-2xl overflow-hidden border-4 ${kameraBorder} transition-colors shadow-sm bg-black aspect-[3/4]`}>
                    <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline style={{ transform: 'scaleX(-1)' }} />

                    {wajahStatus.show && (
                      <div className={`absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-black ${
                        wajahStatus.ok ? 'bg-green-500 text-white' : 'bg-orange-400 text-white'
                      }`}>
                        <i className={`fa-solid ${wajahStatus.ok ? 'fa-face-smile' : 'fa-face-frown'} text-xs`} />
                        {wajahStatus.ok ? 'Wajah Terdeteksi' : 'Cari Wajah...'}
                      </div>
                    )}

                    <div className="absolute bottom-3 left-3 right-3">
                      <button
                        onClick={jepretFoto}
                        disabled={!jepretState.aktif}
                        className={`w-full py-3 rounded-xl font-black text-sm transition-all active:scale-95 flex items-center justify-center gap-2 ${
                          jepretState.aktif
                            ? 'bg-[#fbc02d] text-[#3e2723] shadow-lg'
                            : 'bg-black/50 text-white/50 cursor-not-allowed'
                        }`}
                      >
                        <i className="fa-solid fa-camera" />
                        {jepretState.teks}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview & Kirim (step 3) */}
              {cameraStep === 3 && (
                <div className="px-4 pt-4 flex flex-col gap-4">
                  {outlet ? (
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Wajah + Kanan', src: fotoBase64 },
                        { label: 'Wajah + Kiri',  src: fotoKiriBase64 },
                      ].map(({ label, src }) => (
                        <div key={label} className="flex flex-col gap-1">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide pl-1 text-center">{label}</p>
                          <div className="rounded-2xl overflow-hidden bg-black border border-gray-200 shadow-sm aspect-[3/4]">
                            {src && <img src={src} className="w-full h-full object-contain" alt={label} />}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="max-w-[200px] mx-auto w-full">
                      <div className="rounded-2xl overflow-hidden bg-black border border-gray-200 shadow-sm aspect-[3/4]">
                        {fotoBase64 && <img src={fotoBase64} className="w-full h-full object-contain" alt="Selfie" />}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => { setCameraStep(1); setFotoBase64(null); setFotoKiriBase64(null); nyalakanKamera(); }}
                      className="flex-1 bg-gray-100 text-gray-600 font-black py-3.5 rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 text-sm"
                    >
                      <i className="fa-solid fa-rotate-left" /> Ulangi
                    </button>
                    <button
                      onClick={kirimAbsen}
                      disabled={isKirimLoading}
                      className={`flex-1 font-black py-3.5 rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2 text-sm shadow-lg ${
                        isKirimLoading ? 'bg-gray-200 text-gray-400' : 'bg-[#3e2723] text-[#fbc02d]'
                      }`}
                    >
                      {isKirimLoading
                        ? <><i className="fa-solid fa-spinner fa-spin" /> Mengirim...</>
                        : <><i className="fa-solid fa-paper-plane" /> Kirim</>
                      }
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DETAIL ── */}
      {detailModal.show && (() => {
        const lemburHariIniData = overtimeRecords.find(o => o.overtime_date === detailModal.tgl && o.status?.toLowerCase() === 'approved');
        const dIn  = detailModal.inData;
        const dOut = detailModal.outData;
        const hasVerifImage = !!(dIn?.custom_verification_image || dOut?.custom_verification_image);

        const jamIn      = formatJamLokal(dIn?.time);
        const jamOut     = formatJamLokal(dOut?.time);
        const shiftInfo  = getJamShift(dIn?.shift || dOut?.shift, detailModal.tgl, user?.branch, user?.role, masterShifts, activeShift);
        const shiftLabel = validasiShiftName(dIn?.shift || dOut?.shift, detailModal.tgl, user?.branch, user?.role, activeShift);
        const tglDate    = parseLokalDate(detailModal.tgl);
        const tglLabel   = tglDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

        const durasiKerja = (jamIn !== '-' && jamOut !== '-')
          ? Math.max(0, toMenit(jamOut) - toMenit(jamIn))
          : null;

        return (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm p-0 md:p-4">
            <div className="w-full md:max-w-sm bg-white md:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">

              <div className="bg-[#3e2723] px-5 pt-5 pb-4 shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-white font-black text-base">{tglLabel}</h2>
                    <p className="text-white/60 text-[10px] font-bold mt-0.5">{shiftLabel}</p>
                  </div>
                  <button onClick={() => setDetailModal({ show: false, tgl: '' })} className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20">
                    <i className="fa-solid fa-xmark text-sm" />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    { label: 'Masuk',  value: jamIn,  sub: shiftInfo.in,  icon: 'fa-right-to-bracket',   color: 'text-green-400'  },
                    { label: 'Keluar', value: jamOut, sub: shiftInfo.out, icon: 'fa-right-from-bracket', color: 'text-orange-400' },
                    { label: 'Durasi', value: durasiKerja !== null ? formatDurasi(durasiKerja) : '-', sub: 'jam kerja', icon: 'fa-clock', color: 'text-blue-300' },
                  ].map(item => (
                    <div key={item.label} className="bg-white/10 rounded-xl p-2.5 text-center">
                      <i className={`fa-solid ${item.icon} ${item.color} text-xs mb-1 block`} />
                      <p className={`text-sm font-black ${item.color}`}>{item.value}</p>
                      <p className="text-[9px] text-white/50 font-bold">({item.sub})</p>
                      <p className="text-[8px] text-white/40 uppercase tracking-wide mt-0.5">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-6 bg-gray-50">

                {lemburHariIniData && (
                  <div className="bg-purple-50 border border-purple-200 rounded-3xl px-4 py-3 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-purple-600 font-bold text-[10px] uppercase">
                      <i className="fa-solid fa-business-time" /> Disetujui Lembur
                    </div>
                    <p className="text-sm font-black text-purple-800">
                      {formatDurasi(toMenit(lemburHariIniData.end_time) - toMenit(lemburHariIniData.start_time))}
                      <span className="text-xs font-bold text-purple-500 ml-1">({lemburHariIniData.start_time.substring(0, 5)} - {lemburHariIniData.end_time.substring(0, 5)})</span>
                    </p>
                    <p className="text-[10px] text-purple-600 leading-snug italic">"{lemburHariIniData.description}"</p>
                  </div>
                )}

                {hasVerifImage ? (
                  <div className="flex flex-col gap-6 w-full">
                    <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 flex flex-col gap-3">
                      <div className="flex items-center gap-2 border-b border-gray-50 pb-2">
                        <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center shrink-0"><i className="fa-solid fa-camera text-blue-500 text-[10px]" /></div>
                        <p className="text-xs font-black text-[#3e2723] uppercase tracking-wider">Foto Masuk</p>
                      </div>
                      <div className="flex overflow-x-auto gap-4 pb-2 snap-x snap-mandatory hide-scrollbar">
                        <div className="flex flex-col gap-1 w-full max-w-[240px] mx-auto shrink-0 snap-center">
                          <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide pl-1 text-center">Wajah + Kanan</p>
                          <div className="relative rounded-2xl overflow-hidden bg-black border border-gray-200 shadow-sm flex items-center justify-center aspect-[3/4]">
                            {dIn?.custom_foto_absen
                              ? <img src={prosesUrlFoto(dIn.custom_foto_absen)} className="w-full h-full object-contain" alt="Kanan Masuk" loading="lazy" decoding="async" />
                              : <div className="absolute inset-0 flex flex-col items-center justify-center gap-1"><i className="fa-solid fa-image-slash text-2xl text-gray-500" /><p className="text-[10px] text-gray-500 font-bold">Tidak ada foto</p></div>
                            }
                            <div className="absolute top-2 left-2 bg-green-500 text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-sm border border-white/20">Masuk</div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 w-full max-w-[240px] mx-auto shrink-0 snap-center">
                          <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide pl-1 text-center">Wajah + Kiri</p>
                          <div className="relative rounded-2xl overflow-hidden bg-black border border-gray-200 shadow-sm flex items-center justify-center aspect-[3/4]">
                            {dIn?.custom_verification_image
                              ? <img src={prosesUrlFoto(dIn.custom_verification_image)} className="w-full h-full object-contain" alt="Kiri Masuk" loading="lazy" decoding="async" />
                              : <div className="absolute inset-0 flex flex-col items-center justify-center gap-1"><i className="fa-solid fa-image-slash text-2xl text-gray-500" /><p className="text-[10px] text-gray-500 font-bold">Tidak ada foto</p></div>
                            }
                            <div className="absolute top-2 left-2 bg-green-500 text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-sm border border-white/20">Masuk</div>
                          </div>
                        </div>
                      </div>
                      <p className="text-[9px] text-center text-gray-400 italic">Geser untuk melihat semua foto Masuk →</p>
                    </div>

                    {dOut && (
                      <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 flex flex-col gap-3">
                        <div className="flex items-center gap-2 border-b border-gray-50 pb-2">
                          <div className="w-6 h-6 rounded-full bg-orange-50 flex items-center justify-center shrink-0"><i className="fa-solid fa-camera text-orange-500 text-[10px]" /></div>
                          <p className="text-xs font-black text-[#3e2723] uppercase tracking-wider">Foto Keluar</p>
                        </div>
                        <div className="flex overflow-x-auto gap-4 pb-2 snap-x snap-mandatory hide-scrollbar">
                          <div className="flex flex-col gap-1 w-full max-w-[240px] mx-auto shrink-0 snap-center">
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide pl-1 text-center">Wajah + Kanan</p>
                            <div className="relative rounded-2xl overflow-hidden bg-black border border-gray-200 shadow-sm flex items-center justify-center aspect-[3/4]">
                              {dOut?.custom_foto_absen
                                ? <img src={prosesUrlFoto(dOut.custom_foto_absen)} className="w-full h-full object-contain" alt="Kanan Keluar" loading="lazy" decoding="async" />
                                : <div className="absolute inset-0 flex flex-col items-center justify-center gap-1"><i className="fa-solid fa-image-slash text-2xl text-gray-500" /><p className="text-[10px] text-gray-500 font-bold">Tidak ada foto</p></div>
                              }
                              <div className="absolute top-2 left-2 bg-orange-500 text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-sm border border-white/20">Keluar</div>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 w-full max-w-[240px] mx-auto shrink-0 snap-center">
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide pl-1 text-center">Wajah + Kiri</p>
                            <div className="relative rounded-2xl overflow-hidden bg-black border border-gray-200 shadow-sm flex items-center justify-center aspect-[3/4]">
                              {dOut?.custom_verification_image
                                ? <img src={prosesUrlFoto(dOut.custom_verification_image)} className="w-full h-full object-contain" alt="Kiri Keluar" loading="lazy" decoding="async" />
                                : <div className="absolute inset-0 flex flex-col items-center justify-center gap-1"><i className="fa-solid fa-image-slash text-2xl text-gray-500" /><p className="text-[10px] text-gray-500 font-bold">Tidak ada foto</p></div>
                              }
                              <div className="absolute top-2 left-2 bg-orange-500 text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-sm border border-white/20">Keluar</div>
                            </div>
                          </div>
                        </div>
                        <p className="text-[9px] text-center text-gray-400 italic">Geser untuk melihat semua foto Keluar →</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start w-full">
                    <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 col-span-full">
                      <div className="flex items-center gap-2 mb-3 border-b border-gray-50 pb-2">
                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><i className="fa-solid fa-camera text-gray-500 text-[10px]" /></div>
                        <p className="text-xs font-black text-[#3e2723] uppercase tracking-wider">Selfie Wajah</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {[{ label: 'Masuk', data: dIn, badgeCol: 'bg-green-500' }, { label: 'Keluar', data: dOut, badgeCol: 'bg-orange-500' }].map(({ label, data, badgeCol }) => (
                          <div key={label} className="flex flex-col gap-1.5">
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide pl-1 text-center">{label}</p>
                            <div className="relative rounded-2xl overflow-hidden bg-black border border-gray-200 shadow-sm flex items-center justify-center aspect-[3/4]">
                              {data?.custom_foto_absen
                                ? <img src={prosesUrlFoto(data.custom_foto_absen)} className="w-full h-full object-contain" alt={label} loading="lazy" decoding="async" />
                                : <div className="absolute inset-0 flex flex-col items-center justify-center gap-1"><i className="fa-solid fa-image-slash text-2xl text-gray-500" /><p className="text-[10px] text-gray-500 font-bold">Belum ada</p></div>
                              }
                              <div className={`absolute top-2 left-2 ${badgeCol} text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-sm border border-white/20`}>{label}</div>
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
  );
};

export default Absen;