import { SEARCH_CURRENCIES } from '../search/FiltersPanel';
import { FormField, fieldClass } from './FormField';
import { emptyRoom, type FormErrors, type RoomDraft } from './propertyForm';

interface RoomsEditorProps {
  rooms: RoomDraft[];
  errors: FormErrors;
  disabled?: boolean;
  onChange: (rooms: RoomDraft[]) => void;
}

/** Dynamic list of rooms with capacity and nightly price. At least one room is always kept. */
export function RoomsEditor({ rooms, errors, disabled, onChange }: RoomsEditorProps) {
  const update = (index: number, patch: Partial<RoomDraft>) => onChange(rooms.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const remove = (index: number) => onChange(rooms.filter((_, i) => i !== index));
  const add = () => onChange([...rooms, emptyRoom(rooms[rooms.length - 1]?.currency)]);

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-4">
      <legend className="text-lg font-bold text-gray-900 mb-2">Habitaciones y precios</legend>
      {errors.rooms && <p role="alert" className="text-xs text-red-600">{errors.rooms}</p>}
      {rooms.map((room, i) => (
        <fieldset key={room.key} className="rounded-2xl border border-gray-200 p-4 flex flex-col gap-3">
          <legend className="px-1 text-sm font-semibold text-gray-800">Habitación {i + 1}</legend>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
            <FormField id={`room-${room.key}-name`} label="Nombre de la habitación" error={errors[`rooms.${i}.name`]}>
              <input value={room.name} maxLength={120} onChange={(e) => update(i, { name: e.target.value })} placeholder="Suite doble" className={fieldClass(!!errors[`rooms.${i}.name`])} />
            </FormField>
            <FormField id={`room-${room.key}-capacity`} label="Capacidad" error={errors[`rooms.${i}.capacity`]}>
              <input type="number" min={1} step={1} inputMode="numeric" value={room.capacity} onChange={(e) => update(i, { capacity: e.target.value })} className={fieldClass(!!errors[`rooms.${i}.capacity`])} />
            </FormField>
            <FormField id={`room-${room.key}-amount`} label="Precio por noche" error={errors[`rooms.${i}.amount`]}>
              <input inputMode="decimal" value={room.amount} onChange={(e) => update(i, { amount: e.target.value })} placeholder="120.00" className={fieldClass(!!errors[`rooms.${i}.amount`])} />
            </FormField>
            <FormField id={`room-${room.key}-currency`} label="Moneda" error={errors[`rooms.${i}.currency`]}>
              <select value={room.currency} onChange={(e) => update(i, { currency: e.target.value })} className={fieldClass(!!errors[`rooms.${i}.currency`])}>
                {SEARCH_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </FormField>
          </div>
          {rooms.length > 1 && (
            <button type="button" onClick={() => remove(i)} className="self-start text-sm font-medium text-red-600 hover:underline">
              Eliminar habitación {i + 1}
            </button>
          )}
        </fieldset>
      ))}
      <button type="button" onClick={add} className="self-start h-10 px-4 rounded-xl border border-gray-300 text-sm font-medium hover:border-gray-400">
        + Agregar habitación
      </button>
    </fieldset>
  );
}
