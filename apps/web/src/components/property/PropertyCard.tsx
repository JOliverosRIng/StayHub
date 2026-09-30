import { useState } from 'react';
import type { Property } from '../../types';

interface PropertyCardProps extends Omit<Property, 'id'> {
  onClick?: () => void;
}

export function PropertyCard({
  image,
  title,
  location,
  rating,
  reviewCount,
  pricePerNight,
  nights = 3,
  tag,
  onClick,
}: PropertyCardProps) {
  const [saved, setSaved] = useState(false);

  return (
    // role="link" + teclado: la card completa se puede usar sin mouse
    <div
      role="link"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      className="group flex flex-col cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl"
    >
      {/* Imagen */}
      <div className="relative rounded-2xl overflow-hidden aspect-[4/3] bg-gray-200 mb-3">
        <img
          src={image}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {tag && (
          <span className="absolute top-3 left-3 bg-white text-gray-800 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
            {tag}
          </span>
        )}

        <button
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm hover:bg-white transition-colors"
          onClick={(e) => {
            e.stopPropagation(); // evita abrir el detalle al guardar
            setSaved((s) => !s);
          }}
          aria-label={saved ? 'Quitar de favoritos' : 'Guardar en favoritos'}
        >
          <svg
            viewBox="0 0 24 24"
            className={`w-4.5 h-4.5 transition-colors ${saved ? 'fill-primary stroke-primary' : 'fill-none stroke-gray-700'}`}
            strokeWidth={2}
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      </div>

      {/* Información */}
      <div className="flex flex-col gap-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-1">{title}</p>
          <div className="flex items-center gap-1 shrink-0">
            <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 fill-gray-900" aria-hidden>
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span className="text-sm font-medium text-gray-900">{rating.toFixed(2)}</span>
          </div>
        </div>
        <p className="text-sm text-gray-500">{location}</p>
        <p className="text-sm text-gray-500">{reviewCount} reseñas</p>
        <p className="text-sm text-gray-900 mt-1">
          <span className="font-semibold">${pricePerNight}</span>
          <span className="text-gray-500"> noche · ${pricePerNight * nights} total</span>
        </p>
      </div>
    </div>
  );
}
