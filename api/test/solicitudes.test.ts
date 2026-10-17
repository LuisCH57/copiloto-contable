// Pruebas de la Fase 4: el cliente sube sus XML con un enlace
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { escenarioDemo, propuestaSire, RUC_CLIENTE, xmlUbl } from "motor-conciliacion";
import { iniciarServidorDePrueba } from "./helpers.ts";

const api = await iniciarServidorDePrueba();
after(() => api.cerrar());

// Formulario con los 9 XML del mes de ejemplo + un archivo que no es XML
function formularioCliente() {
  const form = new FormData();
  escenarioDemo().xmls.forEach((d, i) => form.append("xml", new Blob([xmlUbl(d)]), `factura-${i}.xml`));
  form.append("xml", new Blob(["hola, esto no es un XML"]), "notas.xml");
  return form;
}

describe("enlace para que el cliente suba sus comprobantes", () => {
  let token = "";
  let empresaId = 0;
  let solicitudId = 0;
  let enlace = "";

  before(async () => {
    ({ token } = await api.crearEstudio("Estudio Enlaces"));
    const empresa = await api.peticion("POST", "/empresas", { token, body: { ruc: RUC_CLIENTE, razonSocial: "Bodega Doña Rosa S.A.C." } });
    empresaId = empresa.body.id;
  });

  it("guarda el contacto del cliente y valida el celular", async () => {
    const malo = await api.peticion("PATCH", `/empresas/${empresaId}/contacto`, { token, body: { celular: "12345" } });
    assert.equal(malo.status, 400);
    const ok = await api.peticion("PATCH", `/empresas/${empresaId}/contacto`, {
      token, body: { contacto: "Rosa", celular: "+51 987 654 321", correo: "Rosa@Bodega.pe" },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.celular, "987654321");
    assert.equal(ok.body.correo, "rosa@bodega.pe");
  });

  it("crea un enlace por mes (pedirlo otra vez devuelve el mismo)", async () => {
    const res = await api.peticion("POST", `/empresas/${empresaId}/solicitudes`, { token, body: { periodo: "202609" } });
    assert.equal(res.status, 201);
    assert.match(res.body.token, /^\d+-[A-Za-z0-9_-]{43}$/);
    assert.equal(res.body.sello, undefined, "el sello no debe salir del servidor");
    assert.equal(res.body.vigente, true);
    solicitudId = res.body.id;
    enlace = res.body.token;

    const otraVez = await api.peticion("POST", `/empresas/${empresaId}/solicitudes`, { token, body: { periodo: "202609" } });
    assert.equal(otraVez.status, 200);
    assert.equal(otraVez.body.id, solicitudId);
  });

  it("el cliente abre el enlace SIN sesión y ve solo lo suyo", async () => {
    const res = await api.peticion("GET", `/publico/solicitudes/${enlace}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.razonSocial, "Bodega Doña Rosa S.A.C.");
    assert.equal(res.body.periodo, "202609");
    assert.match(res.body.estudio, /Estudio Enlaces/);
    assert.deepEqual(res.body.documentos, []);
  });

  it("rechaza enlaces inventados o alterados", async () => {
    const [id, firma] = enlace.split("-", 2) as [string, string];
    const alterada = firma.slice(0, -1) + (firma.endsWith("A") ? "B" : "A");
    for (const malo of ["abc", `${id}-${alterada}`, `${Number(id) + 1}-${firma}`, `${id}-corta`]) {
      const res = await api.peticion("GET", `/publico/solicitudes/${malo}`);
      assert.equal(res.status, 404, malo);
    }
  });

  it("revisa cada archivo: recibe, rechaza los de otro RUC y detecta repetidos", async () => {
    const res = await api.peticion("POST", `/publico/solicitudes/${enlace}/documentos`, { form: formularioCliente() });
    assert.equal(res.status, 201);
    const cuenta = (estado: string) => res.body.resultados.filter((r: { estado: string }) => r.estado === estado).length;
    assert.equal(cuenta("recibido"), 7);
    assert.equal(cuenta("rechazado"), 2); // otro receptor + el que no es XML
    assert.equal(cuenta("repetido"), 1);
    assert.equal(res.body.documentos.length, 7);
    assert.ok(res.body.resultados.some((r: { mensaje: string }) => r.mensaje.includes("agosto 2026")), "avisa del XML de otro mes");

    const otraVez = await api.peticion("POST", `/publico/solicitudes/${enlace}/documentos`, { form: formularioCliente() });
    assert.equal(otraVez.body.resultados.filter((r: { estado: string }) => r.estado === "recibido").length, 0);
    assert.equal(otraVez.body.documentos.length, 7);
  });

  it("el contador ve lo recibido y concilia con los XML del cliente", async () => {
    const lista = await api.peticion("GET", `/empresas/${empresaId}/solicitudes`, { token });
    assert.equal(lista.body[0].documentos, 7);
    const documentos = await api.peticion("GET", `/solicitudes/${solicitudId}/documentos`, { token });
    assert.equal(documentos.body.length, 7);
    const empresas = await api.peticion("GET", "/empresas", { token });
    assert.equal(empresas.body[0].ultimaSolicitud.documentos, 7);

    // Solo la propuesta del SIRE: los XML salen de lo que subió el cliente
    const form = new FormData();
    form.append("periodo", "202609");
    form.append("documentosCliente", "si");
    form.append("propuesta", new Blob([propuestaSire(RUC_CLIENTE, "202609", escenarioDemo().propuesta)]), "propuesta.txt");
    const res = await api.peticion("POST", `/empresas/${empresaId}/conciliaciones`, { token, form });
    assert.equal(res.status, 201);
    const { porEstado, totalXml } = res.body.resumen;
    assert.equal(totalXml, 7);
    assert.equal(porEstado.coincide, 4);
    assert.equal(porEstado.diferencia_monto, 1);
    assert.equal(porEstado.falta_xml, 1);
    assert.equal(porEstado.falta_en_propuesta, 1);
    assert.equal(porEstado.otro_periodo, 1);
  });

  it("anota los recordatorios enviados", async () => {
    const res = await api.peticion("POST", `/solicitudes/${solicitudId}/recordatorios`, { token, body: { canal: "whatsapp" } });
    assert.equal(res.status, 200);
    assert.equal(res.body.recordatorios, 1);
    assert.ok(res.body.ultimoRecordatorio);
    const malo = await api.peticion("POST", `/solicitudes/${solicitudId}/recordatorios`, { token, body: { canal: "paloma" } });
    assert.equal(malo.status, 400);
  });

  it("al cerrar el enlace deja de aceptar archivos; al renovarlo, el anterior ya no sirve", async () => {
    await api.peticion("PATCH", `/solicitudes/${solicitudId}`, { token, body: { cerrada: true } });
    assert.equal((await api.peticion("GET", `/publico/solicitudes/${enlace}`)).status, 410);

    const renovada = await api.peticion("POST", `/solicitudes/${solicitudId}/renovar`, { token });
    assert.equal(renovada.status, 200);
    assert.notEqual(renovada.body.token, enlace);
    assert.equal((await api.peticion("GET", `/publico/solicitudes/${enlace}`)).status, 404);
    const nueva = await api.peticion("GET", `/publico/solicitudes/${renovada.body.token}`);
    assert.equal(nueva.status, 200);
    assert.equal(nueva.body.documentos.length, 7, "los archivos recibidos se conservan");
    enlace = renovada.body.token;
  });

  it("las subidas del cliente quedan en la auditoría", async () => {
    const res = await api.peticion("GET", "/auditoria", { token });
    const evento = res.body.find((e: { accion: string }) => e.accion === "documentos_recibidos");
    assert.ok(evento);
    assert.equal(evento.usuario, null);
  });

  it("otro estudio no ve ni toca la solicitud", async () => {
    const otro = await api.crearEstudio("Intruso");
    const pruebas = [
      api.peticion("GET", `/empresas/${empresaId}/solicitudes`, { token: otro.token }),
      api.peticion("GET", `/solicitudes/${solicitudId}/documentos`, { token: otro.token }),
      api.peticion("POST", `/solicitudes/${solicitudId}/renovar`, { token: otro.token }),
      api.peticion("PATCH", `/solicitudes/${solicitudId}`, { token: otro.token, body: { cerrada: true } }),
      api.peticion("DELETE", `/solicitudes/${solicitudId}`, { token: otro.token }),
    ];
    for (const res of await Promise.all(pruebas)) assert.equal(res.status, 404);

    // Y en la base de datos, Row-Level Security tampoco le muestra nada (aunque falte un WHERE)
    const filas = await api.conEstudio(otro.estudioId, async (cliente) => ({
      solicitudes: (await cliente.query("SELECT * FROM solicitudes")).rowCount,
      documentos: (await cliente.query("SELECT * FROM documentos")).rowCount,
    }));
    assert.deepEqual(filas, { solicitudes: 0, documentos: 0 });
    assert.equal((await api.peticion("GET", `/publico/solicitudes/${enlace}`)).status, 200, "sigue intacta");
  });

  it("al borrar la solicitud se borran los archivos y el enlace deja de existir", async () => {
    assert.equal((await api.peticion("DELETE", `/solicitudes/${solicitudId}`, { token })).status, 204);
    assert.equal((await api.peticion("GET", `/publico/solicitudes/${enlace}`)).status, 404);
    const filas = await api.pool.query("SELECT count(*)::int AS n FROM documentos WHERE solicitud_id = $1", [solicitudId]);
    assert.equal(filas.rows[0].n, 0);
  });
});
