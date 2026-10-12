import {
  createAccountingConfiguration,
  getAccountingEnvironmentProfile,
  validateAccountingConfiguration,
  summarizeAccountingConfiguration,
} from '../../src/accounting/environment.js';
const config = createAccountingConfiguration({}, { environment: 'test', centralDatabaseName: 'db' });
const name: string = config.centralDatabase.name;
void name;
summarizeAccountingConfiguration(config);
// @ts-expect-error Configuration names are strings.
createAccountingConfiguration({}, { centralDatabaseName: 12 });
// @ts-expect-error Production restriction option must be boolean.
validateAccountingConfiguration(config, { allowProduction: 'false' });
// @ts-expect-error Configuration is immutable.
config.production = true;
const profile = getAccountingEnvironmentProfile(' ');
// @ts-expect-error Legacy whitespace input may yield no profile.
void profile.workerName;
const input: unknown = {};
const output = validateAccountingConfiguration(input);
// @ts-expect-error Minimal validation does not establish a full configuration.
void output.profile.workerName;
