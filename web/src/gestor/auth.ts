import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  type CognitoUserSession,
} from 'amazon-cognito-identity-js';

/**
 * Cognito sign-in for managers.
 *
 * `amazon-cognito-identity-js` is here because it implements SRP and the TOTP challenge; writing
 * SRP by hand is not a reasonable thing to do, and the alternative — enabling
 * USER_PASSWORD_AUTH — would send the password to the API instead of proving knowledge of it.
 */
export interface RuntimeConfig {
  readonly userPoolId: string;
  readonly userPoolClientId: string;
}

let pool: CognitoUserPool | null = null;
let pendingUser: CognitoUser | null = null;

/**
 * Configuration comes from a file written at deploy time rather than baked into the bundle, so one
 * build can be deployed to any stack.
 */
export async function loadConfig(): Promise<RuntimeConfig> {
  const response = await fetch('/config.json', { cache: 'no-store' });
  const config = (await response.json()) as RuntimeConfig;
  if (config.userPoolId === '' || config.userPoolClientId === '') {
    throw new Error('config.json no tiene los datos del user pool. Ver docs/runbook.md.');
  }
  pool = new CognitoUserPool({
    UserPoolId: config.userPoolId,
    ClientId: config.userPoolClientId,
  });
  return config;
}

export type SignInResult =
  | { readonly status: 'ok'; readonly session: CognitoUserSession }
  | { readonly status: 'mfa_requerido' }
  | { readonly status: 'nueva_clave_requerida' };

function requirePool(): CognitoUserPool {
  if (pool === null) {
    throw new Error('Configuración no cargada');
  }
  return pool;
}

export function signIn(email: string, password: string): Promise<SignInResult> {
  const user = new CognitoUser({ Username: email, Pool: requirePool() });
  pendingUser = user;

  return new Promise((resolve, reject) => {
    user.authenticateUser(
      new AuthenticationDetails({ Username: email, Password: password }),
      {
        onSuccess: (session) => resolve({ status: 'ok', session }),
        onFailure: (error: Error) => reject(error),
        // MFA is mandatory on this pool, so this is the normal path, not an edge case.
        totpRequired: () => resolve({ status: 'mfa_requerido' }),
        mfaRequired: () => resolve({ status: 'mfa_requerido' }),
        newPasswordRequired: () => resolve({ status: 'nueva_clave_requerida' }),
      },
    );
  });
}

export function submitMfaCode(code: string): Promise<CognitoUserSession> {
  const user = pendingUser;
  if (user === null) {
    return Promise.reject(new Error('No hay una sesión de inicio en curso'));
  }
  return new Promise((resolve, reject) => {
    user.sendMFACode(
      code,
      { onSuccess: (session) => resolve(session), onFailure: (error: Error) => reject(error) },
      'SOFTWARE_TOKEN_MFA',
    );
  });
}

export function completeNewPassword(password: string): Promise<CognitoUserSession> {
  const user = pendingUser;
  if (user === null) {
    return Promise.reject(new Error('No hay una sesión de inicio en curso'));
  }
  return new Promise((resolve, reject) => {
    user.completeNewPasswordChallenge(password, {}, {
      onSuccess: (session) => resolve(session),
      onFailure: (error: Error) => reject(error),
      totpRequired: () => reject(new Error('Configura primero la app de autenticación')),
    });
  });
}

/**
 * Returns the **ID token**, not the access token.
 *
 * The HTTP API authorizer is configured with `audience: [clientId]`, and only the ID token carries
 * `aud`. It is also the one that carries `email` and `cognito:groups`, which is what the manager
 * API checks and audits.
 */
export function currentIdToken(): Promise<string | null> {
  const user = requirePool().getCurrentUser();
  if (user === null) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    user.getSession((error: Error | null, session: CognitoUserSession | null) => {
      resolve(error !== null || session === null || !session.isValid()
        ? null
        : session.getIdToken().getJwtToken());
    });
  });
}

export function signOut(): void {
  requirePool().getCurrentUser()?.signOut();
  pendingUser = null;
}
