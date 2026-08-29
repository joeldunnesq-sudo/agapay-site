import {
  MAX_MULTIPART_BODY_BYTES,
  deleteSacramentDocumentObject,
  putSacramentDocument,
  sacramentDocumentSha256,
  sanitizeSacramentDocumentFilename,
  streamSacramentDocument,
  validateSacramentDocumentUpload
} from "../lib/sacrament-document-storage.js";
import { recordAuditEvent } from "../lib/audit-log.js";
import {
  getBearerToken,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  rateLimit,
  unauthorized
} from "../lib/core.js";
import {
  findRegistrationByParishId,
  hasParishPlusAccess,
  requireDonor,
  sacramentsEnabledFor,
  verifyParishDashboardBearer
} from "./parish.js";
import {
  addPreparationDocument,
  findPreparationDocumentForDonor,
  findPreparationDocumentForParish,
  findPreparationItem,
  finalizePreparationDocumentDeletion,
  findRequestForDonor,
  findRequestForParish,
  findTemplateForParish,
  loadPreparationTemplates,
  loadRequestWithPreparation,
  reviewPreparationDocument,
  reviewPreparationItemForParish,
  savePreparationTemplate,
  softDeletePreparationDocument,
  updatePreparationItemForDonor
} from "../sacraments/preparation.js";

async function requireParishPreparationContext(request, env, parishId) {
  if (!hasProductionStore(env)) return { response: missingProductionStoreResponse() };
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { response: json({ error: "Parish dashboard record not found." }, { status: 404 }) };
  if (!(await verifyParishDashboardBearer(found.registration, getBearerToken(request)))) {
    return { response: unauthorized() };
  }
  if (!sacramentsEnabledFor(found.registration)) {
    return {
      response: json({
        error: hasParishPlusAccess(found.registration)
          ? "Sacraments & Services is coming soon for your parish."
          : "Sacraments & Services requires AGAPAY Parish +."
      }, { status: 402 })
    };
  }
  return { found };
}

function parishActor(registration = {}) {
  return registration.priestEmail || registration.treasurerEmail || registration.email || "parish-dashboard";
}

async function readUpload(request) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return { error: json({ error: "A Content-Length header is required for document uploads." }, { status: 411 }) };
  }
  if (contentLength > MAX_MULTIPART_BODY_BYTES) {
    return { error: json({ error: "The upload exceeds the 10 MB document limit." }, { status: 413 }) };
  }
  let form;
  try { form = await request.formData(); }
  catch { return { error: json({ error: "Expected multipart/form-data with a document file." }, { status: 400 }) }; }
  const file = form.get("document");
  if (!file || typeof file.arrayBuffer !== "function") {
    return { error: json({ error: "Choose a document to upload." }, { status: 422 }) };
  }
  const arrayBuffer = await file.arrayBuffer();
  const validation = validateSacramentDocumentUpload({
    filename: file.name,
    declaredMimeType: file.type,
    arrayBuffer
  });
  if (!validation.ok) return { error: json({ error: validation.error }, { status: 422 }) };
  return {
    file,
    form,
    arrayBuffer,
    mimeType: validation.mimeType,
    sanitizedFilename: sanitizeSacramentDocumentFilename(file.name),
    sha256: await sacramentDocumentSha256(arrayBuffer)
  };
}

async function persistDocument(env, input) {
  const storageKey = await putSacramentDocument(env, {
    parishId: input.parishId,
    arrayBuffer: input.arrayBuffer,
    mimeType: input.mimeType
  });
  try {
    const documentId = await addPreparationDocument(env, { ...input, storageKey });
    return { documentId, storageKey };
  } catch (error) {
    await deleteSacramentDocumentObject(env, storageKey).catch(() => {});
    throw error;
  }
}

async function refreshedRequest(env, row) {
  const request = await loadRequestWithPreparation(env, row);
  return request.preparation;
}

