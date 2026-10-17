// ==========================================================
// LECTOR DE LA PROPUESTA DEL SIRE (Registro de Compras Electrónico)
//
// SUNAT arma una "propuesta" del registro de compras con lo que los
// proveedores informaron. El contador la descarga como un archivo de texto
// con una fila por comprobante y columnas separadas (normalmente con "|").
//
// IMPORTANTE: no pude confirmar en la documentación pública el orden exacto
// de las columnas. Por eso este lector NO depende del orden: busca cada dato
// por el NOMBRE de su columna (aceptando variantes). Si un archivo real usa
// otro nombre, basta con agregarlo a COLUMNAS. Si falta una columna, el
// error muestra los encabezados encontrados para ajustarlo rápido.
// ==========================================================
import type { Comprobante, TipoComprobante } from "../tipos.ts";
import { aCentimos, normalizarFecha, normalizarNumero, normalizarSerie } from "../formato.ts";

type Campo =
  | "rucEmisor"
  | "nombreEmisor"
  | "tipo"
  | "serie"
  | "numero"
  | "fechaEmision"
  | "moneda"
  | "baseImponible"
  | "igv"
  | "total";

// Nombres aceptados para cada columna, ya "normalizados" (ver normalizarEncabezado)
const COLUMNAS: Record<Campo, string[]> = {
  rucEmisor: ["nro doc identidad", "numero doc identidad", "nro documento identidad", "ruc proveedor", "ruc emisor"],
  nombreEmisor: ["apellidos nombres razon social", "razon social proveedor", "proveedor", "nombre emisor"],
  tipo: ["tipo cp doc", "tipo cp", "tipo cdp", "tipo de comprobante", "tipo comprobante"],
  serie: ["serie del cdp", "serie cdp", "serie del cp", "serie"],
  numero: ["nro cp o doc nro inicial rango", "nro cp o doc", "nro cp", "numero cp", "numero comprobante", "numero"],
  fechaEmision: ["fecha de emision", "fecha emision"],
  moneda: ["moneda", "codigo moneda"],
  baseImponible: ["bi gravado dg", "bi gravada dg", "base imponible gravada", "base imponible"],
  igv: ["igv ipm dg", "igv dg", "igv"],
  total: ["total cp", "importe total", "total"],
};

// "Nro CP o Doc. Nro Inicial (Rango)" -> "nro cp o doc nro inicial rango"
export function normalizarEncabezado(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ") // signos -> espacio
    .trim();
}

function detectarSeparador(encabezado: string): string {
  const candidatos = ["|", ";", "\t", ","];
  return candidatos.reduce((mejor, actual) =>
    encabezado.split(actual).length > encabezado.split(mejor).length ? actual : mejor
  );
}

export class PropuestaNoValidaError extends Error {}

export function leerPropuestaSire(contenido: string): Comprobante[] {
  const lineas = contenido
    .replace(/^﻿/, "") // quita la marca BOM que agrega Excel
    .split(/\r?\n/)
    .filter((linea) => linea.trim() !== "");

  const [primera, ...filas] = lineas;
  if (!primera) throw new PropuestaNoValidaError("El archivo de la propuesta está vacío.");

  const separador = detectarSeparador(primera);
  const encabezados = primera.split(separador).map(normalizarEncabezado);

  // Ubica la posición de cada columna por su nombre
  const posicion = {} as Record<Campo, number>;
  const faltantes: Campo[] = [];
  for (const campo of Object.keys(COLUMNAS) as Campo[]) {
    // Se prueban los nombres en orden de preferencia (el más específico primero)
    const indice = COLUMNAS[campo]
      .map((nombre) => encabezados.indexOf(nombre))
      .find((i) => i !== -1);
    if (indice === undefined) faltantes.push(campo);
    else posicion[campo] = indice;
  }
  if (faltantes.length > 0) {
    throw new PropuestaNoValidaError(
      `No encontré las columnas: ${faltantes.join(", ")}.\n` +
        `Encabezados del archivo: ${encabezados.join(" | ")}`
    );
  }

  return filas.map((fila, i) => {
    const celdas = fila.split(separador);
    const valor = (campo: Campo) => (celdas[posicion[campo]] ?? "").trim();
    try {
      return {
        origen: "propuesta",
        rucEmisor: valor("rucEmisor"),
        nombreEmisor: valor("nombreEmisor"),
        tipo: valor("tipo").padStart(2, "0") as TipoComprobante,
        serie: normalizarSerie(valor("serie")),
        numero: normalizarNumero(valor("numero")),
        fechaEmision: normalizarFecha(valor("fechaEmision")),
        moneda: valor("moneda") || "PEN",
        baseImponible: aCentimos(valor("baseImponible")),
        igv: aCentimos(valor("igv")),
        total: aCentimos(valor("total")),
      } satisfies Comprobante;
    } catch (error) {
      // Fila 1 = encabezado, por eso sumamos 2
      throw new PropuestaNoValidaError(`Fila ${i + 2}: ${(error as Error).message}`);
    }
  });
}
