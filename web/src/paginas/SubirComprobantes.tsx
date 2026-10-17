// ==========================================================
// Página PÚBLICA del cliente: abre el enlace que le envió su contador
// y sube los XML de sus compras. Sin cuenta ni contraseña.
// Pensada para el celular y para alguien que no es contador.
// ==========================================================
import { useState } from "react";
import { apiCliente } from "../api.ts";
import { Cargando, MensajeError } from "../components/Comunes.tsx";
import ZonaXml from "../components/ZonaXml.tsx";
import type { DocumentoCliente, ResultadoArchivo } from "../types.ts";
import { fechaCorta, NOMBRE_TIPO, nombrePeriodo, soles } from "../utils/formato.ts";
import { useFetch } from "../utils/useFetch.ts";

const POR_TANDA = 200; // el mismo límite por envío que la API

export default function SubirComprobantes({ token }: { token: string }) {
  const { data, error, loading } = useFetch(() => apiCliente.solicitud(token), `subir-${token}`);
  const [xmls, setXmls] = useState<File[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoCliente[] | null>(null);
  const [resultados, setResultados] = useState<ResultadoArchivo[]>([]);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
  const [errorSubir, setErrorSubir] = useState<unknown>(null);

  async function subir() {
    setErrorSubir(null);
    setResultados([]);
    const todos: ResultadoArchivo[] = [];
    try {
      // Por tandas: así 1 000 XML no viajan en una sola petición gigante
      for (let i = 0; i < xmls.length; i += POR_TANDA) {
        setProgreso({ hechos: i, total: xmls.length });
        const respuesta = await apiCliente.subir(token, xmls.slice(i, i + POR_TANDA));
        todos.push(...respuesta.resultados);
        setDocumentos(respuesta.documentos);
      }
      setXmls([]);
    } catch (err) {
      setErrorSubir(err);
    } finally {
      setResultados(todos);
      setProgreso(null);
    }
  }

  const recibidos = documentos ?? data?.documentos ?? [];
  const cuenta = (estado: ResultadoArchivo["estado"]) => resultados.filter((r) => r.estado === estado).length;
  const observados = resultados.filter((r) => r.estado !== "recibido" || r.mensaje !== "Recibido.");

  return (
    <div className="pagina-cliente">
      <header className="cabecera-cliente">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="28" height="28" />
        <span>{data?.estudio ?? "Copiloto contable"}</span>
      </header>

      <main className="contenido contenido-cliente">
        {loading && !data && <Cargando />}
        {error ? (
          <div className="tarjeta">
            <h1>No se puede usar este enlace</h1>
            <MensajeError error={error} />
            <p className="tenue">Escríbele a tu contador para que te envíe un enlace nuevo.</p>
          </div>
        ) : null}

        {data && (
          <>
            <h1>Compras de {nombrePeriodo(data.periodo)}</h1>
            <p className="tenue">
              <strong className="texto-normal">{data.razonSocial}</strong> · RUC <span className="mono">{data.ruc}</span>
            </p>

            <section className="tarjeta pasos-cliente" aria-labelledby="titulo-como">
              <h2 id="titulo-como" className="titulo-tarjeta">Cómo enviar tus comprobantes</h2>
              <ol>
                <li>Busca los <strong>XML de tus facturas de compra</strong> de {nombrePeriodo(data.periodo).toLowerCase()}. Suelen llegar adjuntos al correo de cada proveedor, a veces dentro de un .zip.</li>
                <li>Súbelos aquí. Puedes subir los .zip tal cual o una carpeta completa.</li>
                <li>Revisa el resultado: te diremos al instante si alguno no corresponde.</li>
              </ol>
              <p className="tenue">Los PDF no sirven: tu contador necesita el archivo .xml.</p>
            </section>

            <section className="tarjeta formulario" aria-label="Subir XML">
              <ZonaXml
                archivos={xmls}
                alCambiar={setXmls}
                deshabilitada={progreso !== null}
                titulo={<><strong>Arrastra aquí tus XML o .zip</strong> o elígelos desde tu equipo</>}
              />
              <MensajeError error={errorSubir} />
              <div className="acciones">
                <button type="button" className="boton boton-principal" disabled={xmls.length === 0 || progreso !== null} onClick={subir}>
                  {progreso
                    ? `Enviando… ${progreso.hechos} de ${progreso.total}`
                    : `Enviar ${xmls.length > 0 ? xmls.length : ""} XML a mi contador`}
                </button>
              </div>
            </section>

            {resultados.length > 0 && (
              <section className="tarjeta" aria-live="polite" aria-labelledby="titulo-resultado">
                <h2 id="titulo-resultado" className="titulo-tarjeta">Resultado del envío</h2>
                <p>
                  <span className="texto-ok">✓ {cuenta("recibido")} recibidos</span>
                  {cuenta("repetido") > 0 && <> · {cuenta("repetido")} ya los habías enviado</>}
                  {cuenta("rechazado") > 0 && <span className="texto-error"> · ✕ {cuenta("rechazado")} no se aceptaron</span>}
                </p>
                {observados.length > 0 && (
                  <ul className="lista-resultados">
                    {observados.map((r, i) => (
                      <li key={`${r.archivo}-${i}`} className={`resultado-${r.estado}`}>
                        <span className="mono">{r.archivo}</span>
                        <span>{r.mensaje}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <h2 className="subtitulo">Lo que ya recibió tu contador ({recibidos.length})</h2>
            {recibidos.length === 0 ? (
              <div className="vacio"><p className="tenue">Todavía no has enviado comprobantes para este mes.</p></div>
            ) : (
              <ul className="lista-recibidos">
                {recibidos.map((d) => (
                  <li key={`${d.rucEmisor}-${d.tipo}-${d.serie}-${d.numero}`}>
                    <span>
                      {NOMBRE_TIPO[d.tipo] ?? d.tipo} <span className="mono">{d.serie}-{d.numero}</span>
                      <span className="sub tenue">{d.nombreEmisor} · {fechaCorta(d.fechaEmision)}</span>
                    </span>
                    <span className="num">{soles(d.total, d.moneda)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="tenue nota-pequena">
              Este enlace es solo para {data.razonSocial} y vence el {fechaCorta(data.venceEn)}. Tus archivos solo los ve {data.estudio}.{" "}
              <a href="https://github.com/LuisCH57/copiloto-contable/blob/main/docs/privacidad.md" target="_blank" rel="noopener noreferrer">
                Cómo cuidamos tus datos
              </a>
            </p>
          </>
        )}
      </main>
    </div>
  );
}
