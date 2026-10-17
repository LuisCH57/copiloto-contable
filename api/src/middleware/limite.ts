// ==========================================================
// Límite de peticiones por IP para las rutas PÚBLICAS (sin sesión).
// Evita que alguien pruebe miles de enlaces o llene la base de datos.
//
// Se guarda en memoria: suficiente para un solo servidor. Con varios
// servidores habría que usar un almacén compartido (por ejemplo, Redis).
// ==========================================================
import type { NextFunction, Request, Response } from "express";

export function limitarPeticiones({ maximo, ventanaMs }: { maximo: number; ventanaMs: number }) {
  const contadores = new Map<string, { cantidad: number; reinicio: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const ahora = Date.now();
    const ip = req.ip ?? "desconocida";
    let registro = contadores.get(ip);
    if (!registro || registro.reinicio <= ahora) {
      registro = { cantidad: 0, reinicio: ahora + ventanaMs };
      contadores.set(ip, registro);
    }
    registro.cantidad++;

    // Limpieza ocasional para que el mapa no crezca sin fin
    if (contadores.size > 10_000) {
      for (const [clave, valor] of contadores) if (valor.reinicio <= ahora) contadores.delete(clave);
    }

    if (registro.cantidad > maximo) {
      res.setHeader("Retry-After", String(Math.ceil((registro.reinicio - ahora) / 1000)));
      return res.status(429).json({ error: "Demasiados intentos. Espera unos minutos y vuelve a intentar." });
    }
    next();
  };
}
