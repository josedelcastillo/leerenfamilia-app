# Registro de decisiones

Bitácora de decisiones que resuelven los vacíos de `docs/00-entendimiento.md`.
Una entrada por decisión, con su consecuencia técnica. No se editan: se supersede con una entrada nueva.

---

## D-001 — El cronograma se ancla a la fecha de nacimiento (paramétrico)

**Fecha:** 2026-08-31 · **Estado:** ~~superseded por D-003~~ · **Resuelve:** contradicción 1 de `00-entendimiento.md`

La semana del programa se cuenta desde la **fecha de nacimiento del bebé**, no desde la fecha de registro.
Una familia que se registra con el bebé de 3 semanas entra en la **semana 3** del programa.
Puede **consultar el contenido de las semanas anteriores**; lo que no recibe son los envíos de esas semanas ya pasadas.

Es paramétrico: más adelante se podrá cambiar a que la semana 1 sea la fecha de registro.

### Consecuencias

1. **La política es por programa, la fecha resuelta es por familia.** El programa declara la política
   (`birth_date` | `registration_date`); al registrar, se resuelve a una `anchor_date` concreta que se
   **persiste en el registro de la familia** junto con la política que la produjo.
   Motivo: si la semana se recalculara siempre desde la política vigente, cambiarla reinterpretaría
   retroactivamente todo el histórico y movería los indicadores de un piloto ya cerrado. La `anchor_date`
   guardada es inmutable; cambiar la política solo afecta a las familias que se registren después.
2. **El cálculo de semana queda como función pura** sobre `(anchor_date, hoy)`, en `domain/`, sin dependencia
   de configuración ni de AWS. Toda la parametrización ocurre antes, al resolver `anchor_date`.
3. **El acompañamiento deja de ser de 8 semanas para todos.** Con ancla al nacimiento, quien se registra en la
   semana 3 recibe 6 envíos, no 8. El modelo operativo promete "8 semanas"; el dato real a reportar es
   *semanas efectivamente acompañadas por familia*, y el informe final debe declararlo así. **Pendiente de
   confirmar con Leer en Familia.**
4. **Contenido**: desbloqueado de la semana 1 a la semana actual (tope 8). Las semanas futuras no se muestran.

### Abierto

- **Registro fuera de ventana**: bebé de más de 8 semanas al registrarse. Propuesta por defecto: se acepta el
  registro con acceso completo al contenido, `estado = fuera_de_ventana`, sin envíos semanales y excluida de
  los indicadores de adherencia. Requiere confirmación.
- **Fecha de nacimiento desconocida o prematuridad**: sin regla definida. Se usará la fecha declarada por el
  cuidador tal cual, sin edad corregida.

---

## D-002 — La plataforma persiste entre pilotos, pero no se diseña para escalar

**Fecha:** 2026-08-31 · **Estado:** vigente

La plataforma debe sobrevivir al piloto clínico y servir a pilotos y proyectos posteriores.
Esto **no** reabre el dimensionamiento: siguen vigentes 50 familias, ~100 celulares y ~5 gestores por cohorte,
y sigue vigente la regla de que agregar complejidad "por si escalamos" es una decisión equivocada.

Interpretación aplicada: **permanencia y parametrización, no capacidad**.

| Sí | No |
|---|---|
| Entidad `Programa`/cohorte con su política de cronograma, número de semanas y set de contenido | Multi-organización o multi-tenancy |
| Contenido versionado por programa, no un único set global de 8 semanas | RBAC granular o jerarquía de roles |
| Familias asociadas a un programa; los indicadores se calculan por programa | Infraestructura que no sea la del piloto |
| Constantes del cronograma (8 semanas, ventana de 24 h, vencimiento del token) como configuración, no literales | Abstracciones especulativas sin un segundo caso real |

Costo de esta decisión: un atributo `program_id` en la familia y una partición más en la tabla única.
No agrega infraestructura y no mueve la meta de US$0/mes.

---

## D-003 — El cronograma se ancla a la fecha de ingreso al programa

**Fecha:** 2026-08-31 · **Estado:** vigente · **Supersede:** D-001

La semana del programa se cuenta desde la **fecha de ingreso de la familia al programa**.
Toda familia empieza en la **semana 1** y recibe las 8 semanas completas, sin importar la edad del bebé al ingresar.

Sigue siendo paramétrico, ahora al revés: la política por defecto es `enrollment_date`, y `birth_date` queda
disponible como alternativa para pilotos futuros.

### Qué se conserva de D-001

La mecánica, que era lo importante y no dependía de cuál fuera el ancla:

1. **La política es del programa; la fecha resuelta es de la familia.** Al ingresar se resuelve la `anchor_date`
   y se **persiste en el registro de la familia** junto con la política que la produjo. Cambiar la política nunca
   reinterpreta retroactivamente a las familias ya inscritas ni mueve los indicadores de un piloto cerrado.
2. **El cálculo de semana es una función pura** sobre `(anchor_date, hoy)`, en `domain/`, sin configuración ni AWS.
3. **Contenido**: desbloqueado de la semana 1 a la semana actual (tope 8); las semanas futuras no se muestran.

### Qué cambia respecto de D-001

- **Desaparece el caso "fuera de ventana".** Con ancla al ingreso no existe familia que llegue tarde a su propio
  programa: un bebé de 10 semanas ingresa igual en la semana 1. La pregunta abierta de D-001 queda cerrada.
- **Vuelven a ser 8 semanas para todas las familias.** El indicador "semanas efectivamente acompañadas" pierde
  la varianza que tenía con ancla al nacimiento; el dato de adherencia vuelve a ser cuántos de los 8 envíos
  tuvieron respuesta, no cuántos se enviaron.
