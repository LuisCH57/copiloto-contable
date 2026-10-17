# Copiloto contable

Herramienta para estudios contables del Perú: concilia la **propuesta del SIRE** (registro de compras que arma SUNAT) con los **XML de los comprobantes** que entregan los clientes, y explica cada diferencia con la acción a seguir.

> **Estado:** Fase 1 de 5. El motor de conciliación funciona desde la línea de comandos con datos de ejemplo ficticios. Falta probarlo con un archivo real de la propuesta del SIRE para confirmar los nombres de sus columnas.

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

## Cómo probarlo

Requiere Node.js 24.

```bash
cd motor
npm install
npm run ejemplos          # crea un mes de datos FICTICIOS en salidas/ejemplo/
npm run conciliar -- --ruc 20600000013 --periodo 202609 \
  --propuesta salidas/ejemplo/propuesta-202609.txt --xml salidas/ejemplo/xml
npm test                  # 19 pruebas automáticas
```

El detalle se guarda en un CSV que se abre directamente en Excel.

## Hoja de ruta

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Motor de conciliación: lectores de XML UBL 2.1 y de la propuesta del SIRE, reglas, reporte CSV, pruebas | Hecha |
| 2 | API y base de datos para varios estudios contables (PostgreSQL con aislamiento por estudio), usuarios y roles | Pendiente |
| 3 | Aplicación web: cartera de clientes, carga de archivos, conciliación del mes y calendario de vencimientos | Pendiente |
| 4 | Enlace para que los clientes del contador suban sus comprobantes, con recordatorios | Pendiente |
| 5 | Publicación, seguridad, copias de seguridad y piloto con contadores reales | Pendiente |

## Decisiones técnicas

- **El motor es una función pura** (`conciliar`): recibe datos y devuelve hallazgos, sin leer archivos ni base de datos. La misma lógica servirá en la línea de comandos, la API y las tareas en segundo plano.
- **La propuesta del SIRE se lee por nombre de columna, no por posición.** No pude confirmar el orden exacto de las columnas en la documentación pública, así que el lector acepta variantes de nombres. Si falta una columna, el error muestra los encabezados encontrados.
- **Montos en céntimos** (enteros) para evitar errores de redondeo.
- **Sin Clave SOL en la primera versión:** el contador descarga los archivos y los sube. La conexión directa con la API del SIRE se evaluará después, por el riesgo de guardar credenciales de terceros.
- **Datos de clientes fuera del repositorio:** el `.gitignore` excluye `datos-reales/`, los `.zip` y `salidas/`. Las pruebas usan solo datos ficticios.

## Limitaciones actuales

- Falta confirmar el formato de la propuesta con un archivo real.
- Solo concilia el **registro de compras**, no el de ventas.
- No procesa todavía archivos `.zip` ni comprobantes en PDF o foto.
- Esto **no es asesoría tributaria**: el contador valida cada acción sugerida.
