/** Codes are stable: handlers map them to HTTP statuses, so renaming one is a breaking change. */
export type DomainErrorCode =
  | 'invalid_date'
  | 'invalid_msisdn'
  | 'invalid_transition'
  | 'invalid_opt_in'
  | 'invalid_log_entry'
  | 'invalid_feedback'
  | 'invalid_enrollment';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}
