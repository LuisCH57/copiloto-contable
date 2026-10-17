// Formatos para mostrar montos, periodos y fechas en español
import { formatearMonto } from "motor-conciliacion/formato";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// 7560 céntimos -> "S/ 75.60"
export function soles(centimos: number, moneda = "PEN"): string {
  const simbolo = moneda === "PEN" ? "S/" : moneda;
  return `${simbolo} ${formatearMonto(centimos)}`;
}

// "202609" -> "Septiembre 2026"
export function nombrePeriodo(periodo: string): string {
  const mes = MESES[Number(periodo.slice(4, 6)) - 1] ?? "";
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${periodo.slice(0, 4)}`;
}

// "2026-09-15" -> "15/09/2026"
export function fechaCorta(fecha: string): string {
  const [anio, mes, dia] = fecha.slice(0, 10).split("-");
  return `${dia}/${mes}/${anio}`;
}

// Marca de tiempo ISO -> "17/10/2026 10:15" en hora de Lima
export function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// El mes anterior en hora de Lima, como "AAAA-MM" (lo que se suele conciliar)
export function mesAnterior(): string {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }); // AAAA-MM-DD
  const [anio, mes] = hoy.split("-").map(Number) as [number, number];
  const fecha = new Date(Date.UTC(anio, mes - 2, 1));
  return fecha.toISOString().slice(0, 7);
}

export const NOMBRE_TIPO: Record<string, string> = {
  "01": "Factura",
  "03": "Boleta",
  "07": "Nota de crédito",
  "08": "Nota de débito",
};
