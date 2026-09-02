# Runbook

Cómo se despliega, se opera y se apaga esta plataforma. Está escrito para alguien que no la construyó.

> **`sam deploy` nunca se ejecutó.** Se verificaron `sam validate --lint`, `sam build`, los tests y los
> builds de la PWA, pero el entorno donde se desarrolló no tiene credenciales de AWS. El primer
> despliegue contra una cuenta limpia es la comprobación que falta.

## Requisitos

- Node.js **≥ 22.18** — el runner de tests ejecuta TypeScript de forma nativa; no hay jest ni vitest
- AWS SAM CLI
- Credenciales de AWS con permiso para crear los recursos del template
- Región **us-east-1** (el certificado de CloudFront tiene que vivir ahí)

## Despliegue desde cero

### 1. Construir y desplegar la infraestructura

```bash
cd backend && npm install && cd ..
sam build --template infra/template.yaml
node scripts/verificar-build.mjs
sam deploy --guided --region us-east-1 --template-file .aws-sam/build/template.yaml
```

> **`--template-file .aws-sam/build/template.yaml` no es opcional.** Es el error de despliegue más
> caro de este proyecto y ya ocurrió dos veces. Si pasa `--template infra/template.yaml` al `deploy`,
> SAM empaqueta el **fuente** —la carpeta `backend/` tal cual, sin bundle— en vez del artefacto
> construido. CloudFormation reporta éxito, el stack queda verde, y **todas las Lambdas mueren al
> arrancar** con `Runtime.ImportModuleError: Cannot find module 'index'`, que no dice nada del motivo
> real. `verificar-build.mjs` lo detecta antes de desplegar.

En `--guided`, los parámetros que importan:

| Parámetro | Valor sugerido |
|---|---|
| `WaProvider` | `mock` hasta que exista la WABA |
| `WeeklySendCron` | `cron(0 9 ? * MON *)` |
| `WeeklySendTimezone` | `America/Lima` |
| `EnablePointInTimeRecovery` | **`true`** — cuesta ~US$0.002/mes, ver `costos.md` |
| `WaGraphVersion` | verificar contra el changelog de Meta antes del arranque |

Anote los outputs: `SiteUrl`, `WebBucketName`, `UserPoolId`, `UserPoolClientId`, `SsmPrefix`, `TableName`.

### 2. Crear los secretos

CloudFormation **no puede crear parámetros `SecureString`**, así que van fuera de banda. Nunca en el
repositorio, nunca como variable de entorno en texto plano.

```bash
STACK=<nombre-del-stack>

# Clave HMAC de los enlaces de las familias. Genérela, no la invente.
aws ssm put-parameter --type SecureString --name /nplp/$STACK/APP_TOKEN_SECRET \
  --value "$(openssl rand -base64 48)"

# WhatsApp. Con WaProvider=mock puede poner valores de prueba, pero tienen que existir:
# el webhook valida firma siempre y falla si el secreto no está (D-007).
aws ssm put-parameter --type SecureString --name /nplp/$STACK/WA_APP_SECRET      --value '...'
aws ssm put-parameter --type SecureString --name /nplp/$STACK/WA_VERIFY_TOKEN    --value '...'
aws ssm put-parameter --type SecureString --name /nplp/$STACK/WA_ACCESS_TOKEN    --value '...'
aws ssm put-parameter --type SecureString --name /nplp/$STACK/WA_PHONE_NUMBER_ID --value '...'
```

### 3. Publicar la PWA

La configuración de Cognito va en un `config.json` que se escribe al desplegar, no compilada en el
bundle: así un mismo build sirve para cualquier stack.

```bash
cd web && npm install && npm run build

POOL=$(aws cloudformation describe-stacks --stack-name $STACK \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)
CLIENT=$(aws cloudformation describe-stacks --stack-name $STACK \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" --output text)
printf '{"userPoolId":"%s","userPoolClientId":"%s"}\n' "$POOL" "$CLIENT" > dist/config.json

BUCKET=$(aws cloudformation describe-stacks --stack-name $STACK \
  --query "Stacks[0].Outputs[?OutputKey=='WebBucketName'].OutputValue" --output text)
aws s3 sync dist/ s3://$BUCKET/ --delete
```

**Invalide la caché de CloudFront** después de cada publicación. Los archivos con hash en el nombre no
lo necesitan; `index.html`, `config.json` y el service worker sí.

```bash
DIST=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='$STACK - PWA and API'].Id" --output text)
aws cloudfront create-invalidation --distribution-id $DIST \
  --paths '/index.html' '/config.json' '/sw.js' '/manifest.webmanifest'
```

### 4. Crear el programa y el contenido

```bash
cd backend && TABLE_NAME=$(aws cloudformation describe-stacks --stack-name $STACK \
  --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue" --output text) \
  node scripts/seed-demo.ts
```

Esto crea el programa `piloto-2026`, las 8 semanas de contenido **placeholder** y tres familias de
demostración con prefijo `demo-`. **Antes del arranque real hay que reemplazar el contenido placeholder
y borrar las familias de demostración.**

### 5. Crear los gestores

