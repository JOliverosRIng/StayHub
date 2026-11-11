import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  fieldErrors, propertyErrorMessage, propertyWriteErrorMessage, useProperty, useUpdateProperty,
} from '../../api/properties';
import { paths } from '../../app/navigation';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { FormField, fieldClass } from '../../components/host/FormField';
import { RoomsEditor } from '../../components/host/RoomsEditor';
import {
  emptyRoom, formKeyFromApiField, nextKey, validatePropertyForm,
  type FormErrors, type PropertyFormState, type RoomDraft,
} from '../../components/host/propertyForm';
import {
  CATALOG_LIMITS, FEATURE_CATALOG, PROPERTY_TYPE_LABELS, PROPERTY_TYPES,
  type Property, type PropertyReplace, type PropertyType, type RoomReplaceInput,
} from '../../types/catalog';

/**
 * RQ-03 (FE-022): an owner edits one of their properties. The form is the publish form reused in edit
 * mode — the same field components and validation — preloaded with the current values. Saving sends
 * only the editable representation through `PUT /properties/:id` (via `useUpdateProperty`), carrying
 * the loaded version for optimistic concurrency, and maps 400/401/403/404/409 to the same copy as the
 * rest of the write client. Photos keep their own upload/delete flow and are not managed here.
 */

/** Rebuilds the form state (and a draft-key → room-id map) from the loaded property. */
function toFormState(property: Property): { form: PropertyFormState; roomIds: Record<string, string> } {
  const roomIds: Record<string, string> = {};
  const rooms: RoomDraft[] = property.rooms.map((room) => {
    const key = nextKey('room');
    roomIds[key] = room.id;
    return { key, name: room.name, capacity: String(room.capacity), amount: room.basePrice?.amount ?? '', currency: room.basePrice?.currency ?? 'USD' };
  });
  return {
    form: {
      type: property.type,
      name: property.name,
      description: property.description ?? '',
      addressLine: property.location.addressLine,
      city: property.location.city,
      region: property.location.region,
      country: property.location.country,
      postalCode: property.location.postalCode ?? '',
      latitude: property.location.latitude != null ? String(property.location.latitude) : '',
      longitude: property.location.longitude != null ? String(property.location.longitude) : '',
      featureCodes: property.features.map((f) => f.code),
      rooms: rooms.length ? rooms : [emptyRoom()],
    },
    roomIds,
  };
}

/** Editable fields only; `status` and `version` are supplied by `saveProperty` from the loaded property. */
function toChanges(form: PropertyFormState, roomIds: Record<string, string>): Partial<PropertyReplace> {
  const lat = form.latitude.trim(); const lon = form.longitude.trim();
  const description = form.description.trim();
  const postalCode = form.postalCode.trim();
  const rooms: RoomReplaceInput[] = form.rooms.map((r) => ({
    ...(roomIds[r.key] ? { id: roomIds[r.key] } : {}),
    name: r.name.trim(),
    capacity: Number(r.capacity),
    basePrice: { amount: r.amount.trim(), currency: r.currency },
  }));
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
    rooms,
  };
}

