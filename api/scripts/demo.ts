// ==========================================================
// MODO DEMO: la API con una base de datos PostgreSQL EN MEMORIA (PGlite).
// No necesita Neon ni archivo .env. Al detenerla (Ctrl + C) se borra todo.
// Sirve para probar la aplicación o mostrarla en una entrevista.
//   Uso:  npm run demo   (luego, en otra terminal: cd web && npm run dev)
// ==========================================================
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const db = await PGlite.create();
await db.exec(await readFile(new URL("../../database/schema.sql", import.meta.url), "utf8"));
const socket = new PGLiteSocketServer({ db, port: 55433, host: "127.0.0.1" });
await socket.start();

process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:55433/postgres";
process.env.JWT_SECRET ??= "clave-solo-para-el-modo-demo-no-usar-en-produccion";
process.env.PG_POOL_MAX = "1"; // PGlite acepta una conexión a la vez

const { app } = await import("../src/app.ts");
app.listen(3000, () => {
  console.log("Modo demo: API en http://localhost:3000/api con base de datos en memoria.");
  console.log("Ahora, en otra terminal: cd web && npm run dev");
});
