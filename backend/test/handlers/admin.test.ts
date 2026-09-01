import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, isoDate } from '../../src/domain/dates.ts';
import { DomainError } from '../../src/domain/errors.ts';
import { createFeedback, type Feedback } from '../../src/domain/feedback.ts';
import type { LogEntry } from '../../src/domain/log-entry.ts';
import type { SendResult, TemplateMessage, TextMessage, WhatsAppProvider } from '../../src/adapters/whatsapp/index.ts';
import { WhatsAppSendError } from '../../src/adapters/whatsapp/index.ts';
import {
  buildFamilyRows,
  buildInbox,
  closeFeedbackAs,
  openFamilyDetail,
  replyToFeedback,
} from '../../src/handlers/admin/logic.ts';
import type {
  AdminStore,
  AuditEntry,
  FamilyRecord,
  Gestor,
  ProgramSummary,
} from '../../src/handlers/admin/ports.ts';

const TODAY = isoDate('2026-09-20');
const NOW = new Date('2026-09-20T14:00:00.000Z');
const ANCHOR = isoDate('2026-09-15');

const PROGRAM: ProgramSummary = {
  programId: 'piloto-2026',
  programWeeks: 8,
  templateName: 'nplp_semana',
  languageCode: 'es',
  replyTemplateName: 'nplp_respuesta',
};

const GESTOR: Gestor = {
  sub: 'sub-gestora-1',
  email: 'gestora@leerenfamilia.pe',
  groups: ['gestores'],
};

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    clientId: `c-${Math.random()}`,
    date: isoDate('2026-09-19'),
    kind: 'lectura',
    minutes: 10,
    resourceId: null,
    note: null,
    loggedBy: 'principal',
    ...overrides,
  };
}

function family(overrides: Partial<FamilyRecord> = {}): FamilyRecord {
  return {
    familyId: 'fam-1',
    programId: PROGRAM.programId,
    status: 'activa',
    anchorDate: ANCHOR,
    babyName: 'Mateo',
    freeTextNotesAuthorized: false,
    caregivers: [
      { msisdn: '+51987654321', role: 'principal', optIn: true, lastInboundAt: null },
    ],
    logEntries: [],
    feedback: [],
    deliveredIsoWeeks: [],
    lastAccessAt: null,
    ...overrides,
  };
}

function openFeedback(id = 'fb-1', createdAt = '2026-09-18T10:00:00.000Z'): Feedback {
  return createFeedback({ id, type: 'consulta', channel: 'whatsapp', text: '¿A qué distancia?', createdAt });
}

class FakeAdminStore implements AdminStore {
  families = new Map<string, FamilyRecord>([['fam-1', family()]]);
  audit: AuditEntry[] = [];
  saved: Feedback[] = [];
  notified = new Set<string>();

  async listActivePrograms(): Promise<ProgramSummary[]> {
    return [PROGRAM];
  }
  async listFamilies(): Promise<FamilyRecord[]> {
    return [...this.families.values()];
  }
  async getFamily(familyId: string): Promise<FamilyRecord | null> {
    return this.families.get(familyId) ?? null;
  }
  async saveFeedback(_familyId: string, _programId: string, feedback: Feedback): Promise<void> {
    this.saved.push(feedback);
    const existing = this.families.get(_familyId);
    if (existing !== undefined) {
      this.families.set(_familyId, {
        ...existing,
        feedback: existing.feedback.map((f) => (f.id === feedback.id ? feedback : f)),
      });
    }
  }
  async claimReplyNotification(feedbackId: string, replyIndex: number): Promise<boolean> {
    const key = `${feedbackId}#${replyIndex}`;
    if (this.notified.has(key)) return false;
    this.notified.add(key);
    return true;
  }
  async writeAudit(entry: AuditEntry): Promise<void> {
    this.audit.push(entry);
  }
}

class FakeProvider implements WhatsAppProvider {
  readonly name = 'mock' as const;
  texts: TextMessage[] = [];
  templates: TemplateMessage[] = [];
  failWith: Error | null = null;

  async sendTemplate(message: TemplateMessage): Promise<SendResult> {
    if (this.failWith !== null) throw this.failWith;
    this.templates.push(message);
    return { wamid: 'wamid.MOCK-t', provider: 'mock' };
  }
  async sendText(message: TextMessage): Promise<SendResult> {
    if (this.failWith !== null) throw this.failWith;
    this.texts.push(message);
    return { wamid: 'wamid.MOCK-x', provider: 'mock' };
  }
}

