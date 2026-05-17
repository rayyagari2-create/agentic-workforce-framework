// services/governance/test/classifier.test.js
//
// One test per rule in services/governance/src/classifier.js, plus the
// fallback and a priority order check. Runs as a plain script:
//   node test/classifier.test.js
// A non zero exit indicates failure. Uses node:assert/strict to match
// services/execution/test/simulated.test.js.

import assert from 'node:assert/strict';
import { classify } from '../src/classifier.js';

function check(name, labels, expected) {
    const actual = classify({ labels });
    assert.deepEqual(
        actual,
        expected,
        `${name}: expected ${JSON.stringify(expected)} for labels ${JSON.stringify(labels)}, got ${JSON.stringify(actual)}`,
    );
}

// 1. payment / stripe / entitlement → payment_integration, high
check('payment',     ['payment'],     { task_class: 'payment_integration', risk_level: 'high' });
check('stripe',      ['stripe'],      { task_class: 'payment_integration', risk_level: 'high' });
check('entitlement', ['entitlement'], { task_class: 'payment_integration', risk_level: 'high' });

// 2. auth / jwt / session / oauth → auth_policy, high
check('auth',    ['auth'],    { task_class: 'auth_policy', risk_level: 'high' });
check('jwt',     ['jwt'],     { task_class: 'auth_policy', risk_level: 'high' });
check('session', ['session'], { task_class: 'auth_policy', risk_level: 'high' });
check('oauth',   ['oauth'],   { task_class: 'auth_policy', risk_level: 'high' });

// 3. database / migration / postgres → database_migration, high
check('database',  ['database'],  { task_class: 'database_migration', risk_level: 'high' });
check('migration', ['migration'], { task_class: 'database_migration', risk_level: 'high' });
check('postgres',  ['postgres'],  { task_class: 'database_migration', risk_level: 'high' });

// 4. security / rate-limiting → security_policy, high
check('security',       ['security'],       { task_class: 'security_policy', risk_level: 'high' });
check('rate-limiting',  ['rate-limiting'],  { task_class: 'security_policy', risk_level: 'high' });

// 5. webhook / reliability / retry → webhook_integration, high
check('webhook',     ['webhook'],     { task_class: 'webhook_integration', risk_level: 'high' });
check('reliability', ['reliability'], { task_class: 'webhook_integration', risk_level: 'high' });
check('retry',       ['retry'],       { task_class: 'webhook_integration', risk_level: 'high' });

// 6. backend / api → api_development, medium
check('backend', ['backend'], { task_class: 'api_development', risk_level: 'medium' });
check('api',     ['api'],     { task_class: 'api_development', risk_level: 'medium' });

// 7. ui / frontend / mobile → ui_refactor, medium
check('ui',       ['ui'],       { task_class: 'ui_refactor', risk_level: 'medium' });
check('frontend', ['frontend'], { task_class: 'ui_refactor', risk_level: 'medium' });
check('mobile',   ['mobile'],   { task_class: 'ui_refactor', risk_level: 'medium' });

// 8. documentation / docs → documentation_architecture, low
check('documentation', ['documentation'], { task_class: 'documentation_architecture', risk_level: 'low' });
check('docs',          ['docs'],          { task_class: 'documentation_architecture', risk_level: 'low' });

// 9. test / testing → test_addition, low
check('test',    ['test'],    { task_class: 'test_addition', risk_level: 'low' });
check('testing', ['testing'], { task_class: 'test_addition', risk_level: 'low' });

// 10. fallback → general_task, medium
check('fallback empty',   [],                    { task_class: 'general_task', risk_level: 'medium' });
check('fallback unknown', ['bug', 'priority:80'], { task_class: 'general_task', risk_level: 'medium' });

// ----------------------------------------------------------------------------
// Priority order. Rule order matters: a ticket carrying both 'backend' and
// 'payment' must classify as payment_integration, not api_development.
// These mirror the live Sprint 0 backlog.
// ----------------------------------------------------------------------------

// Backlog ticket 102: backend + payment + reliability → payment wins
check(
    'priority: payment beats backend and reliability',
    ['backend', 'payment', 'reliability'],
    { task_class: 'payment_integration', risk_level: 'high' },
);

// Backlog ticket 105: security + backend → security wins (security is rule 4, backend is rule 6)
check(
    'priority: security beats backend',
    ['security', 'backend'],
    { task_class: 'security_policy', risk_level: 'high' },
);

// Backlog ticket 104: backend + database + migration → database wins
check(
    'priority: database beats backend',
    ['backend', 'database', 'migration'],
    { task_class: 'database_migration', risk_level: 'high' },
);

// Case insensitivity. Intake lower cases already, but the pure function
// should not depend on that contract.
check('case insensitive', ['PAYMENT'], { task_class: 'payment_integration', risk_level: 'high' });

// Determinism. Same input twice must produce the same output object shape.
const a = classify({ labels: ['payment', 'backend'] });
const b = classify({ labels: ['payment', 'backend'] });
assert.deepEqual(a, b, 'classify must be deterministic');

process.stdout.write('classifier: all tests passed\n');
