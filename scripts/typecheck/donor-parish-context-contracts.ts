import { loadDonorParishContext, type DonorParishContextEnv } from '../../src/handlers/donor-parish-context.js';
void loadDonorParishContext({}, { defaultParishId: 'fixture-parish' });
void loadDonorParishContext({}, {});
void loadDonorParishContext({}, { defaultParishId: null });
// @ts-expect-error Parish identifiers are strings, not numeric database keys.
void loadDonorParishContext({}, { defaultParishId: 42 });
// @ts-expect-error A caller must supply the authenticated donor projection.
void loadDonorParishContext({});
// @ts-expect-error The database binding must implement the Worker database interface.
const invalidEnv: DonorParishContextEnv = { AGAPAY_DB: 'database-name' };
void invalidEnv;
async function contextResult() {
  const result = await loadDonorParishContext({}, {});
  const enabled: boolean | undefined = result?.directoryEnabled;
  const name: string | undefined = result?.parishLifeLabel;
  void enabled;
  void name;
  // @ts-expect-error Capabilities are booleans, not string flags.
  const invalid: string | undefined = result?.communicationsEnabled;
  void invalid;
}
void contextResult;
