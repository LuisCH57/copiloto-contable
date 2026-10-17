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
