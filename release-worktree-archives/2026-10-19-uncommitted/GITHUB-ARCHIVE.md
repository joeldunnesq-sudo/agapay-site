# Recovered work archive — October 19, 2026

This archive preserves the recovered hero/calendar source files, experimental preview script, both original bookstore draft texts, recovery report, provenance, checksums, screenshots and focused verification evidence.

Start with [RECOVERY-REPORT.md](RECOVERY-REPORT.md), then [recovery-summary.json](recovery-investigation/recovery-summary.json) and [verification-results.json](recovery-investigation/verification-results.json).

The 31 reconstructed source files and preview script are under `recovery-investigation/hero-reconstructed/`. Drafts are `recovery-investigation/bookstore-pr.md` and `recovery-investigation/screenshot-pr.md`. `recovered-file-hashes.json` records SHA-256 hashes of their archived raw bytes. The reconstructed diff matches the recorded pre-deletion summary of 31 tracked files, 113 insertions and 63 deletions. Original pre-deletion byte hashes were unavailable; line endings were reconstructed.

The archive commit retains the original preserved workspace commit bef2c199024ff5f92f60a2fadd239bc607df461d as its first parent, and the historical hero and bookstore heads as additional parents. This preserves their committed histories as well as the recovered files. The top-level application source is the historical original archive, not the current production release. This branch is for preservation, not deployment or merging into main.

The original failed snapshots remain explicitly marked incomplete in manifest.json. Subsequent recovery is documented separately; it does not retroactively validate the failed backup process.

Large full-checkout tarballs, installed dependencies, unrelated remaining-worktree snapshots and raw chat transcripts are retained locally rather than committed here. They are not necessary to preserve the recovered source content. The relevant recovered text, provenance, source hashes and verification results are included. Historical bases can also be read from the archive commit's retained parent history.

No additional worktrees were removed during recovery or archival. The live release was not modified. The experimental preview test retains its obsolete identical-badge assertion, whose failure is explained in the recovery report; the relevant released application suites passed.
