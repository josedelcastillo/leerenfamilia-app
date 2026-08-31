# Arquitectura

Estado: **fase 4**. Infraestructura, dominio, integración con WhatsApp y envío semanal construidos y probados, con el ciclo completo verificado en modo mock; la PWA y los informes llegan en las fases 5 a 7.

## Forma general

```
Familia (WhatsApp) ──────────────────────────────────────────┐
                                                             │
QR clínica ──> CloudFront ──┬── /*      ──> S3 (PWA)         │
                            │                                │
                            └── /api/*  ──> HTTP API         │
                                              │              │
      ┌───────────┬───────────┬───────────┬───┴──────┐       │
      ▼           ▼           ▼           ▼          ▼       │
 fn-register  fn-content  fn-tracking fn-feedback fn-admin    │
      │           │           │           │          │       │
      └───────────┴───────────┴───────────┴──────────┴───────┤
                                                             ▼
EventBridge Scheduler ──> fn-weekly-send ──────────> DynamoDB (tabla única)
Meta Cloud API ──webhook──> fn-wa-webhook ──────────────┘
Cognito User Pool ──JWT──> solo /api/gestor/*
```

Siete Lambdas, una tabla, un bucket, una distribución, un user pool.

**La API va por detrás de CloudFront, no en su propio dominio.** El mismo origen sirve la PWA y `/api/*`, así
que el navegador nunca hace preflight CORS: una ida y vuelta menos en cada escritura, que es justo lo que
importa con la conectividad de las familias objetivo. Cuesta lo mismo (una distribución, ya necesaria) y deja
un solo dominio que configurar.

## Las siete Lambdas

| Función | Ruta | Autenticación | Fase |
|---|---|---|---|
| `fn-register` | `POST /api/registro` | ninguna (flujo del QR) | 1 |
| `fn-content` | `GET /api/contenido/{proxy+}` | token de familia | 5 |
| `fn-tracking` | `POST /api/seguimiento/{proxy+}` | token de familia | 5 |
| `fn-feedback` | `GET·POST /api/feedback` | token de familia | 5 |
| `fn-admin` | `ANY /api/gestor/{proxy+}` | **JWT de Cognito** | 6 |
| `fn-weekly-send` | EventBridge Scheduler | — | 4 |
| `fn-wa-webhook` | `GET·POST /api/whatsapp/webhook` | firma HMAC de Meta | 3 |

Todas arm64, Node.js 22, ESM, bundle de esbuild. Cada una con su log group propio y `RetentionInDays: 14`.

La respuesta del gestor a un feedback vive dentro de `fn-admin`; ver `decisiones.md` D-004.

## Modelo de datos

Tabla única, `PK`/`SK`, `PAY_PER_REQUEST`, un GSI.

| Entidad | PK | SK | GSI1PK | GSI1SK |
|---|---|---|---|---|
| Programa | `PROGRAM#<pid>` | `META` | — | — |
| Contenido | `PROGRAM#<pid>` | `CONTENT#<01..08>` | — | — |
| Familia | `FAMILY#<fid>` | `META` | `PROGRAM#<pid>#STATUS#<estado>` | `<anchor_date>#<fid>` |
| Cuidador | `FAMILY#<fid>` | `CAREGIVER#<msisdn>` | `MSISDN#<msisdn>` | `FAMILY#<fid>` |
| Bebé | `FAMILY#<fid>` | `BABY` | — | — |
| Consentimiento | `FAMILY#<fid>` | `CONSENT#<iso_ts>` | — | — |
| Acceso a recurso | `FAMILY#<fid>` | `ACCESS#<iso_ts>#<rid>` | — | — |
| Bitácora | `FAMILY#<fid>` | `LOG#<iso_ts>` | — | — |
| Feedback | `FAMILY#<fid>` | `FEEDBACK#<iso_ts>` | `PROGRAM#<pid>#FEEDBACK#<estado>` | `<iso_ts>#<fid>` |
| Envío | `FAMILY#<fid>` | `DELIVERY#<iso_week>` | — | — |
| Auditoría gestor | `AUDIT#<yyyy-mm>` | `<iso_ts>#<gestor_sub>` | — | — |
| Dedup de WhatsApp | `WAMSG#<message_id>` | `DEDUPE` | — | — |

