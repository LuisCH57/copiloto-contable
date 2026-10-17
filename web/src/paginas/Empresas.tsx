// Cartera de empresas cliente del estudio
import { useState, type FormEvent } from "react";
import { esRucValido } from "motor-conciliacion/ruc";
import { api } from "../api.ts";
import { Cargando, MensajeError } from "../components/Comunes.tsx";
import { nombrePeriodo } from "../utils/formato.ts";
import { enlace, ir } from "../utils/ruta.ts";
import { useFetch } from "../utils/useFetch.ts";

export default function Empresas() {
  const { data, error, loading, reload } = useFetch(() => api.empresas(), "empresas");
  const [busqueda, setBusqueda] = useState("");
  const [formularioAbierto, setFormularioAbierto] = useState(false);

  const termino = busqueda.trim().toLowerCase();
  const empresas = (data ?? []).filter(
    (e) => !termino || e.razonSocial.toLowerCase().includes(termino) || e.ruc.includes(termino)
  );

  return (
    <section aria-labelledby="titulo-empresas">
      <div className="encabezado-seccion">
        <div>
          <h1 id="titulo-empresas">Empresas</h1>
          <p className="tenue">Tu cartera de clientes. Elige una para conciliar su registro de compras.</p>
        </div>
        {!formularioAbierto && (
          <button type="button" className="boton boton-principal" onClick={() => setFormularioAbierto(true)}>
            Agregar empresa
          </button>
        )}
      </div>

      {formularioAbierto && (
        <NuevaEmpresa
          alCancelar={() => setFormularioAbierto(false)}
          alCrear={(id) => {
            setFormularioAbierto(false);
            reload();
            ir({ pagina: "empresa", id });
          }}
        />
      )}

      <MensajeError error={error} />

      {loading && !data ? (
        <Cargando />
      ) : data && data.length === 0 ? (
        <div className="vacio">
          <p><strong>Aún no tienes empresas.</strong></p>
          <p className="tenue">Agrega la primera con su RUC para empezar a conciliar.</p>
        </div>
      ) : (
        <>
          <label className="campo campo-busqueda">
            <span className="oculto">Buscar empresa</span>
            <input type="search" placeholder="Buscar por razón social o RUC" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </label>
          <ul className="lista-empresas">
            {empresas.map((empresa) => (
              <li key={empresa.id}>
                <a className={`tarjeta tarjeta-enlace${empresa.activa ? "" : " inactiva"}`} href={enlace({ pagina: "empresa", id: empresa.id })}>
                  <span className="empresa-nombre">{empresa.razonSocial}</span>
                  <span className="mono tenue">RUC {empresa.ruc}</span>
                  <span className="empresa-periodo">
                    {empresa.ultimoPeriodo ? `Última conciliación: ${nombrePeriodo(empresa.ultimoPeriodo)}` : "Sin conciliaciones"}
                    {!empresa.activa && " · Inactiva"}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {empresas.length === 0 && <p className="tenue">Ninguna empresa coincide con “{busqueda}”.</p>}
        </>
      )}
    </section>
  );
}

function NuevaEmpresa({ alCancelar, alCrear }: { alCancelar: () => void; alCrear: (id: number) => void }) {
  const [ruc, setRuc] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [guardando, setGuardando] = useState(false);

  // Validación inmediata con el mismo código que usa el servidor
  const rucCompleto = ruc.length === 11;
  const rucValido = esRucValido(ruc);

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const empresa = await api.crearEmpresa(ruc, razonSocial);
      alCrear(empresa.id);
    } catch (err) {
      setError(err);
      setGuardando(false);
    }
  }

  return (
    <form className="tarjeta formulario formulario-linea" onSubmit={guardar}>
      <h2 className="titulo-tarjeta">Nueva empresa</h2>
      <div className="rejilla-campos">
        <label className="campo">
          <span>RUC</span>
          <input
            inputMode="numeric"
            value={ruc}
            onChange={(e) => setRuc(e.target.value.replace(/\D/g, "").slice(0, 11))}
            aria-invalid={rucCompleto && !rucValido}
            aria-describedby="ayuda-ruc"
            className="mono"
            required
          />
          <small id="ayuda-ruc" className={rucCompleto && !rucValido ? "texto-error" : "tenue"}>
            {rucCompleto ? (rucValido ? "RUC válido ✓" : "El dígito verificador no coincide.") : "11 dígitos"}
          </small>
        </label>
        <label className="campo">
          <span>Razón social</span>
          <input value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} required minLength={2} maxLength={200} />
        </label>
      </div>
      <MensajeError error={error} />
      <div className="acciones">
        <button type="button" className="boton" onClick={alCancelar}>Cancelar</button>
        <button type="submit" className="boton boton-principal" disabled={guardando || !rucValido}>
          {guardando ? "Guardando…" : "Guardar empresa"}
        </button>
      </div>
    </form>
  );
}
