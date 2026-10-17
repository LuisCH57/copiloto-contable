// ==========================================================
// App: guarda la sesión, muestra el menú y elige la pantalla
// según la dirección (#/empresas, #/conciliaciones/7, ...).
// ==========================================================
import { useEffect, useState } from "react";
import { cuandoExpireLaSesion, ponerToken } from "./api.ts";
import type { Sesion } from "./types.ts";
import { enlace, useRuta, type Ruta } from "./utils/ruta.ts";
import Acceso from "./paginas/Acceso.tsx";
import Empresas from "./paginas/Empresas.tsx";
import Empresa from "./paginas/Empresa.tsx";
import Conciliacion from "./paginas/Conciliacion.tsx";
import Equipo from "./paginas/Equipo.tsx";
import Auditoria from "./paginas/Auditoria.tsx";
import SubirComprobantes from "./paginas/SubirComprobantes.tsx";

const CLAVE_SESION = "copiloto-contable-sesion";

function leerSesionGuardada(): Sesion | null {
  try {
    const guardada = localStorage.getItem(CLAVE_SESION);
    return guardada ? (JSON.parse(guardada) as Sesion) : null;
  } catch {
    return null;
  }
}

function guardarSesion(sesion: Sesion | null) {
  try {
    if (sesion) localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
    else localStorage.removeItem(CLAVE_SESION);
  } catch {
    // sin localStorage, la sesión dura hasta recargar
  }
}

const sesionInicial = leerSesionGuardada();
ponerToken(sesionInicial?.token ?? null);

export default function App() {
  const [sesion, setSesion] = useState<Sesion | null>(sesionInicial);
  const [aviso, setAviso] = useState("");
  const ruta = useRuta();

  useEffect(() => {
    cuandoExpireLaSesion(() => {
      ponerToken(null);
      guardarSesion(null);
      setSesion(null);
      setAviso("Tu sesión terminó. Vuelve a iniciar sesión.");
    });
  }, []);

  function ingresar(nueva: Sesion) {
    ponerToken(nueva.token);
    guardarSesion(nueva);
    setSesion(nueva);
    setAviso("");
  }

  function salir() {
    ponerToken(null);
    guardarSesion(null);
    setSesion(null);
    window.location.hash = "";
  }

  // La página del CLIENTE es pública: se muestra sin importar si hay sesión
  if (ruta.pagina === "subir") {
    return <SubirComprobantes token={ruta.token} />;
  }

  if (!sesion) {
    return (
      <main className="contenido">
        <Acceso aviso={aviso} alIngresar={ingresar} />
      </main>
    );
  }

  const esTitular = sesion.usuario.rol === "titular";
  const seccionActiva = ruta.pagina === "empresa" || ruta.pagina === "conciliacion" ? "empresas" : ruta.pagina;

  const opcion = (destino: Ruta, texto: string) => (
    <a className="menu-opcion" href={enlace(destino)} aria-current={seccionActiva === destino.pagina ? "page" : undefined}>
      {texto}
    </a>
  );

  return (
    <div className="app">
      <header className="cabecera">
        <div className="cabecera-interior">
          <a className="marca" href={enlace({ pagina: "empresas" })}>
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="28" height="28" />
            Copiloto contable
          </a>
          <nav className="menu" aria-label="Secciones">
            {opcion({ pagina: "empresas" }, "Empresas")}
            {opcion({ pagina: "equipo" }, "Equipo")}
            {esTitular && opcion({ pagina: "auditoria" }, "Auditoría")}
          </nav>
          <div className="usuario">
            <span>
              <strong>{sesion.usuario.nombre}</strong>
              <span className="sub tenue">{sesion.estudio.nombre}</span>
            </span>
            <button type="button" className="boton-enlace" onClick={salir}>Cerrar sesión</button>
          </div>
        </div>
      </header>

      <main className="contenido">
        {ruta.pagina === "empresas" && <Empresas />}
        {ruta.pagina === "empresa" && <Empresa key={ruta.id} id={ruta.id} sesion={sesion} />}
        {ruta.pagina === "conciliacion" && <Conciliacion key={ruta.id} id={ruta.id} />}
        {ruta.pagina === "equipo" && <Equipo sesion={sesion} />}
        {ruta.pagina === "auditoria" && (esTitular ? <Auditoria /> : <p className="tenue">Solo el titular puede ver la auditoría.</p>)}
      </main>

      <footer className="pie">
        Copiloto contable · Las acciones sugeridas no reemplazan el criterio del contador.
      </footer>
    </div>
  );
}
