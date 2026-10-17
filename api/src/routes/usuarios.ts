// ==========================================================
// /api/usuarios: el equipo del estudio. Solo el TITULAR agrega
// asistentes o los desactiva. Todo pasa por conEstudio (aislamiento).
// ==========================================================
import { Router } from "express";
import { auditar, conEstudio } from "../db.ts";
import { hashPassword } from "../auth/password.ts";
import { requireAuth, requireRol } from "../middleware/auth.ts";
import { contrasena, esViolacionUnica, idDeRuta, MIN_CONTRASENA, PATRON_EMAIL, texto } from "../validacion.ts";

const router = Router();
router.use(requireAuth);

const COLUMNAS = `id, nombre, email, rol, activo, creado_en AS "creadoEn"`;

// GET /api/usuarios: cualquiera del estudio ve a su equipo
router.get("/", async (req, res) => {
  const filas = await conEstudio(req.sesion!.estudioId, async (cliente) => {
    // Sin "WHERE estudio_id": Row-Level Security ya filtra por el estudio
    const { rows } = await cliente.query(`SELECT ${COLUMNAS} FROM usuarios ORDER BY nombre`);
    return rows;
  });
  res.json(filas);
});

// POST /api/usuarios: el titular agrega un asistente
router.post("/", requireRol("titular"), async (req, res) => {
  const { estudioId, usuarioId } = req.sesion!;
  const nombre = texto(req.body, "nombre");
  const email = texto(req.body, "email").toLowerCase();
  const password = contrasena(req.body);

  const errores: string[] = [];
  if (nombre.length < 2 || nombre.length > 100) errores.push("El nombre debe tener entre 2 y 100 caracteres.");
  if (!PATRON_EMAIL.test(email)) errores.push("Ingresa un correo válido.");
  if (password.length < MIN_CONTRASENA) errores.push(`La contraseña debe tener al menos ${MIN_CONTRASENA} caracteres.`);
  if (errores.length > 0) return res.status(400).json({ error: "Datos no válidos.", detalles: errores });

  const passwordHash = await hashPassword(password);
  try {
    const nuevo = await conEstudio(estudioId, async (cliente) => {
      const { rows } = await cliente.query(
        `INSERT INTO usuarios (estudio_id, nombre, email, password_hash, rol)
         VALUES ($1, $2, $3, $4, 'asistente') RETURNING ${COLUMNAS}`,
        [estudioId, nombre, email, passwordHash]
      );
      await auditar(cliente, estudioId, usuarioId, "usuario_creado", { email });
      return rows[0];
    });
    res.status(201).json(nuevo);
  } catch (error) {
    if (esViolacionUnica(error)) return res.status(409).json({ error: "Ya existe una cuenta con ese correo." });
    throw error;
  }
});

// PATCH /api/usuarios/:id: el titular activa o desactiva a un miembro
router.patch("/:id", requireRol("titular"), async (req, res) => {
  const { estudioId, usuarioId } = req.sesion!;
  const id = idDeRuta(req.params.id);
  const activo = (req.body as { activo?: unknown })?.activo;

  if (!id) return res.status(400).json({ error: "El id no es válido." });
  if (typeof activo !== "boolean") return res.status(400).json({ error: "Envía activo: true o false." });
  if (id === usuarioId) return res.status(400).json({ error: "No puedes desactivarte a ti mismo." });

  const actualizado = await conEstudio(estudioId, async (cliente) => {
    const { rows } = await cliente.query(`UPDATE usuarios SET activo = $1 WHERE id = $2 RETURNING ${COLUMNAS}`, [activo, id]);
    if (rows[0]) await auditar(cliente, estudioId, usuarioId, activo ? "usuario_activado" : "usuario_desactivado", { id });
    return rows[0];
  });
  // Si el usuario es de OTRO estudio, RLS hace que no se encuentre: 404
  if (!actualizado) return res.status(404).json({ error: "Usuario no encontrado." });
  res.json(actualizado);
});

export default router;
