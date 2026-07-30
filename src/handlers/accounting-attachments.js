import { json, rateLimit } from "../lib/core.js";
import {
  deleteAccountingAttachment,
  putAccountingAttachment,
  sanitizeFilename,
  sha256Hex,
  streamAccountingAttachment,
  validateAccountingAttachmentUpload
} from "../lib/accounting-attachment-storage.js";
import { deleteAttachment, listAttachments, recordAttachment } from "../accounting/index.js";
import { accountingContext } from "./accounting-ledger.js";

const HEADERS = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", Vary: "Authorization" };
const reply = (payload, status = 200) => json(payload, { status, headers: HEADERS });

export async function handleAccountingAttachments(request, env, parishId) {
  const url = new URL(request.url);
  const base = `/api/parish/dashboard/${encodeURIComponent(parishId)}/accounting`;
  if (!url.pathname.startsWith(base)) return null;
  const path = url.pathname.slice(base.length);
  if (!path.startsWith("/attachments")) return null;
  const downloadMatch = path.match(/^\/attachments\/([^/]+)\/download$/);
  const deleteMatch = path.match(/^\/attachments\/([^/]+)$/);
  const capability = request.method === "GET" ? "accounting.attachments.view" : "accounting.attachments.manage";
  let storageKey = "";
  try {
    const ctx = await accountingContext(request, env, parishId, capability);
    if (!ctx) return reply({ error: "Unauthorized" }, 401);
    if (ctx.error) return ctx.error;

    if (request.method === "GET" && path === "/attachments") {
      const entityType = url.searchParams.get("entityType") || "";
      const entityId = url.searchParams.get("entityId") || "";
      return reply({ ok: true, attachments: await listAttachments(ctx.db, { actor: ctx.actor, entitlementTier: ctx.tier, entityType, entityId }) });
    }

    if (request.method === "POST" && path === "/attachments/upload") {
      const limited = await rateLimit(request, env, "accounting-attachment-upload", { limit: 20, windowSeconds: 3600 });
      if (limited) return limited;
      let form;
      try {
        form = await request.formData();
      } catch {
        return reply({ error: "Expected multipart/form-data with a 'file' field." }, 400);
      }
      const file = form.get("file");
      if (!file || typeof file.arrayBuffer !== "function") return reply({ error: "No attachment file was included." }, 422);
      const arrayBuffer = await file.arrayBuffer();
      const validation = await validateAccountingAttachmentUpload({ filename: file.name, declaredMimeType: file.type, arrayBuffer });
      if (!validation.ok) return reply({ error: validation.error }, 422);
      storageKey = await putAccountingAttachment(env, { arrayBuffer, mimeType: validation.mimeType });
      try {
        const attachment = await recordAttachment(ctx.db, {
          actor: ctx.actor,
          entitlementTier: ctx.tier,
          entityType: String(form.get("entityType") || ""),
          entityId: String(form.get("entityId") || ""),
          displayName: sanitizeFilename(form.get("displayName") || file.name),
          storageKey,
          mimeType: validation.mimeType,
          sizeBytes: arrayBuffer.byteLength,
          sha256Hex: await sha256Hex(arrayBuffer)
        });
        storageKey = "";
        return reply({ ok: true, attachment }, 201);
      } catch (error) {
        await deleteAccountingAttachment(env, storageKey);
        storageKey = "";
        throw error;
      }
    }

    if (request.method === "GET" && downloadMatch) {
      const attachment = await ctx.db.prepare("SELECT * FROM accounting_attachments WHERE id=? AND deleted_at IS NULL AND storage_status='stored'").bind(decodeURIComponent(downloadMatch[1])).first();
      if (!attachment) return reply({ error: "Attachment was not found." }, 404);
      return streamAccountingAttachment(env, {
        storageKey: attachment.storage_key,
        mimeType: attachment.mime_type,
        sanitizedFilename: attachment.display_name,
        mode: "attachment"
      });
    }

    if (request.method === "DELETE" && deleteMatch) {
      const body = await request.json().catch(() => ({}));
      const attachment = await deleteAttachment(ctx.db, { actor: ctx.actor, entitlementTier: ctx.tier, attachmentId: decodeURIComponent(deleteMatch[1]), expectedVersion: body.expectedVersion });
      return reply({ ok: true, attachment });
    }

    return reply({ error: "Not found" }, 404);
  } catch (error) {
    if (storageKey) await deleteAccountingAttachment(env, storageKey).catch(() => {});
    const conflict = Boolean(error?.details?.conflict);
    return reply({ error: conflict ? "conflict" : "accounting_request_failed", message: error?.message || "Accounting attachment request failed." }, conflict ? 409 : 400);
  }
}
