import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { leerComprobanteXml, XmlNoValidoError } from "../src/lectores/xml-ubl.ts";
import { leerPropuestaSire, PropuestaNoValidaError } from "../src/lectores/propuesta-sire.ts";
import { PROVEEDORES, propuestaSire, RUC_CLIENTE, xmlUbl } from "../src/ejemplos.ts";

const proveedor = PROVEEDORES[0]!;
const datos = {
  tipo: "01" as const, serie: "F001", numero: 123, fecha: "2026-09-15",
  rucEmisor: proveedor.ruc, nombreEmisor: proveedor.nombre, rucReceptor: RUC_CLIENTE, base: 1000,
};

describe("lector de XML UBL", () => {
  it("lee una factura: emisor, receptor, número sin ceros y montos en céntimos", () => {
    const c = leerComprobanteXml(xmlUbl(datos), "f.xml");
    assert.equal(c.tipo, "01");
    assert.equal(c.rucEmisor, proveedor.ruc);
    assert.equal(c.nombreEmisor, proveedor.nombre);
    assert.equal(c.rucReceptor, RUC_CLIENTE);
    assert.equal(c.serie, "F001");
    assert.equal(c.numero, "123"); // el XML dice F001-00000123
    assert.equal(c.fechaEmision, "2026-09-15");
    assert.equal(c.baseImponible, 100000);
    assert.equal(c.igv, 18000);
    assert.equal(c.total, 118000);
  });

  it("lee notas de crédito y de débito", () => {
    assert.equal(leerComprobanteXml(xmlUbl({ ...datos, tipo: "07", serie: "FC01" })).tipo, "07");
    const debito = leerComprobanteXml(xmlUbl({ ...datos, tipo: "08", serie: "FD01" }));
    assert.equal(debito.tipo, "08");
    assert.equal(debito.total, 118000); // usa RequestedMonetaryTotal
  });

  it("rechaza archivos que no son comprobantes", () => {
    assert.throws(() => leerComprobanteXml("<html><body>hola</body></html>", "x.xml"), XmlNoValidoError);
    assert.throws(() => leerComprobanteXml("esto no es xml <<<", "x.xml"), XmlNoValidoError);
  });
});

describe("lector de la propuesta del SIRE", () => {
  it("lee las filas por nombre de columna", () => {
    const [fila] = leerPropuestaSire(propuestaSire(RUC_CLIENTE, "202609", [datos]));
    assert.ok(fila);
    assert.equal(fila.rucEmisor, proveedor.ruc); // no confunde el RUC del cliente con el del proveedor
    assert.equal(fila.nombreEmisor, proveedor.nombre);
    assert.equal(fila.fechaEmision, "2026-09-15");
    assert.equal(fila.igv, 18000);
  });

  it("no depende del orden de las columnas ni del separador", () => {
    const archivo = "Total CP;Serie del CDP;Nro Doc Identidad;Tipo CP/Doc.;Nro CP o Doc. Nro Inicial (Rango);" +
      "Fecha de emisión;Apellidos Nombres/ Razón Social;BI Gravado DG;IGV / IPM DG;Moneda\n" +
      `1180.00;F001;${proveedor.ruc};1;00000123;15/09/2026;X;1000.00;180.00;PEN\n`;
    const [fila] = leerPropuestaSire(archivo);
    assert.equal(fila?.tipo, "01"); // "1" se completa a "01"
    assert.equal(fila?.numero, "123");
    assert.equal(fila?.total, 118000);
  });

  it("si falta una columna, el error dice cuál y qué encabezados encontró", () => {
    assert.throws(
      () => leerPropuestaSire("RUC|Serie del CDP\n20100047218|F001\n"),
      (error: Error) =>
        error instanceof PropuestaNoValidaError && error.message.includes("rucEmisor") && error.message.includes("serie del cdp")
    );
  });
});
