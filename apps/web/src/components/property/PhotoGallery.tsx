import { useCallback, useEffect, useRef, useState } from 'react';
import { photoUrl } from '../../api/properties';
import type { Photo } from '../../types/catalog';

interface PhotoGalleryProps {
  propertyId: string;
  propertyName: string;
  /** Already ordered by position. */
  photos: Photo[];
}

const altText = (name: string, index: number, total: number) => `${name}, foto ${index + 1} de ${total}`;

/**
 * Grid of photo buttons plus a modal viewer. Keyboard: Enter/Space opens, ←/→ navigate,
 * Escape closes and focus returns to the thumbnail that opened it.
 */
export function PhotoGallery({ propertyId, propertyName, photos }: PhotoGalleryProps) {
  const [open, setOpen] = useState<number | null>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastOpened = useRef(0);
  const total = photos.length;

  const close = useCallback(() => {
    setOpen(null);
    triggers.current[Math.min(lastOpened.current, 4)]?.focus();
  }, []);
  const step = useCallback((delta: number) => setOpen((i) => (i === null ? i : (i + delta + total) % total)), [total]);

  useEffect(() => { if (open !== null) closeRef.current?.focus(); }, [open !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (total === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl bg-gray-100 text-sm text-gray-500 mb-10">
        Este alojamiento aún no tiene fotos.
      </div>
    );
  }

  const show = (index: number) => { lastOpened.current = index; setOpen(index); };
  const visible = photos.slice(0, 5);

  return (
    <>
      <div
        role="group"
        aria-label={`Fotos de ${propertyName}`}
        className={`grid gap-2 rounded-2xl overflow-hidden mb-10 h-72 md:h-96 ${visible.length >= 4 ? 'grid-cols-4 grid-rows-2' : visible.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
      >
        {visible.map((photo, i) => (
          <button
            key={photo.id}
            type="button"
            ref={(el) => { triggers.current[i] = el; }}
            onClick={() => show(i)}
            aria-label={`Ver foto ${i + 1} de ${total} en tamaño completo`}
            className={`relative overflow-hidden focus:outline-none focus-visible:ring-4 focus-visible:ring-primary ${i === 0 && visible.length > 1 ? 'col-span-2 row-span-2' : ''}`}
          >
            <img src={photoUrl(propertyId, photo)} alt={altText(propertyName, i, total)} className="w-full h-full object-cover" />
            {i === visible.length - 1 && total > visible.length && (
              <span className="absolute bottom-3 right-3 rounded-lg bg-white/90 px-3 py-1 text-xs font-semibold text-gray-900">
                +{total - visible.length} fotos
              </span>
            )}
          </button>
        ))}
      </div>

      {open !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Galería de fotos de ${propertyName}`}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-6"
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); close(); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
            else if (e.key === 'Tab') {
              // Keep focus inside the dialog.
              const focusable = e.currentTarget.querySelectorAll<HTMLButtonElement>('button');
              const first = focusable[0]; const last = focusable[focusable.length - 1];
              if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
              else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
            }
          }}
        >
          <div className="flex w-full max-w-4xl items-center justify-between text-white mb-4">
            <p aria-live="polite">Foto {open + 1} de {total}</p>
            <button ref={closeRef} type="button" onClick={close} className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white">
              Cerrar galería
            </button>
          </div>
          <img src={photoUrl(propertyId, photos[open]!)} alt={altText(propertyName, open, total)} className="max-h-[75vh] max-w-full rounded-xl object-contain" />
          {total > 1 && (
            <div className="mt-4 flex gap-4">
              <button type="button" onClick={() => step(-1)} className="rounded-full bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white">
                Foto anterior
              </button>
              <button type="button" onClick={() => step(1)} className="rounded-full bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white">
                Foto siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
