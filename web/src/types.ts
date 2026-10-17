// Forma de los datos que devuelve la API del Copiloto contable
import type { Estado } from "motor-conciliacion";

export type { Estado };
export type Rol = "titular" | "asistente";

export interface Sesion {
  token: string;
  usuario: { id: number; nombre: string; email: string; rol: Rol };
  estudio: { id: number; nombre: string };
}

export interface Empresa {
  id: number;
  ruc: string;
  razonSocial: string;
  activa: boolean;
  creadoEn: string;
  ultimoPeriodo: string | null;
  contacto: string | null;
  celular: string | null;
  correo: string | null;
  ultimaSolicitud: {
    periodo: string;
    creadoEn: string;
    cerrada: boolean;
    documentos: number;
    ultimoRecordatorio: string | null;
  } | null;
}

export interface ConciliacionResumen {
  id: number;
  empresaId: number;
  periodo: string;
  creadoEn: string;
  creadoPor: string | null;
  totalPropuesta: number;
  totalXml: number;
  igvFueraDePropuesta: number; // céntimos
  igvSinRespaldo: number; // céntimos
  archivosConError: string[];
  pendientes: number;
  sinRevisar: number;
}

export interface Hallazgo {
  id: number;
  estado: Estado;
  clave: string;
  rucEmisor: string;
  nombreEmisor: string;
  tipo: string;
  serie: string;
  numero: string;
  fechaEmision: string;
  moneda: string;
  baseImponible: number;
  igv: number;
  total: number;
  explicacion: string;
  accion: string;
  revisado: boolean;
}

export interface ConciliacionDetalle extends Omit<ConciliacionResumen, "pendientes" | "sinRevisar"> {
  ruc: string;
  razonSocial: string;
  hallazgos: Hallazgo[];
}

export interface NuevaConciliacion {
  id: number;
  archivosConError: string[];
}

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  creadoEn: string;
}

export interface EventoAuditoria {
  id: number;
  accion: string;
  detalle: Record<string, unknown>;
  creadoEn: string;
  usuario: string | null;
}

// Fase 4: enlaces para que el cliente suba sus comprobantes
export interface Solicitud {
  id: number;
  empresaId: number;
  periodo: string;
  token: string;
  venceEn: string;
  cerrada: boolean;
  vigente: boolean;
  recordatorios: number; // cuántas veces se le envió el enlace
  ultimoRecordatorio: string | null;
  creadoEn: string;
  documentos: number;
  ultimoDocumento: string | null;
}

export interface DocumentoCliente {
  archivo: string;
  rucEmisor: string;
  nombreEmisor: string;
  tipo: string;
  serie: string;
  numero: string;
  fechaEmision: string;
  moneda: string;
  total: number;
  subidoEn: string;
}

export interface SolicitudPublica {
  estudio: string;
  razonSocial: string;
  ruc: string;
  periodo: string;
  venceEn: string;
  documentos: DocumentoCliente[];
}

export interface ResultadoArchivo {
  archivo: string;
  estado: "recibido" | "repetido" | "rechazado";
  mensaje: string;
}

export interface Recordatorio {
  solicitud: Solicitud;
  empresa: Pick<Empresa, "id" | "ruc" | "razonSocial" | "contacto" | "celular" | "correo">;
}
