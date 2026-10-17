// Registro de auditoría: quién hizo qué y cuándo (solo el titular)
import { api } from "../api.ts";
import { Cargando, MensajeError } from "../components/Comunes.tsx";
import type { EventoAuditoria } from "../types.ts";
import { fechaHora, nombrePeriodo } from "../utils/formato.ts";
import { useFetch } from "../utils/useFetch.ts";

function describir(evento: EventoAuditoria): string {
  const d = evento.detalle;
  switch (evento.accion) {
    case "estudio_registrado":
      return `Registró el estudio "${String(d.nombreEstudio ?? "")}"`;
    case "inicio_sesion":
      return "Inició sesión";
    case "usuario_creado":
      return `Agregó a ${String(d.email ?? "un usuario")} al equipo`;
    case "usuario_activado":
      return "Reactivó a un miembro del equipo";
    case "usuario_desactivado":
      return "Desactivó a un miembro del equipo";
    case "empresa_creada":
      return `Agregó la empresa con RUC ${String(d.ruc ?? "")}`;
    case "empresa_actualizada":
      return "Editó una empresa";
    case "conciliacion_creada":
      return `Concilió ${typeof d.periodo === "string" ? nombrePeriodo(d.periodo) : "un periodo"} (${String(d.xml ?? 0)} XML)`;
    case "hallazgo_revisado":
      return d.revisado ? "Marcó un hallazgo como revisado" : "Desmarcó un hallazgo";
    default:
      return evento.accion;
  }
}

export default function Auditoria() {
  const { data, error, loading } = useFetch(() => api.auditoria(), "auditoria");
  return (
    <section aria-labelledby="titulo-auditoria">
      <div className="encabezado-seccion">
        <div>
          <h1 id="titulo-auditoria">Auditoría</h1>
          <p className="tenue">Las últimas 100 acciones de tu estudio. Solo tú, como titular, ves esta página.</p>
        </div>
      </div>
      <MensajeError error={error} />
      {loading && !data ? (
        <Cargando />
      ) : (
        <div className="tabla-desplazable">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Fecha y hora</th>
                <th scope="col">Persona</th>
                <th scope="col">Acción</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="mono">{fechaHora(e.creadoEn)}</td>
                  <td>{e.usuario ?? "—"}</td>
                  <td>{describir(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
