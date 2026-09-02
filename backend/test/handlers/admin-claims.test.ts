import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gestorFromClaims, parseGroups } from '../../src/handlers/admin/claims.ts';
import { assertIsGestor } from '../../src/handlers/admin/logic.ts';

/**
 * These cover the shape the HTTP API actually delivers, which is not the shape the type says.
 * A manager in the group getting a 403 on the family detail is the bug this file exists to prevent.
 */
test('un solo grupo llega entre corchetes y se reconoce', () => {
  assert.deepEqual(parseGroups('[gestores]'), ['gestores']);
});

test('varios grupos entre corchetes se separan por espacios', () => {
  assert.deepEqual(parseGroups('[gestores administradores]'), ['gestores', 'administradores']);
});

test('la lista separada por comas también se acepta', () => {
  assert.deepEqual(parseGroups('gestores,administradores'), ['gestores', 'administradores']);
});

test('un arreglo se acepta tal cual', () => {
  assert.deepEqual(parseGroups(['gestores']), ['gestores']);
});

test('sin el claim no hay grupos', () => {
  assert.deepEqual(parseGroups(undefined), []);
  assert.deepEqual(parseGroups('[]'), []);
  assert.deepEqual(parseGroups(''), []);
});

test('un gestor del grupo pasa la verificación con los claims reales del autorizador', () => {
  const gestor = gestorFromClaims({
    sub: '34e86418-d0e1-70d1-876d-e9e6cd3d00f3',
    email: 'persona@leerenfamilia.pe',
    'cognito:groups': '[gestores]',
  });

  assert.equal(gestor.email, 'persona@leerenfamilia.pe');
  assert.doesNotThrow(() => assertIsGestor(gestor));
});

test('una cuenta del pool fuera del grupo sigue recibiendo 403', () => {
  const intruso = gestorFromClaims({ sub: 's', email: 'otro@x.pe' });
  assert.throws(() => assertIsGestor(intruso), /no pertenece al grupo/);

  const otroGrupo = gestorFromClaims({ sub: 's', email: 'x@x.pe', 'cognito:groups': '[otros]' });
  assert.throws(() => assertIsGestor(otroGrupo), /no pertenece al grupo/);
});

test('un grupo que contiene el nombre no cuenta como el grupo', () => {
  const parecido = gestorFromClaims({ sub: 's', email: 'x@x.pe', 'cognito:groups': '[gestores-ex]' });
  assert.throws(() => assertIsGestor(parecido), /no pertenece al grupo/);
});
