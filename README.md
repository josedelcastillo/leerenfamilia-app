# Nacidos para Leer Perú — plataforma del piloto clínico

Plataforma de acompañamiento para el piloto clínico de **Nacidos para Leer Perú**, iniciativa de
[Leer en Familia](https://www.leerenfamilia.pe/). Acompaña durante 8 semanas a familias con recién nacidos
con contenidos de lectura compartida, canto, conversación y juego, entregados por WhatsApp y por una PWA
que funciona sin conexión.

Escala del piloto: **50 familias, ~100 celulares, ~5 gestores.** Objetivo de infraestructura: **US$0/mes**.

Interfaz y contenido en español (Perú). Código y comentarios en inglés.

## Estado

| Fase | Entregable | Estado |
|---|---|---|
| 0 | Entendimiento y vacíos detectados | ✅ |
| 1 | Scaffolding, template SAM, DynamoDB, Cognito, arquitectura | ✅ |
| 2 | Dominio y tests: cronograma, elegibilidad, ventana de servicio, opt-in, feedback | ✅ |
| 3 | Proveedor de WhatsApp con mock, webhook con HMAC, idempotencia | ✅ |
| 4 | Scheduler semanal y envío end-to-end en modo mock | ✅ |
| 5 | PWA familia: contenido, bitácora, feedback, offline, cola de sincronización | ✅ |
| 6 | PWA gestor: Cognito, familias, bandeja unificada, respuesta, auditoría | ✅ |
| 7 | Exportación CSV de métricas del piloto | ✅ |
| 8 | `costos.md`, `runbook.md`, `tratamiento-datos.md` | ✅ |

## Estructura

```
ArchivosOriginales/documentos fuente originales (no tocar)
filesMD/ fuente de verdad derivada (no tocar)
docs/ entendimiento, decisiones, arquitectura, costos, runbook, datos
infra/template.yamltoda la infraestructura, AWS SAM
backend/src/
 handlers/ una carpeta por Lambda
 domain/ lógica pura, sin AWS SDK — la capa con cobertura seria
 adapters/ DynamoDB, SSM, WhatsApp, Cognito
 shared/
web/src/
 app/ superficie de la familia
 gestor/ superficie del gestor (chunk separado)
 shared/
```

Empiece por [`docs/00-entendimiento.md`](docs/00-entendimiento.md) y
[`docs/decisiones.md`](docs/decisiones.md); las decisiones de diseño y sus motivos están ahí, no en los
commits.

Si va a evaluar el piloto, mire [`docs/indicadores.md`](docs/indicadores.md) y los CSV de ejemplo en
[`docs/ejemplos/`](docs/ejemplos/). **Están para criticarlos ahora**: una vez que el piloto arranque, lo
que no se haya capturado no se puede reconstruir.

## Requisitos

- Node.js **≥ 22.18** (el runner de tests ejecuta TypeScript de forma nativa; no hay jest ni vitest)
- AWS SAM CLI
- Una cuenta AWS con credenciales configuradas, para desplegar

## Desarrollo

```bash
# Backend: tests y verificación de tipos. No necesitan red ni credenciales AWS.
cd backend && npm install && npm test && npm run typecheck

# PWA
cd web && npm install && npm test && npm run build # o npm run dev

# Instalabilidad y funcionamiento offline, contra un build servido
cd web && npx vite preview --port 4173 &
CHROMIUM_PATH=/ruta/a/chromium node scripts/check-installable.mjs http://localhost:4173/app

# Infraestructura
sam validate --template infra/template.yaml --lint
sam build --template infra/template.yaml
```

## Despliegue

Los tres pasos se corren **desde la raíz del repositorio**, en este orden:

```bash
# 1. Construir: genera .aws-sam/build/ con un bundle de esbuild por Lambda
sam build --template infra/template.yaml

# 2. Verificar el build ANTES de desplegar
node scripts/verificar-build.mjs

# 3. Desplegar el template CONSTRUIDO, con el samconfig por ruta ABSOLUTA
sam deploy --template-file .aws-sam/build/template.yaml \
           --config-file "$PWD/infra/samconfig.toml"
```

En el primer despliegue de una cuenta nueva, agregue `--guided` al paso 3. Región: `us-east-1`.

Las dos banderas del `deploy` no son opcionales. Cada una evita, por separado, un despliegue que
**reporta éxito y deja el sistema muerto**.

### `--template-file .aws-sam/build/template.yaml`

`infra/template.yaml` tiene `CodeUri: ../backend`, así que pasárselo al `deploy` sube la carpeta
`backend/` cruda —TypeScript sin compilar, sin `index.mjs` en la raíz del artefacto— en lugar del
bundle. CloudFormation reporta éxito, el stack queda verde y las siete Lambdas mueren al arrancar con
`Runtime.ImportModuleError: Cannot find module 'index'`, un error que no menciona ni el empaquetado ni
el template. Ya ocurrió tres veces; ver [D-018](docs/decisiones.md).

Cómo reconocerlo sin leer logs: el artefacto correcto pesa decenas de KB por función. Si la Lambda
desplegada pesa megabytes, se subió el fuente.

```bash
aws lambda get-function --function-name <stack>-ContentFunction-XXXX \
  --query 'Configuration.CodeSize'
```

### `--config-file` con ruta absoluta

`samconfig.toml` vive en `infra/` y está en `.gitignore` (lleva el nombre del stack y los
`parameter_overrides`, no secretos). SAM CLI resuelve un `--config-file` **relativo desde el directorio
del template**, no desde el directorio actual: `samconfig_dir` se fija en
`samcli/commands/_utils/options.py` a partir de la ruta del template, y `samcli/cli/cli_config_file.py`
solo respeta la ruta tal cual si es absoluta.

Con el template construido, un `--config-file infra/samconfig.toml` se busca en
`.aws-sam/build/infra/samconfig.toml` y falla con *«Config file does not exist or could not be read»*.
Por lo mismo, **mover `samconfig.toml` a la raíz tampoco resuelve nada**: sin la bandera, SAM lo
buscaría en `.aws-sam/build/`.

Si prefiere no depender del samconfig, la alternativa es pasar todo suelto en la línea de comandos:
`--stack-name`, `--region`, `--capabilities CAPABILITY_IAM` y `--parameter-overrides`.

Después del primer despliegue, cree los parámetros `SecureString` bajo el prefijo que devuelve el output
`SsmPrefix`. CloudFormation no puede crearlos, y **ningún secreto entra al repositorio**:

```bash
aws ssm put-parameter --type SecureString --name /nplp/<stack>/WA_ACCESS_TOKEN --value '...'
# ídem WA_PHONE_NUMBER_ID, WA_APP_SECRET, WA_VERIFY_TOKEN, APP_TOKEN_SECRET
```

La superficie del gestor lee la configuración de Cognito de un `config.json` que se escribe al desplegar
desde los outputs del stack, no del bundle:

```bash
aws cloudformation describe-stacks --stack-name <stack> \
 --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`||OutputKey==`UserPoolClientId`]' > /tmp/out.json
