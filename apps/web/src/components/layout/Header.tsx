import type { ReactNode } from 'react';
import type { Navigate } from '../../types';
import { Logo } from './Logo';

interface HeaderProps {
  onNavigate: Navigate;
  /** Enlaces de texto de la navegación (solo escritorio). */
  navItems?: string[];
  /** Contenido extra entre el logo y la navegación (ej. buscador). */
  search?: ReactNode;
  /** Franja inferior del header (ej. categorías). */
  bottom?: ReactNode;
}

export function Header({ onNavigate, navItems = [], search, bottom }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center gap-6">
        <Logo onClick={() => onNavigate('home')} />
        {search}

        <nav className="hidden lg:flex items-center gap-1">
          {navItems.map((item) => (
            <button
              key={item}
              className="text-sm font-medium text-gray-700 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          <button
            onClick={() => onNavigate('login')}
            className="hidden sm:block text-sm font-semibold text-primary border border-primary px-4 py-1.5 rounded-full hover:bg-primary-light transition-colors"
          >
            Iniciar sesión
          </button>
          <button
            onClick={() => onNavigate('register')}
            className="text-sm font-semibold text-white bg-primary px-4 py-1.5 rounded-full hover:bg-primary-hover transition-colors"
          >
            Registrarse
          </button>
        </div>
      </div>

      {bottom && <div className="max-w-screen-xl mx-auto px-6 pb-3">{bottom}</div>}
    </header>
  );
}
