import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const handwrittenIgnores = ['node_modules/**', 'public/vendor/**', 'tmp/**', 'tmp-*/**', '.tmp-*/**', 'artifacts/**'];
const recommendedRules = js.configs.recommended.rules;

export default [
  { ignores: handwrittenIgnores },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: ['src/**/*.ts', 'scripts/**/*.ts'] })),
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
    files: ['src/browser/liturgical-calendar.ts'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^Window$' }] },
  },
  {
    files: ['public/liturgical-calendar.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
    rules: recommendedRules,
  },
];
