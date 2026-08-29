import { d1All, d1Batch, d1First, d1Run, generateSecret, normalizeEmail } from "../lib/core.js";

export const PREPARATION_SACRAMENT_TYPES = new Set(["baptism", "wedding"]);
export const PREPARATION_ITEM_TYPES = new Set(["information", "confirmation", "document", "clergy_review"]);
export const PREPARATION_REVIEW_STATUSES = new Set(["pending", "approved", "needs_attention", "waived"]);

const PARISH_REQUIREMENTS_NOTICE = "These preparation steps are established by your parish under its clergy's direction. Requirements may vary by parish, diocese, and jurisdiction.";

const DEFAULT_TEMPLATES = {
  baptism: {
    title: "Baptism & Chrismation Preparation",
    introduction: "Use this guide to prepare with your parish. Your priest will confirm which steps apply to the candidate and family.",
    canonicalNote: "Godparent eligibility, catechesis, reception, and service timing are reviewed pastorally by the parish.",
    items: [
      { title: "Review the parish preparation guide", description: "Read any parish guides below and bring questions to the pastoral meeting.", itemType: "information", required: true },
      { title: "Meet with the priest", description: "Arrange the preparation or catechesis conversation requested by the parish.", itemType: "clergy_review", required: true },
      { title: "Confirm candidate and family information", description: "Verify names, date of birth, parents, patron saint, and other details with the parish.", itemType: "confirmation", required: true },
      { title: "Provide godparent standing documentation", description: "Upload the letter or other confirmation requested by the parish for each godparent.", itemType: "document", required: true },
      { title: "Provide any requested civil record", description: "Upload a birth certificate or other civil record only when your parish requests it.", itemType: "document", required: false },
      { title: "Prepare service items", description: "Confirm the cross, baptismal garment, candle, towel, and any parish-specific items.", itemType: "confirmation", required: false }
    ]
  },
  wedding: {
    title: "Wedding Preparation",
    introduction: "Use this guide to prepare with your parish. Your priest will confirm eligibility, counseling, paperwork, and the service date.",
    canonicalNote: "Ecclesiastical eligibility, prior marriages, sponsors, fasting periods, and permitted dates require pastoral review by the parish.",
    items: [
      { title: "Meet with the priest", description: "Complete the initial pastoral meeting and the premarital preparation assigned by the parish.", itemType: "clergy_review", required: true },
      { title: "Complete premarital counseling", description: "The parish will confirm completion of its counseling or formation process.", itemType: "clergy_review", required: true },
      { title: "Provide sacramental records", description: "Upload baptism, chrismation, or reception records requested for either party.", itemType: "document", required: true },
      { title: "Complete prior-marriage review", description: "Provide the ecclesiastical or civil records requested when either party was previously married.", itemType: "document", required: false },
      { title: "Provide sponsor standing documentation", description: "Upload the confirmation requested by the parish for the koumbaro or sponsor.", itemType: "document", required: true },
      { title: "Provide the civil marriage license", description: "Upload or present the civil license according to the parish's instructions.", itemType: "document", required: true },
      { title: "Confirm the permitted service date", description: "The parish will review fasting seasons, feast days, and other date restrictions before confirming the wedding.", itemType: "clergy_review", required: true }
    ]
  }
};

function cleanText(value, max = 2000) {
  return String(value || "").trim().slice(0, max);
}

function placeholders(values) {
  return values.map(() => "?").join(",");
}

async function d1AllInChunks(env, values, sqlForChunk, chunkSize = 90) {
  const rows = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    const chunk = values.slice(index, index + chunkSize);
    rows.push(...await d1All(env, sqlForChunk(placeholders(chunk)), ...chunk));
  }
  return rows;
}

function documentDto(row = {}) {
  return {
    id: row.id,
    documentRole: row.document_role,
    uploadedByType: row.uploaded_by_type,
    displayName: row.display_name,
    filename: row.sanitized_filename,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size || 0),
    reviewStatus: row.review_status,
    reviewerNote: row.reviewer_note || "",
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at || ""
  };
}

