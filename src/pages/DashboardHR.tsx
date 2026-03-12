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

interface GroupedAbsen {
  employee: string;
  employee_name: string;
  in: RiwayatAbsen | null;
  out: RiwayatAbsen | null;
}

// ── HELPER SHIFT & WAKTU (Sama seperti di Absen.tsx) ──
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

const getJamShift = (
  shiftNameFromRecord: string | undefined,
  tanggal: string,
  masterShifts: Record<string, { in: string; out: string }>
): { in: string; out: string } => {
  if (shiftNameFromRecord && masterShifts[shiftNameFromRecord]) return masterShifts[shiftNameFromRecord];
  const tglDate = new Date(tanggal);
  const hari = tglDate.getDay();
  const isFriday = hari === 5;
  const ramadhan = isRamadhan();
  if (ramadhan) return isFriday ? { in: '07:00', out: '16:00' } : { in: '07:00', out: '15:30' };
  return isFriday ? { in: '07:30', out: '17:00' } : { in: '07:30', out: '16:30' };
};

const DashboardHR = () => {
  const navigate = useNavigate();
  const BACKEND = (import.meta as any).env?.VITE_API_URL || 'https://ropi-hr-backend.vercel.app';
  const ERPNEXT_URL = 'http://103.187.147.240';

  const [dataAbsen, setDataAbsen] = useState<GroupedAbsen[]>([]);
  const [masterShifts, setMasterShifts] = useState<Record<string, { in: string; out: string }>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [tanggalAktif, setTanggalAktif] = useState(new Date().toISOString().substring(0, 10));
  
  // State untuk Modal "BOOM"
  const [detailModal, setDetailModal] = useState<GroupedAbsen | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem('ropi_user');
    if (!userData) {
      navigate('/');
      return;
    }
    const parsedUser = JSON.parse(userData);
    if (parsedUser.role !== 'HR' && parsedUser.role !== 'HR Manager' && parsedUser.role !== 'System Manager') {
      alert('Akses Ditolak! Anda tidak memiliki hak akses HRD.');
      navigate('/home');
    } else {
      ambilMasterShift();
    }
  }, [navigate]);

  useEffect(() => {
    tarikDataSemuaKaryawan();
  }, [tanggalAktif]);

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
    setIsLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/attendance/all-today?date=${tanggalAktif}`);
      const result = await res.json();
      if (result.success && result.data) {
        // LAKUKAN GROUPING BERDASARKAN KARYAWAN
        const grouped: Record<string, GroupedAbsen> = {};
        result.data.forEach((item: RiwayatAbsen) => {
          if (!grouped[item.employee]) {
            grouped[item.employee] = {
              employee: item.employee,
              employee_name: item.employee_name || item.employee,
              in: null,
              out: null
            };
          }
          if (item.log_type === 'IN') {
            if (!grouped[item.employee].in || item.time < grouped[item.employee].in!.time) {
              grouped[item.employee].in = item;
            }
          } else {
            if (!grouped[item.employee].out || item.time > grouped[item.employee].out!.time) {
              grouped[item.employee].out = item;
            }
          }
        });
        
        // Convert ke array dan urutkan berdasarkan nama
        const arrData = Object.values(grouped).sort((a, b) => a.employee_name.localeCompare(b.employee_name));
        setDataAbsen(arrData);
      } else {
        setDataAbsen([]);
      }
    } catch (err) {
      console.error('Gagal tarik data HR');
    }
    setIsLoading(false);
  };

  const prosesUrlFoto = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('data:image')) return url;
    if (url.startsWith('/files')) return ERPNEXT_URL + url;
    return url;
  };

  const downloadExcel = () => {
    if (dataAbsen.length === 0) {
      alert('Tidak ada data untuk di-download!');
      return;
    }

    const dataExcel = dataAbsen.map((item) => {
      const inJam = item.in ? formatJamLokal(item.in.time) : '-';
      const outJam = item.out ? formatJamLokal(item.out.time) : '-';
      const shiftInfo = getJamShift(item.in?.shift || item.out?.shift, tanggalAktif, masterShifts);
      
      let telat = '-';
      if (item.in) {
        const selisihTelat = toMenit(inJam) - toMenit(shiftInfo.in);
        if (selisihTelat > 0) telat = `${selisihTelat} Menit`;
      }

      let pulangCepat = '-';
      if (item.out) {
        const selisihCepat = toMenit(shiftInfo.out) - toMenit(outJam);
        if (selisihCepat > 0) pulangCepat = `${selisihCepat} Menit`;
      }

      return {
        'ID Karyawan': item.employee,
        'Nama Karyawan': item.employee_name,
        'Jam Shift': `${shiftInfo.in} - ${shiftInfo.out}`,
        'Jam Masuk': inJam,
        'Jam Keluar': outJam,
        'Keterlambatan': telat,
        'Pulang Cepat': pulangCepat,
        'Lokasi Masuk': item.in?.latitude ? `https://maps.google.com/?q=${item.in.latitude},${item.in.longitude}` : '-',
        'Lokasi Keluar': item.out?.latitude ? `https://maps.google.com/?q=${item.out.latitude},${item.out.longitude}` : '-',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Absen");
    XLSX.writeFile(workbook, `Laporan_Harian_${tanggalAktif}.xlsx`);
  };

  const totalHadir = dataAbsen.length;
  let totalTelat = 0;
  dataAbsen.forEach(d => {
    if (d.in) {
      const shiftInfo = getJamShift(d.in.shift, tanggalAktif, masterShifts);
      if (toMenit(formatJamLokal(d.in.time)) > toMenit(shiftInfo.in)) totalTelat++;
    }
  });

  return (
    <div className="bg-gray-50 min-h-screen font-sans w-full">
      
      {/* ── HEADER ── */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-900 pt-8 pb-6 px-6 md:px-12 shadow-lg sticky top-0 z-20 w-full">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link to="/home" className="w-12 h-12 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white active:scale-95 transition-all">
              <i className="fa-solid fa-arrow-left text-xl" />
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-white">HR Command Center</h1>
              <p className="text-xs md:text-sm text-purple-200 font-bold uppercase tracking-widest mt-1">Laporan Kehadiran Karyawan</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center bg-white/10 rounded-xl p-1 w-full md:w-auto">
              <input 
                type="date" 
                value={tanggalAktif}
                onChange={(e) => setTanggalAktif(e.target.value)}
                className="bg-transparent text-white px-4 py-2 font-bold text-sm outline-none cursor-pointer"
              />
            </div>
            <div className="flex gap-2">
              <div className="bg-white/10 rounded-xl px-4 py-2 flex flex-col items-center justify-center min-w-[80px]">
                <p className="text-[10px] text-green-300 font-bold uppercase">Hadir</p>
                <p className="text-white font-black text-xl leading-none mt-1">{totalHadir}</p>
              </div>
              <div className="bg-white/10 rounded-xl px-4 py-2 flex flex-col items-center justify-center min-w-[80px]">
                <p className="text-[10px] text-red-300 font-bold uppercase">Telat</p>
                <p className="text-white font-black text-xl leading-none mt-1">{totalTelat}</p>
              </div>
            </div>
            <button onClick={downloadExcel} className="bg-green-500 hover:bg-green-400 text-white font-black px-6 py-3 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95 w-full md:w-auto">
              <i className="fa-solid fa-file-excel text-lg" /> <span>Export Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── CARD GALLERY GRID ── */}
      <div className="max-w-7xl mx-auto p-6 md:p-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center pt-32 text-gray-400">
            <i className="fa-solid fa-spinner fa-spin text-5xl mb-4 text-purple-300" />
            <p className="font-bold text-lg">Menganalisa data dari server...</p>
          </div>
        ) : dataAbsen.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-32 text-gray-400">
            <i className="fa-solid fa-users-slash text-7xl mb-4 text-gray-300" />
            <p className="font-bold text-lg text-gray-500">Belum ada absen karyawan hari ini.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {dataAbsen.map((emp) => {
              const inJam = emp.in ? formatJamLokal(emp.in.time) : '-';
              const outJam = emp.out ? formatJamLokal(emp.out.time) : '-';
              const shiftInfo = getJamShift(emp.in?.shift || emp.out?.shift, tanggalAktif, masterShifts);
              const isTelat = emp.in && toMenit(inJam) > toMenit(shiftInfo.in);

              return (
                <div 
                  key={emp.employee} 
                  onClick={() => setDetailModal(emp)} // 🔥 MUNCULIN MODAL SAAT KLIK
                  className="bg-white rounded-3xl p-5 shadow-sm hover:shadow-xl transition-all cursor-pointer border border-gray-100 hover:border-purple-300 flex flex-col active:scale-95 group"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 shrink-0 border-2 border-white shadow-sm relative">
                      {emp.in?.custom_foto_absen ? (
                        <img src={prosesUrlFoto(emp.in.custom_foto_absen)} className="w-full h-full object-cover" />
                      ) : <i className="fa-solid fa-user text-gray-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xl" />}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-black text-gray-800 text-sm leading-tight line-clamp-2 group-hover:text-purple-600 transition-colors">
                        {emp.employee_name}
                      </h3>
                      {isTelat && <span className="inline-block mt-1 bg-red-100 text-red-600 text-[8px] font-black px-1.5 py-0.5 rounded uppercase">Telat Masuk</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-auto">
                    <div className="bg-green-50 rounded-xl p-2 text-center border border-green-100">
                      <p className="text-[9px] text-green-500 font-bold uppercase mb-0.5">Masuk</p>
                      <p className="font-black text-green-700 text-sm">{inJam}</p>
                    </div>
                    <div className="bg-orange-50 rounded-xl p-2 text-center border border-orange-100">
                      <p className="text-[9px] text-orange-500 font-bold uppercase mb-0.5">Keluar</p>
                      <p className="font-black text-orange-700 text-sm">{outJam}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MODAL "BOOM" DETAIL KARYAWAN ── */}
      {detailModal && (() => {
        const emp = detailModal;
        const shiftInfo = getJamShift(emp.in?.shift || emp.out?.shift, tanggalAktif, masterShifts);
        const inJam = emp.in ? formatJamLokal(emp.in.time) : '-';
        const outJam = emp.out ? formatJamLokal(emp.out.time) : '-';
        
        let durasiTelat = 0;
        if (emp.in) {
          const selisih = toMenit(inJam) - toMenit(shiftInfo.in);
          if (selisih > 0) durasiTelat = selisih;
        }
        
        let durasiCepat = 0;
        if (emp.out) {
          const selisih = toMenit(shiftInfo.out) - toMenit(outJam);
          if (selisih > 0) durasiCepat = selisih;
        }

        const FotoBesar = ({ src, icon, title, isSignature=false }: any) => (
          <div className="relative bg-gray-100 rounded-2xl overflow-hidden shadow-inner border border-gray-200" style={{ height: isSignature ? '120px' : '200px' }}>
            <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-lg z-10 font-bold flex items-center gap-1">
              <i className={`fa-solid ${icon}`} /> {title}
            </div>
            {src ? (
              <img src={prosesUrlFoto(src)} className={`w-full h-full ${isSignature ? 'object-contain py-2 bg-white' : 'object-cover'}`} />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300">
                <i className={`fa-solid ${icon} text-3xl mb-1`} />
                <p className="text-[10px] font-bold">Tidak ada data</p>
              </div>
            )}
          </div>
        );

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8" style={{ background: 'rgba(30,15,30,0.85)', backdropFilter: 'blur(8px)' }}>
            <div className="bg-white w-full max-w-4xl max-h-[95vh] rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-hidden animate-zoomIn">
              
              {/* Kolom Kiri: Profil & Status */}
              <div className="bg-gray-50 md:w-1/3 border-r border-gray-200 flex flex-col shrink-0">
                <div className="p-6 md:p-8">
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-purple-100 border-4 border-white shadow-md">
                      {emp.in?.custom_foto_absen ? (
                        <img src={prosesUrlFoto(emp.in.custom_foto_absen)} className="w-full h-full object-cover" />
                      ) : <i className="fa-solid fa-user text-purple-300 text-3xl mt-2 ml-3" />}
                    </div>
                    <button onClick={() => setDetailModal(null)} className="w-8 h-8 rounded-full bg-gray-200 hover:bg-red-100 hover:text-red-500 text-gray-500 flex items-center justify-center transition-colors">
                      <i className="fa-solid fa-xmark text-lg" />
                    </button>
                  </div>
                  <h2 className="text-xl font-black text-gray-800 leading-tight mb-1">{emp.employee_name}</h2>
                  <p className="text-xs font-bold text-purple-500 uppercase tracking-wider">{emp.employee}</p>
                </div>
                
                <div className="px-6 md:px-8 pb-6 flex-1 overflow-y-auto">
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-4">
                    <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Jadwal Shift</p>
                    <p className="font-black text-gray-700 text-lg">{shiftInfo.in} <span className="text-gray-300 mx-1">→</span> {shiftInfo.out}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-green-50 p-4 rounded-2xl border border-green-100">
                      <p className="text-[10px] text-green-600 font-bold uppercase mb-1 flex items-center gap-1"><i className="fa-solid fa-right-to-bracket"/> Masuk</p>
                      <p className="font-black text-green-700 text-2xl">{inJam}</p>
                      {durasiTelat > 0 && <span className="inline-block mt-1 bg-red-500 text-white text-[9px] font-black px-2 py-0.5 rounded shadow-sm animate-pulse">TELAT {formatDurasi(durasiTelat)}</span>}
                    </div>
                    <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100">
                      <p className="text-[10px] text-orange-600 font-bold uppercase mb-1 flex items-center gap-1"><i className="fa-solid fa-right-from-bracket"/> Keluar</p>
                      <p className="font-black text-orange-700 text-2xl">{outJam}</p>
                      {durasiCepat > 0 && <span className="inline-block mt-1 bg-yellow-400 text-white text-[9px] font-black px-2 py-0.5 rounded shadow-sm">CEPAT {formatDurasi(durasiCepat)}</span>}
                    </div>
                  </div>

                  {/* Tombol Lokasi GPS */}
                  <div className="flex flex-col gap-2">
                    {emp.in?.latitude && (
                      <a href={`https://maps.google.com/?q=${emp.in.latitude},${emp.in.longitude}`} target="_blank" className="bg-blue-50 hover:bg-blue-100 text-blue-600 p-3 rounded-xl text-xs font-bold flex items-center justify-between border border-blue-100 transition-colors">
                        <span className="flex items-center gap-2"><i className="fa-solid fa-location-dot" /> Peta Masuk</span>
                        <i className="fa-solid fa-arrow-up-right-from-square" />
                      </a>
                    )}
                    {emp.out?.latitude && (
                      <a href={`https://maps.google.com/?q=${emp.out.latitude},${emp.out.longitude}`} target="_blank" className="bg-orange-50 hover:bg-orange-100 text-orange-600 p-3 rounded-xl text-xs font-bold flex items-center justify-between border border-orange-100 transition-colors">
                        <span className="flex items-center gap-2"><i className="fa-solid fa-location-dot" /> Peta Keluar</span>
                        <i className="fa-solid fa-arrow-up-right-from-square" />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Kolom Kanan: Galeri Foto */}
              <div className="bg-white md:w-2/3 p-6 md:p-8 overflow-y-auto max-h-[60vh] md:max-h-none flex-1">
                <h3 className="font-black text-gray-800 text-lg mb-4 flex items-center gap-2"><i className="fa-solid fa-images text-purple-500" /> Galeri Bukti Autentikasi</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Bagian Masuk */}
                  <div className="flex flex-col gap-3">
                    <div className="bg-green-500 text-white text-xs font-black py-1.5 px-3 rounded-t-xl text-center uppercase tracking-widest">Data Masuk</div>
                    <FotoBesar src={emp.in?.custom_foto_absen} icon="fa-camera" title="Selfie Wajah" />
                    <FotoBesar src={emp.in?.custom_verification_image} icon="fa-fingerprint" title="Mesin Finger" />
                    <FotoBesar src={emp.in?.custom_signature} icon="fa-pen-nib" title="Tanda Tangan" isSignature={true} />
                  </div>
                  
                  {/* Bagian Keluar */}
                  <div className="flex flex-col gap-3">
                    <div className="bg-orange-500 text-white text-xs font-black py-1.5 px-3 rounded-t-xl text-center uppercase tracking-widest">Data Keluar</div>
                    <FotoBesar src={emp.out?.custom_foto_absen} icon="fa-camera" title="Selfie Wajah" />
                    <FotoBesar src={emp.out?.custom_verification_image} icon="fa-fingerprint" title="Mesin Finger" />
                    <FotoBesar src={emp.out?.custom_signature} icon="fa-pen-nib" title="Tanda Tangan" isSignature={true} />
                  </div>
                </div>
              </div>

            </div>
          </div>
        );
      })()}
      
      {/* Tambahan CSS Animasi pop-up (bisa otomatis dibaca Tailwind jika pakai mode arbitary) */}
      <style>{`
        @keyframes zoomIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-zoomIn {
          animation: zoomIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
};

export default DashboardHR;