/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UMAMI_SRC?: string;
  readonly VITE_UMAMI_WEBSITE_ID?: string;
  readonly VITE_UMAMI_DOMAINS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