function templateDto(template, items, documents) {
  return {
    id: template.id,
    parishId: template.parish_id,
    sacramentType: template.sacrament_type,
    title: template.title,
    introduction: template.introduction || "",
    canonicalNote: template.canonical_note || "",
    requirementsNotice: PARISH_REQUIREMENTS_NOTICE,
    version: Number(template.version || 1),
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description || "",
      itemType: item.item_type,
      required: Boolean(item.required),
      sortOrder: Number(item.sort_order || 0)
    })),
    guides: documents.map(documentDto)
  };
}

export async function ensureDefaultPreparationTemplates(env, parishId) {
  const existing = await d1All(env,
    "SELECT id, sacrament_type FROM sacrament_preparation_templates WHERE parish_id = ?",
    parishId
  );
  const existingTypes = new Set(existing.map((row) => row.sacrament_type));
  for (const sacramentType of PREPARATION_SACRAMENT_TYPES) {
    if (existingTypes.has(sacramentType)) continue;
    const definition = DEFAULT_TEMPLATES[sacramentType];
    const templateId = generateSecret("sacprep");
    const statements = [{
      sql: `
        INSERT INTO sacrament_preparation_templates
          (id, parish_id, sacrament_type, title, introduction, canonical_note, version, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, 1, datetime('now'), datetime('now'))
      `,
      params: [templateId, parishId, sacramentType, definition.title, definition.introduction, definition.canonicalNote]
    }];
    for (let index = 0; index < definition.items.length; index += 1) {
      const item = definition.items[index];
      statements.push({
        sql: `
          INSERT INTO sacrament_preparation_template_items
            (id, template_id, title, description, item_type, required, sort_order, active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
        `,
        params: [generateSecret("sacprepi"), templateId, item.title, item.description, item.itemType, item.required ? 1 : 0, index]
      });
    }
    try {
      await d1Batch(env, statements);
    } catch (error) {
      if (!/UNIQUE constraint failed/i.test(String(error?.message || error || ""))) throw error;
    }
  }
}

export async function loadPreparationTemplates(env, parishId) {
  await ensureDefaultPreparationTemplates(env, parishId);
  const templates = await d1All(env, `
    SELECT * FROM sacrament_preparation_templates
    WHERE parish_id = ? AND active = 1
    ORDER BY CASE sacrament_type WHEN 'baptism' THEN 0 ELSE 1 END
  `, parishId);
  if (!templates.length) return [];
  const ids = templates.map((row) => row.id);
  const items = await d1All(env, `
    SELECT * FROM sacrament_preparation_template_items
    WHERE template_id IN (${placeholders(ids)}) AND active = 1
    ORDER BY sort_order, created_at
  `, ...ids);
  const documents = await d1All(env, `
    SELECT * FROM sacrament_preparation_documents
    WHERE template_id IN (${placeholders(ids)}) AND document_role = 'guide' AND deleted_at IS NULL
    ORDER BY created_at
  `, ...ids);
  return templates.map((template) => templateDto(
    template,
    items.filter((item) => item.template_id === template.id),
    documents.filter((document) => document.template_id === template.id)
  ));
}

