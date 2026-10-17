// ==========================================================
// La aplicación Express (separada de server.ts para usarla en las pruebas)
// ==========================================================
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { config } from "./config.ts";
import { conEstudio, pool } from "./db.ts";
import { requireAuth, requireRol } from "./middleware/auth.ts";
import authRouter from "./routes/auth.ts";
import usuariosRouter from "./routes/usuarios.ts";
import empresasRouter from "./routes/empresas.ts";
import conciliacionesRouter, { LIMITES } from "./routes/conciliaciones.ts";
import solicitudesRouter from "./routes/solicitudes.ts";
import publicoRouter, { LIMITES_CLIENTE } from "./routes/publico.ts";
import { limitarPeticiones } from "./middleware/limite.ts";

export const app = express();

app.disable("x-powered-by"); // no anunciar que usamos Express
// En Render la API está detrás de un proxy: así req.ip es la IP real del visitante
app.set("trust proxy", 1);
app.use(express.json({ limit: "100kb" }));

// Cabeceras de seguridad (lo esencial de la librería helmet, sin dependencia extra)
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff"); // el navegador no "adivina" tipos de archivo
  res.setHeader("X-Frame-Options", "DENY"); // nadie puede incrustar la API en otra página
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store"); // datos privados: que no queden en cachés
  if (config.produccion) res.setHeader("Strict-Transport-Security", "max-age=31536000"); // solo HTTPS
  next();
});

// CORS: solo los sitios de CORS_ORIGIN pueden usar la API desde el navegador
app.use((req, res, next) => {
  const origen = req.headers.origin;
  if (origen && config.corsOrigins.includes(origen)) {
    res.setHeader("Access-Control-Allow-Origin", origen);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== "test") console.log(`${req.method} ${req.url}`);
  next();
});

app.get("/api/health", async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok" });
});

// Primero lo PÚBLICO (sin sesión): los otros routers montados en /api exigen sesión
app.use("/api/publico", publicoRouter);
// Frena a quien intente adivinar contraseñas o crear cuentas en masa
app.use("/api/auth/login", limitarPeticiones({ maximo: 20, ventanaMs: 15 * 60 * 1000 }));
app.use("/api/auth/registro", limitarPeticiones({ maximo: 20, ventanaMs: 60 * 60 * 1000 }));
app.use("/api/auth", authRouter);
app.use("/api/usuarios", usuariosRouter);
app.use("/api/empresas", empresasRouter);
app.use("/api", conciliacionesRouter);
app.use("/api", solicitudesRouter);

// GET /api/auditoria: últimas acciones del estudio (solo el titular)
app.get("/api/auditoria", requireAuth, requireRol("titular"), async (req, res) => {
  const filas = await conEstudio(req.sesion!.estudioId, async (cliente) => {
    const { rows } = await cliente.query(
      `SELECT a.id, a.accion, a.detalle, a.creado_en AS "creadoEn", u.nombre AS usuario
       FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id
       ORDER BY a.creado_en DESC, a.id DESC LIMIT 100`
    );
    return rows;
  });
  res.json(filas);
});

app.use((req, res) => {
  res.status(404).json({ error: `No existe la ruta ${req.method} ${req.url}` });
});

app.use((error: Error & { type?: string }, req: Request, res: Response, _next: NextFunction) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "El cuerpo de la petición no es un JSON válido." });
  }
  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "La petición es demasiado grande." });
  }
  if (error instanceof multer.MulterError && req.path.startsWith("/api/publico")) {
    const mensajes: Record<string, string> = {
      LIMIT_FILE_SIZE: `Cada archivo puede pesar como máximo ${LIMITES_CLIENTE.tamanoArchivo / 1024 / 1024} MB.`,
      LIMIT_FILE_COUNT: `Envía como máximo ${LIMITES_CLIENTE.archivosPorEnvio} archivos a la vez.`,
      LIMIT_UNEXPECTED_FILE: "Usa el campo 'xml' para los archivos.",
    };
    return res.status(400).json({ error: mensajes[error.code] ?? "No se pudieron recibir los archivos." });
  }
  if (error instanceof multer.MulterError) {
    const mensajes: Record<string, string> = {
      LIMIT_FILE_SIZE: `Cada archivo puede pesar como máximo ${LIMITES.tamanoArchivo / 1024 / 1024} MB.`,
      LIMIT_FILE_COUNT: `Puedes subir como máximo ${LIMITES.archivosXml} XML por conciliación.`,
      LIMIT_UNEXPECTED_FILE: "Usa los campos 'propuesta' (1 archivo) y 'xml' (varios).",
    };
    return res.status(400).json({ error: mensajes[error.code] ?? "No se pudieron recibir los archivos." });
  }
  console.error(error);
  res.status(500).json({ error: "Error interno del servidor." });
});