Todo lo que cuelga de una familia comparte partición, así que la vista de detalle del gestor es **un solo
Query** y el borrado por derecho de supresión es un Query más un BatchWrite sobre esa partición.

### Por qué un solo GSI alcanza para tres patrones

El encargo pide un GSI para las consultas del gestor y justificar cualquier adicional. No hace falta ninguno
adicional: el mismo índice sirve tres accesos que no comparten forma de clave pero sí de índice.

1. **Familias por estado**, ordenadas por fecha de ancla — listado del gestor.
2. **Feedback por estado**, ordenado por fecha — bandeja unificada, filtro por `abierto`.
3. **Teléfono → familia** — este no estaba en el encargo y es obligatorio: cuando entra un mensaje de
   WhatsApp, `fn-wa-webhook` solo tiene el número E.164 del remitente y necesita resolver de qué familia y de
   qué cuidador se trata. Sin este acceso habría que escanear la tabla en cada mensaje entrante.

### TTL

El atributo `ttl` gobierna dos cosas, y el borrado por TTL no se cobra:

- **Auditoría del gestor**: 12 meses, el plazo de retención de la sección 8 del encargo.
- **Dedup de mensajes de WhatsApp**: unos días bastan; Meta no reintenta más allá de eso.

Nada más lleva TTL. La bitácora, el feedback y los datos de la familia se borran por acción explícita
(derecho de supresión), nunca por vencimiento silencioso.

### Retención de la tabla

`DeletionPolicy: Retain` y `UpdateReplacePolicy: Retain`. La tabla guarda la única copia de los datos del
piloto, incluidos datos de menores; un `sam delete` no puede ser lo que los destruya. El nombre de la tabla
lo genera CloudFormation, así que un stack nuevo no choca con la tabla retenida del anterior.

PITR queda apagado por defecto (parámetro `EnablePointInTimeRecovery`) para sostener la meta de US$0. Se
cuantifica en `costos.md`; vale la pena reconsiderarlo cuando haya familias reales cargadas.

## Autenticación

**Familia: sin login.** El enlace que llega por WhatsApp lleva un token HMAC firmado con
`family_id` + `caregiver_msisdn` + `exp`, validado dentro de cada Lambda de familia. Identifica al cuidador,
no solo a la familia, porque hace falta saber si la bitácora la llenó la madre o el padre. Vence a los 90
días y se renueva en cada envío semanal.

No se usa un autorizador Lambda: sería una octava función y una invocación extra por request. La validación
va en código compartido dentro de cada handler.

**Gestor: Cognito.** User pool tier Lite, MFA TOTP obligatorio, sin auto-registro, contraseñas de 12
caracteres con las cuatro clases, un solo grupo `gestores`, autorizador JWT nativo del HTTP API. Verificación
de costo y de por qué TOTP y no SMS: `decisiones.md` D-005.

## Secretos

CloudFormation **no puede crear parámetros `SecureString`**, así que el template no los crea: los declara por
referencia y otorga permiso de lectura sobre el prefijo. Se crean fuera de banda una sola vez (queda en el
runbook de la fase 8), bajo `/nplp/<stack-name>/`:

| Parámetro | Uso |
|---|---|
| `WA_PHONE_NUMBER_ID` | Graph API |
| `WA_ACCESS_TOKEN` | Graph API |
| `WA_APP_SECRET` | validación de `X-Hub-Signature-256` |
| `WA_VERIFY_TOKEN` | handshake `hub.challenge` |
| `APP_TOKEN_SECRET` | clave HMAC de los tokens de familia |

Se leen en cold start y se cachean en memoria. Nunca como variable de entorno en texto plano, nunca en el
repositorio. Las Lambdas tienen `ssm:GetParameter*` sobre ese prefijo y `kms:Decrypt` sobre
`alias/aws/ssm`, nada más.

## Hosting de la PWA

