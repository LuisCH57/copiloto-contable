export type Rol = "titular" | "asistente";

// Lo que la API sabe de quien hace la petición (sale del token)
export interface Sesion {
  usuarioId: number;
  estudioId: number;
  nombre: string;
  rol: Rol;
}
