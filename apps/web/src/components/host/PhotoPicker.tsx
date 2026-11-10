import { useId } from 'react';
import { CATALOG_LIMITS, PHOTO_MEDIA_TYPES } from '../../types/catalog';
import { nextKey, type FormErrors, type PhotoDraft } from './propertyForm';

export type PhotoStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

interface PhotoPickerProps {
  photos: PhotoDraft[];
  errors: FormErrors;
  status: Record<string, PhotoStatus>;
  /** Server-side errors per photo key. */
  uploadErrors: Record<string, string>;
  onChange: (photos: PhotoDraft[]) => void;
  disabled?: boolean;
}

const sizeLabel = (bytes: number) => `${(bytes / 1_000_000).toFixed(2)} MB`;
const STATUS_LABEL: Record<PhotoStatus, string> = { pending: 'Pendiente', uploading: 'Subiendo…', uploaded: 'Subida', failed: 'Error al subir' };

/** JPEG/PNG/WebP, up to 5 000 000 bytes each and ten per property. Files are validated on selection. */
export function PhotoPicker({ photos, errors, status, uploadErrors, onChange, disabled }: PhotoPickerProps) {
  const id = useId();
  const remaining = CATALOG_LIMITS.photosPerProperty - photos.length;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-lg font-bold text-gray-900 mb-2">Fotos</legend>
      <label htmlFor={`${id}-input`} className="text-sm font-medium text-gray-700">Agregar fotos</label>
      <input
        id={`${id}-input`}
        type="file"
        multiple
        accept={PHOTO_MEDIA_TYPES.join(',')}
        disabled={disabled || remaining <= 0}
        aria-describedby={`${id}-hint${errors.photos ? ` ${id}-error` : ''}`}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onChange([...photos, ...files.map((file) => ({ key: nextKey('photo'), file }))]);
          e.target.value = '';
        }}
        className="text-sm"
      />
      <p id={`${id}-hint`} className="text-xs text-gray-500">
        JPEG, PNG o WebP de hasta 5 MB (5 000 000 bytes). Máximo {CATALOG_LIMITS.photosPerProperty} fotos; la primera será la portada.
      </p>
      {errors.photos && <p id={`${id}-error`} role="alert" className="text-xs text-red-600">{errors.photos}</p>}

      {photos.length > 0 && (
        <ul aria-label="Fotos seleccionadas" className="flex flex-col gap-2">
          {photos.map((photo, i) => {
            const state = status[photo.key] ?? 'pending';
            const problem = errors[`photos.${photo.key}`] ?? uploadErrors[photo.key];
            return (
              <li key={photo.key} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${problem ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{i + 1}. {photo.file.name}</p>
                  <p className="text-xs text-gray-500">{sizeLabel(photo.file.size)} · {STATUS_LABEL[state]}</p>
                  {problem && <p role="alert" className="text-xs text-red-600">{problem}</p>}
                </div>
                {state !== 'uploaded' && state !== 'uploading' && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(photos.filter((p) => p.key !== photo.key))}
                    aria-label={`Quitar ${photo.file.name}`}
                    className="shrink-0 text-xs font-medium text-red-600 hover:underline"
                  >
                    Quitar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
