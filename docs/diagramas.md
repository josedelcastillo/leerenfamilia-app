# Diagramas

Vista visual de lo que `arquitectura.md` describe en prosa. Si algo acá contradice a
[`arquitectura.md`](arquitectura.md) o a [`decisiones.md`](decisiones.md), esos dos mandan: estos
diagramas son un resumen, no la fuente de verdad.

Se renderizan solos en GitHub y en cualquier visor con Mermaid.

---

## 1. Infraestructura

Un stack, siete Lambdas, una tabla, un bucket, una distribución, un user pool.

```mermaid
flowchart LR
    subgraph fuera["Fuera de AWS"]
        fam["Familia<br/>celular · sin login"]
        ges["Gestor<br/>5 personas"]
        meta["Meta Cloud API<br/>WhatsApp Business"]
    end

    subgraph aws["AWS · us-east-1 · stack único de SAM"]
        cf["CloudFront<br/>una distribución"]
        spa["CloudFront Function<br/>reescritura SPA<br/>solo en el origen S3"]
        s3[("S3<br/>bucket privado · OAC · SSE-S3")]
        api["HTTP API<br/>API Gateway v2"]
        cog["Cognito User Pool<br/>tier Lite · grupo gestores"]

        subgraph fns["Siete Lambdas · arm64 · Node 22 · ESM"]
            direction TB
            reg["fn-register"]
            con["fn-content"]
            tra["fn-tracking"]
            fee["fn-feedback"]
            adm["fn-admin"]
            wee["fn-weekly-send"]
            wah["fn-wa-webhook"]
        end

        ddb[("DynamoDB · tabla única<br/>PK/SK · un GSI · PAY_PER_REQUEST<br/>DeletionPolicy Retain")]
        ssm["SSM Parameter Store<br/>SecureString bajo /nplp/stack/"]
        sch["EventBridge Scheduler<br/>lunes 09:00 America/Lima"]
    end

    fam -->|"QR de la clínica<br/>enlace con token HMAC"| cf
    ges -->|"/gestor"| cf
    cf --> spa --> s3
    cf -->|"/api/* · mismo origen<br/>sin preflight CORS"| api

    api --> reg
    api --> con
    api --> tra
    api --> fee
    api -->|"autorizador JWT"| adm
    api --> wah

    cog -.->|"ID token"| adm
    sch --> wee
    meta -->|"webhook · HMAC sobre bytes crudos"| wah
    wee -->|"plantilla semanal"| meta
    adm -->|"respuesta del gestor"| meta
    meta -.->|"mensaje"| fam

    fns --> ddb
    fns -.->|"cold start · caché 15 min"| ssm

    classDef ext fill:#f5f5f5,stroke:#999,color:#333
    class fam,ges,meta ext
```

**Por qué la API va detrás de CloudFront y no en su propio dominio:** mismo origen para la PWA y para
`/api/*`, así el navegador nunca hace preflight CORS. Una ida y vuelta menos en cada escritura, que es
justo lo que importa con la conectividad de las familias del piloto.

### Rutas y cómo se autentica cada una

| Función | Ruta | Autenticación |
|---|---|---|
| `fn-register` | `POST /api/registro` | ninguna — es el flujo del QR |
| `fn-content` | `GET /api/contenido` | token HMAC de familia |
| `fn-tracking` | `GET·POST /api/seguimiento` | token HMAC de familia |
| `fn-feedback` | `GET·POST /api/feedback` | token HMAC de familia |
| `fn-admin` | `ANY /api/gestor/{proxy+}` | JWT de Cognito **+ chequeo del grupo en código** |
| `fn-wa-webhook` | `GET·POST /api/whatsapp/webhook` | firma HMAC de Meta, sin bypass |
| `fn-weekly-send` | — | EventBridge Scheduler |

---

## 2. Capas del backend

La flecha que importa es la que **no** existe: `domain/` no importa hacia afuera. Un test de
arquitectura lo verifica en cada corrida.

