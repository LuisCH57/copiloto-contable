// ==========================================================
// Cliente de la API: todas las peticiones pasan por aquí y
// llevan el token de sesión automáticamente.
// ==========================================================
import type {
  ConciliacionDetalle,
  DocumentoCliente,
  ResultadoArchivo,
  Solicitud,
  SolicitudPublica,
  ConciliacionResumen,
  Empresa,
  EventoAuditoria,
  Hallazgo,
  NuevaConciliacion,
  Sesion,
  Usuario,
} from "./types.ts";

const API_URL: string = import.meta.env.VITE_API_URL ?? "/api";

export class ApiError extends Error {
  status: number;
  detalles: string[];
  constructor(mensaje: string, status: number, detalles: string[] = []) {
    super(mensaje);
    this.status = status;
    this.detalles = detalles;
  }
}

let token: string | null = null;
let alExpirarSesion: (() => void) | null = null;

export function ponerToken(nuevo: string | null) {
  token = nuevo;
}
export function cuandoExpireLaSesion(funcion: () => void) {
  alExpirarSesion = funcion;
}

async function pedir(ruta: string, opciones: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  // Con FormData el navegador pone el Content-Type (multipart) por su cuenta
  if (opciones.body && !(opciones.body instanceof FormData)) headers["Content-Type"] = "application/json";

  let respuesta: Response;
  try {
    respuesta = await fetch(`${API_URL}${ruta}`, { ...opciones, headers });
  } catch {
    throw new ApiError("No se pudo conectar con el servidor. Revisa tu conexión.", 0);
  }
  if (!respuesta.ok) {
    const datos = await respuesta.json().catch(() => null);
    if (respuesta.status === 401 && token && alExpirarSesion) alExpirarSesion();
    throw new ApiError(datos?.error ?? `Error ${respuesta.status}`, respuesta.status, datos?.detalles ?? []);
  }
  return respuesta;
}

async function json<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  return (await pedir(ruta, opciones)).json() as Promise<T>;
}

const enviar = (metodo: string, cuerpo: unknown): RequestInit => ({ method: metodo, body: JSON.stringify(cuerpo) });

export const api = {
  login: (email: string, password: string) => json<Sesion>("/auth/login", enviar("POST", { email, password })),
  registro: (datos: { nombreEstudio: string; nombre: string; email: string; password: string }) =>
    json<Sesion>("/auth/registro", enviar("POST", datos)),

  empresas: () => json<Empresa[]>("/empresas"),
  empresa: (id: number) => json<Empresa>(`/empresas/${id}`),
  crearEmpresa: (ruc: string, razonSocial: string) => json<Empresa>("/empresas", enviar("POST", { ruc, razonSocial })),
  editarEmpresa: (id: number, razonSocial: string, activa: boolean) =>
    json<Empresa>(`/empresas/${id}`, enviar("PUT", { razonSocial, activa })),

  conciliaciones: (empresaId: number) => json<ConciliacionResumen[]>(`/empresas/${empresaId}/conciliaciones`),
  conciliar: (empresaId: number, periodo: string, propuesta: File, xmls: File[], documentosCliente: boolean) => {
    const form = new FormData();
    form.append("periodo", periodo);
    if (documentosCliente) form.append("documentosCliente", "si");
    form.append("propuesta", propuesta);
    for (const xml of xmls) form.append("xml", xml);
    return json<NuevaConciliacion>(`/empresas/${empresaId}/conciliaciones`, { method: "POST", body: form });
  },
  conciliacion: (id: number) => json<ConciliacionDetalle>(`/conciliaciones/${id}`),
  marcarRevisado: (hallazgoId: number, revisado: boolean) =>
    json<Hallazgo>(`/hallazgos/${hallazgoId}`, enviar("PATCH", { revisado })),

  // Descarga el CSV con el token (un enlace normal no enviaría la sesión)
  descargarCsv: async (id: number) => {
    const respuesta = await pedir(`/conciliaciones/${id}/csv`);
    const nombre = /filename="(.+)"/.exec(respuesta.headers.get("Content-Disposition") ?? "")?.[1] ?? "conciliacion.csv";
    const url = URL.createObjectURL(await respuesta.blob());
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombre;
    enlace.click();
    URL.revokeObjectURL(url);
  },

  usuarios: () => json<Usuario[]>("/usuarios"),
  crearUsuario: (nombre: string, email: string, password: string) =>
    json<Usuario>("/usuarios", enviar("POST", { nombre, email, password })),
  cambiarActivo: (id: number, activo: boolean) => json<Usuario>(`/usuarios/${id}`, enviar("PATCH", { activo })),

  auditoria: () => json<EventoAuditoria[]>("/auditoria"),

  // Fase 4: pedir los comprobantes al cliente
  guardarContacto: (empresaId: number, datos: { contacto: string; celular: string; correo: string }) =>
    json<Empresa>(`/empresas/${empresaId}/contacto`, enviar("PATCH", datos)),
  solicitudes: (empresaId: number) => json<Solicitud[]>(`/empresas/${empresaId}/solicitudes`),
  crearSolicitud: (empresaId: number, periodo: string) =>
    json<Solicitud>(`/empresas/${empresaId}/solicitudes`, enviar("POST", { periodo })),
  documentosDeSolicitud: (id: number) => json<(DocumentoCliente & { id: number })[]>(`/solicitudes/${id}/documentos`),
  renovarSolicitud: (id: number) => json<Solicitud>(`/solicitudes/${id}/renovar`, { method: "POST" }),
  cerrarSolicitud: (id: number, cerrada: boolean) => json<Solicitud>(`/solicitudes/${id}`, enviar("PATCH", { cerrada })),
  anotarEnvio: (id: number, canal: "whatsapp" | "correo" | "copiado") =>
    json<Solicitud>(`/solicitudes/${id}/recordatorios`, enviar("POST", { canal })),
  borrarSolicitud: (id: number) => pedir(`/solicitudes/${id}`, { method: "DELETE" }),
};

// Lo que usa la página PÚBLICA del cliente (sin sesión)
export const apiCliente = {
  solicitud: (token: string) => json<SolicitudPublica>(`/publico/solicitudes/${encodeURIComponent(token)}`),
  subir: (token: string, xmls: File[]) => {
    const form = new FormData();
    for (const xml of xmls) form.append("xml", xml);
    return json<{ resultados: ResultadoArchivo[]; documentos: DocumentoCliente[] }>(
      `/publico/solicitudes/${encodeURIComponent(token)}/documentos`,
      { method: "POST", body: form }
    );
  },
};