// Routes below /api/parish/dashboard/:parishId/sacraments/.
export async function handleParishSacramentPreparation(request, env, parishId, subpath = "") {
  const limited = await rateLimit(request, env, request.method === "GET" ? "parish-dashboard" : "parish-dashboard-write", {
    limit: request.method === "GET" ? 80 : 40,
    windowSeconds: 300
  });
  if (limited) return limited;
  const context = await requireParishPreparationContext(request, env, parishId);
  if (context.response) return context.response;
  const actor = parishActor(context.found.registration);
  const parts = String(subpath || "").split("/").filter(Boolean).map(decodeURIComponent);

  if (parts[0] === "preparation" && parts[1] === "templates" && parts.length === 2) {
    if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
    const templates = await loadPreparationTemplates(env, parishId);
    return json({ ok: true, templates, documentsConfigured: Boolean(env.SACRAMENT_DOCUMENTS) });
  }

  if (parts[0] === "preparation" && parts[1] === "templates" && parts[2] && parts.length === 3) {
    if (request.method !== "PUT") return json({ error: "Method not allowed" }, { status: 405 });
    let body = {};
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, { status: 400 }); }
    try {
      const template = await savePreparationTemplate(env, parishId, parts[2], body);
      await recordAuditEvent(env, request, {
        action: "sacrament.preparation_template_updated",
        actorType: "parish",
        actorUserId: actor,
        targetType: "sacrament_preparation_template",
        targetId: template.id,
        organizationId: parishId,
        after: { sacramentType: template.sacramentType, version: template.version, itemCount: template.items.length }
      });
      return json({ ok: true, template });
    } catch (error) {
      return json({ error: error?.message || "Unable to save the preparation template." }, { status: 422 });
    }
  }

  if (parts[0] === "preparation" && parts[1] === "templates" && parts[2] && parts[3] === "documents" && parts.length === 4) {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
    if (!env.SACRAMENT_DOCUMENTS) return json({ error: "Sacrament document storage is not configured." }, { status: 503 });
    const template = await findTemplateForParish(env, parishId, parts[2]);
    if (!template) return json({ error: "Preparation template not found." }, { status: 404 });
    const upload = await readUpload(request);
    if (upload.error) return upload.error;
    const displayName = String(upload.form.get("displayName") || upload.sanitizedFilename).trim().slice(0, 180) || upload.sanitizedFilename;
    const stored = await persistDocument(env, {
      parishId,
      templateId: template.id,
      documentRole: "guide",
      uploadedByType: "parish",
      uploadedByEmail: actor,
      displayName,
      originalFilename: upload.file.name,
      sanitizedFilename: upload.sanitizedFilename,
      mimeType: upload.mimeType,
      fileSize: upload.arrayBuffer.byteLength,
      sha256: upload.sha256,
      arrayBuffer: upload.arrayBuffer
    });
    await recordAuditEvent(env, request, {
      action: "sacrament.preparation_guide_uploaded",
      actorType: "parish",
      actorUserId: actor,
      targetType: "sacrament_preparation_document",
      targetId: stored.documentId,
      organizationId: parishId,
      metadata: { sacramentType: parts[2], mimeType: upload.mimeType, fileSize: upload.arrayBuffer.byteLength }
    });
    const templates = await loadPreparationTemplates(env, parishId);
    return json({ ok: true, documentId: stored.documentId, templates }, { status: 201 });
  }

  if (parts[0] === "preparation" && parts[1] === "documents" && parts[2] && parts.length === 3) {
    const document = await findPreparationDocumentForParish(env, parishId, parts[2]);
    if (!document || document.document_role !== "guide") return json({ error: "Document not found." }, { status: 404 });
    if (request.method === "GET") {
      await recordAuditEvent(env, request, {
        action: "sacrament.preparation_document_viewed",
        actorType: "parish", actorUserId: actor, targetType: "sacrament_preparation_document",
        targetId: document.id, organizationId: parishId
      });
      return streamSacramentDocument(env, {
        storageKey: document.storage_key,
        mimeType: document.mime_type,
        filename: document.sanitized_filename,
        download: new URL(request.url).searchParams.get("download") === "1"
      });
    }
    if (request.method === "DELETE") {
      const deleted = await softDeletePreparationDocument(env, document.id);
      await deleteSacramentDocumentObject(env, deleted.storage_key);
      await finalizePreparationDocumentDeletion(env, document.id);
      await recordAuditEvent(env, request, {
        action: "sacrament.preparation_document_deleted",
        actorType: "parish", actorUserId: actor, targetType: "sacrament_preparation_document",
        targetId: document.id, organizationId: parishId
      });
      return json({ ok: true });
    }
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const requestId = parts[0] || "";
  const requestRow = requestId ? await findRequestForParish(env, requestId, parishId) : null;
  if (!requestRow) return json({ error: "Sacrament request not found." }, { status: 404 });

  if (parts[1] === "preparation" && parts[2] === "items" && parts[3] && parts.length === 4) {
    if (request.method !== "PATCH") return json({ error: "Method not allowed" }, { status: 405 });
    let body = {};
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, { status: 400 }); }
    const result = await reviewPreparationItemForParish(env, {
      parishId, requestId, itemId: parts[3], status: String(body.status || ""),
      reviewerNote: body.reviewerNote, reviewer: actor
    });
    if (result.error) return json({ error: result.error }, { status: result.status });
    await recordAuditEvent(env, request, {
      action: "sacrament.preparation_item_reviewed",
      actorType: "parish", actorUserId: actor, targetType: "sacrament_preparation_request_item",
      targetId: parts[3], organizationId: parishId, after: { status: body.status }
    });
    return json({ ok: true, preparation: await refreshedRequest(env, requestRow) });
  }

  if (parts[1] === "preparation" && parts[2] === "documents" && parts[3] && parts.length === 4) {
    const document = await findPreparationDocumentForParish(env, parishId, parts[3]);
    if (!document || document.request_id !== requestId) return json({ error: "Document not found." }, { status: 404 });
    if (request.method === "GET") {
      await recordAuditEvent(env, request, {
        action: "sacrament.preparation_document_viewed",
        actorType: "parish", actorUserId: actor, targetType: "sacrament_preparation_document",
        targetId: document.id, organizationId: parishId
      });
      return streamSacramentDocument(env, {
        storageKey: document.storage_key, mimeType: document.mime_type,
        filename: document.sanitized_filename, download: new URL(request.url).searchParams.get("download") === "1"
      });
    }
    if (request.method === "PATCH") {
      let body = {};
      try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, { status: 400 }); }
      const result = await reviewPreparationDocument(env, {
        parishId, requestId, documentId: document.id, reviewStatus: String(body.reviewStatus || ""),
        reviewerNote: body.reviewerNote, reviewer: actor
      });
      if (result.error) return json({ error: result.error }, { status: result.status });
      await recordAuditEvent(env, request, {
        action: "sacrament.preparation_document_reviewed",
        actorType: "parish", actorUserId: actor, targetType: "sacrament_preparation_document",
        targetId: document.id, organizationId: parishId, after: { reviewStatus: body.reviewStatus }
      });
      return json({ ok: true, preparation: await refreshedRequest(env, requestRow) });
    }
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  return json({ error: "Preparation route not found." }, { status: 404 });
}

