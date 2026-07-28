import {
  d1,
  getBearerToken,
  hasProductionStore,
  json,
  missingProductionStoreResponse,
  rateLimit,
  unauthorized,
} from "../lib/core.js";
import {
  attachNonprofitPricingDocument,
  ensureNonprofitPricingApplication,
  getNonprofitPricingApplication,
  getNonprofitPricingApplicationById,
  getNonprofitPricingDocument,
  listNonprofitPricingDocuments,
  listSitewideNonprofitPricing,
  markNonprofitPricingSubmitted,
  NONPROFIT_DOCUMENT_TYPES,
  nonprofitApplicationJson,
  reconcileNonprofitApplicationStatus,
  recordNonprofitPricingDecision,
  saveNonprofitPricingAttestation,
  sendNonprofitThresholdAlerts,
  STRIPE_NONPROFIT_POLICY,
  writeNonprofitPricingAudit,
} from "../lib/nonprofit-pricing.js";
import {
  putNonprofitPricingDocument,
  sanitizeFilename,
  sha256Hex,
  streamNonprofitPricingDocument,
  validateNonprofitPricingUpload,
} from "../lib/nonprofit-pricing-storage.js";
import { summarizeStoredStripeVolume } from "../lib/stripe-volume.js";
import { recordAuditEvent } from "../lib/audit-log.js";
import {
  findRegistrationByParishId,
  requireAdminContext,
  verifyParishDashboardBearer,
} from "./parish.js";

async function requireParishPricingContext(request, env, parishId) {
  const found = await findRegistrationByParishId(env, parishId);
  if (!found) return { error: json({ error: "Parish dashboard record not found" }, { status: 404 }) };
  if (!(await verifyParishDashboardBearer(found.registration, getBearerToken(request)))) {
    return { error: unauthorized() };
  }
  if (!found.registration.stripeAccountId || String(found.registration.stripeAccountId).startsWith("acct_demo_")) {
    return { error: json({ error: "Connect the parish Standard Stripe account before starting an application." }, { status: 409 }) };
  }
  return {
    registration: found.registration,
    registrationReference: found.registration.reference || found.key,
    stripeAccountId: found.registration.stripeAccountId
  };
}

async function applicationPayload(env, parishId, stripeAccountId) {
  let application = await getNonprofitPricingApplication(env, parishId, stripeAccountId);
  const documents = application ? await listNonprofitPricingDocuments(env, application.id) : [];
  const volume = await summarizeStoredStripeVolume(env, parishId);
  if (application) {
    application = await reconcileNonprofitApplicationStatus(env, application, documents, volume);
  }
  return {
    application: nonprofitApplicationJson(application, documents, volume),
    volume,
    policy: STRIPE_NONPROFIT_POLICY
  };
}

export async function handleParishNonprofitPricing(request, env, parishId) {
  const limited = await rateLimit(request, env, "parish-nonprofit-pricing", { limit: 30, windowSeconds: 600 });
  if (limited) return limited;
  if (!hasProductionStore(env) || !d1(env)) return missingProductionStoreResponse();
  const context = await requireParishPricingContext(request, env, parishId);
  if (context.error) return context.error;

  let application = await ensureNonprofitPricingApplication(env, {
    parishId,
    registrationReference: context.registrationReference,
    stripeAccountId: context.stripeAccountId
  });
  if (request.method === "GET") {
    return json(await applicationPayload(env, parishId, context.stripeAccountId));
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = String(body.action || "").trim();
  const volume = await summarizeStoredStripeVolume(env, parishId);
  const actorEmail = String(context.registration.treasurerEmail || context.registration.priestEmail || "").trim();

  try {
    if (action === "save_attestation") {
      await saveNonprofitPricingAttestation(env, {
        application,
        volume,
        name: String(body.name || "").trim().slice(0, 160),
        title: String(body.title || "").trim().slice(0, 160),
        email: actorEmail,
        einLastFour: String(body.einLastFour || "").trim(),
        confirmations: {
          registeredNonprofit: body.registeredNonprofit === true,
          over80Percent: body.over80Percent === true,
          taxDeductibleDonations: body.taxDeductibleDonations === true,
          accountOwnerSubmission: body.accountOwnerSubmission === true
        }
      });
    } else if (action === "mark_submitted") {
      const documents = await listNonprofitPricingDocuments(env, application.id);
      await markNonprofitPricingSubmitted(env, {
        application,
        volume,
        documents,
        stripeSupportCaseId: body.stripeSupportCaseId,
        actorUserId: actorEmail
      });
    } else if (action === "record_decision") {
      const documents = await listNonprofitPricingDocuments(env, application.id);
      if (body.decision === "approved" && !documents.some(document =>
        document.document_type === "stripe_approval" && Boolean(document.is_current))) {
        throw new Error("Upload Stripe's approval message before recording approval.");
      }
      await recordNonprofitPricingDecision(env, {
        application,
        decision: String(body.decision || "").trim(),
        effectiveDate: body.effectiveDate,
        actorUserId: actorEmail
      });
    } else {
      return json({ error: "Unsupported application action" }, { status: 422 });
    }
    return json({ ok: true, ...(await applicationPayload(env, parishId, context.stripeAccountId)) });
  } catch (error) {
    return json({ error: error?.message || "Could not update the application." }, { status: 422 });
  }
}

export async function handleParishNonprofitPricingDocumentUpload(request, env, parishId) {
  const limited = await rateLimit(request, env, "parish-nonprofit-document", { limit: 10, windowSeconds: 600 });
  if (limited) return limited;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  if (!hasProductionStore(env) || !d1(env)) return missingProductionStoreResponse();
  if (!env.NONPROFIT_PRICING_DOCS) {
    return json({ error: "Private nonprofit-document storage is not configured." }, { status: 503 });
  }
  const context = await requireParishPricingContext(request, env, parishId);
  if (context.error) return context.error;
  const application = await ensureNonprofitPricingApplication(env, {
    parishId,
    registrationReference: context.registrationReference,
    stripeAccountId: context.stripeAccountId
  });

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected multipart/form-data." }, { status: 400 });
  }
  const file = form.get("document");
  const documentType = String(form.get("documentType") || "").trim();
  if (!NONPROFIT_DOCUMENT_TYPES.has(documentType)) {
    return json({ error: "Choose a valid document type." }, { status: 422 });
  }
  if (!file || typeof file.arrayBuffer !== "function") {
    return json({ error: "Choose a document to upload." }, { status: 422 });
  }
  const arrayBuffer = await file.arrayBuffer();
  const validation = await validateNonprofitPricingUpload({
    filename: file.name,
    declaredMimeType: file.type,
    arrayBuffer
  });
  if (!validation.ok) return json({ error: validation.error }, { status: 422 });

  const storageKey = await putNonprofitPricingDocument(env, {
    arrayBuffer,
    mimeType: validation.mimeType
  });
  const documentId = await attachNonprofitPricingDocument(env, {
    applicationId: application.id,
    documentType,
    storageKey,
    originalFilename: String(file.name || "document").slice(0, 240),
    sanitizedFilename: sanitizeFilename(file.name),
    mimeType: validation.mimeType,
    fileSize: arrayBuffer.byteLength,
    sha256: await sha256Hex(arrayBuffer),
    uploadedByType: "parish",
    uploadedByUserId: context.registration.treasurerEmail || context.registration.priestEmail || ""
  });
  await writeNonprofitPricingAudit(env, {
    applicationId: application.id,
    parishId,
    action: "document_uploaded",
    actorType: "parish",
    actorUserId: context.registration.treasurerEmail || context.registration.priestEmail || "",
    details: { documentId, documentType }
  });
  return json({ ok: true, documentId }, { status: 201 });
}

