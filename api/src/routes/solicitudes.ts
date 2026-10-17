// ==========================================================
// Solicitudes de comprobantes (lado del contador)
//
//   GET    /api/empresas/:id/solicitudes        enlaces de la empresa, con lo recibido
//   POST   /api/empresas/:id/solicitudes        crear el enlace de un mes { periodo }
//   GET    /api/solicitudes/:id/documentos      los XML que subió el cliente
//   POST   /api/solicitudes/:id/renovar         nuevo enlace (el anterior deja de servir)
//   PATCH  /api/solicitudes/:id                 cerrar o reabrir { cerrada }
//   POST   /api/solicitudes/:id/recordatorios   anotar que se envió un recordatorio { canal }
//   DELETE /api/solicitudes/:id                 borrar el enlace y los archivos recibidos
// ==========================================================
import { Router } from "express";
import { auditar, conEstudio, type Cliente } from "../db.ts";
import { DIAS_DE_VIGENCIA, nuevoSello, tokenDeSolicitud } from "../enlaces.ts";
import { PATRON_PERIODO } from "../formato.ts";
import { requireAuth } from "../middleware/auth.ts";
import { idDeRuta, texto } from "../validacion.ts";

const router = Router();
router.use(requireAuth);

const CONSULTA = `
  SELECT s.id, s.empresa_id AS "empresaId", s.periodo, s.sello, s.vence_en AS "venceEn", s.cerrada,
         (NOT s.cerrada AND s.vence_en > now()) AS vigente,
         s.recordatorios, s.ultimo_recordatorio AS "ultimoRecordatorio", s.creado_en AS "creadoEn",
         (SELECT count(*)::int FROM documentos d WHERE d.solicitud_id = s.id) AS documentos,
         (SELECT max(d.subido_en) FROM documentos d WHERE d.solicitud_id = s.id) AS "ultimoDocumento"
  FROM solicitudes s`;

// El sello nunca sale del servidor: se reemplaza por el token firmado
function conToken({ sello, ...fila }: Record<string, unknown> & { id: number; sello: string }) {
  return { ...fila, token: tokenDeSolicitud(fila.id, sello) };
}

async function leerSolicitud(cliente: Cliente, id: number) {
  const { rows } = await cliente.query(`${CONSULTA} WHERE s.id = $1`, [id]);
  return rows[0] ? conToken(rows[0]) : null;
}

const venceEn = () => new Date(Date.now() + DIAS_DE_VIGENCIA * 24 * 60 * 60 * 1000);

// GET /api/empresas/:id/solicitudes
router.get("/empresas/:id/solicitudes", async (req, res) => {
  const empresaId = idDeRuta(req.params.id);
  if (!empresaId) return res.status(400).json({ error: "El id no es válido." });
  const filas = await conEstudio(req.sesion!.estudioId, async (cliente) => {
    const existe = await cliente.query("SELECT 1 FROM empresas WHERE id = $1", [empresaId]);
    if (existe.rowCount === 0) return null;
    const { rows } = await cliente.query(`${CONSULTA} WHERE s.empresa_id = $1 ORDER BY s.periodo DESC`, [empresaId]);
    return rows.map(conToken);
  });
  if (!filas) return res.status(404).json({ error: "Empresa no encontrada." });
  res.json(filas);
});

// POST /api/empresas/:id/solicitudes { periodo }: si ya existe la del mes, la devuelve
router.post("/empresas/:id/solicitudes", async (req, res) => {
  const { estudioId, usuarioId } = req.sesion!;
  const empresaId = idDeRuta(req.params.id);
  const periodo = texto(req.body, "periodo");
  if (!empresaId) return res.status(400).json({ error: "El id no es válido." });
  if (!PATRON_PERIODO.test(periodo)) {
    return res.status(400).json({ error: "El periodo debe tener el formato AAAAMM, por ejemplo 202609." });
  }

  const resultado = await conEstudio(estudioId, async (cliente) => {
    const empresa = await cliente.query<{ activa: boolean }>("SELECT activa FROM empresas WHERE id = $1", [empresaId]);
    if (!empresa.rows[0]) return { status: 404 };
    if (!empresa.rows[0].activa) return { status: 400, error: "La empresa está inactiva." };

    const nueva = await cliente.query<{ id: number }>(
      `INSERT INTO solicitudes (estudio_id, empresa_id, periodo, sello, vence_en, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (empresa_id, periodo) DO NOTHING RETURNING id`,
      [estudioId, empresaId, periodo, nuevoSello(), venceEn(), usuarioId]
    );
    if (nueva.rows[0]) {
      await auditar(cliente, estudioId, usuarioId, "solicitud_creada", { empresaId, periodo });
      return { status: 201, solicitud: await leerSolicitud(cliente, nueva.rows[0].id) };
    }
    const existente = await cliente.query<{ id: number }>(
      "SELECT id FROM solicitudes WHERE empresa_id = $1 AND periodo = $2",
      [empresaId, periodo]
    );
    return { status: 200, solicitud: await leerSolicitud(cliente, existente.rows[0]!.id) };
  });

  if (resultado.status === 404) return res.status(404).json({ error: "Empresa no encontrada." });
  if (resultado.error) return res.status(resultado.status).json({ error: resultado.error });
  res.status(resultado.status).json(resultado.solicitud);
});

