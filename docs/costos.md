# Costos

Precios de **us-east-1**, verificados en septiembre de 2026 contra documentación pública. Cada cifra
lleva su fuente al final. La volumetría está explícita para que pueda auditar la cuenta, no solo el
resultado.

## Antes que nada: el free tier de AWS cambió, y su encargo asume el modelo viejo

El encargo pide separar "qué cae en free tier perpetuo, qué en free tier de 12 meses, y qué se empieza
a cobrar cuando el free tier de 12 meses expire".

**El free tier de 12 meses ya no existe para cuentas nuevas.** El 15 de julio de 2025 AWS lo reemplazó
por un modelo de créditos: una cuenta nueva recibe US$100 en créditos (ampliables a US$200 completando
actividades de onboarding) y un plan gratuito que vence a los 6 meses o cuando se agotan los créditos,
lo que ocurra primero. **Las cuentas creadas antes del 15 de julio de 2025 conservan el modelo de 12
meses.**

Hay que saber en cuál de los dos está la cuenta de Leer en Familia antes de leer la tabla siguiente.

**Y sin embargo, para este piloto, da lo mismo.** La razón es que casi todo lo que usa esta plataforma
cae en free tiers **perpetuos**, que nunca dependieron del plazo de 12 meses: Lambda, CloudFront,
CloudWatch Logs, el almacenamiento de DynamoDB y Cognito. Lo que sí dependía del plazo —API Gateway y
S3— cuesta **céntimos** a este volumen. La conclusión no cambia bajo ningún régimen.

## Volumetría supuesta

50 familias, ~100 celulares, 5 gestores, 12 semanas. Estos son los números de los que sale todo lo
demás; si alguno le parece mal, la cuenta cambia proporcionalmente.

| Concepto | Por mes |
|---|---|
| Invocaciones de Lambda (todas las funciones) | ~8 700 |
| Peticiones al HTTP API | ~8 700 |
| Escrituras a DynamoDB (WRU) | ~5 200 |
| Lecturas de DynamoDB (RRU) | ~30 000 |
| Tamaño de la tabla al final del piloto | ~10 MB |
| Mensajes de WhatsApp enviados | ~450 |
| Ingestión a CloudWatch Logs | ~10 MB |
| Transferencia de CloudFront | < 1 GB |
| Usuarios activos de Cognito | 5 |

Desglose de las invocaciones: `fn-admin` ~5 500 (5 gestores usándolo a diario), `fn-wa-webhook`
~2 000 (cada mensaje enviado genera hasta 3 webhooks de estado), `fn-tracking` ~600,
`fn-content` ~400, `fn-feedback` ~100, `fn-register` ~50 una sola vez, `fn-weekly-send` ~4.

## Mes a mes

| Servicio | Uso | Free tier | ¿Vence? | Costo |
|---|---|---|---|---|
| **Lambda** — invocaciones | 8 700 | 1 000 000/mes | **No, perpetuo** | US$0 |
| **Lambda** — cómputo | ~870 GB-s | 400 000 GB-s/mes | **No, perpetuo** | US$0 |
| **DynamoDB** — escrituras | 5 200 WRU | — (on-demand no tiene) | — | **US$0.007** |
| **DynamoDB** — lecturas | 30 000 RRU | — | — | **US$0.008** |
| **DynamoDB** — almacenamiento | 10 MB | 25 GB | **No, perpetuo** | US$0 |
| **API Gateway** HTTP API | 8 700 peticiones | 1 M/mes (modelo viejo) | **Sí** | **US$0.009** |
| **CloudFront** — transferencia | < 1 GB | 1 TB/mes | **No, perpetuo** | US$0 |
| **CloudFront** — peticiones | ~20 000 | 10 M/mes | **No, perpetuo** | US$0 |
| **CloudFront Functions** | ~20 000 | 2 M/mes | **No, perpetuo** | US$0 |
| **S3** — almacenamiento | ~2 MB | 5 GB (modelo viejo) | **Sí** | **US$0.00005** |
| **CloudWatch Logs** — ingestión | ~10 MB | 5 GB/mes | **No, perpetuo** | US$0 |
| **Cognito** — user pool Lite | 5 MAU | 10 000 MAU/mes | **No, perpetuo** | US$0 |
| **SSM Parameter Store** Standard | 5 parámetros | Sin costo | — | US$0 |
| **EventBridge Scheduler** | ~4 invocaciones | 14 M/mes | **No, perpetuo** | US$0 |
| **ACM** (certificado de CloudFront) | 1 | Sin costo para CloudFront | — | US$0 |
| | | | **Total AWS** | **≈ US$0.03/mes** |

### Cuando venza lo que vence

Solo dos líneas dependen del free tier con plazo, y las dos son céntimos:

| Servicio | Costo una vez fuera del free tier |
|---|---|
| API Gateway HTTP API | US$0.009/mes |
| S3 | menos de US$0.001/mes |

**El objetivo de US$0/mes se cumple en la práctica**, con la precisión de que DynamoDB on-demand cobra
desde la primera operación: no hay free tier de operaciones en modo on-demand, solo de almacenamiento.
La factura real va a ser de **dos o tres centavos de dólar al mes**, no de cero exacto. Prefiero decirlo
así antes que redondear a cero y que aparezca una línea inesperada en la factura.

