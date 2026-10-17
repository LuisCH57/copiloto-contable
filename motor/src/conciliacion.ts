// ==========================================================
// MOTOR DE CONCILIACIÓN
// Compara la propuesta del SIRE (lo que SUNAT sabe) con los XML que el
// cliente entregó (lo que el contador tiene) y explica cada diferencia
// en lenguaje simple, con la acción sugerida.
//
// Es una función PURA: recibe datos y devuelve un resultado, sin leer
// archivos ni base de datos. Así se prueba fácil y se reutiliza igual
// en la línea de comandos, en la API o en una tarea en segundo plano.
// ==========================================================
import type { Comprobante, Estado, Hallazgo, ResultadoConciliacion } from "./tipos.ts";
import { claveComprobante, formatearMonto, periodoDeFecha } from "./formato.ts";
import { esRucValido } from "./ruc.ts";

// Diferencias de hasta 1 céntimo se consideran redondeo, no error
const TOLERANCIA_CENTIMOS = 1;

const ESTADOS: Estado[] = [
  "coincide",
  "diferencia_monto",
  "falta_xml",
  "falta_en_propuesta",
  "otro_periodo",
  "otro_receptor",
  "duplicado",
  "ruc_invalido",
];

const NOMBRE_TIPO: Record<string, string> = {
  "01": "Factura",
  "03": "Boleta",
  "07": "Nota de crédito",
  "08": "Nota de débito",
};

export function describir(c: Comprobante): string {
  return `${NOMBRE_TIPO[c.tipo] ?? c.tipo} ${c.serie}-${c.numero} de ${c.nombreEmisor || c.rucEmisor}`;
}

