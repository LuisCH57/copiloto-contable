// ==========================================================
// Enlaces para que el cliente suba sus comprobantes SIN crear cuenta.
//
// El enlace es "<id>-<firma>", por ejemplo  7-q3J0w1...
//   firma = HMAC-SHA256(clave secreta, "solicitud:<id>:<sello>")
//
// - Solo el servidor conoce la clave secreta: nadie puede inventar un enlace.
// - El enlace no se guarda en la base de datos: si alguien la copiara,
//   igual no podría armar los enlaces (le faltaría la clave).
// - Cambiar el "sello" (texto aleatorio guardado en la solicitud)
//   invalida el enlace anterior.
// ==========================================================
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config.ts";

// Clave propia para los enlaces, derivada de JWT_SECRET (así no hace falta otra variable de entorno)
const CLAVE_ENLACES = createHmac("sha256", config.jwtSecret).update("enlaces-de-cliente").digest();

export const DIAS_DE_VIGENCIA = 45;

export function nuevoSello(): string {
  return randomBytes(16).toString("base64url");
}

function firmar(id: number, sello: string): string {
  return createHmac("sha256", CLAVE_ENLACES).update(`solicitud:${id}:${sello}`).digest("base64url");
}

export function tokenDeSolicitud(id: number, sello: string): string {
  return `${id}-${firmar(id, sello)}`;
}

// Separa el token en id y firma (sin consultar la base de datos)
export function leerToken(token: string): { id: number; firma: string } | null {
  const partes = /^([1-9][0-9]{0,9})-([A-Za-z0-9_-]{43})$/.exec(token);
  if (!partes) return null;
  return { id: Number(partes[1]), firma: partes[2]! };
}

// Compara en "tiempo constante": no da pistas por cuánto tarda en responder
export function firmaCorrecta(id: number, sello: string, firma: string): boolean {
  const esperada = Buffer.from(firmar(id, sello));
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}
