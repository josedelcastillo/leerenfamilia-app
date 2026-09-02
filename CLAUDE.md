# CLAUDE.md

Guía para trabajar en este repositorio. Léala antes de tocar código.

## Qué es esto

Plataforma para el piloto clínico de 12 semanas de **Nacidos para Leer Perú**, iniciativa de la ONG
Leer en Familia. Acompaña 8 semanas a familias con recién nacidos por WhatsApp y por una PWA que
funciona sin conexión.

**Escala real: 50 familias, ~100 celulares, 5 gestores.** No es un número provisional. Cualquier
decisión que agregue complejidad "por si escalamos" es una decisión equivocada en esta fase.

**Objetivo de infraestructura: US$0/mes.** La factura real es de centavos; ver `docs/costos.md`.

## Antes de cambiar nada, lea esto

| Documento | Cuándo |
|---|---|
| [`docs/decisiones.md`](docs/decisiones.md) | **Siempre.** Cada decisión de diseño y su motivo. Si algo parece raro, la explicación está ahí |
| [`docs/arquitectura.md`](docs/arquitectura.md) | Antes de tocar infraestructura o el modelo de datos |
| [`docs/diagramas.md`](docs/diagramas.md) | Para ver la forma del sistema y de los procesos en Mermaid: infraestructura, capas, despliegue, envío semanal, webhook, cola offline |
| [`docs/00-entendimiento.md`](docs/00-entendimiento.md) | Los 14 vacíos y contradicciones de los documentos fuente. Varios siguen abiertos |
| [`docs/indicadores.md`](docs/indicadores.md) | Antes de tocar `domain/indicators.ts` o la exportación |
| [`docs/tratamiento-datos.md`](docs/tratamiento-datos.md) | Antes de tocar cualquier cosa que guarde datos de una familia |
| [`docs/runbook.md`](docs/runbook.md) | Para desplegar, operar o diagnosticar |
| [`docs/costos.md`](docs/costos.md) | Antes de agregar cualquier recurso de AWS |
| `filesMD/` | Fuente de verdad del modelo operativo. **No tocar** |
| `ArchivosOriginales/` | Documentos originales. **No tocar** |

## Idioma

- **Interfaz, contenido y documentación: español (Perú).**
- **Código, comentarios y mensajes de commit: inglés.**

## Comandos

```bash
# Backend: sin red, sin credenciales AWS
cd backend && npm install && npm test && npm run typecheck
cd backend && npm run test:coverage

# PWA
cd web && npm install && npm test && npm run build

# Infraestructura
sam validate --template infra/template.yaml --lint
sam build --template infra/template.yaml
node scripts/verificar-build.mjs    # antes de cualquier deploy

# Desplegar: SIEMPRE con el template construido, nunca con el fuente
sam deploy --template-file .aws-sam/build/template.yaml

# Instalabilidad y funcionamiento offline, contra un build servido
cd web && npx vite preview --port 4173 &
CHROMIUM_PATH=/ruta/a/chromium node web/scripts/check-installable.mjs http://localhost:4173/app

# Regenerar los CSV de ejemplo (sin AWS, semilla fija)
cd backend && node scripts/generar-ejemplos.ts
```

Node **≥ 22.18**: ejecuta TypeScript de forma nativa, así que `node --test` corre los tests sobre el
fuente. **No agregue jest ni vitest.**

## Estructura

```
infra/template.yaml   toda la infraestructura, AWS SAM, un solo archivo
backend/src/
  handlers/           una carpeta por Lambda. Solo entrada y salida HTTP
  domain/             lógica pura. Sin AWS SDK, sin red, sin reloj
  adapters/           DynamoDB, SSM, WhatsApp, Cognito
  content/            8 semanas de contenido PLACEHOLDER
  shared/             CSV, firma HMAC, tokens, fechas
web/src/
  app/                superficie de la familia
  gestor/             superficie del gestor — chunk separado
  shared/             cola de sincronización, cliente de API
docs/ejemplos/        CSV de ejemplo generados con datos sintéticos
```

## Reglas que no se rompen en silencio

Si necesita romper alguna, dígalo explícitamente y agregue una entrada a `docs/decisiones.md`.

1. **`domain/` no importa AWS, no lee el reloj, no lee el entorno, no hace I/O.** Hay un test
   (`test/domain/purity.test.ts`) que falla si alguien lo intenta. Es la capa de la que dependen los
   indicadores del piloto.
2. **Siete Lambdas.** No agregue una octava sin discutirlo (D-004).
3. **Cero secretos en el repositorio.** Van en SSM `SecureString`. Verifique `git diff --cached` antes
   de cada commit.
4. **La firma del webhook de Meta no tiene bypass**, ni siquiera en modo mock (D-007). Se calcula sobre
   los **bytes crudos** del cuerpo.
5. **El envío semanal reclama antes de enviar** (D-008). Invertir ese orden puede cobrar dos veces. Un
   envío en estado `pendiente` no se reintenta nunca automáticamente.
6. **La semana del programa se ancla a la fecha de ingreso, y la fecha resuelta se guarda por familia**
   (D-003). Nunca recalcule desde la política vigente: movería los indicadores de cohortes cerradas.
7. **Las fechas del cronograma son días calendario en `America/Lima`**, no instantes UTC. La conversión
   ocurre en el borde (`shared/lima-date.ts`); de `domain/` para adentro no hay zona horaria.
8. **El texto libre de las notas se filtra en lectura, nunca se descarta en escritura.** Solo lo ve el
   gestor si la familia lo autorizó en el consentimiento.
9. **El bundle del gestor no llega al dispositivo de una familia.** `shared/` no puede importar de
   `app/` ni de `gestor/`.
10. **No invente contenido del programa.** Ni canciones, ni textos de libros, ni actividades: hay
    derechos de autor y lo define la ONG. Todo lo que hay es placeholder y está marcado como tal.
11. **No agregue analítica de terceros.** Si hay que medir, endpoint propio contra DynamoDB.
12. **Antes de agregar una dependencia, justifíquela en una línea** en el commit. Hoy el backend tiene
    tres (SDK de AWS y esbuild) y la web cuatro.

## Estado

Fases 0 a 8 completas. Lo que falta antes de que esto llegue a una familia real está en la última
sección del [runbook](docs/runbook.md); lo más importante:

- **`sam deploy` nunca se ejecutó** — el entorno de desarrollo no tenía credenciales AWS
- Contenido, íconos y texto de consentimiento son **placeholder**
- El **endpoint de supresión de datos no existe**; hoy es manual, y es una obligación legal
- No hay WABA: todo el flujo funciona y se demuestra con `WA_PROVIDER=mock`

## Cómo trabajar acá

- Si algo de los documentos fuente es ambiguo, **pregunte**. No rellene el vacío con una suposición.
  Varios de los 14 hallazgos de la fase 0 siguen abiertos y esperando decisión de la ONG.
- Si una restricción le parece incorrecta, dígalo primero y explique el trade-off. No la implemente a
  medias ni la ignore en silencio.
- Commits pequeños, mensaje convencional, en inglés.
