// ==========================================================
// REPORTES del resultado: CSV para Excel y resumen en texto.
// ==========================================================
import type { Estado, ResultadoConciliacion } from "./tipos.ts";
import { formatearMonto } from "./formato.ts";

export const NOMBRE_ESTADO: Record<Estado, string> = {
  falta_xml: "Falta el XML del cliente",
  falta_en_propuesta: "No está en la propuesta de SUNAT",
  diferencia_monto: "Montos distintos",
  otro_receptor: "Emitido a otro RUC",
  otro_periodo: "De otro periodo",
  duplicado: "Duplicado",
  ruc_invalido: "RUC del proveedor no válido",
  coincide: "Coincide",
};

// Excel en español usa ";" como separador. Las comillas protegen textos con ";"
function celda(valor: string | number): string {
  const texto = String(valor);
  return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function reporteCsv(resultado: ResultadoConciliacion): string {
  const encabezado = [
    "Estado", "RUC proveedor", "Proveedor", "Tipo", "Serie", "Número", "Fecha",
    "Moneda", "Base imponible", "IGV", "Total", "Explicación", "Acción sugerida",
  ];
  const filas = resultado.hallazgos.map((h) => {
    const c = h.comprobante;
    return [
      NOMBRE_ESTADO[h.estado], c.rucEmisor, c.nombreEmisor, c.tipo, c.serie, c.numero, c.fechaEmision,
      c.moneda, formatearMonto(c.baseImponible), formatearMonto(c.igv), formatearMonto(c.total),
      h.explicacion, h.accion,
    ].map(celda).join(";");
  });
  // "﻿" (BOM) hace que Excel muestre bien las tildes
  return "﻿" + [encabezado.join(";"), ...filas].join("\r\n") + "\r\n";
}

export function resumenTexto(resultado: ResultadoConciliacion): string {
  const { resumen } = resultado;
  const lineas = [
    `Conciliación del registro de compras · RUC ${resultado.rucCliente} · periodo ${resultado.periodo}`,
    `Comprobantes en la propuesta de SUNAT: ${resumen.totalPropuesta} · XML entregados: ${resumen.totalXml}`,
    "",
  ];
  for (const [estado, cantidad] of Object.entries(resumen.porEstado) as [Estado, number][]) {
    if (cantidad > 0) lineas.push(`  ${NOMBRE_ESTADO[estado].padEnd(36)} ${String(cantidad).padStart(4)}`);
  }
  lineas.push(
    "",
    `IGV de compras que SUNAT no propone (crédito fiscal en riesgo): S/ ${formatearMonto(resumen.igvFueraDePropuesta)}`,
    `IGV propuesto por SUNAT sin XML de respaldo:                  S/ ${formatearMonto(resumen.igvSinRespaldo)}`
  );
  return lineas.join("\n");
}
