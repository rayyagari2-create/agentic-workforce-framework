import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs-extra';

export async function validateFile(schemaPath, dataPath) {
  const ajv = new Ajv({ strict: false });
  addFormats(ajv);
  const schema = await fs.readJson(schemaPath);
  const data = await fs.readJson(dataPath);
  const validate = ajv.compile(schema);
  const valid = validate(data);
  return { valid, errors: validate.errors || [] };
}
