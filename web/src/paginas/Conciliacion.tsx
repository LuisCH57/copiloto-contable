// Revisión de una conciliación: resumen, filtros y hallazgos
import { useState } from "react";
import { NOMBRE_ESTADO } from "motor-conciliacion/reporte";
import { api } from "../api.ts";
import { Cargando, EtiquetaEstado, MensajeError } from "../components/Comunes.tsx";
import type { Estado, Hallazgo } from "../types.ts";
import { fechaCorta, fechaHora, NOMBRE_TIPO, nombrePeriodo, soles } from "../utils/formato.ts";
import { enlace } from "../utils/ruta.ts";
import { useFetch } from "../utils/useFetch.ts";

// Orden de los filtros: primero lo más grave
const ORDEN: Estado[] = [
  "falta_en_propuesta", "diferencia_monto", "otro_receptor", "ruc_invalido",
  "falta_xml", "otro_periodo", "duplicado", "coincide",
];

type Filtro = "pendientes" | Estado;

export default function Conciliacion({ id }: { id: number }) {
  const { data, error, loading } = useFetch(() => api.conciliacion(id), `conciliacion-${id}`);
  // Cambios de "revisado" hechos en esta pantalla (se muestran sin recargar)
  const [revisados, setRevisados] = useState<Record<number, boolean>>({});
  const [filtro, setFiltro] = useState<Filtro>("pendientes");
  const [ocultarRevisados, setOcultarRevisados] = useState(false);
  const [errorAccion, setErrorAccion] = useState<unknown>(null);

  if (loading && !data) return <Cargando />;
  if (!data) return <MensajeError error={error} />;

  const hallazgos = data.hallazgos.map((h) => ({ ...h, revisado: revisados[h.id] ?? h.revisado }));
  const conteo = (estado: Estado) => hallazgos.filter((h) => h.estado === estado).length;
  const pendientes = hallazgos.filter((h) => h.estado !== "coincide");
  const sinRevisar = pendientes.filter((h) => !h.revisado).length;

  const visibles = hallazgos
    .filter((h) => (filtro === "pendientes" ? h.estado !== "coincide" : h.estado === filtro))
    .filter((h) => !ocultarRevisados || !h.revisado);

  async function cambiarRevisado(h: Hallazgo) {
    const nuevo = !h.revisado;
    setRevisados((r) => ({ ...r, [h.id]: nuevo })); // se ve al instante...
    setErrorAccion(null);
    try {
      await api.marcarRevisado(h.id, nuevo);
    } catch (err) {
      setRevisados((r) => ({ ...r, [h.id]: !nuevo })); // ...y se deshace si falla
      setErrorAccion(err);
    }
  }

  async function descargar() {
    setErrorAccion(null);
    try {
      await api.descargarCsv(id);
    } catch (err) {
      setErrorAccion(err);
    }
  }

  return (
    <section aria-labelledby="titulo-conciliacion">
      <a className="volver" href={enlace({ pagina: "empresa", id: data.empresaId })}>← {data.razonSocial}</a>
      <div className="encabezado-seccion">
        <div>
          <h1 id="titulo-conciliacion">Compras de {nombrePeriodo(data.periodo)}</h1>
          <p className="tenue">
            <span className="mono">RUC {data.ruc}</span> · {data.razonSocial} · conciliado el {fechaHora(data.creadoEn)}
            {data.creadoPor && ` por ${data.creadoPor}`}
          </p>
        </div>
        <button type="button" className="boton" onClick={descargar}>Descargar para Excel</button>
      </div>

      <div className="indicadores">
        <div className="indicador">
          <span className="indicador-etiqueta">Por atender</span>
          <span className="indicador-valor">{pendientes.length}</span>
          <span className="indicador-nota">{sinRevisar === 0 ? "✓ Todo revisado" : `${sinRevisar} sin revisar`}</span>
        </div>
        <div className="indicador">
          <span className="indicador-etiqueta">Coinciden</span>
          <span className="indicador-valor">{conteo("coincide")}</span>
          <span className="indicador-nota">de {data.totalPropuesta} en la propuesta · {data.totalXml} XML</span>
        </div>
        <div className={`indicador${data.igvFueraDePropuesta > 0 ? " indicador-grave" : ""}`}>
          <span className="indicador-etiqueta">Crédito fiscal en riesgo</span>
          <span className="indicador-valor">{soles(data.igvFueraDePropuesta)}</span>
          <span className="indicador-nota">IGV de XML que SUNAT no propone</span>
        </div>
        <div className={`indicador${data.igvSinRespaldo > 0 ? " indicador-aviso" : ""}`}>
          <span className="indicador-etiqueta">IGV sin respaldo</span>
          <span className="indicador-valor">{soles(data.igvSinRespaldo)}</span>
          <span className="indicador-nota">Propuesto por SUNAT, falta el XML</span>
        </div>
      </div>

      {data.archivosConError.length > 0 && (
        <details className="alerta alerta-aviso">
          <summary>{data.archivosConError.length} archivo(s) no se pudieron leer y no se incluyeron</summary>
          <ul>{data.archivosConError.map((e) => <li key={e}>{e}</li>)}</ul>
        </details>
      )}
      <MensajeError error={errorAccion} />

      <div className="barra-filtros">
        <div className="filtros" role="group" aria-label="Filtrar hallazgos">
          <button type="button" aria-pressed={filtro === "pendientes"} onClick={() => setFiltro("pendientes")}>
            Por atender <span className="contador">{pendientes.length}</span>
          </button>
          {ORDEN.filter((e) => conteo(e) > 0).map((estado) => (
            <button key={estado} type="button" aria-pressed={filtro === estado} onClick={() => setFiltro(estado)}>
              {NOMBRE_ESTADO[estado]} <span className="contador">{conteo(estado)}</span>
            </button>
          ))}
        </div>
        <label className="casilla">
          <input type="checkbox" checked={ocultarRevisados} onChange={(e) => setOcultarRevisados(e.target.checked)} />
          Ocultar revisados
        </label>
      </div>

      {visibles.length === 0 ? (
        <div className="vacio">
          <p className="tenue">
            {filtro === "pendientes" && pendientes.length === 0 ? "✓ Todo coincide: no hay nada que atender." : "No hay hallazgos con este filtro."}
          </p>
        </div>
      ) : (
        <ul className="lista-hallazgos">
          {visibles.map((h) => (
            <li key={h.id} className={`hallazgo${h.revisado ? " revisado" : ""}`}>
              <div className="hallazgo-cabecera">
                <EtiquetaEstado estado={h.estado} />
                <span className="hallazgo-total">{soles(h.total, h.moneda)}</span>
              </div>
              <p className="hallazgo-comprobante">
                {NOMBRE_TIPO[h.tipo] ?? h.tipo} <span className="mono">{h.serie}-{h.numero}</span> · {fechaCorta(h.fechaEmision)}
              </p>
              <p className="tenue">
                {h.nombreEmisor || "Proveedor sin nombre"} · <span className="mono">RUC {h.rucEmisor}</span>
              </p>
              <p className="hallazgo-explicacion">{h.explicacion}</p>
              {h.estado !== "coincide" && (
                <div className="hallazgo-pie">
                  <p className="hallazgo-accion"><strong>Qué hacer:</strong> {h.accion}</p>
                  <label className="casilla">
                    <input type="checkbox" checked={h.revisado} onChange={() => cambiarRevisado(h)} />
                    Revisado
                  </label>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
