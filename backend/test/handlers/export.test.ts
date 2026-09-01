import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, isoDate } from '../../src/domain/dates.ts';
import { createFeedback, type Feedback } from '../../src/domain/feedback.ts';
import type { LogEntry } from '../../src/domain/log-entry.ts';
import type { FamilyIndicatorInput } from '../../src/domain/indicators.ts';
import { BOM } from '../../src/shared/csv.ts';
import { DATASETS, buildCsv, isDataset, type ExportBundle } from '../../src/handlers/admin/export.ts';

const ANCHOR = isoDate('2026-09-01');
const CUTOFF = isoDate('2026-10-27');

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    clientId: 'c1', date: addDays(ANCHOR, 2), kind: 'lectura', minutes: 10,
    resourceId: 's01-lectura', note: null, loggedBy: 'principal', ...overrides,
  };
}

function family(overrides: Partial<FamilyIndicatorInput> = {}): FamilyIndicatorInput {
  return {
    familyId: 'fam-1', clinic: 'CLINICA-DEMO', status: 'activa', anchorDate: ANCHOR,
    enrolledAt: '2026-09-01T10:00:00.000Z',
    caregivers: [{ role: 'principal', optIn: true, optOutAt: null, lastInboundAt: null }],
    logEntries: [], deliveries: [], feedback: [], ...overrides,
  };
}

function bundle(overrides: Partial<ExportBundle> = {}): ExportBundle {
  const families = overrides.families ?? [family()];
  return {
    cutoff: CUTOFF,
    programWeeks: 8,
    families,
    logEntriesByFamily: new Map(families.map((f) => [f.familyId, f.logEntries])),
    feedbackByFamily: new Map(families.map((f) => [f.familyId, f.feedback])),
    audit: [],
    notesAuthorized: new Map(families.map((f) => [f.familyId, false])),
    ...overrides,
  };
}

function parse(csv: string): string[][] {
  return csv.replace(BOM, '').trimEnd().split('\r\n').map((line) => {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (quoted) {
        if (char === '"' && line[i + 1] === '"') { current += '"'; i += 1; }
        else if (char === '"') quoted = false;
        else current += char;
      } else if (char === '"') quoted = true;
      else if (char === ',') { cells.push(current); current = ''; }
      else current += char;
    }
    cells.push(current);
    return cells;
  });
}

describe('datasets', () => {
  test('cada dataset produce un CSV con encabezado', () => {
    for (const dataset of DATASETS) {
      const csv = buildCsv(dataset, bundle());
      assert.equal(csv.startsWith(BOM), true, `${dataset} sin BOM`);
      assert.ok(parse(csv)[0]!.length > 1, `${dataset} sin columnas`);
    }
  });

  test('isDataset rechaza lo que no conoce', () => {
    assert.equal(isDataset('familias'), true);
    assert.equal(isDataset('../../etc/passwd'), false);
    assert.equal(isDataset(''), false);
  });
});

describe('seudonimización', () => {
  test('ningún archivo lleva teléfonos ni el nombre del bebé', () => {
    // The CSV leaves the platform and ends up on somebody's laptop.
    const withEverything = bundle({
      families: [family({
        logEntries: [entry({ note: 'nota' })],
        feedback: [createFeedback({ id: 'f1', type: 'consulta', channel: 'whatsapp', text: 'hola', createdAt: '2026-09-05T10:00:00.000Z' })],
      })],
      audit: [{ at: '2026-09-05T11:00:00.000Z', gestorSub: 'g1', gestorEmail: 'g@leerenfamilia.pe', action: 'ver_detalle_familia', familyId: 'fam-1' }],
    });

    for (const dataset of DATASETS) {
      const csv = buildCsv(dataset, withEverything);
      assert.equal(/\+51\d{9}/.test(csv), false, `${dataset} filtra un teléfono`);
      assert.equal(csv.includes('Mateo'), false, `${dataset} filtra un nombre`);
    }
  });
});

