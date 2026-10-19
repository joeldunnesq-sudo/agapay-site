# Worktree archive review and incident record

## Recovery update — October 19

The missing source content has now been reconstructed from original compressed session logs and frozen Git blobs. The original two incomplete snapshots remain marked incomplete; this recovery does not retroactively make them valid full backups.

- `recovery-investigation/bookstore-pr.md` and `screenshot-pr.md` recover the original logged here-string text. Their text matches the published PR bodies for #158 and #160. Windows line endings were reconstructed; original raw-file checksums were not available.
- `recovery-investigation/hero-reconstructed/scripts/.tmp-hero-visual.mjs` reproduces the original base calendar test, the recorded visual-test insertion, and its later `innerText` amendment. The recovered preview script is not a production runtime dependency.
- The 31 tracked hero/calendar files are reconstructed under `recovery-investigation/hero-reconstructed/`. The final recorded edit restored style.css and parish-life.html from commit 669fd9f6, then changed the inset date badge and regenerated asset references on base 454e515e. The reconstructed diff matches the pre-deletion inventory and summary: 31 files, 113 insertions, 63 deletions, including 80 changed CSS lines and 38 changed parish-life HTML lines. This is strong content-level recovery evidence, not proof of identical pre-deletion bytes.
- Provenance, original matching log records, reconstructed file hashes, release comparisons and live asset comparisons are saved under recovery-investigation/.

### App functionality verification

An isolated copy of released commit 058437466c08ec18ced86e5680e3fd9f915faedb passed the existing calendar, Koinonia refresh and bookstore boutique browser suites. These cover calendar readings, saint modals, resume/reload and expired-session handling; responsive Koinonia layout, video/news, memberships and household gates; and bookstore sales, details, saved items, sorting, search, checkout payloads, sale removal, mobile cart and parish isolation.

The reconstructed historical source passed its original calendar regression suite. Its recovered experimental visual test fails the old assertion that Koinonia and full-calendar date badges are identical: after that test was written, the logged source edits intentionally gave Koinonia an inset rounded badge and a JULIAN label. This assertion failure is confined to the historical experimental script and does not occur in the passing release suites.

Live production reports healthy commit 05843746. Four sampled CSS/JS assets match the released source after CRLF/LF normalization. The parish-life HTML matches after removal of the specifically observed Cloudflare-added hidden link, analytics beacon and challenge script. None of the missing preview/draft filenames is referenced in released src/, public/, workflows or package.json. No evidence of lost deployed functionality was found within these checks; this is not a new exhaustive platform audit.

No worktrees were deleted during recovery. The original checkout's 31 recovery-reference source files also retain their recorded hashes.

The sections below preserve the initial incident findings for audit history; their unrecovered-file statements are superseded by this update.

The primary checkout was not reset, cleaned or removed. Its source archive remains commit bef2c199024ff5f92f60a2fadd239bc607df461d.

## Incomplete first archive attempt

An incorrect combined `git ls-files --cached --others --ignored --exclude-standard` command selected only ignored files. Verification checked that incomplete list, so it did not protect the uncommitted source files. Git diff patches also failed to write because their output arguments were malformed. The script should have stopped on those errors.

Two worktrees were removed before this error was caught:

- `.tmp-bookstore-release`: committed history is preserved in branch-history.bundle and the retained branch. The two untracked drafts bookstore-pr.md and screenshot-pr.md were not archived. Published bodies for PRs 158 and 160 were retrieved as recovery references; they are not certified copies of those drafts. Ignored check/quality logs are preserved.
- `.tmp-hero-calendar`: committed history is preserved in branch-history.bundle and the retained branch. Its 31 modified tracked files and untracked scripts/.tmp-hero-visual.mjs were not captured. The distinctive civil-date/Church-date CSS modifications inspected before deletion also exist in the original checkout and commit bef2c199. Copies of the corresponding 31 files from the original checkout are retained separately, with that provenance; byte-for-byte equivalence to the deleted worktree cannot be established. The preview script has not been recovered. An ignored Wrangler log is preserved.

The initial manifest explicitly marks those snapshots incomplete. Do not treat them as full checkout backups.

## Remaining worktrees

No further worktrees are being removed. Corrected complete snapshots include tracked, untracked and ignored files using three independent Git inventories; node_modules is excluded. Each snapshot is extracted and every included file checked against a source SHA256 manifest before it is marked verified in remaining-preserved.json. Original worktrees are retained.

The four dirty secondary worktrees are .tmp-koinonia-release, .tmp-marker-release, .worktrees/admin-navigation-release and tmp/request-release-check. Other inspected secondary worktrees, including the managed mobile PWA worktree, had no nonignored uncommitted changes.

All six branches are preserved in branch-history.bundle, which passed git bundle verify. It preserves committed history, not the lost uncommitted files above.
