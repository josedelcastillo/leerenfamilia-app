# Indicadores del piloto

> **Borrador para revisión de Leer en Familia y de quien evalúe el piloto.**
> Ninguna definición ni umbral de este documento está acordado con nadie todavía. Se escribieron
> porque el modelo operativo v1.0 no tiene sección de indicadores y la propuesta a la clínica promete
> métricas sin definir —el hallazgo 4 de `00-entendimiento.md`—, y porque **la única ventana para
> corregirlos es ahora**: una vez que el piloto arranque, lo que no se haya capturado no se puede
> reconstruir.

## Por qué esto existe antes de que haya datos

La propuesta le promete a la clínica "frecuencia de lectura compartida en el hogar" y "participación
activa en el acompañamiento". El modelo operativo lista fuentes de información —registros clínicos,
encuestas, grupo focal— pero ningún indicador con numerador y denominador.

Sin eso, el informe final del piloto sale con adjetivos en vez de números. Con eso, sale con números
cuya definición alguien acordó de antemano, que es la diferencia entre una evaluación y una
impresión.

Hay CSV de ejemplo en [`ejemplos/`](ejemplos/), generados con datos sintéticos de 12 familias.
**Son para criticarlos.** Si falta una columna, agregarla hoy cuesta una línea; agregarla en la
semana 12 es imposible.

## Qué se puede medir y qué no

| El piloto quiere saber | ¿La plataforma lo mide? |
|---|---|
| Si la intervención se integra al flujo de atención | **No.** Es factibilidad operativa: sale de la encuesta al personal y del grupo focal |
| Si las familias aceptan y participan | **Sí**, por bitácora, interacción y bajas |
| Frecuencia de lectura compartida en el hogar | **Parcialmente.** Autorreporte, sin línea base — ver limitaciones |
| Si el equipo de salud lo acepta | **No.** No pasa por la plataforma |
| Familias que recibieron el kit completo | **No.** No hay identificador común con la clínica (hallazgo 7) |

## Definiciones

Cada fila dice exactamente qué se divide entre qué. Los umbrales marcados **(P)** son propuestas mías.

### Cobertura y retención

| Id | Indicador | Cálculo | Notas |
|---|---|---|---|
| C1 | Familias inscritas | Conteo de familias con registro completo | El denominador natural —kits entregados— no existe en la plataforma |
| C2 | Cuidadores por familia | Cuidadores inscritos / familias | El modelo operativo habla de un cuidador; el piloto captura hasta dos (hallazgo 9) |
| C3 | Tasa de baja | Familias sin ningún cuidador con `opt_in` / familias | Se registra además en qué semana del programa ocurrió |
| C4 | Retención semana *n* | Familias con ≥1 entrada en la semana *n* / familias **que llegaron** a la semana *n* | El denominador excluye a quien todavía no llegó. Con ingreso escalonado (D-003) la mayoría de la cohorte no ha alcanzado las semanas finales |

### Adherencia — el indicador central

| Id | Indicador | Cálculo | Umbral |
|---|---|---|---|
| A1 | Semana activa | La familia registró ≥ *k* entradas esa semana | **k = 1 (P)** |
| A2 | Adherencia de una familia | Semanas activas / semanas transcurridas | — |
| A3 | Familia adherente | Adherencia ≥ *u* | **u = 0.5 (P)** |
| A4 | Adherencia de la cohorte | Promedio y **mediana** de A2 | Se reportan las dos: con 50 familias el promedio se mueve mucho con un caso extremo |
| A5 | Proporción de adherentes | Familias adherentes / familias | — |

**El denominador de A2 son las semanas que la familia lleva, no las 8.** Contar como fallidas
semanas que todavía no ocurrieron castigaría a toda familia de ingreso reciente, que con el anclaje
al ingreso son casi todas al principio del piloto.

### Lectura compartida — lo prometido a la clínica

| Id | Indicador | Cálculo |
|---|---|---|
| L1 | Días con lectura | Días distintos con ≥1 entrada de tipo `lectura`, por familia |
| L2 | Minutos por tipo | Suma de minutos, desagregada en lectura / canción / juego / conversación |
| L3 | Reparto entre cuidadores | Entradas del cuidador principal vs. secundario |

L3 es de los pocos datos que el piloto puede aportar sobre la dinámica del hogar, y es la razón por la
que el token identifica al cuidador y no solo a la familia.

### Alcance del canal