describe('bitácora', () => {
  test('una fila por entrada, con la semana del programa calculada', () => {
    const csv = buildCsv('bitacora', bundle({
      families: [family({ logEntries: [entry({ date: ANCHOR }), entry({ clientId: 'c2', date: addDays(ANCHOR, 14) })] })],
    }));
    const rows = parse(csv);
    assert.equal(rows.length, 3);
    assert.equal(rows[1]![rows[0]!.indexOf('semana_programa')], '1');
    assert.equal(rows[2]![rows[0]!.indexOf('semana_programa')], '3');
  });

  test('oculta el texto de la nota si la familia no lo autorizó, y lo dice', () => {
    // An empty cell alone could mean "no note" or "withheld"; the flag distinguishes them.
    const withNote = family({ logEntries: [entry({ note: 'se durmió a las 3' })] });
    const denied = buildCsv('bitacora', bundle({ families: [withNote] }));
    const rows = parse(denied);
    const header = rows[0]!;

    assert.equal(denied.includes('se durmió'), false);
    assert.equal(rows[1]![header.indexOf('tiene_nota')], '1');
    assert.equal(rows[1]![header.indexOf('nota_autorizada')], '0');
    assert.equal(rows[1]![header.indexOf('nota')], '');
  });

  test('incluye la nota cuando la familia sí autorizó', () => {
    const withNote = family({ logEntries: [entry({ note: 'le gustó' })] });
    const csv = buildCsv('bitacora', bundle({
      families: [withNote],
      notesAuthorized: new Map([['fam-1', true]]),
    }));
    assert.match(csv, /le gustó/);
  });

  test('neutraliza una fórmula escrita en una nota', () => {
    const csv = buildCsv('bitacora', bundle({
      families: [family({ logEntries: [entry({ note: '=HYPERLINK("http://malo.pe")' })] })],
      notesAuthorized: new Map([['fam-1', true]]),
    }));
    assert.equal(csv.includes('\n=HYPERLINK'), false);
    assert.match(csv, /'=HYPERLINK/);
  });
});

describe('resumen', () => {
  test('marca los umbrales como propuestos, no como definiciones cerradas', () => {
    const csv = buildCsv('resumen', bundle());
    assert.match(csv, /PROPUESTO/);
    assert.match(csv, /umbral_semana_activa/);
    assert.match(csv, /respuestas_dentro_del_objetivo/);
  });

  test('lleva la fecha de corte, porque todo se calcula hasta ahí', () => {
    const rows = parse(buildCsv('resumen', bundle()));
    assert.deepEqual(rows[1], ['corte', CUTOFF, 'Fecha hasta la que se calcula todo']);
  });

  test('incluye una fila de retención por cada semana del programa', () => {
    const csv = buildCsv('resumen', bundle());
    for (let week = 1; week <= 8; week += 1) {
      assert.match(csv, new RegExp(`retencion_semana_${String(week).padStart(2, '0')}`));
    }
  });

  test('cada indicador lleva su definición en la columna nota', () => {
    const rows = parse(buildCsv('resumen', bundle()));
    const header = rows[0]!;
    const adherencia = rows.find((row) => row[0] === 'adherencia_promedio');
    assert.match(adherencia![header.indexOf('nota')]!, /semanas activas/);
  });
});

describe('feedback', () => {
  test('incluye el texto de la familia y el tiempo de respuesta, no el texto de la respuesta', () => {
    const answered: Feedback = {
      ...createFeedback({ id: 'f1', type: 'consulta', channel: 'whatsapp', text: '¿A qué distancia?', createdAt: '2026-09-05T00:00:00.000Z' }),
      status: 'respondido',
      replies: [{ text: 'RESPUESTA_SECRETA', gestorSub: 'g1', at: '2026-09-06T00:00:00.000Z' }],
    };
    const csv = buildCsv('feedback', bundle({ families: [family({ feedback: [answered] })] }));

    assert.match(csv, /¿A qué distancia\?/);
    assert.equal(csv.includes('RESPUESTA_SECRETA'), false);
    const rows = parse(csv);
    assert.equal(rows[1]![rows[0]!.indexOf('horas_primera_respuesta')], '24.0');
  });

  test('deja vacío el tiempo de un feedback sin responder', () => {
    const open = createFeedback({ id: 'f1', type: 'pedido', channel: 'pwa', text: 'x', createdAt: '2026-09-05T00:00:00.000Z' });
    const rows = parse(buildCsv('feedback', bundle({ families: [family({ feedback: [open] })] })));
    assert.equal(rows[1]![rows[0]!.indexOf('horas_primera_respuesta')], '');
  });
});

describe('auditoría', () => {
  test('exporta el registro de accesos ordenado en el tiempo', () => {
    const csv = buildCsv('auditoria', bundle({
      audit: [
        { at: '2026-09-06T00:00:00.000Z', gestorSub: 'g1', gestorEmail: 'a@x.pe', action: 'exportar_datos', familyId: null, detail: 'familias' },
        { at: '2026-09-05T00:00:00.000Z', gestorSub: 'g2', gestorEmail: 'b@x.pe', action: 'ver_detalle_familia', familyId: 'fam-1' },
      ],
    }));
    const rows = parse(csv);
    assert.equal(rows[1]![0], '2026-09-05T00:00:00.000Z');
    assert.equal(rows[2]![rows[0]!.indexOf('accion')], 'exportar_datos');
  });
});

describe('envíos', () => {
  test('lleva la categoría de precio, que es lo que permite conciliar la factura', () => {
    const csv = buildCsv('envios', bundle({
      families: [family({
        deliveries: [{
          isoWeek: '2026-W36', week: 1, sent: 2, delivered: 2, read: 1, failed: 0, billable: 2,
          categories: { utility: 1, marketing: 1 },
        }],
      })],
    }));
    const rows = parse(csv);
    assert.match(rows[1]![rows[0]!.indexOf('categorias_precio')]!, /utility:1/);
    assert.match(rows[1]![rows[0]!.indexOf('categorias_precio')]!, /marketing:1/);
  });
});
