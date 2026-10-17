// ==========================================================
// TIPOS DEL MOTOR DE CONCILIACIÓN
// Un "comprobante" es una factura, boleta o nota de compra del cliente.
// Puede venir de dos fuentes:
//   - "propuesta": lo que SUNAT propone en el SIRE (lo que los proveedores informaron)
//   - "xml":       el archivo XML que el cliente le entregó al contador
// ==========================================================

// Códigos de SUNAT (catálogo 01): 01 factura, 03 boleta, 07 nota de crédito, 08 nota de débito
export type TipoComprobante = "01" | "03" | "07" | "08";

export type Origen = "propuesta" | "xml";

export interface Comprobante {
  origen: Origen;
  rucEmisor: string;
  nombreEmisor: string;
  tipo: TipoComprobante;
  serie: string; // "F001"
  numero: string; // "123" (sin ceros a la izquierda)
  fechaEmision: string; // "2026-09-15" (AAAA-MM-DD)
  moneda: string; // "PEN" o "USD"
  // Montos en CÉNTIMOS (enteros) para evitar errores de redondeo
  baseImponible: number;
  igv: number;
  total: number;
  // Solo para XML: a quién se emitió el comprobante y de qué archivo salió
  rucReceptor?: string;
  archivo?: string;
}

export type Estado =
  | "coincide"
  | "diferencia_monto"
  | "falta_xml" // SUNAT lo tiene, el cliente no entregó el XML
  | "falta_en_propuesta" // el cliente tiene el XML, SUNAT no lo propone
  | "otro_periodo" // el XML es de otro mes
  | "otro_receptor" // el XML se emitió a otro RUC: no es compra del cliente
  | "duplicado" // el mismo comprobante llegó dos veces
  | "ruc_invalido"; // el RUC del proveedor no pasa la validación

export interface Hallazgo {
  estado: Estado;
  clave: string; // "20100047218-01-F001-123"
  comprobante: Comprobante; // el de la propuesta si existe; si no, el del XML
  explicacion: string; // en lenguaje simple, para el contador
  accion: string; // qué hacer
  diferencias?: { campo: "baseImponible" | "igv" | "total"; propuesta: number; xml: number }[];
}

export interface ResultadoConciliacion {
  rucCliente: string;
  periodo: string; // "202609"
  hallazgos: Hallazgo[];
  resumen: {
    totalPropuesta: number;
    totalXml: number;
    porEstado: Record<Estado, number>;
    // IGV (en céntimos) de compras con XML que SUNAT no propone: crédito fiscal que se podría perder
    igvFueraDePropuesta: number;
    // IGV de compras que SUNAT propone pero sin XML de respaldo
    igvSinRespaldo: number;
  };
}
