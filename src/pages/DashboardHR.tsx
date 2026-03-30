import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import * as XLSX from 'xlsx'; 

interface RiwayatAbsen {
  name: string;
  employee: string;
  employee_name?: string;
  time: string;
  attendance_date?: string;
  log_type: string;
  custom_foto_absen?: string;
  custom_verification_image?: string;
  custom_signature?: string;
  shift?: string;
  latitude?: string;
  longitude?: string;
}

interface DayLog {
  in: RiwayatAbsen | null;
  out: RiwayatAbsen | null;
}

interface EmployeeSummary {
  employee: string;
  employee_name: string;
  totalHadir: number;
  totalTelat: number;
  totalCepat: number;
  totalIzin: number;
  branch: string; 
  logsByDate: Record<string, DayLog>;
}

interface Lokasi {
  nama: string;
  lat: number;
  lng: number;
  radius: number;
}

interface LeaveRequest {
  name: string;
  employee: string;
  employee_name: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  description: string;
  status: string;
  total_leave_days: number;
  attachment?: string;
  [key: string]: any;
}

// ── HELPER ──
const formatJamLokal = (timeString?: string) => {
  if (!timeString) return '-';
  const parts = timeString.split(' ');
  if (parts.length > 1) return parts[1].substring(0, 5);
  if (timeString.includes(':')) return timeString.substring(0, 5); 
  return '-';
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

const parseLokalDate = (tglStr: string): Date => {
  if (!tglStr) return new Date();
  const parts = tglStr.split(' ')[0].split('-');
  const [y, m, d] = parts.map(Number);
  return new Date(y, m - 1, d);
};

// LOGIKA RAMADHAN 
const isRamadhan = (tanggalStr: string, ramadhanDates: string[]): boolean => {
  if (ramadhanDates.includes(tanggalStr)) return true;

  const d = parseLokalDate(tanggalStr);
  const tahun = d.getFullYear();
  const bulan = d.getMonth() + 1; 
  const tgl = d.getDate();
  
  if (tahun === 2025 && bulan === 3 && tgl >= 1 && tgl <= 30) return true;
  if (tahun === 2026) {
    if (bulan === 2 && tgl >= 19) return true; 
    if (bulan === 3 && tgl <= 21) return true; 
  }
  if (tahun === 2027) {
    if (bulan === 2 && tgl >= 8) return true;
    if (bulan === 3 && tgl <= 9) return true;
  }
  return false;
};

const getShiftLabel = (tanggal: string, ramadhanDates: string[]): string => {
  const tglDate = parseLokalDate(tanggal);
  const hari = tglDate.getDay();
  if (hari === 0 || hari === 6) return 'Libur';
  const isFriday = hari === 5;
  const ramadhan = isRamadhan(tanggal, ramadhanDates);
  const hariLabel = isFriday ? 'Jumat' : 'Senin - Kamis';
  const periodeLabel = ramadhan ? 'Ramadhan' : 'Non Ramadhan';
  return `${hariLabel} (PH Klaten ${periodeLabel})`;
};

const getJamShift = (
  shiftNameFromRecord: string | undefined,
  tanggal: string,
  masterShifts: Record<string, { in: string; out: string }>,
  ramadhanDates: string[]
): { in: string; out: string } => {
  const tglDate = parseLokalDate(tanggal);
  const isFriday = tglDate.getDay() === 5;
  const ramadhan = isRamadhan(tanggal, ramadhanDates);
  if (!isFriday && shiftNameFromRecord && masterShifts[shiftNameFromRecord]) {
    return masterShifts[shiftNameFromRecord];
  }
  if (ramadhan) return isFriday ? { in: '07:00', out: '16:00' } : { in: '07:00', out: '15:30' };
  return isFriday ? { in: '07:30', out: '17:00' } : { in: '07:30', out: '16:30' };
};

const hitungJarak = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371000; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getLatLng = (record: any): { lat: string | null; lng: string | null } => {
  const lat = record?.custom_latitude || record?.latitude || record?.device_latitude || null;
  const lng = record?.custom_longitude || record?.longitude || record?.device_longitude || null;
  const latN = parseFloat(lat);
  const lngN = parseFloat(lng);
  if (lat && lng && !isNaN(latN) && !isNaN(lngN) && latN !== 0 && lngN !== 0) {
    return { lat: String(lat), lng: String(lng) };
  }
  return { lat: null, lng: null };
};

const DashboardHR = () => {
  const navigate = useNavigate();
  const BACKEND = (import.meta as any).env?.VITE_API_URL || 'https://ropi-hr-backend.vercel.app';
  const ERPNEXT_URL = 'http://103.187.147.240';

  const [dataAbsen, setDataAbsen] = useState<EmployeeSummary[]>([]);
  const [leaveMap, setLeaveMap] = useState<Record<string, number>>({});
  const [leaveRawMap, setLeaveRawMap] = useState<Record<string, any[]>>({});
  const [masterShifts, setMasterShifts] = useState<Record<string, { in: string; out: string }>>({});
  const [ramadhanDates, setRamadhanDates] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [filterMode, setFilterMode] = useState<'harian' | 'bulanan' | 'periode'>('harian');
  const tzOffset = (new Date()).getTimezoneOffset() * 60000;
  const localISOTime = (new Date(Date.now() - tzOffset)).toISOString().slice(0, 10);

  const [tanggalAktif, setTanggalAktif] = useState(localISOTime);
  const [bulanAktif, setBulanAktif] = useState(localISOTime.substring(0, 7));
  const [periodeMulai, setPeriodeMulai] = useState(localISOTime);
  const [periodeAkhir, setPeriodeAkhir] = useState(localISOTime);

  // STATE PAGINATION & UI
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;
  const [showFilters, setShowFilters] = useState(false); 

  const [detailModal, setDetailModal] = useState<EmployeeSummary | null>(null);
  const [expandedDateHR, setExpandedDateHR] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeBranch, setActiveBranch] = useState('Semua Lokasi');
  const [lokasiKantor, setLokasiKantor] = useState<Lokasi[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const lokasiKantorRef = useRef<Lokasi[]>([]);
  useEffect(() => { lokasiKantorRef.current = lokasiKantor; }, [lokasiKantor]);

  useEffect(() => {
    const userData = localStorage.getItem('ropi_user');
    if (!userData) { navigate('/'); return; }
    const parsedUser = JSON.parse(userData);
    const allowedRoles = ['HR', 'HR Manager', 'System Manager'];
    if (!allowedRoles.includes(parsedUser.role)) {
      alert('Akses Ditolak! Anda tidak memiliki hak akses HRD.');
      navigate('/home', { replace: true });
    } else {
      ambilLokasiKantor();
      ambilMasterShift();
      ambilLiburRamadhan();
    }
  }, [navigate]);

  useEffect(() => { tarikDataSemuaKaryawan(); }, [tanggalAktif, bulanAktif, periodeMulai, periodeAkhir, filterMode, masterShifts, lokasiKantor, ramadhanDates]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeBranch, filterMode, tanggalAktif, bulanAktif, periodeMulai, periodeAkhir]);

  const ambilLiburRamadhan = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/holidays`);
      const data = await res.json();
      if (data.success && data.data) {
        const rDates = data.data
          .filter((h: any) => h.description?.toLowerCase().includes('ramadhan') || h.description?.toLowerCase().includes('puasa'))
          .map((h: any) => h.holiday_date);
        if (rDates.length > 0) setRamadhanDates(rDates);
      }
    } catch (e) {
      console.log('API Holiday belum tersedia, menggunakan fallback manual isRamadhan');
    }
  };

  const ambilLokasiKantor = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/locations?_t=${Date.now()}`);
      const data = await res.json();
      if (data.success && data.locations?.length > 0) {
        const cleanedLocations = data.locations.map((l: any) => {
          let namaBersih = l.nama.replace(/\s+/g, ' ').trim();
          if (namaBersih.toLowerCase() === 'ph klaten') namaBersih = 'PH Klaten';
          if (namaBersih.toLowerCase() === 'jakarta') namaBersih = 'Jakarta';
          return { ...l, nama: namaBersih };
        });
        setLokasiKantor(cleanedLocations);
      }
    } catch (e) { console.error('Gagal mengambil daftar lokasi', e); }
  };

  const ambilMasterShift = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/attendance/shifts?_t=${Date.now()}`);
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
    } catch (e) { console.error('Gagal menarik shift'); }
  };

  const tarikDataSemuaKaryawan = async () => {
    if (Object.keys(masterShifts).length === 0 || lokasiKantor.length === 0) return;
    setIsLoading(true);

    let from = tanggalAktif, to = tanggalAktif;
    if (filterMode === 'bulanan') {
      from = `${bulanAktif}-01`;
      const year = parseInt(bulanAktif.split('-')[0]);
      const month = parseInt(bulanAktif.split('-')[1]);
      const lastDay = new Date(year, month, 0).getDate();
      to = `${bulanAktif}-${lastDay}`;
    } else if (filterMode === 'periode') {
      from = periodeMulai;
      to = periodeAkhir;
    }

    try {
      const res = await fetch(`${BACKEND}/api/attendance/all-history?from=${from}&to=${to}&_t=${Date.now()}`);
      const result = await res.json();
      if (result.success && result.data) {
        const grouped: Record<string, EmployeeSummary> = {};
        const locs = lokasiKantorRef.current;

        result.data.forEach((item: any) => {
          const { lat: normLat, lng: normLng } = getLatLng(item);
          if (normLat && normLng) { item.latitude = normLat; item.longitude = normLng; }

          if (!grouped[item.employee]) {
            let branchAsumsi = 'Outlet';
            
            if (item.shift?.toLowerCase().includes('klaten')) branchAsumsi = 'PH Klaten';
            else if (item.shift?.toLowerCase().includes('jakarta')) branchAsumsi = 'Jakarta';
            else if (item.shift) {
              const shiftLower = item.shift.toLowerCase().replace(/\s+/g, ' ').trim();
              const matchLoc = locs.find(l => shiftLower.includes(l.nama.toLowerCase()));
              if (matchLoc) branchAsumsi = matchLoc.nama;
            }

            if (branchAsumsi === 'Outlet' && item.latitude && item.longitude) {
              const lat = Number(item.latitude);
              const lng = Number(item.longitude);
              if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                let min = Infinity;
                for (const l of locs) {
                  if (l.lat === 0 && l.lng === 0) continue;
                  const d = hitungJarak(lat, lng, l.lat, l.lng);
                  if (d < 2000 && d < min) { min = d; branchAsumsi = l.nama; }
                }
              }
            }

            grouped[item.employee] = {
              employee: item.employee,
              employee_name: item.employee_name || item.employee,
              totalHadir: 0, totalTelat: 0, totalCepat: 0, totalIzin: 0,
              branch: branchAsumsi, 
              logsByDate: {}
            };
          }

          const empRef = grouped[item.employee];
          if (item.shift?.toLowerCase().includes('klaten')) empRef.branch = 'PH Klaten';
          else if (item.shift?.toLowerCase().includes('jakarta')) empRef.branch = 'Jakarta';

          const timeStr = item.time || item.attendance_date || '';
          if (!timeStr) return; 

          const dateKey = timeStr.substring(0, 10);
          if (!grouped[item.employee].logsByDate[dateKey])
            grouped[item.employee].logsByDate[dateKey] = { in: null, out: null };

          if (item.log_type === 'IN') {
            const curr = grouped[item.employee].logsByDate[dateKey].in;
            if (!curr) {
              grouped[item.employee].logsByDate[dateKey].in = item;
            } else {
              const currHasPic = !!curr.custom_foto_absen;
              const itemHasPic = !!item.custom_foto_absen;
              const itemTime = item.time || item.attendance_date;
              const currTime = curr.time || curr.attendance_date;
              if (!currHasPic && itemHasPic) {
                grouped[item.employee].logsByDate[dateKey].in = item;
              } else if (currHasPic === itemHasPic && itemTime && currTime && itemTime < currTime) {
                grouped[item.employee].logsByDate[dateKey].in = item;
              }
            }
          } else {
            const curr = grouped[item.employee].logsByDate[dateKey].out;
            if (!curr) {
              grouped[item.employee].logsByDate[dateKey].out = item;
            } else {
              const currHasPic = !!curr.custom_foto_absen;
              const itemHasPic = !!item.custom_foto_absen;
              const itemTime = item.time || item.attendance_date;
              const currTime = curr.time || curr.attendance_date;
              if (!currHasPic && itemHasPic) {
                grouped[item.employee].logsByDate[dateKey].out = item;
              } else if (currHasPic === itemHasPic && itemTime && currTime && itemTime > currTime) {
                grouped[item.employee].logsByDate[dateKey].out = item;
              }
            }
          }
        });

        Object.values(grouped).forEach(emp => {
          let hadir = 0, telat = 0, cepat = 0;
          Object.entries(emp.logsByDate).forEach(([date, log]) => {
            if (log.in || log.out) hadir++; 
            const shiftInfo = getJamShift(log.in?.shift || log.out?.shift, date, masterShifts, ramadhanDates);
            if (log.in) {
              const timeStrIn = log.in.time || log.in.attendance_date;
              const inJam = formatJamLokal(timeStrIn);
              if (inJam !== '-' && toMenit(inJam) > toMenit(shiftInfo.in)) telat++;
            }
            if (log.out) {
              const timeStrOut = log.out.time || log.out.attendance_date;
              const outJam = formatJamLokal(timeStrOut);
              if (outJam !== '-' && toMenit(shiftInfo.out) > toMenit(outJam)) cepat++;
            }
          });
          emp.totalHadir = hadir; emp.totalTelat = telat; emp.totalCepat = cepat;
        });

        const arrData = Object.values(grouped).sort((a, b) => a.employee_name.localeCompare(b.employee_name));
        setDataAbsen(arrData);

        if (filterMode === 'bulanan' || filterMode === 'periode') {
          const leaveResults = await Promise.allSettled(
            arrData.map(emp =>
              fetch(`${BACKEND}/api/attendance/leave-history?employee_id=${encodeURIComponent(emp.employee)}&_t=${Date.now()}`)
                .then(r => r.json())
                .then(d => ({ employee: emp.employee, data: d.success ? d.data : [] }))
                .catch(() => ({ employee: emp.employee, data: [] }))
            )
          );
          const newLeaveMap: Record<string, number> = {};
          const newLeaveRawMap: Record<string, any[]> = {};
          
          let startDateObj: Date, endDateObj: Date;
          if (filterMode === 'bulanan') {
            const year = parseInt(bulanAktif.split('-')[0]);
            const month = parseInt(bulanAktif.split('-')[1]) - 1;
            startDateObj = new Date(year, month, 1);
            endDateObj = new Date(year, month + 1, 0); 
          } else {
            startDateObj = parseLokalDate(periodeMulai);
            endDateObj = parseLokalDate(periodeAkhir);
          }

          leaveResults.forEach(result => {
            if (result.status === 'fulfilled') {
              const { employee, data } = result.value;
              let totalIzin = 0;
              (data as any[]).filter(r => r.status?.toLowerCase() === 'approved').forEach((r: any) => {
                const from = parseLokalDate(r.from_date);
                const to = parseLokalDate(r.to_date);
                const start = from < startDateObj ? startDateObj : from;
                const end = to > endDateObj ? endDateObj : to;
                for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                  if (d.getDay() !== 0 && d.getDay() !== 6) totalIzin++;
                }
              });
              newLeaveMap[employee] = totalIzin;
              newLeaveRawMap[employee] = data as any[];
            }
          });
          setLeaveMap(newLeaveMap);
          setLeaveRawMap(newLeaveRawMap);
        } else {
          const bulanRef = tanggalAktif.substring(0, 7); 
          const [yr, mo] = bulanRef.split('-').map(Number);
          const lastDay = new Date(yr, mo, 0).getDate();
          const fromBulan = `${bulanRef}-01`;
          const toBulan = `${bulanRef}-${lastDay}`;

          let allEmployeeIds: { employee: string; employee_name: string; branch: string }[] = [...arrData];
          try {
            const resBulan = await fetch(`${BACKEND}/api/attendance/all-history?from=${fromBulan}&to=${toBulan}&_t=${Date.now()}`);
            const dataBulan = await resBulan.json();
            if (dataBulan.success && dataBulan.data) {
              const empMap: Record<string, {name: string, branch: string}> = {};
              const locs = lokasiKantorRef.current;
              
              dataBulan.data.forEach((item: any) => {
                if (!empMap[item.employee]) {
                  let branchAsumsi = 'Outlet';
                  if (item.shift?.toLowerCase().includes('klaten')) branchAsumsi = 'PH Klaten';
                  else if (item.shift?.toLowerCase().includes('jakarta')) branchAsumsi = 'Jakarta';
                  else if (item.shift) {
                    const shiftLower = item.shift.toLowerCase().replace(/\s+/g, ' ').trim();
                    const matchLoc = locs.find(l => shiftLower.includes(l.nama.toLowerCase()));
                    if (matchLoc) branchAsumsi = matchLoc.nama;
                  }
                  empMap[item.employee] = { name: item.employee_name || item.employee, branch: branchAsumsi };
                }
              });
              Object.entries(empMap).forEach(([id, info]) => {
                if (!allEmployeeIds.find(e => e.employee === id)) {
                  allEmployeeIds.push({ employee: id, employee_name: info.name, branch: info.branch });
                }
              });
            }
          } catch { }

          const leaveResults = await Promise.allSettled(
            allEmployeeIds.map(emp =>
              fetch(`${BACKEND}/api/attendance/leave-history?employee_id=${encodeURIComponent(emp.employee)}&_t=${Date.now()}`)
                .then(r => r.json())
                .then(d => ({ employee: emp.employee, employee_name: emp.employee_name, branch: emp.branch, data: d.success ? d.data : [] }))
                .catch(() => ({ employee: emp.employee, employee_name: emp.employee_name, branch: emp.branch, data: [] }))
            )
          );

          const newLeaveMap: Record<string, number> = {};
          const newLeaveRawMap: Record<string, any[]> = {};
          const extraEmployees: EmployeeSummary[] = [];

          leaveResults.forEach(result => {
            if (result.status === 'fulfilled') {
              const { employee, employee_name, branch, data } = result.value;
              const izinHariIni = (data as any[]).filter(r => r.status?.toLowerCase() === 'approved').find((r: any) => {
                const from = parseLokalDate(r.from_date);
                const to = parseLokalDate(r.to_date);
                const tgl = parseLokalDate(tanggalAktif);
                return tgl >= from && tgl <= to;
              });
              newLeaveMap[employee] = izinHariIni ? 1 : 0;
              newLeaveRawMap[employee] = data as any[];

              if (izinHariIni && !arrData.find(e => e.employee === employee)) {
                extraEmployees.push({
                  employee,
                  employee_name,
                  branch,
                  totalHadir: 0, totalTelat: 0, totalCepat: 0, totalIzin: 1,
                  logsByDate: {},
                });
              }
            }
          });

          if (extraEmployees.length > 0) {
            const merged = [...arrData, ...extraEmployees].sort((a, b) => a.employee_name.localeCompare(b.employee_name));
            setDataAbsen(merged);
          }

          setLeaveMap(newLeaveMap);
          setLeaveRawMap(newLeaveRawMap);
        }
      } else {
        setDataAbsen([]);
      }
    } catch (err) { console.error('Gagal tarik data HR'); }
    setIsLoading(false);
  };

  const prosesUrlFoto = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('data:image')) return url;
    if (url.startsWith('/files') || url.startsWith('/private')) return `${BACKEND}/api/attendance/file?path=${encodeURIComponent(url)}`;
    if (url.startsWith('http')) return url;
    return url;
  };

  const getAttachmentIzin = (leaveData: any): string | undefined => {
    if (!leaveData) return undefined;
    const fields = ['attachment', 'custom_attachment', 'leave_attachment', 'custom_foto_bukti', 'custom_bukti', 'custom_file'];
    for (const f of fields) { if (leaveData[f]) return leaveData[f]; }
    return Object.values(leaveData).find(v => typeof v === 'string' && (v.startsWith('/files/') || v.startsWith('data:image'))) as string | undefined;
  };

  const downloadExcel = () => {
    if (filteredDataAbsen.length === 0) { alert('Tidak ada data untuk di-download!'); return; }
    const dataExcel: any[] = [];
    
    filteredDataAbsen.forEach((emp) => {
      const empIzinDates: Record<string, string> = {};
      const rawLeaves: any[] = leaveRawMap[emp.employee] ?? [];
      
      if (filterMode === 'bulanan' || filterMode === 'periode') {
        let startDateObj: Date, endDateObj: Date;
        if (filterMode === 'bulanan') {
          const [year, month] = bulanAktif.split('-').map(Number);
          startDateObj = new Date(year, month - 1, 1);
          endDateObj = new Date(year, month, 0);
        } else {
          startDateObj = parseLokalDate(periodeMulai);
          endDateObj = parseLokalDate(periodeAkhir);
        }

        rawLeaves.filter(r => r.status?.toLowerCase() === 'approved').forEach((r: any) => {
          const from = parseLokalDate(r.from_date);
          const to = parseLokalDate(r.to_date);
          const start = from < startDateObj ? startDateObj : from;
          const end = to > endDateObj ? endDateObj : to;
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            if (d.getDay() !== 0 && d.getDay() !== 6) {
              const key = d.toISOString().substring(0, 10);
              empIzinDates[key] = r.leave_type;
            }
          }
        });
      } else {
        const izinHariIni = rawLeaves.filter(r => r.status?.toLowerCase() === 'approved').find((r: any) => {
          const from = parseLokalDate(r.from_date);
          const to = parseLokalDate(r.to_date);
          const tgl = parseLokalDate(tanggalAktif);
          return tgl >= from && tgl <= to;
        });
        if (izinHariIni) empIzinDates[tanggalAktif] = izinHariIni.leave_type;
      }

      const allDates = Array.from(new Set([
        ...Object.keys(emp.logsByDate),
        ...Object.keys(empIzinDates),
      ])).sort();

      allDates.forEach(date => {
        const log = emp.logsByDate[date] ?? { in: null, out: null };
        const izinType = empIzinDates[date];
        
        const timeStrIn = log.in?.time || log.in?.attendance_date;
        const timeStrOut = log.out?.time || log.out?.attendance_date;
        
        const inJam = log.in ? formatJamLokal(timeStrIn) : '-';
        const outJam = log.out ? formatJamLokal(timeStrOut) : '-';
        
        const shiftInfo = getJamShift(log.in?.shift || log.out?.shift, date, masterShifts, ramadhanDates);
        const shiftLabel = getShiftLabel(date, ramadhanDates);
        
        let telat = '-';
        if (inJam !== '-') { const s = toMenit(inJam) - toMenit(shiftInfo.in); if (s > 0) telat = formatDurasi(s); }
        let pulangCepat = '-';
        if (outJam !== '-') { const s = toMenit(shiftInfo.out) - toMenit(outJam); if (s > 0) pulangCepat = formatDurasi(s); }

        if (izinType && !log.in && !log.out) {
          dataExcel.push({
            'Tanggal': date,
            'ID Karyawan': emp.employee,
            'Nama Karyawan': emp.employee_name,
            'Kategori': emp.branch,
            'Shift': '-',
            'Jam Shift': '-',
            'Jam Masuk': '-',
            'Jam Keluar': '-',
            'Keterlambatan': '-',
            'Pulang Cepat': '-',
            'Status': `Izin – ${izinType}`,
            'Lokasi Masuk': '-',
            'Lokasi Keluar': '-',
          });
          return;
        }

        dataExcel.push({
          'Tanggal': date,
          'ID Karyawan': emp.employee,
          'Nama Karyawan': emp.employee_name,
          'Kategori': emp.branch,
          'Shift': shiftLabel,
          'Jam Shift': `${shiftInfo.in} - ${shiftInfo.out}`,
          'Jam Masuk': inJam,
          'Jam Keluar': outJam,
          'Keterlambatan': telat,
          'Pulang Cepat': pulangCepat,
          'Status': izinType ? `Hadir + Izin (${izinType})` : (log.in ? (telat !== '-' ? `Telat ${telat}` : 'Tepat') : '-'),
          'Lokasi Masuk': log.in?.latitude && log.in?.longitude ? `https://www.google.com/maps?q=${log.in.latitude},${log.in.longitude}` : '-',
          'Lokasi Keluar': log.out?.latitude && log.out?.longitude ? `https://www.google.com/maps?q=${log.out.latitude},${log.out.longitude}` : '-',
        });
      });
    });
    
    dataExcel.sort((a, b) => a.Tanggal.localeCompare(b.Tanggal) || a['Nama Karyawan'].localeCompare(b['Nama Karyawan']));
    
    const judulLaporan = filterMode === 'harian' 
      ? `Laporan Absensi Harian - ${tanggalAktif}` 
      : filterMode === 'bulanan'
        ? `Laporan Absensi Bulanan - ${bulanAktif}`
        : `Laporan Absensi Periode - ${periodeMulai} s/d ${periodeAkhir}`;
        
    const worksheet = XLSX.utils.aoa_to_sheet([
      [judulLaporan],
      [] 
    ]);
    
    XLSX.utils.sheet_add_json(worksheet, dataExcel, { origin: 'A3', skipHeader: false } as any);

    const wsRange = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    const headers = dataExcel.length > 0 ? Object.keys(dataExcel[0]) : [];
    const colLokasiMasuk = headers.indexOf('Lokasi Masuk');
    const colLokasiKeluar = headers.indexOf('Lokasi Keluar');
    for (let R = wsRange.s.r; R <= wsRange.e.r; R++) {
      for (let C = wsRange.s.c; C <= wsRange.e.c; C++) {
        if (R > 2 && (C === colLokasiMasuk || C === colLokasiKeluar)) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = worksheet[addr];
          if (cell && typeof cell.v === 'string' && cell.v.startsWith('http')) {
            cell.l = { Target: cell.v, Tooltip: 'Buka di Google Maps' };
          }
        }
      }
    }

    worksheet['!cols'] = [
      { wch: 12 }, { wch: 18 }, { wch: 30 }, { wch: 20 }, { wch: 35 }, 
      { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, 
      { wch: 25 }, { wch: 55 }, { wch: 55 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Absen");

    if (filterMode === 'bulanan' || filterMode === 'periode') {
      const dateRange: string[] = [];
      
      if (filterMode === 'bulanan') {
        const [year, month] = bulanAktif.split('-').map(Number);
        const now = new Date();
        let lastDayToExport = new Date(year, month, 0).getDate();
        
        if (year === now.getFullYear() && month === now.getMonth() + 1) {
          lastDayToExport = now.getDate();
        }
        for (let d = 1; d <= lastDayToExport; d++) {
          dateRange.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
        }
      } else {
        let curr = parseLokalDate(periodeMulai);
        const end = parseLokalDate(periodeAkhir);
        while (curr <= end) {
          const y = curr.getFullYear();
          const m = String(curr.getMonth() + 1).padStart(2, '0');
          const d = String(curr.getDate()).padStart(2, '0');
          dateRange.push(`${y}-${m}-${d}`);
          curr.setDate(curr.getDate() + 1);
        }
      }

      const ringkasan = filteredDataAbsen.map(emp => {
        const row: any = {
          'ID Karyawan': emp.employee,
          'Nama Karyawan': emp.employee_name,
          'Kategori': emp.branch,
        };

        let totalTelatBulanIni = 0;

        for (const dateStr of dateRange) {
          const log = emp.logsByDate[dateStr];
          
          const rawLeaves: any[] = leaveRawMap[emp.employee] ?? [];
          const izinForDate = rawLeaves.filter(r => r.status?.toLowerCase() === 'approved').find((r: any) => {
            const from = parseLokalDate(r.from_date);
            const to = parseLokalDate(r.to_date);
            const tgl = parseLokalDate(dateStr);
            return tgl >= from && tgl <= to;
          });

          // Menggunakan let dan assignment agar tidak error TypeScript
          let statusAbsen: string | number = '';

          if (log && (log.in || log.out)) {
            let isTelat = false;
            if (log.in) {
              const timeStr = log.in.time || log.in.attendance_date || '';
              const inJam = formatJamLokal(timeStr);
              if (inJam !== '-') {
                const shiftInfo = getJamShift(log.in.shift, dateStr, masterShifts, ramadhanDates);
                if (toMenit(inJam) > toMenit(shiftInfo.in)) {
                  isTelat = true;
                  totalTelatBulanIni++;
                }
              }
            }
            statusAbsen = isTelat ? 1 : 0;
          } else if (izinForDate) {
            statusAbsen = '-';
          }

          const dayLabel = filterMode === 'bulanan' 
            ? `Tgl ${parseInt(dateStr.split('-')[2])}`
            : `${dateStr.substring(8, 10)}/${dateStr.substring(5, 7)}`;
          
          row[dayLabel] = statusAbsen;
        }

        row['Total Telat'] = totalTelatBulanIni;
        row['Total Hadir'] = emp.totalHadir;
        row['Total Izin (Hari)'] = leaveMap[emp.employee] ?? 0;
        return row;
      });

      const wsRingkasan = XLSX.utils.aoa_to_sheet([
        [filterMode === 'bulanan' ? `Ringkasan Absensi - ${bulanAktif}` : `Ringkasan Absensi - ${periodeMulai} s/d ${periodeAkhir}`],
        ['Keterangan Angka:', '0 = Hadir', '1 = Terlambat', '- = Izin / Cuti'],
        [] 
      ]);
      XLSX.utils.sheet_add_json(wsRingkasan, ringkasan, { origin: 'A4', skipHeader: false } as any);

      const ringkasanColWidths = [{ wch: 18 }, { wch: 30 }, { wch: 20 }];
      for (let d = 0; d < dateRange.length; d++) ringkasanColWidths.push({ wch: 7 }); 
      ringkasanColWidths.push({ wch: 15 }, { wch: 15 }, { wch: 18 }); 
      wsRingkasan['!cols'] = ringkasanColWidths;

      XLSX.utils.book_append_sheet(workbook, wsRingkasan, "Ringkasan");
    }

    let namaFile = '';
    if (filterMode === 'harian') namaFile = `Laporan_Harian_${tanggalAktif}.xlsx`;
    else if (filterMode === 'bulanan') namaFile = `Laporan_Bulanan_${bulanAktif}.xlsx`;
    else namaFile = `Laporan_Periode_${periodeMulai}_sd_${periodeAkhir}.xlsx`;
    
    XLSX.writeFile(workbook, namaFile);
  };

  const handleLogout = () => {
    localStorage.removeItem('ropi_user');
    navigate('/login', { replace: true });
  };

  const kantorLocations = ['PH Klaten', 'Jakarta'];
  const outletLocations = Array.from(new Set([
    ...lokasiKantor.map(l => l.nama),
    ...dataAbsen.map(d => d.branch)
  ])).filter(n => !kantorLocations.includes(n) && n !== 'Semua Lokasi').sort();

  const filteredDataAbsen = dataAbsen.filter(emp => {
    const searchMatch = emp.employee_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        emp.employee.toLowerCase().includes(searchQuery.toLowerCase());
    
    let branchMatch = true;
    if (activeBranch !== 'Semua Lokasi') {
      branchMatch = emp.branch === activeBranch;
    }

    return searchMatch && branchMatch;
  });

  let globalHadir = 0, globalTelat = 0, globalIzin = 0;
  filteredDataAbsen.forEach(emp => {
    if (filterMode === 'harian') {
      const todayLog = emp.logsByDate[tanggalAktif];
      if (todayLog?.in) {
        globalHadir++;
        const timeStrIn = todayLog.in.time || todayLog.in.attendance_date;
        const shiftInfo = getJamShift(todayLog.in.shift, tanggalAktif, masterShifts, ramadhanDates);
        if (toMenit(formatJamLokal(timeStrIn)) > toMenit(shiftInfo.in)) globalTelat++;
      }
      if (leaveMap[emp.employee] === 1) globalIzin++;
    } else {
      globalHadir += emp.totalHadir;
      globalTelat += emp.totalTelat;
      globalIzin += leaveMap[emp.employee] ?? 0;
    }
  });

  const tutupModal = () => {
    setDetailModal(null);
    setExpandedDateHR(null); 
  };

  const FotoSlot = ({ src, label, badge, badgeColor, isSignature = false }: { src?: string; label: string; badge: string; badgeColor: string; isSignature?: boolean }) => (
    <div className="flex flex-col gap-1.5 w-[140px] md:w-[180px] shrink-0 snap-center">
      <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide pl-1 text-center">{label}</p>
      <div className={`relative rounded-2xl overflow-hidden shadow-sm flex items-center justify-center ${isSignature ? 'bg-white border-2 border-gray-100 aspect-square p-2' : 'bg-black border-2 border-gray-200 aspect-[3/4]'}`}>
        {src
          ? <img src={prosesUrlFoto(src)} className={`w-full h-full ${isSignature ? 'object-contain mix-blend-multiply' : 'object-cover'}`} alt={label} loading="lazy" decoding="async" />
          : <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gray-50"><i className={`fa-solid ${isSignature ? 'fa-pen-slash' : 'fa-image-slash'} text-2xl text-gray-300`} /><p className="text-[9px] text-gray-400 font-bold">Belum ada</p></div>
        }
        <div className={`absolute top-2 left-2 ${badgeColor} text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-md border border-white/20`}>{badge}</div>
      </div>
    </div>
  );

  const totalPages = Math.max(1, Math.ceil(filteredDataAbsen.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentData = filteredDataAbsen.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="bg-gray-200 min-h-screen font-sans w-full text-[#3e2723] pb-10">

      <div className="bg-[#3e2723] pt-5 pb-6 px-5 md:px-10 shadow-lg sticky top-0 z-30 w-full rounded-b-[2rem]">
        <div className="max-w-7xl mx-auto flex flex-col gap-4">
          
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <button onClick={handleLogout} title="Logout" className="w-9 h-9 bg-white/10 hover:bg-red-500/30 border border-white/20 hover:border-red-400/50 text-white/60 hover:text-red-300 rounded-full flex items-center justify-center active:scale-95 transition-all shrink-0">
                <i className="fa-solid fa-arrow-right-from-bracket text-sm" />
              </button>
              <div>
                <h1 className="text-lg md:text-2xl font-black text-[#fbc02d] leading-tight">HR Command Center</h1>
                <p className="text-[9px] md:text-xs text-white/70 font-bold uppercase tracking-widest mt-0.5">Laporan Kehadiran</p>
              </div>
            </div>
            
            <button onClick={downloadExcel} className="bg-[#fbc02d] hover:bg-[#f9a825] text-[#3e2723] font-black px-3 md:px-4 py-2 rounded-xl shadow-md flex items-center justify-center gap-2 transition-transform active:scale-95 text-xs md:text-sm shrink-0">
              <i className="fa-solid fa-file-excel" /> <span className="hidden sm:inline">Export Excel</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 md:gap-4 w-full mt-1">
            <div className="bg-green-500/20 rounded-xl px-2 py-2 md:py-3 border border-green-500/30 text-white flex flex-col items-center justify-center text-center shadow-inner">
              <p className="text-[9px] md:text-xs text-green-300 font-bold uppercase tracking-wide">Hadir</p>
              <p className="font-black text-xl md:text-3xl leading-none mt-1">{globalHadir}</p>
            </div>
            <div className="bg-red-500/20 rounded-xl px-2 py-2 md:py-3 border border-red-500/30 text-white flex flex-col items-center justify-center text-center shadow-inner">
              <p className="text-[9px] md:text-xs text-red-300 font-bold uppercase tracking-wide">Telat</p>
              <p className="font-black text-xl md:text-3xl leading-none mt-1">{globalTelat}</p>
            </div>
            <div className="bg-blue-500/20 rounded-xl px-2 py-2 md:py-3 border border-blue-500/30 text-white flex flex-col items-center justify-center text-center shadow-inner">
              <p className="text-[9px] md:text-xs text-blue-300 font-bold uppercase tracking-wide">Izin</p>
              <p className="font-black text-xl md:text-3xl leading-none mt-1">{globalIzin}</p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full">
            <div className="flex gap-2 w-full md:w-auto md:flex-1">
              <div className="flex items-center bg-white/10 rounded-xl px-4 py-2 w-full border border-white/10 shadow-sm relative group focus-within:bg-white/20 transition-colors">
                <i className="fa-solid fa-search text-white/50 group-focus-within:text-white transition-colors mr-3" />
                <input 
                  type="text" 
                  placeholder="Cari nama / ID..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent text-white placeholder-white/40 font-bold text-xs md:text-sm outline-none w-full" 
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 text-white/50 hover:text-white">
                    <i className="fa-solid fa-circle-xmark text-sm" />
                  </button>
                )}
              </div>
              <button 
                onClick={() => setShowFilters(!showFilters)} 
                className={`md:hidden shrink-0 px-4 rounded-xl border border-white/10 flex items-center justify-center transition-colors shadow-sm ${showFilters ? 'bg-[#fbc02d] text-[#3e2723]' : 'bg-white/10 text-white'}`}
              >
                <i className="fa-solid fa-sliders"></i>
              </button>
            </div>

            <div className={`${showFilters ? 'flex' : 'hidden'} md:flex flex-col md:flex-row items-stretch md:items-center gap-2 w-full md:w-auto`}>
              <div className="flex bg-white/10 rounded-xl p-1 border border-white/10 shadow-inner shrink-0">
                <button onClick={() => setFilterMode('harian')} className={`flex-1 md:px-4 py-2 text-[10px] md:text-xs font-black rounded-lg transition-all ${filterMode === 'harian' ? 'bg-[#fbc02d] text-[#3e2723] shadow' : 'text-white/70 hover:text-white hover:bg-white/10'}`}>Harian</button>
                <button onClick={() => setFilterMode('bulanan')} className={`flex-1 md:px-4 py-2 text-[10px] md:text-xs font-black rounded-lg transition-all ${filterMode === 'bulanan' ? 'bg-[#fbc02d] text-[#3e2723] shadow' : 'text-white/70 hover:text-white hover:bg-white/10'}`}>Bulanan</button>
                <button onClick={() => setFilterMode('periode')} className={`flex-1 md:px-4 py-2 text-[10px] md:text-xs font-black rounded-lg transition-all ${filterMode === 'periode' ? 'bg-[#fbc02d] text-[#3e2723] shadow' : 'text-white/70 hover:text-white hover:bg-white/10'}`}>Periode</button>
              </div>

              <div className="flex items-center bg-white/10 rounded-xl px-4 py-2 border border-white/10 shadow-sm shrink-0 gap-2 overflow-x-auto">
                {filterMode === 'harian' && (
                  <input type="date" value={tanggalAktif} onChange={(e) => setTanggalAktif(e.target.value)} className="bg-transparent text-white font-bold text-xs md:text-sm outline-none cursor-pointer w-full text-center md:text-left" style={{ colorScheme: 'dark' }} />
                )}
                {filterMode === 'bulanan' && (
                  <input type="month" value={bulanAktif} onChange={(e) => setBulanAktif(e.target.value)} className="bg-transparent text-white font-bold text-xs md:text-sm outline-none cursor-pointer w-full text-center md:text-left" style={{ colorScheme: 'dark' }} />
                )}
                {filterMode === 'periode' && (
                  <>
                    <input type="date" value={periodeMulai} onChange={(e) => setPeriodeMulai(e.target.value)} className="bg-transparent text-white font-bold text-xs md:text-sm outline-none cursor-pointer w-28 md:w-auto text-center" style={{ colorScheme: 'dark' }} />
                    <span className="text-white/50 font-bold">-</span>
                    <input type="date" value={periodeAkhir} onChange={(e) => setPeriodeAkhir(e.target.value)} className="bg-transparent text-white font-bold text-xs md:text-sm outline-none cursor-pointer w-28 md:w-auto text-center" style={{ colorScheme: 'dark' }} />
                  </>
                )}
              </div>

              <div 
                className="relative shrink-0"
                tabIndex={0}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) {
                    setIsDropdownOpen(false);
                  }
                }}
              >
                <div 
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center justify-between bg-white/10 rounded-xl px-4 py-2 border border-white/10 shadow-sm cursor-pointer hover:bg-white/20 transition-colors h-full"
                >
                  <div className="flex items-center gap-3">
                    <i className="fa-solid fa-store text-white/50" />
                    <span className="text-white font-bold text-xs md:text-sm truncate max-w-[120px]">
                      {activeBranch}
                    </span>
                  </div>
                  <i className={`fa-solid fa-chevron-down text-white/50 text-[10px] transition-transform ml-2 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </div>

                {isDropdownOpen && (
                  <div className="absolute top-full left-0 mt-2 w-full bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
                    <div className="max-h-60 overflow-y-auto py-2">
                      <div onClick={() => { setActiveBranch('Semua Lokasi'); setIsDropdownOpen(false); }} className={`px-4 py-2 text-xs md:text-sm font-bold cursor-pointer transition-colors ${activeBranch === 'Semua Lokasi' ? 'bg-[#fff8e1] text-[#fbc02d]' : 'text-gray-600 hover:bg-gray-50'}`}>Semua Lokasi</div>
                      
                      <div className="px-4 py-1.5 mt-2 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 border-y border-gray-100">Kantor</div>
                      {kantorLocations.map(b => (
                        <div key={b} onClick={() => { setActiveBranch(b); setIsDropdownOpen(false); }} className={`px-4 py-2 text-xs md:text-sm font-bold cursor-pointer transition-colors pl-6 ${activeBranch === b ? 'bg-[#fff8e1] text-[#fbc02d]' : 'text-gray-600 hover:bg-gray-50'}`}>{b}</div>
                      ))}
                      
                      <div className="px-4 py-1.5 mt-2 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 border-y border-gray-100">Outlet</div>
                      {outletLocations.map(b => (
                        <div key={b} onClick={() => { setActiveBranch(b); setIsDropdownOpen(false); }} className={`px-4 py-2 text-xs md:text-sm font-bold cursor-pointer transition-colors pl-6 ${activeBranch === b ? 'bg-[#fff8e1] text-[#fbc02d]' : 'text-gray-600 hover:bg-gray-50'}`}>{b}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-8 mt-6 relative z-10 flex flex-col h-full min-h-[500px]">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center pt-24 text-gray-500">
            <i className="fa-solid fa-spinner fa-spin text-5xl mb-4 text-[#fbc02d]" />
            <p className="font-bold text-lg">Memuat data absensi...</p>
          </div>
        ) : filteredDataAbsen.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-24 text-gray-400">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
              <i className="fa-solid fa-users-slash text-4xl text-gray-300" />
            </div>
            <p className="font-bold text-lg text-gray-500">Tidak ada karyawan yang sesuai filter.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {currentData.map((emp) => {
                const todayLog = filterMode === 'harian' ? (emp.logsByDate[tanggalAktif] || { in: null, out: null }) : null;
                const timeStrIn = todayLog?.in?.time || todayLog?.in?.attendance_date;
                const timeStrOut = todayLog?.out?.time || todayLog?.out?.attendance_date;
                
                const inJam = todayLog?.in ? formatJamLokal(timeStrIn) : '-';
                const outJam = todayLog?.out ? formatJamLokal(timeStrOut) : '-';
                const shiftInfo = getJamShift(todayLog?.in?.shift || todayLog?.out?.shift, tanggalAktif, masterShifts, ramadhanDates);
                const shiftLabel = getShiftLabel(tanggalAktif, ramadhanDates);
                const isTelat = todayLog?.in && inJam !== '-' && toMenit(inJam) > toMenit(shiftInfo.in);

                let avatarSrc = null;
                if (filterMode === 'harian') avatarSrc = todayLog?.in?.custom_foto_absen;
                else {
                  const firstAvailableLog = Object.values(emp.logsByDate).find(l => l.in?.custom_foto_absen);
                  if (firstAvailableLog) avatarSrc = firstAvailableLog.in!.custom_foto_absen;
                }

                return (
                  <div
                    key={emp.employee}
                    onClick={() => setDetailModal(emp)}
                    className="bg-white rounded-[1.5rem] p-5 shadow-[0_10px_30px_-10px_rgba(62,39,35,0.1)] hover:shadow-[0_15px_40px_-10px_rgba(251,192,45,0.3)] transition-all cursor-pointer border border-white hover:border-[#fbc02d] flex flex-col active:scale-95 group relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-full h-1 bg-[#fbc02d] opacity-0 group-hover:opacity-100 transition-opacity" />

                    <div className="absolute top-3 right-3">
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${
                        emp.branch === 'PH Klaten' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                        emp.branch === 'Jakarta' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                        'bg-purple-50 text-purple-600 border-purple-100'
                      }`}>
                        {emp.branch}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 mb-3 mt-2">
                      <div className="w-14 h-14 rounded-full overflow-hidden bg-[#fff8e1] shrink-0 border-2 border-white shadow-sm relative">
                        {avatarSrc
                          ? <img src={prosesUrlFoto(avatarSrc)} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          : <i className="fa-solid fa-user text-[#fbc02d] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl" />
                        }
                      </div>
                      <div className="flex-1 pt-1">
                        <h3 className="font-black text-[#3e2723] text-base leading-tight line-clamp-1">{emp.employee_name}</h3>
                        {filterMode === 'harian' ? (
                          isTelat
                            ? <span className="inline-block mt-1.5 bg-red-100 text-red-600 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">Telat Masuk</span>
                            : todayLog?.in
                              ? <span className="inline-block mt-1.5 bg-green-100 text-green-700 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">Hadir</span>
                              : <span className="inline-block mt-1.5 bg-gray-100 text-gray-500 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">Belum Absen</span>
                        ) : (
                          <span className="inline-block mt-1.5 bg-[#fff8e1] text-[#fbc02d] border border-[#fbc02d]/50 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">Rekap {filterMode === 'bulanan' ? 'Bulanan' : 'Periode'}</span>
                        )}
                      </div>
                    </div>

                    {filterMode === 'harian' && (
                      <div className="bg-[#fff8e1] border border-[#fbc02d]/30 rounded-xl px-3 py-1.5 mb-3 flex items-center gap-2">
                        <i className="fa-solid fa-calendar-check text-[#fbc02d] text-[10px] shrink-0" />
                        <div>
                          <p className="text-[9px] text-[#3e2723]/50 font-bold uppercase leading-none">Shift</p>
                          <p className="text-[10px] font-black text-[#3e2723] leading-snug">{shiftLabel}</p>
                          <p className="text-[10px] text-[#3e2723]/60 font-bold">{shiftInfo.in} – {shiftInfo.out}</p>
                        </div>
                      </div>
                    )}

                    {filterMode === 'harian' ? (
                      <>
                        <div className="grid grid-cols-2 gap-3 mt-auto">
                          <div className="bg-[#fff8e1] rounded-xl p-3 flex flex-col justify-center border border-[#fbc02d]/30">
                            <div className="flex items-center gap-1.5 mb-1 text-[#fbc02d]">
                              <i className="fa-solid fa-clock text-xs" />
                              <p className="text-[10px] font-black uppercase text-[#3e2723]/60">Masuk</p>
                            </div>
                            <p className="font-black text-[#3e2723] text-lg">{inJam}</p>
                          </div>
                          <div className="bg-gray-50 rounded-xl p-3 flex flex-col justify-center border border-gray-200">
                            <div className="flex items-center gap-1.5 mb-1 text-gray-400">
                              <i className="fa-solid fa-arrow-right-from-bracket text-xs" />
                              <p className="text-[10px] font-black uppercase">Keluar</p>
                            </div>
                            <p className="font-black text-gray-600 text-lg">{outJam}</p>
                          </div>
                        </div>
                        {leaveMap[emp.employee] === 1 && (() => {
                          const rawLeaves: any[] = leaveRawMap[emp.employee] ?? [];
                          const izinHariIni = rawLeaves.filter(r => r.status?.toLowerCase() === 'approved').find((r: any) => {
                            const from = parseLokalDate(r.from_date);
                            const to = parseLokalDate(r.to_date);
                            const tgl = parseLokalDate(tanggalAktif);
                            return tgl >= from && tgl <= to;
                          });
                          return izinHariIni ? (
                            <div className="mt-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 flex items-center gap-2">
                              <i className="fa-solid fa-envelope-open-text text-blue-400 text-xs shrink-0" />
                              <p className="text-[10px] font-black text-blue-700">{izinHariIni.leave_type}</p>
                            </div>
                          ) : null;
                        })()}
                      </>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 mt-auto">
                        <div className="bg-green-50 rounded-xl p-2.5 flex flex-col justify-center border border-green-100">
                          <p className="text-[9px] text-green-600 font-black uppercase mb-1">Hadir</p>
                          <p className="font-black text-green-800 text-base">{emp.totalHadir} <span className="text-[10px] font-bold">Hari</span></p>
                        </div>
                        <div className="bg-red-50 rounded-xl p-2.5 flex flex-col justify-center border border-red-100">
                          <p className="text-[9px] text-red-500 font-black uppercase mb-1">Telat</p>
                          <p className="font-black text-red-800 text-base">{emp.totalTelat} <span className="text-[10px] font-bold">Kali</span></p>
                        </div>
                        <div className="bg-blue-50 rounded-xl p-2.5 flex flex-col justify-center border border-blue-100">
                          <p className="text-[9px] text-blue-500 font-black uppercase mb-1">Izin</p>
                          <p className="font-black text-blue-800 text-base">{leaveMap[emp.employee] ?? 0} <span className="text-[10px] font-bold">Hari</span></p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-8 mb-4">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="w-10 h-10 rounded-full bg-white shadow-sm border border-gray-200 flex items-center justify-center text-[#3e2723] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 active:scale-95 transition-all"
                >
                  <i className="fa-solid fa-chevron-left"></i>
                </button>
                <span className="text-sm font-black text-gray-500 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-200">
                  Halaman <span className="text-[#fbc02d]">{currentPage}</span> dari {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="w-10 h-10 rounded-full bg-white shadow-sm border border-gray-200 flex items-center justify-center text-[#3e2723] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 active:scale-95 transition-all"
                >
                  <i className="fa-solid fa-chevron-right"></i>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── MODAL DETAIL ── */}
      {detailModal && (() => {
        const emp = detailModal;
        const isOutlet = emp.branch !== 'PH Klaten' && emp.branch !== 'Jakarta';

        if (filterMode === 'harian') {
          const todayLog = emp.logsByDate[tanggalAktif] || { in: null, out: null };
          const shiftInfo = getJamShift(todayLog.in?.shift || todayLog.out?.shift, tanggalAktif, masterShifts, ramadhanDates);
          const shiftLabel = getShiftLabel(tanggalAktif, ramadhanDates);
          
          const timeStrIn = todayLog.in?.time || todayLog.in?.attendance_date;
          const timeStrOut = todayLog.out?.time || todayLog.out?.attendance_date;
          
          const inJam = todayLog.in ? formatJamLokal(timeStrIn) : '-';
          const outJam = todayLog.out ? formatJamLokal(timeStrOut) : '-';

          let durasiTelat = 0, durasiCepat = 0;
          if (todayLog.in && inJam !== '-') { const s = toMenit(inJam) - toMenit(shiftInfo.in); if (s > 0) durasiTelat = s; }
          if (todayLog.out && outJam !== '-') { const s = toMenit(shiftInfo.out) - toMenit(outJam); if (s > 0) durasiCepat = s; }

          const izinHariIniData = (() => {
            if (leaveMap[emp.employee] !== 1) return null;
            const rawLeaves: any[] = leaveRawMap[emp.employee] ?? [];
            return rawLeaves.filter(r => r.status?.toLowerCase() === 'approved').find((r: any) => {
              const from = parseLokalDate(r.from_date);
              const to = parseLokalDate(r.to_date);
              const tgl = parseLokalDate(tanggalAktif);
              return tgl >= from && tgl <= to;
            }) ?? null;
          })();

          return (
            <div className="fixed inset-0 z-50 flex flex-col justify-end md:justify-center items-center p-0 md:p-8 bg-black/60 backdrop-blur-sm">
              <div className="bg-white w-full md:max-w-6xl max-h-[85vh] rounded-t-[2rem] md:rounded-[2rem] shadow-2xl flex flex-col md:flex-row overflow-hidden animate-zoomIn">

                <div className="bg-[#3e2723] px-5 py-4 flex items-center gap-3 shrink-0 md:hidden">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-[#fff8e1] shrink-0 border-2 border-white/30">
                    {todayLog.in?.custom_foto_absen
                      ? <img src={prosesUrlFoto(todayLog.in.custom_foto_absen)} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      : <i className="fa-solid fa-user text-[#fbc02d] text-lg flex items-center justify-center w-full h-full pt-2" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-white text-base leading-tight truncate">{emp.employee_name}</p>
                    <p className="text-[10px] text-white/50 font-bold">{emp.employee}</p>
                  </div>
                  <button onClick={tutupModal} className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center shrink-0">
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row">

                  <div className="md:w-1/3 flex flex-col shrink-0 md:overflow-y-auto bg-white md:border-r border-gray-100 pb-8 md:pb-0">
                    <div className="hidden md:block p-8 border-b border-gray-100 relative shrink-0">
                      <button onClick={tutupModal} className="absolute top-6 right-6 w-8 h-8 rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-500 text-gray-400 flex items-center justify-center transition-colors">
                        <i className="fa-solid fa-xmark text-lg" />
                      </button>
                      <div className="w-20 h-20 rounded-full overflow-hidden bg-[#fff8e1] border-4 border-white shadow-md mb-4 relative">
                        {todayLog.in?.custom_foto_absen
                          ? <img src={prosesUrlFoto(todayLog.in.custom_foto_absen)} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          : <i className="fa-solid fa-user text-[#fbc02d] text-4xl absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                        }
                      </div>
                      <h2 className="text-2xl font-black text-[#3e2723] leading-tight mb-1">{emp.employee_name}</h2>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{emp.employee} • <span className="text-[#fbc02d]">{emp.branch}</span></p>
                    </div>

                    <div className="p-4 md:p-8 shrink-0">
                      <div className="bg-[#fff8e1] px-4 py-3 rounded-2xl border border-[#fbc02d]/30 mb-3 flex items-center gap-3">
                        <i className="fa-solid fa-calendar-check text-[#fbc02d] shrink-0" />
                        <div>
                          <p className="text-[10px] text-[#3e2723]/50 font-bold uppercase leading-none mb-0.5">Jadwal Shift</p>
                          <p className="font-black text-[#3e2723] text-xs leading-snug">{shiftLabel}</p>
                          <p className="font-bold text-[#3e2723] text-sm">{shiftInfo.in} → {shiftInfo.out}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-green-50 p-3 rounded-2xl border border-green-100">
                          <p className="text-[10px] text-green-500 font-bold uppercase mb-1 flex items-center gap-1"><i className="fa-solid fa-right-to-bracket" /> Masuk</p>
                          <p className="font-black text-[#3e2723] text-xl">{inJam}</p>
                          {durasiTelat > 0 && <span className="inline-block mt-1 bg-red-100 text-red-600 text-[9px] font-black px-2 py-0.5 rounded-md">TELAT {formatDurasi(durasiTelat)}</span>}
                        </div>
                        <div className="bg-orange-50 p-3 rounded-2xl border border-orange-100">
                          <p className="text-[10px] text-orange-500 font-bold uppercase mb-1 flex items-center gap-1"><i className="fa-solid fa-right-from-bracket" /> Keluar</p>
                          <p className="font-black text-[#3e2723] text-xl">{outJam}</p>
                          {durasiCepat > 0 && <span className="inline-block mt-1 bg-yellow-400 text-white text-[9px] font-black px-2 py-0.5 rounded-md">CEPAT {formatDurasi(durasiCepat)}</span>}
                        </div>
                      </div>

                      {izinHariIniData && (
                        <div className="mb-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 flex flex-col gap-3">
                          <div className="flex items-start gap-3">
                            <i className="fa-solid fa-envelope-open-text text-blue-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-[10px] text-blue-500 font-bold uppercase mb-0.5">Izin Hari Ini</p>
                              <p className="text-sm font-black text-blue-800">{izinHariIniData.leave_type}</p>
                              {izinHariIniData.description && <p className="text-[10px] text-blue-600 mt-0.5">{izinHariIniData.description}</p>}
                            </div>
                          </div>
                          
                          {/* PREVIEW LAMPIRAN IZIN HARIAN */}
                          {getAttachmentIzin(izinHariIniData) && (
                            <button onClick={() => setPreviewUrl(prosesUrlFoto(getAttachmentIzin(izinHariIniData)))}
                              className="w-24 h-24 rounded-xl overflow-hidden border border-blue-200 shadow-sm mt-1 shrink-0 relative group">
                              <img src={prosesUrlFoto(getAttachmentIzin(izinHariIniData))} alt="Bukti Izin" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <i className="fa-solid fa-magnifying-glass text-white text-xs" />
                              </div>
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex flex-col gap-2">
                        {todayLog.in?.latitude && todayLog.in?.longitude && (
                          <a href={`https://www.google.com/maps?q=${todayLog.in.latitude},${todayLog.in.longitude}`} target="_blank" rel="noreferrer" className="bg-white hover:bg-gray-50 border border-gray-200 text-[#3e2723] p-3 rounded-xl text-xs font-bold flex items-center justify-between transition-colors">
                            <span className="flex items-center gap-2"><i className="fa-solid fa-map-location-dot text-blue-500" /> Peta Masuk</span>
                            <i className="fa-solid fa-arrow-up-right-from-square text-gray-300" />
                          </a>
                        )}
                        {todayLog.out?.latitude && todayLog.out?.longitude && (
                          <a href={`https://www.google.com/maps?q=${todayLog.out.latitude},${todayLog.out.longitude}`} target="_blank" rel="noreferrer" className="bg-white hover:bg-gray-50 border border-gray-200 text-[#3e2723] p-3 rounded-xl text-xs font-bold flex items-center justify-between transition-colors">
                            <span className="flex items-center gap-2"><i className="fa-solid fa-map-location-dot text-orange-500" /> Peta Keluar</span>
                            <i className="fa-solid fa-arrow-up-right-from-square text-gray-300" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 md:overflow-y-auto p-4 md:p-8 bg-gray-50 flex flex-col lg:flex-row items-start gap-6 pb-12 md:pb-10">
                    <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 flex flex-col gap-3 shrink-0 flex-1 w-full overflow-hidden">
                        <div className="flex items-center gap-2 border-b border-gray-50 pb-2 shrink-0">
                          <div className="w-6 h-6 rounded-full bg-green-50 flex items-center justify-center shrink-0"><i className="fa-solid fa-arrow-right-to-bracket text-green-500 text-[10px]" /></div>
                          <p className="text-xs font-black text-[#3e2723] uppercase tracking-wider">Data Masuk</p>
                        </div>
                        
                        {todayLog.in ? (
                          <div className="flex overflow-x-auto flex-nowrap lg:flex-wrap lg:justify-center gap-4 pb-2 pt-1 snap-x snap-mandatory hide-scrollbar">
                            <FotoSlot src={todayLog.in?.custom_foto_absen} label={isOutlet ? "Wajah + Kanan" : "Selfie Wajah"} badge="Masuk" badgeColor="bg-green-500" />
                            {isOutlet && <FotoSlot src={todayLog.in?.custom_verification_image} label="Wajah + Kiri" badge="Masuk" badgeColor="bg-green-500" />}
                            <div className="flex flex-col gap-1.5 w-[140px] md:w-[180px] shrink-0 snap-center">
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide pl-1 text-center">Tanda Tangan</p>
                                <div className="rounded-2xl border-2 border-gray-100 bg-white overflow-hidden flex items-center justify-center relative shadow-sm p-2 aspect-[3/4] md:aspect-square">
                                  {todayLog.in?.custom_signature ? <img src={prosesUrlFoto(todayLog.in.custom_signature)} className="w-full h-full object-contain mix-blend-multiply" alt="TTD Masuk" loading="lazy" decoding="async" /> : <div className="flex flex-col items-center gap-1"><i className="fa-solid fa-pen-slash text-gray-300 text-xl" /><p className="text-[9px] text-gray-400 font-bold">Belum ada TTD</p></div>}
                                  <div className="absolute top-2 left-2 bg-green-500 text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-md border border-white/20">Masuk</div>
                                </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-gray-300 py-10 gap-2 bg-gray-50 rounded-xl border border-gray-100">
                            <i className="fa-solid fa-clock text-3xl" />
                            <p className="text-[10px] font-bold">Belum Absen Masuk</p>
                          </div>
                        )}
                    </div>

                    <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 flex flex-col gap-3 shrink-0 flex-1 w-full overflow-hidden">
                        <div className="flex items-center gap-2 border-b border-gray-50 pb-2 shrink-0">
                          <div className="w-6 h-6 rounded-full bg-orange-50 flex items-center justify-center shrink-0"><i className="fa-solid fa-arrow-right-from-bracket text-orange-500 text-[10px]" /></div>
                          <p className="text-xs font-black text-[#3e2723] uppercase tracking-wider">Data Keluar</p>
                        </div>
                        
                        {todayLog.out ? (
                          <div className="flex overflow-x-auto flex-nowrap lg:flex-wrap lg:justify-center gap-4 pb-2 pt-1 snap-x snap-mandatory hide-scrollbar">
                            <FotoSlot src={todayLog.out?.custom_foto_absen} label={isOutlet ? "Wajah + Kanan" : "Selfie Wajah"} badge="Keluar" badgeColor="bg-orange-500" />
                            {isOutlet && <FotoSlot src={todayLog.out?.custom_verification_image} label="Wajah + Kiri" badge="Keluar" badgeColor="bg-orange-500" />}
                            <div className="flex flex-col gap-1.5 w-[140px] md:w-[180px] shrink-0 snap-center">
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide pl-1 text-center">Tanda Tangan</p>
                                <div className="rounded-2xl border-2 border-gray-100 bg-white overflow-hidden flex items-center justify-center relative shadow-sm p-2 aspect-[3/4] md:aspect-square">
                                  {todayLog.out?.custom_signature ? <img src={prosesUrlFoto(todayLog.out.custom_signature)} className="w-full h-full object-contain p-2 mix-blend-multiply" alt="TTD Keluar" loading="lazy" decoding="async" /> : <div className="flex flex-col items-center gap-1"><i className="fa-solid fa-pen-slash text-gray-300 text-xl" /><p className="text-[9px] text-gray-400 font-bold">Belum ada TTD</p></div>}
                                  <div className="absolute top-2 left-2 bg-orange-500 text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-md border border-white/20">Keluar</div>
                                </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-gray-300 py-10 gap-2 bg-gray-50 rounded-xl border border-gray-100">
                            <i className="fa-solid fa-clock text-3xl" />
                            <p className="text-[10px] font-bold">Belum Absen Keluar</p>
                          </div>
                        )}
                    </div>
                  </div>

                </div>
              </div>
            </div>
          );
        } else {
          // MODAL BULANAN / PERIODE
          const sortedDates = Object.keys(emp.logsByDate).sort((a,b) => b.localeCompare(a));
          return (
            <div className="fixed inset-0 z-50 flex flex-col justify-end md:justify-center items-center p-0 md:p-8 bg-black/60 backdrop-blur-sm">
              <div className="bg-white w-full md:max-w-3xl max-h-[85vh] rounded-t-[2rem] md:rounded-[2rem] shadow-2xl flex flex-col overflow-hidden animate-zoomIn">
                
                {/* Header Modal */}
                <div className="bg-[#3e2723] p-5 md:p-6 relative flex justify-between items-center shrink-0">
                  <div>
                    <h2 className="text-lg md:text-xl font-black text-[#fbc02d]">{emp.employee_name}</h2>
                    <p className="text-[10px] md:text-xs font-bold text-white/70 uppercase tracking-wider">
                      {emp.employee} • Rekap {filterMode === 'bulanan' ? bulanAktif : `${periodeMulai} s/d ${periodeAkhir}`}
                    </p>
                  </div>
                  <button onClick={tutupModal} className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors border border-white/20 shrink-0">
                    <i className="fa-solid fa-xmark text-sm md:text-lg" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50 flex flex-col gap-3 pb-12 md:pb-10">
                  {(() => {
                    const empLeaveData = leaveMap[emp.employee] !== undefined
                      ? (() => {
                          const rawLeaves: any[] = leaveRawMap[emp.employee] ?? [];
                          let startDateObj: Date, endDateObj: Date;
                          if (filterMode === 'bulanan') {
                            const [year, month] = bulanAktif.split('-').map(Number);
                            startDateObj = new Date(year, month - 1, 1);
                            endDateObj = new Date(year, month, 0);
                          } else {
                            startDateObj = parseLokalDate(periodeMulai);
                            endDateObj = parseLokalDate(periodeAkhir);
                          }
                          const izinDates: Record<string, string> = {};
                          rawLeaves.filter(r => r.status?.toLowerCase() === 'approved').forEach((r: any) => {
                            const from = parseLokalDate(r.from_date);
                            const to = parseLokalDate(r.to_date);
                            const start = from < startDateObj ? startDateObj : from;
                            const end = to > endDateObj ? endDateObj : to;
                            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                              if (d.getDay() !== 0 && d.getDay() !== 6) {
                                const yyyy = d.getFullYear();
                                const mm = String(d.getMonth() + 1).padStart(2, '0');
                                const dd = String(d.getDate()).padStart(2, '0');
                                const key = `${yyyy}-${mm}-${dd}`;
                                izinDates[key] = r.leave_type;
                              }
                            }
                          });
                          return izinDates;
                        })()
                      : {};

                    const allDates = Array.from(new Set([
                      ...sortedDates,
                      ...Object.keys(empLeaveData),
                    ])).sort((a,b) => b.localeCompare(a));

                    if (allDates.length === 0) {
                      return <div className="py-8 text-center text-gray-400 font-bold">Tidak ada absen di periode ini</div>;
                    }

                    return allDates.map(date => {
                      const log = emp.logsByDate[date] ?? { in: null, out: null };
                      const izinType = empLeaveData[date];
                      
                      const timeStrIn = log.in?.time || log.in?.attendance_date;
                      const timeStrOut = log.out?.time || log.out?.attendance_date;
                      
                      const inJam = log.in ? formatJamLokal(timeStrIn) : '-';
                      const outJam = log.out ? formatJamLokal(timeStrOut) : '-';
                      
                      const shiftInfo = getJamShift(log.in?.shift || log.out?.shift, date, masterShifts, ramadhanDates);
                      const shiftLabel = getShiftLabel(date, ramadhanDates);
                      const isTelat = log.in && inJam !== '-' && toMenit(inJam) > toMenit(shiftInfo.in);
                      const isExpanded = expandedDateHR === date;
                      const isOutlet = emp.branch !== 'PH Klaten' && emp.branch !== 'Jakarta';

                      return (
                        <div key={date} className="bg-white rounded-2xl shadow-sm border border-gray-200 shrink-0">
                          <div
                            onClick={() => setExpandedDateHR(isExpanded ? null : date)}
                            className="p-3 md:p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors gap-2"
                          >
                            <div className="flex flex-col flex-1 min-w-0 pr-2">
                              <span className="font-bold text-[#3e2723] text-sm md:text-base leading-none">{date}</span>
                              <span className="text-[9px] md:text-[10px] text-gray-400 font-bold mt-0.5 truncate pr-2">{shiftLabel}</span>
                            </div>
                            
                            <div className="flex items-center gap-3 md:gap-6 shrink-0">
                              <div className="hidden sm:flex items-center gap-4 text-right border-r border-gray-200 pr-4 md:pr-6">
                                <div className="flex flex-col items-center">
                                  <p className="text-[8px] md:text-[9px] text-gray-400 uppercase font-bold tracking-wider">Masuk</p>
                                  <p className="font-black text-green-600 text-xs md:text-sm">{inJam}</p>
                                </div>
                                <div className="hidden sm:block">
                                  <p className="text-[8px] md:text-[9px] text-gray-400 uppercase font-bold tracking-wider">Keluar</p>
                                  <p className="font-black text-orange-500 text-xs md:text-sm">{outJam}</p>
                                </div>
                              </div>
                              
                              <div className="w-12 md:w-16 flex justify-center">
                                {izinType ? (
                                  <span className="bg-blue-50 text-blue-600 border border-blue-200 text-[9px] md:text-[10px] font-black px-2 py-1 rounded-md w-full text-center">Izin</span>
                                ) : isTelat ? (
                                  <span className="bg-red-50 text-red-600 border border-red-200 text-[9px] md:text-[10px] font-black px-2 py-1 rounded-md w-full text-center">Telat</span>
                                ) : log.in ? (
                                  <span className="bg-green-50 text-green-700 border border-green-200 text-[9px] md:text-[10px] font-black px-2 py-1 rounded-md w-full text-center">Tepat</span>
                                ) : (
                                  <span className="bg-gray-50 text-gray-400 border border-gray-200 text-[9px] md:text-[10px] font-black px-2 py-1 rounded-md w-full text-center">-</span>
                                )}
                              </div>
                              
                              <i className={`fa-solid fa-chevron-${isExpanded ? 'up' : 'down'} text-gray-400 text-xs w-4 text-center transition-transform`} />
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="p-3 md:p-4 bg-gray-50 border-t border-gray-100 rounded-b-2xl">
                              <div className="sm:hidden flex justify-between mb-4 bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                                 <div className="text-center w-1/2 border-r border-gray-100">
                                   <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">Masuk</p>
                                   <p className="font-black text-green-600 text-sm">{inJam}</p>
                                 </div>
                                 <div className="text-center w-1/2">
                                   <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">Keluar</p>
                                   <p className="font-black text-orange-500 text-sm">{outJam}</p>
                                 </div>
                              </div>

                              <div className="flex gap-2 mb-4">
                                {log.in?.latitude && log.in?.longitude && (
                                  <a href={`https://www.google.com/maps?q=${log.in.latitude},${log.in.longitude}`} target="_blank" rel="noreferrer" className="flex-1 bg-white hover:bg-gray-100 border border-gray-200 text-[#3e2723] p-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-colors">
                                    <i className="fa-solid fa-map-location-dot text-green-500" /> Peta Masuk
                                  </a>
                                )}
                                {log.out?.latitude && log.out?.longitude && (
                                  <a href={`https://www.google.com/maps?q=${log.out.latitude},${log.out.longitude}`} target="_blank" rel="noreferrer" className="flex-1 bg-white hover:bg-gray-100 border border-gray-200 text-[#3e2723] p-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-colors">
                                    <i className="fa-solid fa-map-location-dot text-orange-500" /> Peta Keluar
                                  </a>
                                )}
                              </div>

                              {izinType && !log.in && !log.out ? (
                                <div className="flex flex-col gap-3">
                                  <div className="text-xs font-bold text-blue-600 bg-blue-50 p-3 rounded-xl flex items-center gap-2 border border-blue-100">
                                    <i className="fa-solid fa-envelope-open-text" /> Keterangan Izin: {izinType}
                                  </div>
                                  
                                  {/* PREVIEW LAMPIRAN IZIN BULANAN (TIDAK ADA ABSEN) */}
                                  {(() => {
                                      const specificLeave = leaveRawMap[emp.employee]?.find(r => {
                                          const f = parseLokalDate(r.from_date);
                                          const t = parseLokalDate(r.to_date);
                                          const curr = parseLokalDate(date);
                                          return curr >= f && curr <= t;
                                      });
                                      if (specificLeave && getAttachmentIzin(specificLeave)) {
                                          return (
                                              <div className="flex-1 bg-white p-4 rounded-2xl shadow-sm border border-gray-100 w-full overflow-hidden min-w-[200px]">
                                                  <p className="text-[10px] font-black text-[#3e2723] uppercase tracking-wider mb-2 border-b border-gray-100 pb-1">Lampiran Bukti Izin</p>
                                                  <button onClick={() => setPreviewUrl(prosesUrlFoto(getAttachmentIzin(specificLeave)))}
                                                      className="w-24 h-24 rounded-xl overflow-hidden border border-gray-200 shadow-sm relative group block text-left mt-2">
                                                      <img src={prosesUrlFoto(getAttachmentIzin(specificLeave))} alt="Bukti Izin" className="w-full h-full object-cover" />
                                                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                          <i className="fa-solid fa-magnifying-glass text-white text-xs" />
                                                      </div>
                                                  </button>
                                              </div>
                                          );
                                      }
                                      return null;
                                  })()}
                                </div>
                              ) : (!log.in && !log.out) ? (
                                <div className="text-xs font-bold text-gray-400 text-center py-4">Belum ada absen</div>
                              ) : (
                                <div className="flex flex-col md:flex-row gap-4 flex-wrap">
                                  {/* MASUK */}
                                  {log.in && (
                                    <div className="flex-1 bg-white p-4 rounded-2xl shadow-sm border border-gray-100 w-full overflow-hidden min-w-[200px]">
                                      <p className="text-[10px] font-black text-[#3e2723] uppercase tracking-wider mb-2 border-b border-gray-100 pb-1">Data Masuk</p>
                                      <div className="flex overflow-x-auto flex-nowrap lg:flex-wrap lg:justify-center gap-4 pb-2 pt-1 snap-x snap-mandatory hide-scrollbar">
                                        <FotoSlot src={log.in.custom_foto_absen} label={isOutlet ? "Wajah + Kanan" : "Selfie Wajah"} badge="Masuk" badgeColor="bg-green-500" />
                                        {isOutlet && <FotoSlot src={log.in.custom_verification_image} label="Wajah + Kiri" badge="Masuk" badgeColor="bg-green-500" />}
                                        <div className="flex flex-col gap-1.5 w-[140px] md:w-[180px] shrink-0 snap-center">
                                          <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide pl-1 text-center">Tanda Tangan</p>
                                          <div className="rounded-2xl border-2 border-gray-100 bg-white overflow-hidden flex items-center justify-center relative shadow-sm p-2 aspect-[3/4] md:aspect-square">
                                            {log.in.custom_signature ? <img src={prosesUrlFoto(log.in.custom_signature)} className="w-full h-full object-contain mix-blend-multiply" alt="TTD Masuk" loading="lazy" decoding="async" /> : <div className="flex flex-col items-center gap-1"><i className="fa-solid fa-pen-slash text-gray-300 text-xl" /><p className="text-[9px] text-gray-400 font-bold">Belum ada TTD</p></div>}
                                            <div className="absolute top-2 left-2 bg-green-500 text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-md border border-white/20">Masuk</div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                  
                                  {/* KELUAR */}
                                  {log.out && (
                                    <div className="flex-1 bg-white p-4 rounded-2xl shadow-sm border border-gray-100 w-full overflow-hidden min-w-[200px]">
                                      <p className="text-[10px] font-black text-[#3e2723] uppercase tracking-wider mb-2 border-b border-gray-100 pb-1">Data Keluar</p>
                                      <div className="flex overflow-x-auto flex-nowrap lg:flex-wrap lg:justify-center gap-4 pb-2 pt-1 snap-x snap-mandatory hide-scrollbar">
                                        <FotoSlot src={log.out.custom_foto_absen} label={isOutlet ? "Wajah + Kanan" : "Selfie Wajah"} badge="Keluar" badgeColor="bg-orange-500" />
                                        {isOutlet && <FotoSlot src={log.out.custom_verification_image} label="Wajah + Kiri" badge="Keluar" badgeColor="bg-orange-500" />}
                                        <div className="flex flex-col gap-1.5 w-[140px] md:w-[180px] shrink-0 snap-center">
                                          <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide pl-1 text-center">Tanda Tangan</p>
                                          <div className="rounded-2xl border-2 border-gray-100 bg-white overflow-hidden flex items-center justify-center relative shadow-sm p-2 aspect-[3/4] md:aspect-square">
                                            {log.out.custom_signature ? <img src={prosesUrlFoto(log.out.custom_signature)} className="w-full h-full object-contain p-2 mix-blend-multiply" alt="TTD Keluar" loading="lazy" decoding="async" /> : <div className="flex flex-col items-center gap-1"><i className="fa-solid fa-pen-slash text-gray-300 text-xl" /><p className="text-[9px] text-gray-400 font-bold">Belum ada TTD</p></div>}
                                            <div className="absolute top-2 left-2 bg-orange-500 text-white text-[9px] font-black px-2 py-0.5 rounded-lg shadow-md border border-white/20">Keluar</div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* PREVIEW LAMPIRAN IZIN BULANAN (JIKA ADA ABSEN) */}
                                  {izinType && (() => {
                                      const specificLeave = leaveRawMap[emp.employee]?.find(r => {
                                          const f = parseLokalDate(r.from_date);
                                          const t = parseLokalDate(r.to_date);
                                          const curr = parseLokalDate(date);
                                          return curr >= f && curr <= t;
                                      });
                                      if (specificLeave && getAttachmentIzin(specificLeave)) {
                                          return (
                                              <div className="flex-1 bg-white p-4 rounded-2xl shadow-sm border border-gray-100 w-full overflow-hidden min-w-[200px]">
                                                  <p className="text-[10px] font-black text-[#3e2723] uppercase tracking-wider mb-2 border-b border-gray-100 pb-1">Lampiran Bukti Izin</p>
                                                  <button onClick={() => setPreviewUrl(prosesUrlFoto(getAttachmentIzin(specificLeave)))}
                                                      className="w-24 h-24 rounded-xl overflow-hidden border border-gray-200 shadow-sm relative group block text-left mt-2">
                                                      <img src={prosesUrlFoto(getAttachmentIzin(specificLeave))} alt="Bukti Izin" className="w-full h-full object-cover" />
                                                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                          <i className="fa-solid fa-magnifying-glass text-white text-xs" />
                                                      </div>
                                                  </button>
                                              </div>
                                          );
                                      }
                                      return null;
                                  })()}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          );
        }
      })()}

      {/* ── PREVIEW GAMBAR FULLSIZE ── */}
      {previewUrl && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 md:p-10"
          style={{ background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(8px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setPreviewUrl(null); }}>
          <div className="w-full max-w-2xl flex flex-col gap-4 relative">
            <div className="flex justify-between items-center bg-gradient-to-b from-black/50 to-transparent p-4 absolute top-0 left-0 right-0 z-10">
              <p className="text-white font-black text-sm drop-shadow-md"><i className="fa-regular fa-image mr-2 text-[#fbc02d]"></i>Bukti Lampiran</p>
              <button onClick={() => setPreviewUrl(null)}
                className="w-10 h-10 bg-white/20 backdrop-blur-md text-white rounded-full flex items-center justify-center hover:bg-red-500 transition-colors border border-white/20">
                <i className="fa-solid fa-xmark text-lg" />
              </button>
            </div>
            <div className="rounded-[2rem] overflow-hidden bg-black/40 max-h-[85vh] flex items-center justify-center shadow-2xl border border-white/10 mt-14">
              <img src={previewUrl} alt="Bukti Izin Full" className="w-full object-contain max-h-[80vh]" />
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes zoomIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-zoomIn { animation: zoomIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};

export default DashboardHR;