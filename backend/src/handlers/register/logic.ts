import type { IsoDate } from '../../domain/dates.ts';
import { isoDate } from '../../domain/dates.ts';
import { DomainError } from '../../domain/errors.ts';
import { toE164, type Msisdn } from '../../domain/msisdn.ts';
import { resolveAnchorDate, type ScheduleAnchorPolicy } from '../../domain/schedule.ts';

export interface ProgramConfig {
  readonly programId: string;
  readonly anchorPolicy: ScheduleAnchorPolicy;
  readonly programWeeks: number;
  readonly consentVersion: string;
}

export interface EnrollmentRequest {
  readonly programId: string;
  readonly clinic: string;
  readonly baby: { readonly name: string; readonly birthDate: string };
  readonly caregivers: ReadonlyArray<{ readonly msisdn: string; readonly role: string }>;
  readonly consent: {
    readonly accepted: boolean;
    readonly version: string;
    readonly freeTextNotesAuthorized: boolean;
  };
}

export interface EnrollmentRecord {
  readonly familyId: string;
  readonly programId: string;
  readonly clinic: string;
  readonly anchorDate: IsoDate;
  readonly anchorPolicy: ScheduleAnchorPolicy;
  readonly babyName: string;
  readonly babyBirthDate: IsoDate;
  readonly caregivers: ReadonlyArray<{ readonly msisdn: Msisdn; readonly role: 'principal' | 'secundario' }>;
  readonly consentVersion: string;
  readonly freeTextNotesAuthorized: boolean;
  readonly enrolledAt: string;
}

export interface EnrollmentStore {
  getProgram(programId: string): Promise<ProgramConfig | null>;
  findFamilyByMsisdn(msisdn: string): Promise<string | null>;
  createFamily(record: EnrollmentRecord): Promise<void>;
}

function invalid(message: string): never {
  throw new DomainError('invalid_enrollment', message);
}

/**
 * Enrolment from the clinic QR.
 *
 * The data captured is the minimum the programme needs: an E.164 number, the baby's name or alias,
 * and a birth date. No DNI, no address, no clinical history — nothing that comes from the clinic's
 * own records (encargo §8). Anything extra in the request body is ignored rather than stored.
 */
export async function enroll(
  store: EnrollmentStore,
  request: EnrollmentRequest,
  today: IsoDate,
  now: Date,
  newId: () => string,
): Promise<{ record: EnrollmentRecord; program: ProgramConfig }> {
  const program = await store.getProgram(request.programId);
  if (program === null) {
    invalid(`El programa ${String(request.programId)} no existe o no está activo`);
  }

  // Consent is a precondition, not a field. Minors' data is processed here.
  if (request.consent?.accepted !== true) {
    invalid('Hace falta el consentimiento informado del cuidador para registrar a la familia');
  }
  if (typeof request.consent.version !== 'string' || request.consent.version.trim() === '') {
    invalid('Hay que registrar qué versión del consentimiento se aceptó');
  }

  const babyName = typeof request.baby?.name === 'string' ? request.baby.name.trim() : '';
  if (babyName === '') {
    invalid('Hace falta el nombre o alias del bebé');
  }
  const birthDate = isoDate(String(request.baby.birthDate));
  if (birthDate > today) {
    invalid('La fecha de nacimiento no puede estar en el futuro');
  }

  if (!Array.isArray(request.caregivers) || request.caregivers.length === 0) {
    invalid('Hace falta al menos un cuidador');
  }
  if (request.caregivers.length > 2) {
    invalid('El piloto contempla como máximo dos cuidadores por familia');
  }

  const caregivers = request.caregivers.map((caregiver, index) => ({
    msisdn: toE164(String(caregiver.msisdn)),
    role: (index === 0 || caregiver.role === 'principal' ? 'principal' : 'secundario') as
      | 'principal'
      | 'secundario',
  }));

  if (new Set(caregivers.map((c) => c.msisdn)).size !== caregivers.length) {
    invalid('Los dos cuidadores no pueden tener el mismo número');
  }

  for (const caregiver of caregivers) {
    const existing = await store.findFamilyByMsisdn(caregiver.msisdn);
    if (existing !== null) {
      // Merging into an existing family from a public endpoint would let anyone who guesses a
      // number attach themselves to that family. A manager resolves this case instead.
      invalid(`El número ${caregiver.msisdn} ya está registrado en el programa`);
    }
  }

  const record: EnrollmentRecord = {
    familyId: newId(),
    programId: program.programId,
    clinic: typeof request.clinic === 'string' ? request.clinic.trim() : '',
    anchorDate: resolveAnchorDate(program.anchorPolicy, {
      enrollmentDate: today,
      birthDate,
    }),
    anchorPolicy: program.anchorPolicy,
    babyName,
    babyBirthDate: birthDate,
    caregivers,
    consentVersion: request.consent.version.trim(),
    freeTextNotesAuthorized: request.consent.freeTextNotesAuthorized === true,
    enrolledAt: now.toISOString(),
  };

  await store.createFamily(record);
  return { record, program };
}