- **La fecha de nacimiento se sigue guardando**, pero deja de gobernar el cronograma. Se usa para conocer la edad
  del bebé, reportarla y segmentar el análisis del piloto.
- **`00-entendimiento.md` §1 sigue sin cerrarse del todo**: el modelo operativo §4 dice "primeras 8 semanas de
  **vida**". Con ancla al ingreso, una familia que entra con el bebé de 6 semanas termina el programa a las 14
  semanas de vida. Es una desviación deliberada del documento y hay que declararla en el informe final.
- **Agrava la contradicción 3** (el calendario de 12 semanas no cierra): ahora toda familia necesita 8 semanas
  completas desde su ingreso, así que el reclutamiento tardío se sale del piloto con más margen, no menos.
  Refuerza la necesidad de una fecha de corte de reclutamiento.

### Abierto

- **¿El contenido está escrito por semana de vida o por semana de programa?** El modelo operativo lo concibe
  sobre "las primeras 8 semanas de vida", así que el contenido de la semana 1 probablemente asume un recién
  nacido. Con ancla al ingreso, ese contenido le puede llegar a un bebé de 6 semanas. **Hay que confirmarlo con
  Leer en Familia antes de que redacten el contenido real**; el placeholder de la fase 5 se marcará como
  "semana de programa".
- **Fecha de ingreso vs. escaneo del QR**: por ahora se toman como el mismo instante. Si más adelante se
  necesita que el ingreso sea una fecha declarada distinta (p. ej. la del primer control), se agrega como campo
  propio sin tocar el cálculo, que ya opera sobre `anchor_date`.

---

## D-004 — `fn-feedback-reply` se fusiona con `fn-admin`

**Fecha:** 2026-08-31 · **Estado:** vigente

El diagrama de arquitectura del encargo dibuja ocho cajas de Lambda (`fn-register`, `fn-content`,
`fn-tracking`, `fn-feedback`, `fn-admin`, `fn-weekly-send`, `fn-feedback-reply`, `fn-wa-webhook`) pero el
texto inmediatamente debajo dice **"Siete Lambdas"**. Se implementan siete: la respuesta del gestor a un
feedback vive dentro de `fn-admin`.

Además de cuadrar el número, la fusión es la que reduce superficie: responder un feedback es una acción de
gestor, ya autenticada por el autorizador JWT de Cognito, y es la única ruta de familia que necesitaría
permiso para enviar por WhatsApp y leer las credenciales de Meta. Si la respuesta viviera en `fn-feedback`
—la función que escriben las familias, sin login—, esa función pública cargaría acceso al token de Meta sin
necesitarlo.

Alternativa descartada: dejar `fn-feedback-reply` como octava Lambda y contradecir la restricción.
Si prefiere las ocho, es revertir esta decisión; el costo es el mismo (Lambda no cobra por función).

---

## D-005 — Cognito Lite con MFA TOTP: verificado, US$0 a este volumen

**Fecha:** 2026-08-31 · **Estado:** vigente · **Resuelve:** la verificación que pedía la sección 6 del encargo

Verificado contra la documentación pública de precios de Cognito, no asumido:

| Tier | Precio | Free tier | Vence |
|---|---|---|---|
| **Lite** | desde US$0.0055/MAU | 10 000 MAU/mes | **No vence** (perpetuo, clientes nuevos y existentes) |
| Essentials | US$0.015/MAU | 10 000 MAU/mes | No vence |
| Plus | US$0.020/MAU | **Sin free tier**, cobra desde el primer usuario | — |

**MFA con app de autenticación (TOTP) está incluido en Lite y no tiene costo por uso.** No hace falta subir a
Essentials ni a Plus para cumplir el requisito de MFA. Con ~5 gestores contra un free tier perpetuo de
10 000 MAU, el user pool cuesta **US$0/mes**, y seguiría costando US$0 aunque el número de gestores se
multiplicara por mil.

Decisión: **tier Lite, `MfaConfiguration: ON`, `EnabledMfas: [SOFTWARE_TOKEN_MFA]`.**

> **Modificado por D-019 (2026-09-01):** `MfaConfiguration` está hoy en `OPTIONAL`. El análisis de
> costo de arriba sigue vigente — TOTP no cuesta nada; lo que cambió es que el ingreso todavía no
> sabe inscribir el segundo factor.

**MFA por SMS queda excluido deliberadamente.** No es una limitación del tier: los SMS se facturan aparte vía
SNS por mensaje, y enviar a Perú además exige resolver origination number y salir del sandbox de SNS. TOTP
evita el gasto y el trámite. El costo para el gestor es tener que instalar una app de autenticación.

Lo que **no** entra por venir en Plus: threat protection, autenticación adaptativa por riesgo y detección de
credenciales comprometidas. Para 5 cuentas creadas a mano, con MFA obligatorio y sin auto-registro, la
relación costo/beneficio no lo justifica. Queda anotado por si el alcance cambia.

---

## D-006 — Las palabras de baja se reconocen por coincidencia exacta, no por contenido

**Fecha:** 2026-08-31 · **Estado:** vigente

`BAJA`, `STOP` y `SALIR` dan de baja al cuidador cuando el mensaje **es** una de esas palabras, tras normalizar
mayúsculas, tildes y puntuación. `¡BAJA!`, `baja.` y `Salír` cuentan. **`quiero darme de baja` no cuenta.**

