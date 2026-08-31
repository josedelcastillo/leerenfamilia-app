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

**MFA por SMS queda excluido deliberadamente.** No es una limitación del tier: los SMS se facturan aparte vía
SNS por mensaje, y enviar a Perú además exige resolver origination number y salir del sandbox de SNS. TOTP
evita el gasto y el trámite. El costo para el gestor es tener que instalar una app de autenticación.

Lo que **no** entra por venir en Plus: threat protection, autenticación adaptativa por riesgo y detección de
credenciales comprometidas. Para 5 cuentas creadas a mano, con MFA obligatorio y sin auto-registro, la
relación costo/beneficio no lo justifica. Queda anotado por si el alcance cambia.
