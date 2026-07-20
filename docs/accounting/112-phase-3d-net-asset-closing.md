# Phase 3D nonprofit net-asset closing

AGAPAY uses direct closing. Each nonzero revenue or expense account is zeroed by account and fund, followed by a deterministic net-asset line for that fund. Donor-restricted funds close to Net Assets With Donor Restrictions. Unrestricted funds close to Net Assets Without Donor Restrictions. Board-designated funds use their explicit mapping when configured and otherwise remain identified by their fund dimension under unrestricted net assets.

Mappings are normalized and never inferred from display names. The proposal records restricted and unrestricted changes separately, preserves fund traceability, leaves balance-sheet accounts open, and must balance before posting. This bookkeeping classification does not authorize changing donor restrictions.
