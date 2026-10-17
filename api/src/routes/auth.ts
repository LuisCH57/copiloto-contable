// ==========================================================
// /api/auth: registro de un estudio, inicio de sesión y "¿quién soy?"
// Registro y login usan pool.query (sin estudio todavía): son las ÚNICAS
// consultas fuera del aislamiento por estudio.
// ==========================================================
import { Router } from "express";
import { auditar, conEstudio, pool } from "../db.ts";
import { hashPassword, verifyPassword } from "../auth/password.ts";
import { crearToken } from "../auth/token.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { Rol } from "../types/auth.ts";
import { contrasena, esViolacionUnica, MIN_CONTRASENA, PATRON_EMAIL, texto } from "../validacion.ts";

const router = Router();

interface FilaUsuario {
  id: number;
  estudio_id: number;
  nombre: string;
  email: string;
  password_hash: string;
  rol: Rol;
  activo: boolean;
}

function respuestaSesion(u: FilaUsuario, nombreEstudio: string) {
  const sesion = { usuarioId: u.id, estudioId: u.estudio_id, nombre: u.nombre, rol: u.rol };
  return {
    token: crearToken(sesion),
    usuario: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol },
    estudio: { id: u.estudio_id, nombre: nombreEstudio },
  };
}

// POST /api/auth/registro: crea un estudio contable y su usuario titular
router.post("/registro", async (req, res) => {
  const nombreEstudio = texto(req.body, "nombreEstudio");
  const nombre = texto(req.body, "nombre");
  const email = texto(req.body, "email").toLowerCase();
  const password = contrasena(req.body);

  const errores: string[] = [];
  if (nombreEstudio.length < 2 || nombreEstudio.length > 120) errores.push("El nombre del estudio debe tener entre 2 y 120 caracteres.");
  if (nombre.length < 2 || nombre.length > 100) errores.push("Tu nombre debe tener entre 2 y 100 caracteres.");
  if (!PATRON_EMAIL.test(email)) errores.push("Ingresa un correo válido.");
  if (password.length < MIN_CONTRASENA || password.length > 200) {
    errores.push(`La contraseña debe tener al menos ${MIN_CONTRASENA} caracteres.`);
  }
  if (errores.length > 0) return res.status(400).json({ error: "Datos no válidos.", detalles: errores });

  const passwordHash = await hashPassword(password);
  const cliente = await pool.connect();
  try {
    // Estudio y titular se crean juntos o no se crea nada
    await cliente.query("BEGIN");
    const estudio = await cliente.query<{ id: number }>("INSERT INTO estudios (nombre) VALUES ($1) RETURNING id", [nombreEstudio]);
    const estudioId = estudio.rows[0]!.id;
    const usuario = await cliente.query<FilaUsuario>(
      `INSERT INTO usuarios (estudio_id, nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, 'titular') RETURNING *`,
      [estudioId, nombre, email, passwordHash]
    );
    await auditar(cliente, estudioId, usuario.rows[0]!.id, "estudio_registrado", { nombreEstudio });
    await cliente.query("COMMIT");
    res.status(201).json(respuestaSesion(usuario.rows[0]!, nombreEstudio));
  } catch (error) {
    await cliente.query("ROLLBACK");
    if (esViolacionUnica(error)) return res.status(409).json({ error: "Ya existe una cuenta con ese correo." });
    throw error;
  } finally {
    cliente.release();
  }
});

// Hash de relleno: el login tarda lo mismo exista o no el correo
const HASH_FALSO = await hashPassword("contraseña-que-nadie-usa-nunca");

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const email = texto(req.body, "email").toLowerCase();
  const password = contrasena(req.body);

  const { rows } = await pool.query<FilaUsuario & { nombre_estudio: string }>(
    `SELECT u.*, e.nombre AS nombre_estudio
     FROM usuarios u JOIN estudios e ON e.id = u.estudio_id
     WHERE u.email = $1`,
    [email]
  );
  const usuario = rows[0];
  const valida = await verifyPassword(password, usuario?.password_hash ?? HASH_FALSO);

  if (!usuario || !valida || !usuario.activo) {
    return res.status(401).json({ error: "Correo o contraseña incorrectos." });
  }

  await conEstudio(usuario.estudio_id, (cliente) => auditar(cliente, usuario.estudio_id, usuario.id, "inicio_sesion"));
  res.json(respuestaSesion(usuario, usuario.nombre_estudio));
});

// GET /api/auth/yo
router.get("/yo", requireAuth, async (req, res) => {
  const { usuarioId, estudioId } = req.sesion!;
  const datos = await conEstudio(estudioId, async (cliente) => {
    const { rows } = await cliente.query(
      `SELECT u.id, u.nombre, u.email, u.rol, e.id AS "estudioId", e.nombre AS "nombreEstudio"
       FROM usuarios u JOIN estudios e ON e.id = u.estudio_id
       WHERE u.id = $1`,
      [usuarioId]
    );
    return rows[0];
  });
  res.json(datos);
});

export default router;
