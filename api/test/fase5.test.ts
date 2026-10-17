// Pruebas de la Fase 5: recordatorios del día, limpieza de XML antiguos y seguridad
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { escenarioDemo, RUC_CLIENTE, xmlUbl } from "motor-conciliacion";
import { iniciarServidorDePrueba } from "./helpers.ts";

const api = await iniciarServidorDePrueba();
after(() => api.cerrar());

describe("recordatorios del día", () => {
  let token = "";
  let empresaId = 0;
  let solicitud: { id: number; token: string };

  before(async () => {
    ({ token } = await api.crearEstudio("Estudio Recordatorios"));
    empresaId = (await api.peticion("POST", "/empresas", { token, body: { ruc: RUC_CLIENTE, razonSocial: "Bodega" } })).body.id;
    solicitud = (await api.peticion("POST", `/empresas/${empresaId}/solicitudes`, { token, body: { periodo: "202609" } })).body;
  });

  it("muestra el enlace que todavía no se envía", async () => {
    const res = await api.peticion("GET", "/recordatorios", { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].empresa.razonSocial, "Bodega");
    assert.equal(res.body[0].solicitud.id, solicitud.id);
  });

  it("después de enviarlo, no vuelve a aparecer hasta dentro de 3 días", async () => {
    await api.peticion("POST", `/solicitudes/${solicitud.id}/recordatorios`, { token, body: { canal: "whatsapp" } });
    assert.equal((await api.peticion("GET", "/recordatorios", { token })).body.length, 0);

    // Simulamos que el último envío fue hace 4 días
    await api.pool.query("UPDATE solicitudes SET ultimo_recordatorio = now() - interval '4 days' WHERE id = $1", [solicitud.id]);
    assert.equal((await api.peticion("GET", "/recordatorios", { token })).body.length, 1);
  });

  it("si el cliente ya subió XML, no hay que recordarle", async () => {
    const form = new FormData();
    form.append("xml", new Blob([xmlUbl(escenarioDemo().xmls[0]!)]), "f.xml");
    await api.peticion("POST", `/publico/solicitudes/${solicitud.token}/documentos`, { form });
    assert.equal((await api.peticion("GET", "/recordatorios", { token })).body.length, 0);
  });

  it("otro estudio no ve los recordatorios ajenos", async () => {
    const otro = await api.crearEstudio("Otro");
    await api.pool.query("UPDATE solicitudes SET ultimo_recordatorio = NULL");
    await api.pool.query("DELETE FROM documentos");
    assert.equal((await api.peticion("GET", "/recordatorios", { token: otro.token })).body.length, 0);
    assert.equal((await api.peticion("GET", "/recordatorios", { token })).body.length, 1);
  });
});

describe("limpieza de XML antiguos", () => {
  it("borra los XML de enlaces vencidos hace más de 90 días y conserva los demás", async () => {
    const { token } = await api.crearEstudio("Estudio Limpieza");
    const empresaId = (await api.peticion("POST", "/empresas", { token, body: { ruc: RUC_CLIENTE, razonSocial: "Bodega" } })).body.id;
    const subir = async (periodo: string) => {
      const s = (await api.peticion("POST", `/empresas/${empresaId}/solicitudes`, { token, body: { periodo } })).body;
      const form = new FormData();
      form.append("xml", new Blob([xmlUbl(escenarioDemo().xmls[0]!)]), "f.xml");
      await api.peticion("POST", `/publico/solicitudes/${s.token}/documentos`, { form });
      return s.id as number;
    };
    const vieja = await subir("202601");
    const reciente = await subir("202609");
    await api.pool.query("UPDATE solicitudes SET vence_en = now() - interval '91 days' WHERE id = $1", [vieja]);

    const { borrarDocumentosAntiguos } = await import("../src/limpieza.ts");
    assert.equal(await borrarDocumentosAntiguos(), 1);
    const quedan = await api.pool.query(
      "SELECT solicitud_id FROM documentos WHERE solicitud_id = ANY($1::int[])",
      [[vieja, reciente]]
    );
    assert.deepEqual(quedan.rows.map((f) => f.solicitud_id), [reciente]);
  });
});

describe("seguridad", () => {
  it("responde con cabeceras de seguridad y sin caché", async () => {
    const res = await api.peticion("GET", "/health");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("x-powered-by"), null);
  });

  it("frena los intentos repetidos de inicio de sesión", async () => {
    let ultima = 0;
    for (let i = 0; i < 21; i++) {
      ultima = (await api.peticion("POST", "/auth/login", { body: { email: "nadie@x.pe", password: "adivinando-123" } })).status;
    }
    assert.equal(ultima, 429);
  });
});
