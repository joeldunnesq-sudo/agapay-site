import type { OrganizationContext } from '../organizations/context.js';
import type { CatalogRegistration } from './parish-giving-catalog.js';
import type { organizationAuthorizationScope } from '../organizations/access.js';
import type { AuditEventFields } from '../lib/audit-log.js';
export type LibraryEnv = Partial<Env> & { readonly DB?: D1Database | null };
export interface LibraryResourceInput {
  [field: string]: unknown;
}
export interface LibraryResourceRow {
  id: string;
  parish_id: string;
  title: string;
  description: string;
  category: string;
  resource_type: string;
  external_url: string | null;
  object_key: string | null;
  file_name: string | null;
  file_size: number | null;
  status: string;
  pinned: number;
  published_at: string | null;
  expires_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
interface ResourceFields {
  title: string;
  description: string;
  category: string;
  resourceType: string;
  url: string;
  pinned: number;
  expiresAt: string | null;
}
export type LibraryPdfValidation =
  | { error: string; status: number; bytes?: never; contentType?: never; size?: never }
  | {
      error?: never;
      status?: never;
      bytes: ArrayBuffer;
      contentType: string;
      size: number;
    };
interface LibraryAuthorized {
  found: { key: string; registration: CatalogRegistration };
  organization: OrganizationContext;
  organizationScope: NonNullable<ReturnType<typeof organizationAuthorizationScope>>;
  error?: never;
}
import {
  generateSecret,
  getBearerToken,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  normalizeEmail,
  rateLimit,
  unauthorized,
} from '../lib/core.js';
import { hasModuleAccess } from '../lib/entitlements.js';
import { recordAuditEvent } from '../lib/audit-log.js';
import { getParishLibrarySettings, setParishLibraryEnabled } from '../lib/parish-library.js';
import { validateSafeExternalUrl } from '../lib/safe-external-url.js';
import {
  bindOrganizationAuthorizationContext,
  evaluateOrganizationModuleAccess,
  ORGANIZATION_MODULES,
  organizationAuditFields,
} from '../organizations/index.js';
import { findRegistrationByParishId, requireDonor, verifyParishDashboardBearer } from './parish.js';

export const PARISH_LIBRARY_CATEGORIES = Object.freeze([
  'prayer_worship',
  'faith_formation',
  'newcomers',
  'ministries',
  'forms_policies',
  'pastoral_letters',
  'parish_life',
]);
export const PARISH_LIBRARY_PDF_MAX_BYTES = 20 * 1024 * 1024;

const database = (env: LibraryEnv) => env.AGAPAY_DB || env.DB || null;
const owns = (value: unknown, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value || {}, key);

function categoryValue(value: unknown, fallback = 'parish_life') {
  const category = String(value ?? fallback)
    .trim()
    .toLowerCase();
  if (!PARISH_LIBRARY_CATEGORIES.includes(category)) throw new Error('Choose a valid library category.');
  return category;
}

function nullableDate(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59.999Z` : raw);
  if (Number.isNaN(parsed.getTime())) throw new Error('Enter a valid expiration date.');
  return parsed.toISOString();
}

function resourceFromRow(row: Partial<LibraryResourceRow> = {}) {
  const type = row.resource_type || 'link';
  return {
    id: row.id || '',
    parishId: row.parish_id || '',
    title: row.title || '',
    description: row.description || '',
    category: row.category || 'parish_life',
    resourceType: type,
    url: type === 'link' ? row.external_url || '' : '',
    fileName: row.file_name || '',
    fileSize: Number(row.file_size || 0),
    fileReady: type === 'pdf' && Boolean(row.object_key),
    status: row.status || 'draft',
    pinned: Boolean(row.pinned),
    publishedAt: row.published_at || '',
    expiresAt: row.expires_at || '',
    createdBy: row.created_by || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

function validateResourceInput(input?: LibraryResourceInput, options?: { partial?: false }): ResourceFields;
function validateResourceInput(
  input: LibraryResourceInput | undefined,
  options: { partial: true }
): Partial<ResourceFields>;
function validateResourceInput(input: LibraryResourceInput = {}, { partial = false } = {}): Partial<ResourceFields> {
  const result: Partial<ResourceFields> = {};
  if (!partial || owns(input, 'title')) {
    result.title = String(input.title || '')
      .trim()
      .slice(0, 180);
    if (!result.title) throw new Error('Resource title is required.');
  }
  if (!partial || owns(input, 'description')) {
    result.description = String(input.description || '')
      .trim()
      .slice(0, 1200);
  }
  if (!partial || owns(input, 'category')) result.category = categoryValue(input.category);
  if (!partial || owns(input, 'resourceType')) {
    result.resourceType = String(input.resourceType || '')
      .trim()
      .toLowerCase();
    if (!['link', 'pdf'].includes(result.resourceType)) throw new Error('Choose a PDF or an external link.');
  }
  if (!partial || owns(input, 'url')) {
    const raw = String(input.url || '').trim();
    result.url = raw
      ? validateSafeExternalUrl(raw, {
          invalidMessage: 'Enter a valid article link.',
          unsafeMessage: 'Article links must use a public HTTPS address.',
        }).slice(0, 2000)
      : '';
  }
  if (!partial || owns(input, 'pinned')) result.pinned = input.pinned ? 1 : 0;
  if (!partial || owns(input, 'expiresAt')) result.expiresAt = nullableDate(input.expiresAt);
  return result;
}

export async function createParishLibraryResource(
  db: D1Database,
  { parishId, createdBy, input }: { parishId: string; createdBy: string; input: LibraryResourceInput }
) {
  const fields = validateResourceInput(input);
  if (fields.resourceType === 'link' && !fields.url) throw new Error('Article link is required.');
  if (fields.resourceType === 'pdf' && fields.url)
    throw new Error('PDF resources use an uploaded file, not an external URL.');
  const id = generateSecret('library');
  await db
    .prepare(
      `
    INSERT INTO parish_library_resources
      (id, parish_id, title, description, category, resource_type, external_url, pinned, expires_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .bind(
      id,
      parishId,
      fields.title,
      fields.description,
      fields.category,
      fields.resourceType,
      fields.resourceType === 'link' ? fields.url : null,
      fields.pinned,
      fields.expiresAt,
      createdBy
    )
    .run();
  return resourceFromRow(
    (await db.prepare('SELECT * FROM parish_library_resources WHERE id = ?').bind(id).first<LibraryResourceRow>())!
  );
}

export async function updateParishLibraryResource(
  db: D1Database,
  { parishId, resourceId, input }: { parishId: string; resourceId: string; input: LibraryResourceInput }
) {
  const current = await db
    .prepare('SELECT * FROM parish_library_resources WHERE id = ? AND parish_id = ?')
    .bind(resourceId, parishId)
    .first<LibraryResourceRow>();
  if (!current) return null;
  if (current.status === 'archived') throw new Error('Archived resources cannot be edited.');
  const fields = validateResourceInput(input, { partial: true });
  const resourceType = fields.resourceType ?? current.resource_type;
  if (resourceType !== current.resource_type) throw new Error('Create a new resource to change its type.');
  const externalUrl = resourceType === 'link' ? (fields.url ?? current.external_url) : null;
  if (resourceType === 'link' && !externalUrl) throw new Error('Article link is required.');
  const requestedStatus = owns(input, 'status')
    ? String(input.status || '')
        .trim()
        .toLowerCase()
    : current.status;
  if (!['draft', 'published'].includes(requestedStatus)) throw new Error('Choose draft or published status.');
  if (requestedStatus === 'published' && resourceType === 'pdf' && !current.object_key) {
    throw new Error('Upload the PDF before publishing this resource.');
  }
  const publishedAt = requestedStatus === 'published' ? current.published_at || new Date().toISOString() : null;
  await db
    .prepare(
      `
    UPDATE parish_library_resources
    SET title = ?, description = ?, category = ?, external_url = ?, pinned = ?, status = ?,
        published_at = ?, expires_at = ?, updated_at = datetime('now')
    WHERE id = ? AND parish_id = ?
  `
    )
    .bind(
      fields.title ?? current.title,
      fields.description ?? current.description,
      fields.category ?? current.category,
      externalUrl,
      fields.pinned ?? Number(current.pinned || 0),
      requestedStatus,
      publishedAt,
      fields.expiresAt !== undefined ? fields.expiresAt : current.expires_at,
      resourceId,
      parishId
    )
    .run();
  return resourceFromRow(
    (await db
      .prepare('SELECT * FROM parish_library_resources WHERE id = ?')
      .bind(resourceId)
      .first<LibraryResourceRow>())!
  );
}

export async function listParishLibraryResources(db: D1Database, parishId: string, { publishedOnly = false } = {}) {
  const result = await db
    .prepare(
      `
    SELECT * FROM parish_library_resources
    WHERE parish_id = ?${publishedOnly ? " AND status = 'published' AND (expires_at IS NULL OR expires_at > datetime('now'))" : ''}
    ORDER BY pinned DESC, COALESCE(published_at, updated_at) DESC, created_at DESC
  `
    )
    .bind(parishId)
    .all<LibraryResourceRow>();
  return (result.results || []).map(resourceFromRow);
}

export async function archiveParishLibraryResource(
  db: D1Database,
  { parishId, resourceId }: { parishId: string; resourceId: string }
) {
  await db
    .prepare(
      `
    UPDATE parish_library_resources SET status = 'archived', updated_at = datetime('now')
    WHERE id = ? AND parish_id = ?
  `
    )
    .bind(resourceId, parishId)
    .run();
  const row = await db
    .prepare('SELECT * FROM parish_library_resources WHERE id = ? AND parish_id = ?')
    .bind(resourceId, parishId)
    .first<LibraryResourceRow>();
  return row ? resourceFromRow(row) : null;
}

export async function deleteParishLibraryResource(
  db: D1Database,
  bucket: R2Bucket | null | undefined,
  { parishId, resourceId }: { parishId: string; resourceId: string }
) {
  const current = await db
    .prepare('SELECT * FROM parish_library_resources WHERE id = ? AND parish_id = ?')
    .bind(resourceId, parishId)
    .first<LibraryResourceRow>();
  if (!current) return null;
  if (current.object_key && bucket) await bucket.delete(current.object_key).catch(() => {});
  await db
    .prepare('DELETE FROM parish_library_resources WHERE id = ? AND parish_id = ?')
    .bind(resourceId, parishId)
    .run();
  return resourceFromRow(current);
}

export async function validateParishLibraryPdf(request: Request): Promise<LibraryPdfValidation> {
  const contentType = String(request.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (contentType !== 'application/pdf') return { error: 'Choose a PDF document.', status: 415 };
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > PARISH_LIBRARY_PDF_MAX_BYTES) return { error: 'PDFs must be 20MB or smaller.', status: 413 };
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return { error: 'The PDF is empty.', status: 422 };
  if (bytes.byteLength > PARISH_LIBRARY_PDF_MAX_BYTES) return { error: 'PDFs must be 20MB or smaller.', status: 413 };
  const signature = new TextDecoder().decode(bytes.slice(0, 5));
  if (signature !== '%PDF-') return { error: 'The uploaded file is not a valid PDF.', status: 415 };
  return { bytes, contentType, size: bytes.byteLength };
}

function safeFileName(value: unknown) {
  const clean = String(value || 'parish-resource.pdf')
    .replace(/[\r\n"\\/]+/g, '-')
    .trim()
    .slice(0, 180);
  return /\.pdf$/i.test(clean) ? clean : `${clean || 'parish-resource'}.pdf`;
}

async function requireLibraryAdmin(
  request: Request,
  env: LibraryEnv,
  parishId: string
): Promise<LibraryAuthorized | { error: Response }> {
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { error: json({ error: 'Parish not found' }, { status: 404 }) };
  if (!(await verifyParishDashboardBearer(found.registration, getBearerToken(request))))
    return { error: unauthorized() };
  const moduleAccess = evaluateOrganizationModuleAccess(
    found.registration,
    ORGANIZATION_MODULES.LIBRARY,
    hasModuleAccess,
    { organizationId: parishId, registrationReference: found.key }
  );
  if (!moduleAccess.allowed) {
    return { error: json({ error: 'Parish Library requires Give + or Parish.' }, { status: 403 }) };
  }
  return bindOrganizationAuthorizationContext({ found }, moduleAccess.organization) || { error: unauthorized() };
}

async function recordLibraryAuditEvent(
  env: LibraryEnv,
  request: Request,
  auth: LibraryAuthorized,
  actorUserId: string,
  fields: AuditEventFields
) {
  const auditFields = organizationAuditFields(auth.organization, {
    actorUserId,
    actorType: 'parish',
    ...fields,
  });
  if (auditFields) await recordAuditEvent(env, request, auditFields);
}

async function uploadParishLibraryPdf(request: Request, env: LibraryEnv, parishId: string, resourceId: string) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
  const limited = await rateLimit(request, env, 'parish-library-pdf-upload', { limit: 12, windowSeconds: 300 });
  if (limited) return limited;
  const db = database(env)!;
  const auth = await requireLibraryAdmin(request, env, parishId);
  if (auth.error) return auth.error;
  const tenantParishId = auth.organizationScope.legacyParishId;
  const actorUserId =
    normalizeEmail(auth.found.registration.treasurerEmail || auth.found.registration.priestEmail) ||
    `parish:${tenantParishId}`;
  if (!env.PARISH_LIBRARY_ASSETS)
    return json({ error: 'Parish Library file storage is not configured.' }, { status: 503 });
  const current = await db
    .prepare('SELECT * FROM parish_library_resources WHERE id = ? AND parish_id = ?')
    .bind(resourceId, tenantParishId)
    .first<LibraryResourceRow>();
  if (!current) return json({ error: 'Resource not found' }, { status: 404 });
  if (current.resource_type !== 'pdf') return json({ error: 'This resource is an external link.' }, { status: 422 });
  if (current.status === 'archived') return json({ error: 'Archived resources cannot be edited.' }, { status: 422 });
  const upload = await validateParishLibraryPdf(request);
  if (upload.error) return json({ error: upload.error }, { status: upload.status });
  const fileName = safeFileName(request.headers.get('x-agapay-file-name') || `${current.title}.pdf`);
  const key = `parish-library/${encodeURIComponent(tenantParishId)}/${encodeURIComponent(resourceId)}/${Date.now()}-${crypto.randomUUID()}.pdf`;
  await env.PARISH_LIBRARY_ASSETS.put(key, upload.bytes!, {
    customMetadata: { agapayParishId: tenantParishId },
    httpMetadata: { contentType: 'application/pdf', cacheControl: 'private, no-store' },
  });
  try {
    await db
      .prepare(
        `
      UPDATE parish_library_resources
      SET object_key = ?, file_name = ?, file_size = ?, updated_at = datetime('now')
      WHERE id = ? AND parish_id = ?
    `
      )
      .bind(key, fileName, upload.size, resourceId, tenantParishId)
      .run();
  } catch (error) {
    await env.PARISH_LIBRARY_ASSETS.delete(key).catch(() => {});
    throw error;
  }
  if (current.object_key) await env.PARISH_LIBRARY_ASSETS.delete(current.object_key).catch(() => {});
  const resource = resourceFromRow(
    (await db
      .prepare('SELECT * FROM parish_library_resources WHERE id = ?')
      .bind(resourceId)
      .first<LibraryResourceRow>())!
  );
  await recordLibraryAuditEvent(env, request, auth, actorUserId, {
    action: 'library.resource_pdf_uploaded',
    targetType: 'library_resource',
    targetId: resourceId,
    after: { fileSize: upload.size, resourceType: 'pdf' },
  });
  return json({ ok: true, resource });
}

export async function handleParishLibrary(request: Request, env: LibraryEnv, parishId: string, subpath = '') {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const db = database(env)!;
  if (!db) return missingProductionStoreResponse();
  const parts = String(subpath || '')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
  if (parts.length === 2 && parts[1] === 'file')
    return uploadParishLibraryPdf(request, env, parishId, decodeURIComponent(parts[0]));
  const auth = await requireLibraryAdmin(request, env, parishId);
  if (auth.error) return auth.error;
  const tenantParishId = auth.organizationScope.legacyParishId;
  const createdBy =
    normalizeEmail(auth.found.registration.treasurerEmail || auth.found.registration.priestEmail) ||
    `parish:${tenantParishId}`;
  try {
    if (!parts.length && request.method === 'GET') {
      return json({
        settings: await getParishLibrarySettings(db, tenantParishId),
        resources: await listParishLibraryResources(db, tenantParishId),
      });
    }
    if (!parts.length && request.method === 'POST') {
      const resource = await createParishLibraryResource(db, {
        parishId: tenantParishId,
        createdBy,
        input: await request.json<LibraryResourceInput>(),
      });
      await recordLibraryAuditEvent(env, request, auth, createdBy, {
        action: 'library.resource_created',
        targetType: 'library_resource',
        targetId: resource.id,
        after: { category: resource.category, resourceType: resource.resourceType, status: resource.status },
      });
      return json({ ok: true, resource }, { status: 201 });
    }
    if (parts.length === 1 && parts[0] === 'settings' && request.method === 'GET') {
      return json({ ok: true, settings: await getParishLibrarySettings(db, tenantParishId) });
    }
    if (parts.length === 1 && parts[0] === 'settings' && request.method === 'PATCH') {
      const input = await request.json<LibraryResourceInput>();
      const settings = await setParishLibraryEnabled(db, {
        parishId: tenantParishId,
        enabled: Boolean(input.enabled),
        updatedBy: createdBy,
      });
      await recordLibraryAuditEvent(env, request, auth, createdBy, {
        action: 'library.settings_changed',
        targetType: 'library_settings',
        targetId: tenantParishId,
        after: { enabled: settings.enabled },
      });
      return json({ ok: true, settings });
    }
    if (parts.length === 1 && request.method === 'PATCH') {
      const resourceId = decodeURIComponent(parts[0]);
      const resource = await updateParishLibraryResource(db, {
        parishId: tenantParishId,
        resourceId,
        input: await request.json<LibraryResourceInput>(),
      });
      if (resource) {
        await recordLibraryAuditEvent(env, request, auth, createdBy, {
          action: 'library.resource_updated',
          targetType: 'library_resource',
          targetId: resourceId,
          after: { category: resource.category, resourceType: resource.resourceType, status: resource.status },
        });
      }
      return resource ? json({ ok: true, resource }) : json({ error: 'Resource not found' }, { status: 404 });
    }
    if (parts.length === 1 && request.method === 'DELETE') {
      const resourceId = decodeURIComponent(parts[0]);
      const resource = await deleteParishLibraryResource(db, env.PARISH_LIBRARY_ASSETS, {
        parishId: tenantParishId,
        resourceId,
      });
      if (resource) {
        await recordLibraryAuditEvent(env, request, auth, createdBy, {
          action: 'library.resource_deleted',
          targetType: 'library_resource',
          targetId: resourceId,
          before: { resourceType: resource.resourceType, status: resource.status },
        });
      }
      return resource ? json({ ok: true, resource }) : json({ error: 'Resource not found' }, { status: 404 });
    }
    if (parts.length === 2 && parts[1] === 'archive' && request.method === 'POST') {
      const resourceId = decodeURIComponent(parts[0]);
      const resource = await archiveParishLibraryResource(db, { parishId: tenantParishId, resourceId });
      if (resource) {
        await recordLibraryAuditEvent(env, request, auth, createdBy, {
          action: 'library.resource_archived',
          targetType: 'library_resource',
          targetId: resourceId,
          after: { status: resource.status },
        });
      }
      return resource ? json({ ok: true, resource }) : json({ error: 'Resource not found' }, { status: 404 });
    }
    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    return json({ error: (error as Error).message || 'Unable to update the Parish Library.' }, { status: 422 });
  }
}

export async function handleDonorParishLibrary(request: Request, env: LibraryEnv, subpath = '') {
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const db = database(env)!;
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  const parishId = String(donor.defaultParishId || '').trim();
  if (!parishId) return json({ error: 'Choose a parish before opening its library.' }, { status: 422 });
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return json({ error: 'Your selected parish could not be found.' }, { status: 404 });
  const moduleAccess = evaluateOrganizationModuleAccess(
    found.registration,
    ORGANIZATION_MODULES.LIBRARY,
    hasModuleAccess,
    { organizationId: parishId, registrationReference: found.key }
  );
  if (!moduleAccess.allowed) {
    return json({
      available: false,
      parish: { id: parishId, name: found.registration.parishName || '' },
      resources: [],
    });
  }
  const tenantParishId = moduleAccess.organization!.legacy.parishId;
  const settings = await getParishLibrarySettings(db, tenantParishId);
  if (!settings.enabled) {
    return json({
      available: false,
      parish: { id: parishId, name: found.registration.parishName || '' },
      resources: [],
    });
  }
  const parts = String(subpath || '')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
  if (!parts.length && request.method === 'GET') {
    return json({
      available: true,
      parish: { id: parishId, name: found.registration.parishName || '' },
      resources: await listParishLibraryResources(db, tenantParishId, { publishedOnly: true }),
    });
  }
  if (parts.length === 2 && parts[1] === 'file' && request.method === 'GET') {
    const row = await db
      .prepare(
        `
      SELECT object_key, file_name FROM parish_library_resources
      WHERE id = ? AND parish_id = ? AND resource_type = 'pdf' AND status = 'published'
        AND object_key IS NOT NULL AND (expires_at IS NULL OR expires_at > datetime('now'))
    `
      )
      .bind(decodeURIComponent(parts[0]), tenantParishId)
      .first<LibraryResourceRow>();
    if (!row) return json({ error: 'Published PDF not found' }, { status: 404 });
    if (!env.PARISH_LIBRARY_ASSETS)
      return json({ error: 'Parish Library file storage is not configured.' }, { status: 503 });
    const object = await env.PARISH_LIBRARY_ASSETS.get(row.object_key!);
    if (!object) return json({ error: 'PDF file not found' }, { status: 404 });
    return new Response(object.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${safeFileName(row.file_name)}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
  return json({ error: 'Method not allowed' }, { status: 405 });
}
