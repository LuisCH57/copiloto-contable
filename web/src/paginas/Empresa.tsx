// Una empresa: subir los archivos del mes y ver su historial de conciliaciones
import { useState, type FormEvent } from "react";
import { api } from "../api.ts";
import { Cargando, MensajeError } from "../components/Comunes.tsx";
import PedirComprobantes from "../components/PedirComprobantes.tsx";
import ZonaXml from "../components/ZonaXml.tsx";
import type { Sesion, Solicitud, Empresa as TipoEmpresa } from "../types.ts";
import { fechaHora, mesAnterior, nombrePeriodo, soles } from "../utils/formato.ts";
import { haceCuanto } from "../utils/mensajes.ts";
import { enlace, ir } from "../utils/ruta.ts";
import { useFetch } from "../utils/useFetch.ts";

const MAXIMO_XML = 2000; // el mismo límite que la API

export default function Empresa({ id, sesion }: { id: number; sesion: Sesion }) {
  const empresa = useFetch(() => api.empresa(id), `empresa-${id}`);
  const historial = useFetch(() => api.conciliaciones(id), `historial-${id}`);
  const solicitudes = useFetch(() => api.solicitudes(id), `solicitudes-${id}`);
  const datos = empresa.data;

  return (
    <section aria-labelledby="titulo-empresa">
      <a className="volver" href={enlace({ pagina: "empresas" })}>← Empresas</a>
      <MensajeError error={empresa.error} />
      {!datos ? (
        !empresa.error && <Cargando />
      ) : (
        <>
          <div className="encabezado-seccion">
            <div>
              <h1 id="titulo-empresa">{datos.razonSocial}</h1>
              <p className="mono tenue">RUC {datos.ruc}{!datos.activa && " · Inactiva"}</p>
            </div>
            <BotonActivar empresa={datos} alCambiar={empresa.reload} />
          </div>

          {datos.activa && (
            <>
              <PedirComprobantes
                empresa={datos}
                sesion={sesion}
                solicitudes={solicitudes.data ?? []}
                error={solicitudes.error}
                alCambiarSolicitudes={solicitudes.reload}
                alCambiarEmpresa={empresa.reload}
              />
              <NuevaConciliacion empresaId={id} solicitudes={solicitudes.data ?? []} />
            </>
          )}

          <h2 className="subtitulo">Historial</h2>
          <MensajeError error={historial.error} />
          {historial.loading && !historial.data ? (
            <Cargando />
          ) : (historial.data ?? []).length === 0 ? (
            <div className="vacio"><p className="tenue">Todavía no hay conciliaciones para esta empresa.</p></div>
          ) : (
            <div className="tabla-desplazable">
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">Periodo</th>
                    <th scope="col">Hallazgos</th>
                    <th scope="col">Sin revisar</th>
                    <th scope="col" className="num">IGV en riesgo</th>
                    <th scope="col">Hecha por</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.data!.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <a href={enlace({ pagina: "conciliacion", id: c.id })}>{nombrePeriodo(c.periodo)}</a>
                        <span className="sub tenue">{fechaHora(c.creadoEn)}</span>
                      </td>
                      <td>{c.pendientes === 0 ? "Todo coincide" : `${c.pendientes} por atender`}</td>
                      <td>{c.sinRevisar === 0 ? <span className="texto-ok">✓ Al día</span> : c.sinRevisar}</td>
                      <td className="num">{soles(c.igvFueraDePropuesta + c.igvSinRespaldo)}</td>
                      <td>{c.creadoPor ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function BotonActivar({ empresa, alCambiar }: { empresa: TipoEmpresa; alCambiar: () => void }) {
  const [error, setError] = useState<unknown>(null);
  async function cambiar() {
    try {
      await api.editarEmpresa(empresa.id, empresa.razonSocial, !empresa.activa);
      alCambiar();
    } catch (err) {
      setError(err);
    }
  }
  return (
    <div>
      <button type="button" className="boton" onClick={cambiar}>
        {empresa.activa ? "Desactivar empresa" : "Reactivar empresa"}
      </button>
      <MensajeError error={error} />
    </div>
  );
}

// ----------------------------------------------------------
// Formulario para conciliar un mes
// ----------------------------------------------------------
function NuevaConciliacion({ empresaId, solicitudes }: { empresaId: number; solicitudes: Solicitud[] }) {
  const [mes, setMes] = useState(mesAnterior()); // "AAAA-MM"
  const [propuesta, setPropuesta] = useState<File | null>(null);
  const [xmls, setXmls] = useState<File[]>([]);
  const [usarCliente, setUsarCliente] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);

  const periodo = mes.replace("-", "");
  // Lo que el cliente ya subió con su enlace para este mes
  const delCliente = solicitudes.find((s) => s.periodo === periodo && s.documentos > 0);

  async function conciliar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!propuesta) return;
    if (xmls.length > MAXIMO_XML) {
      setError(new Error(`Puedes subir como máximo ${MAXIMO_XML} XML por conciliación.`));
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const resultado = await api.conciliar(empresaId, periodo, propuesta, xmls, Boolean(delCliente && usarCliente));
      ir({ pagina: "conciliacion", id: resultado.id });
    } catch (err) {
      setError(err);
      setEnviando(false);
    }
  }

  return (
    <form className="tarjeta formulario" onSubmit={conciliar} aria-labelledby="titulo-conciliar">
      <h2 id="titulo-conciliar" className="titulo-tarjeta">Conciliar un mes</h2>
      <div className="rejilla-campos">
        <label className="campo">
          <span>Periodo</span>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} required min="2020-01" />
        </label>
        <label className="campo">
          <span>Propuesta del SIRE (registro de compras)</span>
          <input type="file" accept=".txt,.csv" onChange={(e) => setPropuesta(e.target.files?.[0] ?? null)} required />
          <small className="tenue">El archivo .txt que descargas del SIRE.</small>
        </label>
      </div>

      {delCliente && (
        <label className="casilla casilla-destacada">
          <input type="checkbox" checked={usarCliente} onChange={(e) => setUsarCliente(e.target.checked)} />
          <span>
            Incluir los <strong>{delCliente.documentos} XML que subió el cliente</strong> con su enlace
            {delCliente.ultimoDocumento && <span className="tenue"> (el último, {haceCuanto(delCliente.ultimoDocumento)})</span>}
          </span>
        </label>
      )}

      <ZonaXml
        archivos={xmls}
        alCambiar={setXmls}
        titulo={
          <>
            <strong>Arrastra aquí la carpeta con los XML</strong> de las compras del cliente
            {delCliente && " (solo si tienes otros además de los que él subió)"}
          </>
        }
      />

      <MensajeError error={error} />
      <div className="acciones">
        <button type="submit" className="boton boton-principal" disabled={enviando || !propuesta}>
          {enviando ? "Conciliando…" : `Conciliar ${nombrePeriodo(periodo)}`}
        </button>
      </div>
    </form>
  );
}
