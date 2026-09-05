/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the SDK and preview harness are served from. See `.env.example`. */
  readonly VITE_SDK_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