El razonamiento va en el sentido contrario al obvio. Buscar la palabra dentro del texto parece más generoso
con la familia, pero significa que cualquier mensaje que contenga "baja" —"el bebé está bajando de peso", "se
me bajó la leche"— corta las comunicaciones de una familia que nunca lo pidió, en silencio y sin que nadie lo
revise. El falso positivo es el error caro: deja fuera del piloto a quien quería seguir.

Lo que no coincide exactamente **no se pierde**: entra a la bandeja del gestor como `consulta` con estado
`abierto`, y una persona la lee y la procesa. Es decir, el pedido de baja escrito en una frase se atiende
igual, solo que con un humano en el medio en vez de una expresión regular.

**Riesgo asumido y su mitigación.** La política de Meta exige honrar las bajas; el mecanismo automático por
palabra exacta más la revisión humana de todo lo demás la cumple, siempre que la bandeja se lea con
frecuencia. Eso obliga a un compromiso operativo que **el modelo operativo v1.0 no tiene**: un plazo máximo de
respuesta. Está anotado como el hallazgo 11 de `00-entendimiento.md` y sigue abierto.

**Sin palabra de reingreso.** Ningún documento define cómo vuelve una familia que se dio de baja. El dominio
ya soporta el reingreso (`applyOptIn` limpia el `optOutAt`), pero no hay palabra clave que lo dispare: hoy
tiene que hacerlo un gestor. Queda pendiente de definir con Leer en Familia.

---

## D-007 — El webhook procesa de forma síncrona y no admite ningún bypass de firma

**Fecha:** 2026-08-31 · **Estado:** vigente

Tres decisiones sobre `fn-wa-webhook`, las tres desviaciones o precisiones respecto del encargo.

### 1. Procesa síncrono, no "responde y procesa después"

El encargo pide responder 200 en menos de 5 s y procesar después. Encolar exigiría una cola SQS y una
octava Lambda, y romper la restricción de siete. A este volumen no hace falta: un webhook trae uno o dos
mensajes, cada uno son dos o tres escrituras a DynamoDB de milisegundos, y el presupuesto de 5 s sobra.

El timeout de la Lambda es de **15 s, no de 5**, y es a propósito. Matar la ejecución a los 5 s dejaría un
`message_id` reclamado sin nada escrito para él, y ese mensaje se perdería. Una ejecución lenta que Meta
reintenta es inofensiva: el reintento se deduplica y la original termina igual.

Si el volumen creciera —otro piloto, más familias— esto se revisa. Hoy sería complejidad sin beneficio.

### 2. La validación de firma no tiene modo de desarrollo

`X-Hub-Signature-256` se valida siempre, antes de parsear y antes de tocar la base. **No hay flag que la
desactive en modo mock**, porque esos flags terminan activados en producción. Si `WA_APP_SECRET` no existe en
SSM, la Lambda falla y el webhook no responde 200: falla hacia rechazar, nunca hacia aceptar.

Para ejercitar el webhook sin WABA, se crea el parámetro con cualquier valor y se firman las peticiones de
prueba con ese mismo secreto; `signMetaBody()` está exportado justamente para eso.

Dos detalles de implementación que son los que suelen fallar: el HMAC se calcula sobre los **bytes crudos**
del cuerpo, no sobre el JSON re-serializado —reparsear y volver a serializar reordena claves y la firma deja
de coincidir—, y la comparación es de tiempo constante. Ambos con test.

### 3. La reclamación del `message_id` se devuelve si el procesamiento falla

La deduplicación reclama el id **antes** de trabajar, con escritura condicional, para que dos reintentos
concurrentes no puedan actuar los dos. Pero si el procesamiento falla después de reclamar, la reclamación se
libera, de modo que el reintento de Meta sí se procese.

El criterio: perder en silencio el mensaje de una madre es peor que archivarlo dos veces.

### 4. Los mensajes de números desconocidos se descartan

Un mensaje entrante de un número que no está inscrito no tiene familia a la que colgarse. Se registra en el
log y se descarta; **no se inventa una familia a partir de un mensaje entrante**. Es un caso esperable —un
número mal tipeado en el registro por QR, un familiar que usa otro celular— y hoy solo es visible en
CloudWatch. Si aparece con frecuencia en el piloto, merece una bandeja aparte en la vista del gestor.

---

## D-008 — El envío semanal reclama antes de enviar, y no reintenta lo ambiguo

**Fecha:** 2026-08-31 · **Estado:** vigente

El encargo dice que un reintento del scheduler **no puede generar un segundo cobro**. Eso fija el orden de
las operaciones y no al revés.

### El orden

El registro `DELIVERY#<iso_week>` se escribe con condición **antes de enviar el primer mensaje**. Si se
enviara primero, una caída entre el envío y la escritura dejaría al reintento sin saber que ya se envió, y
cobraría dos veces. Al reclamar primero, el peor caso es un mensaje que no sale — recuperable — en vez de uno
que se cobra dos veces, que no lo es. Hay un test que verifica el orden de las llamadas, no solo el resultado.

### Tres estados por destinatario, no dos

El registro guarda un estado por cuidador, porque un fallo de uno no debe bloquear al otro:

| Estado | Qué significa | ¿Se reintenta? |
|---|---|---|
| `enviado` | Meta devolvió un `wamid` | No, ya está |
| `fallido` | Meta respondió con error HTTP: **no** lo aceptó | Sí, es seguro |
| `pendiente` | Timeout o fallo de red: **no sabemos** si lo aceptó | **No, nunca automáticamente** |

La distinción entre `fallido` y `pendiente` es la que hace que esto funcione. Un error de Meta es
información: el mensaje no entró y reintentarlo no cobra dos veces. Un timeout no es información: pudo haber
entrado. Reintentar un `pendiente` es exactamente el segundo cobro que la restricción prohíbe.

