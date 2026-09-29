import type { ReactNode } from 'react';
import type { Property } from '../../types';
import { PropertyCard } from './PropertyCard';

interface PropertySectionProps {
  title: string;
  properties: Property[];
  onSelect: (id: string) => void;
  /** Clases de grilla de Tailwind, ej. "grid-cols-2 lg:grid-cols-4". */
  columns?: string;
  /** Contenido a la derecha del título (enlace "Ver todo", filtros...). */
  actions?: ReactNode;
  /** Contenido debajo de la grilla (botón "Explorar más"...). */
  footer?: ReactNode;
}

export function PropertySection({
  title,
  properties,
  onSelect,
  columns = 'grid-cols-2 lg:grid-cols-4',
  actions,
  footer,
}: PropertySectionProps) {
  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        {actions}
      </div>
      <div className={`grid gap-x-5 gap-y-7 ${columns}`}>
        {properties.map(({ id, ...property }) => (
          <PropertyCard key={id} {...property} onClick={() => onSelect(id)} />
        ))}
      </div>
      {footer && <div className="flex justify-center mt-8">{footer}</div>}
    </section>
  );
}
