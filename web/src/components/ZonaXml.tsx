// ==========================================================
// Zona para elegir XML: arrastrar una carpeta, elegir archivos o una carpeta.
// También acepta .ZIP (así suelen llegar las facturas por correo):
// se abren AQUÍ, en el navegador, y solo se toman los .xml de adentro.
// La usan el contador (conciliar) y el cliente (subir sus comprobantes).
// ==========================================================
import { useState, type DragEvent, type ReactNode } from "react";
import { unzipSync } from "fflate";

// Al soltar una CARPETA, el navegador entrega "entradas" que hay que recorrer
type Entrada = {
  isFile: boolean;
  isDirectory: boolean;
  file?: (ok: (f: File) => void, error: () => void) => void;
  createReader?: () => { readEntries: (ok: (e: Entrada[]) => void) => void };
};

async function archivosDeEntrada(entrada: Entrada): Promise<File[]> {
  if (entrada.isFile && entrada.file) {
    return [await new Promise<File>((ok, error) => entrada.file!(ok, error))];
  }
  if (entrada.isDirectory && entrada.createReader) {
    const lector = entrada.createReader();
    const todas: Entrada[] = [];
    // readEntries devuelve los archivos por tandas: se llama hasta que no quede nada
    for (;;) {
      const tanda = await new Promise<Entrada[]>((ok) => lector.readEntries(ok));
      if (tanda.length === 0) break;
      todas.push(...tanda);
    }
    return (await Promise.all(todas.map(archivosDeEntrada))).flat();
  }
  return [];
}

const esXml = (nombre: string) => nombre.toLowerCase().endsWith(".xml");
const esZip = (nombre: string) => nombre.toLowerCase().endsWith(".zip");

// Separa los XML, abre los ZIP y descarta lo demás (PDF, imágenes...)
async function extraerXml(archivos: File[]): Promise<{ xmls: File[]; avisos: string[] }> {
  const xmls: File[] = [];
  const avisos: string[] = [];
  let ignorados = 0;
  for (const archivo of archivos) {
    if (esXml(archivo.name)) {
      xmls.push(archivo);
    } else if (esZip(archivo.name)) {
      try {
        const contenido = unzipSync(new Uint8Array(await archivo.arrayBuffer()), {
          filter: (entrada) => esXml(entrada.name) && !entrada.name.startsWith("__MACOSX/"),
        });
        const nombres = Object.keys(contenido);
        if (nombres.length === 0) avisos.push(`${archivo.name} no tiene archivos XML adentro.`);
        for (const nombre of nombres) {
          const base = nombre.split("/").pop()!;
          xmls.push(new File([contenido[nombre]!], base, { type: "text/xml" }));
        }
      } catch {
        avisos.push(`No se pudo abrir ${archivo.name}. ¿Está dañado o protegido con contraseña?`);
      }
    } else {
      ignorados++;
    }
  }
  if (ignorados > 0) {
    avisos.push(`Se dejaron de lado ${ignorados} ${ignorados === 1 ? "archivo que no es" : "archivos que no son"} XML ni ZIP (por ejemplo, PDF).`);
  }
  return { xmls, avisos };
}

interface Props {
  archivos: File[];
  alCambiar: (archivos: File[]) => void;
  titulo: ReactNode;
  deshabilitada?: boolean;
}

export default function ZonaXml({ archivos, alCambiar, titulo, deshabilitada = false }: Props) {
  const [arrastrando, setArrastrando] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);

  async function agregar(nuevos: File[]) {
    const { xmls, avisos } = await extraerXml(nuevos);
    setAvisos(avisos);
    // Evita repetir el mismo archivo si se agrega dos veces
    const vistos = new Set(archivos.map((a) => `${a.name}-${a.size}`));
    alCambiar([...archivos, ...xmls.filter((a) => !vistos.has(`${a.name}-${a.size}`))]);
  }

  async function soltar(evento: DragEvent<HTMLDivElement>) {
    evento.preventDefault();
    setArrastrando(false);
    if (deshabilitada) return;
    const entradas = Array.from(evento.dataTransfer.items)
      .map((item) => item.webkitGetAsEntry?.() as Entrada | null)
      .filter((e): e is Entrada => e !== null);
    await agregar(entradas.length > 0 ? (await Promise.all(entradas.map(archivosDeEntrada))).flat() : Array.from(evento.dataTransfer.files));
  }

  return (
    <div
      className={`zona-archivos${arrastrando ? " arrastrando" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={soltar}
    >
      <p>{titulo}</p>
      <p className="tenue">También puedes soltar archivos .zip: se toman los XML de adentro.</p>
      <div className="acciones-centro">
        <label className={`boton${deshabilitada ? " deshabilitado" : ""}`}>
          Elegir archivos
          <input
            type="file"
            accept=".xml,.zip"
            multiple
            className="oculto"
            disabled={deshabilitada}
            onChange={(e) => {
              void agregar(Array.from(e.target.files ?? []));
              e.target.value = ""; // permite elegir de nuevo los mismos archivos
            }}
          />
        </label>
        <label className={`boton${deshabilitada ? " deshabilitado" : ""}`}>
          Elegir una carpeta
          <input
            type="file"
            className="oculto"
            disabled={deshabilitada}
            // webkitdirectory: permite elegir una carpeta completa (no está en los tipos de React)
            {...({ webkitdirectory: "" } as Record<string, string>)}
            onChange={(e) => {
              void agregar(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="contador-xml" aria-live="polite">
        {archivos.length === 0 ? "Ningún XML seleccionado" : `${archivos.length} XML listos`}
        {archivos.length > 0 && !deshabilitada && (
          <button type="button" className="boton-enlace" onClick={() => alCambiar([])}>Quitar todos</button>
        )}
      </p>
      {avisos.length > 0 && (
        <ul className="avisos-zona" role="status">
          {avisos.map((a) => <li key={a}>{a}</li>)}
        </ul>
      )}
    </div>
  );
}
