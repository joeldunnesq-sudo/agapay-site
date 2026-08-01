function escapeRichTextHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const SUPPORTED_TAGS = new Set(["strong", "em", "a", "ul", "li", "br"]);

export function stripAuthoredHtml(value, allowedTags = []) {
  for (const tag of allowedTags) {
    if (!SUPPORTED_TAGS.has(String(tag || "").toLowerCase())) {
      throw new Error(`Unsupported authored rich-text tag: ${tag}`);
    }
  }
  const source = String(value ?? "");
  let output = "";
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "<") {
      output += source[index];
      continue;
    }
    let quote = "";
    let end = index + 1;
    for (; end < source.length; end += 1) {
      const character = source[end];
      if (quote) {
        if (character === quote) quote = "";
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        break;
      }
    }
    if (end >= source.length) output += source[index];
    else index = end;
  }
  return output;
}

function safeRichTextHref(value) {
  const href = String(value || "").trim();
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const parsed = new URL(href);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? href : "";
  } catch {
    return "";
  }
}

function renderInline(value, allowedTags) {
  const allowed = new Set(allowedTags);
  const source = stripAuthoredHtml(value, allowedTags);
  const linkPattern = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let cursor = 0;
  let html = "";
  const renderEmphasis = (text) => {
    let rendered = escapeRichTextHtml(text);
    if (allowed.has("strong")) rendered = rendered.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    if (allowed.has("em")) rendered = rendered.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    return rendered;
  };
  for (const match of source.matchAll(linkPattern)) {
    html += renderEmphasis(source.slice(cursor, match.index));
    const href = safeRichTextHref(match[2]);
    if (href && allowed.has("a")) {
      const external = /^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : "";
      html += `<a href="${escapeRichTextHtml(href)}"${external}>${renderEmphasis(match[1])}</a>`;
    } else {
      html += renderEmphasis(match[0]);
    }
    cursor = Number(match.index) + match[0].length;
  }
  return html + renderEmphasis(source.slice(cursor));
}

export function renderBoundedRichText(value, allowedTags) {
  const allowed = new Set(allowedTags);
  const lines = String(value ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let listItems = [];
  const flushList = () => {
    if (!listItems.length) return;
    if (allowed.has("ul") && allowed.has("li")) {
      blocks.push(`<ul>${listItems.map((item) => `<li>${renderInline(item, allowedTags)}</li>`).join("")}</ul>`);
    } else {
      blocks.push(listItems.map((item) => renderInline(`- ${item}`, allowedTags)).join(allowed.has("br") ? "<br>" : "\n"));
    }
    listItems = [];
  };
  for (const line of lines) {
    const listMatch = line.match(/^\s*-\s+(.+)$/);
    if (listMatch) {
      listItems.push(listMatch[1]);
      continue;
    }
    flushList();
    blocks.push(renderInline(line, allowedTags));
  }
  flushList();
  return blocks.join(allowed.has("br") ? "<br>" : "\n");
}
