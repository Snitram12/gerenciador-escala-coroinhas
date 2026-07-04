const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../auth-utils');

test('hashPassword e verifyPassword funcionam para a mesma senha', async () => {
  const senha = 'senhaSegura123';
  const hash = await hashPassword(senha);

  assert.notEqual(hash, senha);
  assert.equal(await verifyPassword(senha, hash), true);
  assert.equal(await verifyPassword('outraSenha', hash), false);
});
