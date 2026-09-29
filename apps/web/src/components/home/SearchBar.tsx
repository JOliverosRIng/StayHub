interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="flex-1 flex items-center border border-gray-300 rounded-full shadow-sm hover:shadow-md transition-shadow overflow-hidden max-w-xl">
      <div className="flex-1 px-4 py-2.5 border-r border-gray-200">
        <p className="text-xs font-semibold text-gray-700">Destino</p>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="¿A dónde quieres ir?"
          className="text-sm text-gray-500 placeholder-gray-400 outline-none w-full bg-transparent"
        />
      </div>
      <div className="px-4 py-2.5 border-r border-gray-200 hidden md:block">
        <p className="text-xs font-semibold text-gray-700">Entrada</p>
        <p className="text-sm text-gray-400">Agregar fecha</p>
      </div>
      <div className="px-4 py-2.5 hidden md:block">
        <p className="text-xs font-semibold text-gray-700">Huéspedes</p>
        <p className="text-sm text-gray-400">Agregar</p>
      </div>
      <button
        aria-label="Buscar"
        className="m-2 w-9 h-9 bg-primary rounded-full flex items-center justify-center shrink-0 hover:bg-primary-hover transition-colors"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </button>
    </div>
  );
}
