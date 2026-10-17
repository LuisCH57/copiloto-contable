// ==========================================================
// Navegación con la parte "#" de la dirección: #/empresas/3
// Así cada pantalla tiene su propio enlace (se puede recargar o
// compartir) y funciona en GitHub Pages, que no tiene servidor.
// ==========================================================
import { useSyncExternalStore } from "react";

export type Ruta =
  | { pagina: "empresas" }
  | { pagina: "empresa"; id: number }
  | { pagina: "conciliacion"; id: number }
  | { pagina: "equipo" }
  | { pagina: "auditoria" }
  | { pagina: "subir"; token: string }; // página pública del cliente (sin sesión)

export function leerRuta(hash: string): Ruta {
  const [, seccion, id] = hash.replace(/^#/, "").split("/");
  const numero = Number(id);
  if (seccion === "subir" && id) return { pagina: "subir", token: id };
  if (seccion === "empresas" && Number.isInteger(numero) && numero > 0) return { pagina: "empresa", id: numero };
  if (seccion === "conciliaciones" && Number.isInteger(numero) && numero > 0) return { pagina: "conciliacion", id: numero };
  if (seccion === "equipo") return { pagina: "equipo" };
  if (seccion === "auditoria") return { pagina: "auditoria" };
  return { pagina: "empresas" };
}

export function enlace(ruta: Ruta): string {
  switch (ruta.pagina) {
    case "empresa":
      return `#/empresas/${ruta.id}`;
    case "conciliacion":
      return `#/conciliaciones/${ruta.id}`;
    case "equipo":
      return "#/equipo";
    case "auditoria":
      return "#/auditoria";
    case "subir":
      return `#/subir/${ruta.token}`;
    default:
      return "#/empresas";
  }
}

export function ir(ruta: Ruta) {
  window.location.hash = enlace(ruta);
}

function suscribir(avisar: () => void) {
  window.addEventListener("hashchange", avisar);
  return () => window.removeEventListener("hashchange", avisar);
}

// Hook: devuelve la ruta actual y se actualiza cuando cambia el "#"
export function useRuta(): Ruta {
  const hash = useSyncExternalStore(suscribir, () => window.location.hash);
  return leerRuta(hash);
}
