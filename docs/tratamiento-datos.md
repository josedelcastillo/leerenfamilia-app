# Tratamiento de datos personales

> ## ⚠ BORRADOR PARA REVISIÓN LEGAL
>
> **No soy abogado y quien encargó esto tampoco.** Este documento lo escribió quien construyó la
> plataforma, describiendo lo que el sistema **hace**, para que un abogado pueda decir si eso cumple.
> No es una evaluación de cumplimiento ni una opinión legal, y no debe presentarse como tal ante la
> Autoridad Nacional de Protección de Datos Personales ni ante la clínica.
>
> Se procesan **datos de menores de edad**. Nada de esto debería llegar a una familia real sin que un
> abogado peruano lo haya revisado.

Marco: **Ley 29733**, Ley de Protección de Datos Personales, y su reglamento.

## Por qué existe este documento

El modelo operativo v1.0 menciona la protección de datos una vez, de pasada, en las responsabilidades
del establecimiento: "respetando políticas institucionales y protección de datos personales". No define
consentimiento, ni plazos, ni qué se guarda, ni cómo se borra.

Ese vacío no se puede arrastrar al código: hay que decidirlo para escribirlo. Lo que sigue es lo que se
decidió, para que se pueda corregir.

## Inventario de datos personales

### Lo que se guarda

| Dato | De quién | Por qué | Dónde |
|---|---|---|---|
| Número de celular (E.164) | Cuidador | Único canal del acompañamiento | `FAMILY#<id> / CAREGIVER#<msisdn>` |
| Rol (principal / secundario) | Cuidador | Distinguir quién registra en la bitácora | Ídem |
| Nombre o alias del bebé | **Menor** | Personalizar los mensajes | `FAMILY#<id> / BABY` |
| Fecha de nacimiento | **Menor** | Edad del bebé; segmentación del análisis | Ídem |
| Clínica de origen | Familia | Análisis del piloto | `FAMILY#<id> / META` |
| Fecha de ingreso al programa | Familia | Ancla del cronograma (D-003) | Ídem |
| Bitácora: fecha, tipo, minutos, quién | Familia | **Indicador primario del piloto** | `FAMILY#<id> / LOG#...` |
| Bitácora: nota de texto libre | Familia | Contexto cualitativo | Ídem — **ver abajo** |
| Feedback y mensajes entrantes | Familia | Canal bidireccional | `FAMILY#<id> / FEEDBACK#...` |
| Accesos a recursos | Familia | Medir uso del contenido | `FAMILY#<id> / ACCESS#...` |
| Estado de envíos y `pricing` | — | Alcance y conciliación de factura | `WAMID#<wamid>` |
| Consentimiento: versión, canal, fecha | Cuidador | Prueba del consentimiento | `FAMILY#<id> / CONSENT#...` |
| `sub` y correo del gestor, acción, familia, fecha | Personal | Registro de accesos | `AUDIT#<yyyy-mm>` |

### Lo que deliberadamente NO se guarda

Esto no es una omisión: es una decisión de diseño y está verificada con un test que falla si alguien
intenta guardarlo.

- **DNI** de cualquiera
- **Dirección**
- **Historia clínica, diagnósticos, medidas antropométricas** — nada del expediente de la clínica
- **Nombre del cuidador** — solo su número
- **Ubicación**
- **Analítica de terceros** — ninguna. No hay Google Analytics, no hay píxeles, no hay SDK externo

El registro por QR ignora cualquier campo adicional que venga en la petición en vez de almacenarlo.

### El dato más sensible: la nota de la bitácora

El texto libre de la bitácora describe la rutina doméstica de una casa con un recién nacido: a qué hora
se duerme, cuándo llora, qué hace la madre a las tres de la mañana. Es más íntimo que el resto del
inventario junto.

Por eso lleva un consentimiento **separado** del consentimiento general:

- La familia decide en el registro, con una casilla aparte, si el equipo puede leer esas notas.
- **Por defecto es no.** La casilla no viene marcada.
- El gestor ve siempre los agregados —cuántas veces, cuántos minutos, qué tipo de actividad— porque la
  adherencia no depende de leer las notas.
- El texto se filtra **en lectura**, nunca se descarta en escritura: la nota es de la familia igual, y
  si más adelante autoriza, su historia sigue completa.
