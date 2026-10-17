# Copias de seguridad

## Qué se respalda y dónde

- Cada domingo a las 3:17 a. m. (hora de Lima), el flujo **Copia de seguridad** de GitHub Actions
  (`.github/workflows/respaldo.yml`) descarga toda la base de datos con `pg_dump`.
- El archivo se **cifra con AES-256** (`gpg`) usando el secreto `RESPALDO_CLAVE` antes de salir del servidor de GitHub.
  Sin esa clave nadie puede leerlo, ni siquiera quien tenga acceso al repositorio.
- Se guarda como *artifact* del flujo durante **30 días** (unas 4 copias semanales).
- Además, Neon guarda un historial que permite volver a un momento reciente (*point-in-time restore*);
  cuánto tiempo depende del plan. Revisa el plan vigente en neon.com.

> Guarda `RESPALDO_CLAVE` también fuera de GitHub (por ejemplo, en un gestor de contraseñas).
> Si se pierde, los respaldos no se pueden abrir.

## Hacer un respaldo ahora

GitHub → pestaña **Actions** → **Copia de seguridad** → **Run workflow**.

## Restaurar un respaldo

Necesitas PostgreSQL 18 (o más nuevo) instalado en tu computadora para tener `pg_restore`, y `gpg`
(Git Bash ya lo incluye).

1. Descarga el respaldo: Actions → la ejecución que quieras → sección **Artifacts** → descarga y descomprime el `.zip`.
2. Descífralo (te pedirá la frase de `RESPALDO_CLAVE`):
   ```bash
   gpg --output respaldo.dump --decrypt respaldo-AAAAMMDD.dump.gpg
   ```
3. Crea en Neon una base de datos **nueva** (no sobrescribas la actual mientras no confirmes que el respaldo está bien).
   En su SQL Editor crea el rol de la aplicación:
   ```sql
   CREATE ROLE copiloto_app NOLOGIN;
   GRANT copiloto_app TO CURRENT_USER;
   ```
4. Restaura (usa la cadena de conexión de esa base nueva, sin escribirla en ningún archivo del repositorio):
   ```bash
   pg_restore --no-owner --dbname "CADENA_DE_CONEXION_DE_LA_BASE_NUEVA" respaldo.dump
   ```
5. Revisa que estén los datos y, si todo está bien, cambia `DATABASE_URL` en Render a la base restaurada.
6. Borra `respaldo.dump` de tu computadora: contiene datos de clientes sin cifrar.

Este procedimiento se probó con una base de PostgreSQL de prueba: respaldo, cifrado, descifrado y
restauración, conservando los datos, las políticas de Row-Level Security y los permisos del rol `copiloto_app`.
