// ==========================================================
// Conciliaciones: subir los archivos de un mes, conciliar y revisar.
//
// Privacidad: los archivos subidos se procesan EN MEMORIA y no se guardan.
// Solo se guardan los hallazgos (lo mínimo necesario para trabajar).
// ==========================================================
import { Router } from "express";
import multer from "multer";
import {
  conciliar,
  leerComprobanteXml,
  leerPropuestaSire,
  PropuestaNoValidaError,
  reporteCsv,
  type Comprobante,
  type Estado,
  type Hallazgo,
  type ResultadoConciliacion,
} from "motor-conciliacion";
import { auditar, conEstudio } from "../db.ts";
import { requireAuth } from "../middleware/auth.ts";
import { idDeRuta, texto } from "../validacion.ts";

const router = Router();
router.use(requireAuth);

export const LIMITES = {
  tamanoArchivo: 1024 * 1024, // 1 MB por archivo: un XML pesa pocos KB
  archivosXml: 2000,
};

// multer recibe archivos enviados como "multipart/form-data" (formularios con archivos)
const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITES.tamanoArchivo, files: LIMITES.archivosXml + 1 },
}).fields([
  { name: "propuesta", maxCount: 1 },
  { name: "xml", maxCount: LIMITES.archivosXml },
]);

type ArchivosSubidos = Record<string, Express.Multer.File[] | undefined>;

const COLUMNAS_CONCILIACION = `
  c.id, c.empresa_id AS "empresaId", c.periodo, c.creado_en AS "creadoEn",
  c.total_propuesta AS "totalPropuesta", c.total_xml AS "totalXml",
  c.igv_fuera_propuesta AS "igvFueraDePropuesta", c.igv_sin_respaldo AS "igvSinRespaldo",
  c.archivos_con_error AS "archivosConError",
  u.nombre AS "creadoPor"`;

const COLUMNAS_HALLAZGO = `
  id, estado, clave, ruc_emisor AS "rucEmisor", nombre_emisor AS "nombreEmisor", tipo, serie, numero,
  fecha_emision AS "fechaEmision", moneda, base_imponible AS "baseImponible", igv, total,
  explicacion, accion, revisado`;

