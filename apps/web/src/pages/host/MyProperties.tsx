import { Link } from 'react-router-dom';
import { formatLocation, formatMoney, lowestNightlyPrice, myPropertiesErrorMessage, useMyProperties } from '../../api/properties';
import { paths } from '../../app/navigation';
import { Header } from '../../components/Header';
import type { PropertyStatus } from '../../types/catalog';

/**
 * RQ-03 (FE-023): the owner's "my properties" list with a link to edit each one.
 *
 * Data comes from `useMyProperties` — a PROVISIONAL owner-scoped listing (`GET /properties?mine=true`)
 * mocked by MSW, since the accommodations contract exposes no owner listing yet (External dependency:
 * G1). Access is restricted to OWNER via `RequireRole` at the route level (see `routes.tsx`).
 */

const STATUS_LABELS: Record<PropertyStatus, string> = {
  DRAFT: 'Borrador', PUBLISHED: 'Publicada', UNPUBLISHED: 'Despublicada',
};
const STATUS_STYLES: Record<PropertyStatus, string> = {
  DRAFT: 'bg-amber-50 text-amber-700 border-amber-200',
  PUBLISHED: 'bg-green-50 text-green-700 border-green-200',
  UNPUBLISHED: 'bg-gray-100 text-gray-600 border-gray-200',
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />
      <main className="flex-1 max-w-screen-lg mx-auto px-6 py-10 w-full">
        <p className="text-sm text-primary font-semibold mb-1">Panel de anfitrión</p>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Mis propiedades</h1>
          <Link to={paths.hostNew} className="h-11 inline-flex items-center px-5 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90">
            Publicar propiedad
          </Link>
        </div>
        {children}
      </main>
    </div>
  );
}

export function MyProperties() {
  const { data, isLoading, isError, error, refetch } = useMyProperties();

  if (isError && !data) {
    return (
      <Shell>
        <div role="alert" className="flex flex-col items-start gap-3 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
          <p>{myPropertiesErrorMessage(error)}</p>
          <button type="button" onClick={() => { void refetch(); }} className="font-semibold underline">Reintentar</button>
        </div>
      </Shell>
    );
  }

  if (isLoading || !data) {
    return (
      <Shell>
        <p role="status" className="text-sm text-gray-500 py-12 text-center">Cargando tus propiedades…</p>
      </Shell>
    );
  }

  if (data.length === 0) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Todavía no publicaste ninguna propiedad</h2>
          <p className="text-gray-500 text-sm mb-6">Crea tu primer alojamiento para que los huéspedes puedan encontrarlo y reservarlo.</p>
          <Link to={paths.hostNew} className="h-11 inline-flex items-center px-5 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90">
            Publicar mi primera propiedad
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <ul aria-label="Mis propiedades" className="flex flex-col gap-4">
        {data.map((property) => {
          const price = lowestNightlyPrice(property);
          return (
            <li key={property.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-200 p-5">
              <div className="min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-lg font-bold text-gray-900 truncate">{property.name}</h2>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[property.status]}`}>
                    {STATUS_LABELS[property.status]}
                  </span>
                </div>
                <p className="text-sm text-gray-500">{formatLocation(property.location)}</p>
                <p className="text-sm text-gray-700 mt-1">
                  {price ? `${formatMoney(price.amount, price.currency)} / noche` : 'Sin precio aún'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link to={paths.property(property.id)} className="text-sm font-medium text-gray-600 hover:underline">Ver</Link>
                <Link
                  to={paths.hostPropertyEdit(property.id)}
                  aria-label={`Editar ${property.name}`}
                  className="h-10 inline-flex items-center px-4 rounded-xl border border-gray-300 text-sm font-semibold hover:border-gray-400"
                >
                  Editar
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}