# construya config.json con esos dos valores y súbalo junto con el resto del build
#aws s3 cp web/dist/ s3://sam-app-leer-en-familia-webbucket-qtqhicyczvds/ --recursive --delete
aws s3 sync dist/ s3://sam-app-leer-en-familia-webbucket-qtqhicyczvds/ --delete
aws cloudfront create-invalidation --distribution-id E3KLZJIWYZ768G  --paths '/index.html' '/config.json' '/sw.js' '/manifest.webmanifest'
```

El piloto se puede desarrollar y demostrar entero con `WaProvider=mock`, sin WABA y sin gastar nada: el
proveedor mock escribe el payload a CloudWatch y a la tabla de auditoría en vez de llamar a Meta.

Para ver el ciclo completo antes de que exista el registro por QR (fase 5), siembre datos de demostración e
invoque el envío semanal:

```bash
cd backend && TABLE_NAME=<tabla> node scripts/seed-demo.ts
aws lambda invoke --function-name <stack>-fn-weekly-send /dev/stdout
```

La siembra crea tres familias en semanas distintas del programa, que es la situación que produce el anclaje
al ingreso. Todos los identificadores llevan prefijo `demo-`.

## Protección de datos

Se procesan datos de menores de edad bajo la Ley 29733. El inventario, la base legal, los plazos de
conservación y el flujo de supresión están en
[`docs/tratamiento-datos.md`](docs/tratamiento-datos.md), **marcado como borrador para revisión legal**:
lo escribió quien construyó la plataforma, no un abogado.

## Antes de que esto llegue a una familia real

La lista completa está al final del [runbook](docs/runbook.md). Lo que más pesa:

- El stack está desplegado en `us-east-1`, pero **con `WaProvider=mock`**: nada ha salido hacia Meta todavía
- El contenido de las 8 semanas, los íconos y el texto de consentimiento son **placeholder**
- El **endpoint de supresión de datos no está construido**; hoy es manual, y es una obligación legal
- No existe la WABA: todo el flujo se demuestra con `WA_PROVIDER=mock`, sin gastar nada


Key TableName
DescriptionSingle DynamoDB table. 
Values: am-app-leer-en-familia-Table-EY3C2ASB8AUX

Key UserPoolClientId 
Description- 
Value: 6etcoh67bmhbis092npav1airv 

Key ApiBaseUrl 
DescriptionAPI base URL, same origin as the PWA. 
Value: https://d1bgum5obg7azc.cloudfront.net/api 

Key UserPoolId 
Description- 
Valueus-east-1_quQ4fJEIP 

Key WebBucketName 
DescriptionBucket to sync the built PWA into. 
Value: sam-app-leer-en-familia-webbucket-qtqhicyczvds

Key SsmPrefix
DescriptionPath under which the SecureString parameters must be created out of band. 
Value: /nplp/sam-app-leer-en-familia 

Key SiteUrl 
DescriptionPWA entry point. The family surface is /app, the manager surface is /gestor. 
Value: https://d1bgum5obg7azc.cloudfront.net 

cloudfront distribution: E3KLZJIWYZ768G

stack name: sam-app-leer-en-familia


aws logs tail /nplp/sam-app-leer-en-familia/fn-content --since 15m

aws ssm get-parameters-by-path --path "/nplp/sam-app-leer-en-familia" --query 'Parameters[].Name'