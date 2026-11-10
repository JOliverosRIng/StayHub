import { validatePhotoFile } from '../../api/properties';
import {
  AMOUNT_PATTERN, CATALOG_LIMITS, COUNTRY_PATTERN, CURRENCY_PATTERN, ZERO_AMOUNT_PATTERN,
  type PropertyCreate, type PropertyType,
} from '../../types/catalog';

/** Editable form state for publishing a property (strings mirror the inputs). */

export interface RoomDraft { key: string; name: string; capacity: string; amount: string; currency: string }
export interface PhotoDraft { key: string; file: File }

export interface PropertyFormState {
  type: PropertyType | '';
  name: string;
  description: string;
  addressLine: string;
  city: string;
  region: string;
  country: string;
  postalCode: string;
  latitude: string;
  longitude: string;
  featureCodes: string[];
  rooms: RoomDraft[];
}

export type FormErrors = Record<string, string>;

let sequence = 0;
export const nextKey = (prefix: string) => `${prefix}-${(sequence += 1)}`;

export const emptyRoom = (currency = 'USD'): RoomDraft => ({ key: nextKey('room'), name: '', capacity: '2', amount: '', currency });

export const emptyPropertyForm = (): PropertyFormState => ({
  type: '', name: '', description: '', addressLine: '', city: '', region: '', country: '', postalCode: '',
  latitude: '', longitude: '', featureCodes: [], rooms: [emptyRoom()],
});

const tooLong = (value: string, max: number) => value.trim().length > max;

/** Field keys: `name`, `location.city`, `rooms.0.amount`, `photos`, `photos.<key>`, … */
export function validatePropertyForm(form: PropertyFormState, photos: PhotoDraft[], { publish }: { publish: boolean }): FormErrors {
  const e: FormErrors = {};
  if (!form.type) e.type = 'Selecciona el tipo de alojamiento.';
  if (!form.name.trim()) e.name = 'El nombre es obligatorio.';
  else if (tooLong(form.name, CATALOG_LIMITS.nameMaxLength)) e.name = `Usa hasta ${CATALOG_LIMITS.nameMaxLength} caracteres.`;
  if (tooLong(form.description, CATALOG_LIMITS.descriptionMaxLength)) e.description = `Usa hasta ${CATALOG_LIMITS.descriptionMaxLength} caracteres.`;

  if (!form.addressLine.trim()) e['location.addressLine'] = 'La dirección es obligatoria.';
  else if (tooLong(form.addressLine, CATALOG_LIMITS.addressLineMaxLength)) e['location.addressLine'] = `Usa hasta ${CATALOG_LIMITS.addressLineMaxLength} caracteres.`;
  if (!form.city.trim()) e['location.city'] = 'La ciudad es obligatoria.';
  else if (tooLong(form.city, CATALOG_LIMITS.cityMaxLength)) e['location.city'] = `Usa hasta ${CATALOG_LIMITS.cityMaxLength} caracteres.`;
  if (!form.region.trim()) e['location.region'] = 'La región o estado es obligatorio.';
  else if (tooLong(form.region, CATALOG_LIMITS.regionMaxLength)) e['location.region'] = `Usa hasta ${CATALOG_LIMITS.regionMaxLength} caracteres.`;
  if (!COUNTRY_PATTERN.test(form.country.trim())) e['location.country'] = 'Usa el código de país de 2 letras (p. ej. CO, MX, ES).';
  if (tooLong(form.postalCode, CATALOG_LIMITS.postalCodeMaxLength)) e['location.postalCode'] = `Usa hasta ${CATALOG_LIMITS.postalCodeMaxLength} caracteres.`;

  const lat = form.latitude.trim(); const lon = form.longitude.trim();
  if (lat || lon) {
    const latN = Number(lat); const lonN = Number(lon);
    if (!lat || Number.isNaN(latN) || latN < -90 || latN > 90) e['location.latitude'] = 'Latitud entre -90 y 90.';
    if (!lon || Number.isNaN(lonN) || lonN < -180 || lonN > 180) e['location.longitude'] = 'Longitud entre -180 y 180.';
  }

  if (form.featureCodes.length > CATALOG_LIMITS.featureCodesMax) e.featureCodes = 'Demasiadas características.';

  if (form.rooms.length === 0) e.rooms = 'Agrega al menos una habitación.';
  form.rooms.forEach((room, i) => {
    if (!room.name.trim()) e[`rooms.${i}.name`] = 'El nombre de la habitación es obligatorio.';
    else if (tooLong(room.name, CATALOG_LIMITS.roomNameMaxLength)) e[`rooms.${i}.name`] = `Usa hasta ${CATALOG_LIMITS.roomNameMaxLength} caracteres.`;
    if (!/^\d+$/.test(room.capacity) || Number(room.capacity) < 1) e[`rooms.${i}.capacity`] = 'Capacidad mínima de 1 huésped.';
    const amount = room.amount.trim();
    if (!amount) e[`rooms.${i}.amount`] = 'Indica el precio por noche.';
    else if (!AMOUNT_PATTERN.test(amount) || ZERO_AMOUNT_PATTERN.test(amount)) e[`rooms.${i}.amount`] = 'Precio mayor que 0, con hasta 2 decimales.';
    if (!CURRENCY_PATTERN.test(room.currency)) e[`rooms.${i}.currency`] = 'Moneda inválida.';
  });

  if (photos.length > CATALOG_LIMITS.photosPerProperty) e.photos = `Puedes subir hasta ${CATALOG_LIMITS.photosPerProperty} fotos.`;
  else if (publish && photos.length === 0) e.photos = 'Agrega al menos una foto para publicar.';
  photos.forEach((p) => { const problem = validatePhotoFile(p.file); if (problem) e[`photos.${p.key}`] = problem; });
  return e;
}

/** Maps contract field names (`location.city`, `rooms[0]`) returned by the API to form keys. */
export function formKeyFromApiField(field: string): string {
  return field.replace(/\[(\d+)\]/g, '.$1').replace(/\.basePrice$/, '.amount');
}

export function toPropertyCreate(form: PropertyFormState): PropertyCreate {
  const lat = form.latitude.trim(); const lon = form.longitude.trim();
  const description = form.description.trim();
  const postalCode = form.postalCode.trim();
  return {
    type: form.type as PropertyType,
    name: form.name.trim(),
    ...(description ? { description } : {}),
    location: {
      addressLine: form.addressLine.trim(), city: form.city.trim(), region: form.region.trim(), country: form.country.trim(),
      ...(postalCode ? { postalCode } : {}),
      ...(lat && lon ? { latitude: Number(lat), longitude: Number(lon) } : {}),
    },
    featureCodes: [...form.featureCodes],
    rooms: form.rooms.map((r) => ({
      name: r.name.trim(), capacity: Number(r.capacity), basePrice: { amount: r.amount.trim(), currency: r.currency },
    })),
  };
}