export function EditProperty() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: property, isLoading, isError, error } = useProperty(id);
  const updateMutation = useUpdateProperty();

  const [form, setForm] = useState<PropertyFormState>();
  const [roomIds, setRoomIds] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<FormErrors>({});
  const [general, setGeneral] = useState<string>();
  const seededId = useRef<string>();
  const summaryRef = useRef<HTMLDivElement>(null);

  // Preload once per property; a background refetch never discards the owner's in-progress edits.
  useEffect(() => {
    if (property && seededId.current !== property.id) {
      const seeded = toFormState(property);
      setForm(seeded.form);
      setRoomIds(seeded.roomIds);
      seededId.current = property.id;
    }
  }, [property]);

  const set = (key: keyof PropertyFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = key === 'country' ? e.target.value.toUpperCase() : e.target.value;
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setErrors((p) => { const next = { ...p }; delete next[key]; delete next[`location.${key}`]; return next; });
  };
  const toggleFeature = (code: string) => setForm((f) => (f ? {
    ...f, featureCodes: f.featureCodes.includes(code) ? f.featureCodes.filter((c) => c !== code) : [...f.featureCodes, code],
  } : f));

  const fail = (message: string, found: FormErrors = {}) => {
    setGeneral(message);
    setErrors((p) => ({ ...p, ...found }));
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  const submit = () => {
    if (!property || !form) return;
    // Photos already live on the server, so the publish-time photo requirement does not apply here.
    const found = validatePropertyForm(form, [], { publish: false });
    setErrors(found);
    if (Object.keys(found).length) { fail('Revisa los campos marcados antes de continuar.'); return; }
    setGeneral(undefined);
    updateMutation.mutate({ property, changes: toChanges(form, roomIds) }, {
      onSuccess: (updated) => navigate(paths.property(updated.id), { replace: true }),
      onError: (saveError) => {
        const mapped = Object.fromEntries(fieldErrors(saveError).map((f) => [formKeyFromApiField(f), 'Valor no válido.']));
        fail(propertyWriteErrorMessage(saveError), mapped);
      },
    });
  };

  if (!id || isError) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <Header />
        <main className="flex-1 max-w-3xl mx-auto px-6 py-10 w-full">
          <p role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
            {id ? propertyErrorMessage(error) : 'No encontramos la propiedad solicitada.'}
          </p>
        </main>
      </div>
    );
  }

  if (isLoading || !form || !property) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <Header />
        <main className="flex-1 max-w-3xl mx-auto px-6 py-10 w-full">
          <p role="status" className="text-sm text-gray-500">Cargando la propiedad…</p>
        </main>
      </div>
    );
  }

  const busy = updateMutation.isPending;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-10 w-full">
        <p className="text-sm text-primary font-semibold mb-1">Panel de anfitrión</p>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Editar propiedad</h1>
        <p className="text-sm text-gray-500 mb-8">Actualiza los datos, las características y las habitaciones con su precio. Los cambios se guardan sobre la versión actual.</p>

        <form
          noValidate
          aria-busy={busy}
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="flex flex-col gap-10"
        >
          {general && (
            <div ref={summaryRef} tabIndex={-1} role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl focus:outline-none">
              {general}
            </div>
          )}

          <fieldset disabled={busy} className="flex flex-col gap-4">
            <legend className="text-lg font-bold text-gray-900 mb-2">Datos generales</legend>
            <FormField id="property-type" label="Tipo de alojamiento" error={errors.type}>
              <select value={form.type} onChange={set('type')} className={fieldClass(!!errors.type)}>
                <option value="">Selecciona una opción</option>
                {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{PROPERTY_TYPE_LABELS[t]}</option>)}
              </select>
            </FormField>
            <FormField id="property-name" label="Nombre" error={errors.name}>
              <input value={form.name} maxLength={CATALOG_LIMITS.nameMaxLength} onChange={set('name')} placeholder="Casa frente al mar" className={fieldClass(!!errors.name)} />
            </FormField>
            <FormField id="property-description" label="Descripción" error={errors.description} hint={`${form.description.length}/${CATALOG_LIMITS.descriptionMaxLength} caracteres`}>
              <textarea rows={5} value={form.description} maxLength={CATALOG_LIMITS.descriptionMaxLength} onChange={set('description')} className={fieldClass(!!errors.description)} />
            </FormField>
          </fieldset>

          <fieldset disabled={busy} className="flex flex-col gap-4">
            <legend className="text-lg font-bold text-gray-900 mb-2">Ubicación</legend>
            <FormField id="property-address" label="Dirección" error={errors['location.addressLine']}>
              <input value={form.addressLine} maxLength={CATALOG_LIMITS.addressLineMaxLength} onChange={set('addressLine')} className={fieldClass(!!errors['location.addressLine'])} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="property-city" label="Ciudad" error={errors['location.city']}>
                <input value={form.city} maxLength={CATALOG_LIMITS.cityMaxLength} onChange={set('city')} className={fieldClass(!!errors['location.city'])} />
              </FormField>
              <FormField id="property-region" label="Región o estado" error={errors['location.region']}>
                <input value={form.region} maxLength={CATALOG_LIMITS.regionMaxLength} onChange={set('region')} className={fieldClass(!!errors['location.region'])} />
              </FormField>
              <FormField id="property-country" label="País (código ISO de 2 letras)" error={errors['location.country']}>
                <input value={form.country} maxLength={2} onChange={set('country')} placeholder="CO" autoComplete="country" className={fieldClass(!!errors['location.country'])} />
              </FormField>
              <FormField id="property-postal" label="Código postal (opcional)" error={errors['location.postalCode']}>
                <input value={form.postalCode} maxLength={CATALOG_LIMITS.postalCodeMaxLength} onChange={set('postalCode')} className={fieldClass(!!errors['location.postalCode'])} />
              </FormField>
              <FormField id="property-latitude" label="Latitud (opcional)" error={errors['location.latitude']}>
                <input inputMode="decimal" value={form.latitude} onChange={set('latitude')} placeholder="4.7110" className={fieldClass(!!errors['location.latitude'])} />
              </FormField>
              <FormField id="property-longitude" label="Longitud (opcional)" error={errors['location.longitude']}>
                <input inputMode="decimal" value={form.longitude} onChange={set('longitude')} placeholder="-74.0721" className={fieldClass(!!errors['location.longitude'])} />
              </FormField>
            </div>
          </fieldset>

          <fieldset disabled={busy} className="flex flex-col gap-3">
            <legend className="text-lg font-bold text-gray-900 mb-2">Características</legend>
            <div className="grid grid-cols-2 gap-3">
              {FEATURE_CATALOG.map((f) => (
                <label key={f.code} className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.featureCodes.includes(f.code)} onChange={() => toggleFeature(f.code)} className="accent-primary" />
                  {f.name}
                </label>
              ))}
            </div>
            {errors.featureCodes && <p role="alert" className="text-xs text-red-600">{errors.featureCodes}</p>}
          </fieldset>

          <RoomsEditor
            rooms={form.rooms}
            errors={errors}
            disabled={busy}
            onChange={(rooms) => { setForm((f) => (f ? { ...f, rooms } : f)); setErrors((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith('rooms')))); }}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" size="lg" loading={busy}>Guardar cambios</Button>
            <Button type="button" variant="outline" size="lg" disabled={busy} onClick={() => navigate(paths.property(property.id))}>
              Cancelar
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