export async function savePreparationTemplate(env, parishId, sacramentType, input = {}) {
  if (!PREPARATION_SACRAMENT_TYPES.has(sacramentType)) throw new Error("Choose Baptism or Wedding.");
  await ensureDefaultPreparationTemplates(env, parishId);
  const template = await d1First(env,
    "SELECT * FROM sacrament_preparation_templates WHERE parish_id = ? AND sacrament_type = ?",
    parishId, sacramentType
  );
  if (!template) throw new Error("Preparation template not found.");
  const title = cleanText(input.title, 160);
  if (!title) throw new Error("Template title is required.");
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 30) {
    throw new Error("Add between 1 and 30 preparation steps.");
  }
  const existing = await d1All(env,
    "SELECT * FROM sacrament_preparation_template_items WHERE template_id = ?",
    template.id
  );
  const existingById = new Map(existing.map((item) => [item.id, item]));
  const normalizedItems = input.items.map((submittedItem, index) => {
    const submitted = submittedItem || {};
    const itemTitle = cleanText(submitted.title, 180);
    const itemType = cleanText(submitted.itemType, 30);
    if (!itemTitle) throw new Error(`Preparation step ${index + 1} needs a title.`);
    if (!PREPARATION_ITEM_TYPES.has(itemType)) throw new Error(`Preparation step ${index + 1} has an invalid type.`);
    const submittedId = cleanText(submitted.id, 120);
    return {
      id: existingById.has(submittedId) ? submittedId : generateSecret("sacprepi"),
      title: itemTitle,
      description: cleanText(submitted.description, 1200) || null,
      itemType,
      required: submitted.required === false ? 0 : 1,
      sortOrder: index
    };
  });
  const keptIds = normalizedItems.map((item) => item.id);
  const statements = [];
  for (const item of normalizedItems) {
    if (existingById.has(item.id)) {
      statements.push({ sql: `
        UPDATE sacrament_preparation_template_items
        SET title = ?, description = ?, item_type = ?, required = ?, sort_order = ?, active = 1, updated_at = datetime('now')
        WHERE id = ? AND template_id = ?
      `, params: [item.title, item.description, item.itemType, item.required, item.sortOrder, item.id, template.id] });
    } else {
      statements.push({ sql: `
        INSERT INTO sacrament_preparation_template_items
          (id, template_id, title, description, item_type, required, sort_order, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `, params: [item.id, template.id, item.title, item.description, item.itemType, item.required, item.sortOrder] });
    }
  }
  const omitted = existing.filter((item) => !keptIds.includes(item.id)).map((item) => item.id);
  if (omitted.length) {
    statements.push({ sql: `
      UPDATE sacrament_preparation_template_items SET active = 0, updated_at = datetime('now')
      WHERE template_id = ? AND id IN (${placeholders(omitted)})
    `, params: [template.id, ...omitted] });
  }
  statements.push({ sql: `
    UPDATE sacrament_preparation_templates
    SET title = ?, introduction = ?, canonical_note = ?, version = version + 1, updated_at = datetime('now')
    WHERE id = ? AND parish_id = ?
  `, params: [title, cleanText(input.introduction, 2400) || null, cleanText(input.canonicalNote, 2400) || null, template.id, parishId] });
  await d1Batch(env, statements);
  const templates = await loadPreparationTemplates(env, parishId);
  return templates.find((item) => item.sacramentType === sacramentType);
}

export async function createRequestPreparationSnapshot(env, { requestId, parishId, sacramentType }) {
  if (!PREPARATION_SACRAMENT_TYPES.has(sacramentType)) return null;
  const existing = await d1First(env,
    "SELECT request_id FROM sacrament_preparation_request_plans WHERE request_id = ?",
    requestId
  );
  if (existing) return existing;
  await ensureDefaultPreparationTemplates(env, parishId);
  const template = await d1First(env, `
    SELECT * FROM sacrament_preparation_templates
    WHERE parish_id = ? AND sacrament_type = ? AND active = 1
  `, parishId, sacramentType);
  if (!template) return null;
  const items = await d1All(env, `
    SELECT * FROM sacrament_preparation_template_items
    WHERE template_id = ? AND active = 1 ORDER BY sort_order, created_at
  `, template.id);
  const statements = [{
    sql: `
      INSERT INTO sacrament_preparation_request_plans
        (request_id, parish_id, sacrament_type, source_template_id, source_template_version, title, introduction, canonical_note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `,
    params: [requestId, parishId, sacramentType, template.id, Number(template.version || 1), template.title, template.introduction || null, template.canonical_note || null]
  }];
  for (const item of items) {
    statements.push({
      sql: `
        INSERT INTO sacrament_preparation_request_items
          (id, request_id, source_template_item_id, title, description, item_type, required, sort_order, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
      `,
      params: [generateSecret("sacreqi"), requestId, item.id, item.title, item.description || null, item.item_type, item.required ? 1 : 0, Number(item.sort_order || 0)]
    });
  }
  try {
    await d1Batch(env, statements);
  } catch (error) {
    if (!/UNIQUE constraint failed/i.test(String(error?.message || error || ""))) throw error;
    return d1First(env, "SELECT request_id FROM sacrament_preparation_request_plans WHERE request_id = ?", requestId);
  }
  return { request_id: requestId };
}

