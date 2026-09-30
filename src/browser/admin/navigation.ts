// Classic Admin navigation contract. The existing app installs switchTab.
type AdminNavigationTab =
  | 'overview'
  | 'giving'
  | 'support'
  | 'taxexemptions'
  | 'nonprofitpricing'
  | 'learn'
  | 'marketplace'
  | 'directory'
  | 'accountingops'
  | 'auditlog'
  | 'settings'
  | 'developer';
type AdminNavigationGroup = 'Your work' | 'Reviews' | 'Products' | 'System' | 'Insights';
type AdminNavigationSection =
  'contactLeadsCard' | 'deploymentHealthCard' | 'parishCare' | 'overviewEmailLogCard' | 'platformGrowthCard';
type AdminNavigationTool = readonly [
  tab: AdminNavigationTab,
  title: string,
  description: string,
  group: AdminNavigationGroup,
  keywords: string,
  section?: AdminNavigationSection,
];
declare function switchTab(tab: AdminNavigationTab): void;

(() => {
  const tools: readonly AdminNavigationTool[] = [
    ['overview', 'Today', 'See priorities and the next parish actions.', 'Your work', 'home dashboard queues'],
    [
      'giving',
      'Parish onboarding',
      'Review registrations and help parishes get ready to give.',
      'Your work',
      'church verification stripe subscription billing',
    ],
    [
      'support',
      'Support inbox',
      'Review questions, issues, and feature requests.',
      'Your work',
      'tickets help household',
    ],
    [
      'overview',
      'Contact submissions',
      'Find website enquiries and retry failed notifications.',
      'Your work',
      'contacts leads messages email',
      'contactLeadsCard',
    ],
    [
      'taxexemptions',
      'Tax exemptions',
      'Review certificates and tax exemption requests.',
      'Reviews',
      'tax documents approval',
    ],
    [
      'nonprofitpricing',
      'Nonprofit pricing',
      'Check donation volumes and nonprofit rate applications.',
      'Reviews',
      'stripe fees threshold discounts',
    ],
    [
      'learn',
      'Learn',
      'Manage subscriptions, scholarships, and community feedback.',
      'Products',
      'education courses learning',
    ],
    [
      'marketplace',
      'Marketplace',
      'Check seller activity and marketplace readiness.',
      'Products',
      'shop store sellers',
    ],
    [
      'directory',
      'Directory',
      'Check participation and parish publication health.',
      'Products',
      'listing map churches',
    ],
    [
      'accountingops',
      'Accounting health',
      'Inspect integrity checks and recovery controls.',
      'System',
      'finance ledger backup restore',
    ],
    ['auditlog', 'Audit log', 'Trace administrative changes and who made them.', 'System', 'history activity security'],
    ['settings', 'Settings', 'Manage security and platform configuration.', 'System', 'password mfa authentication'],
    [
      'developer',
      'Developer tools',
      'Access maintenance and manual platform tools.',
      'System',
      'technical diagnostics',
    ],
    [
      'overview',
      'Deployment health',
      'Check live platform services and release flags.',
      'Insights',
      'diagnostics status system',
      'deploymentHealthCard',
    ],
    [
      'overview',
      'Parish relationships',
      'Review retention and configure anniversary and patronal feast emails.',
      'Your work',
      'retention anniversary patronal feast milestones emails',
      'parishCare',
    ],
    [
      'overview',
      'Platform emails',
      'Review recent email delivery activity.',
      'Insights',
      'notifications history sent',
      'overviewEmailLogCard',
    ],
    [
      'overview',
      'Growth and revenue',
      'See registrations, giving volume, and platform revenue.',
      'Insights',
      'reports analytics financial metrics',
      'platformGrowthCard',
    ],
  ];
  // Required elements belong to admin.html and are covered by desktop/mobile browser tests.
  const dialog = document.getElementById('adminToolFinder') as HTMLDialogElement;
  const search = document.getElementById('adminToolSearch') as HTMLInputElement;
  const results = document.getElementById('adminFinderResults')!;

  function navigate(tool: AdminNavigationTool) {
    dialog.close();
    switchTab(tool[0]);
    const target = document.getElementById(tool[5] || `tab-${tool[0]}`);
    if (!target) return;
    let ancestor = target.parentElement;
    while (ancestor) {
      if (ancestor.tagName === 'DETAILS') (ancestor as HTMLDetailsElement).open = true;
      ancestor = ancestor.parentElement;
    }
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    if (tool[5]) target.scrollIntoView({ block: 'start' });
  }

  function toolButton(tool: AdminNavigationTool) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-tool-link';
    const title = document.createElement('strong');
    title.textContent = tool[1];
    const description = document.createElement('span');
    description.textContent = tool[2];
    button.append(title, description);
    button.addEventListener('click', () => navigate(tool));
    return button;
  }

  function renderResults() {
    const terms = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const matches = tools.filter((tool) =>
      terms.every((term) => tool.slice(1, 5).join(' ').toLowerCase().includes(term))
    );
    results.replaceChildren();
    document.getElementById('adminFinderCount')!.textContent = matches.length
      ? `${matches.length} ${matches.length === 1 ? 'tool' : 'tools'} available. Tab to choose a result.`
      : 'No tools found. Try “support”, “tax”, or “parish”.';
    for (const tool of matches) results.append(toolButton(tool));
  }

  function openFinder() {
    if (dialog.open) return;
    search.value = '';
    renderResults();
    dialog.showModal();
    search.focus();
  }

  document
    .querySelectorAll('[data-open-admin-finder]')
    .forEach((button) => button.addEventListener('click', openFinder));
  document.getElementById('adminFinderClose')!.addEventListener('click', () => dialog.close());
  search.addEventListener('input', renderResults);
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dialog.close();
    }
  });
  search.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      results.querySelector('button')?.focus();
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      results.querySelector('button')?.click();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 'k' &&
      !document.querySelector('dialog[open]:not(#adminToolFinder)')
    ) {
      event.preventDefault();
      openFinder();
    }
  });
  if (/Mac|iPhone|iPad/.test(navigator.platform)) document.querySelector('.admin-find-button kbd')!.textContent = '⌘ K';

  function updateCurrentNavigation() {
    document.querySelectorAll('.sidebar-nav-item, .mobile-tab-link').forEach((button) => {
      if (button.classList.contains('active') && button.id !== 'mobileMoreButton')
        button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }
  const observer = new MutationObserver(updateCurrentNavigation);
  document
    .querySelectorAll('.sidebar-nav-item, .mobile-tab-link')
    .forEach((button) => observer.observe(button, { attributes: true, attributeFilter: ['class'] }));
  updateCurrentNavigation();
})();
