# Copiloto contable

Herramienta para estudios contables del Perú: concilia la **propuesta del SIRE** (registro de compras que arma SUNAT) con los **XML de los comprobantes** que entregan los clientes, y explica cada diferencia con la acción a seguir.

> **Estado:** Fase 4 de 5. Funcionan el motor de conciliación, la API para varios estudios contables (con aislamiento de datos entre estudios), la aplicación web y el enlace para que los clientes suban sus XML. Falta publicarlo y probarlo con un archivo real de la propuesta del SIRE.

## Qué detecta

| Hallazgo | Qué significa | Acción sugerida |
|---|---|---|
| Falta el XML del cliente | SUNAT tiene la compra, pero el cliente no entregó el comprobante | Pedírselo al cliente o al proveedor |
| No está en la propuesta de SUNAT | El cliente tiene el XML, pero SUNAT no lo propone | Agregarlo a la propuesta si es una compra válida del periodo |
| Montos distintos | Base, IGV o total no coinciden (tolerancia de 1 céntimo) | Revisar el XML; pedir una nota de crédito o débito si el proveedor informó mal |
| Emitido a otro RUC | El comprobante no es del cliente | No usar su IGV como crédito fiscal |
| De otro periodo | La fecha está fuera del mes que se concilia | Revisar a qué periodo corresponde |
| Duplicado | El mismo comprobante llegó dos veces | No registrarlo dos veces |
| RUC del proveedor no válido | El dígito verificador no cuadra | Verificar en la consulta RUC |

El resumen calcula el **IGV en riesgo**: el crédito fiscal de compras que SUNAT no propone y el IGV propuesto que no tiene XML de respaldo.

## Estructura

| Carpeta | Contenido |
|---|---|
| `motor/` | Motor de conciliación: lectores de XML UBL 2.1 y de la propuesta del SIRE, reglas y reporte CSV. Funciona también desde la línea de comandos. |
| `api/` | API REST (Node.js, Express, TypeScript): estudios, usuarios, empresas cliente, conciliaciones y auditoría |
| `web/` | Aplicación web (React, TypeScript, Vite): cartera de empresas, subida de archivos, revisión de hallazgos, equipo, auditoría y la página pública donde el cliente sube sus XML |
| `database/` | Esquema de PostgreSQL con Row-Level Security |

## API

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/api/auth/registro` | Público | Crear un estudio contable y su usuario titular |
| POST | `/api/auth/login` | Público | Iniciar sesión |
| GET | `/api/auth/yo` | Con sesión | Usuario y estudio actuales |
| GET / POST | `/api/usuarios` | Ver: todos · Crear: titular | Equipo del estudio |
| PATCH | `/api/usuarios/:id` | Titular | Activar o desactivar a un miembro |
| GET / POST | `/api/empresas` | Con sesión | Cartera de empresas cliente (valida el RUC) |
| GET / PUT | `/api/empresas/:id` | Con sesión | Ver o editar una empresa |
| POST | `/api/empresas/:id/conciliaciones` | Con sesión | Subir la propuesta y los XML de un mes (multipart) y conciliar |
| GET | `/api/empresas/:id/conciliaciones` | Con sesión | Historial con hallazgos pendientes y sin revisar |
| GET | `/api/conciliaciones/:id` | Con sesión | Detalle con hallazgos (los problemas primero) |
| GET | `/api/conciliaciones/:id/csv` | Con sesión | Descargar el detalle para Excel |
| PATCH | `/api/hallazgos/:id` | Con sesión | Marcar un hallazgo como revisado |
| GET | `/api/auditoria` | Titular | Últimas 100 acciones del estudio |
| PATCH | `/api/empresas/:id/contacto` | Con sesión | Contacto del cliente (nombre, celular, correo) |
| GET / POST | `/api/empresas/:id/solicitudes` | Con sesión | Enlaces para pedir los XML de un mes |
| GET | `/api/solicitudes/:id/documentos` | Con sesión | XML que subió el cliente |
| POST | `/api/solicitudes/:id/renovar` | Con sesión | Enlace nuevo (anula el anterior) |
| PATCH / DELETE | `/api/solicitudes/:id` | Con sesión | Cerrar o reabrir · borrar con sus XML |
| POST | `/api/solicitudes/:id/recordatorios` | Con sesión | Anotar que se envió el enlace |
| GET | `/api/publico/solicitudes/:token` | Enlace | Lo que ve el cliente: empresa, mes y XML recibidos |
| POST | `/api/publico/solicitudes/:token/documentos` | Enlace | El cliente sube XML; responde archivo por archivo |

## Cómo ejecutarlo

Requiere Node.js 24 y una base de datos PostgreSQL (por ejemplo, gratis en [Neon](https://neon.com)).

```bash
npm install                      # instala motor y api (npm workspaces)
npm test                         # 56 pruebas: no necesitan base de datos
```

**Probar sin base de datos (modo demo):** la API arranca con un PostgreSQL en memoria; al detenerla se borra todo.

```bash
npm run demo --workspace api     # terminal 1: API en http://localhost:3000
cd web && npm run dev            # terminal 2: abre http://localhost:5173/
```

Para usar la API con tu base de datos:

1. Ejecuta `database/schema.sql` en tu base de datos (en Neon: SQL Editor).
2. Copia `api/.env.example` como `api/.env` y completa `DATABASE_URL` y `JWT_SECRET`.
3. Inicia la API:
   ```bash
   cd api
   npm run dev
   ```
4. En otra terminal, inicia la aplicación web y abre `http://localhost:5173`:
   ```bash
   cd web
   npm run dev
   ```
