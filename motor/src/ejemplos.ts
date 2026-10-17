// ==========================================================
// DATOS DE EJEMPLO (ficticios) para probar y para hacer demostraciones.
// Genera XML UBL 2.1 con la estructura de SUNAT y una propuesta del SIRE.
// Los RUC son inventados pero con dígito verificador válido.
// NUNCA usar datos reales de clientes en el repositorio.
// ==========================================================
import { completarRuc } from "./ruc.ts";

export const RUC_CLIENTE = completarRuc("2060000001"); // "Bodega Doña Rosa S.A.C." (ficticia)

export const PROVEEDORES = [
  { ruc: completarRuc("2050000001"), nombre: "DISTRIBUIDORA ANDINA S.A.C." },
  { ruc: completarRuc("2050000002"), nombre: "LÁCTEOS DEL SUR S.A." },
  { ruc: completarRuc("2050000003"), nombre: "TRANSPORTES RÁPIDOS E.I.R.L." },
  { ruc: completarRuc("1040000004"), nombre: "PÉREZ QUISPE JUAN" },
];

export interface DatosXml {
  tipo: "01" | "03" | "07" | "08";
  serie: string;
  numero: number;
  fecha: string; // AAAA-MM-DD
  rucEmisor: string;
  nombreEmisor: string;
  rucReceptor: string;
  base: number; // en soles
  moneda?: string;
}

const RAIZ = { "01": "Invoice", "03": "Invoice", "07": "CreditNote", "08": "DebitNote" } as const;

export function xmlUbl(d: DatosXml): string {
  const raiz = RAIZ[d.tipo];
  const moneda = d.moneda ?? "PEN";
  const igv = Math.round(d.base * 0.18 * 100) / 100;
  const total = Math.round((d.base + igv) * 100) / 100;
  const totales = d.tipo === "08" ? "RequestedMonetaryTotal" : "LegalMonetaryTotal";
  const tipoDoc = raiz === "Invoice" ? `\n  <cbc:InvoiceTypeCode listID="0101">${d.tipo}</cbc:InvoiceTypeCode>` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<${raiz} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${raiz}-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:ID>${d.serie}-${String(d.numero).padStart(8, "0")}</cbc:ID>
  <cbc:IssueDate>${d.fecha}</cbc:IssueDate>${tipoDoc}
  <cbc:DocumentCurrencyCode>${moneda}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="6">${d.rucEmisor}</cbc:ID></cac:PartyIdentification>
    <cac:PartyLegalEntity><cbc:RegistrationName>${d.nombreEmisor}</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="6">${d.rucReceptor}</cbc:ID></cac:PartyIdentification>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${moneda}">${igv.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${moneda}">${d.base.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${moneda}">${igv.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory><cac:TaxScheme><cbc:ID>1000</cbc:ID><cbc:Name>IGV</cbc:Name></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:${totales}>
    <cbc:LineExtensionAmount currencyID="${moneda}">${d.base.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:PayableAmount currencyID="${moneda}">${total.toFixed(2)}</cbc:PayableAmount>
  </cac:${totales}>
</${raiz}>
`;
}

// Encabezados con los nombres que creemos usa la propuesta del SIRE (por confirmar con un archivo real)
const ENCABEZADO_PROPUESTA = [
  "RUC", "Apellidos y Nombres o Razón social", "Periodo", "Fecha de emisión", "Tipo CP/Doc.",
  "Serie del CDP", "Nro CP o Doc. Nro Inicial (Rango)", "Tipo Doc Identidad", "Nro Doc Identidad",
  "Apellidos Nombres/ Razón Social", "BI Gravado DG", "IGV / IPM DG", "Total CP", "Moneda",
];

export function propuestaSire(rucCliente: string, periodo: string, filas: DatosXml[]): string {
  const lineas = filas.map((d) => {
    const igv = Math.round(d.base * 0.18 * 100) / 100;
    const [anio, mes, dia] = d.fecha.split("-");
    return [
      rucCliente, "BODEGA DOÑA ROSA S.A.C.", periodo, `${dia}/${mes}/${anio}`, d.tipo,
      d.serie, String(d.numero), "6", d.rucEmisor, d.nombreEmisor,
      d.base.toFixed(2), igv.toFixed(2), (d.base + igv).toFixed(2), d.moneda ?? "PEN",
    ].join("|");
  });
  return [ENCABEZADO_PROPUESTA.join("|"), ...lineas].join("\n") + "\n";
}

// Un mes de ejemplo con UN caso de cada tipo de hallazgo
export function escenarioDemo() {
  const [andina, lacteos, transportes, perez] = PROVEEDORES as [
    (typeof PROVEEDORES)[0], (typeof PROVEEDORES)[0], (typeof PROVEEDORES)[0], (typeof PROVEEDORES)[0],
  ];
  const base = { rucReceptor: RUC_CLIENTE };
  const compra = (p: typeof andina, extra: Omit<DatosXml, "rucEmisor" | "nombreEmisor" | "rucReceptor">): DatosXml => ({
    ...base, rucEmisor: p.ruc, nombreEmisor: p.nombre, ...extra,
  });

  const coinciden = [
    compra(andina, { tipo: "01", serie: "F001", numero: 1501, fecha: "2026-09-02", base: 1200 }),
    compra(andina, { tipo: "01", serie: "F001", numero: 1544, fecha: "2026-09-16", base: 980.5 }),
    compra(lacteos, { tipo: "01", serie: "F002", numero: 330, fecha: "2026-09-05", base: 640 }),
    compra(perez, { tipo: "01", serie: "E001", numero: 12, fecha: "2026-09-20", base: 150 }),
  ];
  const soloPropuesta = compra(transportes, { tipo: "01", serie: "F001", numero: 77, fecha: "2026-09-10", base: 300 });
  const soloXml = compra(lacteos, { tipo: "01", serie: "F002", numero: 351, fecha: "2026-09-28", base: 420 });
  const montoSunat = compra(andina, { tipo: "01", serie: "F001", numero: 1580, fecha: "2026-09-25", base: 500 });
  const montoXml = { ...montoSunat, base: 550 };
  const otroPeriodo = compra(andina, { tipo: "01", serie: "F001", numero: 1460, fecha: "2026-08-29", base: 210 });
  const otroReceptor = { ...compra(lacteos, { tipo: "01", serie: "F002", numero: 340, fecha: "2026-09-12", base: 95 }), rucReceptor: completarRuc("2061111111") };

  const propuesta = [...coinciden, soloPropuesta, montoSunat];
  const xmls = [...coinciden, soloXml, montoXml, otroPeriodo, otroReceptor, coinciden[0]!]; // el último es un duplicado
  return { propuesta, xmls };
}
