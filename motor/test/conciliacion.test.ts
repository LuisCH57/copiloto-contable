import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { conciliar } from "../src/conciliacion.ts";
import { leerComprobanteXml } from "../src/lectores/xml-ubl.ts";
import { leerPropuestaSire } from "../src/lectores/propuesta-sire.ts";
import { escenarioDemo, propuestaSire, RUC_CLIENTE, xmlUbl } from "../src/ejemplos.ts";
import { reporteCsv } from "../src/reporte.ts";

// Pasa los datos de ejemplo por los mismos lectores que usan los archivos reales
function prepararEscenario() {
  const { propuesta, xmls } = escenarioDemo();
  return {
    propuesta: leerPropuestaSire(propuestaSire(RUC_CLIENTE, "202609", propuesta)),
    xmls: xmls.map((d, i) => leerComprobanteXml(xmlUbl(d), `archivo-${i}.xml`)),
  };
}

describe("conciliación", () => {
  const { propuesta, xmls } = prepararEscenario();
  const resultado = conciliar(propuesta, xmls, { rucCliente: RUC_CLIENTE, periodo: "202609" });
  const estados = resultado.resumen.porEstado;

  it("clasifica cada caso del mes de ejemplo", () => {
    assert.equal(estados.coincide, 4);
    assert.equal(estados.falta_xml, 1);
    assert.equal(estados.falta_en_propuesta, 1);
    assert.equal(estados.diferencia_monto, 1);
    assert.equal(estados.otro_periodo, 1);
    assert.equal(estados.otro_receptor, 1);
    assert.equal(estados.duplicado, 1);
    assert.equal(estados.ruc_invalido, 0);
  });

  it("explica la diferencia de montos con ambas cifras", () => {
    const h = resultado.hallazgos.find((x) => x.estado === "diferencia_monto");
    assert.ok(h?.explicacion.includes("S/ 500.00") && h.explicacion.includes("S/ 550.00"));
    assert.deepEqual(h?.diferencias?.map((d) => d.campo), ["baseImponible", "igv", "total"]);
  });

  it("calcula el IGV en riesgo y el IGV sin respaldo", () => {
    assert.equal(resultado.resumen.igvFueraDePropuesta, 7560); // 18 % de S/ 420
    assert.equal(resultado.resumen.igvSinRespaldo, 5400); // 18 % de S/ 300
  });

  it("muestra primero lo que requiere acción", () => {
    const ultimoProblema = resultado.hallazgos.findLastIndex((h) => h.estado !== "coincide");
    const primerOk = resultado.hallazgos.findIndex((h) => h.estado === "coincide");
    assert.ok(ultimoProblema < primerOk);
  });

  it("tolera diferencias de 1 céntimo por redondeo", () => {
    const [sunat] = propuesta;
    assert.ok(sunat);
    const xml = { ...sunat, origen: "xml" as const, total: sunat.total + 1, rucReceptor: RUC_CLIENTE };
    const r = conciliar([sunat], [xml], { rucCliente: RUC_CLIENTE, periodo: "202609" });
    assert.equal(r.resumen.porEstado.coincide, 1);
  });

  it("marca un RUC de proveedor inválido", () => {
    const [sunat] = propuesta;
    assert.ok(sunat);
    const r = conciliar([{ ...sunat, rucEmisor: "20123456780" }], [], { rucCliente: RUC_CLIENTE, periodo: "202609" });
    assert.equal(r.resumen.porEstado.ruc_invalido, 1);
  });

  it("genera un CSV para Excel con una fila por hallazgo", () => {
    const csv = reporteCsv(resultado);
    assert.ok(csv.startsWith("﻿Estado;"));
    assert.equal(csv.trim().split("\r\n").length, resultado.hallazgos.length + 1);
  });
});
