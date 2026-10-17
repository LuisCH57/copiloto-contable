// ==========================================================
// Ayudante de pruebas: PostgreSQL en memoria (PGlite) + la API completa.
// Usa el MISMO esquema que producción, incluido Row-Level Security.
// ==========================================================
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { escenarioDemo, propuestaSire, xmlUbl } from "motor-conciliacion";

export interface Respuesta {
  status: number;
  body: any;
  texto: string;
  headers: Headers;
}

interface Opciones {
  token?: string;
  body?: unknown;
  form?: FormData;
}

export async function iniciarServidorDePrueba() {
  const db = await PGlite.create();
  await db.exec(await readFile(new URL("../../database/schema.sql", import.meta.url), "utf8"));

  const puerto = 50000 + Math.floor(Math.random() * 10000);
  const socket = new PGLiteSocketServer({ db, port: puerto, host: "127.0.0.1" });
  await socket.start();

  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${puerto}/postgres`;
  process.env.JWT_SECRET = "clave-solo-para-pruebas-".repeat(3);
  process.env.PG_POOL_MAX = "1"; // PGlite acepta una conexión a la vez
  process.env.NODE_ENV = "test";

  const { app } = await import("../src/app.ts");
  const { pool, conEstudio } = await import("../src/db.ts");

  const servidor = app.listen(0);
  await once(servidor, "listening");
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api`;

  async function peticion(metodo: string, ruta: string, opciones: Opciones = {}): Promise<Respuesta> {
    const headers: Record<string, string> = {};
    if (opciones.token) headers.Authorization = `Bearer ${opciones.token}`;
    let body: BodyInit | undefined;
    if (opciones.form) {
      body = opciones.form; // fetch pone el Content-Type multipart solo
    } else if (opciones.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opciones.body);
    }
    const respuesta = await fetch(`${base}${ruta}`, { method: metodo, headers, body });
    const texto = await respuesta.text();
    let json: unknown = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = null; // por ejemplo, el CSV
    }
    return { status: respuesta.status, body: json, texto, headers: respuesta.headers };
  }

  let contador = 0;
  // Registra un estudio nuevo con su titular y devuelve el token
  async function crearEstudio(nombre = "Estudio") {
    contador++;
    const { body } = await peticion("POST", "/auth/registro", {
      body: {
        nombreEstudio: `${nombre} ${contador}`,
        nombre: `Titular ${contador}`,
        email: `titular${contador}@estudio.pe`,
        password: "clave-segura-123",
      },
    });
    return { token: body.token as string, estudioId: body.estudio.id as number, usuarioId: body.usuario.id as number };
  }

  // Arma el formulario de una conciliación con el mes de ejemplo del motor
  function formularioDemo(periodo = "202609") {
    const { propuesta, xmls } = escenarioDemo();
    const form = new FormData();
    form.append("periodo", periodo);
    form.append("propuesta", new Blob([propuestaSire("20600000013", periodo, propuesta)]), "propuesta.txt");
    xmls.forEach((d, i) => form.append("xml", new Blob([xmlUbl(d)]), `comprobante-${i}.xml`));
    return form;
  }

  async function cerrar() {
    servidor.close();
    await pool.end();
    await socket.stop();
    await db.close();
  }

  return { peticion, crearEstudio, formularioDemo, pool, conEstudio, cerrar };
}
