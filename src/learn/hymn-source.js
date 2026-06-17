import { json } from "../lib/core.js";

const PONOMAR_RAW_BASE_URL = "https://raw.githubusercontent.com/typiconman/ponomar/master/Ponomar/languages/en/xml/Services/CommonPrayers";
const PONOMAR_REPO_URL = "https://github.com/typiconman/ponomar";

const WEEKDAY_PREFIXES = ["SUN", "MON", "TUES", "WED", "THUR", "FRI", "SAT"];

function ponomarBaseUrl(env = {}) {
  return String(env.PONOMAR_HYMNS_BASE_URL || PONOMAR_RAW_BASE_URL).replace(/\/+$/, "");
}

function weekdayPrefix(civilDate) {
  const date = civilDate ? new Date(`${civilDate}T12:00:00Z`) : new Date();
  return WEEKDAY_PREFIXES[date.getUTCDay()] || "SUN";
}

function hymnUrl(baseUrl, kind, prefix, tone) {
  return `${baseUrl}/${kind}/${prefix}${tone}.xml`;
}

function decodeXmlAttribute(value = "") {
  return String(value)
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function textValue(xml, tagName) {
  const match = String(xml || "").match(new RegExp(`<${tagName}\\b[^>]*\\bValue="([^"]*)"`, "i"));
  return match ? decodeXmlAttribute(match[1]) : "";
}

function headerTone(header, fallbackTone) {
  const match = String(header || "").match(/\bTone\s+([1-8])\b/i);
  return match ? `Tone ${match[1]}` : fallbackTone;
}

async function fetchPonomarXml(url, fetcher) {
  const response = await fetcher(url, {
    headers: {
      Accept: "application/xml,text/xml,text/plain,*/*",
      "User-Agent": "AGAPAY-Learn/1.0"
    }
  });
  if (!response.ok) throw new Error(`Ponomar returned ${response.status}`);
  return response.text();
}

export async function fetchPonomarDailyHymns({ civilDate, liturgicalDay = {}, env = {}, fetcher = fetch } = {}) {
  const baseUrl = ponomarBaseUrl(env);
  const tone = "1";
  const prefix = weekdayPrefix(civilDate);
  const [troparionXml, kontakionXml] = await Promise.all([
    fetchPonomarXml(hymnUrl(baseUrl, "TROPARION", prefix, tone), fetcher),
    fetchPonomarXml(hymnUrl(baseUrl, "KONTAKION", prefix, tone), fetcher)
  ]);

  return {
    tone: `Tone ${tone}`,
    troparionText: textValue(troparionXml, "TEXT"),
    troparionHeader: textValue(troparionXml, "HEADER"),
    troparionTone: headerTone(textValue(troparionXml, "HEADER"), `Tone ${tone}`),
    troparionUrl: hymnUrl(baseUrl, "TROPARION", prefix, tone),
    kontakionText: textValue(kontakionXml, "TEXT"),
    kontakionHeader: textValue(kontakionXml, "HEADER"),
    kontakionTone: headerTone(textValue(kontakionXml, "HEADER"), `Tone ${tone}`),
    kontakionUrl: hymnUrl(baseUrl, "KONTAKION", prefix, tone),
    weekdayPrefix: prefix
  };
}

export async function enrichLiturgicalDayWithPonomar(liturgicalDay, { civilDate, env = {}, fetcher = fetch } = {}) {
  if (String(env.PONOMAR_HYMNS_ENABLED || "true").toLowerCase() === "false") return liturgicalDay;

  try {
    const hymns = await fetchPonomarDailyHymns({ civilDate, liturgicalDay, env, fetcher });
    if (!hymns.troparionText && !hymns.kontakionText) return liturgicalDay;
    const existingSource = liturgicalDay.sourceLabel && !liturgicalDay.sourceLabel.includes("Ponomar")
      ? `${liturgicalDay.sourceLabel} + Ponomar`
      : "Ponomar Project";
    return {
      ...liturgicalDay,
      troparionTone: hymns.troparionTone,
      troparionText: hymns.troparionText || liturgicalDay.troparionText,
      kontakionTone: hymns.kontakionTone,
      kontakionText: hymns.kontakionText || liturgicalDay.kontakionText,
      hymnSourceLabel: "Ponomar Project",
      hymnSourceUrl: PONOMAR_REPO_URL,
      hymnSourceLicense: "GPL-3.0-or-later",
      sourceLabel: existingSource,
      sourceConnected: Boolean(liturgicalDay.sourceConnected)
    };
  } catch (error) {
    return {
      ...liturgicalDay,
      hymnSourceLabel: "Ponomar unavailable",
      hymnSourceError: error.message
    };
  }
}

export function handleLearnHymnsStatus(env = {}) {
  return json({
    ok: true,
    provider: {
      id: "ponomar",
      label: "Ponomar Project",
      kind: "orthodox-hymn-texts",
      capabilities: ["weekday-troparion", "weekday-kontakion", "fixed-weekday-common-prayers"],
      apiBaseUrl: ponomarBaseUrl(env),
      docsUrl: PONOMAR_REPO_URL,
      license: "GPL-3.0-or-later",
      note: "AGAPAY Learn reads Ponomar XML as an external source. Full feast/saint service assembly can be added later by pointing PONOMAR_HYMNS_BASE_URL at a hosted Ponomar service."
    }
  });
}
