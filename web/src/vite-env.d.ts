/// <reference types="vite/client" />

// Variables de entorno que usa la aplicación (se definen al compilar)
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}
