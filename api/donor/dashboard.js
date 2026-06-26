import { handleOptions, sendJson, readJson } from "../../lib/http.js";

// In-memory store for local testing
let mockPledgeAmountCents = 250000;
let mockDefaultParishId = "st-fiacre";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method === "PATCH") {
    try {
      const body = await readJson(req);
      if (body.pledgeAmountCents !== undefined) {
        mockPledgeAmountCents = Number(body.pledgeAmountCents);
      }
      if (body.defaultParishId !== undefined) {
        mockDefaultParishId = body.defaultParishId;
      }
      return sendJson(res, 200, {
        ok: true,
        donor: {
          email: "preview@agapay.local",
          donorName: body.donorName || "Stephanie Preview",
          householdName: body.householdName || "Stephanie Preview",
          defaultParishId: mockDefaultParishId,
          pledgeAmountCents: mockPledgeAmountCents,
          pledgeYear: body.pledgeYear || "2026"
        }
      });
    } catch (err) {
      return sendJson(res, 400, { error: "Invalid JSON body" });
    }
  }

  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  sendJson(res, 200, {
    donor: {
      email: "preview@agapay.local",
      donorName: "Stephanie Preview",
      householdName: "Stephanie Preview",
      defaultParishId: mockDefaultParishId,
      pledgeAmountCents: mockPledgeAmountCents,
      pledgeYear: "2026",
      contactPhone: "13618066666",
      addressLine1: "7910 Joliet Avenue",
      addressLine2: "",
      city: "Lubbock",
      state: "TX",
      postalCode: "79423",
      country: "US"
    },
    parish: {
      id: "st-fiacre",
      name: "St Fiacre (Demo)",
      jurisdiction: "Diocese of the West",
      address: "123 Parish Way, San Francisco, CA"
    },
    summary: {
      monthCents: 12500,
      ytdCents: 240000,
      offeringCount: 15,
      recurringCount: 1,
      commemorationCount: 4
    },
    recentOfferings: [
      { id: "off_1", fund: "General Stewardship", amountCents: 10000, frequency: "monthly", createdAt: new Date().toISOString() }
    ],
    recentCommemorations: []
  });
}