function preparationProgress(items) {
  const required = items.filter((item) => item.required);
  const isDone = (item) => ["completed", "approved", "waived"].includes(item.status);
  const completed = required.filter(isDone).length;
  return {
    completed,
    total: required.length,
    percent: required.length ? Math.round((completed / required.length) * 100) : 100,
    complete: completed === required.length
  };
}

export async function attachPreparationToRequests(env, rows = []) {
  const eligible = rows.filter((row) => PREPARATION_SACRAMENT_TYPES.has(row.sacrament_type || row.sacramentType));
  if (!eligible.length) return rows.map((row) => ({ ...row, preparation: null }));
  const requestIds = eligible.map((row) => row.id);
  const existingPlans = await d1AllInChunks(env, requestIds, (params) => `
    SELECT request_id FROM sacrament_preparation_request_plans WHERE request_id IN (${params})
  `);
  const existingRequestIds = new Set(existingPlans.map((plan) => plan.request_id));
  const activeStatuses = new Set(["requested", "acknowledged", "scheduled"]);
  for (const row of eligible.filter((item) => activeStatuses.has(item.status) && !existingRequestIds.has(item.id))) {
    await createRequestPreparationSnapshot(env, {
      requestId: row.id,
      parishId: row.parish_id || row.parishId,
      sacramentType: row.sacrament_type || row.sacramentType
    });
  }
  const plans = await d1AllInChunks(env, requestIds, (params) => `
    SELECT * FROM sacrament_preparation_request_plans WHERE request_id IN (${params})
  `);
  const items = await d1AllInChunks(env, requestIds, (params) => `
    SELECT * FROM sacrament_preparation_request_items
    WHERE request_id IN (${params}) ORDER BY sort_order, created_at
  `);
  const documents = await d1AllInChunks(env, requestIds, (params) => `
    SELECT * FROM sacrament_preparation_documents
    WHERE request_id IN (${params}) AND deleted_at IS NULL ORDER BY created_at
  `);
  const templateIds = [...new Set(plans.map((plan) => plan.source_template_id).filter(Boolean))];
  const guides = templateIds.length ? await d1AllInChunks(env, templateIds, (params) => `
    SELECT * FROM sacrament_preparation_documents
    WHERE template_id IN (${params}) AND document_role = 'guide' AND deleted_at IS NULL
    ORDER BY created_at
  `) : [];
  const byRequest = new Map();
  for (const plan of plans) {
    const planItems = items.filter((item) => item.request_id === plan.request_id).map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description || "",
      itemType: item.item_type,
      required: Boolean(item.required),
      sortOrder: Number(item.sort_order || 0),
      status: item.status,
      parishionerNote: item.parishioner_note || "",
      reviewerNote: item.reviewer_note || "",
      completedAt: item.completed_at || "",
      reviewedAt: item.reviewed_at || "",
      documents: documents.filter((document) => document.request_item_id === item.id).map(documentDto)
    }));
    byRequest.set(plan.request_id, {
      title: plan.title,
      introduction: plan.introduction || "",
      canonicalNote: plan.canonical_note || "",
      requirementsNotice: PARISH_REQUIREMENTS_NOTICE,
      sourceTemplateVersion: Number(plan.source_template_version || 1),
      progress: preparationProgress(planItems),
      items: planItems,
      guides: guides.filter((guide) => guide.template_id === plan.source_template_id).map(documentDto)
    });
  }
  return rows.map((row) => ({ ...row, preparation: byRequest.get(row.id) || null }));
}

