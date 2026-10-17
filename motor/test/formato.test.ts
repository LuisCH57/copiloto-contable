import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aCentimos, claveComprobante, formatearMonto, normalizarFecha } from "../src/formato.ts";

describe("formato", () => {
  it("convierte montos a céntimos sin errores de redondeo", () => {
    assert.equal(aCentimos("1,180.50"), 118050);
    assert.equal(aCentimos("0.1"), 10);
    assert.equal(aCentimos("19.99"), 1999);
    assert.equal(aCentimos(""), 0);
    assert.throws(() => aCentimos("abc"));
  });

  it("muestra céntimos con separador de miles", () => {
    assert.equal(formatearMonto(118050), "1,180.50");
    assert.equal(formatearMonto(-505), "-5.05");
  });

  it("acepta fechas dd/mm/aaaa y aaaa-mm-dd", () => {
    assert.equal(normalizarFecha("15/09/2026"), "2026-09-15");
    assert.equal(normalizarFecha("2026-09-15"), "2026-09-15");
    assert.throws(() => normalizarFecha("15-09-2026"));
  });

  it("la misma factura escrita distinto tiene la misma clave", () => {
    const a = claveComprobante({ rucEmisor: "20100047218", tipo: "01", serie: "f001", numero: "00000123" });
    const b = claveComprobante({ rucEmisor: "20100047218", tipo: "01", serie: "F001", numero: "123" });
    assert.equal(a, b);
  });
});
