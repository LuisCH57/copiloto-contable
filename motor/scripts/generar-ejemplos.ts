// Genera un mes de datos FICTICIOS en salidas/ejemplo/ para probar el motor.
// Uso: npm run ejemplos
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { escenarioDemo, propuestaSire, RUC_CLIENTE, xmlUbl } from "../src/ejemplos.ts";

const carpeta = join("salidas", "ejemplo");
const carpetaXml = join(carpeta, "xml");
await mkdir(carpetaXml, { recursive: true });

const { propuesta, xmls } = escenarioDemo();

await writeFile(join(carpeta, "propuesta-202609.txt"), propuestaSire(RUC_CLIENTE, "202609", propuesta), "utf8");

for (const [i, datos] of xmls.entries()) {
  const nombre = `${datos.rucEmisor}-${datos.tipo}-${datos.serie}-${datos.numero}${i >= xmls.length - 1 ? "-copia" : ""}.xml`;
  await writeFile(join(carpetaXml, nombre), xmlUbl(datos), "utf8");
}

console.log(`Datos de ejemplo creados en ${carpeta}/`);
console.log(`  propuesta-202609.txt: ${propuesta.length} comprobantes`);
console.log(`  xml/: ${xmls.length} archivos`);
console.log(`\nAhora ejecuta:\n  npm run conciliar -- --ruc ${RUC_CLIENTE} --periodo 202609 --propuesta ${carpeta}/propuesta-202609.txt --xml ${carpetaXml}`);