export async function updatePreparationItemForDonor(env, { requestId, itemId, donorEmail, completed, note }) {
  const item = await d1First(env, `
    SELECT i.*, r.donor_email, r.status AS request_status
    FROM sacrament_preparation_request_items i
    JOIN sacrament_requests r ON r.id = i.request_id
    WHERE i.id = ? AND i.request_id = ? AND r.donor_email = ?
  `, itemId, requestId, normalizeEmail(donorEmail));
  if (!item) return { error: "Preparation step not found.", status: 404 };
  if (["completed", "declined", "cancelled"].includes(item.request_status)) {
    return { error: "This preparation plan can no longer be changed.", status: 409 };
  }
  let nextStatus = item.status;
  if (["information", "confirmation"].includes(item.item_type)) {
    if (typeof completed !== "boolean") return { error: "Choose whether this step is complete.", status: 422 };
    nextStatus = completed ? "completed" : "pending";
  }
  if (item.item_type === "clergy_review" && completed !== undefined) {
    return { error: "This step is completed by your parish.", status: 422 };
  }
  await d1Run(env, `
    UPDATE sacrament_preparation_request_items
    SET status = ?, parishioner_note = ?, completed_at = ?, updated_at = datetime('now')
    WHERE id = ? AND request_id = ?
  `, nextStatus, cleanText(note, 1000) || null, nextStatus === "completed" ? new Date().toISOString() : null, itemId, requestId);
  return { ok: true };
}

export async function reviewPreparationItemForParish(env, { parishId, requestId, itemId, status, reviewerNote, reviewer }) {
  if (!PREPARATION_REVIEW_STATUSES.has(status)) return { error: "Choose a valid review status.", status: 422 };
  const item = await d1First(env, `
    SELECT i.* FROM sacrament_preparation_request_items i
    JOIN sacrament_requests r ON r.id = i.request_id
    WHERE i.id = ? AND i.request_id = ? AND r.parish_id = ?
  `, itemId, requestId, parishId);
  if (!item) return { error: "Preparation step not found.", status: 404 };
  await d1Run(env, `
    UPDATE sacrament_preparation_request_items
    SET status = ?, reviewer_note = ?, reviewed_at = ?, reviewed_by = ?, updated_at = datetime('now')
    WHERE id = ? AND request_id = ?
  `, status, cleanText(reviewerNote, 1000) || null, status === "pending" ? null : new Date().toISOString(), cleanText(reviewer, 180) || null, itemId, requestId);
  return { ok: true };
}

export async function findRequestForDonor(env, requestId, donorEmail) {
  return d1First(env,
    "SELECT * FROM sacrament_requests WHERE id = ? AND donor_email = ?",
    requestId, normalizeEmail(donorEmail)
  );
}

export async function findRequestForParish(env, requestId, parishId) {
  return d1First(env,
    "SELECT * FROM sacrament_requests WHERE id = ? AND parish_id = ?",
    requestId, parishId
  );
}

export async function findPreparationItem(env, requestId, itemId) {
  return d1First(env,
    "SELECT * FROM sacrament_preparation_request_items WHERE id = ? AND request_id = ?",
    itemId, requestId
  );
}

export async function addPreparationDocument(env, input) {
  const id = generateSecret("sacdoc");
  const statements = [{
    sql: `
      INSERT INTO sacrament_preparation_documents
        (id, parish_id, template_id, request_id, request_item_id, document_role,
         uploaded_by_type, uploaded_by_email, display_name, storage_key,
         original_filename, sanitized_filename, mime_type, file_size, sha256,
         review_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `,
    params: [
      id, input.parishId, input.templateId || null, input.requestId || null, input.requestItemId || null,
      input.documentRole, input.uploadedByType, cleanText(input.uploadedByEmail, 180) || null,
      cleanText(input.displayName, 180), input.storageKey, cleanText(input.originalFilename, 180),
      cleanText(input.sanitizedFilename, 180), input.mimeType, Number(input.fileSize), input.sha256,
      input.documentRole === "supporting" ? "pending" : "not_required"
    ]
  }];
  if (input.requestItemId) {
    statements.push({ sql: `
      UPDATE sacrament_preparation_request_items
      SET status = CASE WHEN status = 'approved' THEN status ELSE 'submitted' END,
          updated_at = datetime('now')
      WHERE id = ? AND request_id = ?
    `, params: [input.requestItemId, input.requestId] });
  }
  await d1Batch(env, statements);
  return id;
}