Los `pendiente` salen en el reporte semanal bajo `needsReview` y los resuelve una persona mirando la consola
de Meta. Es un caso raro —requiere una caída en la ventana exacta entre reclamar y confirmar— y visible.

### El reporte semanal

`runWeeklySend` devuelve el conteo de familias omitidas **por razón**, no solo el total de mensajes. El
modelo operativo §5.4 exige un reporte semanal de implementación, y "cuántas familias no recibieron nada esta
semana y por qué" es su contenido. Sale como una línea de log estructurada por corrida.

### Datos de demostración

El registro por QR (`fn-register`) llega en la fase 5, junto con la superficie de la familia y la captura del
consentimiento. Para que el ciclo sea demostrable antes de eso, `backend/scripts/seed-demo.ts` crea el
programa, las ocho semanas placeholder y tres familias en semanas distintas del programa —que es justamente
la situación que crea D-003—. Los identificadores llevan prefijo `demo-` y los teléfonos están en el rango
`+5199999xxxx`, que no es un prefijo real de celular peruano: los datos de prueba nunca deben poder
confundirse con datos del piloto.

---

## D-009 — Lighthouse ya no tiene categoría PWA; se verifica la instalabilidad directamente

**Fecha:** 2026-08-31 · **Estado:** vigente · **Corrige un criterio de aceptación del encargo**

El encargo pide "Lighthouse PWA e *Installable* en verde antes de dar la fase por cerrada". **Ese criterio ya
no se puede cumplir literalmente: Lighthouse eliminó la categoría PWA en la versión 12 (2024).** Con Lighthouse
13.4.1, las categorías son `performance`, `accessibility`, `best-practices`, `seo` y `agentic-browsing`. No
hay puntaje PWA que poner en verde.

En su reemplazo, `web/scripts/check-installable.mjs` verifica con Chromium las condiciones que el navegador
realmente usa para ofrecer la instalación, y falla con código distinto de cero si alguna no se cumple:
manifest servido y válido, `name`, `short_name`, `start_url`, `display: standalone`, íconos de 192 y 512, al
menos un ícono `maskable`, cada ícono efectivamente servido, y un service worker registrado.

El mismo script apaga la red y comprueba lo que en realidad importa: que la app cargue, se renderice y
resuelva una ruta del cliente **sin conexión**. Esa es la garantía que el puntaje de Lighthouse nunca dio.

### Puntajes de Lighthouse 13.4.1 sobre el build de producción

| Categoría | Puntaje |
|---|---|
| Rendimiento | 100 |
| Accesibilidad | 100 |
| Buenas prácticas | 100 |
| SEO | **63, a propósito** |

**El 63 de SEO es una decisión, no una falla.** El único audit que falla es `is-crawlable`: la página está
bloqueada para indexación por un `robots.txt` con `Disallow: /`. Es lo correcto para esta aplicación —ambas
superficies están detrás de una credencial y por este origen se tratan datos de menores—, así que no se va a
"arreglar". Subir ese puntaje significaría permitir que se indexe la superficie de las familias.

---

## D-010 — La cola offline separa la política del almacenamiento

**Fecha:** 2026-08-31 · **Estado:** vigente

`sync-queue.ts` tiene la política y no sabe qué es IndexedDB; `idb-storage.ts` es la implementación. Así la
parte que decide qué se conserva y qué se descarta se prueba con `node --test`, sin navegador. Es el mismo
corte que en el backend entre `domain/` y `adapters/`.

Tres reglas, y las tres importan:

| Respuesta del servidor | Qué pasa | Por qué |
|---|---|---|
| `ok` | Sale de la cola | Llegó |
| `rechazado` | **Sale de la cola** y se le avisa al cuidador | Nunca va a ser aceptado; reintentarlo bloquearía la cola para siempre |
| `error`, o ítem no mencionado | **Se queda** y sube el contador de intentos | Es culpa nuestra; más tarde puede funcionar |

Si falla la petición entera —sin señal, servidor caído— **no se pierde nada**: todo queda en cola. Y un ítem
que falla 10 veces se descarta y se reporta, para que un registro envenenado no se reintente en cada apertura
de la app durante todo el piloto.

**El disparador principal es `visibilitychange`, no `online`.** Una madre escribe una entrada, bloquea el
celular, y abre la app horas después en un sitio con señal. El evento `online` puede no dispararse nunca en
el medio, porque el navegador no estaba corriendo cuando volvió la conexión.

### Quién registró la entrada lo decide el token, no el dispositivo

`loggedBy` se resuelve en el backend a partir del cuidador que firma el token, ignorando lo que venga en el
cuerpo. Si lo decidiera el cliente, un dispositivo podría atribuir todas las entradas al cuidador secundario y
el dato de "quién lee en esta casa" —uno de los pocos que el piloto puede medir— quedaría inservible.

---

## D-011 — La idempotencia de la notificación va por respuesta, no por feedback

**Fecha:** 2026-08-31 · **Estado:** vigente · **Se aparta del encargo**

El encargo pide "Idempotencia por `feedback_id`" para la plantilla de respuesta. **Se implementó por
`(feedback_id, índice de respuesta)`.**

Con idempotencia solo por `feedback_id`, la primera respuesta se notifica y **ninguna corrección posterior
se notificaría jamás**. Y las correcciones son parte del diseño: el propio encargo dice que un feedback
respondido nunca se edita y que corregir significa agregar otra respuesta. Una corrección que la familia no
recibe es peor que no corregir — la deja actuando sobre la información equivocada, creyendo que es la buena.

