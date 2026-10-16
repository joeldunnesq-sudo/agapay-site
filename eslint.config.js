import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const handwrittenIgnores = ['node_modules/**', 'public/vendor/**', 'tmp/**', 'tmp-*/**', '.tmp-*/**', 'artifacts/**'];
const recommendedRules = js.configs.recommended.rules;

export default [
  // Retain the transcript input destructuring without changing its default evaluation.
  {
    files: ['src/learn/print-academic-pdf.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^attendance$' }] },
  },
  // Classic inline HTML handlers remain lexical globals after type erasure.
  {
    files: ['src/browser/bookstore/app.ts'],
    rules: {
      'prefer-const': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(selectCategory|changeQuantity|removeItem|lookupEnteredIsbn|addBuyerBook|openBookScanner)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/events/app.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^(changeItemQuantity|removeItem)$' }],
    },
  },
  {
    files: ['src/browser/myagapay/events.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^myEventsChangeQuantity$' }] },
  },
  { files: ['src/handlers/nonprofit-pricing.ts'], rules: { 'prefer-const': 'off' } },
  // Preserve unused legacy declarations during the type-only migration.
  {
    files: ['src/accounting/ledger/workspace.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^run$' }] },
  },
  {
    files: ['src/accounting/setup/service.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^all$' }] },
  },
  {
    files: ['src/handlers/mfa.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^loadMfaTransaction$' }] },
  },
  { ignores: handwrittenIgnores },
  {
    files: ['src/browser/myagapay/push-notifications.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^Navigator$' }] },
  },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: ['src/**/*.ts', 'scripts/**/*.ts'] })),
  {
    // Preserve the legacy gate's function-scoped variables and deferred shell loading.
    files: ['src/browser/learn/mobile-gate.ts'],
    rules: { 'no-var': 'off', 'prefer-const': 'off' },
  },

  {
    // Preserve the existing third-party Pixel queue bootstrap and its IArguments payloads.
    files: ['src/browser/meta-pixel.ts'],
    rules: {
      '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true }],
      'prefer-spread': 'off',
      'prefer-rest-params': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { caughtErrorsIgnorePattern: '^_error$' }],
    },
  },
  {
    // Keep legacy callback arity and URL helper evaluation during the type-only migration.
    files: ['src/handlers/stewardship-presentation.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^i$' }] },
  },
  {
    files: ['src/handlers/stewardship-packet-presentation.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^base$' }] },
  },

  {
    // Retain the existing unused helper while preserving runtime/export parity.
    files: ['src/handlers/donor-notifications.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^newNotifId$' }] },
  },
  {
    files: ['src/learn/hymn-source.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^liturgicalDay$', argsIgnorePattern: '^liturgicalDay$' },
      ],
    },
  },
  {
    files: ['src/reports/diocesan-statistics.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^BLUE$' }] },
  },
  {
    files: ['src/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      'no-unreachable': 'error',
      'no-constant-binary-expression': 'error',
      'max-lines': ['warn', { max: 1200, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['src/handlers/parish-dashboard-handler.ts'],
    // Keep the legacy recursive helper's optional argument and call shape.
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^key$' }] },
  },
  {
    files: ['src/lib/subscriptions.ts'],
    // Public catalogs omit private binding names; preserve the legacy pricing argument.
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { ignoreRestSiblings: true, argsIgnorePattern: '^pricingProgram$' },
      ],
    },
  },
  {
    files: ['src/lib/stewardship-funds.ts'],
    // Destructuring deliberately omits the reporting-only code from saved funds.
    rules: { '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }] },
  },
  {
    // This classic entry point is invoked by parish dashboard scripts and HTML.
    files: ['src/browser/parish/features/giving/insights.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^loadGivingOverviewInsights$' }] },
  },
  {
    files: ['src/browser/parish/features/giving/overview.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^loadGivingSummary$' }] },
  },
  {
    files: ['src/browser/parish/features/giving/recurring.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^loadRecurringHealth$' }] },
  },
  {
    files: ['src/browser/admin/controllers/contact-leads.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^loadContactLeads$' }],
    },
  },
  {
    // Public classic-script functions are called by the existing Admin app.
    files: ['src/browser/admin/metrics.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^(renderAdminOverviewMetrics|renderAdminTierBreakdown)$' },
      ],
    },
  },
  {
    files: ['src/browser/admin/presentation.ts'],
    // Window is an ambient interface merge; the legacy fee helper accepts an unused argument.
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^Window$' }],
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'with-single-extends' }],
    },
  },
  {
    // Classic lexical globals are consumed by later scripts, not by this file.
    files: ['src/browser/donor/bookstore-presentation.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^(BOOKSTORE_CATEGORY_LABELS|BOOKSTORE_STATUS_LABELS|formatCentsAsDollars)$' },
      ],
    },
  },
  {
    files: ['src/**/*.js', 'public/**/*.js', 'scripts/**/*.mjs', 'server.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'constructor-super': 'error',
      'no-constant-binary-expression': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-new-native-nonconstructor': 'error',
      'no-redeclare': 'error',
      'no-self-assign': 'error',
      'no-unreachable': 'error',
      'max-lines': ['warn', { max: 1200, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['src/routes/**/*.js', 'src/operations/**/*.js', 'src/organizations/**/*.js', 'src/payments/**/*.js'],
    languageOptions: { globals: globals.serviceworker },
    rules: recommendedRules,
  },
  {
    files: [
      'scripts/run-tests.mjs',
      'scripts/liturgical-calendar-typescript-tests.mjs',
      'scripts/calendar-festal-typescript-tests.mjs',
      'scripts/giving-catalog-handler-typescript-tests.mjs',
      'scripts/giving-foundations-typescript-tests.mjs',
      'scripts/stripe-volume-typescript-tests.mjs',
      'scripts/dashboard-foundation-typescript-tests.mjs',
      'scripts/dashboard-handler-typescript-tests.mjs',
      'scripts/notifications-typescript-tests.mjs',
      'scripts/intake-typescript-tests.mjs',
      'scripts/registration-models-typescript-tests.mjs',
      'scripts/parish-life-foundations-typescript-tests.mjs',
      'scripts/library-handler-typescript-tests.mjs',
      'scripts/giving-statement-pdf-typescript-tests.mjs',
      'scripts/outside-input-typescript-tests.mjs',
      'scripts/early-adopter-typescript-tests.mjs',
      'scripts/audit-log-typescript-tests.mjs',
      'scripts/auth-helpers-typescript-tests.mjs',
      'scripts/sacrament-availability-typescript-tests.mjs',
      'scripts/accounting-validation-typescript-tests.mjs',
      'scripts/accounting-environment-typescript-tests.mjs',
      'scripts/accounting-context-typescript-tests.mjs',
      'scripts/accounting-storage-typescript-tests.mjs',
      'scripts/accounting-csv-typescript-tests.mjs',
      'scripts/accounting-observability-typescript-tests.mjs',
      'scripts/accounting-storage-foundations-typescript-tests.mjs',
      'scripts/accounting-backup-retention-typescript-tests.mjs',
      'scripts/giving-catalog-staging-smoke-tests.mjs',
      'scripts/parish-outside-gifts-typescript-tests.mjs',
      'scripts/parish-giving-catalog-typescript-tests.mjs',
      'scripts/parish-reconciliation-controller-typescript-tests.mjs',
      'scripts/parish-reconciliation-reports-typescript-tests.mjs',
      'scripts/parish-sharing-typescript-tests.mjs',
      'scripts/parish-statements-typescript-tests.mjs',
      'scripts/typecheck.mjs',
      'scripts/build-server-typescript.mjs',
      'scripts/build-browser-typescript.mjs',
      'scripts/lib/browser-typescript.mjs',
      'scripts/browser-typescript-tests.mjs',
      'scripts/lib/server-typescript.mjs',
      'scripts/server-typescript-tests.mjs',
      'scripts/lint.mjs',
      'scripts/lint-warning-baseline-tests.mjs',
      'scripts/parish-diagnostics-tests.mjs',
      'scripts/lib/browser-error-gate.mjs',
      'scripts/lib/parish-browser-fixture.mjs',
      'scripts/lib/lint-warning-baseline.mjs',
      'scripts/test-manifest.mjs',
      'scripts/architecture-boundaries-tests.mjs',
      'scripts/route-registry-tests.mjs',
      'scripts/accounting-migration-ledger-tests.mjs',
      'scripts/bootstrap-accounting-migration-ledger.mjs',
      'scripts/lib/accounting-migration-ledger.mjs',
      'scripts/d1-recovery-tests.mjs',
      'scripts/d1-recovery.mjs',
      'scripts/production-monitor-alert.mjs',
      'scripts/production-monitor-tests.mjs',
      'scripts/production-monitor.mjs',
      'scripts/operations-monitoring-tests.mjs',
      'scripts/organization-readiness-tests.mjs',
      'scripts/organization-authorization-adoption-tests.mjs',
      'scripts/organization-verification-policy-adoption-tests.mjs',
      'scripts/organization-api-route-tests.mjs',
      'scripts/organization-dashboard-entitlements-tests.mjs',
      'scripts/payment-classification-tests.mjs',
      'scripts/source-size-budget-tests.mjs',
      'scripts/critical-path-manifest-tests.mjs',
      'scripts/production-operations-workflow-tests.mjs',
      'scripts/lib/d1-recovery.mjs',
      'scripts/lib/production-monitor.mjs',
    ],
    languageOptions: { globals: globals.node },
    rules: recommendedRules,
  },
  {
    files: [
      'scripts/parish-dashboard-browser-tests.mjs',
      'scripts/browser-typescript-browser-tests.mjs',
      'scripts/parish-onboarding-browser-tests.mjs',
      'scripts/parish-campaign-browser-tests.mjs',
      'scripts/parish-stewardship-browser-tests.mjs',
      'scripts/parish-giving-browser-tests.mjs',
      'scripts/parish-recurring-typescript-browser-tests.mjs',
      'scripts/parish-overview-typescript-browser-tests.mjs',
      'scripts/parish-insights-typescript-browser-tests.mjs',
      'scripts/parish-weekly-funds-typescript-browser-tests.mjs',
      'scripts/parish-history-typescript-browser-tests.mjs',
      'scripts/parish-commemorations-typescript-browser-tests.mjs',
      'scripts/parish-givers-typescript-browser-tests.mjs',
      'scripts/parish-transfers-typescript-browser-tests.mjs',
    ],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: recommendedRules,
  },
  {
    files: [
      'public/parish/dashboard-runtime.js',
      'public/parish/features/onboarding.js',
      'public/parish/features/campaigns.js',
      'public/parish/features/stewardship.js',
      'public/parish/features/stewardship/**/*.js',
      'public/parish/features/giving.js',
      'public/parish/features/giving/**/*.js',
    ],
    languageOptions: { sourceType: 'script', globals: globals.browser },
    rules: recommendedRules,
  },
  {
    files: ['public/parish/features/giving/insights.js'],
    languageOptions: {
      globals: {
        currentParish: 'readonly',
        authHeaders: 'readonly',
        isParishTier: 'readonly',
        isParishPlusActive: 'readonly',
        renderStewardshipFees: 'readonly',
      },
    },
    rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^loadGivingOverviewInsights$' }] },
  },
  {
    files: ['public/parish/features/giving/overview.js'],
    languageOptions: {
      globals: {
        currentParish: 'readonly',
        authHeaders: 'readonly',
        loadStripeVolume: 'readonly',
        escapeHtml: 'readonly',
        money: 'readonly',
        shortDate: 'readonly',
        loadGivingOverviewInsights: 'readonly',
      },
    },
    rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^loadGivingSummary$' }] },
  },
  {
    files: ['public/parish/features/giving/recurring.js'],
    languageOptions: {
      globals: {
        currentParish: 'readonly',
        authHeaders: 'readonly',
        escapeHtml: 'readonly',
        pdxAnimateCount: 'readonly',
        money: 'readonly',
      },
    },
    rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^loadRecurringHealth$' }] },
  },
  {
    files: ['public/parish/feature-registry.js', 'public/parish/diagnostics.js'],
    languageOptions: { globals: globals.browser },
    rules: recommendedRules,
  },
  {
    files: ['src/browser/parish/features/giving/weekly-funds.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^loadWeeklyFunds$' }] },
  },
  {
    files: ['public/parish/features/giving/weekly-funds.js'],
    languageOptions: {
      globals: { currentParish: 'readonly', authHeaders: 'readonly', escapeHtml: 'readonly', moneyFull: 'readonly' },
    },
    rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^loadWeeklyFunds$' }] },
  },
  {
    files: ['src/browser/parish/features/giving/history.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^(manualAccountingGifts|loadGivingHistory|exportHistoryCsv)$' },
      ],
    },
  },
  {
    files: ['public/parish/features/giving/history.js'],
    languageOptions: {
      globals: {
        currentParish: 'readonly',
        setStatus: 'readonly',
        authHeaders: 'readonly',
        renderCandleGiving: 'readonly',
        escapeHtml: 'readonly',
        renderGivingOptionsEditor: 'readonly',
        renderGiversPanel: 'readonly',
        escapeAttr: 'readonly',
        moneyFull: 'readonly',
        money: 'readonly',
        fullDate: 'readonly',
        downloadBlob: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^(manualAccountingGifts|loadGivingHistory|exportHistoryCsv)$' },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/giving/commemorations.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^(loadCommemorations|renderCandleGiving)$' },
      ],
    },
  },
  {
    files: ['public/parish/features/giving/commemorations.js'],
    languageOptions: {
      globals: {
        shortDate: 'readonly',
        escapeHtml: 'readonly',
        currentParish: 'readonly',
        authHeaders: 'readonly',
        allGifts: 'readonly',
        manualAccountingGifts: 'readonly',
        money: 'readonly',
      },
    },
    rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^(loadCommemorations|renderCandleGiving)$' }] },
  },
  {
    files: ['src/browser/parish/features/giving/givers.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^(Window|setGiversSort|scrollToGiverDirectory|renderGiversPanel|exportGiversMonthlyCsv)$',
        },
      ],
    },
  },
  {
    files: ['public/parish/features/giving/givers.js'],
    languageOptions: {
      globals: {
        allGifts: 'readonly',
        pdxAnimateCount: 'readonly',
        money: 'readonly',
        shortDate: 'readonly',
        escapeHtml: 'readonly',
        populateGivingStatementsPanel: 'readonly',
        checkNudgeEligibility: 'readonly',
        currentParish: 'readonly',
        authHeaders: 'readonly',
        downloadBlob: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^(setGiversSort|scrollToGiverDirectory|renderGiversPanel|exportGiversMonthlyCsv)$' },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/giving/statements.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^(populateGivingStatementsPanel|previewGivingStatement|startGivingStatementJob)$' },
      ],
    },
  },
  {
    files: ['public/parish/features/giving/statements.js'],
    languageOptions: {
      globals: {
        escapeHtml: 'readonly',
        currentParish: 'readonly',
        setStatus: 'readonly',
        authHeaders: 'readonly',
        shortDate: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^(populateGivingStatementsPanel|previewGivingStatement|startGivingStatementJob)$' },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/giving/sharing.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(renderQrCode|copyGivingLink|copyGivingEmbedCode|downloadQrSvg|downloadQrPng|downloadBulletinSvg|downloadBulletinPng|givingEmbedSnippet)$',
        },
      ],
    },
  },
  {
    files: ['public/parish/features/giving/sharing.js'],
    languageOptions: {
      globals: {
        currentParish: 'readonly',
        dedicatedGivingUrl: 'readonly',
        dedicatedGivingEmbedUrl: 'readonly',
        qrcode: 'readonly',
        setStatus: 'readonly',
        downloadBlob: 'readonly',
        escapeHtml: 'readonly',
      },
    },
    rules: {
      // esbuild escapes the closing script tag in the copied embed snippet.
      // Keep source lint strict; this file is checked against compiler output.
      'no-useless-escape': 'off',
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(renderQrCode|copyGivingLink|copyGivingEmbedCode|downloadQrSvg|downloadQrPng|downloadBulletinSvg|downloadBulletinPng|givingEmbedSnippet)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/giving/embed-theme.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^(openGivingEmbedTheme|previewGivingEmbedTheme|copyStyledGivingEmbed)$' },
      ],
    },
  },
  {
    files: ['public/parish/features/giving/embed-theme.js'],
    languageOptions: {
      globals: { dedicatedGivingEmbedUrl: 'readonly', givingEmbedSnippet: 'readonly', setStatus: 'readonly' },
    },
    rules: {
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^(openGivingEmbedTheme|previewGivingEmbedTheme|copyStyledGivingEmbed)$' },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/giving/transfers.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^(renderFundTransferWorksheet|collectFundTransferInstructions)$' },
      ],
    },
  },
  {
    files: ['public/parish/features/giving/transfers.js'],
    languageOptions: {
      globals: {
        escapeAttr: 'readonly',
        escapeHtml: 'readonly',
        moneyFull: 'readonly',
        reconciliationData: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^(renderFundTransferWorksheet|collectFundTransferInstructions)$' },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/giving/reconciliation-reports.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(ParishReconciliationReport|renderReconciliationAllocations|setReconcileAllocView|renderReconciliationGiftActivity|renderReconciliationPayouts|renderReconciliationExceptions|exportReconciliationCsv|printFundTransferWorksheet|printReconciliationReport|renderReconciliationReviewHistory)$',
        },
      ],
    },
  },
  {
    files: ['public/parish/features/giving/reconciliation-reports.js'],
    languageOptions: {
      globals: {
        reconciliationData: 'readonly',
        escapeHtml: 'readonly',
        statusLabel: 'readonly',
        reconciliationDate: 'readonly',
        moneyFull: 'readonly',
        setStatus: 'readonly',
        collectFundTransferInstructions: 'readonly',
        currentParish: 'readonly',
        downloadBlob: 'readonly',
        reconciliationMonthLabel: 'readonly',
        fundReportColor: 'readonly',
      },
    },
    rules: {
      // Compiler escapes closing script tags in printable HTML; source lint remains strict.
      'no-useless-escape': 'off',
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(renderReconciliationAllocations|setReconcileAllocView|renderReconciliationGiftActivity|renderReconciliationPayouts|renderReconciliationExceptions|exportReconciliationCsv|printFundTransferWorksheet|printReconciliationReport|renderReconciliationReviewHistory)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/giving/reconciliation.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(reconciliationDate|reconciliationMonthLabel|initReconciliationMonths|loadFundTransferWorksheet|saveReconciliationClose)$',
        },
      ],
    },
  },
  {
    files: ['public/parish/features/giving/reconciliation.js'],
    languageOptions: {
      globals: {
        currentParish: 'readonly',
        authHeaders: 'readonly',
        moneyFull: 'readonly',
        setStatus: 'readonly',
        renderReconciliationAllocations: 'readonly',
        renderReconciliationPayouts: 'readonly',
        renderReconciliationExceptions: 'readonly',
        renderReconciliationGiftActivity: 'readonly',
        renderFundTransferWorksheet: 'readonly',
        collectFundTransferInstructions: 'readonly',
        renderReconciliationReviewHistory: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(reconciliationDate|reconciliationMonthLabel|initReconciliationMonths|loadFundTransferWorksheet|saveReconciliationClose)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/giving/feasts.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(toggleFeastCampaign|updateFeastCampaignFund|patronalFeastDisplayName|patronalMonthOptions|syncPatronalFeastOptionsFromSettings|upsertPatronalFeastCampaign|renderFeastCampaignSetup)$',
        },
      ],
    },
  },
  {
    files: ['public/parish/features/giving/feasts.js'],
    languageOptions: {
      globals: {
        editableFeastCampaigns: 'writable',
        currentParish: 'readonly',
        renderGivingOptionsEditor: 'readonly',
        setStatus: 'readonly',
        editableFunds: 'readonly',
        escapeHtml: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(toggleFeastCampaign|updateFeastCampaignFund|patronalFeastDisplayName|patronalMonthOptions|syncPatronalFeastOptionsFromSettings|upsertPatronalFeastCampaign|renderFeastCampaignSetup)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/giving/options.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(fillGivingPreset|addGivingOption|editGivingOption|updateGivingOption|removeGivingOption|renderGivingOptionsEditor)$',
        },
      ],
    },
  },
  {
    files: ['public/parish/features/giving/options.js'],
    languageOptions: {
      globals: {
        escapeHtml: 'readonly',
        escapeAttr: 'readonly',
        restrictionLabel: 'readonly',
        allGifts: 'readonly',
        editableFunds: 'readonly',
        isGeneralDashboardFund: 'readonly',
        isCandleDashboardFund: 'readonly',
        hasGivingPlusAccess: 'readonly',
        editableCampaigns: 'readonly',
        editableFeastCampaigns: 'writable',
        moneyFull: 'readonly',
        setStatus: 'readonly',
        slugifyLocal: 'readonly',
        renderFeastCampaignSetup: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(fillGivingPreset|addGivingOption|editGivingOption|updateGivingOption|removeGivingOption|renderGivingOptionsEditor)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/giving/outside-gifts.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(outsidePledgeFields|outsideSourceFields|submitOutsideVoid|openOutsideGift|submitOutsideGift|closeOutsideGift|outsideGiftAction|submitOutsideAccounting)$',
        },
      ],
    },
  },
  {
    files: ['public/parish/features/giving/outside-gifts.js'],
    languageOptions: {
      globals: {
        currentParish: 'readonly',
        authHeaders: 'readonly',
        escapeHtml: 'readonly',
        escapeAttr: 'readonly',
        moneyFull: 'readonly',
        loadGivingHistory: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(outsidePledgeFields|outsideSourceFields|submitOutsideVoid|openOutsideGift|submitOutsideGift|closeOutsideGift|outsideGiftAction|submitOutsideAccounting)$',
        },
      ],
    },
  },
  {
    files: [
      'src/browser/liturgical-calendar.ts',
      'src/browser/myagapay/shell-contracts.d.ts',
      'src/browser/myagapay/ministry-home.ts',
      'src/browser/myagapay/koinonia-experience.ts',
      'src/browser/myagapay/church-year.ts',
      'src/browser/myagapay/watch.ts',
    ],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^Window$' }],
    },
  },
  {
    files: ['src/browser/myagapay/media.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^(Window|Document|HTMLElement)$' }] },
  },
  {
    files: ['src/browser/myagapay/feed.ts'],
    // These classic-script entry points are called by the generated announcement HTML.
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^(setFeedCategoryFilter|openFeedAnnouncement)$' },
      ],
    },
  },
  {
    files: ['public/liturgical-calendar.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
    rules: recommendedRules,
  },
  {
    files: ['src/browser/myagapay/app-header.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^WindowEventMap$' }] },
  },
  {
    files: ['src/browser/myagapay/signups.ts'],
    // Existing HTML invokes these classic-script controls.
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(closeSignupSheet|openSignupClaimModal|openSignupCoverageModal|cancelSignupEntry|joinSignupWaitlist)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/myagapay/prayer-requests.ts'],
    // These classic-script entry points are called by the existing page and rendered cards.
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(setPrayerFilter|toggleMyPrayerRequests|openPrayerComposer|submitPrayerRequest|togglePrayer|markPrayerAnswered|archivePrayerRequest|openPrayerReport|submitPrayerReport)$',
        },
      ],
    },
  },
  // Preserve existing imports and parameter destructuring during behavior-neutral migration.
  {
    files: ['src/directory/publication.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^boolToInt$' }] },
  },
  {
    files: ['src/directory/child-publication.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^parishId$' }] },
  },
  // Retain the existing compatibility print helper without changing emitted behavior.
  {
    files: ['src/handlers/accounting-payables-budgets.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^printableCheck$' }] },
  },
  // Classic-script globals and HTML entry points remain supplied by their existing consumers.
  {
    files: ['src/browser/parish/staff-login.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^(showParishStaffLogin|loginParishStaff)$',
        },
      ],
    },
  },
  {
    files: ['public/parish/features/giving.js'],
    languageOptions: {
      globals: {
        activeTab: 'readonly',
        currentParish: 'writable',
        allGifts: 'readonly',
        loadGivingHistory: 'readonly',
        renderGiversPanel: 'readonly',
        renderGivingOptionsEditor: 'readonly',
        loadSettlementProfilesPanel: 'readonly',
        loadReconciliation: 'readonly',
        statusLabel: 'readonly',
        loadGivingSummary: 'readonly',
        loadGivingOverviewInsights: 'readonly',
        loadWeeklyFunds: 'readonly',
        loadOutsideGiving: 'readonly',
        loadRecurringHealth: 'readonly',
        renderQrCode: 'readonly',
        loadCommemorations: 'readonly',
        initReconciliationMonths: 'readonly',
      },
    },
    rules: {},
  },
  {
    files: ['public/parish/features/stewardship/fees.js'],
    languageOptions: {
      globals: {
        escapeHtml: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^(renderStewardshipFees|selectStewardshipFeePeriod)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/stewardship/fees.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^(selectStewardshipFeePeriod|renderStewardshipFees)$',
        },
      ],
    },
  },
  {
    files: ['public/parish/features/campaigns/website-embed.js'],
    languageOptions: {
      globals: {
        currentParish: 'writable',
      },
    },
    rules: {},
  },
  {
    files: ['public/parish/dashboard-runtime.js'],
    languageOptions: {
      globals: {
        dashboardLoadPromise: 'writable',
        currentParish: 'writable',
        bookstoreCatalogState: 'writable',
        bookstoreLowStockOnly: 'writable',
        parishFeatureRequests: 'writable',
        activeTab: 'readonly',
        setStatus: 'readonly',
        authHeaders: 'readonly',
        refreshSubscriptionStatus: 'readonly',
        refreshStripeStatus: 'readonly',
        refreshParishLibraryNavigationStatus: 'readonly',
        saveSession: 'readonly',
        renderDashboard: 'readonly',
        syncBookstoreLowStockNavigation: 'readonly',
        loadBookstoreLowStockBadge: 'readonly',
        switchTab: 'readonly',
        setSacramentsDashboardTab: 'readonly',
        showParishFeatureRequestPopup: 'readonly',
        updateStewardshipBadges: 'readonly',
        isParishPlusActive: 'readonly',
        loadRegisteredParishFeature: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^(loadDashboard|bookstoreCatalogState|bookstoreLowStockOnly|parishFeatureRequests)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/dashboard-runtime.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^(loadDashboard)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/commerce.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^(bookstoreLowStockOnly|setCommerceOverviewRange|refreshCommerceOverview)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/staff-access.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(updateParishStaffRoleHelp|inviteParishStaff|copyParishStaffInvite|revokeParishStaffInvitation)$',
        },
      ],
    },
  },
  {
    files: ['public/parish/features/stewardship/nudges.js'],
    languageOptions: {
      globals: {
        currentParish: 'writable',
        stewardshipApi: 'readonly',
        authHeaders: 'readonly',
        escapeHtml: 'readonly',
        setStatus: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^(checkNudgeEligibility|sendNudges)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/stewardship/nudges.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^(checkNudgeEligibility|sendNudges)$',
        },
      ],
    },
  },
  {
    files: ['public/parish/features/stewardship/reports.js'],
    languageOptions: {
      globals: {
        currentParish: 'writable',
        authHeaders: 'readonly',
        escapeHtml: 'readonly',
        escapeAttr: 'readonly',
        fmtDollars: 'readonly',
        swNumber: 'readonly',
        gmKpi: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(renderGivingMetrics|ensureDiocesanStatisticsCard|loadDiocesanStatisticsPreview|downloadDiocesanStatisticsReport|saveDiocesanStatisticsTotals)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/stewardship/reports.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(renderGivingMetrics|saveDiocesanStatisticsTotals|loadDiocesanStatisticsPreview|downloadDiocesanStatisticsReport)$',
        },
      ],
    },
  },
  {
    files: ['public/parish/features/stewardship/financials-editor.js'],
    languageOptions: {
      globals: {
        financialsState: 'readonly',
        escapeAttr: 'readonly',
        fmtDollars: 'readonly',
        escapeHtml: 'readonly',
        currentParish: 'writable',
        stewardshipApi: 'readonly',
        authHeaders: 'readonly',
        loadFinancialSnapshotsPanel: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(openFinancialsEditor|recalculateRestrictedFundRow|addFinancialsAssetRow|removeFinancialsAssetRow|saveFinancialsSnapshot)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/stewardship/financials-editor.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(openFinancialsEditor|recalculateRestrictedFundRow|addFinancialsAssetRow|removeFinancialsAssetRow|saveFinancialsSnapshot)$',
        },
      ],
    },
  },
  {
    files: ['public/parish/features/stewardship/outside-giving.js'],
    languageOptions: {
      globals: {
        financialsState: 'readonly',
        currentParish: 'writable',
        isParishTier: 'readonly',
        renderGivingMetricsUpgrade: 'readonly',
        givingMetricsState: 'readonly',
        stewardshipApi: 'readonly',
        authHeaders: 'readonly',
        escapeHtml: 'readonly',
        escapeAttr: 'readonly',
        loadGivingMetricsPanel: 'readonly',
        loadStewardshipHealthScorePanel: 'readonly',
        loadFinancialSnapshotsPanel: 'readonly',
        outsideRequest: 'readonly',
        resetOutsideParish: 'readonly',
        outsideGivingState: 'readonly',
        outsideGiftAction: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(openOutsideAgapayGiving|closeOutsideAgapayGiving|submitManualIncomeEntry|deleteManualIncomeEntry|ensureOutsideGivingCard|reviewCollectionAccounting)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/stewardship/outside-giving.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(openOutsideAgapayGiving|closeOutsideAgapayGiving|submitManualIncomeEntry|reviewCollectionAccounting|deleteManualIncomeEntry)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/commerce/bookstore-checkout.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(copyBookstoreGuestCheckoutLink|downloadBookstoreGuestCheckoutQrSvg|downloadBookstoreGuestCheckoutQrPng)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/donor/bookstore-experience.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(bookstoreExperienceEnabled|toggleBookstoreSaved|toggleBookstoreSavedView|scrollBookstoreSellers|setBookstoreSort|bookstoreExperienceProducts|openBookstoreDetail|addBookstoreDetailToCart|openBookstoreBag|browseBookstoreCollection)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/commerce.ts'],
    rules: {
      'prefer-const': 'off',
    },
  },
  {
    files: ['src/browser/parish/features/stewardship/nudges.ts'],
    rules: {
      '@typescript-eslint/no-unused-expressions': [
        'error',
        {
          allowShortCircuit: true,
        },
      ],
    },
  },
  {
    files: ['public/parish/diagnostics.js', 'public/parish/features/stewardship/nudges.js'],
    rules: {
      'no-empty': [
        'error',
        {
          allowEmptyCatch: true,
        },
      ],
    },
  },
  // Preserve the existing classic-script entry points, external state assignments and ternary side effects.
  {
    files: ['src/browser/parish/features/accounting.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(accountingView|accountingReportView|accountingCustomReport|accountingDepthComparative|accountingData|accountingBankPreview|accountingFundCatalog|accountingShowInactiveFunds|accountingFundAccountSections|accountingExpenseAccountEditor|accountingVendorLifecycleConfirm|accountingAccountLifecycleConfirm|accountingLifecycleMessage|accountingReconciliationView|accountingCloseDetail|accountingJournalEditor|accountingLedgerNewestFirst|accountingLedgerAccountNumber|accountingLedgerSearch|accountingRegisterEntryMode|accountingRecurringEditor|accountingPayablesView|accountingBudgetReport|accountingBudgetEditor|accountingMigration|accountingAdvancedNavExpanded|accountingSimpleIncomeMessage|accountingSimpleEntryMode|accountingInKindGiftMessage|accountingExperienceMode|ACCOUNTING_SIMPLE_REVENUE_LABELS|bootstrapAccountingStaff|verifyAccountingStaff|addAccountingStaff|changeAccountingPin|lockAccountingWorkspace|accountingApi|accountingMoney|accountingDate)$',
        },
      ],
      'prefer-const': 'off',
    },
  },
  {
    files: ['src/browser/parish/features/accounting/report-loaders.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^(loadAccountingCoreReport|accountingPriorYear|accountingGeneralLedgerReport)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/accounting/report-documents.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^(accountingStatementHtml|accountingStatementActions|downloadAccountingReportPdf)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/accounting/funds.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(loadAccountingFunds|toggleAccountingFundAccountSection|renderAccountingFunds|toggleAccountingInactiveFunds|filterAccountingFunds|showAccountingExpenseAccountForm|showAccountingAccountForm|saveAccountingExpenseAccount|beginAccountingAccountLifecycle|cancelAccountingLifecycle|changeAccountingAccountLifecycle)$',
        },
      ],
      '@typescript-eslint/no-unused-expressions': [
        'error',
        {
          allowTernary: true,
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/accounting/activation.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(openAccountingActivation|startAccountingActivation|retryAccountingActivation|previewAccountingActivationChart|updateAccountingActivationTypes|commitAccountingActivationChart|finishAccountingActivation)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/accounting/close.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(renderAccountingClose|createAccountingClose|createAccountingYearEnd|waiveAccountingCloseCheck|completeAccountingClose|printAccountingClosePacket|downloadAccountingAuditTrail|downloadAccountingAccountantExport|createAccountingAdjustment|postAccountingAdjustment|createAccountingAdjustmentTemplate|archiveAccountingFiscalYear|reopenAccountingFiscalYear|renderAccountingGovernance|saveAccountingRetention|createAccountingLegalHold|releaseAccountingLegalHold)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/accounting/migration.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(openAccountingMigration|closeAccountingMigration|createAccountingMigrationSession|resumeAccountingMigration|setAccountingMigrationStep|previewAccountingMigrationCsv|commitAccountingMigrationStep|renderAccountingMigrationWizard)$',
        },
      ],
      'prefer-const': 'off',
    },
  },
  {
    files: ['src/browser/parish/features/commerce/bookstore-catalog.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(bookstoreEditingProductId|bookstoreEditingOriginalStock|loadBookstoreLowStockBadge|bookstoreCategoryOptions|toggleBookstoreFeature)$',
        },
      ],
      'prefer-const': 'off',
    },
  },
  {
    files: ['src/browser/parish/features/commerce/bookstore-counts.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(syncBookstoreCountDifference|startBookstorePhysicalCount|openBookstoreDraftCount|closeBookstorePhysicalCount|openBookstoreClosedCount)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/commerce/bookstore-inventory.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(setBookstoreLowStockFilter|saveBookstoreReorderThreshold|openBookstoreItemModal|submitBookstoreReceiving|renderBookstoreStarterCatalogUI|submitBookstoreStarterCatalog|submitBookstoreManualItem|saveBookstoreItemFromModal|archiveBookstoreItem)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/commerce/bookstore-sales.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^(setBookstoreSalesRange|searchBookstoreOrders|loadMoreBookstoreOrders)$',
        },
      ],
      'prefer-const': 'off',
    },
  },
  {
    files: ['src/browser/parish/features/commerce/offerings.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(toggleCommerceOfferingFeature|submitParishCommerceOffering|moveParishCommerceOffering|toggleEventsOversightStatus|toggleEventsCalendarVisibility)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/koinonia.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(koinoniaMinistriesState|prayerAdminState|koinoniaMinistryImageUrls|prayerAdminApi|announcementStatusLabel|contentCategoryLabel|saveParishBlogSettings|toggleCommunicationsFeature|toggleKoinoniaSubfeature)$',
        },
      ],
      'prefer-const': 'off',
    },
  },
  {
    files: ['src/browser/parish/features/koinonia/prayers.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(setParishPrayerFilter|quickApproveParishPrayer|openParishPrayerReview|submitParishPrayerReview|saveParishPrayerSettings)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/koinonia/announcements.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(openKoinoniaComposer|renderKoinoniaOverview|renderCommunicationsList|toggleAnnouncementReaders|insertAnnouncementFormatting|insertTeachingFormatting|createAnnouncementDraft|editAnnouncement|saveAnnouncementEdit|publishAnnouncement|archiveAnnouncement|deleteAnnouncement)$',
        },
      ],
    },
  },
  {
    files: ['public/parish/features/stewardship.js'],
    languageOptions: {
      globals: {
        currentParish: 'readonly',
        isStarterTier: 'readonly',
        isParishTier: 'readonly',
        isParishPlusActive: 'readonly',
        syncDashboardPaywall: 'readonly',
        renderParishPlusMeetingsPane: 'readonly',
        authHeaders: 'readonly',
        updateStewardshipBadges: 'readonly',
        loadStewardshipHealthScorePanel: 'readonly',
        loadGivingMetricsPanel: 'readonly',
        loadFinancialSnapshotsPanel: 'readonly',
        loadDonorConcentrationPanel: 'readonly',
        loadRecurringGivingPanel: 'readonly',
        loadGivingIntelligencePanels: 'readonly',
        loadStewardshipAttendancePanel: 'readonly',
        loadDiocesanStatisticsPreview: 'readonly',
        ensureDiocesanStatisticsCard: 'readonly',
        escapeHtml: 'readonly',
        setStatus: 'readonly',
        setStewardshipReportMonth: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^(dismissStewardshipCompNotice|startStewardshipSubscription|openStewardshipBilling)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/stewardship.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^(dismissStewardshipCompNotice|startStewardshipSubscription|openStewardshipBilling)$',
        },
      ],
    },
  },
  {
    files: ['public/parish/features/stewardship/metrics.js'],
    languageOptions: {
      globals: {
        currentParish: 'readonly',
        stewardshipApi: 'readonly',
        authHeaders: 'readonly',
        checkNudgeEligibility: 'readonly',
        escapeHtml: 'readonly',
        parishSessionStorageKey: 'readonly',
        renderGivingMetrics: 'readonly',
        ensureOutsideGivingCard: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(loadGivingMetricsPanel|loadStewardshipHealthScorePanel|loadDonorConcentrationPanel|loadRecurringGivingPanel|loadGivingIntelligencePanels|loadStewardshipAttendancePanel|saveStewardshipAttendance|saveAttendanceDelegate|syncAttendanceEntryFromWeek|openStewardshipMonthlyReport|setStewardshipReportMonth|selectedStewardshipReportMonth)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/stewardship/metrics.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(loadGivingMetricsPanel|syncAttendanceEntryFromWeek|saveStewardshipAttendance|saveAttendanceDelegate|loadGivingIntelligencePanels|loadStewardshipHealthScorePanel|loadDonorConcentrationPanel|loadRecurringGivingPanel|setStewardshipReportMonth|openStewardshipMonthlyReport)$',
        },
      ],
      'prefer-const': 'off',
    },
  },
  {
    files: ['public/parish/features/stewardship/financials.js'],
    languageOptions: {
      globals: {
        currentParish: 'readonly',
        isParishTier: 'readonly',
        stewardshipApi: 'readonly',
        authHeaders: 'readonly',
        escapeHtml: 'readonly',
        accountingMoney: 'readonly',
        escapeAttr: 'readonly',
        parishSessionStorageKey: 'readonly',
        selectedStewardshipReportMonth: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^(importAccountingFinancialSnapshot|openStewardshipMonthlyFinancialReport)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/stewardship/financials.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^(importAccountingFinancialSnapshot|openStewardshipMonthlyFinancialReport)$',
        },
      ],
      'prefer-const': 'off',
    },
  },
  {
    files: ['public/parish/features/stewardship/meetings.js'],
    languageOptions: {
      globals: {
        stewardshipState: 'readonly',
        escapeHtml: 'readonly',
        escapeAttr: 'readonly',
        parishSessionStorageKey: 'readonly',
        currentParish: 'readonly',
        setStatus: 'readonly',
        stewardshipApi: 'readonly',
        authHeaders: 'readonly',
        statusLabel: 'readonly',
        loadStewardshipPanel: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(renderParishPlusMeetingsPane|newStewardshipMeeting|editStewardshipMeeting|closeStewardshipEditor|addStewardshipRow|removeStewardshipRow|saveStewardshipMeeting)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/stewardship/meetings.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(renderParishPlusMeetingsPane|newStewardshipMeeting|editStewardshipMeeting|closeStewardshipEditor|addStewardshipRow|removeStewardshipRow|saveStewardshipMeeting)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/koinonia/media.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(renderTeachingAdminList|renderVideoAdminList|renderYouTubeAdminList|chooseTeachingAudioUpload|setTeachingAudioLink|createTeachingDraft|editTeachingPost|publishTeachingPost|archiveTeachingPost|deleteTeachingPost|createVideoUpload|editVideoPost|publishVideoPost|archiveVideo|deleteVideo|addYouTubeVideo|toggleTeachingPin|saveYouTubeChannel|removeYouTubeChannel|removeYouTubeVideo|toggleYouTubeVideoPin)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/koinonia/ministries.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(uploadKoinoniaMinistryImage|removeKoinoniaMinistryImage|deleteKoinoniaMinistry|selectKoinoniaMinistry|toggleKoinoniaMinistryEditor|updateKoinoniaMinistry|createKoinoniaMinistry|searchKoinoniaMinistryPeople|addKoinoniaMinistryMember|removeKoinoniaMinistryMember|setKoinoniaMinistryDirectoryBadge|reviewKoinoniaMinistryRequest|acknowledgeKoinoniaGeneralInterest|saveKoinoniaCalendar)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/recovery.ts'],
    rules: {
      'prefer-const': 'off',
    },
  },
  {
    files: ['src/browser/parish/directory-import.ts'],
    rules: {
      '@typescript-eslint/no-unused-expressions': [
        'error',
        {
          allowTernary: true,
        },
      ],
    },
  },
  {
    files: ['public/parish/features/accounting.js'],
    rules: {
      'no-empty': [
        'error',
        {
          allowEmptyCatch: true,
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/campaigns.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(openNewCampaignForm|editCampaign|closeCampaignEditor|handleCoverUpload|removeCoverPhoto|handlePhotosUpload|removeCampPhoto|saveCampaign|postCampaignUpdate)$',
        },
      ],
    },
  },
  {
    files: ['public/parish/features/campaigns.js'],
    languageOptions: {
      globals: {
        currentParish: 'writable',
        authHeaders: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(openNewCampaignForm|editCampaign|closeCampaignEditor|handleCoverUpload|removeCoverPhoto|handlePhotosUpload|removeCampPhoto|saveCampaign|postCampaignUpdate)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/sacraments/preparation.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(renderSacramentsPreparationTemplates|addPreparationTemplateItem|removePreparationTemplateItem|savePreparationTemplate|uploadPreparationGuide|deletePreparationGuide)$',
        },
      ],
    },
  },
  {
    files: ['public/parish/features/stewardship.js'],
    rules: {
      'no-empty': [
        'error',
        {
          allowEmptyCatch: true,
        },
      ],
    },
  },
  // Retain dormant legacy functions, imports and omission destructuring during behavior-preserving migration.
  {
    files: ['src/handlers/giving-statements.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { caughtErrorsIgnorePattern: '^error$' }] },
  },
  { files: ['src/handlers/identity.ts'], rules: { 'prefer-const': 'off' } },
  {
    files: ['src/handlers/listen.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^env$' }] },
  },
  {
    files: ['src/handlers/parish-outside-gifts.ts', 'src/handlers/parish-video.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }] },
  },
  {
    files: ['src/handlers/parish-sacraments.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^(sacramentsEnabledFor|isValidTimezone)$' }],
    },
  },
  {
    files: ['src/handlers/parish-teaching.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^unauthorized$' }] },
  },
  {
    files: ['src/handlers/sacrament-preparation.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^sacramentsEnabledFor$' }] },
  },
  {
    files: ['src/handlers/stewardship-financials.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^(authoritativeFunds|handleLegacyStewardshipFinancials)$' },
      ],
    },
  },
  { files: ['src/browser/bookstore/app.ts', 'src/handlers/nonprofit-pricing.ts'], rules: { 'prefer-const': 'off' } },
  // Preserve classic inline-action globals and existing dormant legacy code during migration.
  {
    files: ['src/browser/parish/features/accounting/ledger.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(submitAccountingRegisterEntry|editAccountingRecurring|saveAccountingRecurring|toggleAccountingRecurring|journalLineTemplate|renderAccountingJournalEditor|bindAccountingJournalLine|newAccountingJournal|editAccountingJournal|closeAccountingJournal|addAccountingJournalLine|removeAccountingJournalLine|collectAccountingJournal|updateAccountingJournalBalance|saveAccountingJournal|validateAccountingJournal|postAccountingJournal|reverseAccountingJournal|voidAccountingJournal|initializeAccounting|validateAccountingLedgerFoundation|postAccountingOpeningBalances)$',
          argsIgnorePattern: '^(err|claim|registration|sync)$',
          caughtErrorsIgnorePattern: '^err$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/accounting/banking.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(renderAccountingBankStatements|renderAccountingBanking|setAccountingReconciliationView|renderAccountingIntegrationsBase|renderAccountingIntegrations|renderAccountingServiceInvoices|postAccountingServiceInvoice|configureAccountingCommerceItem|previewAccountingCommerceBackfill|loadAccountingPhaseE|showAccountingBankAccountForm|phaseEMutation|createAccountingBankAccount|previewAccountingBankCsv|commitAccountingBankCsv|createAccountingReconciliation|completeAccountingReconciliation|editAccountingBankAccount|updateAccountingBankAccount|showAccountingEligibleItems|showAccountingReconciliationAdjustment|postAccountingReconciliationAdjustment|saveAccountingIntegrationSettings|accountingMatchSuggestions|showAccountingMatchSuggestions|confirmAccountingSuggestedMatch|renderAccountingFeeCoverageRepair|previewAccountingFeeCoverage)$',
          argsIgnorePattern: '^(err|claim|registration|sync)$',
          caughtErrorsIgnorePattern: '^err$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/accounting/treasurer.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(accountingSimpleRevenueOptions|accountingSimpleFundOptions|accountingSimpleIncomeForm|accountingIncomeSplitRow|enableAccountingIncomeSplits|disableAccountingIncomeSplits|addAccountingIncomeSplit|removeAccountingIncomeSplit|collectAccountingIncomeSplits|updateAccountingSplitDepositBalance|accountingSimpleActivityFeed|accountingInKindDebitOptions|accountingInKindGiftForm|accountingOverviewHero|accountingOverviewFundSummary|accountingOverviewFundRank|renderAccountingOverview|accountingRegisterModel|accountingRegisterEntryForm|accountingRecurringPanel|accountingPledgeAccountSetting|submitAccountingSimpleIncome|submitAccountingInKindGift)$',
          argsIgnorePattern: '^(err|claim|registration|sync)$',
          caughtErrorsIgnorePattern: '^err$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/accounting/workspace.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(renderAccountingAttachments|accountingUpload|downloadAccountingAttachment|removeAccountingAttachment|accountingPreviewOnly|renderAccountingPaywall|renderAccountingReadiness|accountingViewTitle|syncAccountingExperienceChrome|setAccountingExperienceMode|toggleAccountingAdvancedNav|renderAccountingPane|openAccountingJournalAttachments|toggleAccountingLedgerOrder|setAccountingLedgerAccount|searchAccountingLedger|clearAccountingLedgerSearch|setAccountingRegisterEntryMode|applyAccountingRegisterDefaultFund|setAccountingView|openAccountingSimpleIncome|openAccountingInKindGift|openAccountingSimpleBill|loadAccountingTab|loadAccountingPhaseD|saveAccountingSettings)$',
          argsIgnorePattern: '^(err|claim|registration|sync)$',
          caughtErrorsIgnorePattern: '^err$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/accounting/reports.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(ACCOUNTING_REPORT_LIBRARY|accountingReportDateRange|accountingReportPeriod|accountingReportLedgerRows|accountingTabularReport|renderAccountingReportLibrary|filterAccountingReportLibrary|openAccountingReport|loadAccountingDepthReport|toggleAccountingDepthComparative|loadAccountingBudgetLibraryReport|renderAccountingReports|openAccountingIncomeReport|accountingIncomeSummary|setAccountingReportView|downloadAccountingReport|printAccountingReport|downloadAccountingFile|downloadAccountingLedger|printAccountingLedger|accountingReportDateForm|applyAccountingReportDates|renderAccountingExpenses)$',
          argsIgnorePattern: '^(err|claim|registration|sync)$',
          caughtErrorsIgnorePattern: '^err$',
        },
      ],
    },
  },
  {
    files: ['src/browser/myagapay/exchange.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(exchangeState|exchangeObjectUrls|exchangeDraftPhotos|exchangeDraftPhotoUrls|requestedExchangeListingId|requestedExchangeThreadId|exchangeEscape|exchangeHeaders|exchangeStatus|exchangeCategoryLabel|exchangeMoney|exchangeDate|exchangeFetch|releaseExchangeObjectUrls|privateExchangePhoto|hydrateExchangePhotos|exchangePhotoFrameHtml|exchangePhotoHtml|exchangeDetailPhotosHtml|syncExchangeUrl|renderExchangeListings|exchangeThreadListHtml|renderExchangeDetail|renderExchangeMessages|toggleExchangeComposer|toggleMyExchangeListings|loadExchangeListings|openExchangeListing|closeExchangeDetail|validExchangePhoto|releaseExchangeDraftPhotoUrls|renderExchangeDraftPhotos|selectExchangePhotos|removeExchangeDraftPhoto|clearExchangeDraftPhotos|syncExchangeListingType|uploadExchangePhoto|addPhotosToExchangeListing|createExchangeListing|completeExchangeListing|startExchangeThread|loadExchangeThreads|openExchangeThread|sendExchangeMessage|setDefaultExchangeExpiry)$',
          argsIgnorePattern: '^(err|claim|registration|sync)$',
          caughtErrorsIgnorePattern: '^err$',
        },
      ],
    },
  },
  {
    files: ['src/browser/admin/controllers/tax-exemptions.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(texClaimsCache|texSelectedId|texDebounceTimer|TEX_STATUS_LABELS|TEX_SYNC_LABELS|texBadge|texStatusBadge|texSyncBadge|texSelectedVersion|texFetch|texRunMutation|loadTaxExemptionSummary|setTexStatusFilter|onTexFilterChange|debouncedTexFilterChange|loadTaxExemptions|texNoStatewideNote|renderTaxExemptionQueue|closeTexDetail|openTexDetail|texMaskedCertificate|texNotAvailableNotice|texRenderStripeSyncRows|renderTexDetail|renderTexActionButtons|texOpenApproveConfirm|texOpenReasonForm|texApprove|texSubmitReasonAction|texRetryAll|texRetryOne|texOpenReconcile|texSubmitReconcile|texAddNote|texViewDocument|hasCurrentDocument|workflowEnabled)$',
          argsIgnorePattern: '^(err|claim|registration|sync)$',
          caughtErrorsIgnorePattern: '^err$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/onboarding.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(treasurerAffirmationCopy|onboardingSignoffMarkup|renderSimpleParishSetupWizard|renderDeterministicOnboardingWizard|givingSetupWizardStep|givingSetupDraft|givingSetupSaving|givingSetupReturnFocus|givingSetupKeydown|givingSetupTierDetails|activeGivingSetupItems|buildGivingSetupDraft|closeGivingSetupWizard|captureGivingSetupWizardStep|givingSetupChoiceRows|givingSetupPresetButtons|givingSetupBasicsMarkup|givingSetupChoicesMarkup|givingSetupReviewMarkup|renderGivingSetupWizard|openGivingSetupWizard|setGivingSetupWizardStep|addGivingSetupPreset|addGivingSetupCustom|removeGivingSetupChoice|saveGivingSetupWizard|submitTreasurerGoLive|renderOnboardingSetup)$',
          argsIgnorePattern: '^(err|claim|registration|sync)$',
          caughtErrorsIgnorePattern: '^err$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/sacraments/pastoral-followup.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(sacramentsDashboardTab|pastoralFollowUpState|pastoralAuthHeaders|PASTORAL_REASON_LABELS|PASTORAL_CONTACT_LABELS|PASTORAL_CLOSURE_LABELS|MEMORIAL_MARKER_LABELS|loadPastoralFollowUps|searchPastoralFollowUpCandidates|pastoralDateOnly|pastoralToday|pastoralDateFromToday|pastoralLocalDateTime|pastoralNextDue|pastoralAddCalendarDate|pastoralMemorialDates|pastoralRelativeDue|pastoralLastContact|pastoralReasonOptions|pastoralClosureOptions|pastoralPriestOptions|pastoralCreatePriestField|pastoralFollowUpCard|pastoralQueue|memorialMarkerCard|memorialQueue|pastoralAddForm|pastoralStandaloneReposeForm|renderPastoralFollowUps|togglePastoralContactForm|togglePastoralSettings|togglePastoralClosure|togglePastoralReposeFields|updatePastoralMemorialPreview|togglePastoralContactClose|toggleMemorialSchedule|pastoralMutation|createPastoralFollowUp|renderPastoralCareOwner|setPastoralScope|searchPastoralReposeCandidates|recordStandalonePastoralRepose|openPastoralReposeFromDirectory|savePastoralContact|savePastoralSettings|snoozePastoralFollowUp|savePastoralClosure|updateMemorialMarker|scheduleMemorialMarker|arrangeMemorialElsewhere|skipMemorialMarker|completeMemorialMarker|reopenMemorialMarker|openMemorialRequest|reopenPastoralFollowUp|openPastoralSchedule|installSacramentPastoralFollowUp)$',
          argsIgnorePattern: '^(err|claim|registration|sync)$',
          caughtErrorsIgnorePattern: '^err$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/koinonia/bulletins.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(bulletinState|bulletinQrLoading|bulletinLiturgicalRequestId|bulletinApi|installBulletinEntryPoints|ensureBulletinWorkspace|nextSundayDate|bulletinDisplayDate|newBulletinBlock|createBulletinPreviewDraft|openBulletinWorkspace|loadBulletins|initializeBulletinBuilder|ensureBulletinQr|renderBulletinDraftSelect|openBulletinDraft|createNewBulletinDraft|updateBulletinField|updateBulletinServiceDate|addBulletinBlock|selectBulletinBlock|removeBulletinBlock|moveBulletinBlock|updateBulletinBlockField|addBulletinItem|updateBulletinItem|removeBulletinItem|newBulletinHymn|addBulletinHymn|updateBulletinHymn|removeBulletinHymn|refreshBulletinHymnsFromLibrary|bulletinBlockMarkup|bulletinPageHeaderMarkup|bulletinFoldSaintFeatureMarkup|renderFoldedBulletin|bulletinBlockLabel|renderBulletinPage|renderBulletinOutline|renderBulletinBlockEditor|renderBulletinSaveState|renderBulletinBuilder|duplicateBulletinDraft|saveBulletinDraft|openTempleTropariaEditor|closeTempleTropariaEditor|addTempleTroparionDraft|updateTempleTroparionDraft|removeTempleTroparionDraft|renderTempleTropariaEditor|saveTempleTroparia|printBulletinPreview)$',
          argsIgnorePattern: '^(err|claim|registration|sync)$',
          caughtErrorsIgnorePattern: '^err$',
        },
      ],
    },
  },
  {
    files: ['src/browser/donor/controllers/history.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(offeringRows|activityDate|productActivityLabel|productFromOffering|buildHistoryActivities|historyActivityRows|donorOfferingIsComplete|renderDonorGivingStory|renderProductFilterState|renderAgapayHistoryTimeline|renderHistorySummary|historyBookstoreCache|renderOfferingsPayload|loadDonorOfferingsPage|renderDonorOfferings|recurringManagementItems|renderRecurringManagement|openDonorRecurringPortal|filterOfferings|searchOfferings|setHistoryProductFilter|setHistoryPeriodFilter)$',
          argsIgnorePattern: '^(err|claim|registration|sync)$',
          caughtErrorsIgnorePattern: '^err$',
        },
      ],
    },
  },
  {
    files: ['src/browser/donor/controllers/bookstore.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(BOOKSTORE_STATUS_TONE|BOOKSTORE_FULFILLMENT_LABELS|BOOKSTORE_FALLBACK_FIELDS|bookstoreItemFieldsSchema|bookstoreProducts|bookstoreCart|bookstoreCatalogQuery|bookstoreCatalogCategory|bookstoreParishes|bookstoreLoadRevision|bookstoreSwitchPending|loadBookstoreItemFieldsSchema|renderBookstoreItemFields|bookstoreProductById|setBookstoreCatalogQuery|setBookstoreCatalogCategory|bookstoreCategoryIcon|bookstoreBarcodeIcon|bookstoreProductCard|renderBookstorePopularItems|renderBookstoreCategoryFilters|renderBookstoreProducts|renderBookstoreCart|setBookstoreMobileCartOpen|toggleBookstoreMobileCart|addBookstoreProductToCart|changeBookstoreCartQuantity|removeBookstoreCartItem|clearManualBookstoreEntry|addManualBookstoreItem|bookstoreScannerStream|bookstoreScannerRAF|bookstoreZXingReader|bookstoreScannerTorchOn|resetBookstoreScannerTorchControl|enableBookstoreScannerTorchControl|toggleBookstoreScannerTorch|startBookstoreBookScan|openBookstoreScanner|scanWithBarcodeDetector|scanWithZXing|handleBarcodeDetected|closeBookstoreScanner|renderBookstoreParishContext|renderBookstoreParishOptions|loadBookstoreParishOptions|closeBookstoreParishMenu|toggleBookstoreParishMenu|selectBookstoreParish|loadDonorBookstorePage|renderBookstorePayload|requestBookstoreFeature|bookstoreOrderRow|submitBookstoreOrder|handleBookstoreCheckoutReturn)$',
          argsIgnorePattern: '^(err|claim|registration|sync)$',
          caughtErrorsIgnorePattern: '^err$',
        },
      ],
    },
  },
  {
    files: ['src/browser/donor/controllers/calendar.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(calendarShortDateIso|annualIsoFromParishDate|parishPatronalFeastForYear|donorCalendarState|todayIsoLocal|longDateParts|churchCalendarDate|liturgicalRankLabel|isFastRule|toneOfWeekLabel|saintDisplayTitle|saintStoryModalHtml|koinoniaHeroTitle|liturgicalReadingRows|renderDonorTodayInChurch|loadDonorLiturgicalDay|showDonorSaintModal|closeDonorSaintModal|openDonorSaintOfDay|renderDonorCalendarFeasts|renderDonorCalendarPrompts|donorApprovedSacramentEvents|renderDonorPersonalCalendar|donorParishCalendarSubscriptionUrl|donorParishCalendarGoogleUrl|donorParishCalendarPlatform|donorParishCalendarEventDate|donorParishCalendarDateKey|donorParishCalendarEventDateKey|donorParishCalendarEventCategory|DONOR_CALENDAR_CELEBRATION_ICONS|donorParishCalendarView|donorParishCalendarEventsOn|donorParishCalendarCelebrationsOn|donorParishCalendarCelebrationHtml|renderDonorParishCalendarSelectedDate|donorParishCalendarStartOfWeek|renderDonorParishCalendarMonth|selectDonorParishCalendarDate|setDonorParishCalendarView|changeDonorParishCalendarPeriod|renderDonorParishCalendar|donorCalendarCelebrationRequestPath|copyDonorParishCalendarUrl|loadDonorCalendarPage)$',
          argsIgnorePattern: '^(err|claim|registration|sync)$',
          caughtErrorsIgnorePattern: '^err$',
        },
      ],
    },
  },
  {
    files: [
      'src/accounting/commerce/service.ts',
      'src/accounting/reconciliation/service.ts',
      'src/browser/donor/controllers/history.ts',
      'src/browser/parish/features/koinonia/bulletins.ts',
    ],
    rules: { 'prefer-const': 'off' },
  },
  {
    files: ['src/accounting/reconciliation/service.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^transactionDto$' }] },
  },
  {
    files: ['src/accounting/source-wiring.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }] },
  },
  {
    files: ['public/parish/features/onboarding.js'],
    languageOptions: {
      globals: {
        currentParish: 'writable',
        editableFunds: 'writable',
        editableCampaigns: 'writable',
        fundPresets: 'readonly',
        campaignPresets: 'readonly',
        hasGivingPlusAccess: 'readonly',
        fallbackFundsArray: 'readonly',
        isGeneralDashboardFund: 'readonly',
        isCandleDashboardFund: 'readonly',
        escapeHtml: 'readonly',
        escapeAttr: 'readonly',
        slugifyLocal: 'readonly',
        setStatus: 'readonly',
        givingCatalogSnapshot: 'readonly',
        givingCatalogBaseline: 'readonly',
        accountingCatalogSnapshot: 'readonly',
        accountingCatalogBaseline: 'readonly',
        authHeaders: 'readonly',
        loadDashboard: 'readonly',
        renderDashboard: 'readonly',
        tierOptionsMarkup: 'readonly',
        setupCheckMarkup: 'readonly',
        parishHouseholdPickerMarkup: 'readonly',
        syncParishHouseholdPricing: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(onboardingSignoffMarkup|renderSimpleParishSetupWizard|renderDeterministicOnboardingWizard|givingSetupKeydown|givingSetupTierDetails|activeGivingSetupItems|buildGivingSetupDraft|closeGivingSetupWizard|captureGivingSetupWizardStep|givingSetupChoiceRows|givingSetupPresetButtons|givingSetupBasicsMarkup|givingSetupChoicesMarkup|givingSetupReviewMarkup|renderGivingSetupWizard|openGivingSetupWizard|setGivingSetupWizardStep|addGivingSetupPreset|addGivingSetupCustom|removeGivingSetupChoice|saveGivingSetupWizard|submitTreasurerGoLive|renderOnboardingSetup)$',
        },
      ],
    },
  },
  {
    files: ['src/directory/member-directory.ts', 'src/directory/skills-exports.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }] },
  },
  {
    files: ['src/learn/grade-records.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^loadSetup$' }] },
  },
  {
    files: ['src/browser/myagapay/parish-life.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^renderParishLifeCalendarEvents$' }],
    },
  },
  {
    files: ['src/handlers/donor-bookstore.ts', 'src/handlers/tax-exemption-parish.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^env$' }] },
  },
  {
    files: ['src/browser/parish/features/accounting/payables.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(accountingParishOnly|renderAccountingPayables|accountingPayablesTabs|renderAccountingRecurringBills|renderAccountingPayments|renderAccountingPaymentRuns|renderAccounting1099Review|renderAccountingPledgeComparison|renderAccountingBudgets|setAccountingPayablesView|phaseDForm|openAccountingBillDetail|showAccountingVendorForm|saveAccountingVendor|createAccountingVendor|beginAccountingVendorLifecycle|changeAccountingVendorLifecycle|applyAccountingBillVendorDefaults|showAccountingBillForm|createAccountingBill|showAccountingRecurringBillForm|saveAccountingRecurringBill|toggleAccountingRecurringBill|showAccountingPaymentForm|syncAccountingPaymentMethod|loadNextAccountingCheckNumber|showAccountingCheckSettings|saveAccountingCheckSettings|syncAccountingPaymentSelection|createAccountingPayment|showAccountingPaymentRunForm|syncAccountingPaymentRun|createAccountingPaymentRun|postAccountingPaymentRun|printAccountingPaymentRun|loadAccounting1099Review|downloadAccounting1099Review|accountingPhaseDRequest|printAccountingCheck|postAccountingPayment|voidAccountingPayment|accountingBillAction|showAccountingBudgetForm|accountingBudgetLineTemplate|addAccountingBudgetLine|createAccountingBudget|accountingBudgetAction|editAccountingBudgetLines|updateAccountingBudgetLine|openAccountingBudgetVariance|closeAccountingBudgetReport|downloadAccountingBudgetVariance|openAccountingCouncilPacket|accountingPhaseDMutation)$',
          argsIgnorePattern: '^success$',
        },
      ],
    },
  },
  {
    files: ['src/lib/core.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { caughtErrorsIgnorePattern: '^error$' }] },
  },
  {
    files: ['src/worker.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { caughtErrorsIgnorePattern: '^e$' }] },
  },
  // Retain original inline handlers, composed classic globals and existing Listen compatibility functions.
  {
    files: ['src/browser/donor/controllers/sacraments.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(SACRAMENT_TYPE_LABELS|selectSacramentSlot|toggleSacramentAddressFieldByLocation|openSacramentAccordion|selectSacramentAccordionSlot|updateSacramentPreparationItem|uploadSacramentPreparationDocument|deleteSacramentPreparationDocument|submitCustomSacramentRequest|requestParishStewardshipUpgrade|submitSacramentAccordionBooking|submitSacramentAccordionRequest|submitSacramentRequest|cancelSacramentRequest)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/donor/sacrament-presentation.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(sacramentLocationHint|sacramentIcon|sacramentSummary|sacramentPreparationStatusLabel|sacramentRequestRow)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/listen/app.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^(handleImport|renderMiniPlayer)$' }],
    },
  },
  {
    files: ['src/browser/listen/app-events.ts'],
    rules: { '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true }] },
  },
  // Preserve Directory classic handlers, cross-source declarations and legacy unused bindings.
  {
    files: ['src/browser/parish/directory-feature-presentation.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(directoryHouseholdSortKey|directoryHouseholdInitials|directoryEmptyState|directoryPriorityBadgeClass|directoryPhotoPlaceholderElement|directoryAccessStatusRow|directoryHouseholdSummaryCard|directoryReviewObjectRows|directoryReviewPrefs|directoryReviewMeta|directoryHealthTile|directoryReviewTypeLabel|directoryMetric)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/features/directory.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(directoryBrowseRow|switchDirectoryBrowseType|searchDirectoryBrowse|parishName|toggleDirectoryFeature|filterCanonicalDirectoryRows|directoryQueueRow|removeDirectoryPersonFromParish|openDirectoryReview|decideDirectoryReview|sendDirectoryAccountInvitation|sendDirectoryHouseholdInvitation|copyDirectoryInvitationLink|resendDirectoryAccountInvitation|revokeDirectoryAccountInvitation|directoryMaintenanceRow|moderateDirectorySkill|downloadDirectoryAdminExport|previewDirectoryAdminPrint)$',
          caughtErrorsIgnorePattern: '^err$',
        },
      ],
    },
  },
  // Preserve explicitly named Sacraments inline handlers and composed classic cross-source bindings.
  {
    files: ['src/browser/parish/features/sacraments.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(SACRAMENT_STATUS_OPTIONS|SACRAMENT_STATUS_LABELS|setSacramentsDashboardTab|selectSacramentsPriest|SAC_TIMEZONE_OPTIONS|SAC_DAY_LABELS|SAC_EDITABLE_SERVICE_TYPES|selectedSacramentOfferingLabel|selectedSacramentsGoogleConnection|connectSacramentsGoogleCalendar|disconnectSacramentsGoogleCalendar|toggleSacramentsFeature|groupSacramentsRulesByType|toggleSacramentsOffering|addCustomSacramentsOffering|updateCustomSacramentsOfferingMode|removeCustomSacramentsOffering|saveSacramentsAvailabilityTimezone|addSacramentsAvailabilityRule|deleteSacramentsAvailabilityRule|addSacramentsAvailabilityBlackout|deleteSacramentsAvailabilityBlackout|SACRAMENT_OVERDUE_HOURS|reviewSacramentPreparationItem|reviewSacramentPreparationDocument|toggleSacramentRequestEditor|selectSacramentRuleDay|selectSacramentsCalendarDay|onSacramentStatusChange|saveSacramentRequest)$',
        },
      ],
      '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true }],
    },
  },
  {
    files: ['src/browser/parish/sacrament-feature-presentation.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(renderSacramentsPriestPicker|renderSacramentsFeatureToggle|renderSacramentsDisabledPanel|renderSacramentsAvailability|renderSacramentsBlackouts|renderSacramentsUpsell|isThisWeek|sacramentParishRow|renderSacramentsRules|renderSacramentsCalendar)$',
        },
      ],
    },
  },
  // Preserve explicitly named Groups inline handlers and composed classic cross-source bindings.
  {
    files: ['src/browser/myagapay/groups-contracts.d.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^()$' }] },
  },
  {
    files: ['src/browser/myagapay/groups-presentation.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(renderGroupWorkspaceError|renderGroupMessageContent|renderDecodedWaveform|renderMinistrySchedule|renderMinistryMembers|renderMinistryResources|renderMinistryCommerce|renderGroupSignupManager|renderGroupCatchUp|downloadMinistryCommerceQr|copyMinistryCommerceLink|duplicateMinistryCommerceItem|createMinistryCommerceItemUI|toggleMinistryCommerceItemStatus|toggleMinistryCommerceCalendar)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/myagapay/groups.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(toggleGroupVoiceMessage|groupSignupCategoryOptions|groupSignupLocalDate|switchGroupWorkspace|acceptMinistryCoverage|delegatedHeadcountPanel|recordDelegatedHeadcount|createMinistryEvent|deleteMinistryEvent|recordMinistryAttendance|saveMinistryAvailability|createMinistryResource|deleteMinistryResource|ministryCommerceMoney|ministryCommerceQrSvgByVariant|ministryCommerceMarkDataUri|ministryCommerceQrUrl|closeGroupSignup|createGroupSignup|updateGroupSignup|setGroupSignupStatus|deleteGroupSignup|addGroupSignupSlot|updateGroupSignupSlot|deleteGroupSignupSlot|saveGroupSignupTemplate|createGroupSignupFromTemplate|showGroupSignupHistory|completeGroupSignupEntry|closeMinistryGroup|toggleGroupCatchUp|chooseGroupPhoto|selectGroupPhoto|toggleGroupVoiceRecording|postMinistryGroupMessage)$',
        },
      ],
    },
  },
  // Preserve explicitly named Teaching classic cross-source bindings.
  {
    files: ['src/browser/myagapay/teaching-contracts.d.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^()$' }] },
  },
  {
    files: ['src/browser/myagapay/teaching-presentation.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(parseKoinoniaPodcastFeed|renderKoinoniaContinueListening|renderKoinoniaPodcastDownloads|renderKoinoniaPodcastSubscriptions|renderKoinoniaPodcastLatest|renderKoinoniaPodcastResults|renderKoinoniaPodcastShow|renderKoinoniaPodcastQueue|renderTeaching|encodePodcastDownloadHeader|downloadedKoinoniaEpisode)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/myagapay/teaching.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(loadKoinoniaPodcastDownloads|koinoniaPodcastIsSubscribed|teachingPostsForFilter|setTeachingCategoryFilter)$',
        },
      ],
    },
  },
  // Explicit Donor inline handlers and classic cross-source bindings remain live globals.
  {
    files: ['src/browser/donor/app-account-and-dashboard.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(signupFromPage|verifyDonorEmail|cancelLearnSubscription|openMyAgapayLearnCheckout|requestDonorAccountDeletion|primeDonorDashboardParishUi|loadDonorDashboardPage|downloadGivingStatement|saveDonorSettings|commemorationEntriesForDisplay)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/donor/app-commemorations-and-checkout.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(loadDonorCommemorationsPage|submitCommemoration|startDonorCheckout|handleDonorCheckoutReturn|renderPledgeTracker|checkDonorNotifications)$',
          argsIgnorePattern: '^frequency$',
        },
      ],
    },
  },
  {
    files: ['src/browser/donor/app-giving-and-login.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(shareCampaign|renderActiveCampaigns|renderActiveFunds|renderNextFeast|renderHomeParishWidgetsLoading|applyDonorGiveParams|toggleCandleIntentionFields|loginFromDashboard|initDonorPasswordResetPage|initDonorLoginPageControls)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/donor/app-session-and-parish.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(refreshStaleDashboardShell|isDonorUnauthorized|redirectToMyAgapayLogin|donorLoginReturnPath|clearDonorCache|money|donorInitials|donorDisplayName|shortDate|calendarLabel|nextFeastForCalendar|saveDonorSession|logoutDonor|closeDonorAccountMenus|showGuestDonorDashboard|loadPublicParishes|filterParishSelect|isGivingPlusGiftType|requestParishGivingPlusUpgrade|setGivingTierTilesLoading|markDonorGiftAmountEdited|syncDonorCommemorationAmount|applyDonorNavIcons|activeParishCampaigns|activeParishFeastCampaigns)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/donor/app.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(setDonorStatus|setHtml|isDonorUnauthorized|redirectToMyAgapayLogin|donorLoginReturnPath|clearDonorCache|money|shortDate|calendarLabel|nextFeastForCalendar|escapeHtml|saveDonorSession|clearDonorSession|showGuestDonorDashboard|loadPublicParishes|fetchPublicParishes|donorGiftUrl|quickDonorGiftUrl|normalizeDonorGiftType|isGivingPlusGiftType|parishHasGivingPlus|isGeneralDonorFund|isCandleDonorFund|parishCanUseGiftType|openGivingPlusPaywall|setGivingTierTilesLoading|updateGivingTierTiles|syncDonorCommemorationAmount|updateQuickGiveLinks|activeParishCampaigns|activeParishFeastCampaigns|selectedPublicParish|campaignLabel|selectedCampaign|renderActiveCampaigns|renderActiveFunds|renderNextFeast|renderHomeParishWidgetsLoading|toggleGiftDetailFields|loadDonorDashboardPage|commemorationEntriesForDisplay|loadDonorCommemorationsPage|renderPledgeTracker|donorStore|DONOR_SHELL_VERSION|donorApi|readDonorCache|writeDonorCache|donorGiftTypeCopy|donorGiftAmountEdited|activeDonorGiftType|_nudgeQueue|_nudgeCurrent)$',
        },
      ],
    },
  },
  // Explicit Parish inline handlers and classic cross-source bindings remain live globals.
  {
    files: ['src/browser/parish/app-session-and-navigation.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(givingCatalogSnapshot|accountingCatalogSnapshot|saveSession|logoutParish|setPaymentStatus|openParishSupportTicket|showParishFeatureRequestPopup|dismissParishFeatureRequest|submitParishSupportTicket|renderDirectoryAdminAccessError|renderDirectoryAdminGenericError|statusLabel|loginFromParishPage|showParishLogin|showParishPasswordReset|requestParishPasswordReset|confirmParishPasswordReset|initParishPasswordResetPage|fallbackFundsArray|fallbackCampaignsArray|dedicatedGivingUrl|dedicatedGivingEmbedUrl|downloadBlob|slugifyLocal|money|moneyFull|shortDate|fullDate|isoDateLabel|isParishTier|isParishPlusActive|isStarterTier|openParishPortability|acceptParishAccessInvitation|initParishAccessInvitationPage|hasFundManagementAccess|isGeneralDashboardFund|isCandleDashboardFund|syncDashboardPaywall|syncTierRequirementNavigation|syncModuleStatusNavigation)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/app-settings-and-nonprofit.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(uploadParishLogo|removeParishLogo|formatSacramentPriestsForSettings|parseSacramentPriestsFromSettings|saveDashboard|copyPayload|startStripeOnboarding|startSubscriptionCheckout|loadStripeVolume|copyNonprofitPricingStatement|saveNonprofitPricingAttestation|uploadNonprofitPricingDocument|markNonprofitPricingSubmitted|recordNonprofitPricingDecision|viewNonprofitPricingDocument)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/app-subscriptions-and-settlement.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(updateStarterPaywalls|accountingStaffSession|updateStewardshipBadges|createSettlementProfile|renameSettlementProfile|toggleSettlementProfileActive|setDefaultGivingProfile|setDefaultCommerceProfile|assignSettlementModule|formatSacramentDateRange|syncSacramentsBlackoutEndDate|parishHouseholdPickerMarkup|syncParishHouseholdPricing|parishPricingUsageMarkup|tierOptionsMarkup|subscriptionAddOnPickerMarkup|syncSubscriptionAddOnVisibility|setupCheckMarkup|refreshStripeStatus|communityMarkIcon|renderSubscriptionPanel|updateTierScopedNavigation|changeDemoTier|openSubscriptionPortal|openSubscriptionCancellation)$',
          argsIgnorePattern: '^options$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/app-tax-exemption.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(submitParishTaxExemption|uploadParishTaxExemptionDocument|viewParishTaxExemptionDocument)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/parish/app.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(saveSession|switchTab|money|syncDashboardPaywall|syncTierRequirementNavigation|syncModuleStatusNavigation|selectedSubscriptionAddOns|dashboardLoadPromise|activeParishFeatureRequest|parishFeatureRequests|identitySessionStorageKey|identityEmailStorageKey|escapeAttr|starterLockedFeatures|settlementProfilesState|SETTLEMENT_MODULE_LABELS|SETTLEMENT_TYPE_LABELS|taxExemptionJurisdictions|renderDashboard|payload)$',
        },
      ],
    },
  },
  // Explicit Admin inline handlers and classic live cross-source bindings.
  {
    files: ['src/browser/admin/app-accounting-and-audit.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(auditLogLoadedOnce|loadAdminAccountingTargets|activateAdminPreparedAccounting|runAdminIntegrityScan|changeAdminProtectiveState|verifyAdminRecoveryEvidence|calculateNonprofitProjection|runNonprofitPricingAlerts|populateAuditLogFilterOptions|setAuditLogQuickRange|resetAuditLogFilters)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/admin/app-bulk-and-history.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^(toggleSelectAll|bulkAction|renderEmailLog|renderNotesHistory)$' },
      ],
    },
  },
  {
    files: ['src/browser/admin/app-learn-and-support.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(field|updateParishSupportTicket|acknowledgeLearnFeedback|moderateLearnCommunity|editLearnCuratedResource|createLearnCuratedResource|createLearnScholarship)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/admin/app-onboarding-and-review.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(registrationAutosaveQueued|sendDashboardInvite|runOnboardingTestAction|copyRegistrationSummary|saveReview)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/admin/app-parish-tools-and-diagnostics.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(seedDemoParish|runWeeklyCommemorationEmail|runWeeklyTreasurerEmail|grantStewardshipComp|grantStewardshipCompFromDetail|setSacramentsEnabled|setSacramentsEnabledFromDetail|loadPlatformSummary|err|loadDeploymentDiagnostics|runEmailDiagnostics)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/admin/app-registration-details.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(loadRegistrationGivingSummary|renderAdminAuditLog|renderOnboardingManualChecks|renderOnboardingProgress|activateOnboardingPhase|renderOnboardingCommandHeader|renderOnboardingControls|readOnboardingChecks)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/admin/app-registration-queue.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(sendDashboardInvite|lastDataLoadedAt|emptyDetailMarkup|bindRegistrationAutosave|upsertRegistrationCache|loadRegistrations|copyText)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/admin/app-session-and-platform.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(restoreAdminSession|loginFromAdminPage|logoutAdmin|setPaymentStatus|changeAdminPassword|renderQueueNext|renderPlatformGrowth)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/admin/app-subscription-and-navigation.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(activeTab|generateDashboardToken|sendDashboardInvite|createSubscriptionCheckout|refreshStripeStatus|switchTab)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/admin/app.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(saveAdminSession|adminActor|consumeAdminNotice|refreshDataAsOf|stopAutoRefresh|toggleAutoRefresh|loginFromAdminPage|logoutAdmin|setPaymentStatus|changeAdminPassword|nextAction|renderQueueNext|renderGrowthBars|renderPlatformGrowth|productCard|renderProductOverview|revenueProductRows|renderRevenueCards|renderLearnGrowthBars|renderLearnScholarships|renderLearnCommunityModeration|renderLearnFeedbackQueue|renderParishSupportTickets|loadParishSupportTickets|updateParishSupportTicket|renderLearnAdmin|acknowledgeLearnFeedback|moderateLearnCommunity|clearLearnCuratedResourceForm|editLearnCuratedResource|createLearnCuratedResource|loadLearnAdmin|copyLearnText|createLearnScholarship|seedDemoParish|weeklyCommemorationSummary|runWeeklyCommemorationEmail|moneyPlain|weeklyTreasurerSummary|runWeeklyTreasurerEmail|loadStewardshipCompStatus|submitStewardshipCompGrant|grantStewardshipComp|grantStewardshipCompFromDetail|submitSacramentsEnabled|setSacramentsEnabled|setSacramentsEnabledFromDetail|loadPlatformSummary|diagnosticsBadge|deploymentCheckOk|loadDeploymentDiagnostics|runEmailDiagnostics|emptyDetailMarkup|collapseRegistrationDetail|setRegistrationAutosaveState|scheduleRegistrationAutosave|runRegistrationAutosave|bindRegistrationAutosave|upsertRegistrationCache|loadRegistrations|renderMetrics|renderOverviewEmailLog|loadRecentActivity|renderRecentActivity|communityTypeOf|renderCommunitySnapshot|renderOnboardingHealth|parseDateMs|daysSince|currentWorkflowStep|workflowLastActivityAt|nextActionPriority|renderNextActionQueue|renderFilteredList|renderList|copyText|loadDetail|renderRegistrationGivingSummary|loadRegistrationGivingSummary|renderAdminAuditLog|onboardingStatusOptions|renderOnboardingManualChecks|renderOnboardingProgress|onboardingCurrentPhase|onboardingPhaseState|activateOnboardingPhase|onboardingActionTitle|renderOnboardingCommandHeader|renderOnboardingControls|readOnboardingChecks|runOnboardingTestAction|renderDetail|copyRegistrationSummary|dashboardInviteMessage|saveReview|generateDashboardToken|sendDashboardInvite|setSubscriptionStatus|createSubscriptionCheckout|refreshStripeStatus|toggleMobileMore|switchTab|populateAdminAccountingParishes|loadAdminAccountingTargets|selectedAdminAccountingTarget|adminAccountingParish|adminAccountingFetch|activateAdminPreparedAccounting|loadAdminAccountingOperations|renderAdminAccountingHealth|renderAdminIntegrityScans|renderAdminRecoveryVerifications|runAdminIntegrityScan|changeAdminProtectiveState|verifyAdminRecoveryEvidence|loadAdminNonprofitPricing|calculateNonprofitProjection|runNonprofitPricingAlerts|auditActionLabel|auditActorTypeLabel|auditTargetTypeLabel|populateAuditLogFilterOptions|refreshAuditLogOrgOptions|setAuditLogQuickRange|resetAuditLogFilters|auditActionBadgeClass|renderAuditLogTable|loadAuditLog|updateBulkBar|toggleSelectAll|clearSelection|renderBulkResults|bulkAction|renderEmailLog|renderNotesHistory|selectedReference|registrationsCache|adminActorKey|adminNoticeKey|autoRefreshKey|givingSummaryCache|autoRefreshTimer|isLoadingRegistrations|registrationAutosaveTimer|registrationAutosaveInFlight|registrationAutosaveQueued|registrationAutosavePromise|lastDataLoadedAt|latestPlatformSummary|latestLearnAdmin|adminAccountingHealth|adminAccountingTargets|adminAccountingTargetsLoaded|adminAccountingEnvironment|handleAuthFailure|authHeaders|onboardingManualFields|onboardingPhases|activeTab|auditLogLoadedOnce|auditLogCursor|auditLogOptionsPopulated|AUDIT_ACTION_CATALOG|AUDIT_ACTOR_TYPES|AUDIT_TARGET_TYPES|selectedRefs|formatClock|escapeHtml|escapeAttr|jsString|jsAttr|field|readableStripeRequirement|renderStripeRequirements|money|moneyShort|monthLabel|readable|shortDate|subscriptionTierLabel|transactionFeeLabel|jsonForTextarea|computeLocalPlatformSummary)$',
        },
      ],
    },
  },
  // These exact globals span the Admin operations/navigation classic composition. Locals remain checked.
  {
    files: ['src/browser/admin/app-accounting-and-audit.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(registrationsCache|adminAccountingTargetsLoaded|adminAccountingTargets|escapeAttr|escapeHtml|authHeaders|handleAuthFailure|adminAccountingEnvironment|setStatus|adminAccountingHealth|shortDate|money|AUDIT_ACTION_CATALOG|AUDIT_ACTOR_TYPES|AUDIT_TARGET_TYPES|auditLogOptionsPopulated|auditLogLoadedOnce|auditLogCursor|populateAdminAccountingParishes|loadAdminAccountingTargets|selectedAdminAccountingTarget|adminAccountingParish|adminAccountingFetch|activateAdminPreparedAccounting|loadAdminAccountingOperations|renderAdminAccountingHealth|renderAdminIntegrityScans|renderAdminRecoveryVerifications|runAdminIntegrityScan|changeAdminProtectiveState|verifyAdminRecoveryEvidence|loadAdminNonprofitPricing|calculateNonprofitProjection|runNonprofitPricingAlerts|auditActionLabel|auditActorTypeLabel|auditTargetTypeLabel|populateAuditLogFilterOptions|refreshAuditLogOrgOptions|setAuditLogQuickRange|resetAuditLogFilters|auditActionBadgeClass|renderAuditLogTable|loadAuditLog|activeTab|loadLearnAdmin|loadParishSupportTickets|switchTab)$',
        },
      ],
    },
  },
  {
    files: ['src/browser/admin/app-subscription-and-navigation.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern:
            '^(setStatus|authHeaders|handleAuthFailure|loadDetail|loadRegistrations|renderQueueNext|setPaymentStatus|generateDashboardToken|sendDashboardInvite|setSubscriptionStatus|createSubscriptionCheckout|refreshStripeStatus|toggleMobileMore)$',
        },
      ],
    },
  },
];
