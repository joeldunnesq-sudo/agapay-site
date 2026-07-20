# Phase 3C — Parish Commerce accounting

Phase 3C extends the Phase 2D canonical source-event pipeline for Parish-tier Bookstore and Parish+ commerce. The AGAPAY order is the sale source, order items provide item/quantity snapshots, the captured tax result provides historical tax facts, Stripe balance transactions provide actual fees, and Stripe refunds/payouts provide their respective movements. Commerce orders never post as donations, and no invented AGAPAY platform fee is calculated.

Sales debit the actual tender account and credit gross commerce revenue, Sales Tax Payable, and only explicitly sourced voluntary donations. Stripe fees post separately as expense. Refunds reverse their source-allocated revenue and tax; fees reverse only from explicit fee-refund facts. Payouts and cash deposits move balance-sheet accounts without recognizing revenue again.

Accounting item configuration references the existing operational product ID rather than duplicating the product catalog. Stable SKU/barcode snapshots support future Scan & Go. Inventory-tracked sales create quantity movements; COGS posts only from an original or configured reliable unit cost. Missing cost is retained honestly as pending inventory accounting. Manual cost and weighted-average readiness are represented; FIFO is not claimed.

Mappings resolve item, category, Revenue Stream, settlement profile, channel, then defaults. Funds, accounts, Revenue Streams, settlement profiles, and items remain separate concepts. Mission Accounting cannot access commerce data or mutations.
