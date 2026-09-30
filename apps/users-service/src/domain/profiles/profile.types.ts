export type Preferences = Record<string, string | number | boolean>;
export interface ProfilePatch { expectedVersion: number; name?: string; email?: string; phone?: string | null; preferences?: Preferences | null; photo?: null }
