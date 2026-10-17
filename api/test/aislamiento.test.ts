// ==========================================================
// LA PRUEBA MÁS IMPORTANTE DEL PRODUCTO: un estudio contable
// NUNCA puede ver ni tocar los datos de otro.
// Se prueba en dos niveles: la API (rutas) y la base de datos (RLS).
// ==========================================================
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { RUC_CLIENTE } from "motor-conciliacion";
import { iniciarServidorDePrueba } from "./helpers.ts";

const api = await iniciarServidorDePrueba();
after(() => api.cerrar());

let a: { token: string; estudioId: number };
let b: { token: string; estudioId: number };
let empresaA = 0;
let conciliacionA = 0;
let hallazgoA = 0;

before(async () => {
  a = await api.crearEstudio("Estudio A");
  b = await api.crearEstudio("Estudio B");

  const empresa = await api.peticion("POST", "/empresas", {
    token: a.token,
    body: { ruc: RUC_CLIENTE, razonSocial: "Cliente secreto de A" },
  });
  empresaA = empresa.body.id;
  const conciliacion = await api.peticion("POST", `/empresas/${empresaA}/conciliaciones`, {
    token: a.token,
    form: api.formularioDemo(),
  });
  conciliacionA = conciliacion.body.id;
  const detalle = await api.peticion("GET", `/conciliaciones/${conciliacionA}`, { token: a.token });
  hallazgoA = detalle.body.hallazgos[0].id;
});

describe("aislamiento a través de la API", () => {
  it("B no ve las empresas de A en su lista", async () => {
    const res = await api.peticion("GET", "/empresas", { token: b.token });
    assert.deepEqual(res.body, []);
  });

  it("B recibe 404 al pedir, editar o conciliar la empresa de A por su id", async () => {
    assert.equal((await api.peticion("GET", `/empresas/${empresaA}`, { token: b.token })).status, 404);
    const editar = await api.peticion("PUT", `/empresas/${empresaA}`, {
      token: b.token,
      body: { razonSocial: "Hackeada", activa: false },
    });
    assert.equal(editar.status, 404);
    const conciliar = await api.peticion("POST", `/empresas/${empresaA}/conciliaciones`, {
      token: b.token,
      form: api.formularioDemo(),
    });
    assert.equal(conciliar.status, 404);
    assert.equal((await api.peticion("GET", `/empresas/${empresaA}/conciliaciones`, { token: b.token })).status, 404);
  });

  it("B recibe 404 con las conciliaciones, el CSV y los hallazgos de A", async () => {
    assert.equal((await api.peticion("GET", `/conciliaciones/${conciliacionA}`, { token: b.token })).status, 404);
    assert.equal((await api.peticion("GET", `/conciliaciones/${conciliacionA}/csv`, { token: b.token })).status, 404);
    const marcar = await api.peticion("PATCH", `/hallazgos/${hallazgoA}`, { token: b.token, body: { revisado: true } });
    assert.equal(marcar.status, 404);
  });

  it("B no ve al equipo ni la auditoría de A", async () => {
    const equipo = await api.peticion("GET", "/usuarios", { token: b.token });
    assert.equal(equipo.body.length, 1); // solo su propio titular
    const auditoria = await api.peticion("GET", "/auditoria", { token: b.token });
    assert.ok(auditoria.body.every((x: { detalle: { ruc?: string } }) => x.detalle.ruc !== RUC_CLIENTE));
  });

  it("los datos de A siguen intactos después de los intentos de B", async () => {
    const res = await api.peticion("GET", `/empresas/${empresaA}`, { token: a.token });
    assert.equal(res.body.razonSocial, "Cliente secreto de A");
  });
});

describe("aislamiento en la base de datos (Row-Level Security)", () => {
  it("una consulta SIN filtro solo devuelve las filas del estudio activo", async () => {
    const filas = await api.conEstudio(b.estudioId, async (cliente) => {
      // Simula un error de programación: olvidar el WHERE estudio_id
      const { rows } = await cliente.query("SELECT * FROM empresas");
      const hallazgos = await cliente.query("SELECT * FROM hallazgos");
      return { empresas: rows.length, hallazgos: hallazgos.rowCount };
    });
    assert.deepEqual(filas, { empresas: 0, hallazgos: 0 });
  });

  it("no se puede insertar una fila a nombre de otro estudio", async () => {
    await assert.rejects(
      api.conEstudio(b.estudioId, (cliente) =>
        cliente.query("INSERT INTO empresas (estudio_id, ruc, razon_social) VALUES ($1, $2, 'Trampa')", [a.estudioId, RUC_CLIENTE])
      ),
      /row-level security/
    );
  });

  it("no se puede mover una fila propia a otro estudio", async () => {
    await assert.rejects(
      api.conEstudio(a.estudioId, (cliente) =>
        cliente.query("UPDATE empresas SET estudio_id = $1 WHERE id = $2", [b.estudioId, empresaA])
      ),
      /row-level security/
    );
  });

  it("sin estudio activo no se ve nada", async () => {
    const cliente = await api.pool.connect();
    try {
      await cliente.query("BEGIN");
      await cliente.query("SET LOCAL ROLE copiloto_app");
      const { rowCount } = await cliente.query("SELECT * FROM empresas");
      assert.equal(rowCount, 0);
    } finally {
      await cliente.query("ROLLBACK");
      cliente.release();
    }
  });
});