La clave por respuesta cumple lo que el requisito quería —un reintento de la misma petición no cobra dos
veces— sin silenciar las correcciones. Ambos casos tienen test.

---

## D-012 — La pertenencia al grupo se verifica en código, no solo en el autorizador

**Fecha:** 2026-08-31 · **Estado:** vigente

El autorizador JWT del HTTP API valida firma, emisor y audiencia. **Eso prueba que el token es válido, no que
esa persona deba ver datos de familias.** Cualquier usuario del user pool pasaría el autorizador.

`fn-admin` verifica además que el claim `cognito:groups` contenga `gestores`, y responde 403 si no. Es una
línea de defensa barata contra un error de administración —una cuenta creada en el pool para otra cosa— y
contra que un grupo futuro herede acceso sin que nadie lo decida.

**Se envía el ID token, no el access token.** El autorizador está configurado con `audience: [clientId]`, y
solo el ID token lleva `aud`. Además es el que trae `email` y `cognito:groups`, que son los datos que la API
usa para autorizar y auditar.

### Qué se audita y qué no

| Acción | ¿Auditada? | Por qué |
|---|---|---|
| Abrir el detalle de una familia | **Sí** | Es donde el gestor ve datos de un menor identificable |
| Responder un feedback | **Sí** | Es una acción sobre los datos de esa familia, atribuible a una persona |
| Exportar datos (fase 7) | **Sí** | Lo exige la sección 8 del encargo |
| Listar familias | No | Solo agregados: semana, conteos, minutos. Ningún texto libre |
| Abrir la bandeja | No | **Decisión discutible**: la bandeja sí muestra texto escrito por las familias |

El último merece una segunda mirada. Auditar cada apertura de la bandeja generaría mucho ruido —es la
pantalla donde el gestor vive— pero es texto personal. Si en la revisión legal de la fase 8 se considera
necesario, se agrega; el costo es una escritura más por carga de pantalla.

### Las notas libres se filtran en lectura

El detalle de familia oculta el texto de las notas salvo que la familia lo haya autorizado en el
consentimiento. **Se filtran en lectura, nunca se descartan en escritura**: la nota es de la familia
igual, y si más adelante autoriza, su historia sigue completa. La interfaz dice explícitamente cuando
está viendo una familia que no autorizó.

---

## D-013 — Los indicadores se definen ahora, en borrador, porque después no hay margen

**Fecha:** 2026-08-31 · **Estado:** vigente · **Resuelve:** contradicción 4 de `00-entendimiento.md`

El modelo operativo v1.0 no tiene indicadores y la propuesta le promete a la clínica métricas sin
numerador ni denominador. Se definieron en `docs/indicadores.md`, marcados como **borrador para revisión
de Leer en Familia y del evaluador**, con cada umbral como constante nombrada en
`domain/indicators.ts`.

**El motivo de hacerlo sin datos es precisamente que no hay datos.** Una vez que el piloto arranque, la
forma del CSV queda congelada por lo que se capturó: nadie puede reconstruir la adherencia de la semana 3
de una familia que ya terminó. Hoy, agregar una columna es una línea. En la semana 12 es imposible.

Por eso el entregable importante de la fase no es el endpoint de exportación sino los **CSV de ejemplo en
`docs/ejemplos/`**, generados con 12 familias sintéticas por `backend/scripts/generar-ejemplos.ts` (sin
AWS, sin red, con semilla fija para que regenerarlos dé un diff idéntico). Están para que alguien los
critique antes de que sirvan para algo.

### Lo que no se hizo, a propósito

No se calibraron umbrales. Si "participación activa" es registrar una vez por semana o tres, si la meta de
adherencia es 50% o 70%, si un `read` cuenta como participación — eso lo decide Leer en Familia con el
evaluador. Los tres umbrales propuestos (`UMBRAL_SEMANA_ACTIVA = 1`, `UMBRAL_FAMILIA_ADHERENTE = 0.5`,
`OBJETIVO_PRIMERA_RESPUESTA_HORAS = 48`) llevan `(P)` de propuesta en el documento y en el propio CSV.

### El denominador de la adherencia

Semanas activas dividido **semanas transcurridas**, no dividido 8. Con anclaje al ingreso (D-003) el
reclutamiento es escalonado, así que al principio del piloto casi toda la cohorte lleva pocas semanas.
Dividir entre 8 marcaría como fracaso a una familia que ingresó la semana pasada. La retención por semana
usa el mismo criterio: solo las familias que llegaron a esa semana entran en su denominador.

---

## D-014 — Un `Scan` para la exportación, y el CSV se escribe pensando en Excel

**Fecha:** 2026-08-31 · **Estado:** vigente

**Un `Scan` paginado, no consultas por familia.** Un `Scan` suele ser el instinto equivocado; acá es el
correcto. La alternativa son ~50 consultas de familia más una por mensaje enviado para encontrar su estado
de entrega — unas 800 lecturas para una cohorte de 50 familias. La tabla entera son unos miles de ítems
pequeños, la exportación corre un puñado de veces en la vida del piloto, y una sola pasada es más rápida y
más fácil de razonar. Si un programa futuro engorda la tabla, esto es lo primero a revisar.

**El CSV se escribe para Excel, no para un pipe de Unix.** Dos detalles que un `join(',')` ingenuo rompe:

1. **Inyección de fórmulas.** Un cuidador puede escribir `=HYPERLINK("http://...")` en una nota de la
   bitácora. Excel ejecuta una celda que empieza con `=`, `+`, `-`, `@`, tabulación o retorno de carro.
   Esas celdas llevan un apóstrofo delante. Sin eso, exportar los datos del piloto le entregaría a un
   atacante una forma de ejecutar algo en la laptop del evaluador. Con test.
