import { DomainError } from '../shared/domain-error';
export const MAX_PHOTO_BYTES = 5_000_000;
export function inspectPhoto(content: Uint8Array, declaredType: string): 'image/png' | 'image/jpeg' {
  if (content.length > MAX_PHOTO_BYTES) throw new DomainError('PHOTO_TOO_LARGE');
  const starts = (signature: number[]): boolean => signature.every((byte, i) => content[i] === byte);
  const type = starts([137, 80, 78, 71, 13, 10, 26, 10]) ? 'image/png' : starts([255, 216, 255]) ? 'image/jpeg' : null;
  if (!type || type !== declaredType) throw new DomainError('PHOTO_MEDIA_TYPE');
  return type;
}
