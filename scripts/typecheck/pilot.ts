// Compile-time contracts only. This file is never emitted or executed.
import {
  classifyCommunityType,
  organizationClassificationForRegistration,
  type OrganizationType,
} from '../../src/organizations/types.js';
import { terminologyProfileForClassification } from '../../src/organizations/terminology.js';
import { plainTextFromMarkup } from '../../src/lib/xml-text.js';

const classification = classifyCommunityType('parish');
const organizationType: OrganizationType = classification.organizationType;
const label: string = terminologyProfileForClassification(classification).organization;
const text: string = plainTextFromMarkup(null, { limit: 80, preserveLines: true });
organizationClassificationForRegistration(null);
organizationClassificationForRegistration({ parishType: 'mission' });

// @ts-expect-error Organization kinds must remain a closed union.
const invalidType: OrganizationType = 'parihs';
// @ts-expect-error Callers must use the actual classification contract.
terminologyProfileForClassification({ organizationType: 'parihs' });
// @ts-expect-error Limits remain numeric through the compatible .js import path.
plainTextFromMarkup('text', { limit: '80' });
// @ts-expect-error Classification results are immutable.
classification.recognized = false;

// Generated Worker bindings must be available without browser DOM globals.
declare const env: Env;
const assets: Fetcher = env.ASSETS;
// @ts-expect-error Browser document is unavailable in a Worker.
document.querySelector('main');

void [organizationType, label, text, invalidType, assets];