| Id | Indicador | Cálculo | Fuente |
|---|---|---|---|
| E1 | Tasa de entrega | Mensajes `delivered` / mensajes enviados | Webhook de `statuses` de Meta |
| E2 | Tasa de lectura | Mensajes `read` / mensajes entregados | Ídem. Depende de que la familia tenga activadas las confirmaciones |
| E3 | Mensajes facturables por categoría | Conteo por `pricing.category` | Permite ver si la plantilla cae como `utility` o `marketing`, que es la diferencia de precio |

### Canal bidireccional

| Id | Indicador | Cálculo | Umbral |
|---|---|---|---|
| B1 | Volumen de feedback | Conteo por tipo y por canal | — |
| B2 | Proporción por WhatsApp | Feedback de WhatsApp / feedback total | Dice si la app o el chat es el canal real |
| B3 | Tiempo a primera respuesta | Mediana y p90 de (primera respuesta − creación), en horas | — |
| B4 | Respuestas dentro del objetivo | Respuestas en ≤ *h* horas / respuestas | **h = 48 (P)** |
| B5 | Feedback abierto al cierre | Conteo con estado `abierto` a la fecha de corte | — |

**B3 y B4 existen para hacer visible un vacío.** El modelo operativo no define ningún plazo de
respuesta (hallazgo 11), y a este canal van a llegar consultas de madres con recién nacidos. Medir el
tiempo no reemplaza acordar un compromiso, pero al menos deja de ser invisible.

## Limitaciones que hay que declarar en el informe

No son advertencias de formulario. Si el informe final no las dice, sus números se van a leer como
algo que no son.

1. **No hay línea base.** No se midió la frecuencia de lectura de estas familias antes de entrar. Se
   puede reportar cuánto leyeron durante el piloto; **no se puede afirmar que aumentó.** La propuesta
   cita "4× más lectura" de la literatura — ese número es de otros estudios, no de este piloto.
2. **La bitácora es autorreporte.** Una familia motivada registra más de lo que hace y una agotada
   menos. Mide adherencia declarada, no conducta observada.
3. **No hay grupo de control.** Cualquier cambio observado no es atribuible a la intervención.
4. **La ausencia de registro es ambigua.** Una semana sin entradas puede ser una familia que no leyó,
   o una que leyó y no anotó. La distinción no existe en los datos.
5. **50 familias.** Nada de esto tiene poder estadístico. Es factibilidad y aceptación, que es
   exactamente lo que el piloto declara evaluar.
6. **El denominador de cobertura falta.** Sin identificador común con la clínica no se puede calcular
   "familias inscritas / familias que recibieron el kit". Se puede resolver con **conteos agregados
   que dé la clínica**, sin datos personales — hay que acordarlo antes del arranque.

## Lo que hace falta decidir

| Decisión | Propuesta | Quién decide |
|---|---|---|
| ¿Cuántas entradas hacen una semana activa? | 1 | Leer en Familia + evaluador |
| ¿Desde qué adherencia una familia es adherente? | 0.5 | Ídem |
| ¿Cuál es el plazo de respuesta comprometido? | 48 h | Leer en Familia |
| ¿Un mensaje `read` cuenta como participación, o solo responder el botón? | Solo el botón, `read` va aparte | Evaluador |
| ¿La clínica entrega conteos agregados de kits? | Sí, sin datos personales | Coordinación con la clínica |
| ¿El contenido está escrito por semana de vida o de programa? | Por programa | Leer en Familia (ver D-003) |

Cambiar cualquiera de los tres umbrales es editar una constante en
`backend/src/domain/indicators.ts`. Están nombradas para eso.

## Los archivos

| Archivo | Una fila por | Para qué |
|---|---|---|
| `resumen.csv` | Indicador | Lectura de arriba abajo; lleva la definición en una columna |
| `familias.csv` | Familia | El archivo del análisis principal |
| `bitacora.csv` | Entrada de bitácora | El granular: permite cualquier agregación que el resumen no anticipó |
| `envios.csv` | Envío semanal | Alcance y conciliación con la factura de Meta |
| `feedback.csv` | Mensaje de una familia | Análisis cualitativo y tiempos de respuesta |
| `auditoria.csv` | Acceso de un gestor | Anexo de protección de datos |

**Todos van seudonimizados**: sin teléfonos, sin nombre del bebé, sin nombre de cuidador. El
`familia_id` es un UUID que solo la plataforma puede resolver.

Seudonimizado **no es** anonimizado: bajo la Ley 29733 estos archivos siguen siendo datos personales
y hay que tratarlos como tales. El texto libre de las notas solo aparece para las familias que lo
autorizaron, y una columna dice explícitamente si se omitió — una celda vacía sola no distingue
"no escribió nada" de "no autorizó".
