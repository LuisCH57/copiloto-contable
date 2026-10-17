// ==========================================================
// LECTOR DE COMPROBANTES ELECTRÓNICOS (XML UBL 2.1 de SUNAT)
// Las facturas, boletas y notas electrónicas del Perú son archivos XML
// con el estándar internacional UBL 2.1. Aquí extraemos solo lo que
// necesita la conciliación: quién emitió, a quién, serie, número y montos.
// ==========================================================
import { XMLParser } from "fast-xml-parser";
import type { Comprobante, TipoComprobante } from "../tipos.ts";
import { aCentimos, normalizarFecha, normalizarNumero, normalizarSerie } from "../formato.ts";

const parser = new XMLParser({
  ignoreAttributes: false, // necesitamos atributos como currencyID
  removeNSPrefix: true, // "cbc:ID" -> "ID": más fácil de leer
  parseTagValue: false, // todo como texto: "00123" no debe volverse 123
});

// En XML un elemento puede ser texto o un objeto con "#text" y atributos
type Nodo = unknown;

function texto(nodo: Nodo): string | undefined {
  if (typeof nodo === "string") return nodo.trim();
  if (nodo && typeof nodo === "object" && "#text" in nodo) {
    return String((nodo as Record<string, unknown>)["#text"]).trim();
  }
  return undefined;
}

// Si un elemento se repite, el parser devuelve un arreglo; si no, un objeto
function lista(nodo: Nodo): Record<string, unknown>[] {
  if (Array.isArray(nodo)) return nodo as Record<string, unknown>[];
  if (nodo && typeof nodo === "object") return [nodo as Record<string, unknown>];
  return [];
}

function hijo(nodo: Nodo, ...ruta: string[]): Nodo {
  let actual: Nodo = nodo;
  for (const paso of ruta) {
    const primero = lista(actual)[0];
    if (!primero) return undefined;
    actual = primero[paso];
  }
  return actual;
}

const RAICES: Record<string, TipoComprobante | null> = {
  Invoice: null, // el tipo (01 factura o 03 boleta) viene en InvoiceTypeCode
  CreditNote: "07",
  DebitNote: "08",
};

export class XmlNoValidoError extends Error {}

export function leerComprobanteXml(contenido: string, archivo = ""): Comprobante {
  let documento: Record<string, unknown>;
  try {
    documento = parser.parse(contenido) as Record<string, unknown>;
  } catch {
    throw new XmlNoValidoError(`${archivo}: no es un XML válido.`);
  }

  const raiz = Object.keys(RAICES).find((nombre) => nombre in documento);
  if (!raiz) {
    throw new XmlNoValidoError(`${archivo}: no es una factura, boleta ni nota electrónica (UBL).`);
  }
  const doc = documento[raiz] as Record<string, unknown>;

  // Tipo de comprobante
  let tipo: TipoComprobante | null = RAICES[raiz] ?? null;
  if (tipo === null) {
    const codigo = texto(doc.InvoiceTypeCode);
    if (codigo !== "01" && codigo !== "03") {
      throw new XmlNoValidoError(`${archivo}: tipo de comprobante no soportado (${codigo ?? "vacío"}).`);
    }
    tipo = codigo;
  }

  // "F001-00000123" -> serie F001, número 123
  const id = texto(doc.ID) ?? "";
  const [serie, numero] = id.split("-");
  if (!serie || !numero) {
    throw new XmlNoValidoError(`${archivo}: el número de comprobante "${id}" no tiene el formato SERIE-NÚMERO.`);
  }

  const proveedor = hijo(doc, "AccountingSupplierParty", "Party");
  const cliente = hijo(doc, "AccountingCustomerParty", "Party");

  // IGV: el impuesto con código 1000 en la tabla de impuestos (catálogo 05)
  let igv = 0;
  let baseImponible = 0;
  for (const subtotal of lista(hijo(doc, "TaxTotal", "TaxSubtotal"))) {
    const codigoImpuesto = texto(hijo(subtotal, "TaxCategory", "TaxScheme", "ID"));
    if (codigoImpuesto === "1000") {
      igv += aCentimos(texto(subtotal.TaxAmount));
      baseImponible += aCentimos(texto(subtotal.TaxableAmount));
    }
  }

  // Las notas de débito usan RequestedMonetaryTotal en vez de LegalMonetaryTotal
  const totales = doc.LegalMonetaryTotal ?? doc.RequestedMonetaryTotal;

  return {
    origen: "xml",
    rucEmisor: texto(hijo(proveedor, "PartyIdentification", "ID")) ?? "",
    nombreEmisor: texto(hijo(proveedor, "PartyLegalEntity", "RegistrationName")) ?? "",
    rucReceptor: texto(hijo(cliente, "PartyIdentification", "ID")) ?? "",
    tipo,
    serie: normalizarSerie(serie),
    numero: normalizarNumero(numero),
    fechaEmision: normalizarFecha(texto(doc.IssueDate) ?? ""),
    moneda: texto(doc.DocumentCurrencyCode) ?? "PEN",
    baseImponible,
    igv,
    total: aCentimos(texto(hijo(totales, "PayableAmount"))),
    archivo,
  };
}
