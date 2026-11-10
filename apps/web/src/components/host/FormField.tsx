import type { ReactElement } from 'react';
import { cloneElement } from 'react';

interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** A single input/select/textarea; id and ARIA attributes are injected. */
  children: ReactElement;
}

export const fieldClass = (invalid: boolean) =>
  `w-full px-3 py-2 rounded-xl border text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100 ${invalid ? 'border-red-400 bg-red-50' : 'border-gray-300'}`;

export function FormField({ id, label, error, hint, children }: FormFieldProps) {
  const describedBy = [error ? `${id}-error` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">{label}</label>
      {cloneElement(children, { id, 'aria-invalid': !!error, 'aria-describedby': describedBy })}
      {hint && <p id={`${id}-hint`} className="text-xs text-gray-500">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
