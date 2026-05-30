# agapay-site
AGAPAY website files.

## Quality checks

- `npm run check` - worker syntax + platform assertions + hardening tests
- `npm run prelaunch` - launch-focused readiness assertions

For production smoke checks, set `AGAPAY_BASE_URL`:

- PowerShell: `$env:AGAPAY_BASE_URL="https://agapay.app"; npm run prelaunch`