## Lo que NO está en la cuenta, y es lo que de verdad cuesta

| Concepto | Costo | Nota |
|---|---|---|
| **WhatsApp (Meta)** | **US$10–35/mes** | ~450 mensajes. Es el 99% del costo del piloto |
| Dominio propio | según registrador | Fuera de AWS. Se evita la hosted zone de Route 53 apuntando un CNAME |

Si el piloto se pasa de presupuesto, va a ser por Meta, no por AWS. Por eso el objeto `pricing` de los
webhooks se guarda verbatim: es la única forma de ver si la plantilla está cayendo como `utility` o
como `marketing`, que es la diferencia de precio, y de conciliar contra la factura. El CSV `envios.csv`
lleva esa columna.

## Lo que se evitó deliberadamente

Cada línea de esta tabla habría destruido el objetivo por sí sola:

| Recurso | Costo mensual | Por qué no está |
|---|---|---|
| NAT Gateway | ~US$32 | Las Lambdas no van en VPC. No lo necesitan |
| VPC endpoint (por cada uno) | ~US$7 | Ídem |
| ALB / NLB | ~US$16 | CloudFront + HTTP API cubren el caso |
| API Gateway REST (en vez de HTTP API) | 3.5× más por petición | HTTP API es la variante barata |
| Secrets Manager | US$0.40/secreto/mes = US$2 | SSM Parameter Store Standard con `SecureString` es gratis |
| RDS / Aurora (la más chica) | ~US$13+ | DynamoDB on-demand |
| Route 53 hosted zone | US$0.50 | Sin dominio propio; CNAME desde el registrador existente |
| Clave KMS gestionada por el cliente | US$1 | DynamoDB y S3 cifran en reposo con clave de AWS, sin costo |
| Fargate / ECS / EKS | ~US$10+ | Lambda con zip |

Total evitado: **más de US$70/mes**, contra una factura real de tres centavos.

## Una corrección a mi propia decisión: encienda PITR

En la fase 1 dejé `EnablePointInTimeRecovery` en `false` para sostener el objetivo de US$0. **Al hacer
la cuenta con números reales, esa decisión no se sostiene.**

PITR cuesta US$0.20 por GB-mes sobre el tamaño de la tabla. Con ~10 MB al final del piloto, eso son
**US$0.002 al mes** — dos milésimas de dólar. A cambio da restauración a cualquier segundo de los
últimos 35 días.

La tabla guarda la única copia de los datos del piloto, incluidos datos de menores, y una escritura mal
hecha en la vista del gestor o un script de mantenimiento equivocado no tienen hoy vuelta atrás.
**Recomiendo desplegar con `EnablePointInTimeRecovery=true`.** Dejé el parámetro en `false` por defecto
para no cambiar el comportamiento sin que usted lo decida, pero la relación costo/beneficio es absurda a
favor de encenderlo.

## Qué vigilar

Tres cosas pueden mover esta factura de céntimos a algo notable:

1. **Ingestión a CloudWatch Logs.** El free tier son 5 GB/mes; a este volumen se usan 10 MB. Si alguien
   agrega logging por petición con cuerpos completos, 5 GB se alcanzan rápido y después son US$0.50/GB.
   La retención de 14 días limita el almacenamiento, no la ingestión.
2. **Un `Scan` en el camino caliente.** La exportación usa uno a propósito (D-014) y corre pocas veces.
   Un `Scan` por carga de pantalla sería otra historia.
3. **Que el piloto crezca sin revisar esto.** Todo lo anterior escala linealmente y con mucho margen,
   pero "sin revisar" es cómo aparecen las facturas sorpresa.

Una alarma de facturación en US$5 cuesta nada y avisa antes de que cualquiera de las tres importe.

## Fuentes

Precios consultados en septiembre de 2026. Los precios de AWS cambian; verifique antes de comprometerse
con un presupuesto.

- Lambda: US$0.20 por millón de peticiones; arm64 US$0.0000133334 por GB-segundo; free tier de 1 M de
  peticiones y 400 000 GB-s mensuales que **no vence**.
- DynamoDB on-demand tras la rebaja del 1 de noviembre de 2024: US$1.25 por millón de WRU, US$0.25 por
  millón de RRU con lectura consistente; almacenamiento US$0.25 por GB-mes; free tier de 25 GB.
- API Gateway HTTP API: US$1.00 por millón de peticiones.
- CloudFront: 1 TB de transferencia, 10 M de peticiones y 2 M de invocaciones de CloudFront Functions
  al mes, **siempre gratis**.
- CloudWatch Logs: US$0.50 por GB de ingestión, primeros 5 GB al mes sin costo.
- Cognito: tier Lite desde US$0.0055/MAU con free tier perpetuo de 10 000 MAU; MFA TOTP incluido. Ver
  `decisiones.md` D-005.
- Cambio del free tier de AWS del 15 de julio de 2025: modelo de créditos de US$100–200 y plan gratuito
  de 6 meses para cuentas nuevas.
