// Formatos de texto para los mensajes de la API
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// "202609" -> "septiembre 2026"
export function nombreMes(periodo: string): string {
  return `${MESES[Number(periodo.slice(4, 6)) - 1] ?? "?"} ${periodo.slice(0, 4)}`;
}

export const PATRON_PERIODO = /^20\d{2}(0[1-9]|1[0-2])$/;
