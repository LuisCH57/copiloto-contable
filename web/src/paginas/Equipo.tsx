// El equipo del estudio. Solo el titular agrega o desactiva miembros.
import { useState, type FormEvent } from "react";
import { api } from "../api.ts";
import { Cargando, MensajeError } from "../components/Comunes.tsx";
import type { Sesion, Usuario } from "../types.ts";
import { useFetch } from "../utils/useFetch.ts";

export default function Equipo({ sesion }: { sesion: Sesion }) {
  const { data, error, loading, reload } = useFetch(() => api.usuarios(), "usuarios");
  const esTitular = sesion.usuario.rol === "titular";
  const [errorAccion, setErrorAccion] = useState<unknown>(null);

  async function cambiarActivo(usuario: Usuario) {
    setErrorAccion(null);
    try {
      await api.cambiarActivo(usuario.id, !usuario.activo);
      reload();
    } catch (err) {
      setErrorAccion(err);
    }
  }

  return (
    <section aria-labelledby="titulo-equipo">
      <div className="encabezado-seccion">
        <div>
          <h1 id="titulo-equipo">Equipo</h1>
          <p className="tenue">
            {esTitular
              ? "Agrega asistentes para que concilien contigo. Si alguien deja el estudio, desactívalo: pierde el acceso al instante."
              : "Las personas que trabajan en tu estudio."}
          </p>
        </div>
      </div>

      {esTitular && <NuevoAsistente alCrear={reload} />}
      <MensajeError error={error} />
      <MensajeError error={errorAccion} />

      {loading && !data ? (
        <Cargando />
      ) : (
        <div className="tabla-desplazable">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Rol</th>
                <th scope="col">Estado</th>
                {esTitular && <th scope="col"><span className="oculto">Acciones</span></th>}
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((u) => (
                <tr key={u.id} className={u.activo ? undefined : "inactiva"}>
                  <td>
                    {u.nombre}
                    <span className="sub tenue">{u.email}</span>
                  </td>
                  <td>{u.rol === "titular" ? "Titular" : "Asistente"}</td>
                  <td>
                    <span className={`etiqueta ${u.activo ? "etiqueta-ok" : "etiqueta-neutro"}`}>
                      {u.activo ? "✓ Activo" : "Desactivado"}
                    </span>
                  </td>
                  {esTitular && (
                    <td>
                      {u.id !== sesion.usuario.id && (
                        <button type="button" className="boton boton-pequeno" onClick={() => cambiarActivo(u)}>
                          {u.activo ? "Desactivar" : "Reactivar"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function NuevoAsistente({ alCrear }: { alCrear: () => void }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await api.crearUsuario(nombre, email, password);
      setNombre("");
      setEmail("");
      setPassword("");
      alCrear();
    } catch (err) {
      setError(err);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="tarjeta formulario" onSubmit={guardar}>
      <h2 className="titulo-tarjeta">Agregar asistente</h2>
      <div className="rejilla-campos">
        <label className="campo">
          <span>Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={2} />
        </label>
        <label className="campo">
          <span>Correo</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="campo">
          <span>Contraseña inicial</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoComplete="new-password" />
          <small className="tenue">Mínimo 10 caracteres. Entrégasela en persona.</small>
        </label>
      </div>
      <MensajeError error={error} />
      <div className="acciones">
        <button type="submit" className="boton boton-principal" disabled={guardando}>
          {guardando ? "Guardando…" : "Agregar asistente"}
        </button>
      </div>
    </form>
  );
}