export async function handleParishNonprofitPricingDocumentView(request, env, parishId, documentId, mode = "inline") {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const context = await requireParishPricingContext(request, env, parishId);
  if (context.error) return context.error;
  const application = await getNonprofitPricingApplication(env, parishId, context.stripeAccountId);
  if (!application) return json({ error: "Application not found" }, { status: 404 });
  const document = await getNonprofitPricingDocument(env, application.id, documentId);
  if (!document) return json({ error: "Document not found" }, { status: 404 });
  await writeNonprofitPricingAudit(env, {
    applicationId: application.id,
    parishId,
    action: "document_viewed",
    actorType: "parish",
    actorUserId: context.registration.treasurerEmail || context.registration.priestEmail || "",
    details: { documentId }
  });
  return streamNonprofitPricingDocument(env, {
    storageKey: document.storage_key,
    mimeType: document.mime_type,
    sanitizedFilename: document.sanitized_filename,
    mode
  });
}

export async function handleAdminNonprofitPricing(request, env) {
  const limited = await rateLimit(request, env, "admin-nonprofit-pricing", { limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env) || !d1(env)) return missingProductionStoreResponse();
  const admin = await requireAdminContext(request, env);
  if (!admin) return unauthorized();
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const parishes = await listSitewideNonprofitPricing(env);
  return json({
    parishes,
    totals: {
      monitored: parishes.length,
      watch: parishes.filter(parish => parish.risk.riskBand === "watch").length,
      near: parishes.filter(parish => parish.risk.riskBand === "near").length,
      breached: parishes.filter(parish => parish.risk.riskBand === "breached").length,
      indeterminate: parishes.filter(parish => parish.risk.riskBand === "indeterminate").length
    },
    thresholds: { watch: 15, near: 17.5, limit: 20 },
    policy: STRIPE_NONPROFIT_POLICY
  });
}

export async function handleAdminNonprofitPricingAlerts(request, env) {
  const limited = await rateLimit(request, env, "admin-nonprofit-alerts", { limit: 5, windowSeconds: 300 });
  if (limited) return limited;
  if (!hasProductionStore(env) || !d1(env)) return missingProductionStoreResponse();
  const admin = await requireAdminContext(request, env);
  if (!admin) return unauthorized();
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });
  const result = await sendNonprofitThresholdAlerts(env);
  await recordAuditEvent(env, request, {
    action: "nonprofit_pricing.alert_check_run",
    actorUserId: admin.actor,
    targetType: "nonprofit_pricing_thresholds",
    after: { sent: Number(result.sent || 0), status: result.status }
  });
  return json({ ok: true, result });
}

export async function handleAdminNonprofitPricingDocumentView(request, env, applicationId, documentId, mode = "inline") {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });
  const admin = await requireAdminContext(request, env);
  if (!admin) return unauthorized();
  const document = await getNonprofitPricingDocument(env, applicationId, documentId);
  if (!document) return json({ error: "Document not found" }, { status: 404 });
  const application = await getNonprofitPricingApplicationById(env, applicationId);
  await writeNonprofitPricingAudit(env, {
    applicationId,
    parishId: application?.parish_id || "admin-review",
    action: "document_viewed",
    actorType: "admin",
    actorUserId: admin.actor || "",
    details: { documentId }
  });
  return streamNonprofitPricingDocument(env, {
    storageKey: document.storage_key,
    mimeType: document.mime_type,
    sanitizedFilename: document.sanitized_filename,
    mode
  });
}
