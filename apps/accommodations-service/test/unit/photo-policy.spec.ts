import { assertPhotoCapacity, detectMediaType, inspectPhoto, MAX_PHOTO_BYTES, MAX_PHOTOS_PER_PROPERTY, nextPhotoPosition } from '../../src/domain/photos/photo.policy';
import { DomainError } from '../../src/domain/shared/domain-error';
import { jpeg, png, webp } from '../fixtures/accommodations.fixture';

function codeOf(action: () => unknown): string | undefined {
  try { action(); } catch (error) { if (error instanceof DomainError) return error.code; throw error; }
  return undefined;
}
function fieldOf(action: () => unknown): string | undefined {
  try { action(); } catch (error) { if (error instanceof DomainError) return error.errors[0]?.field; throw error; }
  return undefined;
}

describe('ACC-030 photo magic bytes and limits', () => {
  it.each([
    ['jpeg', jpeg, 'image/jpeg'],
    ['png', png, 'image/png'],
    ['webp', webp, 'image/webp'],
  ] as const)('detects %s from magic bytes', (_name, content, mediaType) => {
    expect(detectMediaType(content)).toBe(mediaType);
    expect(inspectPhoto(content)).toEqual({ mediaType, byteSize: content.length });
  });

  it('rejects an empty buffer as VALIDATION_ERROR on file', () => {
    expect(fieldOf(() => inspectPhoto(Buffer.alloc(0)))).toBe('file');
  });

  it('accepts a file of exactly 5_000_000 bytes and rejects one more', () => {
    const exact = Buffer.concat([jpeg, Buffer.alloc(MAX_PHOTO_BYTES - jpeg.length)]);
    expect(inspectPhoto(exact).byteSize).toBe(MAX_PHOTO_BYTES);
    expect(codeOf(() => inspectPhoto(Buffer.concat([exact, Buffer.from([0])])))).toBe('PHOTO_TOO_LARGE');
  });

  it.each([
    ['gif', Buffer.from('GIF89a')],
    ['pdf', Buffer.from('%PDF-1.4')],
    ['png declared by name but truncated', Buffer.from([0x89, 0x50])],
    ['riff without WEBP', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('AVI ')])],
  ])('rejects %s as PHOTO_MEDIA_TYPE', (_name, content) => {
    expect(codeOf(() => inspectPhoto(content))).toBe('PHOTO_MEDIA_TYPE');
    expect(detectMediaType(content)).toBeNull();
  });

  it('allows ten photos and rejects the eleventh', () => {
    expect(() => assertPhotoCapacity(MAX_PHOTOS_PER_PROPERTY - 1)).not.toThrow();
    expect(codeOf(() => assertPhotoCapacity(MAX_PHOTOS_PER_PROPERTY))).toBe('PHOTO_LIMIT_REACHED');
  });

  it('assigns the next position as max(position)+1', () => {
    expect(nextPhotoPosition([])).toBe(0);
    expect(nextPhotoPosition([{ position: 0 }, { position: 2 }])).toBe(3);
  });
});