- La interfaz del gestor dice explícitamente cuándo está viendo una familia que no autorizó.
- En el CSV exportado, una columna `nota_autorizada` distingue "no escribió nada" de "no autorizó".

## Base legal

**Consentimiento informado del cuidador**, otorgado en el primer control del niño sano al registrarse
por QR.

Se registra: la versión exacta del texto aceptado, el canal (`qr`), la fecha y hora, y si autorizó
además la lectura de las notas. Sin `accepted: true` el registro se rechaza y **no se escribe nada**:
el consentimiento es una precondición, no un campo del formulario.

### Puntos para el abogado

1. **Datos de menores.** El bebé no puede consentir. Consiente el cuidador. Hay que confirmar qué exige
   la Ley 29733 y su reglamento para el tratamiento de datos de menores, y si el consentimiento del
   cuidador basta o hace falta algo más.
2. **Texto del consentimiento.** El actual (`borrador-0`) lo escribí yo y **no sirve**. Está en
   `web/src/gestor/../app/Registro.tsx`, marcado como borrador en la propia pantalla.
3. **El segundo cuidador no consiente en persona.** El cuidador principal escribe el número del padre o
   de la abuela en el formulario. Esa persona empieza a recibir mensajes sin haber aceptado nada.
   **Es el hueco más claro que le veo a este diseño.** Una salida posible: el primer mensaje a un
   cuidador secundario pide confirmación explícita antes de continuar. No está implementado.
4. **Retención tras el piloto.** El modelo operativo exige seguimiento a los 12 meses. Eso significa
   conservar los contactos un año después de terminado el acompañamiento, y el consentimiento actual no
   dice nada al respecto.
5. **¿Hay que inscribir un banco de datos personales ante la ANPDP?** Ver más abajo.

## Plazos de conservación

| Dato | Plazo | Cómo se aplica |
|---|---|---|
| Registro de accesos del gestor | **12 meses** | TTL de DynamoDB, automático |
| Deduplicación de mensajes de WhatsApp | 7 días | TTL |
| Envíos simulados (modo mock) | 90 días | TTL |
| Datos de la familia, bitácora, feedback | **Sin plazo definido** | ⚠ **Hay que decidirlo** |

**El último renglón es un problema real.** Hoy los datos de una familia se conservan indefinidamente
hasta que alguien pida la supresión. Con el seguimiento a 12 meses de por medio, un plazo razonable
sería "hasta 14 meses después del cierre del piloto, y después se borra o se anonimiza", pero **eso hay
que decidirlo y escribirlo en el consentimiento**, no dejarlo implícito.

## Derechos de los titulares

| Derecho | Estado |
|---|---|
| **Baja** (dejar de recibir mensajes) | ✅ Implementado. `BAJA`, `STOP` o `SALIR` por WhatsApp; el sistema confirma. Una frase que contenga la palabra la atiende un gestor (D-006) |
| **Acceso** | ⚠ Parcial. La familia ve su contenido y sus mensajes en la app, no un volcado completo de sus datos |
| **Rectificación** | ❌ No implementado |
| **Supresión** | ⚠ **Manual.** El modelo de datos lo soporta —todo lo de una familia está en una partición— pero **no hay endpoint** |
| **Oposición** | Equivale a la baja |

### El flujo de supresión

Cuando se implemente, tiene que borrar de la partición `FAMILY#<id>`: metadatos, bebé, cuidadores,
consentimiento, **bitácora completa**, **feedback completo** y accesos. No solo el contacto.

Lo que **no** se borra, y hay que justificar ante el abogado:

- El **registro de accesos** (`AUDIT#`), porque es la prueba de quién vio qué. Contiene el
  identificador de la familia. Vence solo por TTL a los 12 meses.
- Los **estados de envío** (`WAMID#`), que llevan el `pricing` para conciliar la factura. Se puede
  desvincular borrando el ítem que enlaza el `wamid` con la familia, y conservar el resto sin
  identificador.

**Que la supresión sea manual es una obligación legal incumplida, no una funcionalidad pendiente.** Está
en la lista de bloqueantes del runbook.

## Seguridad

