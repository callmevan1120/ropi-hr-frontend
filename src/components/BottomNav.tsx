import { Link, useLocation } from 'react-router-dom';

const BottomNav = () => {
  const location = useLocation();

  const getNavClass = (path: string) => {
    const isActive = location.pathname === path;
    return `flex flex-col items-center w-1/4 transition-colors active:scale-95 ${
      isActive ? 'text-[#3e2723] drop-shadow-md' : 'text-gray-300 hover:text-[#3e2723]'
    }`;
  };

  return (
    <nav className="absolute bottom-0 left-0 right-0 w-full bg-white border-t border-gray-100 px-4 py-3 flex justify-between z-40 shadow-[0_-5px_15px_rgba(0,0,0,0.02)]">
      <Link to="/home" className={getNavClass('/home')}>
        <i className="fa-solid fa-house text-xl mb-1"></i>
        <span className="text-[10px] font-black uppercase">Home</span>
      </Link>
      
      <Link to="/absen" className={getNavClass('/absen')}>
        <i className="fa-solid fa-clipboard-user text-xl mb-1"></i>
        <span className="text-[10px] font-black uppercase">Absen</span>
      </Link>
      
      <Link to="/izin" className={getNavClass('/izin')}>
        <i className="fa-solid fa-envelope-open-text text-xl mb-1"></i>
        <span className="text-[10px] font-black uppercase">Izin</span>
      </Link>
      
      <Link to="/profil" className={getNavClass('/profil')}>
        <i className="fa-solid fa-user text-xl mb-1"></i>
        <span className="text-[10px] font-black uppercase">Profil</span>
      </Link>
    </nav>
  );
};

export default BottomNav;