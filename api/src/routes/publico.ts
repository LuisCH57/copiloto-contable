// ==========================================================
// Rutas PÚBLICAS: el cliente del contador sube sus XML con un enlace.
// No hay sesión. El enlace firmado ES la autorización y solo sirve para
// UNA empresa y UN mes. El cliente no ve nada más del estudio.
//
//   GET  /api/publico/solicitudes/:token             qué se pide y qué ya subió
//   POST /api/publico/solicitudes/:token/documentos  subir XML (multipart: xml[])
// ==========================================================
import { Router, type Response } from "express";
import multer from "multer";
import { auditar, conEstudio, pool } from "../db.ts";
import { firmaCorrecta, leerToken } from "../enlaces.ts";
import { limitarPeticiones } from "../middleware/limite.ts";
import { revisarArchivos } from "../recepcion.ts";

const router = Router();

// 120 peticiones cada 15 minutos por IP: de sobra para una persona subiendo por tandas
router.use(limitarPeticiones({ maximo: 120, ventanaMs: 15 * 60 * 1000 }));

export const LIMITES_CLIENTE = {
  tamanoArchivo: 1024 * 1024, // 1 MB por XML
  archivosPorEnvio: 200, // la página los envía por tandas
  documentosPorSolicitud: 3000,
};

const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITES_CLIENTE.tamanoArchivo, files: LIMITES_CLIENTE.archivosPorEnvio },
}).array("xml", LIMITES_CLIENTE.archivosPorEnvio);

interface SolicitudDelEnlace {
  id: number;
  estudioId: number;
}

// Valida el enlace. Si no sirve, responde y devuelve null.
async function solicitudDelEnlace(token: string, res: Response): Promise<SolicitudDelEnlace | null> {
  const partes = leerToken(token);
  // Es la única consulta sin estudio: todavía no sabemos de qué estudio es el enlace.
  // Solo lee lo necesario para comprobar la firma.
  const { rows } = partes
    ? await pool.query<{ estudio_id: number; sello: string; vigente: boolean }>(
        "SELECT estudio_id, sello, (NOT cerrada AND vence_en > now()) AS vigente FROM solicitudes WHERE id = $1",
        [partes.id]
      )
    : { rows: [] };
  const fila = rows[0];

  if (!partes || !fila || !firmaCorrecta(partes.id, fila.sello, partes.firma)) {
    res.status(404).json({ error: "Este enlace no es válido. Revisa que lo hayas copiado completo." });
    return null;
  }
  if (!fila.vigente) {
    res.status(410).json({ error: "Este enlace ya no está activo. Pide uno nuevo a tu contador." });
    return null;
  }
  return { id: partes.id, estudioId: fila.estudio_id };
}

const CONSULTA_DOCUMENTOS = `
  SELECT archivo, ruc_emisor AS "rucEmisor", nombre_emisor AS "nombreEmisor", tipo, serie, numero,
         fecha_emision AS "fechaEmision", moneda, total, subido_en AS "subidoEn"
  FROM documentos WHERE solicitud_id = $1 ORDER BY subido_en DESC, id DESC`;

// GET: lo que el cliente ve al abrir el enlace
router.get("/solicitudes/:token", async (req, res) => {
  const solicitud = await solicitudDelEnlace(String(req.params.token), res);
  if (!solicitud) return;

  const datos = await conEstudio(solicitud.estudioId, async (cliente) => {
    const { rows } = await cliente.query(
      `SELECT s.periodo, s.vence_en AS "venceEn", e.ruc, e.razon_social AS "razonSocial", es.nombre AS estudio
       FROM solicitudes s JOIN empresas e ON e.id = s.empresa_id JOIN estudios es ON es.id = s.estudio_id
       WHERE s.id = $1`,
      [solicitud.id]
    );
    const documentos = await cliente.query(CONSULTA_DOCUMENTOS, [solicitud.id]);
    return { ...rows[0], documentos: documentos.rows };
  });
  res.json(datos);
});

// POST: subir XML
router.post("/solicitudes/:token/documentos", subida, async (req, res) => {
  const solicitud = await solicitudDelEnlace(String(req.params.token), res);
  if (!solicitud) return;
  const archivos = (req.files ?? []) as Express.Multer.File[];
  if (archivos.length === 0) return res.status(400).json({ error: "No llegó ningún archivo XML." });

  const respuesta = await conEstudio(solicitud.estudioId, async (cliente) => {
    const { rows } = await cliente.query<{ ruc: string; periodo: string }>(
      "SELECT e.ruc, s.periodo FROM solicitudes s JOIN empresas e ON e.id = s.empresa_id WHERE s.id = $1",
      [solicitud.id]
    );
    const { ruc, periodo } = rows[0]!;
    const guardadas = await cliente.query<{ clave: string }>("SELECT clave FROM documentos WHERE solicitud_id = $1", [solicitud.id]);

    const { aceptados, resultados } = revisarArchivos(
      // originalname llega en latin1: se convierte para no romper las tildes
      archivos.map((a) => ({ nombre: Buffer.from(a.originalname, "latin1").toString("utf8"), contenido: a.buffer.toString("utf8") })),
      { ruc, periodo, clavesGuardadas: new Set(guardadas.rows.map((f) => f.clave)) }
    );

    if (guardadas.rowCount! + aceptados.length > LIMITES_CLIENTE.documentosPorSolicitud) {
      return { error: `Este enlace admite como máximo ${LIMITES_CLIENTE.documentosPorSolicitud} comprobantes.` };
    }

    if (aceptados.length > 0) {
      const c = aceptados.map((a) => a.comprobante);
      await cliente.query(
        `INSERT INTO documentos
           (estudio_id, solicitud_id, clave, archivo, contenido, ruc_emisor, nombre_emisor, tipo, serie, numero,
            fecha_emision, moneda, total)
         SELECT $1, $2, * FROM unnest(
           $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[],
           $11::date[], $12::text[], $13::bigint[])
         ON CONFLICT (solicitud_id, clave) DO NOTHING`,
        [
          solicitud.estudioId, solicitud.id,
          aceptados.map((a) => a.clave), aceptados.map((a) => a.archivo), aceptados.map((a) => a.contenido),
          c.map((x) => x.rucEmisor), c.map((x) => x.nombreEmisor), c.map((x) => x.tipo), c.map((x) => x.serie),
          c.map((x) => x.numero), c.map((x) => x.fechaEmision), c.map((x) => x.moneda), c.map((x) => x.total),
        ]
      );
    }
    await auditar(cliente, solicitud.estudioId, null, "documentos_recibidos", {
      solicitudId: solicitud.id,
      empresa: ruc,
      periodo,
      recibidos: aceptados.length,
      rechazados: resultados.filter((r) => r.estado === "rechazado").length,
    });

    const documentos = await cliente.query(CONSULTA_DOCUMENTOS, [solicitud.id]);
    return { resultados, documentos: documentos.rows };
  });

  if ("error" in respuesta) return res.status(400).json(respuesta);
  res.status(201).json(respuesta);
});

export default router;
