// ==========================================================
// Configuración: lee y valida las variables de entorno UNA vez.
// Si falta algo esencial, el programa se detiene con un mensaje claro.
// ==========================================================

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Falta la variable de entorno ${name}. Revisa tu archivo .env`);
    process.exit(1);
  }
  return value;
}

const jwtSecret = required("JWT_SECRET");
if (jwtSecret.length < 32) {
  console.error("JWT_SECRET es muy corta: usa al menos 32 caracteres aleatorios.");
  process.exit(1);
}

const produccion = process.env.NODE_ENV === "production";

export const config = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret,
  port: Number(process.env.PORT ?? 3000),
  produccion,
  corsOrigins: (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

// En producción, sin CORS_ORIGIN la aplicación web no podría usar la API: mejor avisar al arrancar
if (produccion && config.corsOrigins.length === 0) {
  console.error("Falta CORS_ORIGIN (por ejemplo, https://luisch57.github.io).");
  process.exit(1);
}
