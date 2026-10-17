// Pantalla de inicio de sesión y registro de un estudio contable
import { useState, type FormEvent } from "react";
import { api } from "../api.ts";
import type { Sesion } from "../types.ts";
import { MensajeError } from "../components/Comunes.tsx";

interface Props {
  aviso: string;
  alIngresar: (sesion: Sesion) => void;
}

export default function Acceso({ aviso, alIngresar }: Props) {
  const [modo, setModo] = useState<"login" | "registro">("login");
  const [nombreEstudio, setNombreEstudio] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const registro = modo === "registro";

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      alIngresar(registro ? await api.registro({ nombreEstudio, nombre, email, password }) : await api.login(email, password));
    } catch (err) {
      setError(err);
      setEnviando(false);
    }
  }

  return (
    <div className="acceso">
      <section className="acceso-presentacion">
        <p className="marca">Copiloto contable</p>
        <h1>Cierra el mes sin perseguir comprobantes.</h1>
        <ul className="lista-beneficios">
          <li>Concilia la propuesta del SIRE con los XML de cada cliente en segundos.</li>
          <li>Cada diferencia viene explicada, con la acción a seguir.</li>
          <li>Toda tu cartera de empresas y tu equipo en un solo lugar.</li>
        </ul>
      </section>

      <section className="tarjeta acceso-formulario" aria-labelledby="titulo-acceso">
        <div className="pestanas" role="group" aria-label="Elegir acción">
          <button type="button" aria-pressed={!registro} onClick={() => setModo("login")}>Iniciar sesión</button>
          <button type="button" aria-pressed={registro} onClick={() => setModo("registro")}>Registrar mi estudio</button>
        </div>
        <h2 id="titulo-acceso">{registro ? "Crea la cuenta de tu estudio" : "Bienvenido de nuevo"}</h2>
        {aviso && <p className="alerta alerta-info">{aviso}</p>}

        <form className="formulario" onSubmit={enviar}>
          {registro && (
            <>
              <label className="campo">
                <span>Nombre del estudio contable</span>
                <input value={nombreEstudio} onChange={(e) => setNombreEstudio(e.target.value)} required minLength={2} maxLength={120} autoComplete="organization" />
              </label>
              <label className="campo">
                <span>Tu nombre</span>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={2} maxLength={100} autoComplete="name" />
              </label>
            </>
          )}
          <label className="campo">
            <span>Correo</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          <label className="campo">
            <span>Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={registro ? 10 : undefined}
              autoComplete={registro ? "new-password" : "current-password"}
            />
            {registro && <small className="tenue">Mínimo 10 caracteres.</small>}
          </label>
          <MensajeError error={error} />
          <button type="submit" className="boton boton-principal" disabled={enviando}>
            {enviando ? "Un momento…" : registro ? "Crear cuenta" : "Iniciar sesión"}
          </button>
        </form>
      </section>
    </div>
  );
}
