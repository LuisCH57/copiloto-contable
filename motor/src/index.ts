// Lo que el motor ofrece a otros módulos (por ejemplo, la API)
export { conciliar, describir } from "./conciliacion.ts";
export type { OpcionesConciliacion } from "./conciliacion.ts";
export { leerComprobanteXml, XmlNoValidoError } from "./lectores/xml-ubl.ts";
export { leerPropuestaSire, PropuestaNoValidaError } from "./lectores/propuesta-sire.ts";
export { reporteCsv, resumenTexto, NOMBRE_ESTADO } from "./reporte.ts";
export { esRucValido, completarRuc } from "./ruc.ts";
export { escenarioDemo, propuestaSire, xmlUbl, RUC_CLIENTE } from "./ejemplos.ts";
export type * from "./tipos.ts";
