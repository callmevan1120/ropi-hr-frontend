import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

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
  // Cover semua kemungkinan nama field attachment dari ERPNext
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

  // State Form
  const [selectedType, setSelectedType] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // State Lampiran
  const [attachment, setAttachment] = useState<string | null>(null);
  const [attachmentName, setAttachmentName] = useState<string>('');

  // State Riwayat & Modal
  const [leaveHistory, setLeaveHistory] = useState<LeaveRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [showForm, setShowForm] = useState<boolean>(true);

  // State Modal Detail
  const [selectedRecord, setSelectedRecord] = useState<LeaveRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
          // Filter keluar semua yang mengandung kata "tahunan" atau "cuti"
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
      if (data.success) {
        // DEBUG: log semua field dari record pertama untuk cek nama field attachment
        if (data.data.length > 0) {
          console.log('📋 Fields riwayat izin:', Object.keys(data.data[0]));
          console.log('📋 Sample data record:', JSON.stringify(data.data[0], null, 2));
        }
        setLeaveHistory(data.data);
      }
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
        alert('❌ Ukuran file maksimal 2MB ya! Silakan kompres atau pilih foto lain.');
        e.target.value = '';
        return;
      }
      setAttachmentName(file.name);
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        setAttachment(reader.result as string);
      };
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
          reason: reason,
          attachment: attachment,
          attachment_name: attachmentName,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert('✅ Izin berhasil diajukan! Menunggu persetujuan HRD.');
        setSelectedType('');
        setFromDate('');
        setToDate('');
        setReason('');
        setAttachment(null);
        setAttachmentName('');
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

  const getStatusBadge = (status: string) => {
    const s = status?.toLowerCase();
    if (s === 'approved') {
      return (
        <span className="flex items-center gap-1 bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded-full">
          <i className="fa-solid fa-circle-check text-[9px]"></i> Disetujui
        </span>
      );
    }
    if (s === 'rejected') {
      return (
        <span className="flex items-center gap-1 bg-red-100 text-red-600 text-[10px] font-black px-2 py-0.5 rounded-full">
          <i className="fa-solid fa-circle-xmark text-[9px]"></i> Ditolak
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 bg-yellow-100 text-yellow-700 text-[10px] font-black px-2 py-0.5 rounded-full">
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
    if (url.startsWith('/files')) return ERPNEXT_URL + url;
    return url;
  };

  // Otomatis cari field attachment dari semua kemungkinan nama field ERPNext
  const getAttachment = (item: LeaveRecord): string | undefined => {
    const possibleFields = [
      'attachment',       // ← field utama dari File doctype ERPNext
      'custom_attachment',
      'leave_attachment',
      'custom_foto_bukti',
      'custom_bukti',
      'custom_file',
    ];
    for (const field of possibleFields) {
      if (item[field]) return item[field];
    }
    // Fallback: cari field apapun yang valuenya berupa path file
    return Object.values(item).find(
      (v) => typeof v === 'string' && (v.startsWith('/files/') || v.startsWith('data:image'))
    );
  };

  const isPdf = (url: string) => url.toLowerCase().endsWith('.pdf');

  return (
    <div className="bg-gray-100 flex justify-center min-h-screen font-sans">
      <div className="w-full max-w-sm bg-white min-h-screen flex flex-col shadow-2xl relative">

        {/* Header */}
        <div className="bg-[#3e2723] pt-12 pb-6 px-6 shrink-0 shadow-md z-10">
          <div className="flex items-center gap-3">
            <Link to="/home" className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform">
              <i className="fa-solid fa-arrow-left"></i>
            </Link>
            <h1 className="text-xl font-black text-[#fbc02d]">Pengajuan Izin</h1>
          </div>

          <div className="flex mt-4 bg-white/10 rounded-xl p-1 gap-1">
            <button
              onClick={() => setShowForm(true)}
              className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${
                showForm
                  ? 'bg-[#fbc02d] text-[#3e2723] shadow'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <i className="fa-solid fa-paper-plane mr-1.5"></i>Ajukan Izin
            </button>
            <button
              onClick={() => setShowForm(false)}
              className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${
                !showForm
                  ? 'bg-[#fbc02d] text-[#3e2723] shadow'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <i className="fa-solid fa-clock-rotate-left mr-1.5"></i>Riwayat
              {leaveHistory.length > 0 && (
                <span className="ml-1.5 bg-white/30 text-white text-[9px] px-1.5 py-0.5 rounded-full">
                  {leaveHistory.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ══════════════════════════════ */}
        {/* PANEL FORM PENGAJUAN          */}
        {/* ══════════════════════════════ */}
        {showForm && (
          <div className="flex-1 overflow-y-auto pb-32 pt-6 px-6">
            <div className="bg-[#fff8e1] p-4 rounded-2xl border border-[#fbc02d]/40 flex gap-3 shadow-sm items-start mb-6">
              <i className="fa-solid fa-circle-info text-[#fbc02d] text-lg mt-0.5"></i>
              <p className="text-[11px] text-[#3e2723] font-medium leading-relaxed">
                Gunakan form ini untuk izin sakit atau keperluan mendadak. Pengajuan akan diteruskan ke HRD untuk di-approve.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-black text-[#3e2723] uppercase tracking-wider mb-1 block">
                  Tipe Izin <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-[#3e2723] outline-none focus:border-[#fbc02d] transition-colors"
                  required
                >
                  <option value="" disabled>-- Pilih Tipe Izin --</option>
                  {leaveTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black text-[#3e2723] uppercase tracking-wider mb-1 block">
                    Dari Tanggal <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-[#3e2723] outline-none focus:border-[#fbc02d] transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-[#3e2723] uppercase tracking-wider mb-1 block">
                    Sampai Tanggal <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={toDate}
                    min={fromDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-[#3e2723] outline-none focus:border-[#fbc02d] transition-colors"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-[#3e2723] uppercase tracking-wider mb-1 block">
                  Alasan / Keterangan <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="Tuliskan alasan izin Anda..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-medium text-[#3e2723] outline-none focus:border-[#fbc02d] transition-colors resize-none"
                  required
                ></textarea>
              </div>

              <div>
                <label className="text-xs font-black text-[#3e2723] uppercase tracking-wider mb-1 block">
                  Foto Bukti <span className="text-gray-400 font-medium normal-case">(Opsional)</span>
                </label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileChange}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 px-3 text-sm text-gray-500 outline-none focus:border-[#fbc02d] transition-colors file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-[#fff8e1] file:text-[#3e2723] hover:file:bg-[#fbc02d]/50 cursor-pointer"
                />
                {attachment && attachment.startsWith('data:image') && (
                  <div className="mt-2 relative w-full h-28 rounded-xl overflow-hidden border border-[#fbc02d]/40">
                    <img src={attachment} alt="preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => { setAttachment(null); setAttachmentName(''); }}
                      className="absolute top-1.5 right-1.5 bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-500 transition-colors"
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                )}
                {attachment && !attachment.startsWith('data:image') && (
                  <div className="mt-2 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                    <i className="fa-solid fa-file-pdf text-red-500"></i>
                    <span className="text-xs text-gray-600 font-medium truncate">{attachmentName}</span>
                    <button
                      type="button"
                      onClick={() => { setAttachment(null); setAttachmentName(''); }}
                      className="ml-auto text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <i className="fa-solid fa-xmark text-xs"></i>
                    </button>
                  </div>
                )}
                <p className="text-[10px] text-gray-400 mt-1 pl-1">
                  * Upload foto surat dokter jika sakit. Max 2MB.
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#fbc02d] text-[#3e2723] font-black py-4 rounded-xl shadow-lg hover:scale-[1.02] active:scale-95 transition-all mt-4 flex justify-center gap-2"
              >
                {isSubmitting
                  ? <><i className="fa-solid fa-spinner fa-spin"></i> Mengirim...</>
                  : <><i className="fa-solid fa-paper-plane"></i> Ajukan Izin</>}
              </button>
            </form>
          </div>
        )}

        {/* ══════════════════════════════ */}
        {/* PANEL RIWAYAT IZIN            */}
        {/* ══════════════════════════════ */}
        {!showForm && (
          <div className="flex-1 overflow-y-auto pb-32 pt-5 px-6">

            <div className="flex justify-between items-center mb-4">
              <p className="text-xs font-black text-[#3e2723] uppercase tracking-wider">
                Riwayat Pengajuan
              </p>
              <button
                onClick={() => user && fetchLeaveHistory(user.employee_id)}
                className="flex items-center gap-1.5 text-[11px] font-black text-[#3e2723] bg-[#fff8e1] border border-[#fbc02d]/40 px-3 py-1.5 rounded-full active:scale-95 transition-all"
              >
                <i className={`fa-solid fa-rotate-right text-[10px] ${isLoadingHistory ? 'fa-spin' : ''}`}></i>
                Refresh
              </button>
            </div>

            {isLoadingHistory && (
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-gray-100 rounded-2xl h-24 animate-pulse"></div>
                ))}
              </div>
            )}

            {!isLoadingHistory && leaveHistory.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 bg-[#fff8e1] rounded-full flex items-center justify-center mb-4">
                  <i className="fa-solid fa-envelope-open-text text-2xl text-[#fbc02d]"></i>
                </div>
                <p className="text-sm font-black text-[#3e2723]">Belum Ada Pengajuan</p>
                <p className="text-[11px] text-gray-400 mt-1">Riwayat izin kamu akan muncul di sini</p>
                <button
                  onClick={() => setShowForm(true)}
                  className="mt-5 bg-[#fbc02d] text-[#3e2723] font-black text-xs px-5 py-2.5 rounded-full active:scale-95 transition-all shadow"
                >
                  <i className="fa-solid fa-plus mr-1.5"></i>Ajukan Izin Sekarang
                </button>
              </div>
            )}

            {!isLoadingHistory && leaveHistory.length > 0 && (
              <div className="flex flex-col gap-3">
                {leaveHistory.map((item) => (
                  <button
                    key={item.name}
                    onClick={() => setSelectedRecord(item)}
                    className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-left w-full active:scale-[0.98] transition-all hover:border-[#fbc02d]/40 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-[#fff8e1] rounded-full flex items-center justify-center shrink-0">
                          <i className="fa-solid fa-envelope-open-text text-[#fbc02d] text-sm"></i>
                        </div>
                        <p className="text-sm font-black text-[#3e2723] leading-tight">{item.leave_type}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {getStatusBadge(item.status)}
                        <i className="fa-solid fa-chevron-right text-[10px] text-gray-300"></i>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium mb-1.5 pl-10">
                      <i className="fa-regular fa-calendar text-[10px]"></i>
                      <span>
                        {formatDate(item.from_date)}
                        {item.from_date !== item.to_date && (
                          <> &rarr; {formatDate(item.to_date)}</>
                        )}
                      </span>
                      {item.total_leave_days > 0 && (
                        <span className="bg-gray-100 text-gray-500 text-[9px] font-black px-1.5 py-0.5 rounded-full ml-1">
                          {item.total_leave_days} hari
                        </span>
                      )}
                    </div>

                    {item.description && (
                      <p className="text-[11px] text-gray-400 pl-10 leading-relaxed line-clamp-2">
                        <i className="fa-solid fa-quote-left text-[8px] mr-1 text-gray-300"></i>
                        {item.description}
                      </p>
                    )}

                    {/* Indikator ada lampiran */}
                    {getAttachment(item) && (
                      <div className="pl-10 mt-2">
                        <span className="flex items-center gap-1 text-[10px] text-blue-500 font-bold">
                          <i className="fa-regular fa-image text-[10px]"></i> Ada bukti terlampir
                        </span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════ */}
        {/* MODAL DETAIL RIWAYAT IZIN             */}
        {/* ══════════════════════════════════════ */}
        {selectedRecord && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center"
            style={{ background: 'rgba(62,39,35,0.75)', backdropFilter: 'blur(4px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedRecord(null); }}
          >
            <div className="bg-white w-full max-w-sm rounded-t-3xl flex flex-col overflow-hidden shadow-2xl animate-slide-up">

              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-gray-200 rounded-full"></div>
              </div>

              {/* Header modal */}
              <div className="flex justify-between items-center px-5 py-3 border-b border-gray-100">
                <h3 className="font-black text-[#3e2723] text-base">Detail Izin</h3>
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="w-8 h-8 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center hover:bg-red-100 hover:text-red-500 transition-colors"
                >
                  <i className="fa-solid fa-xmark text-sm"></i>
                </button>
              </div>

              {/* Body modal */}
              <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto max-h-[75vh]">

                {/* Status banner */}
                <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 ${
                  selectedRecord.status?.toLowerCase() === 'approved'
                    ? 'bg-green-50 border border-green-100'
                    : selectedRecord.status?.toLowerCase() === 'rejected'
                    ? 'bg-red-50 border border-red-100'
                    : 'bg-yellow-50 border border-yellow-100'
                }`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                    selectedRecord.status?.toLowerCase() === 'approved'
                      ? 'bg-green-100 text-green-600'
                      : selectedRecord.status?.toLowerCase() === 'rejected'
                      ? 'bg-red-100 text-red-500'
                      : 'bg-yellow-100 text-yellow-600'
                  }`}>
                    <i className={`fa-solid ${
                      selectedRecord.status?.toLowerCase() === 'approved'
                        ? 'fa-circle-check'
                        : selectedRecord.status?.toLowerCase() === 'rejected'
                        ? 'fa-circle-xmark'
                        : 'fa-clock'
                    }`}></i>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium">Status Pengajuan</p>
                    <p className={`text-sm font-black ${
                      selectedRecord.status?.toLowerCase() === 'approved'
                        ? 'text-green-700'
                        : selectedRecord.status?.toLowerCase() === 'rejected'
                        ? 'text-red-600'
                        : 'text-yellow-700'
                    }`}>
                      {selectedRecord.status?.toLowerCase() === 'approved' ? 'Disetujui HRD'
                        : selectedRecord.status?.toLowerCase() === 'rejected' ? 'Ditolak HRD'
                        : 'Menunggu Persetujuan'}
                    </p>
                  </div>
                </div>

                {/* Info rows */}
                <div className="bg-gray-50 rounded-2xl divide-y divide-gray-100">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 bg-[#fff8e1] rounded-full flex items-center justify-center shrink-0">
                      <i className="fa-solid fa-tag text-[#fbc02d] text-xs"></i>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Tipe Izin</p>
                      <p className="text-sm font-black text-[#3e2723]">{selectedRecord.leave_type}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 bg-[#fff8e1] rounded-full flex items-center justify-center shrink-0">
                      <i className="fa-regular fa-calendar text-[#fbc02d] text-xs"></i>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Tanggal</p>
                      <p className="text-sm font-black text-[#3e2723]">
                        {formatDate(selectedRecord.from_date)}
                        {selectedRecord.from_date !== selectedRecord.to_date && (
                          <> → {formatDate(selectedRecord.to_date)}</>
                        )}
                      </p>
                    </div>
                  </div>

                  {selectedRecord.total_leave_days > 0 && (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="w-8 h-8 bg-[#fff8e1] rounded-full flex items-center justify-center shrink-0">
                        <i className="fa-solid fa-hourglass-half text-[#fbc02d] text-xs"></i>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Durasi</p>
                        <p className="text-sm font-black text-[#3e2723]">{selectedRecord.total_leave_days} hari</p>
                      </div>
                    </div>
                  )}

                  {selectedRecord.description && (
                    <div className="flex items-start gap-3 px-4 py-3">
                      <div className="w-8 h-8 bg-[#fff8e1] rounded-full flex items-center justify-center shrink-0 mt-0.5">
                        <i className="fa-solid fa-align-left text-[#fbc02d] text-xs"></i>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Keterangan</p>
                        <p className="text-sm font-medium text-[#3e2723] leading-relaxed">{selectedRecord.description}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bukti Foto */}
                {getAttachment(selectedRecord) && (
                  <div>
                    <p className="text-xs font-black text-[#3e2723] uppercase tracking-wider mb-2">
                      <i className="fa-regular fa-image mr-1.5 text-[#fbc02d]"></i>Bukti Lampiran
                    </p>
                    {isPdf(getAttachment(selectedRecord) || '') ? (
                      <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex flex-col items-center gap-2">
                        <i className="fa-solid fa-file-pdf text-3xl text-red-500"></i>
                        <p className="text-xs text-gray-500 font-medium text-center">File PDF</p>
                        <a
                          href={prosesUrlFoto(getAttachment(selectedRecord))}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-black text-blue-600 bg-blue-50 border border-blue-100 px-4 py-2 rounded-xl hover:bg-blue-100 transition-colors"
                        >
                          <i className="fa-solid fa-arrow-up-right-from-square mr-1.5"></i>Buka PDF
                        </a>
                      </div>
                    ) : (
                      <button
                        onClick={() => setPreviewUrl(prosesUrlFoto(getAttachment(selectedRecord)))}
                        className="w-full relative h-40 rounded-2xl overflow-hidden border border-[#fbc02d]/30 group"
                      >
                        <img
                          src={prosesUrlFoto(getAttachment(selectedRecord))}
                          alt="Bukti Izin"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                          <div className="bg-white/90 rounded-full px-3 py-1.5 flex items-center gap-1.5">
                            <i className="fa-solid fa-magnifying-glass text-[#3e2723] text-xs"></i>
                            <span className="text-xs font-black text-[#3e2723]">Lihat Lebih Besar</span>
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                )}

                {/* Nomor referensi */}
                <div className="bg-gray-50 rounded-xl px-4 py-2.5 flex items-center justify-between">
                  <p className="text-[10px] text-gray-400 font-medium">No. Referensi</p>
                  <p className="text-[10px] font-black text-gray-500">{selectedRecord.name}</p>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 pb-6 pt-3 border-t border-gray-100">
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="w-full bg-[#3e2723] text-white font-black py-3.5 rounded-xl active:scale-95 transition-all"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════ */}
        {/* MODAL PREVIEW GAMBAR FULLSIZE */}
        {/* ══════════════════════════════ */}
        {previewUrl && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(6px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) setPreviewUrl(null); }}
          >
            <div className="w-full max-w-sm flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <p className="text-white font-black text-sm">Bukti Lampiran</p>
                <button
                  onClick={() => setPreviewUrl(null)}
                  className="w-9 h-9 bg-white/10 text-white rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
              <div className="rounded-2xl overflow-hidden bg-black/40 max-h-[75vh] flex items-center justify-center">
                <img
                  src={previewUrl}
                  alt="Bukti Izin Full"
                  className="w-full object-contain max-h-[75vh]"
                />
              </div>
              <button
                onClick={() => setPreviewUrl(null)}
                className="w-full bg-white/10 text-white font-black py-3 rounded-xl hover:bg-white/20 transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        )}

        {/* Navigation Bottom */}
        <nav className="absolute bottom-0 left-0 right-0 w-full bg-white border-t border-gray-100 px-4 py-3 flex justify-between z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.02)]">
          <Link to="/home" className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors">
            <i className="fa-solid fa-house text-xl mb-1"></i>
            <span className="text-[10px] font-black uppercase">Home</span>
          </Link>
          <Link to="/absen" className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors">
            <i className="fa-solid fa-clipboard-user text-xl mb-1"></i>
            <span className="text-[10px] font-black uppercase">Absen</span>
          </Link>
          <div className="flex flex-col items-center text-[#3e2723] w-1/4">
            <i className="fa-solid fa-envelope-open-text text-xl mb-1 drop-shadow-md"></i>
            <span className="text-[10px] font-black uppercase">Izin</span>
          </div>
          <Link to="/cuti" className="flex flex-col items-center text-gray-300 w-1/4 hover:text-[#3e2723] transition-colors">
            <i className="fa-solid fa-calendar-minus text-xl mb-1"></i>
            <span className="text-[10px] font-black uppercase">Cuti</span>
          </Link>
        </nav>
      </div>
    </div>
  );
};

export default Izin;