Bucket privado, sin acceso público, cifrado SSE-S3, `BucketOwnerEnforced`. CloudFront llega con Origin
Access Control (SigV4); la política del bucket solo acepta al servicio de CloudFront con `SourceArn` de esta
distribución.

Las rutas del cliente se reescriben a `index.html` con una **CloudFront Function** en viewer-request,
asociada **solo al comportamiento de S3**. Es deliberado: `CustomErrorResponses` es una configuración de
distribución completa, así que mapear 403 → `index.html` habría convertido un 401 o un 403 legítimo de la API
en una página HTML con status 200, escondiendo fallos de autenticación. La función se cobra recién a partir
de 2 M invocaciones al mes.

Sin `Aliases` y sin certificado ACM: el stack funciona sobre el dominio `*.cloudfront.net`. Si más adelante
hay dominio propio, se apunta un CNAME desde el registrador existente y se evita la hosted zone de Route 53.

## Separación de bundles en la PWA

Las dos superficies se parten en el entry point con `lazy()`, antes de cualquier router. El build produce
`FamilyApp` y `ManagerApp` como chunks separados: **el dispositivo de una familia nunca descarga el bundle
del gestor.** `shared/` no puede importar de `app/` ni de `gestor/`; esa flecha en un solo sentido es lo que
sostiene la separación.

## Capas del backend

```
handlers/   entrada y salida HTTP, nada de reglas de negocio
  ↓
domain/     lógica pura — sin AWS SDK, sin red, sin reloj a nivel de módulo
  ↑
adapters/   DynamoDB, SSM, proveedor de WhatsApp, Cognito
```

`domain/` no importa de `adapters/` ni de `handlers/`. Es la capa que sostiene los indicadores del piloto y
la única con exigencia de cobertura seria. Sus tests corren con `node --test`, sin red y sin credenciales.

### Módulos de dominio (fase 2)

| Módulo | Responsabilidad |
|---|---|
| `dates.ts` | Fecha calendario `YYYY-MM-DD` como tipo propio, días entre fechas, semana ISO |
| `schedule.ts` | Política de ancla, semana del programa, semanas desbloqueadas |
| `eligibility.ts` | Si una familia recibe envío hoy, a quiénes, y por qué no si no |
| `service-window.ts` | Ventana de servicio de 24 h y elección entre mensaje libre y plantilla |
| `opt-in.ts` | Consentimiento, palabras de baja, transiciones de opt-in/opt-out |
| `msisdn.ts` | Normalización a E.164 de lo que las familias realmente escriben |
| `feedback.ts` | Máquina de estados del feedback, respuestas append-only |
| `errors.ts` | `DomainError` con códigos estables que los handlers mapean a HTTP |

**La semana del programa se cuenta en días calendario, no en instantes.** Una familia que se inscribe a las
23:00 en Lima se inscribió *ese* día, aunque en UTC ya sea el siguiente. Los handlers convierten "ahora" a
fecha de Lima en el borde; de `domain/` para adentro no hay reloj ni zona horaria.

Un test de arquitectura (`test/domain/purity.test.ts`) verifica en cada corrida que ningún módulo de dominio
importe el SDK de AWS, importe de capas externas, lea el reloj o el entorno, o haga I/O. Si alguien rompe la
regla, falla el build en vez de descubrirse en revisión.

## Integración WhatsApp (fase 3)

`WhatsAppProvider` tiene dos implementaciones detrás de la misma interfaz, elegidas por `WA_PROVIDER`:

- `MetaCloudProvider` — Graph API directo, versión fijada por el parámetro `WaGraphVersion`.
- `MockProvider` — no llama a Meta. Escribe el payload a CloudWatch y a la tabla, con un id de mensaje
  prefijado `wamid.MOCK-` para que un envío simulado nunca se confunda con uno real en los datos ni en el
  informe final.

**Cualquier valor que no sea exactamente `meta` selecciona el mock.** Una variable mal escrita debe fallar
hacia no enviar nada, nunca hacia enviar mensajes reales a familias reales con una configuración sin
verificar.

### Webhook

