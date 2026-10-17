// Una empresa: subir los archivos del mes y ver su historial de conciliaciones
import { useState, type DragEvent, type FormEvent } from "react";
import { api } from "../api.ts";
import { Cargando, MensajeError } from "../components/Comunes.tsx";
import type { Empresa as TipoEmpresa } from "../types.ts";
import { fechaHora, mesAnterior, nombrePeriodo, soles } from "../utils/formato.ts";
import { enlace, ir } from "../utils/ruta.ts";
import { useFetch } from "../utils/useFetch.ts";

const MAXIMO_XML = 2000; // el mismo límite que la API

export default function Empresa({ id }: { id: number }) {
  const empresa = useFetch(() => api.empresa(id), `empresa-${id}`);
  const historial = useFetch(() => api.conciliaciones(id), `historial-${id}`);
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

          {datos.activa && <NuevaConciliacion empresaId={id} />}

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

// Al soltar una CARPETA, el navegador entrega "entradas" que hay que recorrer
type Entrada = { isFile: boolean; isDirectory: boolean; file?: (ok: (f: File) => void, error: () => void) => void; createReader?: () => { readEntries: (ok: (e: Entrada[]) => void) => void } };

async function archivosDeEntrada(entrada: Entrada): Promise<File[]> {
  if (entrada.isFile && entrada.file) {
    return [await new Promise<File>((ok, error) => entrada.file!(ok, error))];
  }
  if (entrada.isDirectory && entrada.createReader) {
    const lector = entrada.createReader();
    const todas: Entrada[] = [];
    // readEntries devuelve los archivos por tandas: se llama hasta que no quede nada
    for (;;) {
      const tanda = await new Promise<Entrada[]>((ok) => lector.readEntries(ok));
      if (tanda.length === 0) break;
      todas.push(...tanda);
    }
    return (await Promise.all(todas.map(archivosDeEntrada))).flat();
  }
  return [];
}

function soloXml(archivos: File[]): File[] {
  return archivos.filter((a) => a.name.toLowerCase().endsWith(".xml"));
}

function NuevaConciliacion({ empresaId }: { empresaId: number }) {
  const [mes, setMes] = useState(mesAnterior()); // "AAAA-MM"
  const [propuesta, setPropuesta] = useState<File | null>(null);
  const [xmls, setXmls] = useState<File[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);

  function agregarXml(nuevos: File[]) {
    // Evita repetir el mismo archivo si se agrega dos veces
    setXmls((actuales) => {
      const nombres = new Set(actuales.map((a) => `${a.name}-${a.size}`));
      return [...actuales, ...soloXml(nuevos).filter((a) => !nombres.has(`${a.name}-${a.size}`))];
    });
  }

  async function soltar(evento: DragEvent<HTMLDivElement>) {
    evento.preventDefault();
    setArrastrando(false);
    const entradas = Array.from(evento.dataTransfer.items)
      .map((item) => item.webkitGetAsEntry?.() as Entrada | null)
      .filter((e): e is Entrada => e !== null);
    agregarXml(entradas.length > 0 ? (await Promise.all(entradas.map(archivosDeEntrada))).flat() : Array.from(evento.dataTransfer.files));
  }

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
      const resultado = await api.conciliar(empresaId, mes.replace("-", ""), propuesta, xmls);
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

      <div
        className={`zona-archivos${arrastrando ? " arrastrando" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={soltar}
      >
        <p><strong>Arrastra aquí la carpeta con los XML</strong> de las compras del cliente</p>
        <p className="tenue">o</p>
        <div className="acciones-centro">
          <label className="boton">
            Elegir archivos XML
            <input type="file" accept=".xml" multiple className="oculto" onChange={(e) => agregarXml(Array.from(e.target.files ?? []))} />
          </label>
          <label className="boton">
            Elegir una carpeta
            <input
              type="file"
              className="oculto"
              // webkitdirectory: permite elegir una carpeta completa (no está en los tipos de React)
              {...({ webkitdirectory: "" } as Record<string, string>)}
              onChange={(e) => agregarXml(Array.from(e.target.files ?? []))}
            />
          </label>
        </div>
        <p className="contador-xml" aria-live="polite">
          {xmls.length === 0 ? "Ningún XML seleccionado" : `${xmls.length} XML listos`}
          {xmls.length > 0 && (
            <button type="button" className="boton-enlace" onClick={() => setXmls([])}>Quitar todos</button>
          )}
        </p>
      </div>

      <MensajeError error={error} />
      <div className="acciones">
        <button type="submit" className="boton boton-principal" disabled={enviando || !propuesta}>
          {enviando ? "Conciliando…" : `Conciliar ${nombrePeriodo(mes.replace("-", ""))}`}
        </button>
      </div>
    </form>
  );
}
