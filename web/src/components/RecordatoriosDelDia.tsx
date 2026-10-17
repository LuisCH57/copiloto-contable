// ==========================================================
// "Para recordar hoy": los clientes que todavía no envían sus XML.
// Aparecen si nunca se les envió el enlace o si el último envío fue
// hace 3 días o más. Un clic abre WhatsApp con el mensaje listo.
//
// ¿Por qué no se envía solo? Enviar WhatsApp automático exige la API de
// WhatsApp Business (verificación de Meta y costo por mensaje). Así el
// mensaje sale del número del contador, que el cliente ya conoce.
// ==========================================================
import { api } from "../api.ts";
import type { Sesion } from "../types.ts";
import { nombrePeriodo } from "../utils/formato.ts";
import { enlaceWhatsapp, haceCuanto, mensajeParaCliente } from "../utils/mensajes.ts";
import { enlace } from "../utils/ruta.ts";
import { useFetch } from "../utils/useFetch.ts";

export default function RecordatoriosDelDia({ sesion }: { sesion: Sesion }) {
  const { data, reload } = useFetch(() => api.recordatorios(), "recordatorios");
  if (!data || data.length === 0) return null;

  async function anotar(id: number) {
    try {
      await api.anotarEnvio(id, "whatsapp");
    } finally {
      reload();
    }
  }

  return (
    <section className="tarjeta recordatorios" aria-labelledby="titulo-recordatorios">
      <h2 id="titulo-recordatorios" className="titulo-tarjeta">
        Para recordar hoy <span className="contador">{data.length}</span>
      </h2>
      <p className="tenue">Clientes que aún no te envían sus XML.</p>
      <ul className="lista-recordatorios">
        {data.map(({ solicitud: s, empresa: e }) => {
          const mensaje = mensajeParaCliente(e, s, { nombre: sesion.usuario.nombre, estudio: sesion.estudio.nombre });
          return (
            <li key={s.id}>
              <span>
                <a href={enlace({ pagina: "empresa", id: e.id })}>{e.razonSocial}</a>
                <span className="sub tenue">
                  {nombrePeriodo(s.periodo)} ·{" "}
                  {s.ultimoRecordatorio ? `último envío ${haceCuanto(s.ultimoRecordatorio)}` : "aún no le envías el enlace"}
                </span>
              </span>
              <a
                className="boton boton-pequeno boton-whatsapp"
                href={enlaceWhatsapp(e.celular, mensaje)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => void anotar(s.id)}
              >
                {s.recordatorios === 0 ? "Enviar por WhatsApp" : "Recordar por WhatsApp"}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