let store: FakeAdminStore;
let provider: FakeProvider;

beforeEach(() => {
  store = new FakeAdminStore();
  provider = new FakeProvider();
});

describe('acceso del gestor', () => {
  test('rechaza a una cuenta que no está en el grupo gestores', async () => {
    // The JWT authorizer proves the token is valid, not that the user belongs in this app.
    const intruder: Gestor = { sub: 's', email: 'otro@x.pe', groups: [] };
    await assert.rejects(
      () => openFamilyDetail(store, intruder, 'fam-1', TODAY, NOW),
      (e: unknown) => e instanceof DomainError && e.code === 'forbidden',
    );
    assert.equal(store.audit.length, 0);
  });

  test('rechaza a quien está en otro grupo del mismo pool', async () => {
    const other: Gestor = { sub: 's', email: 'x@x.pe', groups: ['administradores'] };
    await assert.rejects(() => openFamilyDetail(store, other, 'fam-1', TODAY, NOW), DomainError);
  });
});

describe('listado de familias', () => {
  test('muestra semana del programa, actividad reciente y feedback abierto', () => {
    store.families.set('fam-1', family({
      logEntries: [entry({ date: isoDate('2026-09-19') }), entry({ date: isoDate('2026-09-18'), minutes: 5 })],
      feedback: [openFeedback()],
    }));
    const [row] = buildFamilyRows([...store.families.values()], PROGRAM, TODAY);

    assert.equal(row?.programWeek, 1);
    assert.equal(row?.logEntriesLast7Days, 2);
    assert.equal(row?.minutesLast7Days, 15);
    assert.equal(row?.openFeedback, 1);
  });

  test('cuenta solo los últimos 7 días', () => {
    store.families.set('fam-1', family({
      logEntries: [entry({ date: isoDate('2026-09-19') }), entry({ date: isoDate('2026-09-01') })],
    }));
    const [row] = buildFamilyRows([...store.families.values()], PROGRAM, TODAY);
    assert.equal(row?.logEntriesLast7Days, 1);
  });

  test('pone primero a las familias que necesitan atención', () => {
    // Open feedback first, then whoever has been least active.
    const rows = buildFamilyRows([
      family({ familyId: 'activa', logEntries: [entry(), entry(), entry()] }),
      family({ familyId: 'callada' }),
      family({ familyId: 'con-consulta', feedback: [openFeedback()], logEntries: [entry(), entry()] }),
    ], PROGRAM, TODAY);

    assert.deepEqual(rows.map((r) => r.familyId), ['con-consulta', 'callada', 'activa']);
  });

  test('no expone texto libre en el listado, así que no necesita consentimiento ni auditoría', () => {
    const rows = buildFamilyRows([
      family({ logEntries: [entry({ note: 'la rutina de la casa' })] }),
    ], PROGRAM, TODAY);
    assert.equal(JSON.stringify(rows).includes('rutina'), false);
    assert.equal(store.audit.length, 0);
  });

  test('marca a la familia que terminó el programa', () => {
    const rows = buildFamilyRows([family({ anchorDate: addDays(ANCHOR, -70) })], PROGRAM, TODAY);
    assert.equal(rows[0]?.finished, true);
  });
});

