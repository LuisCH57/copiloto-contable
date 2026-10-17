// ==========================================================
// Concilia un mes desde la línea de comandos.
// Uso:
//   npm run conciliar -- --ruc 20600000011 --periodo 202609 \
//     --propuesta ruta/propuesta.txt --xml ruta/carpeta-de-xml [--salida reporte.csv]
// ==========================================================
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { conciliar } from "../src/conciliacion.ts";
import { leerComprobanteXml } from "../src/lectores/xml-ubl.ts";
import { leerPropuestaSire } from "../src/lectores/propuesta-sire.ts";
import { reporteCsv, resumenTexto } from "../src/reporte.ts";
import { esRucValido } from "../src/ruc.ts";
import type { Comprobante } from "../src/tipos.ts";

const { values } = parseArgs({
  options: {
    ruc: { type: "string" },
    periodo: { type: "string" },
    propuesta: { type: "string" },
    xml: { type: "string" },
    salida: { type: "string" },
  },
});

if (!values.ruc || !values.periodo || !values.propuesta || !values.xml) {
  console.error("Faltan datos. Uso: npm run conciliar -- --ruc <RUC> --periodo <AAAAMM> --propuesta <archivo> --xml <carpeta>");
  process.exit(1);
}
if (!esRucValido(values.ruc)) {
  console.error(`El RUC ${values.ruc} no es válido (revisa el dígito verificador).`);
  process.exit(1);
}
if (!/^\d{6}$/.test(values.periodo)) {
  console.error("El periodo debe tener el formato AAAAMM, por ejemplo 202609.");
  process.exit(1);
}

const propuesta = leerPropuestaSire(await readFile(values.propuesta, "utf8"));

// Lee todos los .xml de la carpeta (también en subcarpetas)
const archivos = (await readdir(values.xml, { recursive: true })).filter((a) => a.toLowerCase().endsWith(".xml"));
const xmls: Comprobante[] = [];
const errores: string[] = [];
for (const archivo of archivos) {
  try {
    xmls.push(leerComprobanteXml(await readFile(join(values.xml, archivo), "utf8"), basename(archivo)));
  } catch (error) {
    errores.push((error as Error).message); // un XML dañado no detiene el resto
  }
}

const resultado = conciliar(propuesta, xmls, { rucCliente: values.ruc, periodo: values.periodo });
const salida = values.salida ?? `conciliacion-${values.ruc}-${values.periodo}.csv`;
await writeFile(salida, reporteCsv(resultado), "utf8");

console.log("\n" + resumenTexto(resultado));
if (xmls.length > 0 && resultado.resumen.porEstado.otro_receptor > xmls.length / 2) {
  console.log(`\n⚠ La mayoría de los XML están emitidos a otro RUC. ¿Es ${values.ruc} el RUC correcto del cliente?`);
}
if (errores.length > 0) {
  console.log(`\nArchivos que no se pudieron leer (${errores.length}):`);
  for (const e of errores) console.log(`  - ${e}`);
}
console.log(`\nDetalle guardado en: ${salida} (ábrelo con Excel)\n`);
