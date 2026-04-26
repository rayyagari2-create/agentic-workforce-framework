# Validation Fixtures

Example records that conform to the published JSON schemas.
Use these to verify schema behavior and as starting templates
for your own records.

## Validate with AJV CLI

Install AJV CLI:
  npm install -g ajv-cli ajv-formats

Validate a fixture:
  ajv validate \
    -s schemas/v1/agent-task-manifest.schema.json \
    -d tests/fixtures/agent-task-manifest.valid.json \
    --spec=draft2020

Validate all fixtures:
  for schema in schemas/v1/*.schema.json; do
    name=$(basename $schema .schema.json)
    echo "Validating $name..."
    ajv validate -s $schema \
      -d tests/fixtures/$name.valid.json \
      --spec=draft2020
  done

## Files

| Fixture | Schema |
|---|---|
| agent-task-manifest.valid.json | schemas/v1/agent-task-manifest.schema.json |
| agent-spawn-sidecar.valid.json | schemas/v1/agent-spawn-sidecar.schema.json |
| qa-verdict.valid.json | schemas/v1/qa-verdict.schema.json |
| failure-record.valid.json | schemas/v1/failure-record.schema.json |
| trust-score.valid.json | schemas/v1/trust-score.schema.json |

Note: Human-readable IDs (e.g. TASK-2026-04-25-001) are used
in documentation and examples for legibility. Production records
must use ULIDs to conform to the schemas.
