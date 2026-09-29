export function LogoIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`text-primary ${className}`} fill="none" aria-hidden>
      <path
        d="M16 3C9.373 3 4 8.373 4 15c0 4.39 2.364 8.228 5.878 10.348L16 29l6.122-3.652C25.636 23.228 28 19.39 28 15c0-6.627-5.373-12-12-12z"
        fill="currentColor"
      />
      <circle cx="16" cy="15" r="4" fill="white" />
    </svg>
  );
}

interface LogoProps {
  onClick?: () => void;
  /** 'md' oculta el texto en móvil; 'lg' lo muestra siempre y más grande. */
  size?: 'md' | 'lg';
}

export function Logo({ onClick, size = 'md' }: LogoProps) {
  const textSize = size === 'lg' ? 'text-xl' : 'text-lg hidden sm:block';
  return (
    <button onClick={onClick} className="flex items-center gap-2 shrink-0 cursor-pointer" aria-label="Ir al inicio">
      <LogoIcon />
      <span className={`font-bold text-gray-900 ${textSize}`}>
        stayhub<span className="text-primary">.</span>
      </span>
    </button>
  );
}