// ----------------------------------------------------------
// POST /api/empresas/:id/conciliaciones (multipart: periodo, propuesta, xml[])
// ----------------------------------------------------------
router.post("/empresas/:id/conciliaciones", subida, async (req, res) => {
  const { estudioId, usuarioId } = req.sesion!;
  const empresaId = idDeRuta(req.params.id);
  const periodo = texto(req.body, "periodo");
  const archivos = (req.files ?? {}) as ArchivosSubidos;
  const archivoPropuesta = archivos.propuesta?.[0];
  const archivosXml = archivos.xml ?? [];

  if (!empresaId) return res.status(400).json({ error: "El id de la empresa no es válido." });
  if (!/^20\d{2}(0[1-9]|1[0-2])$/.test(periodo)) {
    return res.status(400).json({ error: "El periodo debe tener el formato AAAAMM, por ejemplo 202609." });
  }
  if (!archivoPropuesta) return res.status(400).json({ error: "Falta el archivo de la propuesta del SIRE." });

  // 1. Leer los archivos (antes de abrir la transacción: puede tardar)
  let propuesta: Comprobante[];
  try {
    propuesta = leerPropuestaSire(archivoPropuesta.buffer.toString("utf8"));
  } catch (error) {
    if (error instanceof PropuestaNoValidaError) {
      return res.status(400).json({ error: "No se pudo leer la propuesta del SIRE.", detalles: [error.message] });
    }
    throw error;
  }
  const xmls: Comprobante[] = [];
  const archivosConError: string[] = [];
  for (const archivo of archivosXml) {
    try {
      xmls.push(leerComprobanteXml(archivo.buffer.toString("utf8"), archivo.originalname));
    } catch (error) {
      archivosConError.push((error as Error).message);
    }
  }

  // 2. Conciliar y guardar, todo dentro del estudio
  const resultado = await conEstudio(estudioId, async (cliente) => {
    const empresa = await cliente.query<{ ruc: string }>("SELECT ruc FROM empresas WHERE id = $1", [empresaId]);
    const ruc = empresa.rows[0]?.ruc;
    if (!ruc) return null; // no existe o es de otro estudio

    const conciliacion = conciliar(propuesta, xmls, { rucCliente: ruc, periodo });
    const { resumen } = conciliacion;

    const nueva = await cliente.query<{ id: number }>(
      `INSERT INTO conciliaciones
         (estudio_id, empresa_id, periodo, creado_por, total_propuesta, total_xml,
          igv_fuera_propuesta, igv_sin_respaldo, archivos_con_error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [estudioId, empresaId, periodo, usuarioId, resumen.totalPropuesta, resumen.totalXml,
        resumen.igvFueraDePropuesta, resumen.igvSinRespaldo, JSON.stringify(archivosConError)]
    );
    const conciliacionId = nueva.rows[0]!.id;

    // Todos los hallazgos en UNA sola consulta (unnest convierte arreglos en filas)
    const h = conciliacion.hallazgos;
    const c = h.map((x) => x.comprobante);
    await cliente.query(
      `INSERT INTO hallazgos
         (estudio_id, conciliacion_id, estado, clave, ruc_emisor, nombre_emisor, tipo, serie, numero,
          fecha_emision, moneda, base_imponible, igv, total, explicacion, accion)
       SELECT $1, $2, * FROM unnest(
         $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[],
         $10::date[], $11::text[], $12::bigint[], $13::bigint[], $14::bigint[], $15::text[], $16::text[])`,
      [
        estudioId, conciliacionId,
        h.map((x) => x.estado), h.map((x) => x.clave),
        c.map((x) => x.rucEmisor), c.map((x) => x.nombreEmisor), c.map((x) => x.tipo),
        c.map((x) => x.serie), c.map((x) => x.numero), c.map((x) => x.fechaEmision), c.map((x) => x.moneda),
        c.map((x) => x.baseImponible), c.map((x) => x.igv), c.map((x) => x.total),
        h.map((x) => x.explicacion), h.map((x) => x.accion),
      ]
    );

    await auditar(cliente, estudioId, usuarioId, "conciliacion_creada", {
      empresaId, periodo, xml: archivosXml.length, conErrores: archivosConError.length,
    });
    return { id: conciliacionId, empresaId, periodo, resumen, archivosConError };
  });

  if (!resultado) return res.status(404).json({ error: "Empresa no encontrada." });
  res.status(201).json(resultado);
});

// ----------------------------------------------------------
// GET /api/empresas/:id/conciliaciones: historial de una empresa
// ----------------------------------------------------------
router.get("/empresas/:id/conciliaciones", async (req, res) => {
  const empresaId = idDeRuta(req.params.id);
  if (!empresaId) return res.status(400).json({ error: "El id no es válido." });

  const filas = await conEstudio(req.sesion!.estudioId, async (cliente) => {
    const existe = await cliente.query("SELECT 1 FROM empresas WHERE id = $1", [empresaId]);
    if (existe.rowCount === 0) return null;
    const { rows } = await cliente.query(
      `SELECT ${COLUMNAS_CONCILIACION},
         (SELECT count(*)::int FROM hallazgos h WHERE h.conciliacion_id = c.id AND h.estado <> 'coincide') AS "pendientes",
         (SELECT count(*)::int FROM hallazgos h WHERE h.conciliacion_id = c.id AND h.estado <> 'coincide' AND NOT h.revisado) AS "sinRevisar"
       FROM conciliaciones c LEFT JOIN usuarios u ON u.id = c.creado_por
       WHERE c.empresa_id = $1
       ORDER BY c.periodo DESC, c.creado_en DESC`,
      [empresaId]
    );
    return rows;
  });
  if (!filas) return res.status(404).json({ error: "Empresa no encontrada." });
  res.json(filas);
});

// Lee una conciliación con sus hallazgos (o null si no existe en este estudio)
async function cargarConciliacion(estudioId: number, id: number) {
  return conEstudio(estudioId, async (cliente) => {
    const { rows } = await cliente.query(
      `SELECT ${COLUMNAS_CONCILIACION}, e.ruc, e.razon_social AS "razonSocial"
       FROM conciliaciones c
       JOIN empresas e ON e.id = c.empresa_id
       LEFT JOIN usuarios u ON u.id = c.creado_por
       WHERE c.id = $1`,
      [id]
    );
    if (!rows[0]) return null;
    const hallazgos = await cliente.query(
      `SELECT ${COLUMNAS_HALLAZGO} FROM hallazgos WHERE conciliacion_id = $1
       ORDER BY (estado = 'coincide'), clave`,
      [id]
    );
    return { ...rows[0], hallazgos: hallazgos.rows };
  });
}

// GET /api/conciliaciones/:id
router.get("/conciliaciones/:id", async (req, res) => {
  const id = idDeRuta(req.params.id);
  if (!id) return res.status(400).json({ error: "El id no es válido." });
  const conciliacion = await cargarConciliacion(req.sesion!.estudioId, id);
  if (!conciliacion) return res.status(404).json({ error: "Conciliación no encontrada." });
  res.json(conciliacion);
});

// GET /api/conciliaciones/:id/csv: el detalle para abrir en Excel
router.get("/conciliaciones/:id/csv", async (req, res) => {
  const id = idDeRuta(req.params.id);
  if (!id) return res.status(400).json({ error: "El id no es válido." });
  const datos = await cargarConciliacion(req.sesion!.estudioId, id);
  if (!datos) return res.status(404).json({ error: "Conciliación no encontrada." });

  // Reconstruye el formato del motor para reutilizar su reporte CSV
  const hallazgos: Hallazgo[] = datos.hallazgos.map((h: Record<string, unknown>) => ({
    estado: h.estado as Estado,
    clave: String(h.clave),
    explicacion: String(h.explicacion),
    accion: String(h.accion),
    comprobante: {
      origen: "propuesta",
      rucEmisor: String(h.rucEmisor), nombreEmisor: String(h.nombreEmisor),
      tipo: h.tipo as Comprobante["tipo"], serie: String(h.serie), numero: String(h.numero),
      fechaEmision: String(h.fechaEmision), moneda: String(h.moneda),
      baseImponible: Number(h.baseImponible), igv: Number(h.igv), total: Number(h.total),
    },
  }));
  const csv = reporteCsv({ rucCliente: datos.ruc, periodo: datos.periodo, hallazgos } as ResultadoConciliacion);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="conciliacion-${datos.ruc}-${datos.periodo}.csv"`);
  res.send(csv);
});

// PATCH /api/hallazgos/:id: marcar un hallazgo como revisado (o no)
router.patch("/hallazgos/:id", async (req, res) => {
  const { estudioId, usuarioId } = req.sesion!;
  const id = idDeRuta(req.params.id);
  const revisado = (req.body as { revisado?: unknown })?.revisado;
  if (!id) return res.status(400).json({ error: "El id no es válido." });
  if (typeof revisado !== "boolean") return res.status(400).json({ error: "Envía revisado: true o false." });

  const hallazgo = await conEstudio(estudioId, async (cliente) => {
    const { rows } = await cliente.query(
      `UPDATE hallazgos SET revisado = $1, revisado_por = CASE WHEN $1 THEN $2::int ELSE NULL END
       WHERE id = $3 RETURNING ${COLUMNAS_HALLAZGO}`,
      [revisado, usuarioId, id]
    );
    if (rows[0]) await auditar(cliente, estudioId, usuarioId, "hallazgo_revisado", { id, revisado });
    return rows[0];
  });
  if (!hallazgo) return res.status(404).json({ error: "Hallazgo no encontrado." });
  res.json(hallazgo);
});

export default router;
