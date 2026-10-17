// Pruebas de los flujos principales: cuentas, equipo, empresas y conciliaciones
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { RUC_CLIENTE } from "motor-conciliacion";
import { iniciarServidorDePrueba } from "./helpers.ts";

const api = await iniciarServidorDePrueba();
after(() => api.cerrar());

describe("cuentas", () => {
  it("registra un estudio con su titular y devuelve un token", async () => {
    const res = await api.peticion("POST", "/auth/registro", {
      body: { nombreEstudio: "Estudio Quispe", nombre: "Ana Quispe", email: "Ana@Quispe.pe", password: "clave-segura-123" },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.usuario.rol, "titular");
    assert.equal(res.body.usuario.email, "ana@quispe.pe");
    assert.equal(res.body.estudio.nombre, "Estudio Quispe");
    assert.ok(res.body.token);
  });

  it("no permite dos cuentas con el mismo correo", async () => {
    const res = await api.peticion("POST", "/auth/registro", {
      body: { nombreEstudio: "Otro", nombre: "Otra Ana", email: "ana@quispe.pe", password: "clave-segura-456" },
    });
    assert.equal(res.status, 409);
  });

  it("exige una contraseña de al menos 10 caracteres", async () => {
    const res = await api.peticion("POST", "/auth/registro", {
      body: { nombreEstudio: "Estudio X", nombre: "X X", email: "x@x.pe", password: "corta" },
    });
    assert.equal(res.status, 400);
  });

  it("inicia sesión y responde igual si el correo no existe o la clave es incorrecta", async () => {
    const ok = await api.peticion("POST", "/auth/login", { body: { email: "ana@quispe.pe", password: "clave-segura-123" } });
    assert.equal(ok.status, 200);
    const malaClave = await api.peticion("POST", "/auth/login", { body: { email: "ana@quispe.pe", password: "otra-clave-xx" } });
    const sinCuenta = await api.peticion("POST", "/auth/login", { body: { email: "nadie@x.pe", password: "otra-clave-xx" } });
    assert.equal(malaClave.status, 401);
    assert.deepEqual(malaClave.body, sinCuenta.body);
  });

  it("sin sesión responde 401", async () => {
    assert.equal((await api.peticion("GET", "/empresas")).status, 401);
  });
});

describe("equipo del estudio", () => {
  let titular: { token: string };
  let asistenteToken = "";
  let asistenteId = 0;

  before(async () => {
    titular = await api.crearEstudio();
  });

  it("el titular agrega un asistente", async () => {
    const res = await api.peticion("POST", "/usuarios", {
      token: titular.token,
      body: { nombre: "Luis Asistente", email: "luis@estudio.pe", password: "clave-asistente-1" },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.rol, "asistente");
    asistenteId = res.body.id;
    const login = await api.peticion("POST", "/auth/login", { body: { email: "luis@estudio.pe", password: "clave-asistente-1" } });
    asistenteToken = login.body.token;
  });

  it("un asistente NO puede agregar usuarios ni ver la auditoría", async () => {
    const crear = await api.peticion("POST", "/usuarios", {
      token: asistenteToken,
      body: { nombre: "Intruso", email: "intruso@estudio.pe", password: "clave-intruso-1" },
    });
    assert.equal(crear.status, 403);
    assert.equal((await api.peticion("GET", "/auditoria", { token: asistenteToken })).status, 403);
  });

  it("al desactivar al asistente pierde el acceso de inmediato, aunque su token no haya vencido", async () => {
    const res = await api.peticion("PATCH", `/usuarios/${asistenteId}`, { token: titular.token, body: { activo: false } });
    assert.equal(res.status, 200);
    assert.equal((await api.peticion("GET", "/empresas", { token: asistenteToken })).status, 401);
    const login = await api.peticion("POST", "/auth/login", { body: { email: "luis@estudio.pe", password: "clave-asistente-1" } });
    assert.equal(login.status, 401);
  });

  it("el titular no puede desactivarse a sí mismo", async () => {
    const yo = await api.peticion("GET", "/auth/yo", { token: titular.token });
    const res = await api.peticion("PATCH", `/usuarios/${yo.body.id}`, { token: titular.token, body: { activo: false } });
    assert.equal(res.status, 400);
  });
});

describe("empresas y conciliaciones", () => {
  let token = "";
  let empresaId = 0;
  let conciliacionId = 0;

  before(async () => {
    token = (await api.crearEstudio()).token;
  });

  it("valida el RUC y no permite duplicados", async () => {
    const malo = await api.peticion("POST", "/empresas", { token, body: { ruc: "20600000010", razonSocial: "Bodega" } });
    assert.equal(malo.status, 400);

    const ok = await api.peticion("POST", "/empresas", { token, body: { ruc: RUC_CLIENTE, razonSocial: "Bodega Doña Rosa S.A.C." } });
    assert.equal(ok.status, 201);
    empresaId = ok.body.id;

    const repetida = await api.peticion("POST", "/empresas", { token, body: { ruc: RUC_CLIENTE, razonSocial: "Otra" } });
    assert.equal(repetida.status, 409);
  });

  it("concilia un mes subiendo la propuesta y los XML", async () => {
    const res = await api.peticion("POST", `/empresas/${empresaId}/conciliaciones`, { token, form: api.formularioDemo() });
    assert.equal(res.status, 201);
    assert.equal(res.body.resumen.porEstado.coincide, 4);
    assert.equal(res.body.resumen.porEstado.falta_xml, 1);
    assert.equal(res.body.resumen.igvFueraDePropuesta, 7560);
    conciliacionId = res.body.id;
  });

  it("muestra el detalle con los problemas primero", async () => {
    const res = await api.peticion("GET", `/conciliaciones/${conciliacionId}`, { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.hallazgos.length, 10);
    assert.notEqual(res.body.hallazgos[0].estado, "coincide");
    assert.equal(res.body.hallazgos.at(-1).estado, "coincide");
  });

  it("marca un hallazgo como revisado y lo descuenta de los pendientes", async () => {
    const detalle = await api.peticion("GET", `/conciliaciones/${conciliacionId}`, { token });
    const res = await api.peticion("PATCH", `/hallazgos/${detalle.body.hallazgos[0].id}`, { token, body: { revisado: true } });
    assert.equal(res.status, 200);
    assert.equal(res.body.revisado, true);

    const historial = await api.peticion("GET", `/empresas/${empresaId}/conciliaciones`, { token });
    assert.equal(historial.body[0].pendientes, 6);
    assert.equal(historial.body[0].sinRevisar, 5);
  });

  it("descarga el CSV para Excel", async () => {
    const res = await api.peticion("GET", `/conciliaciones/${conciliacionId}/csv`, { token });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/csv/);
    // fetch quita la marca BOM al leer el texto, por eso no se compara aquí
    assert.match(res.texto, /^﻿?Estado;/);
    assert.equal(res.texto.trim().split("\r\n").length, 11); // encabezado + 10 hallazgos
  });

  it("rechaza un periodo inválido y una propuesta que no se puede leer", async () => {
    const form = api.formularioDemo("202613");
    assert.equal((await api.peticion("POST", `/empresas/${empresaId}/conciliaciones`, { token, form })).status, 400);

    const mala = new FormData();
    mala.append("periodo", "202609");
    mala.append("propuesta", new Blob(["columna|otra\n1|2\n"]), "propuesta.txt");
    const res = await api.peticion("POST", `/empresas/${empresaId}/conciliaciones`, { token, form: mala });
    assert.equal(res.status, 400);
    assert.match(res.body.detalles[0], /No encontré las columnas/);
  });

  it("un XML dañado no detiene la conciliación: se informa aparte", async () => {
    const form = api.formularioDemo();
    form.append("xml", new Blob(["esto no es un xml"]), "danado.xml");
    const res = await api.peticion("POST", `/empresas/${empresaId}/conciliaciones`, { token, form });
    assert.equal(res.status, 201);
    assert.equal(res.body.archivosConError.length, 1);
  });

  it("registra las acciones en la auditoría", async () => {
    const res = await api.peticion("GET", "/auditoria", { token });
    const acciones = res.body.map((a: { accion: string }) => a.accion);
    assert.ok(acciones.includes("empresa_creada"));
    assert.ok(acciones.includes("conciliacion_creada"));
    assert.ok(acciones.includes("hallazgo_revisado"));
  });
});