// "2026-08-29" -> "29/08/2026" · "202609" -> "09/2026"
function fecha(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
function mes(periodo: string): string {
  return `${periodo.slice(4, 6)}/${periodo.slice(0, 4)}`;
}

function soles(centimos: number, moneda: string): string {
  return `${moneda === "PEN" ? "S/" : moneda} ${formatearMonto(centimos)}`;
}

export interface OpcionesConciliacion {
  rucCliente: string; // RUC de la empresa cuyo registro de compras se concilia
  periodo: string; // "202609"
}

export function conciliar(
  propuesta: Comprobante[],
  xmls: Comprobante[],
  { rucCliente, periodo }: OpcionesConciliacion
): ResultadoConciliacion {
  const hallazgos: Hallazgo[] = [];

  // 1. Revisar los XML uno por uno: duplicados, receptor y periodo
  const xmlPorClave = new Map<string, Comprobante>();
  const descartados = new Map<string, Comprobante>(); // de otro RUC u otro periodo (para detectar sus copias)
  for (const xml of xmls) {
    const clave = claveComprobante(xml);

    const primero = xmlPorClave.get(clave) ?? descartados.get(clave);
    if (primero) {
      hallazgos.push({
        estado: "duplicado",
        clave,
        comprobante: xml,
        explicacion: `${describir(xml)} llegó más de una vez (archivos ${primero.archivo} y ${xml.archivo}).`,
        accion: "Ignorar la copia. No registrarlo dos veces.",
      });
      continue;
    }
    if (xml.rucReceptor && xml.rucReceptor !== rucCliente) {
      hallazgos.push({
        estado: "otro_receptor",
        clave,
        comprobante: xml,
        explicacion: `${describir(xml)} está emitida al RUC ${xml.rucReceptor}, no al cliente (${rucCliente}).`,
        accion: "No es una compra del cliente: no usar su IGV como crédito fiscal. Consultar al cliente.",
      });
      descartados.set(clave, xml);
      continue;
    }
    if (periodoDeFecha(xml.fechaEmision) !== periodo) {
      hallazgos.push({
        estado: "otro_periodo",
        clave,
        comprobante: xml,
        explicacion: `${describir(xml)} es del ${fecha(xml.fechaEmision)}, fuera del periodo ${mes(periodo)}.`,
        accion: "Revisar si corresponde a otro mes o si se anota fuera de su periodo según las reglas vigentes.",
      });
      descartados.set(clave, xml);
      continue;
    }
    xmlPorClave.set(clave, xml);
  }

  // 2. Recorrer la propuesta de SUNAT y buscar su XML
  const clavesPropuesta = new Set<string>();
  for (const sunat of propuesta) {
    const clave = claveComprobante(sunat);
    clavesPropuesta.add(clave);
    const xml = xmlPorClave.get(clave);

    if (!esRucValido(sunat.rucEmisor)) {
      hallazgos.push({
        estado: "ruc_invalido",
        clave,
        comprobante: sunat,
        explicacion: `El RUC del proveedor ${sunat.rucEmisor} no pasa la validación del dígito verificador.`,
        accion: "Verificar el RUC en la consulta RUC de SUNAT antes de registrar.",
      });
    }

    if (!xml) {
      hallazgos.push({
        estado: "falta_xml",
        clave,
        comprobante: sunat,
        explicacion: `SUNAT registra ${describir(sunat)} por ${soles(sunat.total, sunat.moneda)}, pero el cliente no entregó su XML.`,
        accion: "Pedir el comprobante al cliente o al proveedor. Si no es una compra real, confirmar con el cliente antes de excluirlo.",
      });
      continue;
    }

    const diferencias = (["baseImponible", "igv", "total"] as const)
      .filter((campo) => Math.abs(sunat[campo] - xml[campo]) > TOLERANCIA_CENTIMOS)
      .map((campo) => ({ campo, propuesta: sunat[campo], xml: xml[campo] }));

    if (diferencias.length > 0 || sunat.moneda !== xml.moneda) {
      const detalle = diferencias
        .map((d) => `${d.campo === "baseImponible" ? "base imponible" : d.campo}: SUNAT ${soles(d.propuesta, sunat.moneda)} vs. XML ${soles(d.xml, xml.moneda)}`)
        .join("; ");
      hallazgos.push({
        estado: "diferencia_monto",
        clave,
        comprobante: sunat,
        diferencias,
        explicacion:
          `${describir(sunat)} no coincide` +
          (sunat.moneda !== xml.moneda ? ` (moneda SUNAT ${sunat.moneda}, XML ${xml.moneda})` : "") +
          (detalle ? `: ${detalle}.` : "."),
        accion: "Revisar el XML original. Si el proveedor informó mal a SUNAT, pedirle una nota de crédito o débito.",
      });
    } else {
      hallazgos.push({
        estado: "coincide",
        clave,
        comprobante: sunat,
        explicacion: `${describir(sunat)} coincide con su XML.`,
        accion: "Ninguna.",
      });
    }
  }

  // 3. XML del periodo que SUNAT no propone
  for (const [clave, xml] of xmlPorClave) {
    if (clavesPropuesta.has(clave)) continue;
    hallazgos.push({
      estado: "falta_en_propuesta",
      clave,
      comprobante: xml,
      explicacion: `${describir(xml)} por ${soles(xml.total, xml.moneda)} está en los XML del cliente, pero no en la propuesta de SUNAT.`,
      accion: "Puede que el proveedor lo informó tarde. Si es una compra válida del periodo, agregarlo a la propuesta antes de generar el registro.",
    });
  }

  // 4. Resumen
  const porEstado = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<Estado, number>;
  for (const h of hallazgos) porEstado[h.estado]++;

  const sumarIgv = (estado: Estado) =>
    hallazgos
      .filter((h) => h.estado === estado && h.comprobante.moneda === "PEN")
      .reduce((total, h) => total + h.comprobante.igv, 0);

  // Orden: primero lo que requiere acción, al final lo que coincide
  const prioridad = (e: Estado) => (e === "coincide" ? 1 : 0);
  hallazgos.sort((a, b) => prioridad(a.estado) - prioridad(b.estado) || a.clave.localeCompare(b.clave));

  return {
    rucCliente,
    periodo,
    hallazgos,
    resumen: {
      totalPropuesta: propuesta.length,
      totalXml: xmls.length,
      porEstado,
      igvFueraDePropuesta: sumarIgv("falta_en_propuesta"),
      igvSinRespaldo: sumarIgv("falta_xml"),
    },
  };
}