```mermaid
flowchart TD
    h["handlers/<br/>entrada y salida HTTP<br/>convierte 'ahora' a fecha de Lima"]
    d["domain/<br/>lógica pura<br/>sin AWS SDK · sin red · sin reloj · sin entorno"]
    a["adapters/<br/>DynamoDB · SSM · WhatsApp · Cognito"]
    t["test/domain/purity.test.ts<br/>falla el build si alguien rompe la regla"]

    h -->|"importa"| d
    h -->|"importa"| a
    a -->|"importa"| d
    d -.->|"NUNCA importa hacia arriba"| h
    t -.->|"vigila"| d

    linkStyle 3 stroke:#c00,stroke-dasharray:5 5
```

De `domain/` para adentro no hay zona horaria: la semana del programa se cuenta en **días calendario**
de `America/Lima`, y la conversión ocurre en el borde.

---

## 3. Proceso de despliegue

Los tres pasos se corren desde la raíz del repositorio. Las dos banderas del `deploy` no son
opcionales: cada una evita, por separado, un despliegue que reporta éxito y deja el sistema muerto.

```mermaid
flowchart TD
    ini(["Cambio listo · raíz del repo"]) --> b["sam build --template infra/template.yaml"]
    b --> art["Genera .aws-sam/build/<br/>siete artefactos, index.mjs en cada raíz"]
    art --> v{"node scripts/verificar-build.mjs"}

    v -->|"exit distinto de 0"| no(["NO desplegar<br/>falta index.mjs, o un CodeUri<br/>sigue apuntando al fuente"])
    v -->|"exit 0"| dep["sam deploy<br/>--template-file .aws-sam/build/template.yaml<br/>--config-file PWD/infra/samconfig.toml"]

    dep --> chg{"Confirmar changeset"}
    chg -->|"sí"| ok(["Stack actualizado"])
    ok --> ssmp["Solo la primera vez:<br/>crear los SecureString bajo SsmPrefix<br/>CloudFormation no puede crearlos"]
    ok --> web["Publicar la PWA:<br/>construir config.json desde los outputs,<br/>aws s3 sync, invalidar CloudFront"]

    subgraph trampas["Las dos trampas · ambas fallan en silencio o tarde"]
        direction TB
        t1["Omitir --template-file<br/>→ sube backend/ crudo, sin index.mjs<br/>→ CloudFormation dice ÉXITO<br/>→ las 7 Lambdas mueren al arrancar<br/>Runtime.ImportModuleError"]
        t2["--config-file relativo<br/>→ SAM lo resuelve desde el directorio DEL TEMPLATE<br/>→ busca en .aws-sam/build/infra/<br/>→ 'Config file does not exist'"]
    end

    dep -.->|"si se omite"| t1
    dep -.->|"si es relativo"| t2

    classDef malo fill:#fff0f0,stroke:#c00,color:#600
    class no,t1,t2 malo
```

**Cómo reconocer la primera trampa sin leer logs:** el artefacto correcto pesa decenas de KB por
función. Si la Lambda desplegada pesa megabytes, se subió el fuente.

```bash
aws lambda get-function --function-name <stack>-ContentFunction-XXXX --query 'Configuration.CodeSize'
```

Ya ocurrió tres veces. Ver [D-018](decisiones.md) y la sección de despliegue del
[README](../README.md).

---

## 4. Proceso del envío semanal

El orden de las dos primeras operaciones es la garantía de que nadie paga dos veces.

```mermaid
sequenceDiagram
    autonumber
    participant S as EventBridge Scheduler
    participant W as fn-weekly-send
    participant D as DynamoDB
    participant M as Meta o mock
    participant F as Familia

    S->>W: lunes 09:00 America/Lima
    W->>D: Query de familias activas por GSI1

    loop por cada familia
        W->>W: semana del programa desde anchor_date guardada
        W->>W: elegibilidad · domain/eligibility.ts

        alt no elegible
            W-->>W: se salta, con motivo registrado
        else elegible
            W->>D: escritura condicional del registro DELIVERY de la semana ISO
            Note over W,D: RECLAMAR ANTES DE ENVIAR · D-008<br/>si el registro ya existe, no se envía
            W->>W: firma un token HMAC de 90 días por cuidador
            W->>M: plantilla con el enlace
            M-->>F: mensaje de WhatsApp
            W->>D: guarda el WAMID con familia y semana
            Note over W,D: permite reconciliar la factura de Meta<br/>contra una familia y una semana
        end
    end
```

