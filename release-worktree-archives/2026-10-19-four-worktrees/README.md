# Four remaining dirty worktrees — preservation archive

This archive preserves all 16 nonignored uncommitted files in four secondary worktrees on October 19, 2026. At capture time every change was untracked; there were no staged or tracked-file changes. Source bytes are copied exactly, and SHA-256 hashes are recorded in manifest.json.

| Folder | Preserved work |
| --- | --- |
| .tmp-koinonia-release | Two Koinonia CSS/JavaScript assets |
| .tmp-marker-release | Six experimental preview/test scripts |
| admin-navigation-release | Five PR drafts and saved patches |
| request-release-check | Three test-run notes/scripts and PR draft |

Each folder's `files/` subtree preserves the original relative paths. `manifest.json` records the base commit, branch, original status, source index checksum, and each file checksum. All four base commits are parents of the archive commit, so their committed histories remain reachable on GitHub. The first parent is the earlier recovered-work archive afc8554b7c566570d8c9e87edb6ebfb1d581250e, retaining that archive too.

To reconstruct a worktree, use its recorded base commit in a separate checkout, then copy its `files/` contents into that checkout at the same relative paths. All 16 files should be untracked, matching the recorded status. Check each copied file against its SHA-256 value. No reconstruction operation is performed by this archive.

The existing complete local tar snapshots remain available for ignored screenshots, build outputs and logs. Those generated files and node_modules are outside this source-work archive. They are not needed to restore the recorded nonignored Git status. Original source files, worktree HEADs, Git indexes and worktree registrations are verified unchanged before and after archive creation.

This is a preservation branch, not a deployment or a proposed merge into main. The preview scripts and historical failure notes are retained as work records; archiving them is not a claim that they pass current release tests.
