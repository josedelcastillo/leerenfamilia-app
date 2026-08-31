# Fase 0 — Entendimiento

Derivado de `filesMD/00`, `01` (fuente de verdad) y `02`. Sin código todavía.

## Objetivo del piloto
Validar que la promoción de la lectura compartida (leer, conversar, cantar, jugar) se integra al control del niño sano **sin alterar la operación clínica**, midiendo factibilidad, aceptación de familias y equipo de salud, y mejoras antes de escalar. 12 semanas: 2 de preparación + 8 de implementación + 2 de evaluación. Inicio previsto septiembre 2026; clínica aún no definida.

## Actores
| Actor | Rol |
|---|---|
| Personal de alta | Entrega folleto y tarjeta; registra cuántos entregó. Primer contacto. |
| Profesional de salud | En el 1.er control: presenta, da el mensaje breve, entrega el Kit, invita al QR; refuerza después. **Excluido** del acompañamiento semanal. |
| Coordinador de la clínica | Designado por el establecimiento; capacitación e integración al flujo. |
| Gestor (Leer en Familia) | Acompaña las 8 semanas, monitorea participación, reporte semanal, evaluación. Es el rol *gestor* de la app. |
| Familia | Cuidador principal (el prompt agrega uno secundario). Voluntaria; actúa en el hogar. |

## Flujo de la familia
1. **Alta hospitalaria** → folleto + tarjeta de bienvenida; aviso de que se explicará en el 1.er control.
2. **Primer control del niño sano** → presentación del programa, entrega del Kit, invitación a registrarse por QR.
3. **Registro voluntario por QR** → queda incorporada al acompañamiento de 8 semanas.
4. **Semanas 1–8 por WhatsApp** → actividades, canciones, mensajes, preguntas voluntarias. En la app: recursos, bitácora, feedback.
5. **Controles posteriores** → el profesional verifica continuidad y la anota en formato simplificado.
6. **Cierre** → encuesta breve, grupo focal, y seguimiento a los 12 meses.

## Contradicciones y vacíos detectados
1. **Ancla del cronograma.** `01` §4 acompaña "las primeras 8 semanas de **vida**"; el prompt calcula la semana desde la **fecha de registro**. Si el 1.er control ocurre a las 2–3 semanas de vida, la semana 8 del programa cae fuera de las 8 semanas de vida. El propio prompt se contradice: la tabla de entidades dice que la fecha de nacimiento "define el cronograma", la fórmula usa `fecha_registro`. **Bloqueante para Fase 2.**
2. **Momento del registro.** `02` se contradice consigo mismo: paso 1 "el bebé es registrado e incorporado" en el alta; paso 3 "queda registrada al instante" con el Kit. `01` §4.1/§4.2 es claro: en el alta solo se sensibiliza; el registro es en el 1.er control. Define el valor de `fecha_registro`.
3. **El calendario de 12 semanas no cierra.** Las familias entran escalonadas a lo largo de las 8 semanas de implementación, pero cada una necesita 8 semanas completas. Quien se registre en la semana 5 termina más allá del cierre del piloto. Ningún documento fija fecha de corte de reclutamiento.
4. **Sin indicadores ni línea base.** `01` §4.6 lista fuentes, no indicadores. `02` promete métricas ("participación activa", "frecuencia de lectura compartida") sin numerador, denominador ni meta. Sin línea base no se puede afirmar un aumento.
5. **Seguimiento a 12 meses.** `01` §4.6 y §5.5 lo exigen ("el seguimiento mensual que se defina"), pero el piloto dura 12 semanas y el envío se corta en la semana 8. No hay base legal, plazo de conservación ni opt-in que cubra contacto un año después.
6. **"Sesiones de apoyo"** aparece en las métricas de `02`; no existe tal componente en `01`. Se prometió a la clínica algo que el modelo operativo no tiene.
7. **Sin identificador común clínica↔plataforma.** `01` §5.3 quiere contrastar familias sensibilizadas vs. incorporadas y §4.6 usar registros clínicos, pero la minimización de datos prohíbe traer identificadores de la clínica. Hoy ese cruce es imposible.
8. **Consentimiento inexistente.** Se tratan datos de menores y ningún documento define texto, versión, canal ni registro del consentimiento. "Voluntario" no equivale a consentimiento informado.
9. **Cuidador secundario.** El prompt asume ~2 celulares por familia; los documentos hablan siempre del cuidador *principal* en singular y el registro por QR no contempla un segundo número.
10. **Dos QR distintos.** `01` §4.2 (registro) y §4.3 (tarjeta con canciones) usan ambos QR sin diferenciarse en ningún lado. Riesgo de confusión en consulta y en el diseño de la app.
11. **Canal bidireccional.** `01` solo prevé "preguntas voluntarias" y "comentarios de mejora": no contempla que el equipo responda. No hay SLA ni deslinde para las consultas **médicas** que van a llegar por WhatsApp de madres con recién nacidos. Es un riesgo, no un detalle de producto.
12. **La bitácora no existe en los documentos.** Es un aporte del prompt para llenar el vacío del punto 4. Conviene decirlo explícitamente: es autorreporte, no medición independiente.
13. **Encuestas y grupo focal** (`01` §4.6) no están asignados a ningún canal: no se define si van por la plataforma o fuera de ella. Hoy quedan fuera del alcance de las fases 0–8.
14. **Controles del período sin especificar.** `01` §3.1 y §4.5 hablan de "controles posteriores" sin decir cuántos ni cuándo, así que el componente §4.5 no es modelable.
