// ==========================================================
// "Pedir los XML al cliente": crea un enlace por mes, lo envía por
// WhatsApp o correo, muestra lo recibido y a quién falta recordar.
// ==========================================================
import { useState, type FormEvent } from "react";
import { api } from "../api.ts";
import type { Empresa, Sesion, Solicitud } from "../types.ts";
import { fechaCorta, fechaHora, mesAnterior, NOMBRE_TIPO, nombrePeriodo, soles } from "../utils/formato.ts";
import { enlaceCliente, enlaceCorreo, enlaceWhatsapp, haceCuanto, mensajeParaCliente } from "../utils/mensajes.ts";
import { useFetch } from "../utils/useFetch.ts";
import { Cargando, MensajeError } from "./Comunes.tsx";

interface Props {
  empresa: Empresa;
  sesion: Sesion;
  solicitudes: Solicitud[];
  error: unknown;
  alCambiarSolicitudes: () => void;
  alCambiarEmpresa: () => void;
}

export default function PedirComprobantes({ empresa, sesion, solicitudes, error, alCambiarSolicitudes, alCambiarEmpresa }: Props) {
  const [mes, setMes] = useState(mesAnterior());
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState<unknown>(null);

  async function crear(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setCreando(true);
    setErrorCrear(null);
    try {
      await api.crearSolicitud(empresa.id, mes.replace("-", ""));
      alCambiarSolicitudes();
    } catch (err) {
      setErrorCrear(err);
    } finally {
      setCreando(false);
    }
  }

  return (
    <section className="tarjeta" aria-labelledby="titulo-pedir">
      <h2 id="titulo-pedir" className="titulo-tarjeta">Pedir los XML al cliente</h2>
      <p className="tenue">
        Envíale un enlace por WhatsApp o correo. Sube sus XML sin crear cuenta, ve al instante si alguno está mal
        y tú los usas al conciliar.
      </p>

      <Contacto empresa={empresa} alGuardar={alCambiarEmpresa} />

      <form className="fila-crear" onSubmit={crear}>
        <label className="campo">
          <span>Mes que le pides</span>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} required min="2020-01" />
        </label>
        <button type="submit" className="boton boton-principal" disabled={creando}>
          {creando ? "Creando…" : "Crear enlace"}
        </button>
      </form>
      <MensajeError error={errorCrear ?? error} />

      {solicitudes.length > 0 && (
        <ul className="lista-solicitudes">
          {solicitudes.map((s) => (
            <FilaSolicitud key={s.id} solicitud={s} empresa={empresa} sesion={sesion} alCambiar={alCambiarSolicitudes} />
          ))}
        </ul>
      )}
    </section>
  );
}

// ----------------------------------------------------------
// Contacto del cliente (a quién se le envía el enlace)
// ----------------------------------------------------------
function Contacto({ empresa, alGuardar }: { empresa: Empresa; alGuardar: () => void }) {
  const [contacto, setContacto] = useState(empresa.contacto ?? "");
  const [celular, setCelular] = useState(empresa.celular ?? "");
  const [correo, setCorreo] = useState(empresa.correo ?? "");
  const sinDatos = !contacto && !celular && !correo;
  const [editando, setEditando] = useState(sinDatos);
  const [error, setError] = useState<unknown>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await api.guardarContacto(empresa.id, { contacto, celular, correo });
      setEditando(false);
      alGuardar();
    } catch (err) {
      setError(err);
    } finally {
      setGuardando(false);
    }
  }

  if (!editando) {
    return (
      <p className="contacto">
        <span className="tenue">Contacto:</span>{" "}
        {/* Se muestran los valores guardados en este formulario (no hay que esperar a recargar la empresa) */}
        {[contacto, celular && `cel. ${celular.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}`, correo]
          .filter(Boolean)
          .join(" · ")}{" "}
        <button type="button" className="boton-enlace" onClick={() => setEditando(true)}>Editar</button>
      </p>
    );
  }

  return (
    <form className="formulario contacto-formulario" onSubmit={guardar}>
      <div className="rejilla-campos">
        <label className="campo">
          <span>Nombre del contacto</span>
          <input value={contacto} onChange={(e) => setContacto(e.target.value)} maxLength={100} placeholder="Ej.: Rosa" />
        </label>
        <label className="campo">
          <span>Celular (WhatsApp)</span>
          <input
            inputMode="numeric"
            value={celular}
            onChange={(e) => setCelular(e.target.value.replace(/\D/g, "").slice(0, 9))}
            pattern="9[0-9]{8}"
            title="9 dígitos, empieza con 9"
            placeholder="987654321"
            className="mono"
          />
        </label>
        <label className="campo">
          <span>Correo</span>
          <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} maxLength={200} />
        </label>
      </div>
      <MensajeError error={error} />
      <div className="acciones">
        {!sinDatos && <button type="button" className="boton" onClick={() => setEditando(false)}>Cancelar</button>}
        <button type="submit" className="boton" disabled={guardando}>{guardando ? "Guardando…" : "Guardar contacto"}</button>
      </div>
    </form>
  );
}

// ----------------------------------------------------------
// Un enlace (un mes): estado, envíos y lo recibido
// ----------------------------------------------------------
function estadoDe(s: Solicitud): { texto: string; tono: "ok" | "aviso" | "neutro" } {
  if (s.cerrada) return { texto: "Cerrado", tono: "neutro" };
  if (!s.vigente) return { texto: "Vencido", tono: "neutro" };
  if (s.documentos > 0) return { texto: `${s.documentos} XML recibidos`, tono: "ok" };
  return { texto: "Esperando al cliente", tono: "aviso" };
}

