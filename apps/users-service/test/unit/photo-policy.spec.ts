import { preparePhoto } from '../../src/infrastructure/files/profile-photo.service';
import { png, jpeg } from '../fixtures/profile.fixture';
describe('USR-052 photo policy', () => {
  it.each([[png, 'image/png'], [jpeg, 'image/jpeg']] as const)('computes metadata and a stable SHA256', (content, type) => { const photo = preparePhoto(content, type); expect(photo.mediaType).toBe(type); expect(photo.sha256).toHaveLength(64); expect(photo.byteSize).toBe(content.length); });
  it('rejects unsupported, empty and over-limit content', () => { expect(() => preparePhoto(Buffer.alloc(0), 'image/png')).toThrow('PHOTO_MEDIA_TYPE'); expect(() => preparePhoto(png, 'image/jpeg')).toThrow('PHOTO_MEDIA_TYPE'); expect(() => preparePhoto(Buffer.alloc(5_000_001), 'image/png')).toThrow('PHOTO_TOO_LARGE'); });
});
