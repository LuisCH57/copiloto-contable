// ==========================================================
// Mensajes para pedir los comprobantes al cliente.
// Se abren en WhatsApp o en el correo del contador: así el mensaje sale
// de SU número o SU correo, que el cliente ya conoce (no de un robot).
// ==========================================================
import type { Empresa, Solicitud } from "../types.ts";
import { nombrePeriodo } from "./formato.ts";

// El enlace completo a la página pública, en esta misma aplicación
export function enlaceCliente(token: string): string {
  return `${window.location.origin}${window.location.pathname}#/subir/${token}`;
}

export function mensajeParaCliente(empresa: Empresa, solicitud: Solicitud, remitente: { nombre: string; estudio: string }): string {
  const saludo = empresa.contacto ? `Hola, ${empresa.contacto}.` : "Hola.";
  const mes = nombrePeriodo(solicitud.periodo).toLowerCase(); // "septiembre 2026"
  const enlace = enlaceCliente(solicitud.token);

  if (solicitud.recordatorios === 0) {
    return [
      `${saludo} Te saluda ${remitente.nombre}, de ${remitente.estudio}.`,
      `Para declarar las compras de ${mes} de ${empresa.razonSocial}, sube aquí los XML de tus facturas de compra (también sirven los .zip que te llegan por correo):`,
      enlace,
      "No necesitas usuario ni contraseña. ¡Gracias!",
    ].join("\n\n");
  }
  const recibidos =
    solicitud.documentos === 0
      ? "Todavía no hemos recibido ninguno."
      : `Ya recibimos ${solicitud.documentos} ${solicitud.documentos === 1 ? "comprobante" : "comprobantes"}; si te falta alguno, súbelo en el mismo enlace.`;
  return [
    `${saludo} Te recuerdo los XML de las compras de ${mes} de ${empresa.razonSocial}. ${recibidos}`,
    enlace,
    `Gracias. ${remitente.nombre}, ${remitente.estudio}.`,
  ].join("\n\n");
}

export function enlaceWhatsapp(celular: string | null, mensaje: string): string {
  // Sin número, WhatsApp deja elegir el contacto
  const destino = celular ? `51${celular}` : "";
  return `https://wa.me/${destino}?text=${encodeURIComponent(mensaje)}`;
}

export function enlaceCorreo(correo: string | null, solicitud: Solicitud, empresa: Empresa, mensaje: string): string {
  const asunto = `XML de compras de ${nombrePeriodo(solicitud.periodo)} · ${empresa.razonSocial}`;
  return `mailto:${correo ?? ""}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensaje)}`;
}

// "hace 3 días", "hoy", "ayer"
export function haceCuanto(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}
