# Guía del piloto con contadores

Objetivo: comprobar con 2 o 3 contadores reales si el Copiloto **les ahorra tiempo** y si **sus clientes
usan el enlace**, antes de agregar más funciones.

## Antes de empezar

- [ ] La aplicación está publicada y probada de punta a punta con los datos de ejemplo.
- [ ] Cada contador crea su propio estudio (registro) y usa su propia contraseña.
- [ ] Le explicas qué datos se guardan ([privacidad.md](privacidad.md)) y que es una versión de prueba,
      **no asesoría tributaria**: él valida cada acción sugerida.
- [ ] Le pides permiso para hacer preguntas y anotar tiempos. No le pidas su Clave SOL ni la de sus clientes.

## Qué pedirle

1. **La primera línea de una propuesta real del SIRE** (solo los encabezados de las columnas, sin datos).
   Con eso se confirma el formato exacto que lee el motor.
2. Que concilie **un mes de un cliente** como lo hace siempre y que mida cuánto tarda.
3. Que concilie **el mismo mes** con el Copiloto y mida cuánto tarda.
4. Que envíe el enlace a **2 o 3 de sus clientes** para el mes siguiente.

## Qué medir

| Indicador | Cómo se obtiene |
|---|---|
| Minutos por conciliación, antes y con el Copiloto | Lo anota el contador |
| Hallazgos que él no había detectado | Revisión conjunta de la pantalla de conciliación |
| IGV en riesgo encontrado (S/) | Indicadores de la conciliación |
| Clientes que subieron XML con el enlace / clientes invitados | Lista de empresas (✓ recibidos / ! esperando) |
| Días entre el primer envío y la primera subida | Tarjeta del enlace (envíos y último XML) |

## Preguntas al terminar

1. ¿Qué parte te ahorró más tiempo? ¿Cuál no te sirvió?
2. ¿Algún hallazgo estaba mal o la explicación no se entendía?
3. ¿Tus clientes tuvieron problemas con el enlace? ¿Qué te preguntaron?
4. ¿Qué tendría que hacer para que lo uses todos los meses?
5. ¿Cuánto pagarías al mes por esto para tu cartera? (pregunta abierta, sin sugerir montos)

## Después

Anota los resultados en el README (sección de resultados del piloto) solo con datos agregados y sin
nombres de clientes. Con eso decides la siguiente versión: por ejemplo, el registro de ventas,
recordatorios automáticos por correo o la conexión con la API del SIRE.
