import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // 🔥 STATE BARU UNTUK HIDE/SHOW PASSWORD
  const [showPassword, setShowPassword] = useState<boolean>(false);
  
  const navigate = useNavigate();

  // 🚀 KITA HARDCODE LINK-NYA BIAR 1000% AMAN DARI ERROR VITE
  const BACKEND = 'https://ropi-hr-backend.vercel.app';

  // 🛑 KITA MATIKAN AUTO-LOGIN SEMENTARA BIAR NGGAK INFINITE LOOP!
  /*
  useEffect(() => {
    if (localStorage.getItem('ropi_user')) {
      navigate('/home');
    }
  }, [navigate]);
  */

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch(`${BACKEND}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const responsData = await res.json();

      if (res.ok || responsData.statusCode === 200) {
        localStorage.setItem('ropi_user', JSON.stringify(responsData.data));
        navigate('/home'); 
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
    <div className="bg-gray-200 flex justify-center h-screen font-sans text-[#3e2723] selection:bg-[#fbc02d]">
      <div className="w-full max-w-md bg-[#f8fafc] h-full relative shadow-2xl flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col justify-center px-8 bg-[#fff8e1] absolute inset-0 z-50">
          
          <div className="text-center mb-10 z-10">
            <div className="w-28 h-28 bg-[#3e2723] rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-[0_10px_30px_-5px_rgba(251,192,45,0.3)] rotate-3">
              <i className="fa-solid fa-bread-slice text-[#fbc02d] text-5xl -rotate-3"></i>
            </div>
            <h1 className="text-4xl font-extrabold text-[#3e2723] tracking-tight">
              Ropi<span className="text-[#fbc02d]">HR</span>
            </h1>
            <p className="text-[#3e2723] opacity-80 mt-2 font-bold text-sm tracking-widest uppercase">
              Roti Bikin Hepi
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5 z-10 w-full">
            <div>
              <div className="relative">
                <i className="fa-regular fa-user absolute left-5 top-4 text-[#3e2723] opacity-50 text-lg"></i>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email ERPNext"
                  className="w-full bg-white border-2 border-transparent rounded-2xl py-4 pl-14 pr-4 text-lg focus:border-[#fbc02d] outline-none transition-all shadow-sm"
                  required
                />
              </div>
            </div>
            
            {/* 🔥 REVISI KOTAK PASSWORD 🔥 */}
            <div>
              <div className="relative">
                <i className="fa-solid fa-lock absolute left-5 top-4 text-[#3e2723] opacity-50 text-lg"></i>
                <input
                  // Tipe input berubah dinamis berdasarkan state showPassword
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full bg-white border-2 border-transparent rounded-2xl py-4 pl-14 pr-12 text-lg focus:border-[#fbc02d] outline-none transition-all shadow-sm"
                  required
                />
                {/* Tombol Mata */}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-4 text-[#3e2723] opacity-50 hover:opacity-100 transition-opacity focus:outline-none"
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                >
                  <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-lg`}></i>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#fbc02d] text-[#3e2723] font-black text-xl py-4 rounded-2xl shadow-[0_10px_30px_-5px_rgba(251,192,45,0.3)] hover:scale-[1.02] transition-transform mt-8 flex justify-center items-center gap-2"
            >
              {isLoading ? (
                <><i className="fa-solid fa-spinner fa-spin"></i> Memproses...</>
              ) : (
                'Mulai Bekerja'
              )}
            </button>
          </form>
          
          {/* Tombol Darurat untuk Hapus Cache */}
          <button 
            onClick={() => { localStorage.clear(); alert('Cache dibersihkan! Silakan reload page.'); window.location.reload(); }}
            className="mt-8 text-xs font-bold text-red-500 underline z-10"
          >
            Hapus Cache (Jika Error)
          </button>

          <div className="absolute bottom-0 left-0 right-0 h-32 bg-[#fbc02d] rounded-t-[100%] opacity-20 -mb-10 pointer-events-none"></div>
        </div>
      </div>
    </div>
  );
};

export default Login;