2. **BOM.** Un UTF-8 sin BOM abre como galimatías en Excel de Windows: "Mateo" sobrevive, "canción" no.

### Qué sale y qué no

Todo va seudonimizado: sin teléfonos, sin nombre del bebé, sin nombre de cuidador. El `familia_id` es un
UUID que solo la plataforma resuelve — lo que permite que la ONG actúe sobre un hallazgo. **Seudonimizado
no es anonimizado**: bajo la Ley 29733 estos archivos siguen siendo datos personales, y eso se declara en
`indicadores.md` en vez de dejarlo a que el lector lo deduzca.

El texto de la pregunta de la familia sí sale —es donde vive el hallazgo cualitativo—; **el texto de la
respuesta del gestor no**, porque el conteo y el tiempo es lo que la evaluación necesita y cada copia
adicional de una conversación es un lugar más del que se puede filtrar.

El texto de las notas solo sale para las familias que lo autorizaron, y una columna `nota_autorizada` dice
si se omitió: una celda vacía sola no distingue "no escribió nada" de "no autorizó".

**Exportar es una de las tres acciones auditadas**, junto con abrir el detalle de una familia y responder
un feedback. Es la que saca datos de menores de la plataforma y los pone en la laptop de alguien.

---

## D-015 — El historial se arma con lo del servidor más lo que sigue en la cola

**Fecha:** 2026-09-01 · **Estado:** vigente · **Corrige un defecto reportado en uso**

Reportado tras el primer despliegue: en la bitácora, los registros solo se veían mientras la pantalla
seguía abierta; al cambiar de pestaña y volver, desaparecían.

**La causa:** la pantalla guardaba lo recién escrito en estado local del componente y nunca leía el
historial del servidor. Al desmontarse, se perdía. El dato **sí estaba** guardado —la cola lo
sincronizaba bien— pero la familia no tenía forma de verlo, que para ella es lo mismo que no estar.

Faltaba además el endpoint: la familia podía escribir su bitácora pero no leerla. Ahora
`GET /api/seguimiento` devuelve sus propias entradas.

**Las notas propias vuelven completas.** El flag de consentimiento gobierna lo que lee un *gestor*,
nunca lo que la familia ve de lo que ella misma escribió.

### El historial se arma mezclando dos fuentes

`mergeHistorial` y `mergeThread` combinan lo que el servidor tiene con lo que sigue en IndexedDB, usando
el `clientId` como clave de unión. Así:

- Una entrada escrita sin señal aparece de inmediato, marcada **Pendiente**, y sigue apareciendo después
  de salir de la pantalla.
- Cuando sincroniza, pasa a **Guardado** sola.
- En la ventana en que el envío ya llegó pero la cola todavía no descartó el ítem, **no se duplica**: la
  copia del servidor gana.
- Sin conexión, el historial del servidor no carga y la vista se sostiene sola con lo que hay en el
  dispositivo, avisándolo.

Las dos funciones viven en archivos `.ts` separados de los `.tsx` porque el runner de Node no procesa
JSX, y así se prueban sin navegador. Es el mismo corte que en el backend entre lógica y adaptadores.

---

## D-016 — "Ya lo hicimos" registra en la bitácora; el acceso se registra al abrir la semana

**Fecha:** 2026-09-01 · **Estado:** vigente · **Corrige una decisión de la fase 5**

Antes, el botón "Ya lo hicimos" escribía un evento de **acceso a recurso** y nada más: ni duración, ni
fecha, ni nota. La familia declaraba haber hecho la actividad y esa declaración no entraba a la bitácora,
que es la fuente primaria de los indicadores. Se perdía el dato que más importa.

Ahora el botón abre el **mismo formulario** que la bitácora —tipo de actividad ya seleccionado según la
actividad, duración, fecha con hoy por defecto, y nota— y guarda una entrada de bitácora con
`resourceId` apuntando a la actividad. Ese campo existía desde la fase 5 y hasta ahora nadie lo llenaba:
es lo que permite saber **qué recursos se usan de verdad**, no solo cuántos minutos se leyó.

El formulario es un componente compartido, así que una actividad registrada desde el contenido y una
escrita a mano son exactamente el mismo registro. No hay dos calidades de dato.

### El acceso recupera su significado

El evento `ACCESS#` vuelve a significar lo que el modelo de datos dice —"quién abrió qué y cuándo"— y se
registra al **desplegar una semana**, que es cuando la familia efectivamente mira el contenido.

El `clientId` es fijo por semana y por día (`acceso-<semana>-<fecha>`), y el timestamp es el inicio del
día, así que abrir la semana 3 diez veces una tarde deja **un** registro, no diez. Acota el volumen y
mantiene el dato interpretable: "abrió la semana 3 el 15 de septiembre".

---

## D-017 — Un despliegue incompleto responde 503 y dice qué falta, no 500 en blanco

**Fecha:** 2026-09-01 · **Estado:** vigente · **Corrige un defecto propio**

Reportado en uso: la API devolvía 500 en todo, sin nada útil.

**La causa era mía.** En `fn-content`, `fn-tracking` y `fn-feedback`, `openSession()` corría **fuera**
del `try`. Esa función lee el secreto de firma en SSM y carga la familia de DynamoDB, así que cualquier
fallo ahí —un `SecureString` que no se creó, un permiso IAM incompleto, un despliegue a medias— escapaba
del handler, mataba la invocación y API Gateway devolvía un 500 genérico. El caso más probable en la
práctica, un parámetro faltante, era también el más opaco de diagnosticar.

