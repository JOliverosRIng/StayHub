import { formatLocation } from '../../api/properties';
import type { Location } from '../../types/catalog';

interface LocationMapProps { name: string; location: Location }

const DELTA = 0.01;

/** OpenStreetMap embed (no API key, no tracking cookies). Without coordinates only the address is shown. */
export function LocationMap({ name, location }: LocationMapProps) {
  const { latitude: lat, longitude: lon } = location;
  const address = [location.addressLine, location.postalCode, formatLocation(location)].filter(Boolean).join(', ');
  const hasCoordinates = typeof lat === 'number' && typeof lon === 'number';
  const bbox = hasCoordinates ? [lon - DELTA, lat - DELTA, lon + DELTA, lat + DELTA].join(',') : '';

  return (
    <section aria-labelledby="location-heading" className="pb-6 border-b border-gray-200 mb-6">
      <h2 id="location-heading" className="text-lg font-bold text-gray-900 mb-3">Ubicación</h2>
      <p className="text-sm text-gray-700 mb-4">{address}</p>
      {hasCoordinates ? (
        <>
          <iframe
            title={`Mapa de ubicación de ${name}`}
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lon}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-72 w-full rounded-2xl border border-gray-200"
          />
          <a
            href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
          >
            Ver mapa más grande
          </a>
        </>
      ) : (
        <p className="text-sm text-gray-500">El anfitrión aún no indicó la ubicación exacta en el mapa.</p>
      )}
    </section>
  );
}
