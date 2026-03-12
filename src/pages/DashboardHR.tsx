import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import * as XLSX from 'xlsx';

interface RiwayatAbsen {
  name: string;
  employee: string;
  employee_name?: string;
  time: string;
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
  logsByDate: Record<string, DayLog>;
}

// ── HELPER ──
const formatJamLokal = (timeString?: string) => {
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

// Derive nama label shift dari tanggal (tanpa info branch per karyawan, default PH Klaten)
// Sama persis dengan getShiftKantor di Absen.tsx —
// selalu derive dari tanggal, ABAIKAN nama shift dari ERPNext
// karena ERPNext hanya punya shift Senin-Kamis, sedangkan Jumat di-override manual
const getShiftLabel = (tanggal: string): string => {
  const tglDate = new Date(tanggal);
  const hari = tglDate.getDay();
  if (hari === 0 || hari === 6) return 'Libur';
  const isFriday = hari === 5;
  const ramadhan = isRamadhan();
  const hariLabel = isFriday ? 'Jumat' : 'Senin - Kamis';
  const periodeLabel = ramadhan ? 'Ramadhan' : 'Non Ramadhan';
  return `${hariLabel} (PH Klaten ${periodeLabel})`;
};

const getJamShift = (
  shiftNameFromRecord: string | undefined,
  tanggal: string,
  masterShifts: Record<string, { in: string; out: string }>
): { in: string; out: string } => {
  const tglDate = new Date(tanggal);
  const isFriday = tglDate.getDay() === 5;
  const ramadhan = isRamadhan();
  // Kalau Jumat: pakai jam override, JANGAN pakai shift ERPNext (yang isinya Senin-Kamis)
  // Kalau bukan Jumat: coba lookup dari masterShifts dulu
  if (!isFriday && shiftNameFromRecord && masterShifts[shiftNameFromRecord]) {
    return masterShifts[shiftNameFromRecord];
  }
  if (ramadhan) return isFriday ? { in: '07:00', out: '16:00' } : { in: '07:00', out: '15:30' };
  return isFriday ? { in: '07:30', out: '17:00' } : { in: '07:30', out: '16:30' };
};

const DashboardHR = () => {
  const navigate = useNavigate();
  const BACKEND = (import.meta as any).env?.VITE_API_URL || 'https://ropi-hr-backend.vercel.app';
  const ERPNEXT_URL = 'http://103.187.147.240';

  const [dataAbsen, setDataAbsen] = useState<EmployeeSummary[]>([]);
  const [leaveMap, setLeaveMap] = useState<Record<string, number>>({});
  const [leaveRawMap, setLeaveRawMap] = useState<Record<string, any[]>>({});
  const [masterShifts, setMasterShifts] = useState<Record<string, { in: string; out: string }>>({});
  const [isLoading, setIsLoading] = useState(false);

  const [filterMode, setFilterMode] = useState<'harian' | 'bulanan'>('harian');
  const tzOffset = (new Date()).getTimezoneOffset() * 60000;
  const localISOTime = (new Date(Date.now() - tzOffset)).toISOString().slice(0, 10);

  const [tanggalAktif, setTanggalAktif] = useState(localISOTime);
  const [bulanAktif, setBulanAktif] = useState(localISOTime.substring(0, 7));

  const [detailModal, setDetailModal] = useState<EmployeeSummary | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem('ropi_user');
    if (!userData) { navigate('/'); return; }
    const parsedUser = JSON.parse(userData);
    const allowedRoles = ['HR', 'HR Manager', 'System Manager'];
    if (!allowedRoles.includes(parsedUser.role)) {
      alert('Akses Ditolak! Anda tidak memiliki hak akses HRD.');
      navigate('/home', { replace: true });
    } else {
      ambilMasterShift();
    }
  }, [navigate]);

  useEffect(() => { tarikDataSemuaKaryawan(); }, [tanggalAktif, bulanAktif, filterMode, masterShifts]);

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
    } catch (e) { console.error('Gagal menarik shift'); }
  };

  const tarikDataSemuaKaryawan = async () => {
    if (Object.keys(masterShifts).length === 0) return;
    setIsLoading(true);

    let from = tanggalAktif, to = tanggalAktif;
    if (filterMode === 'bulanan') {
      from = `${bulanAktif}-01`;
      const year = parseInt(bulanAktif.split('-')[0]);
      const month = parseInt(bulanAktif.split('-')[1]);
      const lastDay = new Date(year, month, 0).getDate();
      to = `${bulanAktif}-${lastDay}`;
    }

    try {
      const res = await fetch(`${BACKEND}/api/attendance/all-history?from=${from}&to=${to}`);
      const result = await res.json();
      if (result.success && result.data) {
        const grouped: Record<string, EmployeeSummary> = {};

        result.data.forEach((item: RiwayatAbsen) => {
          if (!grouped[item.employee]) {
            grouped[item.employee] = {
              employee: item.employee,
              employee_name: item.employee_name || item.employee,
              totalHadir: 0, totalTelat: 0, totalCepat: 0, totalIzin: 0,
              logsByDate: {}
            };
          }
          const dateKey = item.time.substring(0, 10);
          if (!grouped[item.employee].logsByDate[dateKey])
            grouped[item.employee].logsByDate[dateKey] = { in: null, out: null };

          if (item.log_type === 'IN') {
            if (!grouped[item.employee].logsByDate[dateKey].in || item.time < grouped[item.employee].logsByDate[dateKey].in!.time)
              grouped[item.employee].logsByDate[dateKey].in = item;
          } else {
            if (!grouped[item.employee].logsByDate[dateKey].out || item.time > grouped[item.employee].logsByDate[dateKey].out!.time)
              grouped[item.employee].logsByDate[dateKey].out = item;
          }
        });

        Object.values(grouped).forEach(emp => {
          let hadir = 0, telat = 0, cepat = 0;
          Object.entries(emp.logsByDate).forEach(([date, log]) => {
            if (log.in) hadir++;
            const shiftInfo = getJamShift(log.in?.shift || log.out?.shift, date, masterShifts);
            if (log.in && toMenit(formatJamLokal(log.in.time)) > toMenit(shiftInfo.in)) telat++;
            if (log.out && toMenit(shiftInfo.out) > toMenit(formatJamLokal(log.out.time))) cepat++;
          });
          emp.totalHadir = hadir; emp.totalTelat = telat; emp.totalCepat = cepat;
        });

        const arrData = Object.values(grouped).sort((a, b) => a.employee_name.localeCompare(b.employee_name));
        setDataAbsen(arrData);

        // Fetch leave per karyawan secara paralel
        if (filterMode === 'bulanan') {
          const leaveResults = await Promise.allSettled(
            arrData.map(emp =>
              fetch(`${BACKEND}/api/attendance/leave-history?employee_id=${encodeURIComponent(emp.employee)}`)
                .then(r => r.json())
                .then(d => ({ employee: emp.employee, data: d.success ? d.data : [] }))
                .catch(() => ({ employee: emp.employee, data: [] }))
            )
          );
          const newLeaveMap: Record<string, number> = {};
          const newLeaveRawMap: Record<string, any[]> = {};
          leaveResults.forEach(result => {
            if (result.status === 'fulfilled') {
              const { employee, data } = result.value;
              const year = parseInt(bulanAktif.split('-')[0]);
              const month = parseInt(bulanAktif.split('-')[1]) - 1;
              const bulanMulai = new Date(year, month, 1);
              const bulanAkhir = new Date(year, month + 1, 0);
              let totalIzin = 0;
              (data as any[]).filter(r => r.status?.toLowerCase() !== 'rejected').forEach((r: any) => {
                const from = new Date(r.from_date);
                const to = new Date(r.to_date);
                const start = from < bulanMulai ? bulanMulai : from;
                const end = to > bulanAkhir ? bulanAkhir : to;
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
          // Harian: fetch leave dari seluruh bulan aktif agar dapat semua karyawan
          // (termasuk yang hanya izin tapi tidak absen hari ini)
          const bulanRef = tanggalAktif.substring(0, 7); // "YYYY-MM"
          const [yr, mo] = bulanRef.split('-').map(Number);
          const lastDay = new Date(yr, mo, 0).getDate();
          const fromBulan = `${bulanRef}-01`;
          const toBulan = `${bulanRef}-${lastDay}`;

          // Fetch all-history sebulan untuk dapat semua employee_id
          let allEmployeeIds: { employee: string; employee_name: string }[] = [...arrData];
          try {
            const resBulan = await fetch(`${BACKEND}/api/attendance/all-history?from=${fromBulan}&to=${toBulan}`);
            const dataBulan = await resBulan.json();
            if (dataBulan.success && dataBulan.data) {
              const empMap: Record<string, string> = {};
              dataBulan.data.forEach((item: any) => {
                if (!empMap[item.employee]) empMap[item.employee] = item.employee_name || item.employee;
              });
              // Merge — pastikan semua karyawan ada
              Object.entries(empMap).forEach(([id, name]) => {
                if (!allEmployeeIds.find(e => e.employee === id)) {
                  allEmployeeIds.push({ employee: id, employee_name: name });
                }
              });
            }
          } catch { /* pakai arrData saja */ }

          // Fetch leave semua karyawan
          const leaveResults = await Promise.allSettled(
            allEmployeeIds.map(emp =>
              fetch(`${BACKEND}/api/attendance/leave-history?employee_id=${encodeURIComponent(emp.employee)}`)
                .then(r => r.json())
                .then(d => ({ employee: emp.employee, employee_name: emp.employee_name, data: d.success ? d.data : [] }))
                .catch(() => ({ employee: emp.employee, employee_name: emp.employee_name, data: [] }))
            )
          );

          const newLeaveMap: Record<string, number> = {};
          const newLeaveRawMap: Record<string, any[]> = {};
          const extraEmployees: EmployeeSummary[] = [];

          leaveResults.forEach(result => {
            if (result.status === 'fulfilled') {
              const { employee, employee_name, data } = result.value;
              const izinHariIni = (data as any[]).filter(r => r.status?.toLowerCase() !== 'rejected').find((r: any) => {
                const from = new Date(r.from_date);
                const to = new Date(r.to_date);
                const tgl = new Date(tanggalAktif);
                return tgl >= from && tgl <= to;
              });
              newLeaveMap[employee] = izinHariIni ? 1 : 0;
              newLeaveRawMap[employee] = data as any[];

              // Kalau karyawan ini izin tapi tidak ada di arrData (tidak absen hari ini)
              if (izinHariIni && !arrData.find(e => e.employee === employee)) {
                extraEmployees.push({
                  employee,
                  employee_name,
                  totalHadir: 0, totalTelat: 0, totalCepat: 0, totalIzin: 1,
                  logsByDate: {},
                });
              }
            }
          });

          // Merge karyawan izin-only ke arrData
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
    if (url.startsWith('/files')) return ERPNEXT_URL + url;
    return url;
  };

  const downloadExcel = () => {
    if (dataAbsen.length === 0) { alert('Tidak ada data untuk di-download!'); return; }
    const dataExcel: any[] = [];
    dataAbsen.forEach((emp) => {
      // Expand izin per hari untuk Excel
      const empIzinDates: Record<string, string> = {};
      const rawLeaves: any[] = leaveRawMap[emp.employee] ?? [];
      if (filterMode === 'bulanan') {
        const [year, month] = bulanAktif.split('-').map(Number);
        const bulanMulai = new Date(year, month - 1, 1);
        const bulanAkhir = new Date(year, month, 0);
        rawLeaves.filter(r => r.status?.toLowerCase() !== 'rejected').forEach((r: any) => {
          const from = new Date(r.from_date);
          const to = new Date(r.to_date);
          const start = from < bulanMulai ? bulanMulai : from;
          const end = to > bulanAkhir ? bulanAkhir : to;
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            if (d.getDay() !== 0 && d.getDay() !== 6) {
              const key = d.toISOString().substring(0, 10);
              empIzinDates[key] = r.leave_type;
            }
          }
        });
      } else {
        // Harian: cek apakah tanggalAktif masuk izin
        const izinHariIni = rawLeaves.filter(r => r.status?.toLowerCase() !== 'rejected').find((r: any) => {
          const from = new Date(r.from_date);
          const to = new Date(r.to_date);
          const tgl = new Date(tanggalAktif);
          return tgl >= from && tgl <= to;
        });
        if (izinHariIni) empIzinDates[tanggalAktif] = izinHariIni.leave_type;
      }

      // Semua tanggal: absen + izin
      const allDates = Array.from(new Set([
        ...Object.keys(emp.logsByDate),
        ...Object.keys(empIzinDates),
      ])).sort();

      allDates.forEach(date => {
        const log = emp.logsByDate[date] ?? { in: null, out: null };
        const izinType = empIzinDates[date];
        const inJam = log.in ? formatJamLokal(log.in.time) : '-';
        const outJam = log.out ? formatJamLokal(log.out.time) : '-';
        const shiftInfo = getJamShift(log.in?.shift || log.out?.shift, date, masterShifts);
        const shiftLabel = getShiftLabel(date);
        let telat = '-';
        if (log.in) { const s = toMenit(inJam) - toMenit(shiftInfo.in); if (s > 0) telat = formatDurasi(s); }
        let pulangCepat = '-';
        if (log.out) { const s = toMenit(shiftInfo.out) - toMenit(outJam); if (s > 0) pulangCepat = formatDurasi(s); }

        // Baris izin tanpa absen
        if (izinType && !log.in && !log.out) {
          dataExcel.push({
            'Tanggal': date,
            'ID Karyawan': emp.employee,
            'Nama Karyawan': emp.employee_name,
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
          'Shift': shiftLabel,
          'Jam Shift': `${shiftInfo.in} - ${shiftInfo.out}`,
          'Jam Masuk': inJam,
          'Jam Keluar': outJam,
          'Keterlambatan': telat,
          'Pulang Cepat': pulangCepat,
          'Status': izinType ? `Hadir + Izin (${izinType})` : (log.in ? (telat !== '-' ? `Telat ${telat}` : 'Tepat') : '-'),
          'Lokasi Masuk': log.in?.latitude ? `https://maps.google.com/?q=${log.in.latitude},${log.in.longitude}` : '-',
          'Lokasi Keluar': log.out?.latitude ? `https://maps.google.com/?q=${log.out.latitude},${log.out.longitude}` : '-',
        });
      });
    });
    dataExcel.sort((a, b) => a.Tanggal.localeCompare(b.Tanggal) || a['Nama Karyawan'].localeCompare(b['Nama Karyawan']));
    const worksheet = XLSX.utils.json_to_sheet(dataExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Absen");

    // Sheet ringkasan per karyawan (bulanan saja)
    if (filterMode === 'bulanan') {
      const ringkasan = dataAbsen.map(emp => ({
        'ID Karyawan': emp.employee,
        'Nama Karyawan': emp.employee_name,
        'Total Hadir': emp.totalHadir,
        'Total Telat': emp.totalTelat,
        'Total Izin (Hari)': leaveMap[emp.employee] ?? 0,
      }));
      const wsRingkasan = XLSX.utils.json_to_sheet(ringkasan);
      XLSX.utils.book_append_sheet(workbook, wsRingkasan, "Ringkasan");
    }

    const namaFile = filterMode === 'harian' ? `Laporan_Harian_${tanggalAktif}.xlsx` : `Laporan_Bulanan_${bulanAktif}.xlsx`;
    XLSX.writeFile(workbook, namaFile);
  };

  let globalHadir = 0, globalTelat = 0, globalIzin = 0;
  dataAbsen.forEach(emp => {
    if (filterMode === 'harian') {
      const todayLog = emp.logsByDate[tanggalAktif];
      if (todayLog?.in) {
        globalHadir++;
        const shiftInfo = getJamShift(todayLog.in.shift, tanggalAktif, masterShifts);
        if (toMenit(formatJamLokal(todayLog.in.time)) > toMenit(shiftInfo.in)) globalTelat++;
      }
      if (leaveMap[emp.employee] === 1) globalIzin++;
    } else {
      globalHadir += emp.totalHadir;
      globalTelat += emp.totalTelat;
      globalIzin += leaveMap[emp.employee] ?? 0;
    }
  });

  const handleLogout = () => {
    localStorage.removeItem('ropi_user');
    navigate('/login', { replace: true });
  };

  return (
    <div className="bg-gray-200 min-h-screen font-sans w-full text-[#3e2723] pb-10">

      {/* ── HEADER ── */}
      <div className="bg-[#3e2723] pt-8 pb-8 px-6 md:px-12 shadow-lg sticky top-0 z-20 w-full rounded-b-[2.5rem]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <button onClick={handleLogout} title="Logout" className="w-10 h-10 bg-white/10 hover:bg-red-500/30 border border-white/20 hover:border-red-400/50 text-white/60 hover:text-red-300 rounded-full flex items-center justify-center active:scale-95 transition-all shrink-0">
              <i className="fa-solid fa-arrow-right-from-bracket text-base" />
            </button>
            <div>
              <h1 className="text-2xl font-black text-[#fbc02d]">HR Command Center</h1>
              <p className="text-xs text-white/70 font-bold uppercase tracking-widest mt-1">Laporan Kehadiran Karyawan</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex bg-white/10 rounded-2xl p-1.5 w-full md:w-auto border border-white/10 shadow-inner">
              <button onClick={() => setFilterMode('harian')} className={`px-5 py-2 text-xs font-black rounded-xl w-1/2 md:w-auto transition-all ${filterMode === 'harian' ? 'bg-[#fbc02d] text-[#3e2723] shadow' : 'text-white hover:bg-white/20'}`}>Harian</button>
              <button onClick={() => setFilterMode('bulanan')} className={`px-5 py-2 text-xs font-black rounded-xl w-1/2 md:w-auto transition-all ${filterMode === 'bulanan' ? 'bg-[#fbc02d] text-[#3e2723] shadow' : 'text-white hover:bg-white/20'}`}>Bulanan</button>
            </div>
            <div className="flex items-center bg-white/10 rounded-2xl px-4 py-2 w-full md:w-auto border border-white/10 shadow-sm">
              {filterMode === 'harian'
                ? <input type="date" value={tanggalAktif} onChange={(e) => setTanggalAktif(e.target.value)} className="bg-transparent text-white font-bold text-sm outline-none cursor-pointer w-full" style={{ colorScheme: 'dark' }} />
                : <input type="month" value={bulanAktif} onChange={(e) => setBulanAktif(e.target.value)} className="bg-transparent text-white font-bold text-sm outline-none cursor-pointer w-full" style={{ colorScheme: 'dark' }} />
              }
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <div className="bg-green-500/20 rounded-2xl px-5 py-2 flex flex-col items-center justify-center flex-1 md:flex-none border border-green-500/30 text-white min-w-[90px]">
                <p className="text-[10px] text-green-300 font-bold uppercase tracking-wide">Hadir</p>
                <p className="font-black text-2xl leading-none mt-1">{globalHadir}</p>
              </div>
              <div className="bg-red-500/20 rounded-2xl px-5 py-2 flex flex-col items-center justify-center flex-1 md:flex-none border border-red-500/30 text-white min-w-[90px]">
                <p className="text-[10px] text-red-300 font-bold uppercase tracking-wide">Telat</p>
                <p className="font-black text-2xl leading-none mt-1">{globalTelat}</p>
              </div>
              <div className="bg-blue-500/20 rounded-2xl px-5 py-2 flex flex-col items-center justify-center flex-1 md:flex-none border border-blue-500/30 text-white min-w-[90px]">
                <p className="text-[10px] text-blue-300 font-bold uppercase tracking-wide">Izin</p>
                <p className="font-black text-2xl leading-none mt-1">{globalIzin}</p>
              </div>
            </div>
            <button onClick={downloadExcel} className="bg-[#fbc02d] hover:bg-[#f9a825] text-[#3e2723] font-black px-6 py-3.5 rounded-2xl shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95 w-full md:w-auto">
              <i className="fa-solid fa-file-excel text-lg" /> <span>Export Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── GRID KARYAWAN ── */}
      <div className="max-w-7xl mx-auto p-6 md:p-8 -mt-4 relative z-10">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center pt-24 text-gray-500">
            <i className="fa-solid fa-spinner fa-spin text-5xl mb-4 text-[#fbc02d]" />
            <p className="font-bold text-lg">Memuat data absensi...</p>
          </div>
        ) : dataAbsen.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-24 text-gray-400">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
              <i className="fa-solid fa-users-slash text-4xl text-gray-300" />
            </div>
            <p className="font-bold text-lg text-gray-500">Tidak ada data kehadiran di periode ini.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {dataAbsen.map((emp) => {
              const todayLog = filterMode === 'harian' ? (emp.logsByDate[tanggalAktif] || { in: null, out: null }) : null;
              const inJam = todayLog?.in ? formatJamLokal(todayLog.in.time) : '-';
              const outJam = todayLog?.out ? formatJamLokal(todayLog.out.time) : '-';
              const shiftInfo = getJamShift(todayLog?.in?.shift || todayLog?.out?.shift, tanggalAktif, masterShifts);
              const shiftLabel = getShiftLabel(tanggalAktif);
              const isTelat = todayLog?.in && toMenit(inJam) > toMenit(shiftInfo.in);

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

                  {/* Avatar + Nama */}
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-14 h-14 rounded-full overflow-hidden bg-[#fff8e1] shrink-0 border-2 border-white shadow-sm relative">
                      {avatarSrc
                        ? <img src={prosesUrlFoto(avatarSrc)} className="w-full h-full object-cover" />
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
                        <span className="inline-block mt-1.5 bg-[#fff8e1] text-[#fbc02d] border border-[#fbc02d]/50 text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">Rekap Bulanan</span>
                      )}
                    </div>
                  </div>

                  {/* Shift label — baris baru khusus */}
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

                  {/* Jam Masuk / Keluar atau Rekap */}
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
                        const izinHariIni = rawLeaves.filter(r => r.status?.toLowerCase() !== 'rejected').find((r: any) => {
                          const from = new Date(r.from_date);
                          const to = new Date(r.to_date);
                          const tgl = new Date(tanggalAktif);
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
        )}
      </div>

      {/* ── MODAL DETAIL ── */}
      {detailModal && (() => {
        const emp = detailModal;

        if (filterMode === 'harian') {
          const todayLog = emp.logsByDate[tanggalAktif] || { in: null, out: null };
          const shiftInfo = getJamShift(todayLog.in?.shift || todayLog.out?.shift, tanggalAktif, masterShifts);
          const shiftLabel = getShiftLabel(tanggalAktif);
          const inJam = todayLog.in ? formatJamLokal(todayLog.in.time) : '-';
          const outJam = todayLog.out ? formatJamLokal(todayLog.out.time) : '-';

          let durasiTelat = 0, durasiCepat = 0;
          if (todayLog.in) { const s = toMenit(inJam) - toMenit(shiftInfo.in); if (s > 0) durasiTelat = s; }
          if (todayLog.out) { const s = toMenit(shiftInfo.out) - toMenit(outJam); if (s > 0) durasiCepat = s; }

          const FotoBesar = ({ src, icon, title, isSignature = false }: any) => (
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide pl-1">{title}</p>
              <div className="relative bg-gray-50 rounded-2xl overflow-hidden shadow-inner border border-gray-200 flex items-center justify-center" style={{ height: isSignature ? '120px' : '220px' }}>
                {src
                  ? <img src={prosesUrlFoto(src)} className={`w-full h-full ${isSignature ? 'object-contain p-2 bg-white' : 'object-cover'}`} />
                  : <div className="flex flex-col items-center gap-2 text-gray-300">
                      <i className={`fa-solid ${icon} text-3xl`} />
                      <p className="text-[10px] font-bold">Tidak ada foto</p>
                    </div>
                }
              </div>
            </div>
          );

          // Cari izin hari ini sekali saja
          const izinHariIniData = (() => {
            if (leaveMap[emp.employee] !== 1) return null;
            const rawLeaves: any[] = leaveRawMap[emp.employee] ?? [];
            return rawLeaves.filter(r => r.status?.toLowerCase() !== 'rejected').find((r: any) => {
              const from = new Date(r.from_date);
              const to = new Date(r.to_date);
              const tgl = new Date(tanggalAktif);
              return tgl >= from && tgl <= to;
            }) ?? null;
          })();

          return (
            <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-8" style={{ background: 'rgba(62,39,35,0.85)', backdropFilter: 'blur(8px)' }}>
              <div className="bg-white w-full max-w-4xl md:max-h-[95vh] rounded-t-[2rem] md:rounded-[2rem] shadow-2xl flex flex-col md:flex-row overflow-hidden animate-zoomIn" style={{ maxHeight: '92vh' }}>

                {/* ── HEADER mobile: nama + tombol tutup (sticky) ── */}
                <div className="bg-[#3e2723] px-5 py-4 flex items-center gap-3 shrink-0 md:hidden">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-[#fff8e1] shrink-0 border-2 border-white/30">
                    {todayLog.in?.custom_foto_absen
                      ? <img src={prosesUrlFoto(todayLog.in.custom_foto_absen)} className="w-full h-full object-cover" />
                      : <i className="fa-solid fa-user text-[#fbc02d] text-lg flex items-center justify-center w-full h-full pt-2" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-white text-base leading-tight truncate">{emp.employee_name}</p>
                    <p className="text-[10px] text-white/50 font-bold">{emp.employee}</p>
                  </div>
                  <button onClick={() => setDetailModal(null)} className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center shrink-0">
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>

                {/* ── KOLOM KIRI (desktop) / INFO SECTION (mobile) ── */}
                <div className="bg-white md:w-1/3 flex flex-col shrink-0 md:shadow-[5px_0_15px_rgba(0,0,0,0.03)]">

                  {/* Avatar + nama — hanya desktop */}
                  <div className="hidden md:block p-8 border-b border-gray-100 relative">
                    <button onClick={() => setDetailModal(null)} className="absolute top-6 right-6 w-8 h-8 rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-500 text-gray-400 flex items-center justify-center transition-colors">
                      <i className="fa-solid fa-xmark text-lg" />
                    </button>
                    <div className="w-20 h-20 rounded-full overflow-hidden bg-[#fff8e1] border-4 border-white shadow-md mb-4 relative">
                      {todayLog.in?.custom_foto_absen
                        ? <img src={prosesUrlFoto(todayLog.in.custom_foto_absen)} className="w-full h-full object-cover" />
                        : <i className="fa-solid fa-user text-[#fbc02d] text-4xl absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                      }
                    </div>
                    <h2 className="text-2xl font-black text-[#3e2723] leading-tight mb-1">{emp.employee_name}</h2>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{emp.employee}</p>
                  </div>

                  {/* Info: shift, masuk/keluar, izin, peta */}
                  <div className="p-4 md:p-8 md:flex-1 md:overflow-y-auto">
                    {/* Shift compact */}
                    <div className="bg-[#fff8e1] px-4 py-3 rounded-2xl border border-[#fbc02d]/30 mb-3 flex items-center gap-3">
                      <i className="fa-solid fa-calendar-check text-[#fbc02d] shrink-0" />
                      <div>
                        <p className="text-[10px] text-[#3e2723]/50 font-bold uppercase leading-none mb-0.5">Jadwal Shift</p>
                        <p className="font-black text-[#3e2723] text-xs leading-snug">{shiftLabel}</p>
                        <p className="font-bold text-[#3e2723] text-sm">{shiftInfo.in} → {shiftInfo.out}</p>
                      </div>
                    </div>

                    {/* Masuk / Keluar */}
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

                    {/* Izin */}
                    {izinHariIniData && (
                      <div className="mb-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 flex items-start gap-3">
                        <i className="fa-solid fa-envelope-open-text text-blue-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[10px] text-blue-500 font-bold uppercase mb-0.5">Izin Hari Ini</p>
                          <p className="text-sm font-black text-blue-800">{izinHariIniData.leave_type}</p>
                          {izinHariIniData.description && <p className="text-[10px] text-blue-600 mt-0.5">{izinHariIniData.description}</p>}
                        </div>
                      </div>
                    )}

                    {/* Peta */}
                    <div className="flex flex-col gap-2">
                      {todayLog.in?.latitude && (
                        <a href={`https://maps.google.com/?q=${todayLog.in.latitude},${todayLog.in.longitude}`} target="_blank" rel="noreferrer" className="bg-white hover:bg-gray-50 border border-gray-200 text-[#3e2723] p-3 rounded-xl text-xs font-bold flex items-center justify-between transition-colors">
                          <span className="flex items-center gap-2"><i className="fa-solid fa-map-location-dot text-blue-500" /> Peta Masuk</span>
                          <i className="fa-solid fa-arrow-up-right-from-square text-gray-300" />
                        </a>
                      )}
                      {todayLog.out?.latitude && (
                        <a href={`https://maps.google.com/?q=${todayLog.out.latitude},${todayLog.out.longitude}`} target="_blank" rel="noreferrer" className="bg-white hover:bg-gray-50 border border-gray-200 text-[#3e2723] p-3 rounded-xl text-xs font-bold flex items-center justify-between transition-colors">
                          <span className="flex items-center gap-2"><i className="fa-solid fa-map-location-dot text-orange-500" /> Peta Keluar</span>
                          <i className="fa-solid fa-arrow-up-right-from-square text-gray-300" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── KOLOM KANAN: Galeri foto (scrollable) ── */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50/50">
                  <h3 className="font-black text-[#3e2723] text-base mb-3 flex items-center gap-2">
                    <i className="fa-solid fa-images text-[#fbc02d]" /> Galeri Autentikasi
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
                    {[
                      { label: 'Data Masuk', log: todayLog.in, iconColor: 'bg-green-100 text-green-600', icon: 'fa-arrow-right-to-bracket' },
                      { label: 'Data Keluar', log: todayLog.out, iconColor: 'bg-orange-100 text-orange-600', icon: 'fa-arrow-right-from-bracket' },
                    ].map(({ label, log, iconColor, icon }) => (
                      <div key={label} className="flex flex-col gap-3 bg-white p-3 md:p-5 rounded-2xl shadow-sm border border-gray-100">
                        <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                          <div className={`w-6 h-6 rounded-full ${iconColor} flex items-center justify-center shrink-0`}>
                            <i className={`fa-solid ${icon} text-[10px]`} />
                          </div>
                          <p className="font-black text-[#3e2723] text-xs uppercase">{label}</p>
                        </div>
                        <FotoBesar src={log?.custom_foto_absen} icon="fa-camera" title="Selfie Wajah" />
                        <FotoBesar src={log?.custom_verification_image} icon="fa-fingerprint" title="Mesin Finger" />
                        <FotoBesar src={log?.custom_signature} icon="fa-pen-nib" title="Tanda Tangan" isSignature={true} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        } else {
          // MODAL BULANAN
          const sortedDates = Object.keys(emp.logsByDate).sort();
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8" style={{ background: 'rgba(62,39,35,0.85)', backdropFilter: 'blur(8px)' }}>
              <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden animate-zoomIn">
                <div className="bg-[#3e2723] p-6 relative flex justify-between items-center shrink-0">
                  <div>
                    <h2 className="text-xl font-black text-[#fbc02d]">{emp.employee_name}</h2>
                    <p className="text-xs font-bold text-white/70 uppercase tracking-wider">{emp.employee} • Rekap {bulanAktif}</p>
                  </div>
                  <button onClick={() => setDetailModal(null)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors border border-white/20">
                    <i className="fa-solid fa-xmark text-lg" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                  {(() => {
                    // Expand leave records ke baris per hari
                    const empLeaveData = leaveMap[emp.employee] !== undefined
                      ? (() => {
                          // Ambil leave raw dari state baru leaveRawMap
                          const rawLeaves: any[] = leaveRawMap[emp.employee] ?? [];
                          const [year, month] = bulanAktif.split('-').map(Number);
                          const bulanMulai = new Date(year, month - 1, 1);
                          const bulanAkhir = new Date(year, month, 0);
                          const izinDates: Record<string, string> = {};
                          rawLeaves.filter(r => r.status?.toLowerCase() !== 'rejected').forEach((r: any) => {
                            const from = new Date(r.from_date);
                            const to = new Date(r.to_date);
                            const start = from < bulanMulai ? bulanMulai : from;
                            const end = to > bulanAkhir ? bulanAkhir : to;
                            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                              if (d.getDay() !== 0 && d.getDay() !== 6) {
                                const key = d.toISOString().substring(0, 10);
                                izinDates[key] = r.leave_type;
                              }
                            }
                          });
                          return izinDates;
                        })()
                      : {};

                    // Gabung semua tanggal: absen + izin
                    const allDates = Array.from(new Set([
                      ...sortedDates,
                      ...Object.keys(empLeaveData),
                    ])).sort();

                    return (
                      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-gray-100 text-[#3e2723] font-black border-b border-gray-200">
                            <tr>
                              <th className="py-4 px-4">Tanggal</th>
                              <th className="py-4 px-4">Shift</th>
                              <th className="py-4 px-4">Masuk</th>
                              <th className="py-4 px-4">Keluar</th>
                              <th className="py-4 px-4">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {allDates.length === 0 ? (
                              <tr><td colSpan={5} className="py-8 text-center text-gray-400 font-bold">Tidak ada absen di bulan ini</td></tr>
                            ) : allDates.map(date => {
                              const log = emp.logsByDate[date] ?? { in: null, out: null };
                              const izinType = empLeaveData[date];
                              const inJam = log.in ? formatJamLokal(log.in.time) : '-';
                              const outJam = log.out ? formatJamLokal(log.out.time) : '-';
                              const shiftInfo = getJamShift(log.in?.shift || log.out?.shift, date, masterShifts);
                              const shiftLabel = getShiftLabel(date);
                              const isTelat = log.in && toMenit(inJam) > toMenit(shiftInfo.in);

                              // Baris izin (tanpa absen)
                              if (izinType && !log.in && !log.out) {
                                return (
                                  <tr key={date} className="bg-blue-50/60 hover:bg-blue-50 transition-colors">
                                    <td className="py-3 px-4 font-bold text-gray-700 text-xs">{date}</td>
                                    <td className="py-3 px-4 text-xs text-blue-400 font-bold" colSpan={3}>
                                      <i className="fa-solid fa-envelope-open-text mr-1.5" />{izinType}
                                    </td>
                                    <td className="py-3 px-4">
                                      <span className="bg-blue-100 text-blue-700 border border-blue-200 text-[10px] font-black px-2.5 py-1 rounded-md">Izin</span>
                                    </td>
                                  </tr>
                                );
                              }

                              return (
                                <tr key={date} className="hover:bg-gray-50 transition-colors">
                                  <td className="py-3 px-4 font-bold text-gray-700 text-xs">{date}</td>
                                  <td className="py-3 px-4 text-xs">
                                    <p className="font-black text-[#3e2723] leading-tight">{shiftLabel}</p>
                                    <p className="text-gray-400 font-bold text-[10px]">{shiftInfo.in} – {shiftInfo.out}</p>
                                  </td>
                                  <td className="py-3 px-4 font-black text-green-600">{inJam}</td>
                                  <td className="py-3 px-4 font-black text-orange-500">{outJam}</td>
                                  <td className="py-3 px-4">
                                    {isTelat
                                      ? <span className="bg-red-50 text-red-600 border border-red-100 text-[10px] font-black px-2.5 py-1 rounded-md">Telat</span>
                                      : log.in
                                        ? <span className="bg-green-50 text-green-700 border border-green-100 text-[10px] font-black px-2.5 py-1 rounded-md">Tepat</span>
                                        : <span className="text-gray-400 text-xs">-</span>
                                    }
                                    {izinType && (
                                      <span className="ml-1 bg-blue-50 text-blue-600 border border-blue-100 text-[10px] font-bold px-2 py-0.5 rounded-md">+Izin</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          );
        }
      })()}

      <style>{`
        @keyframes zoomIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-zoomIn { animation: zoomIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>
    </div>
  );
};

export default DashboardHR;