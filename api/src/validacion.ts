// Ayudantes para leer y validar lo que llega en las peticiones

export function texto(cuerpo: unknown, campo: string): string {
  if (typeof cuerpo !== "object" || cuerpo === null) return "";
  const valor = (cuerpo as Record<string, unknown>)[campo];
  return typeof valor === "string" ? valor.trim() : "";
}

// La contraseña NO se recorta: los espacios pueden ser parte de ella
export function contrasena(cuerpo: unknown): string {
  if (typeof cuerpo !== "object" || cuerpo === null) return "";
  const valor = (cuerpo as Record<string, unknown>).password;
  return typeof valor === "string" ? valor : "";
}

export const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_CONTRASENA = 10;

export function idDeRuta(valor: string | string[] | undefined): number | null {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const VIOLACION_UNICA = "23505";

export function esViolacionUnica(error: unknown): boolean {
  return (error as { code?: string }).code === VIOLACION_UNICA;
}