Sin auto-registro: los crea un administrador. MFA con app de autenticación es obligatorio y se configura
en el primer ingreso.

```bash
aws cognito-idp admin-create-user --user-pool-id $POOL \
  --username persona@leerenfamilia.pe \
  --user-attributes Name=email,Value=persona@leerenfamilia.pe Name=email_verified,Value=true

aws cognito-idp admin-add-user-to-group --user-pool-id $POOL \
  --username persona@leerenfamilia.pe --group-name gestores
```

**El grupo `gestores` no es opcional.** Una cuenta fuera del grupo pasa el autorizador JWT pero recibe
403 de la API (D-012).

### 6. Verificar

```bash
curl -s $SITE_URL/app -o /dev/null -w "PWA %{http_code}\n"
curl -s $SITE_URL/api/contenido -o /dev/null -w "API sin token: %{http_code} (debe ser 401)\n"

aws lambda invoke --function-name <stack>-WeeklySendFunction-XXXX /dev/stdout | jq .
```

El envío semanal en modo mock no manda nada a Meta: escribe el payload a CloudWatch y a la tabla.
Búsquelo con `aws logs tail /nplp/$STACK/fn-weekly-send --follow`.

## Conectar WhatsApp de verdad

Cuando exista la WABA:

1. Verificar `WaGraphVersion` contra el changelog de Meta.
2. Cargar las cuatro credenciales reales en SSM (paso 2).
3. Configurar el webhook en Meta apuntando a `https://<dominio>/api/whatsapp/webhook`, con el mismo
   `WA_VERIFY_TOKEN`. Meta hace un `GET` de verificación; si el token no coincide, responde 403.
4. Suscribirse a los campos `messages` **y** `message_status`. Sin el segundo no hay datos de `pricing`
   y no se puede conciliar la factura.
5. Enviar plantillas a aprobación: `nplp_semana` (envío semanal) y `nplp_respuesta` (respuesta a
   feedback). Redacte la segunda como respuesta a una solicitud del usuario; es lo que la hace
   defendible como `utility` y no como `marketing`.
6. Recién entonces: `sam deploy --template-file .aws-sam/build/template.yaml --parameter-overrides WaProvider=meta`.

**Cambie a `meta` solo después de que el flujo completo funcione en `mock`.** Cualquier valor que no sea
exactamente `meta` selecciona el mock, a propósito: una variable mal escrita debe fallar hacia no enviar
nada.

## Operación semanal

| Cuándo | Qué |
|---|---|
| Lunes, después de las 09:00 | Revisar el reporte del envío: `aws logs filter-log-events --log-group-name /nplp/$STACK/fn-weekly-send --filter-pattern weekly_send.report` |
| Lunes | Si el reporte trae `needsReview`, revisar esas familias en la consola de Meta antes de reintentar nada |
| A diario | Bandeja del gestor: responder lo que esté `abierto` |
| Mensual | Revisar la factura de Meta contra `envios.csv` |

### El campo `needsReview`

Son familias cuyo envío quedó en estado `pendiente`: no sabemos si Meta lo aceptó. **Nunca se reintentan
automáticamente** (D-008), porque reintentar podría cobrar dos veces. Se resuelven mirando la consola de
Meta y decidiendo a mano.

## Diagnóstico

| Síntoma | Dónde mirar |
|---|---|
| **`Runtime.ImportModuleError: Cannot find module 'index'`** | Se desplegó el template **fuente** en vez del construido. Ver abajo |
| **La API responde 500 en todo** | Configuración o empaquetado, casi nunca código. Ver abajo |
| **La API responde 503 `configuracion_incompleta`** | Falta un `SecureString` en SSM. El log dice **cuál**: busque `missing_parameters` |
| El webhook responde 403 | `WA_APP_SECRET` no coincide con el App Secret de Meta. La firma se calcula sobre los bytes crudos |
| La familia no recibe el mensaje semanal | El reporte de `fn-weekly-send` dice la razón: `familia_inactiva`, `programa_finalizado`, `ya_enviado_esta_semana`, `sin_cuidadores_con_opt_in` |
| El gestor recibe 403 | La cuenta no está en el grupo `gestores`. Verifique con `aws cognito-idp list-users-in-group --user-pool-id $POOL --group-name gestores`. Si **sí** está y aun así recibe 403, es un token emitido antes de agregarla al grupo: `cognito:groups` se sella al autenticarse, así que hay que salir y volver a entrar |
| El gestor recibe 401 | Token vencido; volver a entrar. La sesión dura 1 hora |
| La familia recibe 401 | Su token venció (90 días). Se reemite en cada envío semanal, así que solo pasa si estuvo 90 días sin recibir nada |
| "global is not defined" en la vista del gestor | El `define` de Vite se perdió. Ver D-012 |
| El CSV abre con acentos rotos | Se perdió el BOM (D-014) |
| La app no carga sin conexión | El service worker no se registró. Verificar con `web/scripts/check-installable.mjs` |
| La familia no ve su historial de bitácora | Falta la ruta `GET /api/seguimiento`. Requiere `sam deploy`, no solo publicar la PWA |
| Un cambio de la PWA no aparece | Falta invalidar CloudFront para `/index.html` y `/sw.js` |

