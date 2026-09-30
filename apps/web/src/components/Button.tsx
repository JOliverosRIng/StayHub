import React from 'react';

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'social';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  fullWidth = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 cursor-pointer select-none';

  const variants: Record<ButtonVariant, string> = {
    primary:
      'bg-[#E31C5F] text-white hover:bg-[#C7184E] active:bg-[#b0163f] focus-visible:ring-[#E31C5F] shadow-sm',
    outline:
      'bg-white text-gray-800 border border-gray-300 hover:border-gray-400 hover:bg-gray-50 active:bg-gray-100 focus-visible:ring-gray-400',
    ghost:
      'bg-transparent text-gray-700 hover:bg-gray-100 active:bg-gray-200 focus-visible:ring-gray-400',
    social:
      'bg-white text-gray-800 border border-gray-300 hover:bg-gray-50 active:bg-gray-100 focus-visible:ring-gray-400 shadow-sm',
  };

  const sizes: Record<ButtonSize, string> = {
    sm: 'h-8 px-3 text-sm gap-1.5',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base',
  };

  const disabledStyle = 'opacity-50 pointer-events-none';

  return (
    <button
      className={[
        base,
        variants[variant],
        sizes[size],
        fullWidth ? 'w-full' : '',
        disabled || loading ? disabledStyle : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
