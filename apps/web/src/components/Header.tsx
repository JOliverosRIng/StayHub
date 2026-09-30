import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  onNavigate: (page: string, id?: string) => void;
  showSearch?: boolean;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
}

const Logo = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="flex items-center gap-2 shrink-0 cursor-pointer">
    <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none">
      <path
        d="M16 3C9.373 3 4 8.373 4 15c0 4.39 2.364 8.228 5.878 10.348L16 29l6.122-3.652C25.636 23.228 28 19.39 28 15c0-6.627-5.373-12-12-12z"
        fill="#E31C5F"
      />
      <circle cx="16" cy="15" r="4" fill="white" />
    </svg>
    <span className="text-lg font-bold text-gray-900 hidden sm:block">
      stayhub<span className="text-[#E31C5F]">.</span>
    </span>
  </button>
);

export function Header({ onNavigate, showSearch, searchValue, onSearchChange }: HeaderProps) {
  const { currentUser, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center gap-4">
        <Logo onClick={() => onNavigate('home')} />

        {showSearch && (
          <div className="flex-1 flex items-center border border-gray-300 rounded-full shadow-sm hover:shadow-md transition-shadow overflow-hidden max-w-xl mx-auto">
            <div className="flex-1 px-4 py-2.5">
              <p className="text-xs font-semibold text-gray-700">Destino</p>
              <input
                type="text"
                value={searchValue}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder="¿A dónde quieres ir?"
                className="text-sm text-gray-600 placeholder-gray-400 outline-none w-full bg-transparent"
              />
            </div>
            <button className="m-2 w-9 h-9 bg-[#E31C5F] rounded-full flex items-center justify-center shrink-0 hover:bg-[#C7184E] transition-colors">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {currentUser ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 border border-gray-300 rounded-full px-3 py-1.5 hover:shadow-md transition-shadow"
              >
                <div className="w-8 h-8 rounded-full bg-[#E31C5F] flex items-center justify-center text-white text-sm font-bold">
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-gray-800 hidden sm:block max-w-32 truncate">
                  {currentUser.name.split(' ')[0]}
                </span>
                <svg viewBox="0 0 24 24" className={`w-4 h-4 text-gray-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-gray-200 rounded-2xl shadow-xl py-2 z-50">
                  <div className="px-4 py-2 border-b border-gray-100 mb-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{currentUser.name}</p>
                    <p className="text-xs text-gray-400 truncate">{currentUser.email}</p>
                  </div>
                  <button
                    onClick={() => { setMenuOpen(false); onNavigate('bookings'); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    Mis reservas
                  </button>
                  <button
                    onClick={() => { logout(); setMenuOpen(false); onNavigate('home'); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <button
                onClick={() => onNavigate('login')}
                className="text-sm font-semibold text-[#E31C5F] border border-[#E31C5F] px-4 py-1.5 rounded-full hover:bg-[#fce7ef] transition-colors hidden sm:block"
              >
                Iniciar sesión
              </button>
              <button
                onClick={() => onNavigate('register')}
                className="text-sm font-semibold text-white bg-[#E31C5F] px-4 py-1.5 rounded-full hover:bg-[#C7184E] transition-colors"
              >
                Registrarse
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
