import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { completarRuc, esRucValido } from "../src/ruc.ts";

describe("RUC", () => {
  it("acepta un RUC con dígito verificador correcto", () => {
    assert.equal(esRucValido("20100047218"), true); // RUC público conocido (Banco de Crédito del Perú)
    assert.equal(esRucValido(completarRuc("2060000001")), true);
  });

  it("rechaza dígito verificador incorrecto, longitud o prefijo inválidos", () => {
    assert.equal(esRucValido("20100047219"), false);
    assert.equal(esRucValido("2010004721"), false);
    assert.equal(esRucValido("30100047218"), false);
    assert.equal(esRucValido("2010004721A"), false);
  });
});