describe('detalle de familia', () => {
  test('escribe una entrada de auditoría con el gestor, la familia y la acción', async () => {
    // This is the counterpart of giving a manager access to data about a minor (encargo §8).
    await openFamilyDetail(store, GESTOR, 'fam-1', TODAY, NOW);
    assert.deepEqual(store.audit, [{
      gestorSub: 'sub-gestora-1',
      gestorEmail: 'gestora@leerenfamilia.pe',
      action: 'ver_detalle_familia',
      familyId: 'fam-1',
      at: NOW.toISOString(),
    }]);
  });

  test('oculta el texto de las notas si la familia no lo autorizó', async () => {
    store.families.set('fam-1', family({
      freeTextNotesAuthorized: false,
      logEntries: [entry({ note: 'se durmió a las 3 de la mañana' })],
    }));
    const detail = await openFamilyDetail(store, GESTOR, 'fam-1', TODAY, NOW);

    assert.equal(detail.notesVisible, false);
    assert.equal(detail.entries[0]?.note, null);
    assert.equal(JSON.stringify(detail).includes('3 de la mañana'), false);
    // The aggregate is still there: adherence does not depend on reading the notes.
    assert.equal(detail.summary.entries, 1);
    assert.equal(detail.summary.totalMinutes, 10);
  });

  test('muestra las notas cuando la familia sí lo autorizó', async () => {
    store.families.set('fam-1', family({
      freeTextNotesAuthorized: true,
      logEntries: [entry({ note: 'le gustó el libro' })],
    }));
    const detail = await openFamilyDetail(store, GESTOR, 'fam-1', TODAY, NOW);
    assert.equal(detail.notesVisible, true);
    assert.equal(detail.entries[0]?.note, 'le gustó el libro');
  });

  test('falla con not_found para una familia que no existe, sin auditar', async () => {
    await assert.rejects(
      () => openFamilyDetail(store, GESTOR, 'fam-inexistente', TODAY, NOW),
      (e: unknown) => e instanceof DomainError && e.code === 'not_found',
    );
  });
});

describe('bandeja unificada', () => {
  test('mezcla lo que entra por la PWA y por WhatsApp', () => {
    store.families.set('fam-1', family({
      feedback: [
        createFeedback({ id: 'a', type: 'consulta', channel: 'whatsapp', text: 'w', createdAt: '2026-09-18T10:00:00.000Z' }),
        createFeedback({ id: 'b', type: 'pedido', channel: 'pwa', text: 'p', createdAt: '2026-09-19T10:00:00.000Z' }),
      ],
    }));
    const inbox = buildInbox([...store.families.values()], 'todos');
    assert.deepEqual(inbox.map((i) => i.feedback.channel), ['whatsapp', 'pwa']);
  });

  test('ordena del más antiguo al más nuevo', () => {
    // The family that has been waiting longest is answered first.
    store.families.set('fam-1', family({
      feedback: [openFeedback('nuevo', '2026-09-19T10:00:00.000Z'), openFeedback('viejo', '2026-09-10T10:00:00.000Z')],
    }));
    const inbox = buildInbox([...store.families.values()], 'todos');
    assert.deepEqual(inbox.map((i) => i.feedback.id), ['viejo', 'nuevo']);
  });

  test('filtra por estado y lleva el nombre del bebé para dar contexto', () => {
    const replied = { ...openFeedback('resp'), status: 'respondido' as const };
    store.families.set('fam-1', family({ feedback: [openFeedback('abierto'), replied] }));

    assert.deepEqual(buildInbox([...store.families.values()], 'abierto').map((i) => i.feedback.id), ['abierto']);
    assert.deepEqual(buildInbox([...store.families.values()], 'respondido').map((i) => i.feedback.id), ['resp']);
    assert.equal(buildInbox([...store.families.values()], 'abierto')[0]?.babyName, 'Mateo');
  });

  test('junta el feedback de varias familias', () => {
    store.families.set('fam-2', family({ familyId: 'fam-2', babyName: 'Ana', feedback: [openFeedback('otra', '2026-09-11T10:00:00.000Z')] }));
    store.families.set('fam-1', family({ feedback: [openFeedback('una', '2026-09-12T10:00:00.000Z')] }));
    assert.deepEqual(buildInbox([...store.families.values()], 'abierto').map((i) => i.feedback.id), ['otra', 'una']);
  });
});