| Aspecto | Cómo |
|---|---|
| Verificación (`GET`) | `hub.challenge` se devuelve solo si `hub.verify_token` coincide, comparado en tiempo constante |
| Firma (`POST`) | HMAC-SHA256 sobre los **bytes crudos**, comparación de tiempo constante, 403 si no valida. Sin bypass |
| Deduplicación | Reclamación condicional de `message.id`, liberada si el procesamiento falla |
| Ventana de servicio | Cada entrante actualiza `lastInboundAt` del cuidador |
| Estados | Un ítem por `(wamid, status)`, con el objeto `pricing` verbatim |
| Entrantes de texto | Se archivan como `consulta` abierta en la misma bandeja que la PWA |
| Bajas | `BAJA`/`STOP`/`SALIR` exactos: opt-out más confirmación por mensaje libre |
| Aislamiento | Un evento que falla no detiene el resto del lote |

El detalle de las decisiones y sus motivos está en `decisiones.md` D-006 y D-007.

### Secretos en el cold start

`ParameterStore` lee los `SecureString` en lote y los cachea en memoria **con vencimiento de 15 minutos**.
No es solo caché: un contenedor caliente sosteniendo un token rotado durante horas sería una caída que
parece un problema de Meta. Las lecturas de parámetros estándar en SSM no se cobran, así que el refresco es
gratis.

## Envío semanal (fase 4)

`fn-weekly-send` lo dispara EventBridge Scheduler los lunes 09:00 hora de Lima. Por cada programa activo
recorre sus familias, calcula la semana desde la `anchor_date` guardada, decide elegibilidad y envía.

**El orden importa y es la garantía de que nadie paga dos veces**: el registro `DELIVERY#<iso_week>` se
escribe con escritura condicional *antes* de enviar el primer mensaje. Ver `decisiones.md` D-008 para los
tres estados por destinatario y por qué un `pendiente` no se reintenta nunca de forma automática.

### El enlace que recibe la familia

El botón del template lleva un token HMAC de 90 días que identifica **al cuidador**, no solo a la familia —
hace falta para saber si la bitácora la llenó la madre o el padre. Se reemite en cada envío semanal, así que
una familia activa nunca llega al vencimiento. La clave está en `APP_TOKEN_SECRET` (SSM `SecureString`).

Un token con el payload editado no valida: la firma cubre familia, cuidador y vencimiento. Con test.

### Reconciliación con la factura de Meta

Al enviar se escribe `WAMID#<wamid> / META` con la familia y la semana ISO. El webhook de `statuses` escribe
en esa **misma partición** el objeto `pricing` verbatim. Reconciliar una línea de la factura de Meta contra
una familia y una semana es entonces un solo Query, y se puede ver si el template está cayendo como
`utility` o como `marketing`, que es la diferencia de precio.

### La hora del día

El scheduler corre en `America/Lima` y la fecha calendario se resuelve con `Intl`, no restando cinco horas.
Perú no tiene horario de verano, pero la conversión explícita mantiene esto correcto si la plataforma se usa
en otro lado — y es la frontera de la que depende todo el cálculo de semanas.

## Toolchain

**TypeScript sin framework de tests.** Node 22.22 ejecuta TypeScript de forma nativa, así que `node --test`
corre los tests directamente sobre el fuente: no hay jest, ni vitest, ni paso de compilación para probar.
Una dependencia menos que justificar.

`esbuild` está en `dependencies` y no en `devDependencies` a propósito: el build method de SAM instala la
función sin dependencias de desarrollo y no lo encontraría. No llega al artefacto de Lambda — esbuild emite
solo el bundle, sin `node_modules`.

## Verificación hecha en esta fase

| Comprobación | Resultado |
|---|---|
| `sam validate --lint` | Pasa |
| `sam build` | Pasa; 7 artefactos ESM, 108 KB en total |
| `npm test` (backend, sin red ni credenciales) | 238 tests, todos pasan |
| `tsc --noEmit` (backend y web) | Pasa |
| `npm run build` (web) | Pasa; chunks de familia y gestor separados |
| `sam deploy` | **No ejecutado** — no hay credenciales AWS en este entorno |

El despliegue real contra una cuenta limpia queda por verificar. Todo lo anterior a él está comprobado.
