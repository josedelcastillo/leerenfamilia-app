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
| 2 | Dominio y tests: cronograma, elegibilidad, ventana de servicio, opt-in, feedback | ⏳ |
| 3 | Proveedor de WhatsApp con mock, webhook con HMAC, idempotencia | ⏳ |
| 4 | Scheduler semanal y envío end-to-end en modo mock | ⏳ |
| 5 | PWA familia: contenido, bitácora, feedback, offline, cola de sincronización | ⏳ |
| 6 | PWA gestor: Cognito, familias, bandeja unificada, respuesta, auditoría | ⏳ |
| 7 | Exportación CSV de métricas del piloto | ⏳ |
| 8 | `costos.md`, `runbook.md`, `tratamiento-datos.md` | ⏳ |

## Estructura

```
ArchivosOriginales/   documentos fuente originales (no tocar)
filesMD/              fuente de verdad derivada (no tocar)
docs/                 entendimiento, decisiones, arquitectura, costos, runbook, datos
infra/template.yaml   toda la infraestructura, AWS SAM
backend/src/
  handlers/           una carpeta por Lambda
  domain/             lógica pura, sin AWS SDK — la capa con cobertura seria
  adapters/           DynamoDB, SSM, WhatsApp, Cognito
  shared/
web/src/
  app/                superficie de la familia
  gestor/             superficie del gestor (chunk separado)
  shared/
```

Empiece por [`docs/00-entendimiento.md`](docs/00-entendimiento.md) y
[`docs/decisiones.md`](docs/decisiones.md); las decisiones de diseño y sus motivos están ahí, no en los
commits.

## Requisitos

- Node.js **≥ 22.18** (el runner de tests ejecuta TypeScript de forma nativa; no hay jest ni vitest)
- AWS SAM CLI
- Una cuenta AWS con credenciales configuradas, para desplegar

## Desarrollo

```bash
# Backend: tests y verificación de tipos. No necesitan red ni credenciales AWS.
cd backend && npm install && npm test && npm run typecheck

# PWA
cd web && npm install && npm run build     # o npm run dev

# Infraestructura
sam validate --template infra/template.yaml --lint
sam build --template infra/template.yaml
```

## Despliegue

```bash
sam build --template infra/template.yaml
sam deploy --guided                        # región us-east-1
```

Después del primer despliegue, cree los parámetros `SecureString` bajo el prefijo que devuelve el output
`SsmPrefix`. CloudFormation no puede crearlos, y **ningún secreto entra al repositorio**:

```bash
aws ssm put-parameter --type SecureString --name /nplp/<stack>/WA_ACCESS_TOKEN --value '...'
# ídem WA_PHONE_NUMBER_ID, WA_APP_SECRET, WA_VERIFY_TOKEN, APP_TOKEN_SECRET
```

El piloto se puede desarrollar y demostrar entero con `WaProvider=mock`, sin WABA y sin gastar nada: el
proveedor mock escribe el payload a CloudWatch y a la tabla de auditoría en vez de llamar a Meta.

## Protección de datos

Se procesan datos de menores de edad bajo la Ley 29733. El inventario de datos, la base legal, los plazos de
conservación y el flujo de supresión van en `docs/tratamiento-datos.md` (fase 8), marcado como borrador para
revisión legal.
