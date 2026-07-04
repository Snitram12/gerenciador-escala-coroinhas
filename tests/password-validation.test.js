const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePasswordStrength } = require('../auth-utils');

test('valida senha forte com maiúscula, minúscula e número', () => {
  assert.equal(validatePasswordStrength('Admin123'), true);
  assert.equal(validatePasswordStrength('admin123'), false);
  assert.equal(validatePasswordStrength('ADMIN123'), false);
  assert.equal(validatePasswordStrength('Admin'), false);
});
