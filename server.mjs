import http from "node:http";
import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");
const port = Number(process.env.PORT || 3000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8"
};

const immutableAssetExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".ico"
]);

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function cacheControlFor(filePath) {
  const extension = path.extname(filePath);
  if (extension === ".html" || extension === ".xml") return "no-cache";
  if (immutableAssetExtensions.has(extension)) return "public, max-age=31536000, immutable";
  return "no-cache";
}

async function handleApi(req, res) {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (pathname === "/api/security/config") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(JSON.stringify({
      turnstileEnabled: Boolean(process.env.TURNSTILE_SITE_KEY),
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || ""
    }));
    return true;
  }
  const name = pathname.replace(/^\/api\//, "");
  const modulePath = path.join(root, "api", `${name}.js`);
  if (!(await pathExists(modulePath))) return false;
  const mod = await import(pathToFileURL(modulePath).href);
  await mod.default(req, res);
  return true;
}

async function resolveStaticPath(urlPath) {
  let pathname = decodeURIComponent(urlPath);
  if (pathname === "/") pathname = "/index.html";
  if (
    pathname === "/my-agapay" ||
    pathname === "/my-agapay/" ||
    pathname === "/my-agapay/dashboard" ||
    pathname === "/myagapay" ||
    pathname === "/myagapay/" ||
    pathname === "/myagapay/dashboard"
  ) pathname = "/donor/index.html";
  if (pathname.startsWith("/my-agapay/") && !path.extname(pathname)) pathname = pathname.replace(/^\/my-agapay/, "/donor") + ".html";
  if (pathname.startsWith("/myagapay/") && !path.extname(pathname)) pathname = pathname.replace(/^\/myagapay/, "/donor") + ".html";
  if (pathname === "/donor" || pathname === "/donor/") pathname = "/donor/index.html";
  if (pathname === "/donor/dashboard") pathname = "/donor/index.html";
  if (pathname === "/give" || pathname === "/give/" || pathname === "/giving" || pathname === "/giving/") {
    pathname = "/give/index.html";
  }
  if (pathname.startsWith("/giving/")) pathname = pathname.replace(/^\/giving\//, "/give/");
  if (!path.extname(pathname)) pathname = `${pathname}.html`;
  if (pathname.startsWith("/give/") && !(await pathExists(path.join(publicDir, pathname)))) {
    pathname = "/give/st-seraphim-mission.html";
  }
  return path.normalize(path.join(publicDir, pathname));
}

export const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/") && await handleApi(req, res)) return;

    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    const filePath = await resolveStaticPath(pathname);
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");

    const stream = createReadStream(filePath);
    stream.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      }
      res.end("Unable to read file");
    });
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": cacheControlFor(filePath)
    });
    stream.pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

export { port };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(port, () => {
    console.log(`AgaPay dev server running at http://localhost:${port}`);
  });
}
