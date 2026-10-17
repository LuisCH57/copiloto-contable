// ==========================================================
// Conexión a PostgreSQL y AISLAMIENTO entre estudios contables.
//
// Hay dos formas de consultar:
//   - pool.query(...)            -> como dueño de la base de datos, SIN filtro.
//                                   Solo para login y registro (aún no hay estudio).
//   - conEstudio(id, cliente => ...) -> dentro de una transacción con el rol
//                                   copiloto_app: Row-Level Security filtra TODO
//                                   por ese estudio. Es lo que usan las rutas.
// ==========================================================
import pg from "pg";
import { config } from "./config.ts";

pg.types.setTypeParser(1082, (value) => value); // DATE como texto "2026-09-15"
pg.types.setTypeParser(20, (value) => Number(value)); // BIGINT como número (céntimos caben de sobra)

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.PG_POOL_MAX ?? 10),
});

export type Cliente = pg.PoolClient;

export async function conEstudio<T>(estudioId: number, trabajo: (cliente: Cliente) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    // SET LOCAL: el cambio de rol dura solo esta transacción
    await cliente.query("SET LOCAL ROLE copiloto_app");
    await cliente.query("SELECT set_config('app.estudio_id', $1, true)", [String(estudioId)]);
    const resultado = await trabajo(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
}

// Registra una acción en la auditoría (dentro de la transacción del estudio)
export async function auditar(
  cliente: Cliente,
  estudioId: number,
  usuarioId: number | null,
  accion: string,
  detalle: Record<string, unknown> = {}
) {
  await cliente.query(
    "INSERT INTO auditoria (estudio_id, usuario_id, accion, detalle) VALUES ($1, $2, $3, $4)",
    [estudioId, usuarioId, accion, JSON.stringify(detalle)]
  );
}