Un envío que queda en estado `pendiente` **no se reintenta nunca de forma automática**.

---

## 5. Proceso de un mensaje entrante de WhatsApp

```mermaid
flowchart TD
    inb(["Meta entrega un evento"]) --> sig{"Firma HMAC-SHA256<br/>sobre los bytes crudos"}
    sig -->|"no valida"| f403(["403 · sin bypass, ni en modo mock"])
    sig -->|"valida"| ded{"Reclamación condicional<br/>del message id"}
    ded -->|"ya visto"| dup(["Se ignora · duplicado de Meta"])
    ded -->|"nuevo"| res["Resuelve teléfono a familia y cuidador<br/>por el GSI, no por Scan"]
    res --> vs["Actualiza lastInboundAt<br/>abre la ventana de servicio de 24 h"]
    vs --> tipo{"Tipo de evento"}

    tipo -->|"texto BAJA / STOP / SALIR"| baja["Opt-out + confirmación por mensaje libre"]
    tipo -->|"otro texto"| cons["Se archiva como consulta abierta<br/>en la misma bandeja que la PWA"]
    tipo -->|"status"| pre["Guarda el objeto pricing verbatim<br/>en la misma partición del WAMID"]

    baja --> fin(["Un evento que falla<br/>no detiene el resto del lote"])
    cons --> fin
    pre --> fin

    classDef malo fill:#fff0f0,stroke:#c00,color:#600
    class f403 malo
```

---

## 6. Proceso de escritura sin conexión

La bitácora y el feedback se escriben primero en el celular, no en AWS. Estas familias van a estar sin
señal buena parte del tiempo.

```mermaid
sequenceDiagram
    autonumber
    participant U as Cuidador
    participant P as PWA
    participant Q as IndexedDB · cola
    participant A as fn-tracking
    participant D as DynamoDB

    U->>P: registra una actividad de la bitácora
    P->>Q: guarda con un clientId propio
    P-->>U: se ve de inmediato, marcada como pendiente

    Note over P,Q: el disparador principal de la sincronización<br/>es visibilitychange, no un temporizador

    P->>A: POST del lote cuando hay conexión
    A->>D: escribe con clave LOG por timestamp y clientId
    Note over A,D: el clientId es parte de la clave de ordenamiento:<br/>reenviar la cola sobrescribe, no duplica
    A-->>P: responde ITEM POR ITEM
    Note over P,A: un registro malformado no puede dejar<br/>varada una semana entera de bitácora
    P->>Q: saca de la cola exactamente lo aceptado
    P-->>U: pasa de pendiente a guardada
```

El historial que ve la familia mezcla lo del servidor con lo que sigue en la cola, unido por `clientId`
(D-015): nunca aparece duplicado.

---

## 7. Ciclo de vida de una familia

```mermaid
stateDiagram-v2
    [*] --> Inscrita: QR en la clínica · fn-register
    Inscrita --> Activa: consentimiento firmado<br/>anchor_date resuelta y GUARDADA

    note right of Activa
        La fecha de ancla se guarda por familia.
        Nunca se recalcula desde la política vigente:
        movería los indicadores de cohortes ya cerradas. D-003
    end note

    Activa --> Activa: envío semanal · semanas 1 a 8
    Activa --> DeBaja: BAJA / STOP / SALIR
    DeBaja --> Activa: vuelve a dar consentimiento
    Activa --> Egresada: semana 8 completada
    Egresada --> [*]
    DeBaja --> [*]

    note left of DeBaja
        El texto libre de las notas se guarda siempre,
        pero el gestor solo lo ve si la familia
        lo autorizó en el consentimiento
    end note
```