function FilaSolicitud({ solicitud: s, empresa, sesion, alCambiar }: {
  solicitud: Solicitud;
  empresa: Empresa;
  sesion: Sesion;
  alCambiar: () => void;
}) {
  const [verDocumentos, setVerDocumentos] = useState(false);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const estado = estadoDe(s);
  const mensaje = mensajeParaCliente(empresa, s, { nombre: sesion.usuario.nombre, estudio: sesion.estudio.nombre });

  async function hacer(accion: () => Promise<unknown>) {
    setError(null);
    try {
      await accion();
      alCambiar();
    } catch (err) {
      setError(err);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
      await hacer(() => api.anotarEnvio(s.id, "copiado"));
    } catch {
      setError(new Error("No se pudo copiar. Selecciona el texto del mensaje y cópialo a mano."));
    }
  }

  return (
    <li className="solicitud">
      <div className="solicitud-cabecera">
        <strong>{nombrePeriodo(s.periodo)}</strong>
        <span className={`etiqueta etiqueta-${estado.tono}`}>{estado.texto}</span>
      </div>

      <p className="solicitud-datos tenue">
        {s.recordatorios === 0
          ? "Aún no lo envías."
          : `Enviado ${s.recordatorios} ${s.recordatorios === 1 ? "vez" : "veces"}, la última ${haceCuanto(s.ultimoRecordatorio!)}.`}
        {s.ultimoDocumento && ` Último XML recibido ${haceCuanto(s.ultimoDocumento)}.`}
        {s.vigente && ` El enlace vence el ${fechaCorta(s.venceEn)}.`}
      </p>

      {s.vigente && (
        <div className="solicitud-envio">
          <a
            className="boton boton-pequeno boton-whatsapp"
            href={enlaceWhatsapp(empresa.celular, mensaje)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void hacer(() => api.anotarEnvio(s.id, "whatsapp"))}
          >
            {s.recordatorios === 0 ? "Enviar por WhatsApp" : "Recordar por WhatsApp"}
          </a>
          <a
            className="boton boton-pequeno"
            href={enlaceCorreo(empresa.correo, s, empresa, mensaje)}
            onClick={() => void hacer(() => api.anotarEnvio(s.id, "correo"))}
          >
            Por correo
          </a>
          <button type="button" className="boton boton-pequeno" onClick={copiar}>
            {copiado ? "Copiado ✓" : "Copiar mensaje"}
          </button>
          {/* Para revisar lo que verá el cliente (no cuenta como envío) */}
          <a className="boton boton-pequeno" href={enlaceCliente(s.token)} target="_blank" rel="noopener noreferrer">
            Ver como el cliente ↗
          </a>
        </div>
      )}

      <div className="solicitud-acciones">
        {s.documentos > 0 && (
          <button type="button" className="boton-enlace" aria-expanded={verDocumentos} onClick={() => setVerDocumentos(!verDocumentos)}>
            {verDocumentos ? "Ocultar los XML" : "Ver los XML recibidos"}
          </button>
        )}
        <button type="button" className="boton-enlace" onClick={() => void hacer(() => api.renovarSolicitud(s.id))}>
          Generar enlace nuevo
        </button>
        {!s.cerrada ? (
          <button type="button" className="boton-enlace" onClick={() => void hacer(() => api.cerrarSolicitud(s.id, true))}>
            Cerrar enlace
          </button>
        ) : (
          <button type="button" className="boton-enlace" onClick={() => void hacer(() => api.cerrarSolicitud(s.id, false))}>
            Reabrir
          </button>
        )}
        {confirmarBorrar ? (
          <span className="confirmar">
            ¿Borrar el enlace y los {s.documentos} XML?{" "}
            <button type="button" className="boton-enlace texto-error" onClick={() => void hacer(() => api.borrarSolicitud(s.id))}>Sí, borrar</button>{" "}
            <button type="button" className="boton-enlace" onClick={() => setConfirmarBorrar(false)}>No</button>
          </span>
        ) : (
          <button type="button" className="boton-enlace" onClick={() => setConfirmarBorrar(true)}>Borrar</button>
        )}
      </div>
      <p className="tenue nota-pequena">«Generar enlace nuevo» anula el anterior (útil si lo enviaste a la persona equivocada). Los XML recibidos se conservan.</p>

      <MensajeError error={error} />
      {verDocumentos && <DocumentosRecibidos solicitudId={s.id} total={s.documentos} />}
    </li>
  );
}

function DocumentosRecibidos({ solicitudId, total }: { solicitudId: number; total: number }) {
  const { data, error, loading } = useFetch(() => api.documentosDeSolicitud(solicitudId), `documentos-${solicitudId}-${total}`);
  if (loading && !data) return <Cargando />;
  return (
    <>
      <MensajeError error={error} />
      <div className="tabla-desplazable">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Comprobante</th>
              <th scope="col">Proveedor</th>
              <th scope="col" className="num">Total</th>
              <th scope="col">Subido</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((d) => (
              <tr key={d.id}>
                <td>
                  {NOMBRE_TIPO[d.tipo] ?? d.tipo} <span className="mono">{d.serie}-{d.numero}</span>
                  <span className="sub tenue">{fechaCorta(d.fechaEmision)}</span>
                </td>
                <td>{d.nombreEmisor}<span className="sub tenue mono">{d.rucEmisor}</span></td>
                <td className="num">{soles(d.total, d.moneda)}</td>
                <td>{fechaHora(d.subidoEn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
