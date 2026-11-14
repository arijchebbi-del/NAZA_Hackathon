/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_USE_STREAM?: string;
  readonly VITE_DATE_MIN?: string;
  readonly VITE_DATE_MAX?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
