# Confirm the current app before editing

- At the start of an app or dashboard change, check the checkout with `git status --short --branch`, `git log -1 --oneline`, and `git worktree list`. Compare the applicable release ref and the files for the requested screens. Modified files in a checkout can make an old base look current.
- Use a checkout based on the intended release or development ref. If the open checkout is behind and has local work, preserve it and use an isolated checkout of the intended revision. Verify the release commit or public asset versions when available, and say which revision was used when the deployed build cannot be verified.
- Trace the actual route, HTML, CSS, and runtime scripts before editing. For My AGAPAY, check for headers injected by the app shell and generated files under `public/`. Edit the TypeScript source when it owns the behavior, regenerate the assets, and test the current screen at desktop and mobile widths.
