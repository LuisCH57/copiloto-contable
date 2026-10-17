// ==========================================================
// Tokens JWT. Además del usuario, llevan su ESTUDIO: así cada
// petición sabe a qué datos tiene derecho sin consultar nada más.
// ==========================================================
import jwt from "jsonwebtoken";
import { config } from "../config.ts";
import type { Rol, Sesion } from "../types/auth.ts";

const DURACION = "8h";

export function crearToken(sesion: Sesion): string {
  return jwt.sign({ est: sesion.estudioId, nombre: sesion.nombre, rol: sesion.rol }, config.jwtSecret, {
    subject: String(sesion.usuarioId),
    expiresIn: DURACION,
  });
}

export function verificarToken(token: string): Sesion | null {
  try {
    const datos = jwt.verify(token, config.jwtSecret);
    if (typeof datos === "string" || !datos.sub || typeof datos.est !== "number") return null;
    return {
      usuarioId: Number(datos.sub),
      estudioId: datos.est,
      nombre: String(datos.nombre),
      rol: datos.rol as Rol,
    };
  } catch {
    return null;
  }
}
