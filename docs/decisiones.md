# Registro de decisiones

Bitácora de decisiones que resuelven los vacíos de `docs/00-entendimiento.md`.
Una entrada por decisión, con su consecuencia técnica. No se editan: se supersede con una entrada nueva.

---

## D-001 — El cronograma se ancla a la fecha de nacimiento (paramétrico)

**Fecha:** 2026-08-31 · **Estado:** vigente · **Resuelve:** contradicción 1 de `00-entendimiento.md`

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
