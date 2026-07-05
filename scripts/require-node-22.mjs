// scripts/require-node-22.mjs
//
// The standard `npm run check` command now includes
// scripts/settlement-profiles-tests.mjs and scripts/tax-exemption-tests.mjs,
// both of which use node:sqlite (stable enough for this repo's test
// purposes since Node 22, though still flagged experimental by Node
// itself). The rest of this repo/Worker runtime does not require Node 22
// (Cloudflare Workers has its own runtime, unrelated to the Node version
// running local dev scripts) -- this guard exists solely so `npm run
// check` fails with a clear, actionable message on an unsupported local
// Node version instead of a confusing node:sqlite import error.

const [major] = process.versions.node.split(".").map(Number);
if (major < 22) {
  console.error(
    `\nAGAPAY's standard check command requires Node >= 22 (found ${process.version}).\n` +
    "This is because scripts/settlement-profiles-tests.mjs and scripts/tax-exemption-tests.mjs\n" +
    "use node:sqlite to test D1-backed modules against a real SQLite database.\n" +
    "Install Node 22+ (e.g. `nvm install 22 && nvm use 22`) and re-run `npm run check`.\n"
  );
  process.exit(1);
}