Tres cambios:

1. **`openSession()` ahora corre dentro del `try`** en las tres funciones. Ningún fallo suyo vuelve a
   escapar.
2. **`MissingParameterError` es un tipo propio**, no un `Error` genérico. No es un bug: es un
   despliegue al que le falta un paso, y hay que poder distinguirlo para decirlo.
3. **La respuesta es 503 `configuracion_incompleta`** y el log estructurado nombra **qué parámetros
   faltan** y apunta al paso del runbook. La respuesta no dice cuál, para no revelar qué secreto falta
   a quien pregunta desde afuera; el log sí, porque es donde mira quien opera.

El webhook de Meta recibe el mismo tratamiento, con una diferencia deliberada: **falla cerrado**.
Responder 200 sin haber podido verificar la firma le diría a Meta que el mensaje se procesó cuando en
realidad se descartó. El 503 hace que Meta reintente, que es lo correcto mientras la configuración se
arregla.

**Lección general:** un `await` fuera del `try` en un handler de Lambda convierte cualquier fallo de
infraestructura en un 500 sin diagnóstico. Vale revisarlo en cada función nueva.

---

## D-018 — El build se verifica antes de desplegar

**Fecha:** 2026-09-01 · **Estado:** vigente · **Corrige un defecto del runbook**

Ocurrido dos veces en producción: la API respondía 500 en todo y el log decía
`Runtime.ImportModuleError: Cannot find module 'index'`.

**La causa no era el código ni la configuración: era desplegar el template equivocado.**

| Template | `CodeUri` | Qué sube |
|---|---|---|
| `infra/template.yaml` | `../backend` | La carpeta cruda: TypeScript sin compilar, sin `index.mjs` |
| `.aws-sam/build/template.yaml` | `ContentFunction` | El bundle de esbuild |

Pasar `--template infra/template.yaml` al `sam deploy` empaqueta el fuente. Y lo peor no es que
falle: es que **falla en silencio**. CloudFormation reporta éxito, el stack queda verde, y las siete
Lambdas mueren al arrancar con un error que no menciona ni el empaquetado ni el template.

El runbook decía `sam build --template infra/template.yaml` seguido de `sam deploy` a secas, confiando
en que SAM tomara el template construido por defecto. Repetir `--template` en la segunda línea es lo
natural, y rompe todo. **Era una trampa del runbook, no un descuido de quien despliega.**

Tres cambios:

1. El runbook y `CLAUDE.md` usan **siempre** `sam deploy --template-file .aws-sam/build/template.yaml`,
   explícito, sin depender del valor por defecto.
2. `scripts/verificar-build.mjs` comprueba que cada artefacto tenga `index.mjs` en su raíz y que
   ningún `CodeUri` del template construido siga apuntando al fuente. Sale con código distinto de cero
   y dice exactamente qué hacer.
3. El síntoma está en la tabla de diagnóstico del runbook, con los dos templates lado a lado.

**Lección:** un despliegue que reporta éxito y deja el sistema muerto es peor que uno que falla. La
verificación va entre el build y el deploy, no después del incidente.

---

## D-019 — El MFA pasa de obligatorio a opcional para desbloquear el ingreso

**Fecha:** 2026-09-01 · **Estado:** vigente, **reversible y pendiente de revertir** · **Modifica:** D-005

`MfaConfiguration: 'ON'` dejaba el user pool inaccesible. Con MFA obligatorio y ningún TOTP inscrito,
Cognito responde al primer ingreso con el reto **`MFA_SETUP`**, y `amazon-cognito-identity-js` invoca
`callback.mfaSetup(...)`. `web/src/gestor/Login.tsx` implementa `totpRequired`, `mfaRequired` y
`newPasswordRequired`, pero **no** `mfaSetup`: el ingreso muere con un `TypeError`.

No había forma de rodearlo desde fuera del navegador. El cliente del pool solo habilita
`ALLOW_USER_SRP_AUTH` y `ALLOW_REFRESH_TOKEN_AUTH`, así que `admin-initiate-auth` con contraseña no
está disponible y no se puede obtener la sesión que `associate-software-token` necesita. Sin inscribir
el TOTP no se entra; sin entrar no se inscribe el TOTP.

Decisión: **`MfaConfiguration: 'OPTIONAL'`**, manteniendo `EnabledMfas: [SOFTWARE_TOKEN_MFA]`.

Se eligió `OPTIONAL` y no `OFF` deliberadamente. Con ningún gestor inscrito el efecto práctico hoy es
el mismo — nadie recibe el reto — pero `OPTIONAL` deja el segundo factor disponible cuenta por cuenta
sin otro despliegue, y volver a `ON` no exige recrear el pool.

**Esto es deuda de seguridad, no una decisión de diseño.** Los gestores ven datos de familias con
recién nacidos, incluidas las notas de texto libre que la familia autorizó. `tratamiento-datos.md`
declaraba el MFA obligatorio como medida de protección y ahora declara la excepción.

Para cerrarla hay que implementar `mfaSetup` en el ingreso: llamar a `associateSoftwareToken`, mostrar
el secreto y su QR, verificar el código de seis dígitos y recién entonces volver a `ON`. Es lo único
que falta; el resto del flujo TOTP (`totpRequired` → `submitMfaCode`) ya está escrito y funciona.

**No arranque el piloto con esto en `OPTIONAL`.**

---

## D-020 — El claim `cognito:groups` llega entre corchetes, y la verificación de grupo va en la entrada

**Fecha:** 2026-09-01 · **Estado:** vigente · **Corrige:** D-012

