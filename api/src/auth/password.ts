// ==========================================================
// Contraseñas: nunca se guardan, solo su HASH (una "huella")
// ==========================================================
// Usamos scrypt, que viene incluido en Node. Es LENTO a propósito:
// para quien intente adivinar contraseñas probando millones de
// combinaciones, cada intento cuesta tiempo y memoria.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// promisify convierte scrypt (que usa "callbacks") en una función con await
const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keyLength: number) => Promise<Buffer>;

const KEY_LENGTH = 64;

// Convierte una contraseña en un texto guardable: "scrypt$<sal>$<hash>"
export async function hashPassword(password: string): Promise<string> {
  // La SAL es un valor aleatorio distinto para cada usuario.
  // Así, dos personas con la misma contraseña tienen hashes distintos.
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

// Comprueba si una contraseña corresponde al hash guardado
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, saltHex, hashHex] = stored.split("$");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) {
    return false;
  }

  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);

  // timingSafeEqual compara SIEMPRE en el mismo tiempo, acierte o no.
  // Una comparación normal se detiene en el primer carácter distinto, y
  // midiendo ese tiempo un atacante podría obtener pistas.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