// Routes below /api/donor/sacraments/.
export async function handleDonorSacramentPreparation(request, env, subpath = "") {
  const donor = await requireDonor(request, env);
  if (!donor) return unauthorized();
  if (!hasProductionStore(env)) return missingProductionStoreResponse();
  const limited = await rateLimit(request, env, "donor-sacrament-preparation", { limit: 30, windowSeconds: 600 });
  if (limited) return limited;
  const parts = String(subpath || "").split("/").filter(Boolean).map(decodeURIComponent);
  const requestId = parts[0] || "";
  const requestRow = await findRequestForDonor(env, requestId, donor.email);
  if (!requestRow) return json({ error: "Sacrament request not found." }, { status: 404 });

  if (parts[1] === "preparation" && parts[2] === "items" && parts[3] && parts.length === 4) {
    if (request.method !== "PATCH") return json({ error: "Method not allowed" }, { status: 405 });
    let body = {};
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON body." }, { status: 400 }); }
    const result = await updatePreparationItemForDonor(env, {
      requestId, itemId: parts[3], donorEmail: donor.email,
      completed: body.completed, note: body.note
    });
    if (result.error) return json({ error: result.error }, { status: result.status });
    await recordAuditEvent(env, request, {
      action: "sacrament.preparation_item_updated",
      actorType: "donor", actorUserId: donor.email, targetType: "sacrament_preparation_request_item",
      targetId: parts[3], organizationId: requestRow.parish_id, after: { completed: Boolean(body.completed) }
    });
    return json({ ok: true, preparation: await refreshedRequest(env, requestRow) });
  }

  if (parts[1] === "preparation" && parts[2] === "items" && parts[3] && parts[4] === "documents" && parts.length === 5) {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
    if (!env.SACRAMENT_DOCUMENTS) return json({ error: "Sacrament document storage is not configured." }, { status: 503 });
    if (["completed", "declined", "cancelled"].includes(requestRow.status)) {
      return json({ error: "This preparation plan can no longer be changed." }, { status: 409 });
    }
    const item = await findPreparationItem(env, requestId, parts[3]);
    if (!item || item.item_type !== "document") return json({ error: "This step does not accept documents." }, { status: 422 });
    const upload = await readUpload(request);
    if (upload.error) return upload.error;
    const displayName = String(upload.form.get("displayName") || item.title || upload.sanitizedFilename).trim().slice(0, 180);
    const stored = await persistDocument(env, {
      parishId: requestRow.parish_id,
      requestId,
      requestItemId: item.id,
      documentRole: "supporting",
      uploadedByType: "donor",
      uploadedByEmail: donor.email,
      displayName,
      originalFilename: upload.file.name,
      sanitizedFilename: upload.sanitizedFilename,
      mimeType: upload.mimeType,
      fileSize: upload.arrayBuffer.byteLength,
      sha256: upload.sha256,
      arrayBuffer: upload.arrayBuffer
    });
    await recordAuditEvent(env, request, {
      action: "sacrament.preparation_document_uploaded",
      actorType: "donor", actorUserId: donor.email, targetType: "sacrament_preparation_document",
      targetId: stored.documentId, organizationId: requestRow.parish_id,
      metadata: { requestId, itemId: item.id, mimeType: upload.mimeType, fileSize: upload.arrayBuffer.byteLength }
    });
    return json({ ok: true, documentId: stored.documentId, preparation: await refreshedRequest(env, requestRow) }, { status: 201 });
  }

  if (parts[1] === "preparation" && parts[2] === "documents" && parts[3] && parts.length === 4) {
    const document = await findPreparationDocumentForDonor(env, requestId, donor.email, parts[3]);
    if (!document) return json({ error: "Document not found." }, { status: 404 });
    if (request.method === "GET") {
      await recordAuditEvent(env, request, {
        action: "sacrament.preparation_document_viewed",
        actorType: "donor", actorUserId: donor.email, targetType: "sacrament_preparation_document",
        targetId: document.id, organizationId: requestRow.parish_id
      });
      return streamSacramentDocument(env, {
        storageKey: document.storage_key, mimeType: document.mime_type,
        filename: document.sanitized_filename, download: new URL(request.url).searchParams.get("download") === "1"
      });
    }
    if (request.method === "DELETE" && document.document_role === "supporting" && document.uploaded_by_type === "donor") {
      if (document.review_status === "accepted") return json({ error: "An accepted document cannot be removed. Contact your parish." }, { status: 409 });
      const deleted = await softDeletePreparationDocument(env, document.id);
      await deleteSacramentDocumentObject(env, deleted.storage_key);
      await finalizePreparationDocumentDeletion(env, document.id);
      await recordAuditEvent(env, request, {
        action: "sacrament.preparation_document_deleted",
        actorType: "donor", actorUserId: donor.email, targetType: "sacrament_preparation_document",
        targetId: document.id, organizationId: requestRow.parish_id
      });
      return json({ ok: true, preparation: await refreshedRequest(env, requestRow) });
    }
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  return json({ error: "Preparation route not found." }, { status: 404 });
}
