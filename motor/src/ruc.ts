// ==========================================================
// Validación del RUC peruano (11 dígitos con dígito verificador).
// El último dígito se calcula con el método "módulo 11":
// se multiplica cada uno de los 10 primeros dígitos por un peso,
// se suman, y el resto de dividir entre 11 da el dígito esperado.
// ==========================================================

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
// Prefijos válidos: 10 (persona natural), 15/16/17 (casos especiales), 20 (empresa)
const PREFIJOS = ["10", "15", "16", "17", "20"];

export function esRucValido(ruc: string): boolean {
  if (!/^\d{11}$/.test(ruc)) return false;
  if (!PREFIJOS.includes(ruc.slice(0, 2))) return false;

  const suma = PESOS.reduce((total, peso, i) => total + peso * Number(ruc[i]), 0);
  const resto = 11 - (suma % 11);
  const esperado = resto === 10 ? 0 : resto === 11 ? 1 : resto;
  return esperado === Number(ruc[10]);
}

// Para generar datos de ejemplo: completa un RUC de 10 dígitos con su verificador
export function completarRuc(diezDigitos: string): string {
  const suma = PESOS.reduce((total, peso, i) => total + peso * Number(diezDigitos[i]), 0);
  const resto = 11 - (suma % 11);
  const verificador = resto === 10 ? 0 : resto === 11 ? 1 : resto;
  return `${diezDigitos}${verificador}`;
}
