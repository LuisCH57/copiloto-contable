# Cómo se cuidan los datos

Resumen técnico de qué datos guarda el Copiloto contable, para qué y por cuánto tiempo.
**No es asesoría legal.** Antes de usarlo con clientes reales, el estudio contable debe revisar sus
obligaciones con la Ley N.° 29733 de Protección de Datos Personales y su reglamento vigente, de
preferencia con un abogado.

## Qué se guarda

| Dato | Para qué | Cuánto tiempo |
|---|---|---|
| Nombre, correo y contraseña (cifrada con scrypt) de los usuarios del estudio | Iniciar sesión | Mientras exista la cuenta |
| RUC, razón social y contacto (nombre, celular, correo) de las empresas cliente | Identificar la empresa y enviarle el enlace | Mientras el estudio no la borre |
| Hallazgos de cada conciliación (comprobante, montos, explicación) | Que el contador revise y documente su trabajo | Mientras el estudio no los borre |
| XML que sube el cliente con su enlace | Usarlos en la conciliación del mes | Se borran solos 90 días después de que vence el enlace, o antes si el contador borra el enlace |
| Registro de auditoría (quién hizo qué y cuándo) | Control interno del estudio | Mientras exista el estudio |

**No se guardan:** los archivos que sube el contador para conciliar (se procesan en memoria), ni la
Clave SOL de nadie.

## Cómo se protegen

- Cada estudio solo ve sus datos: lo garantiza la base de datos (Row-Level Security), no solo el código.
- Conexiones cifradas (HTTPS y TLS hacia la base de datos).
- El enlace del cliente sirve para una sola empresa y un solo mes, vence a los 45 días y el contador puede anularlo.
- Las copias de seguridad se cifran antes de guardarse (ver [respaldos.md](respaldos.md)).
- Ningún secreto (contraseñas de la base, claves) está en el repositorio.

## Responsabilidades

El **estudio contable** decide qué datos de sus clientes sube y para qué; el Copiloto es la herramienta
con la que los procesa. Si un cliente pide que se borren sus datos, el contador puede borrar el enlace
(con sus XML) y la empresa.
