/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public Gateway base URL (`/api/v1` or `https://…/api/v1`). Never a secret. */
  readonly VITE_API_BASE_URL?: string;
  /** `true` enables MSW contract mocks in `vite dev` only. Ignored in production builds. */
  readonly VITE_API_MOCKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