Todos los log groups están bajo `/nplp/<stack>/fn-*` con retención de 14 días.

### `Cannot find module 'index'`

La Lambda muere al arrancar, antes de ejecutar una sola línea propia. El artefacto desplegado no tiene
`index.mjs` en su raíz, casi siempre porque se desplegó el template fuente en lugar del construido.

Los dos templates son distintos y ahí está todo:

| Template | `CodeUri` | Qué sube |
|---|---|---|
| `infra/template.yaml` (fuente) | `../backend` | La carpeta `backend/` cruda: `src/`, `package.json`, TypeScript sin compilar |
| `.aws-sam/build/template.yaml` (construido) | `ContentFunction` | El bundle: `index.mjs` |

```bash
# Confirme qué hay dentro del artefacto:
ls .aws-sam/build/ContentFunction/     # debe listar index.mjs

# Y verifíquelo todo de una:
node scripts/verificar-build.mjs
```

La solución es siempre la misma: `sam build`, verificar, y desplegar con
`--template-file .aws-sam/build/template.yaml`.

### Cuando la API devuelve 500

Un 500 casi nunca es un error de lógica: es la Lambda muriendo antes de poder responder. Las tres
causas, en orden de frecuencia:

```bash
# 1. Mire el error real. Es lo primero, siempre.
aws logs tail /nplp/$STACK/fn-content --since 15m --follow
```

| Lo que dice el log | Qué pasó | Cómo se arregla |
|---|---|---|
| `missing_parameters` | Falta un `SecureString` en SSM | Paso 2 del despliegue. Desde esta versión responde **503**, no 500 |
| `AccessDenied` sobre `ssm:GetParameters` | La Lambda no puede leer el prefijo | El stack quedó a medio desplegar; vuelva a `sam deploy` |
| `Missing required environment variable` | `TABLE_NAME` o `SSM_PREFIX` no llegaron a la función | Ídem |
| `ResourceNotFoundException` de DynamoDB | La tabla del stack no existe | Si borró el stack, la tabla quedó retenida pero el nombre nuevo es otro |
| `ValidationException` sobre `GSI1` | El índice no existe | Despliegue incompleto |

**El prefijo tiene que coincidir exactamente con el nombre del stack.** Los parámetros se crean bajo
`/nplp/<stack>/`, y ese valor sale del output `SsmPrefix`. Si el stack se redesplegó con otro nombre,
los parámetros viejos quedaron huérfanos y la API responde 503 aunque en SSM haya secretos válidos con
el nombre anterior.

```bash
# Compruebe que están donde la Lambda los busca:
aws ssm get-parameters-by-path --path "/nplp/$STACK" --query 'Parameters[].Name'
# Debe listar los cinco: APP_TOKEN_SECRET, WA_APP_SECRET, WA_VERIFY_TOKEN,
# WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID
```

## Baja y supresión de datos

Derecho de supresión de la Ley 29733. Todo lo de una familia vive en una partición, así que borrarla es
un `Query` y un `BatchWrite` sobre `FAMILY#<id>`.

**La supresión borra bitácora y feedback, no solo el contacto.** El detalle del flujo está en
`tratamiento-datos.md`. El endpoint automatizado **no está construido todavía** — hoy se hace a mano y
eso hay que resolverlo antes del arranque, porque es una obligación legal, no una funcionalidad.

## Apagar el piloto

```bash
# 1. Exportar TODO antes de tocar nada. Con el piloto vivo, no después.
#    Desde la vista del gestor: los seis CSV.

# 2. Detener los envíos sin borrar nada
aws scheduler update-schedule --name $STACK-weekly-send --state DISABLED \
  --schedule-expression 'cron(0 9 ? * MON *)' --flexible-time-window Mode=OFF \
  --target '...'

# 3. Si se borra el stack, la tabla SOBREVIVE (DeletionPolicy: Retain)
sam delete --stack-name $STACK
```

La tabla se retiene a propósito: guarda la única copia de datos de menores y un `sam delete` no puede ser
lo que los destruya. Borrarla es un acto explícito y separado, y solo después de exportar y de resolver
qué se conserva para el seguimiento a 12 meses que exige el modelo operativo.

## Lo que falta antes del arranque real

No es una lista de mejoras. Es lo que impide operar de verdad:

| Pendiente | Fase / decisión |
|---|---|
| Contenido real de las 8 semanas | Leer en Familia. Hoy todo es placeholder |
| Íconos y logo reales | Leer en Familia. Hoy son placeholder |
| Texto de consentimiento revisado por un abogado | `tratamiento-datos.md` |
| Endpoint de supresión automatizado | Obligación legal, hoy manual |
| WABA y plantillas aprobadas | Meta |
| Umbrales de los indicadores | `indicadores.md`, tres constantes |
| Plazo de respuesta comprometido | Hallazgo 11 de `00-entendimiento.md` |
| Fecha de corte de reclutamiento | Hallazgo 3 |
| `sam deploy` verificado | Este documento |
