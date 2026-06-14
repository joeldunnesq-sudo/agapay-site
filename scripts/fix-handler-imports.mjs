import fs from "node:fs";

const files = {
  core: "src/lib/core.js",
  parish: "src/handlers/parish.js",
  donor: "src/handlers/donor.js",
  admin: "src/handlers/admin.js",
  stripe: "src/handlers/stripe.js",
};

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function exportedNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(match[1]);
  for (const match of source.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(match[1]);
  for (const match of source.matchAll(/export\s*\{([\s\S]*?)\}/g)) {
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0]?.trim();
      if (name) names.add(name);
    }
  }
  return names;
}

function parseNamedImports(source, specifier) {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`import\\s*\\{([\\s\\S]*?)\\}\\s*from\\s*["']${escaped}["'];?`);
  const match = source.match(re);
  if (!match) return { re, names: [] };
  const names = match[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split(/\s+as\s+/)[0].trim());
  return { re, names };
}

function formatImport(names, specifier) {
  if (!names.length) return "";
  return `import {\n  ${names.sort((a, b) => a.localeCompare(b)).join(",\n  ")},\n} from "${specifier}";\n`;
}

function cleanHandler(file) {
  let source = read(file);
  if (!source) return;

  const parishExports = exportedNames(read(files.parish));
  const coreExports = exportedNames(read(files.core));

  const parishImport = parseNamedImports(source, "./parish.js");
  const coreImport = parseNamedImports(source, "../lib/core.js");
  const wantedParish = new Set();
  const wantedCore = new Set(coreImport.names);
  const unknown = [];

  for (const name of parishImport.names) {
    if (parishExports.has(name)) wantedParish.add(name);
    else if (coreExports.has(name)) wantedCore.add(name);
    else unknown.push(name);
  }

  source = source.replace(parishImport.re, "").replace(coreImport.re, "");

  const declared = new Set();
  for (const match of source.matchAll(/(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) declared.add(match[1]);
  for (const match of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) declared.add(match[1]);
  for (const match of source.matchAll(/import\s*\{([\s\S]*?)\}\s*from/g)) {
    for (const part of match[1].split(",")) {
      const pieces = part.trim().split(/\s+as\s+/);
      const local = (pieces[1] || pieces[0] || "").trim();
      if (local) declared.add(local);
    }
  }

  for (const name of coreExports) {
    if (declared.has(name)) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`).test(source)) wantedCore.add(name);
  }

  for (const name of parishExports) {
    if (declared.has(name)) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`).test(source)) wantedParish.add(name);
  }

  const imports = [
    formatImport([...wantedCore], "../lib/core.js"),
    formatImport([...wantedParish], "./parish.js"),
  ].filter(Boolean).join("\n");

  source = `${imports}\n${source.replace(/^\s+/, "")}`;
  fs.writeFileSync(file, source);

  console.log(`${file}: parish imports ${parishImport.names.length} -> ${wantedParish.size}; core imports -> ${wantedCore.size}`);
  if (unknown.length) console.log(`${file}: removed non-exported imports: ${unknown.join(", ")}`);
}

cleanHandler(files.donor);
cleanHandler(files.admin);
cleanHandler(files.stripe);
