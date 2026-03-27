import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import BottomNav from '../components/BottomNav';

interface User {
  name: string;
  employee_id: string;
}

interface LeaveRecord {
  name: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  description: string;
  status: string;
  total_leave_days: number;
  custom_attachment?: string;
  attachment?: string;
  leave_attachment?: string;
  custom_foto_bukti?: string;
  custom_bukti?: string;
  custom_file?: string;
  [key: string]: any;
}

const Izin = () => {
  const navigate = useNavigate();
  const BACKEND = (import.meta as any).env?.VITE_API_URL || 'https://ropi-hr-backend.vercel.app';
  const ERPNEXT_URL = 'http://103.187.147.240';

  const [user, setUser] = useState<User | null>(null);
  const [leaveTypes, setLeaveTypes] = useState<string[]>([]);

  const [selectedType, setSelectedType] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [attachment, setAttachment] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string>('');

  const [leaveHistory, setLeaveHistory] = useState<LeaveRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [showForm, setShowForm] = useState<boolean>(true);

  const [selectedRecord, setSelectedRecord] = useState<LeaveRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('ropi_user');
    if (!userData) { navigate('/'); return; }
    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    fetchLeaveTypes();
    fetchLeaveHistory(parsedUser.employee_id);
  }, [navigate]);

  const fetchLeaveTypes = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/attendance/leave-types`);
      const data = await res.json();
      if (data.success) {
        const filtered = data.data
          .map((item: any) => item.name)
          .filter((name: string) => {
            const lower = name.toLowerCase();
            return !lower.includes('tahunan') && !lower.includes('cuti');
          });
        setLeaveTypes(filtered);
      }
    } catch (err) {
      console.error('Gagal mengambil tipe izin', err);
    }
  };

  const fetchLeaveHistory = async (employeeId: string) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`${BACKEND}/api/attendance/leave-history?employee_id=${employeeId}`);
      const data = await res.json();
      if (data.success) setLeaveHistory(data.data);
    } catch (err) {
      console.error('Gagal mengambil riwayat izin', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('❌ Ukuran file maksimal 2MB. Silakan kompres atau pilih file lain.');
        e.target.value = '';
        return;
      }
      setAttachmentName(file.name);
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => setAttachment(reader.result as string);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedType || !fromDate || !toDate || !reason) {
      alert('Mohon lengkapi form wajib!');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`${BACKEND}/api/attendance/leave-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: user.employee_id,
          leave_type: selectedType,
          from_date: fromDate,
          to_date: toDate,
          reason,
          attachment,
          attachment_name: attachmentName,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert('✅ Izin berhasil diajukan! Menunggu persetujuan HRD.');
        setSelectedType(''); setFromDate(''); setToDate(''); setReason('');
        setAttachment(null); setAttachmentName('');
        fetchLeaveHistory(user.employee_id);
        setShowForm(false);
      } else {
        alert(data.message || 'Gagal mengajukan izin.');
      }
    } catch (err) {
      alert('Terjadi kesalahan koneksi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async (docName: string) => {
    if (!confirm('Batalkan pengajuan izin ini?')) return;
    setIsCancelling(true);
    try {
      const res = await fetch(`${BACKEND}/api/attendance/leave-request/${encodeURIComponent(docName)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert('✅ Pengajuan izin berhasil dibatalkan.');
        setSelectedRecord(null);
        if (user) fetchLeaveHistory(user.employee_id);
      } else {
        alert(data.message || 'Gagal membatalkan izin.');
      }
    } catch {
      alert('Terjadi kesalahan koneksi.');
    } finally {
      setIsCancelling(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const s = status?.toLowerCase();
    if (s === 'approved') return (
      <span className="flex items-center gap-1 bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded-full border border-green-200">
        <i className="fa-solid fa-circle-check text-[9px]"></i> Disetujui
      </span>
    );
    if (s === 'rejected') return (
      <span className="flex items-center gap-1 bg-red-100 text-red-600 text-[10px] font-black px-2 py-0.5 rounded-full border border-red-200">
        <i className="fa-solid fa-circle-xmark text-[9px]"></i> Ditolak
      </span>
    );
    return (
      <span className="flex items-center gap-1 bg-yellow-100 text-yellow-700 text-[10px] font-black px-2 py-0.5 rounded-full border border-yellow-200">
        <i className="fa-solid fa-clock text-[9px]"></i> Menunggu
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const prosesUrlFoto = (url?: string) => {
    if (!url) return '';
    if (url.startsWith('data:image')) return url;
    if (url.startsWith('/files')) return `${BACKEND}/api/attendance/file?path=${encodeURIComponent(url)}`;
    return url;
  };

  const getAttachment = (item: LeaveRecord): string | undefined => {
    const possibleFields = ['attachment', 'custom_attachment', 'leave_attachment', 'custom_foto_bukti', 'custom_bukti', 'custom_file'];
    for (const field of possibleFields) {
      if (item[field]) return item[field];
    }
    return Object.values(item).find(
      (v) => typeof v === 'string' && (v.startsWith('/files/') || v.startsWith('data:image'))
    );
  };

  const isPdf = (url: string) => url.toLowerCase().endsWith('.pdf');
  const isDoc = (url: string) => /\.(docx?|xlsx?|pptx?|txt|csv)$/i.test(url);
  const isImage = (url: string) => /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(url) || url.startsWith('data:image');
  const getFileIcon = (url: string) => {
    const u = url.toLowerCase();
    if (u.endsWith('.pdf')) return { icon: 'fa-file-pdf', color: 'text-red-500' };
    if (u.match(/\.docx?$/)) return { icon: 'fa-file-word', color: 'text-blue-600' };
    if (u.match(/\.xlsx?$/)) return { icon: 'fa-file-excel', color: 'text-green-600' };
    if (u.match(/\.pptx?$/)) return { icon: 'fa-file-powerpoint', color: 'text-orange-500' };
    return { icon: 'fa-file-lines', color: 'text-gray-500' };
  };

  return (
    <div className="bg-gray-100 flex items-center justify-center min-h-screen font-sans text-[#3e2723] selection:bg-[#fbc02d] md:p-6 lg:p-10 w-full overflow-hidden">
      <style>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>

      <div className="w-full md:max-w-4xl lg:max-w-5xl bg-white md:rounded-[3rem] h-screen md:h-[600px] lg:h-[700px] relative shadow-2xl flex flex-col md:flex-row overflow-hidden border border-gray-200">

        {/* BAGIAN KIRI */}
        <div className="hidden md:flex flex-col w-1/2 bg-[#3e2723] relative p-12 lg:p-16 justify-between overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <div className="absolute -top-20 -left-20 w-96 h-96 bg-[#fbc02d] rounded-full blur-3xl"></div>
            <div className="absolute bottom-10 -right-10 w-72 h-72 bg-orange-400 rounded-full blur-3xl"></div>
          </div>
          <div className="relative z-10">
            <div className="w-20 h-20 bg-[#fbc02d] rounded-2xl flex items-center justify-center mb-8 shadow-lg shadow-[#fbc02d]/20 rotate-3">
              <i className="fa-solid fa-bread-slice text-[#3e2723] text-4xl -rotate-3"></i>
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
                <i className="fa-solid fa-shield-halved"></i>
              </div>
              <div>
                <p className="text-white font-bold text-sm">Aman & Terintegrasi</p>
                <p className="text-white/50 text-xs">Terkoneksi langsung ke ERPNext</p>
              </div>
            </div>
          </div>
        </div>

        {/* BAGIAN KANAN */}
        <div className="flex-1 flex justify-center bg-gray-50 relative z-20 w-full md:w-1/2 h-full border-l border-gray-200">
          <div className="w-full max-w-sm bg-gray-50 h-full flex flex-col relative mx-auto shadow-none md:shadow-[0_0_15px_rgba(0,0,0,0.05)] overflow-hidden">

            {/* Header */}
            <div className="bg-[#3e2723] pt-12 pb-6 px-6 shrink-0 shadow-md z-10 rounded-b-[1.5rem]">
              <div className="flex items-center gap-3">
                <Link to="/home" className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform border border-white/10">
                  <i className="fa-solid fa-arrow-left"></i>
                </Link>
                <h1 className="text-xl font-black text-[#fbc02d]">Pengajuan Izin</h1>
              </div>
              <div className="flex mt-5 bg-white/10 rounded-xl p-1 gap-1 border border-white/5">
                <button
                  onClick={() => setShowForm(true)}
                  className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${showForm ? 'bg-[#fbc02d] text-[#3e2723] shadow-md' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                >
                  <i className="fa-solid fa-paper-plane mr-1.5"></i>Ajukan Izin
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${!showForm ? 'bg-[#fbc02d] text-[#3e2723] shadow-md' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                >
                  <i className="fa-solid fa-clock-rotate-left mr-1.5"></i>Riwayat
                  {leaveHistory.length > 0 && (
                    <span className="ml-1.5 bg-white/20 text-white text-[9px] px-1.5 py-0.5 rounded-md">{leaveHistory.length}</span>
                  )}
                </button>
              </div>
            </div>

            {/* FORM PENGAJUAN */}
            {showForm && (
              <div className="flex-1 overflow-y-auto pt-6 px-6 no-scrollbar pb-24 bg-gray-50">
                <div className="bg-[#fff8e1] p-4 rounded-2xl border border-[#fbc02d]/40 flex gap-3 shadow-sm items-start mb-6">
                  <i className="fa-solid fa-circle-info text-[#fbc02d] text-lg mt-0.5"></i>
                  <p className="text-[11px] text-[#3e2723] font-medium leading-relaxed">
                    Gunakan form ini untuk izin sakit atau keperluan mendadak. Pengajuan akan diteruskan ke HRD untuk di-approve.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs font-black text-[#3e2723] uppercase tracking-wider mb-1.5 block ml-1">
                      Tipe Izin <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedType}
                      onChange={(e) => setSelectedType(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-[#3e2723] outline-none focus:border-[#fbc02d] focus:ring-2 focus:ring-[#fbc02d]/20 transition-all shadow-sm appearance-none"
                      required
                    >
                      <option value="" disabled>-- Pilih Tipe Izin --</option>
                      {leaveTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-black text-[#3e2723] uppercase tracking-wider mb-1.5 block ml-1">Dari <span className="text-red-500">*</span></label>
                      <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-[#3e2723] outline-none focus:border-[#fbc02d] focus:ring-2 focus:ring-[#fbc02d]/20 transition-all shadow-sm" required />
                    </div>
                    <div>
                      <label className="text-xs font-black text-[#3e2723] uppercase tracking-wider mb-1.5 block ml-1">Sampai <span className="text-red-500">*</span></label>
                      <input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-[#3e2723] outline-none focus:border-[#fbc02d] focus:ring-2 focus:ring-[#fbc02d]/20 transition-all shadow-sm" required />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-black text-[#3e2723] uppercase tracking-wider mb-1.5 block ml-1">
                      Keterangan <span className="text-red-500">*</span>
                    </label>
                    <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                      placeholder="Tuliskan alasan izin dengan jelas..."
                      className="w-full bg-white border border-gray-200 rounded-xl py-3 px-4 text-sm font-medium text-[#3e2723] outline-none focus:border-[#fbc02d] focus:ring-2 focus:ring-[#fbc02d]/20 transition-all resize-none shadow-sm"
                      required></textarea>
                  </div>

                  <div>
                    <label className="text-xs font-black text-[#3e2723] uppercase tracking-wider mb-1.5 block ml-1">
                      File Bukti <span className="text-gray-400 font-medium normal-case">(Opsional)</span>
                    </label>
                    <input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" onChange={handleFileChange}
                      className="w-full bg-white border border-gray-200 rounded-xl py-2 px-3 text-sm text-gray-500 outline-none focus:border-[#fbc02d] transition-all shadow-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-[#fff8e1] file:text-[#3e2723] hover:file:bg-[#fbc02d]/50 cursor-pointer" />
                    {attachment && attachment.startsWith('data:image') && (
                      <div className="mt-3 relative w-full h-32 rounded-2xl overflow-hidden border-2 border-[#fbc02d]/40 shadow-sm">
                        <img src={attachment} alt="preview" className="w-full h-full object-cover" />
                        <button type="button" onClick={() => { setAttachment(null); setAttachmentName(''); }}
                          className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs hover:bg-red-500 transition-colors backdrop-blur-sm">
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                      </div>
                    )}
                    {attachment && !attachment.startsWith('data:image') && (() => {
                      const fi = getFileIcon(attachmentName);
                      return (
                        <div className="mt-3 flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
                          <i className={`fa-solid ${fi.icon} ${fi.color} text-xl`}></i>
                          <span className="text-xs text-[#3e2723] font-bold truncate flex-1">{attachmentName}</span>
                          <button type="button" onClick={() => { setAttachment(null); setAttachmentName(''); }}
                            className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <i className="fa-solid fa-xmark text-xs"></i>
                          </button>
                        </div>
                      );
                    })()}
                    <p className="text-[10px] text-gray-400 mt-1.5 pl-1 italic">* Foto, PDF, Word, Excel, dll. Maks 2MB.</p>
                  </div>

                  <button type="submit" disabled={isSubmitting}
                    className="w-full bg-[#fbc02d] hover:bg-[#f9a825] text-[#3e2723] font-black text-base py-4 rounded-2xl shadow-[0_10px_20px_-5px_rgba(251,192,45,0.4)] active:scale-95 transition-all mt-2 flex justify-center items-center gap-2">
                    {isSubmitting
                      ? <><i className="fa-solid fa-spinner fa-spin"></i> Memproses...</>
                      : <><i className="fa-solid fa-paper-plane"></i> Kirim Pengajuan</>}
                  </button>
                </form>
              </div>
            )}

            {/* PANEL RIWAYAT */}
            {!showForm && (
              <div className="flex-1 overflow-y-auto pt-5 px-6 bg-gray-50 no-scrollbar pb-24">
                <div className="flex justify-between items-center mb-4">
                  <p className="text-xs font-black text-[#3e2723] uppercase tracking-wider">Riwayat Pengajuan</p>
                  <button onClick={() => user && fetchLeaveHistory(user.employee_id)}
                    className="flex items-center gap-1.5 text-[10px] font-black text-[#3e2723] bg-white border border-gray-200 shadow-sm px-3 py-1.5 rounded-lg active:scale-95 transition-all hover:bg-gray-50">
                    <i className={`fa-solid fa-rotate-right text-[10px] text-[#fbc02d] ${isLoadingHistory ? 'fa-spin' : ''}`}></i> Refresh
                  </button>
                </div>

                {isLoadingHistory && (
                  <div className="flex flex-col gap-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="bg-white border border-gray-100 shadow-sm rounded-2xl h-24 animate-pulse"></div>
                    ))}
                  </div>
                )}

                {!isLoadingHistory && leaveHistory.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center bg-white border border-dashed border-gray-200 rounded-3xl mt-4">
                    <div className="w-16 h-16 bg-[#fff8e1] rounded-full flex items-center justify-center mb-4 shadow-inner">
                      <i className="fa-solid fa-envelope-open-text text-2xl text-[#fbc02d]"></i>
                    </div>
                    <p className="text-sm font-black text-[#3e2723]">Belum Ada Pengajuan</p>
                    <p className="text-[10px] text-gray-400 mt-1">Riwayat izin kamu akan muncul di sini</p>
                    <button onClick={() => setShowForm(true)}
                      className="mt-5 bg-white border border-gray-200 text-[#3e2723] font-black text-xs px-5 py-2.5 rounded-xl active:scale-95 transition-all shadow-sm hover:border-[#fbc02d]">
                      <i className="fa-solid fa-plus mr-1.5 text-[#fbc02d]"></i>Ajukan Sekarang
                    </button>
                  </div>
                )}

                {!isLoadingHistory && leaveHistory.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {leaveHistory.map((item) => (
                      <button key={item.name} onClick={() => setSelectedRecord(item)}
                        className="bg-white border border-gray-100 rounded-[1.25rem] p-4 shadow-sm text-left w-full active:scale-[0.98] transition-all hover:border-[#fbc02d]/40 hover:shadow-md group relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#fbc02d] to-yellow-300 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[#fff8e1] rounded-full flex items-center justify-center shrink-0 border border-[#fbc02d]/20">
                              <i className="fa-solid fa-envelope-open-text text-[#fbc02d] text-sm"></i>
                            </div>
                            <div>
                              <p className="text-sm font-black text-[#3e2723] leading-tight mb-0.5">{item.leave_type}</p>
                              {getStatusBadge(item.status)}
                            </div>
                          </div>
                          <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 group-hover:bg-[#fff8e1] group-hover:text-[#fbc02d] transition-colors shrink-0">
                            <i className="fa-solid fa-chevron-right text-[10px]"></i>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                          <div className="flex items-center gap-1.5 text-[11px] text-gray-600 font-bold">
                            <i className="fa-regular fa-calendar text-[#fbc02d]"></i>
                            <span>{formatDate(item.from_date)}</span>
                            {item.from_date !== item.to_date && (
                              <><i className="fa-solid fa-arrow-right mx-0.5 text-[8px] text-gray-400"></i><span>{formatDate(item.to_date)}</span></>
                            )}
                          </div>
                          {getAttachment(item) && <i className="fa-regular fa-image text-blue-500 text-xs"></i>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* MODAL DETAIL */}
            {selectedRecord && (
              <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
                style={{ background: 'rgba(62,39,35,0.75)', backdropFilter: 'blur(6px)' }}
                onClick={(e) => { if (e.target === e.currentTarget) setSelectedRecord(null); }}>
                <div className="bg-white w-full max-w-sm rounded-t-[2.5rem] md:rounded-[2rem] flex flex-col overflow-hidden shadow-2xl border border-gray-100">
                  <div className="flex justify-center pt-4 pb-2 md:hidden">
                    <div className="w-12 h-1.5 bg-gray-200 rounded-full"></div>
                  </div>
                  <div className="flex justify-between items-center px-6 py-4 border-b border-gray-50 bg-[#fff8e1]/50">
                    <h3 className="font-black text-[#3e2723] text-lg"><i className="fa-solid fa-file-lines text-[#fbc02d] mr-2"></i>Detail Izin</h3>
                    <button onClick={() => setSelectedRecord(null)}
                      className="w-8 h-8 bg-white border border-gray-200 text-gray-500 rounded-full flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors shadow-sm">
                      <i className="fa-solid fa-xmark text-sm"></i>
                    </button>
                  </div>
                  <div className="px-6 py-5 flex flex-col gap-5 overflow-y-auto max-h-[75vh] no-scrollbar">
                    <div className={`rounded-2xl px-5 py-4 flex items-center gap-4 shadow-sm ${
                      selectedRecord.status?.toLowerCase() === 'approved' ? 'bg-green-50 border border-green-100'
                      : selectedRecord.status?.toLowerCase() === 'rejected' ? 'bg-red-50 border border-red-100'
                      : 'bg-yellow-50 border border-yellow-100'}`}>
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-sm bg-white ${
                        selectedRecord.status?.toLowerCase() === 'approved' ? 'text-green-500 border border-green-100'
                        : selectedRecord.status?.toLowerCase() === 'rejected' ? 'text-red-500 border border-red-100'
                        : 'text-yellow-500 border border-yellow-100'}`}>
                        <i className={`fa-solid ${selectedRecord.status?.toLowerCase() === 'approved' ? 'fa-circle-check' : selectedRecord.status?.toLowerCase() === 'rejected' ? 'fa-circle-xmark' : 'fa-clock'}`}></i>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">Status Pengajuan</p>
                        <p className={`text-base font-black leading-none ${selectedRecord.status?.toLowerCase() === 'approved' ? 'text-green-700' : selectedRecord.status?.toLowerCase() === 'rejected' ? 'text-red-700' : 'text-yellow-700'}`}>
                          {selectedRecord.status?.toLowerCase() === 'approved' ? 'Disetujui HRD' : selectedRecord.status?.toLowerCase() === 'rejected' ? 'Ditolak HRD' : 'Menunggu Persetujuan'}
                        </p>
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-2xl border border-gray-100 p-1">
                      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                        <div className="w-8 h-8 bg-white rounded-full shadow-sm border border-gray-100 flex items-center justify-center shrink-0">
                          <i className="fa-solid fa-tag text-[#fbc02d] text-xs"></i>
                        </div>
                        <div>
                          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Tipe Izin</p>
                          <p className="text-sm font-black text-[#3e2723]">{selectedRecord.leave_type}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                        <div className="w-8 h-8 bg-white rounded-full shadow-sm border border-gray-100 flex items-center justify-center shrink-0">
                          <i className="fa-regular fa-calendar text-[#fbc02d] text-xs"></i>
                        </div>
                        <div>
                          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Tanggal</p>
                          <p className="text-sm font-black text-[#3e2723]">
                            {formatDate(selectedRecord.from_date)}
                            {selectedRecord.from_date !== selectedRecord.to_date && (
                              <> <span className="text-gray-300 font-normal mx-1">s/d</span> {formatDate(selectedRecord.to_date)}</>
                            )}
                          </p>
                        </div>
                      </div>
                      {selectedRecord.total_leave_days > 0 && (
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                          <div className="w-8 h-8 bg-white rounded-full shadow-sm border border-gray-100 flex items-center justify-center shrink-0">
                            <i className="fa-solid fa-hourglass-half text-[#fbc02d] text-xs"></i>
                          </div>
                          <div>
                            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Total Durasi</p>
                            <p className="text-sm font-black text-[#3e2723]">{selectedRecord.total_leave_days} Hari</p>
                          </div>
                        </div>
                      )}
                      {selectedRecord.description && (
                        <div className="flex items-start gap-3 px-4 py-3">
                          <div className="w-8 h-8 bg-white rounded-full shadow-sm border border-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                            <i className="fa-solid fa-align-left text-[#fbc02d] text-xs"></i>
                          </div>
                          <div>
                            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Keterangan</p>
                            <p className="text-[13px] font-medium text-[#3e2723] leading-relaxed">{selectedRecord.description}</p>
                          </div>
                        </div>
                      )}
                    </div>
                    {getAttachment(selectedRecord) && (
                      <div>
                        <p className="text-xs font-black text-[#3e2723] uppercase tracking-wider mb-2 flex items-center gap-1.5 ml-1">
                          <i className="fa-solid fa-paperclip text-[#fbc02d] text-sm"></i> File Bukti Lampiran
                        </p>
                        {(() => {
                          const attUrl = getAttachment(selectedRecord) || '';
                          const fullUrl = prosesUrlFoto(attUrl);
                          if (isImage(attUrl)) return (
                            <button onClick={() => setPreviewUrl(fullUrl)}
                              className="w-full relative h-48 rounded-2xl overflow-hidden border-2 border-gray-200 shadow-sm group">
                              <img src={fullUrl} alt="Bukti Izin" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                              <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 backdrop-blur-[2px]">
                                <div className="bg-white/90 rounded-full px-4 py-2 flex items-center gap-2 shadow-lg">
                                  <i className="fa-solid fa-magnifying-glass-plus text-[#3e2723] text-sm"></i>
                                  <span className="text-xs font-black text-[#3e2723] uppercase">Perbesar Foto</span>
                                </div>
                              </div>
                            </button>
                          );
                          const fi = getFileIcon(attUrl);
                          return (
                            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 flex flex-col items-center gap-3 shadow-inner">
                              <div className="w-14 h-14 bg-white rounded-full shadow-sm flex items-center justify-center">
                                <i className={`fa-solid ${fi.icon} text-3xl ${fi.color}`}></i>
                              </div>
                              <p className="text-xs text-gray-500 font-bold text-center truncate max-w-full px-4">{attUrl.split('/').pop()}</p>
                              <a href={fullUrl} target="_blank" rel="noopener noreferrer"
                                className="text-[11px] font-black text-blue-600 bg-blue-50 border border-blue-100 px-5 py-2.5 rounded-xl hover:bg-blue-100 transition-colors shadow-sm flex items-center gap-2">
                                <i className="fa-solid fa-arrow-up-right-from-square"></i> Buka / Unduh File
                              </a>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                  <div className="px-6 pb-6 pt-4 border-t border-gray-100 bg-white flex flex-col gap-2">
                    {selectedRecord.status?.toLowerCase() === 'open' && (
                      <button onClick={() => handleCancel(selectedRecord.name)} disabled={isCancelling}
                        className="w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-black py-3.5 rounded-2xl active:scale-95 transition-all flex justify-center items-center gap-2 text-sm">
                        {isCancelling
                          ? <><i className="fa-solid fa-spinner fa-spin" /> Membatalkan...</>
                          : <><i className="fa-solid fa-trash-can" /> Batalkan Pengajuan</>}
                      </button>
                    )}
                    <button onClick={() => setSelectedRecord(null)}
                      className="w-full bg-[#3e2723] hover:bg-[#4e342e] text-[#fbc02d] font-black py-4 rounded-2xl active:scale-95 transition-all shadow-lg flex justify-center items-center gap-2">
                      <i className="fa-solid fa-check"></i> Mengerti & Tutup
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* PREVIEW GAMBAR FULLSIZE */}
            {previewUrl && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-10"
                style={{ background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(8px)' }}
                onClick={(e) => { if (e.target === e.currentTarget) setPreviewUrl(null); }}>
                <div className="w-full max-w-2xl flex flex-col gap-4 relative">
                  <div className="flex justify-between items-center bg-gradient-to-b from-black/50 to-transparent p-4 absolute top-0 left-0 right-0 z-10">
                    <p className="text-white font-black text-sm drop-shadow-md"><i className="fa-regular fa-image mr-2 text-[#fbc02d]"></i>Bukti Lampiran</p>
                    <button onClick={() => setPreviewUrl(null)}
                      className="w-10 h-10 bg-white/20 backdrop-blur-md text-white rounded-full flex items-center justify-center hover:bg-red-500 transition-colors border border-white/20">
                      <i className="fa-solid fa-xmark text-lg"></i>
                    </button>
                  </div>
                  <div className="rounded-[2rem] overflow-hidden bg-black/40 max-h-[85vh] flex items-center justify-center shadow-2xl border border-white/10 mt-14">
                    <img src={previewUrl} alt="Bukti Izin Full" className="w-full object-contain max-h-[80vh]" />
                  </div>
                </div>
              </div>
            )}

            {/* BottomNav component */}
            <BottomNav />

          </div>
        </div>

      </div>
    </div>
  );
};

export default Izin;