// ==========================================================
// /api/empresas: la cartera de empresas cliente del estudio
// ==========================================================
import { Router } from "express";
import { esRucValido } from "motor-conciliacion";
import { auditar, conEstudio } from "../db.ts";
import { requireAuth } from "../middleware/auth.ts";
import { esViolacionUnica, idDeRuta, texto } from "../validacion.ts";

const router = Router();
router.use(requireAuth);

const COLUMNAS = `
  e.id, e.ruc, e.razon_social AS "razonSocial", e.activa, e.creado_en AS "creadoEn",
  (SELECT max(c.periodo) FROM conciliaciones c WHERE c.empresa_id = e.id) AS "ultimoPeriodo"`;

function validar(cuerpo: unknown) {
  const ruc = texto(cuerpo, "ruc");
  const razonSocial = texto(cuerpo, "razonSocial");
  const errores: string[] = [];
  if (!esRucValido(ruc)) errores.push("El RUC no es válido (11 dígitos con dígito verificador correcto).");
  if (razonSocial.length < 2 || razonSocial.length > 200) errores.push("La razón social debe tener entre 2 y 200 caracteres.");
  return { ruc, razonSocial, errores };
}

// GET /api/empresas
router.get("/", async (req, res) => {
  const filas = await conEstudio(req.sesion!.estudioId, async (cliente) => {
    const { rows } = await cliente.query(`SELECT ${COLUMNAS} FROM empresas e ORDER BY e.razon_social`);
    return rows;
  });
  res.json(filas);
});

// GET /api/empresas/:id
router.get("/:id", async (req, res) => {
  const id = idDeRuta(req.params.id);
  if (!id) return res.status(400).json({ error: "El id no es válido." });
  const empresa = await conEstudio(req.sesion!.estudioId, async (cliente) => {
    const { rows } = await cliente.query(`SELECT ${COLUMNAS} FROM empresas e WHERE e.id = $1`, [id]);
    return rows[0];
  });
  if (!empresa) return res.status(404).json({ error: "Empresa no encontrada." });
  res.json(empresa);
});

// POST /api/empresas
router.post("/", async (req, res) => {
  const { estudioId, usuarioId } = req.sesion!;
  const { ruc, razonSocial, errores } = validar(req.body);
  if (errores.length > 0) return res.status(400).json({ error: "Datos no válidos.", detalles: errores });

  try {
    const empresa = await conEstudio(estudioId, async (cliente) => {
      const { rows } = await cliente.query<{ id: number }>(
        "INSERT INTO empresas (estudio_id, ruc, razon_social) VALUES ($1, $2, $3) RETURNING id",
        [estudioId, ruc, razonSocial]
      );
      await auditar(cliente, estudioId, usuarioId, "empresa_creada", { ruc });
      const creada = await cliente.query(`SELECT ${COLUMNAS} FROM empresas e WHERE e.id = $1`, [rows[0]!.id]);
      return creada.rows[0];
    });
    res.status(201).json(empresa);
  } catch (error) {
    if (esViolacionUnica(error)) return res.status(409).json({ error: "Esa empresa ya está en tu cartera." });
    throw error;
  }
});

// PUT /api/empresas/:id: cambiar razón social o activarla/desactivarla (el RUC no cambia)
router.put("/:id", async (req, res) => {
  const { estudioId, usuarioId } = req.sesion!;
  const id = idDeRuta(req.params.id);
  if (!id) return res.status(400).json({ error: "El id no es válido." });

  const razonSocial = texto(req.body, "razonSocial");
  const activa = (req.body as { activa?: unknown })?.activa;
  if (razonSocial.length < 2 || razonSocial.length > 200) {
    return res.status(400).json({ error: "La razón social debe tener entre 2 y 200 caracteres." });
  }
  if (typeof activa !== "boolean") return res.status(400).json({ error: "Envía activa: true o false." });

  const empresa = await conEstudio(estudioId, async (cliente) => {
    const { rows } = await cliente.query(
      "UPDATE empresas SET razon_social = $1, activa = $2 WHERE id = $3 RETURNING id",
      [razonSocial, activa, id]
    );
    if (!rows[0]) return undefined;
    await auditar(cliente, estudioId, usuarioId, "empresa_actualizada", { id });
    return (await cliente.query(`SELECT ${COLUMNAS} FROM empresas e WHERE e.id = $1`, [id])).rows[0];
  });
  if (!empresa) return res.status(404).json({ error: "Empresa no encontrada." });
  res.json(empresa);
});

export default router;