export async function findTemplateForParish(env, parishId, sacramentType) {
  await ensureDefaultPreparationTemplates(env, parishId);
  return d1First(env, `
    SELECT * FROM sacrament_preparation_templates
    WHERE parish_id = ? AND sacrament_type = ? AND active = 1
  `, parishId, sacramentType);
}

export async function findPreparationDocumentForParish(env, parishId, documentId) {
  return d1First(env, `
    SELECT * FROM sacrament_preparation_documents
    WHERE id = ? AND parish_id = ? AND deleted_at IS NULL
  `, documentId, parishId);
}

export async function findPreparationDocumentForDonor(env, requestId, donorEmail, documentId) {
  return d1First(env, `
    SELECT d.* FROM sacrament_preparation_documents d
    JOIN sacrament_requests r ON r.id = ? AND r.donor_email = ?
    LEFT JOIN sacrament_preparation_request_plans p ON p.request_id = r.id
    WHERE d.id = ? AND d.deleted_at IS NULL
      AND ((d.request_id = r.id) OR (d.template_id = p.source_template_id AND d.document_role = 'guide'))
  `, requestId, normalizeEmail(donorEmail), documentId);
}

export async function reviewPreparationDocument(env, { parishId, requestId, documentId, reviewStatus, reviewerNote, reviewer }) {
  if (!["accepted", "rejected"].includes(reviewStatus)) return { error: "Choose accepted or rejected.", status: 422 };
  const document = await d1First(env, `
    SELECT d.* FROM sacrament_preparation_documents d
    JOIN sacrament_requests r ON r.id = d.request_id
    WHERE d.id = ? AND d.request_id = ? AND r.parish_id = ? AND d.document_role = 'supporting' AND d.deleted_at IS NULL
  `, documentId, requestId, parishId);
  if (!document) return { error: "Document not found.", status: 404 };
  const now = new Date().toISOString();
  const cleanedNote = cleanText(reviewerNote, 1000) || null;
  const cleanedReviewer = cleanText(reviewer, 180) || null;
  await d1Batch(env, [{
    sql: `
      UPDATE sacrament_preparation_documents
      SET review_status = ?, reviewer_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?
    `,
    params: [reviewStatus, cleanedNote, cleanedReviewer, now, documentId]
  }, {
    sql: `
      UPDATE sacrament_preparation_request_items
      SET status = CASE
            WHEN EXISTS (
              SELECT 1 FROM sacrament_preparation_documents
              WHERE request_item_id = ? AND review_status = 'accepted' AND deleted_at IS NULL
            ) THEN 'approved'
            ELSE 'needs_attention'
          END,
          reviewer_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = datetime('now')
      WHERE id = ? AND request_id = ?
    `,
    params: [document.request_item_id, cleanedNote, cleanedReviewer, now, document.request_item_id, requestId]
  }]);
  return { ok: true, document };
}

export async function softDeletePreparationDocument(env, documentId) {
  const document = await d1First(env,
    "SELECT * FROM sacrament_preparation_documents WHERE id = ? AND deleted_at IS NULL",
    documentId
  );
  if (!document) return null;
  const statements = [{
    sql: "UPDATE sacrament_preparation_documents SET deleted_at = datetime('now') WHERE id = ?",
    params: [documentId]
  }];
  if (document.request_item_id) {
    statements.push({ sql: `
        UPDATE sacrament_preparation_request_items
        SET status = 'pending', reviewed_at = NULL, reviewed_by = NULL, updated_at = datetime('now')
        WHERE id = ? AND NOT EXISTS (
          SELECT 1 FROM sacrament_preparation_documents
          WHERE request_item_id = ? AND deleted_at IS NULL
        )
      `, params: [document.request_item_id, document.request_item_id] });
  }
  await d1Batch(env, statements);
  return document;
}

export async function finalizePreparationDocumentDeletion(env, documentId) {
  await d1Run(env, "DELETE FROM sacrament_preparation_documents WHERE id = ? AND deleted_at IS NOT NULL", documentId);
}

export async function loadRequestWithPreparation(env, requestRow) {
  const [attached] = await attachPreparationToRequests(env, [requestRow]);
  return attached;
}
