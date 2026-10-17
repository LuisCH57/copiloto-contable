// Le enseña a TypeScript que las peticiones pueden tener "sesion" (la agrega requireAuth)
import type { Sesion } from "./auth.ts";

declare global {
  namespace Express {
    interface Request {
      sesion?: Sesion;
    }
  }
}

export {};
