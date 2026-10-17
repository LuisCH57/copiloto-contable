// ==========================================================
// Conversión de montos, fechas y números de comprobante.
// Ambas fuentes (SIRE y XML) escriben los datos distinto;
// aquí se llevan a una sola forma para poder compararlos.
// ==========================================================

// "1,180.50" o "1180.5" -> 118050 céntimos
export function aCentimos(texto: string | number | undefined): number {
  if (texto === undefined || texto === "") return 0;
  const limpio = String(texto).replace(/,/g, "").trim();
  const valor = Number(limpio);
  if (!Number.isFinite(valor)) {
    throw new Error(`Monto no válido: "${texto}"`);
  }
  return Math.round(valor * 100);
}

// 118050 -> "1,180.50"
export function formatearMonto(centimos: number): string {
  const signo = centimos < 0 ? "-" : "";
  const absoluto = Math.abs(centimos);
  const enteros = Math.floor(absoluto / 100).toLocaleString("en-US");
  const decimales = String(absoluto % 100).padStart(2, "0");
  return `${signo}${enteros}.${decimales}`;
}

// "15/09/2026" o "2026-09-15" -> "2026-09-15"
export function normalizarFecha(texto: string): string {
  const limpio = texto.trim();
  const dma = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(limpio);
  if (dma) return `${dma[3]}-${dma[2]}-${dma[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(limpio)) return limpio.slice(0, 10);
  throw new Error(`Fecha no válida: "${texto}"`);
}

// "00000123" -> "123" (SUNAT y los XML a veces escriben ceros a la izquierda)
export function normalizarNumero(numero: string): string {
  const sinCeros = numero.trim().replace(/^0+/, "");
  return sinCeros === "" ? "0" : sinCeros;
}

// "f001" -> "F001"
export function normalizarSerie(serie: string): string {
  return serie.trim().toUpperCase();
}

// Clave única de un comprobante: proveedor + tipo + serie + número
export function claveComprobante(c: { rucEmisor: string; tipo: string; serie: string; numero: string }): string {
  return `${c.rucEmisor}-${c.tipo}-${normalizarSerie(c.serie)}-${normalizarNumero(c.numero)}`;
}

// "2026-09-15" -> "202609"
export function periodoDeFecha(fecha: string): string {
  return fecha.slice(0, 4) + fecha.slice(5, 7);
}