Un gestor que **sí** estaba en el grupo veía la lista de familias pero recibía 403 al abrir el
detalle: `{"error":"forbidden","message":"La cuenta no pertenece al grupo de gestores"}`.

Dos defectos distintos, y el segundo escondía al primero.

**1. El autorizador aplana los claims multivaluados a una cadena entre corchetes.**

El autorizador JWT nativo del HTTP API no entrega `cognito:groups` como arreglo. Entrega
`"[gestores]"` —una sola cadena, con los corchetes adentro— y con dos grupos, `"[a b]"`. El parseo
partía por espacios y comas sin quitar los corchetes, así que el grupo quedaba como `"[gestores]"` y
no coincidía con ninguno. **Ningún gestor podía abrir el detalle de una familia.**

La firma del tipo dice `Record<string, unknown>` y el código contemplaba el caso arreglo, que es el
que nunca ocurre en producción. El parseo no tenía test: los tests de `admin` construían el `Gestor`
ya armado y ejercían `assertIsGestor`, nunca la traducción desde los claims. La lógica correcta
estaba probada; la traducción que la alimenta, no.

El parseo se mudó a `handlers/admin/claims.ts`, puro y sin AWS, porque `index.ts` construye los
clientes al cargar el módulo y no se puede importar desde un test. Acepta las tres formas —arreglo,
cadena entre corchetes, cadena con comas— y `test/handlers/admin-claims.test.ts` las cubre.

**2. La verificación de grupo estaba en tres rutas, no en la entrada.**

`assertIsGestor` se llamaba en el detalle de familia, la respuesta a un mensaje y la exportación,
pero **no** en `GET /familias` ni en `GET /bandeja`. Cualquier cuenta del user pool, sin pertenecer a
ningún grupo, podía listar todas las familias con el nombre del bebé, su semana y su actividad
reciente. Fue lo que hizo que el defecto 1 se viera como "la lista funciona pero el detalle no", en
vez de como lo que era: nadie pasaba la verificación.

Ahora la verificación es lo primero del handler, antes de leer el programa activo. Las tres llamadas
de `logic.ts` se quedan: son la defensa que impide invocar esas funciones por otra vía.

**Lección:** probar la regla de autorización no es probar la autorización. Entre el token y la regla
hay una traducción, y ahí estaba el defecto. Cuando una verificación se repite ruta por ruta, la
pregunta no es si cada llamada es correcta, sino cuál falta.

## D-021 — El cerebro que crece: solo acumula, nunca se apaga

**Fecha:** 2026-09-01 · **Estado:** vigente

La familia ve, en la pantalla de bitácora, un cerebro con una red de conexiones que crece con cada día
de encuentros. Es la metáfora correcta para este programa: la lectura compartida en los primeros meses
es literalmente construcción de conexiones neuronales, y es lo que la evidencia que cita la propuesta
respalda.

### La regla que importa más que el dibujo

**Nunca decae, nunca se apaga, nunca retrocede.**

Es tentador lo contrario. "Riéguelo para que no se marchite" engancha, y hay mucha app que lo hace.
Acá sería un error, por dos razones:

1. **A quién se lo estaríamos haciendo.** Una madre con un recién nacido, agotada, en el peor mes de su
   vida para sentirse evaluada. Un cerebro que se apaga porque tuvo una mala semana es un dispositivo
   de culpa apuntado a alguien vulnerable, y contradice el principio 3.4 del modelo operativo:
   *"reconoce los primeros meses como período de adaptación; fortalece la confianza del cuidador...
   con mensajes positivos"*.
2. **Lo que le haría al dato.** Si registrar tiene costo emocional, la gente deja de registrar. Y la
   bitácora es la fuente primaria de los indicadores del piloto: un dibujo que castiga terminaría
   corrompiendo justo la medición que el piloto existe para hacer.

El cerebro muestra **lo que esa familia construyó**, no cómo va este mes. Está garantizado por diseño,
no por disciplina: `brainState()` es una función pura del historial, y el historial solo acumula. No
existe un camino de código por el que algo se apague. Hay un test que lo verifica.

### Qué lo hace crecer

**Un día distinto con actividad de ese tipo enciende una rama.** No cada registro: días.

- Coincide con el indicador de adherencia del piloto (`indicadores.md`, A1–A2).
- Premia la constancia, que es literalmente el mensaje del programa: *"un minuto basta"*.
- No se puede inflar registrando diez veces una tarde.

Las cuatro actividades tienen color propio, así una familia que solo lee ve que le falta cantar sin que
nadie se lo diga. La leyenda muestra los días de cada una.

### Cómo está hecho

**SVG inline.** Sin dependencia (regla 12), nítido a cualquier densidad, animable con CSS puro, hereda
los tokens de color y el alto contraste que la app ya tiene, y pesa unos kilobytes que el service
worker precachea — así que **dibuja sin señal**, que es cuando más se usa.

La red **crece hacia afuera desde el centro, en orden cronológico**, y cada rama nueva se cuelga de la
más cercana ya dibujada. Eso es lo que la hace leer como irrigación en vez de como una estrella, y es
verdadero: la forma del cerebro es la forma de la historia real de esa familia. La geometría es
determinista, así que una familia siempre ve el mismo cerebro.

Se construye con el historial **mezclado** (servidor + cola), así que una rama aparece en el instante
en que se registra la entrada, con o sin conexión.

**Accesibilidad:** el `aria-label` dice lo mismo que el dibujo —días, conexiones, desglose por
actividad— y hay una cifra en texto al lado. `prefers-reduced-motion` entrega el dibujo terminado sin
animación.
