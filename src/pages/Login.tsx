import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  
  const navigate = useNavigate();
  const BACKEND = 'https://ropi-hr-backend.vercel.app';

  // Cek jika sudah login, langsung arahkan ke jalurnya masing-masing
  useEffect(() => {
    const userStr = localStorage.getItem('ropi_user');
    if (userStr) {
      const user = JSON.parse(userStr);
      const isHR = user.role === 'HR' || user.role === 'HR Manager' || user.role === 'System Manager';
      if (isHR) {
        navigate('/hr-dashboard');
      } else {
        navigate('/home');
      }
    }
  }, [navigate]);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email) {
      alert('Email wajib diisi!');
      return;
    }
    
    setIsLoading(true);

    try {
      const res = await fetch(`${BACKEND}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const responsData = await res.json();

      if (res.ok || responsData.statusCode === 200) {
        
        const roleKaryawan = responsData.data.role || responsData.data.designation || 'Staff';
        
        // PASTIKAN EMAIL TERSIMPAN
        const userData = {
          name: responsData.data.name || responsData.data.employee_name || responsData.data.full_name || 'Karyawan',
          email: responsData.data.email || email, 
          role: roleKaryawan, 
          employee_id: responsData.data.employee_id,
          branch: responsData.data.branch || 'PH Klaten',
        };
        
        localStorage.setItem('ropi_user', JSON.stringify(userData));

        // LOGIKA JALAN BERCABANG: PISAHKAN DUNIA HR & KARYAWAN
        const isHR = roleKaryawan === 'HR' || roleKaryawan === 'HR Manager' || roleKaryawan === 'System Manager';
        if (isHR) {
          navigate('/hr-dashboard'); // HRD langsung terlempar ke Dashboard HR
        } else {
          navigate('/home'); // Karyawan masuk ke Home biasa
        }

      } else {
        alert('❌ Login gagal! Email tidak terdaftar atau password salah.');
      }
    } catch (err) {
      console.error(err);
      alert('❌ Gagal terhubung ke Server HR. Pastikan koneksi internet stabil atau server sedang aktif.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-gray-100 flex items-center justify-center min-h-screen font-sans text-[#3e2723] selection:bg-[#fbc02d] md:p-6 lg:p-10 w-full overflow-hidden">
      
      {/* Container Utama: Berubah jadi Split Screen di Desktop, Full Screen di Mobile */}
      <div className="w-full md:max-w-4xl lg:max-w-5xl bg-white md:rounded-[3rem] h-screen md:h-[600px] lg:h-[700px] relative shadow-2xl flex flex-col md:flex-row overflow-hidden border border-gray-200">
        
        {/* =========================================
            BAGIAN KIRI: ILLUSTRASI (Hanya Tampil di PC) 
            ========================================= */}
        <div className="hidden md:flex flex-col w-1/2 bg-[#3e2723] relative p-12 lg:p-16 justify-between overflow-hidden">
          {/* Aksen Hiasan Geometris */}
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <div className="absolute -top-20 -left-20 w-96 h-96 bg-[#fbc02d] rounded-full blur-3xl"></div>
            <div className="absolute bottom-10 -right-10 w-72 h-72 bg-orange-400 rounded-full blur-3xl"></div>
          </div>

          <div className="relative z-10">
            <div className="w-20 h-20 bg-[#fbc02d] rounded-2xl flex items-center justify-center mb-8 shadow-lg shadow-[#fbc02d]/20 rotate-3">
              <i className="fa-solid fa-bread-slice text-[#3e2723] text-4xl -rotate-3"></i>
            </div>
            <h1 className="text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">
              Selamat Datang di <br />
              <span className="text-[#fbc02d]">RopiHR</span> Workspace.
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


        {/* =========================================
            BAGIAN KANAN: FORM LOGIN (Tampil di Semua Layar) 
            ========================================= */}
        <div className="flex-1 flex flex-col justify-center px-8 md:px-12 lg:px-20 bg-[#fff8e1] relative z-20 w-full md:w-1/2 h-full overflow-y-auto">
          
          {/* Logo Mobile (Hanya tampil di HP) */}
          <div className="text-center mb-10 md:hidden mt-10">
            <div className="w-24 h-24 bg-[#3e2723] rounded-[1.5rem] flex items-center justify-center mx-auto mb-5 shadow-lg shadow-[#3e2723]/20 rotate-3">
              <i className="fa-solid fa-bread-slice text-[#fbc02d] text-4xl -rotate-3"></i>
            </div>
            <h1 className="text-3xl font-extrabold text-[#3e2723] tracking-tight">
              Ropi<span className="text-[#fbc02d]">HR</span>
            </h1>
            <p className="text-[#3e2723] opacity-60 mt-1 font-bold text-xs tracking-widest uppercase">
              Roti Bikin Hepi
            </p>
          </div>

          {/* Heading Form Desktop */}
          <div className="hidden md:block mb-8 text-center md:text-left">
            <h2 className="text-2xl lg:text-3xl font-black text-[#3e2723] mb-2">Masuk Akun</h2>
            <p className="text-gray-500 text-sm font-medium">Gunakan email ERPNext Anda untuk mengakses sistem.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5 w-full max-w-sm mx-auto md:mx-0">
            <div>
              <label className="text-[10px] font-black text-[#3e2723]/60 uppercase tracking-widest ml-1 mb-1.5 block md:hidden">Email</label>
              <div className="relative group">
                <i className="fa-regular fa-envelope absolute left-5 top-4 text-gray-400 group-focus-within:text-[#fbc02d] transition-colors text-lg"></i>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email ERPNext"
                  className="w-full bg-white border-2 border-transparent rounded-2xl py-4 pl-14 pr-4 text-sm md:text-base focus:border-[#fbc02d] outline-none transition-all shadow-[0_5px_15px_-5px_rgba(0,0,0,0.05)]"
                  required
                />
              </div>
            </div>
            
            <div>
              <label className="text-[10px] font-black text-[#3e2723]/60 uppercase tracking-widest ml-1 mb-1.5 block md:hidden">Password</label>
              <div className="relative group">
                <i className="fa-solid fa-lock absolute left-5 top-4 text-gray-400 group-focus-within:text-[#fbc02d] transition-colors text-lg"></i>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full bg-white border-2 border-transparent rounded-2xl py-4 pl-14 pr-12 text-sm md:text-base focus:border-[#fbc02d] outline-none transition-all shadow-[0_5px_15px_-5px_rgba(0,0,0,0.05)]"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-4 text-gray-400 hover:text-[#3e2723] transition-colors focus:outline-none"
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                >
                  <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-lg`}></i>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#fbc02d] text-[#3e2723] font-black text-lg py-4 rounded-2xl shadow-[0_10px_30px_-5px_rgba(251,192,45,0.4)] hover:shadow-[0_15px_35px_-5px_rgba(251,192,45,0.5)] hover:-translate-y-1 transition-all mt-8 flex justify-center items-center gap-2"
            >
              {isLoading ? (
                <><i className="fa-solid fa-spinner fa-spin"></i> Sedang Masuk...</>
              ) : (
                <>Mulai Bekerja <i className="fa-solid fa-arrow-right ml-1"></i></>
              )}
            </button>
          </form>
          
          <div className="mt-8 text-center md:text-left pb-10 md:pb-0">
            <button 
              onClick={() => { localStorage.clear(); alert('Cache dibersihkan! Silakan reload page.'); window.location.reload(); }}
              className="text-[11px] font-bold text-red-400 hover:text-red-500 hover:underline transition-colors flex items-center justify-center md:justify-start mx-auto md:mx-0 gap-1.5"
            >
              <i className="fa-solid fa-broom"></i> Bersihkan Cache App (Jika Error)
            </button>
          </div>

          {/* Gelombang Bawah Mobile (Sembunyikan di PC) */}
          <div className="md:hidden absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#fbc02d]/30 to-transparent pointer-events-none"></div>
        </div>

      </div>
    </div>
  );
};

export default Login;