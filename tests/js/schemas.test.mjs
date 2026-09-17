import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUNDLED_SCHEMAS, isRegulatedFeature, featureVerification, LIGHTING_REGULATION_NOTICE } from '../../pwa/js/schemas.js';

test('exterior lighting features are flagged as regulated', () => {
  assert.equal(isRegulatedFeature({ category: 'Daytime Running Lights' }), true);
  assert.equal(isRegulatedFeature({ category: 'Exterior Lighting' }), true);
  assert.equal(isRegulatedFeature({ category: 'Central Locking' }), false);
  assert.match(LIGHTING_REGULATION_NOTICE, /UNECE|lighting regulations/i);
});

test('a feature with no verified vehicles is reported as unverified', () => {
  assert.equal(featureVerification({}).verified, false);
  assert.equal(featureVerification({ verified_on: [] }).verified, false);
  const v = featureVerification({ verified_on: ['VW Transporter T5.1 2012'] });
  assert.equal(v.verified, true);
  assert.match(v.label, /T5\.1/);
});

test('every bundled feature carries an explicit verified_on list', () => {
  for (const [key, schema] of Object.entries(BUNDLED_SCHEMAS)) {
    for (const f of schema.features) {
      assert.ok(Array.isArray(f.verified_on), `${key}/${f.id} is missing verified_on`);
    }
  }
});
