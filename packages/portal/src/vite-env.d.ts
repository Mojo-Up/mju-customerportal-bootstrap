/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_ENTRA_EXTERNAL_ID_TENANT: string;
  readonly VITE_ENTRA_EXTERNAL_ID_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
