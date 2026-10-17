// ==========================================================
// Revisa los XML que sube el cliente ANTES de guardarlos.
// Función pura (sin base de datos): fácil de probar.
//
// Al cliente le respondemos al instante, archivo por archivo:
//   recibido   -> se guardó (con un aviso si es de otro mes)
//   repetido   -> ya lo había subido
//   rechazado  -> no es un comprobante válido o no es una compra de esta empresa
// ==========================================================
import { leerComprobanteXml, type Comprobante } from "motor-conciliacion";
import { claveComprobante } from "motor-conciliacion/formato";
import { nombreMes } from "./formato.ts";

export interface ArchivoRecibido {
  nombre: string;
  contenido: string;
}

export interface ResultadoArchivo {
  archivo: string;
  estado: "recibido" | "repetido" | "rechazado";
  mensaje: string;
}

export interface DocumentoAceptado {
  archivo: string;
  contenido: string;
  clave: string;
  comprobante: Comprobante;
}

export function revisarArchivos(
  archivos: ArchivoRecibido[],
  { ruc, periodo, clavesGuardadas }: { ruc: string; periodo: string; clavesGuardadas: Set<string> }
) {
  const aceptados: DocumentoAceptado[] = [];
  const resultados: ResultadoArchivo[] = [];
  const vistas = new Set(clavesGuardadas);

  for (const { nombre, contenido } of archivos) {
    let comprobante: Comprobante;
    try {
      comprobante = leerComprobanteXml(contenido, nombre);
    } catch {
      resultados.push({
        archivo: nombre,
        estado: "rechazado",
        mensaje: "No es una factura, boleta ni nota electrónica en XML.",
      });
      continue;
    }

    if (comprobante.rucReceptor && comprobante.rucReceptor !== ruc) {
      resultados.push({
        archivo: nombre,
        estado: "rechazado",
        mensaje: `Está emitido al RUC ${comprobante.rucReceptor}, no al RUC ${ruc}. No es una compra de esta empresa.`,
      });
      continue;
    }

    const clave = claveComprobante(comprobante);
    if (vistas.has(clave)) {
      resultados.push({
        archivo: nombre,
        estado: "repetido",
        mensaje: `Ya habías subido ${comprobante.serie}-${comprobante.numero}. No hace falta subirlo otra vez.`,
      });
      continue;
    }
    vistas.add(clave);
    aceptados.push({ archivo: nombre, contenido, clave, comprobante });

    const periodoComprobante = comprobante.fechaEmision.slice(0, 7).replace("-", "");
    resultados.push({
      archivo: nombre,
      estado: "recibido",
      mensaje:
        periodoComprobante === periodo
          ? "Recibido."
          : `Recibido. Es de ${nombreMes(periodoComprobante)}, no de ${nombreMes(periodo)}: tu contador lo revisará.`,
    });
  }

  return { aceptados, resultados };
}