describe('respuesta del gestor', () => {
  beforeEach(() => {
    store.families.set('fam-1', family({ feedback: [openFeedback()] }));
  });

  const reply = (text = 'A unos 30 cm.', gestor: Gestor = GESTOR) =>
    replyToFeedback({ store, provider, now: () => NOW }, gestor, {
      familyId: 'fam-1', feedbackId: 'fb-1', text,
      replyTemplateName: PROGRAM.replyTemplateName, languageCode: 'es',
    });

  test('guarda la respuesta y deja el feedback como respondido', async () => {
    const outcome = await reply();
    assert.equal(outcome.feedback.status, 'respondido');
    assert.equal(outcome.feedback.replies[0]?.text, 'A unos 30 cm.');
    assert.equal(outcome.feedback.replies[0]?.gestorSub, 'sub-gestora-1');
  });

  test('manda mensaje libre cuando la ventana de 24h está abierta', async () => {
    // Free, and no template approval needed.
    store.families.set('fam-1', family({
      feedback: [openFeedback()],
      caregivers: [{ msisdn: '+51987654321', role: 'principal', optIn: true, lastInboundAt: NOW.getTime() - 3600_000 }],
    }));
    const outcome = await reply();
    assert.equal(outcome.channel, 'mensaje_libre');
    assert.equal(provider.texts.length, 1);
    assert.equal(provider.templates.length, 0);
  });

  test('manda plantilla cuando la ventana está cerrada', async () => {
    const outcome = await reply();
    assert.equal(outcome.channel, 'plantilla');
    assert.equal(provider.templates.length, 1);
    assert.equal(provider.templates[0]?.templateName, 'nplp_respuesta');
  });

  test('audita la respuesta con el feedback al que corresponde', async () => {
    await reply();
    const audited = store.audit.find((a) => a.action === 'responder_feedback');
    assert.equal(audited?.gestorSub, 'sub-gestora-1');
    assert.equal(audited?.detail, 'fb-1');
  });

  test('no notifica dos veces la misma respuesta', async () => {
    // A retried request must not produce a second charged message.
    await reply();
    store.families.set('fam-1', family({ feedback: [openFeedback()] }));
    const second = await reply();
    assert.equal(second.notified, false);
    assert.equal(second.reason, 'ya_notificado');
    assert.equal(provider.templates.length, 1);
  });

  test('una corrección sí se notifica, porque es otra respuesta', async () => {
    // Keying idempotency on the feedback id alone would silence every correction.
    await reply('A 10 cm.');
    const corrected = await replyToFeedback({ store, provider, now: () => NOW }, GESTOR, {
      familyId: 'fam-1', feedbackId: 'fb-1', text: 'Corrijo: a 30 cm.',
      replyTemplateName: PROGRAM.replyTemplateName, languageCode: 'es',
    });

    assert.equal(corrected.notified, true);
    assert.equal(corrected.feedback.replies.length, 2);
    assert.equal(provider.templates.length, 2);
  });

  test('guarda la respuesta aunque WhatsApp falle', async () => {
    // Losing the notification is recoverable; losing the answer a manager just wrote is not.
    provider.failWith = new WhatsAppSendError('Graph API returned 500', 500, '');
    const outcome = await reply();

    assert.equal(outcome.notified, false);
    assert.equal(outcome.feedback.status, 'respondido');
    assert.equal(store.saved.length, 1);
  });

  test('guarda la respuesta aunque la familia se haya dado de baja', async () => {
    store.families.set('fam-1', family({
      feedback: [openFeedback()],
      caregivers: [{ msisdn: '+51987654321', role: 'principal', optIn: false, lastInboundAt: null }],
    }));
    const outcome = await reply();
    assert.equal(outcome.notified, false);
    assert.equal(outcome.reason, 'sin_cuidadores_con_opt_in');
    assert.equal(outcome.feedback.status, 'respondido');
  });

  test('rechaza una respuesta vacía y una cuenta sin permisos', async () => {
    await assert.rejects(() => reply('   '), DomainError);
    await assert.rejects(() => reply('hola', { sub: 'x', email: 'x@x', groups: [] }), DomainError);
  });

  test('rechaza responder a un feedback que no existe', async () => {
    await assert.rejects(
      () => replyToFeedback({ store, provider, now: () => NOW }, GESTOR, {
        familyId: 'fam-1', feedbackId: 'no-existe', text: 'hola',
        replyTemplateName: 'x', languageCode: 'es',
      }),
      (e: unknown) => e instanceof DomainError && e.code === 'not_found',
    );
  });
});

describe('cerrar feedback', () => {
  test('cierra y deja constancia de quién lo hizo', async () => {
    store.families.set('fam-1', family({ feedback: [openFeedback()] }));
    const closed = await closeFeedbackAs(store, GESTOR, { familyId: 'fam-1', feedbackId: 'fb-1' }, NOW);
    assert.equal(closed.status, 'cerrado');
    assert.equal(closed.closedBy, 'sub-gestora-1');
  });

  test('rechaza a quien no es gestor', async () => {
    store.families.set('fam-1', family({ feedback: [openFeedback()] }));
    await assert.rejects(
      () => closeFeedbackAs(store, { sub: 'x', email: 'x@x', groups: [] }, { familyId: 'fam-1', feedbackId: 'fb-1' }, NOW),
      DomainError,
    );
  });
});