| Medida | Estado |
|---|---|
| Cifrado en reposo (DynamoDB, S3) | ✅ Por defecto, clave gestionada por AWS |
| Cifrado en tránsito | ✅ TLS. CloudFront redirige HTTP a HTTPS |
| Credenciales | ✅ SSM `SecureString`, leídas en cold start. Nunca en el repositorio ni en variables de entorno en texto plano |
| Bucket de la PWA | ✅ Privado, sin acceso público, solo CloudFront con OAC |
| MFA de los gestores | ✅ Obligatorio, TOTP |
| Sin credenciales compartidas | ✅ Cada gestor tiene cuenta propia; es lo que hace posible el registro de accesos |
| Permisos de las Lambdas | ✅ Solo su tabla y su prefijo de SSM |
| Autenticación de la familia | ⚠ Token HMAC en el enlace, sin login — **decisión consciente**, ver abajo |
| Firma de webhooks | ✅ HMAC-SHA256 obligatorio, sin bypass |
| Inyección de fórmulas en CSV | ✅ Neutralizada |
| Indexación por buscadores | ✅ Bloqueada por `robots.txt` |

### El trade-off del acceso sin login

La familia no inicia sesión. Quien tenga el enlace de WhatsApp entra. Es deliberado: una madre con un
bebé de semanas, de madrugada, con una mano libre, no pasa por un formulario de contraseña, y la
fricción ahí mata la adopción del piloto.

Las mitigaciones son que el token está firmado y no se puede falsificar ni editar, vence a los 90 días,
identifica a un cuidador concreto, y se quita de la barra de direcciones al primer uso para que no
quede en una captura de pantalla ni en el historial. **El riesgo residual es real**: quien tenga acceso
al WhatsApp de esa persona tiene acceso a los datos de esa familia. Es el mismo riesgo que tiene el
propio canal de WhatsApp por el que llega el programa.

Vale la pena que el abogado lo confirme explícitamente en vez de que quede como un supuesto de quien
programó.

## Ante la Autoridad Nacional de Protección de Datos Personales

**Esta sección es la que menos confianza le tengo. Necesita revisión profesional completa.**

Lo que un abogado tendría que determinar:

1. **¿Hay que inscribir un banco de datos personales?** Aquí hay uno: datos identificables de familias
   y de menores, tratados de forma automatizada, con una finalidad definida.
2. **¿Quién es el titular del banco?** Presumiblemente Leer en Familia, que decide la finalidad y los
   medios. **¿Y la clínica?** Es la que capta a las familias. ¿Es corresponsable, encargada, o ninguna
   de las dos? Debería quedar por escrito en el acuerdo con la clínica **antes** del arranque.
3. **¿Hay flujo transfronterizo?** Sí, y por dos vías: los datos se alojan en **AWS us-east-1**
   (Estados Unidos), y los números de celular y el contenido de los mensajes pasan por **Meta**. Ambos
   son tratamientos fuera del Perú y probablemente requieren declaración y garantías contractuales.
4. **¿Qué medidas de seguridad exige la directiva vigente** para un banco con datos de menores, y las
   de la tabla anterior alcanzan?
5. **¿Qué información obligatoria debe contener el consentimiento** y en qué forma se conserva la
   prueba?

Lo que el sistema ya provee para eso: el inventario de arriba, el registro de accesos exportable
(`auditoria.csv`), la prueba de consentimiento con versión y fecha, y los plazos aplicados por TTL.

Lo que falta: **todo el criterio jurídico.**

## Resumen para quien revise

| # | Qué hay que resolver | Riesgo si no |
|---|---|---|
| 1 | Texto de consentimiento redactado por un abogado | El consentimiento actual probablemente no es válido |
| 2 | Consentimiento del cuidador secundario | Se le envían mensajes a alguien que no aceptó nada |
| 3 | Endpoint de supresión | Derecho legal que hoy no se puede ejercer sin intervención manual |
| 4 | Plazo de conservación de los datos de familia | Se conservan indefinidamente, sin base |
| 5 | Inscripción del banco de datos ante la ANPDP | Posible incumplimiento formal |
| 6 | Rol de la clínica: titular, corresponsable o encargada | Responsabilidades sin definir ante un incidente |
| 7 | Declaración del flujo transfronterizo (AWS y Meta) | Ídem |
| 8 | Confirmar el acceso sin login como aceptable | Riesgo residual asumido sin validar |