// GET /api/solicitudes/:id/documentos
router.get("/solicitudes/:id/documentos", async (req, res) => {
  const id = idDeRuta(req.params.id);
  if (!id) return res.status(400).json({ error: "El id no es válido." });
  const filas = await conEstudio(req.sesion!.estudioId, async (cliente) => {
    const existe = await cliente.query("SELECT 1 FROM solicitudes WHERE id = $1", [id]);
    if (existe.rowCount === 0) return null;
    const { rows } = await cliente.query(
      `SELECT id, archivo, ruc_emisor AS "rucEmisor", nombre_emisor AS "nombreEmisor", tipo, serie, numero,
              fecha_emision AS "fechaEmision", moneda, total, subido_en AS "subidoEn"
       FROM documentos WHERE solicitud_id = $1 ORDER BY subido_en DESC, id DESC`,
      [id]
    );
    return rows;
  });
  if (!filas) return res.status(404).json({ error: "Solicitud no encontrada." });
  res.json(filas);
});

// POST /api/solicitudes/:id/renovar: nuevo sello = nuevo enlace; además reabre y extiende la vigencia
router.post("/solicitudes/:id/renovar", async (req, res) => {
  const { estudioId, usuarioId } = req.sesion!;
  const id = idDeRuta(req.params.id);
  if (!id) return res.status(400).json({ error: "El id no es válido." });
  const solicitud = await conEstudio(estudioId, async (cliente) => {
    const { rowCount } = await cliente.query(
      "UPDATE solicitudes SET sello = $1, vence_en = $2, cerrada = false WHERE id = $3",
      [nuevoSello(), venceEn(), id]
    );
    if (rowCount === 0) return null;
    await auditar(cliente, estudioId, usuarioId, "solicitud_renovada", { id });
    return leerSolicitud(cliente, id);
  });
  if (!solicitud) return res.status(404).json({ error: "Solicitud no encontrada." });
  res.json(solicitud);
});

// PATCH /api/solicitudes/:id { cerrada }: al cerrarla, el enlace deja de aceptar archivos
router.patch("/solicitudes/:id", async (req, res) => {
  const { estudioId, usuarioId } = req.sesion!;
  const id = idDeRuta(req.params.id);
  const cerrada = (req.body as { cerrada?: unknown })?.cerrada;
  if (!id) return res.status(400).json({ error: "El id no es válido." });
  if (typeof cerrada !== "boolean") return res.status(400).json({ error: "Envía cerrada: true o false." });
  const solicitud = await conEstudio(estudioId, async (cliente) => {
    const { rowCount } = await cliente.query("UPDATE solicitudes SET cerrada = $1 WHERE id = $2", [cerrada, id]);
    if (rowCount === 0) return null;
    await auditar(cliente, estudioId, usuarioId, cerrada ? "solicitud_cerrada" : "solicitud_reabierta", { id });
    return leerSolicitud(cliente, id);
  });
  if (!solicitud) return res.status(404).json({ error: "Solicitud no encontrada." });
  res.json(solicitud);
});

// POST /api/solicitudes/:id/recordatorios { canal }: el mensaje lo abre el navegador
// (WhatsApp o correo); aquí solo se anota para saber a quién ya se le recordó.
router.post("/solicitudes/:id/recordatorios", async (req, res) => {
  const { estudioId, usuarioId } = req.sesion!;
  const id = idDeRuta(req.params.id);
  const canal = texto(req.body, "canal");
  if (!id) return res.status(400).json({ error: "El id no es válido." });
  if (!["whatsapp", "correo", "copiado"].includes(canal)) {
    return res.status(400).json({ error: "El canal debe ser whatsapp, correo o copiado." });
  }
  const solicitud = await conEstudio(estudioId, async (cliente) => {
    const { rowCount } = await cliente.query(
      "UPDATE solicitudes SET recordatorios = recordatorios + 1, ultimo_recordatorio = now() WHERE id = $1",
      [id]
    );
    if (rowCount === 0) return null;
    await auditar(cliente, estudioId, usuarioId, "recordatorio_enviado", { id, canal });
    return leerSolicitud(cliente, id);
  });
  if (!solicitud) return res.status(404).json({ error: "Solicitud no encontrada." });
  res.json(solicitud);
});

// DELETE /api/solicitudes/:id: borra también los XML recibidos (ON DELETE CASCADE)
router.delete("/solicitudes/:id", async (req, res) => {
  const { estudioId, usuarioId } = req.sesion!;
  const id = idDeRuta(req.params.id);
  if (!id) return res.status(400).json({ error: "El id no es válido." });
  const borrada = await conEstudio(estudioId, async (cliente) => {
    const { rows } = await cliente.query<{ periodo: string }>("DELETE FROM solicitudes WHERE id = $1 RETURNING periodo", [id]);
    if (!rows[0]) return false;
    await auditar(cliente, estudioId, usuarioId, "solicitud_borrada", { id, periodo: rows[0].periodo });
    return true;
  });
  if (!borrada) return res.status(404).json({ error: "Solicitud no encontrada." });
  res.status(204).end();
});

export default router;
