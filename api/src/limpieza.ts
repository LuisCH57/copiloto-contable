// ==========================================================
// Limpieza automática: los XML que subieron los clientes no se guardan
// para siempre. Se borran DIAS_DE_CONSERVACION días después de que vence
// su enlace (la conciliación y sus hallazgos se conservan).
//
// Es una tarea de mantenimiento de TODOS los estudios, por eso usa
// pool.query (sin aislamiento). Solo borra; nunca lee datos.
// ==========================================================
import { pool } from "./db.ts";

export const DIAS_DE_CONSERVACION = 90;

export async function borrarDocumentosAntiguos(): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM documentos d USING solicitudes s
     WHERE d.solicitud_id = s.id AND s.vence_en < now() - make_interval(days => $1)`,
    [DIAS_DE_CONSERVACION]
  );
  return rowCount ?? 0;
}

// Se ejecuta al arrancar y cada 12 horas. En el plan gratuito de Render el
// servidor se duerme cuando nadie lo usa, así que arrancar también limpia.
export function programarLimpieza() {
  const limpiar = async () => {
    try {
      const borrados = await borrarDocumentosAntiguos();
      if (borrados > 0) console.log(`Limpieza: se borraron ${borrados} XML antiguos de clientes.`);
    } catch (error) {
      console.error("No se pudo hacer la limpieza:", error);
    }
  };
  void limpiar();
  setInterval(limpiar, 12 * 60 * 60 * 1000).unref(); // unref: no impide que el proceso termine
}
