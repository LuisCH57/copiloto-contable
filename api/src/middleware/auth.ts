// ==========================================================
// Autenticación (¿quién eres?) y autorización (¿qué puedes hacer?)
// ==========================================================
import type { NextFunction, Request, Response } from "express";
import { verificarToken } from "../auth/token.ts";
import { pool } from "../db.ts";
import type { Rol } from "../types/auth.ts";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const [esquema, token] = (req.headers.authorization ?? "").split(" ");
  const sesion = esquema === "Bearer" && token ? verificarToken(token) : null;

  if (!sesion) {
    const mensaje = req.headers.authorization
      ? "Tu sesión expiró o no es válida. Inicia sesión otra vez."
      : "Debes iniciar sesión.";
    return res.status(401).json({ error: mensaje });
  }

  // Un token sigue siendo válido hasta que vence (8 h). Si el titular desactiva
  // a un usuario, queremos que pierda el acceso YA, no en 8 horas.
  const { rows } = await pool.query<{ activo: boolean }>(
    "SELECT activo FROM usuarios WHERE id = $1 AND estudio_id = $2",
    [sesion.usuarioId, sesion.estudioId]
  );
  if (!rows[0]?.activo) {
    return res.status(401).json({ error: "Tu usuario está desactivado. Habla con el titular del estudio." });
  }

  req.sesion = sesion;
  next();
}

export function requireRol(rol: Rol) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.sesion?.rol !== rol) {
      return res.status(403).json({ error: "No tienes permiso para realizar esta acción." });
    }
    next();
  };
}