5. También puedes probar las rutas con `api/requests.http` (extensión REST Client de VS Code). Antes ejecuta `npm run ejemplos` dentro de `motor/` para crear los archivos ficticios.

El motor también funciona solo, desde la línea de comandos:

```bash
cd motor
npm run ejemplos
npm run conciliar -- --ruc 20600000013 --periodo 202609 \
  --propuesta salidas/ejemplo/propuesta-202609.txt --xml salidas/ejemplo/xml
```

## Hoja de ruta

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Motor de conciliación: lectores de XML UBL 2.1 y de la propuesta del SIRE, reglas, reporte CSV, pruebas | Hecha |
| 2 | API y base de datos para varios estudios contables (PostgreSQL con aislamiento por estudio), usuarios, roles y auditoría | Hecha |
| 3 | Aplicación web: cartera de empresas, subida de archivos (también arrastrando la carpeta), revisión de hallazgos con filtros, equipo y auditoría | Hecha |
| 4 | Enlace para que los clientes del contador suban sus XML (también en .zip), envío y recordatorios por WhatsApp o correo | Hecha |
| 5 | Publicación, seguridad, copias de seguridad y piloto con contadores reales | Pendiente |

## Decisiones técnicas

- **El motor es una función pura** (`conciliar`): recibe datos y devuelve hallazgos, sin leer archivos ni base de datos. La misma lógica servirá en la línea de comandos, la API y las tareas en segundo plano.
- **La propuesta del SIRE se lee por nombre de columna, no por posición.** No pude confirmar el orden exacto de las columnas en la documentación pública, así que el lector acepta variantes de nombres. Si falta una columna, el error muestra los encabezados encontrados.
- **Aislamiento entre estudios en la base de datos, no solo en el código.** Cada consulta de un estudio corre con el rol `copiloto_app` y la variable `app.estudio_id`, y las políticas de Row-Level Security de PostgreSQL filtran todas las tablas. Aunque una ruta olvide un `WHERE estudio_id`, la base de datos no devuelve datos ajenos. Las llaves foráneas dobles (`empresa_id` + `estudio_id`) impiden además mezclar filas de estudios distintos.
- **404 en vez de 403 para datos de otro estudio:** así nadie puede averiguar qué ids existen.
- **Desactivar a un usuario corta su acceso de inmediato,** sin esperar a que venza su token.
- **Los archivos que sube el contador no se guardan:** se procesan en memoria y solo se conservan los hallazgos (minimización de datos personales). Los XML que sube el cliente sí se guardan, porque el contador los usa después; se borran junto con su enlace.
- **Enlaces firmados para el cliente, sin cuenta:** el enlace es `id-firma`, con firma HMAC-SHA256 hecha con una clave que solo conoce el servidor. El enlace no se guarda en la base de datos; cambiar el "sello" de la solicitud lo anula. Sirve para una sola empresa y un solo mes, vence a los 45 días y se puede cerrar.
- **Rutas públicas con límite de peticiones** por IP (120 cada 15 minutos) y comparación de la firma en tiempo constante.
- **Revisión inmediata de lo que sube el cliente:** se rechazan los archivos que no son comprobantes y los emitidos a otro RUC, se detectan repetidos y se avisa si un XML es de otro mes.
- **Los .zip se abren en el navegador** (fflate): al servidor solo llegan los XML.
- **Recordatorios desde el WhatsApp o el correo del contador** (enlaces `wa.me` y `mailto:`): el cliente recibe el mensaje de alguien que conoce, y no hace falta contratar un servicio de envíos.
- **Auditoría** de inicios de sesión, cambios de equipo, empresas, conciliaciones, revisiones, enlaces y subidas del cliente.
- **Montos en céntimos** (enteros) para evitar errores de redondeo.
- **Sin Clave SOL en la primera versión:** el contador descarga los archivos y los sube. La conexión directa con la API del SIRE se evaluará después, por el riesgo de guardar credenciales de terceros.
- **Datos de clientes fuera del repositorio:** el `.gitignore` excluye `datos-reales/`, los `.zip` y `salidas/`. Las pruebas usan solo datos ficticios.

## Limitaciones actuales

- Falta confirmar el formato de la propuesta con un archivo real.
- Solo concilia el **registro de compras**, no el de ventas.
- No lee comprobantes en PDF ni en foto (solo XML, sueltos o dentro de un `.zip`).
- Los recordatorios todavía los envía el contador con un clic; no son automáticos.
- Esto **no es asesoría tributaria**: el contador valida cada acción sugerida.
