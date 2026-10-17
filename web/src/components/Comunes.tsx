// Piezas pequeñas que usan varias pantallas
import { useEffect, useState } from "react";
import { NOMBRE_ESTADO } from "motor-conciliacion/reporte";
import { ApiError } from "../api.ts";
import type { Estado } from "../types.ts";

export function MensajeError({ error }: { error: unknown }) {
  if (!error) return null;
  const mensaje = error instanceof Error ? error.message : "Ocurrió un error inesperado.";
  const detalles = error instanceof ApiError ? error.detalles : [];
  return (
    <div className="alerta alerta-error" role="alert">
      <p>{mensaje}</p>
      {detalles.length > 0 && (
        <ul>
          {detalles.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Cada estado tiene un "tono" (color) y un ícono: nunca se distingue solo por color
const ESTILO_ESTADO: Record<Estado, { tono: "ok" | "aviso" | "grave" | "neutro"; icono: string }> = {
  coincide: { tono: "ok", icono: "✓" },
  falta_xml: { tono: "aviso", icono: "!" },
  otro_periodo: { tono: "aviso", icono: "↺" },
  falta_en_propuesta: { tono: "grave", icono: "▲" },
  diferencia_monto: { tono: "grave", icono: "≠" },
  otro_receptor: { tono: "grave", icono: "✕" },
  ruc_invalido: { tono: "grave", icono: "✕" },
  duplicado: { tono: "neutro", icono: "⧉" },
};

export function EtiquetaEstado({ estado }: { estado: Estado }) {
  const { tono, icono } = ESTILO_ESTADO[estado];
  return (
    <span className={`etiqueta etiqueta-${tono}`}>
      <span aria-hidden="true">{icono}</span> {NOMBRE_ESTADO[estado]}
    </span>
  );
}

// Si tarda, avisa: en el plan gratuito de Render el servidor "se duerme" cuando
// nadie lo usa y la primera petición puede tardar cerca de un minuto.
export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  const [lento, setLento] = useState(false);
  useEffect(() => {
    const temporizador = setTimeout(() => setLento(true), 5000);
    return () => clearTimeout(temporizador);
  }, []);
  return (
    <p className="tenue" role="status">
      {texto}
      {lento && <span className="sub">El servidor se está activando; puede tardar hasta un minuto. No cierres la página.</span>}
    </p>
  );
}
