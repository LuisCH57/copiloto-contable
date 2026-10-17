# Copiloto contable

Herramienta para estudios contables del Perú: concilia la **propuesta del SIRE** (registro de compras que arma SUNAT) con los **XML de los comprobantes** que entregan los clientes, y explica cada diferencia con la acción a seguir.

> **Estado:** Fase 2 de 5. Funcionan el motor de conciliación y la API para varios estudios contables, con aislamiento de datos entre estudios. Falta la aplicación web y probar con un archivo real de la propuesta del SIRE.

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

## Cómo ejecutarlo

Requiere Node.js 24 y una base de datos PostgreSQL (por ejemplo, gratis en [Neon](https://neon.com)).

```bash
npm install                      # instala motor y api (npm workspaces)
npm test                         # 45 pruebas: no necesitan base de datos
```

Para usar la API con tu base de datos:

1. Ejecuta `database/schema.sql` en tu base de datos (en Neon: SQL Editor).
2. Copia `api/.env.example` como `api/.env` y completa `DATABASE_URL` y `JWT_SECRET`.
3. Inicia la API:
   ```bash
   cd api
   npm run dev
   ```
4. Prueba las rutas con `api/requests.http` (extensión REST Client de VS Code). Antes ejecuta `npm run ejemplos` dentro de `motor/` para crear los archivos ficticios.

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
| 3 | Aplicación web: cartera de clientes, carga de archivos, conciliación del mes y calendario de vencimientos | Pendiente |
| 4 | Enlace para que los clientes del contador suban sus comprobantes, con recordatorios | Pendiente |
| 5 | Publicación, seguridad, copias de seguridad y piloto con contadores reales | Pendiente |

## Decisiones técnicas

- **El motor es una función pura** (`conciliar`): recibe datos y devuelve hallazgos, sin leer archivos ni base de datos. La misma lógica servirá en la línea de comandos, la API y las tareas en segundo plano.
- **La propuesta del SIRE se lee por nombre de columna, no por posición.** No pude confirmar el orden exacto de las columnas en la documentación pública, así que el lector acepta variantes de nombres. Si falta una columna, el error muestra los encabezados encontrados.
- **Aislamiento entre estudios en la base de datos, no solo en el código.** Cada consulta de un estudio corre con el rol `copiloto_app` y la variable `app.estudio_id`, y las políticas de Row-Level Security de PostgreSQL filtran todas las tablas. Aunque una ruta olvide un `WHERE estudio_id`, la base de datos no devuelve datos ajenos. Las llaves foráneas dobles (`empresa_id` + `estudio_id`) impiden además mezclar filas de estudios distintos.
- **404 en vez de 403 para datos de otro estudio:** así nadie puede averiguar qué ids existen.
- **Desactivar a un usuario corta su acceso de inmediato,** sin esperar a que venza su token.
- **Los archivos subidos no se guardan:** se procesan en memoria y solo se conservan los hallazgos (minimización de datos personales).
- **Auditoría** de inicios de sesión, cambios de equipo, empresas, conciliaciones y revisiones.
- **Montos en céntimos** (enteros) para evitar errores de redondeo.
- **Sin Clave SOL en la primera versión:** el contador descarga los archivos y los sube. La conexión directa con la API del SIRE se evaluará después, por el riesgo de guardar credenciales de terceros.
- **Datos de clientes fuera del repositorio:** el `.gitignore` excluye `datos-reales/`, los `.zip` y `salidas/`. Las pruebas usan solo datos ficticios.

## Limitaciones actuales

- Falta confirmar el formato de la propuesta con un archivo real.
- Solo concilia el **registro de compras**, no el de ventas.
- No procesa todavía archivos `.zip` ni comprobantes en PDF o foto.
- Esto **no es asesoría tributaria**: el contador valida cada acción sugerida.
