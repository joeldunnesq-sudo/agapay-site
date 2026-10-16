import type { LearnReportsVm, LearnShellPayload, LearnShellError, LearnGradesVm } from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell.js';

declare const root: LearnShellBindings['root'];
declare const showLearnDialog: LearnShellBindings['showLearnDialog'];
declare const safeExternalUrl: LearnShellBindings['safeExternalUrl'];
declare const apiPost: LearnShellBindings['apiPost'];
declare const learnRequestHeaders: LearnShellBindings['learnRequestHeaders'];
declare const downloadBlob: LearnShellBindings['downloadBlob'];
declare const renderGradeCourseEditor: LearnShellBindings['renderGradeCourseEditor'];
declare const emptyState: LearnShellBindings['emptyState'];
declare const panel: LearnShellBindings['panel'];
declare const attendanceStatusMark: LearnShellBindings['attendanceStatusMark'];
declare const attendanceStatusLabel: LearnShellBindings['attendanceStatusLabel'];

function updateActiveButton(buttons: NodeListOf<HTMLElement> | readonly HTMLElement[], activeButton: HTMLElement) {
  buttons.forEach((button) => {
    const active = button === activeButton;

    button.style.background = active ? 'var(--navy)' : 'var(--paper)';

    button.style.color = active ? '#f3ead4' : 'var(--ink)';

    button.style.borderColor = active ? 'var(--gold)' : 'var(--line)';

    button.setAttribute('aria-pressed', String(active));
  });
}

function wireCommunityLegacy() {
  const search = root!.querySelector<HTMLInputElement>('[data-community-search]');
  const cards = [...root!.querySelectorAll<HTMLElement>('[data-community-card]')];
  const count = root!.querySelector<HTMLElement>('[data-community-count]');
  const filterButtons = [...root!.querySelectorAll<HTMLElement>('[data-community-filter]')];
  let activeCategory = 'All';

  const applyFilters = () => {
    const query = ((search as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value || '')
      .trim()
      .toLowerCase();
    let shown = 0;
    cards.forEach((card: HTMLElement) => {
      const matchesCategory = activeCategory === 'All' || card.dataset.category === activeCategory;
      const matchesSearch = !query || (card.dataset.search || '').includes(query);
      const visible = matchesCategory && matchesSearch;
      card.hidden = !visible;
      if (visible) shown += 1;
    });
    if (count)
      count.innerHTML = `<span style="color:var(--gold);">✥</span> Showing ${shown} resources shared by Orthodox homeschool families`;
  };

  search?.addEventListener('input', applyFilters);
  filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeCategory = button.dataset.communityFilter || 'All';
      updateActiveButton(filterButtons, button);
      applyFilters();
    });
  });

  root!.querySelectorAll<HTMLElement>('[data-community-sort]').forEach((button) => {
    button.addEventListener('click', () =>
      updateActiveButton([...root!.querySelectorAll<HTMLElement>('[data-community-sort]')], button)
    );
  });

  root!.addEventListener('click', (event) => {
    const vote = (event.target as HTMLElement).closest<HTMLElement>('[data-community-vote]');
    if (vote) {
      const value = vote.querySelector<HTMLElement>('span');
      value!.textContent = String((Number(value!.textContent) || 0) + 1);
      return;
    }
    const save = (event.target as HTMLElement).closest<HTMLElement>('[data-community-save]');
    if (save) {
      save.textContent = save.textContent.includes('Saved') ? '♡ Save' : '✓ Saved';
      save.style.background = save.textContent.includes('Saved') ? 'var(--paper2)' : '#fbf2dd';
      return;
    }
    if ((event.target as HTMLElement).closest<HTMLElement>('[data-community-add]')) {
      showLearnDialog(
        'Added to Library',
        'This resource has been queued for the household library. Persistent community library syncing will use the same D1-backed profile store as setup.'
      );
    }
  });

  const panelEl = root!.querySelector<HTMLElement>('[data-community-share-panel]');
  root!.querySelector<HTMLElement>('[data-community-share]')?.addEventListener('click', () => {
    if (panelEl) {
      panelEl.hidden = false;
      panelEl.style.display = 'flex';
    }
  });
  root!.querySelectorAll<HTMLElement>('[data-community-share-close]').forEach((button) => {
    button.addEventListener('click', () => {
      if (panelEl) {
        panelEl.hidden = true;
        panelEl.style.display = 'none';
      }
    });
  });
  root!.querySelector<HTMLElement>('[data-community-submit]')?.addEventListener('click', () => {
    const title = (
      root!.querySelector<HTMLElement>('[name="community.title"]') as
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    )?.value?.trim();
    const url = safeExternalUrl(
      (
        root!.querySelector<HTMLElement>('[name="community.url"]') as
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      )?.value
    );
    const category =
      (
        root!.querySelector<HTMLElement>('[name="community.category"]') as
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      )?.value?.trim() || 'Community';
    if (!title || !url) {
      showLearnDialog(
        'Resource needs a title and link',
        'Add a title and a valid http or https URL before sharing this resource.'
      );
      return;
    }
    showLearnDialog('Resource Shared', `${title} has been added to this community view for review.`);
    if (panelEl) {
      panelEl.hidden = true;
      panelEl.style.display = 'none';
    }
    const grid = root!.querySelector<HTMLElement>('[data-community-grid]');
    if (grid) {
      const searchText = `${title} ${category}`.toLowerCase();
      const card = document.createElement('article');
      card.dataset.communityCard = '';
      card.dataset.category = category;
      card.dataset.search = searchText;
      card.style.cssText =
        'background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:11px;';
      const art = document.createElement('div');
      art.style.cssText =
        'height:92px;border:1px solid var(--line);border-radius:10px;background:linear-gradient(135deg,#f6edd6,var(--paper2));display:flex;align-items:center;justify-content:center;color:var(--gold);font-size:36px;';
      art.textContent = '✥';
      const heading = document.createElement('strong');
      heading.style.cssText = "font-family:'Cormorant Garamond',serif;font-size:20px;";
      heading.textContent = title;
      const description = document.createElement('p');
      description.style.cssText = 'font-size:13px;color:#3a4256;line-height:1.4;margin:0;';
      description.textContent = 'Newly shared by this household.';
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.style.cssText = 'color:var(--gold);text-decoration:none;';
      link.textContent = 'Open resource ↗';
      card.append(art, heading, description, link);
      grid.prepend(card);
    }
  });
}

function wireCommunity() {
  const search = root!.querySelector<HTMLInputElement>('[data-community-search]');
  const category = root!.querySelector<HTMLSelectElement>('[data-community-category]');
  const resourceType = root!.querySelector<HTMLSelectElement>('[data-community-resource-type]');
  const mediaType = root!.querySelector<HTMLSelectElement>('[data-community-media-type]');
  const cards = [...root!.querySelectorAll<HTMLElement>('[data-community-card]')];
  const count = root!.querySelector<HTMLElement>('[data-community-count]');
  const empty = root!.querySelector<HTMLElement>('[data-community-empty]');

  const applyFilters = () => {
    const query = ((search as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value || '')
      .trim()
      .toLowerCase();
    let shown = 0;
    cards.forEach((card: HTMLElement) => {
      const matches =
        (!query || (card.dataset.search || '').includes(query)) &&
        (!category ||
          (category as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value === 'All' ||
          card.dataset.category === (category as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value) &&
        (!resourceType ||
          (resourceType as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value === 'All' ||
          card.dataset.resourceType ===
            (resourceType as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value) &&
        (!mediaType ||
          (mediaType as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value === 'All' ||
          card.dataset.mediaType === (mediaType as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value);
      card.hidden = !matches;
      if (matches) shown += 1;
    });
    if (count) count.textContent = `Showing ${shown} curated ${shown === 1 ? 'resource' : 'resources'}`;
    if (empty) empty.hidden = shown !== 0;
  };

  search?.addEventListener('input', applyFilters);
  [category, resourceType, mediaType].forEach((control) => control?.addEventListener('change', applyFilters));

  root!.querySelectorAll<HTMLButtonElement>('[data-community-flag]').forEach((button) => {
    button.addEventListener('click', async () => {
      (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
      try {
        await apiPost(
          `/api/learn/community/resources/${encodeURIComponent(button.dataset.communityFlag || '')}/flag`,
          {}
        );
        button.textContent = 'Flagged';
        showLearnDialog('Sent for Review', 'An AGAPAY administrator will review this resource.', []);
      } catch (error) {
        (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
        showLearnDialog('Could Not Flag Resource', (error as LearnShellError).message || 'Please try again.', []);
      }
    });
  });

  const dialog = root!.querySelector<HTMLElement>('[data-community-suggest-dialog]');
  const form = root!.querySelector<HTMLFormElement>('[data-community-suggest-form]');
  const closeDialog = () => {
    if (!dialog) return;
    dialog.hidden = true;
    dialog.style.display = 'none';
  };
  root!.querySelector<HTMLButtonElement>('[data-community-suggest]')?.addEventListener('click', () => {
    if (!dialog) return;
    dialog.hidden = false;
    dialog.style.display = 'flex';
  });
  root!
    .querySelectorAll<HTMLButtonElement>('[data-community-suggest-close]')
    .forEach((button) => button.addEventListener('click', closeDialog));
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = form.querySelector<HTMLElement>('[data-community-suggest-status]');
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const values = new FormData(form);
    if (submit) submit.disabled = true;
    if (status) status.textContent = 'Sending your suggestion for review...';
    try {
      await apiPost('/api/learn/community/resources', {
        title: values.get('title'),
        url: values.get('url'),
        category: values.get('category'),
        resourceType: values.get('resourceType'),
        mediaType: values.get('mediaType'),
        ageRange: values.get('ageRange'),
        tags: values.get('tags'),
        description: values.get('description'),
      });
      form.reset();
      closeDialog();
      showLearnDialog(
        'Resource Submitted',
        'Thank you. The resource is now in the AGAPAY moderation queue and will not appear publicly until it is approved.',
        []
      );
    } catch (error) {
      if (status) status.textContent = (error as LearnShellError).message || 'The resource could not be submitted.';
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

function wireReports(vm: LearnReportsVm) {
  const reportTemplateId = (label = 'Year-End Report') => {
    const lower = String(label || '').toLowerCase();
    if (lower.includes('transcript')) return 'transcript';
    if (lower.includes('report card')) return 'report-card';
    if (lower.includes('subject')) return 'subject-progress-report';
    return 'year-end-report';
  };
  const exportReport = async (label = vm.pdf.title, button: HTMLButtonElement | null = null, extra = {}) => {
    const title = label || 'Year-End Report';
    const originalText = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = 'Generating...';
    }
    try {
      const response = await fetch(`/api/learn/print/${encodeURIComponent(reportTemplateId(title))}`, {
        method: 'POST',
        headers: learnRequestHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ label: title, ...extra }),
      });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('application/pdf')) {
        const payload = contentType.includes('application/json')
          ? ((await response.json().catch(() => ({}))) as LearnShellPayload)
          : {};
        throw new Error(payload.error || 'Unable to generate the report PDF. Please try again.');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const fileMatch = disposition.match(/filename="([^"]+)"/i);
      downloadBlob(
        fileMatch?.[1] ||
          `${
            title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '') || 'learn-report'
          }.pdf`,
        blob
      );
    } catch (error) {
      showLearnDialog(
        'Report Could Not Be Generated',
        (error as LearnShellError).message || 'Please refresh and try again.',
        []
      );
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText as unknown as string;
      }
    }
  };
  root!
    .querySelector<HTMLButtonElement>('[data-report-pdf]')
    ?.addEventListener('click', (event) => exportReport(vm.pdf.title, event.currentTarget as HTMLButtonElement));
  root!.querySelectorAll<HTMLButtonElement>('[data-report-export]').forEach((button) => {
    button.addEventListener('click', () => {
      const childId = button.dataset.reportChildId || '';
      exportReport(button.dataset.reportExport || 'Learn Report', button, childId ? { childId } : {});
    });
  });
}

function gradeCourseFromElement(courseEl: HTMLElement, childId: string) {
  const field = (name: string) => courseEl.querySelector<HTMLElement>(`[name="${name}"]`);
  return {
    id: courseEl.dataset.courseId || '',
    childId,
    courseTitle:
      (field('courseTitle') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value?.trim() ||
      'Untitled Course',
    subjectCategory:
      (field('subjectCategory') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value || 'General',
    gradeLevel: Number((field('gradeLevel') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value || 9),
    creditHours: Number(
      (field('creditHours') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)?.value || 0
    ),
    grades: [...courseEl.querySelectorAll<HTMLElement>('[data-grade-term]')].map((termEl) => ({
      termIndex: Number(termEl.dataset.gradeTerm || 1),
      numericScore:
        (
          termEl.querySelector<HTMLElement>('[name="numericScore"]') as
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        )?.value?.trim() || '',
      letterGrade:
        (
          termEl.querySelector<HTMLElement>('[name="letterGrade"]') as
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        )?.value || '',
      attendanceDays:
        (
          termEl.querySelector<HTMLElement>('[name="attendanceDays"]') as
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        )?.value?.trim() || '',
      teacherNotes:
        (
          termEl.querySelector<HTMLElement>('[name="teacherNotes"]') as
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        )?.value?.trim() || '',
    })),
  };
}

function blankGradeCourse(vm: LearnGradesVm) {
  const index = root!.querySelectorAll<HTMLElement>('[data-grade-course]').length;
  const child = vm.selectedChild || vm.children[0] || {};
  return {
    id: '',
    courseTitle: 'New Course',
    subjectCategory: 'English',
    gradeLevel: Number(child.gradeLevel || 9),
    creditHours: 1,
    color: ['#14294a', '#6e2f2a', '#4a5a31', '#b5942f', '#34507a'][index % 5],
    grades: [1, 2, 3].map((termIndex) => ({
      termIndex,
      numericScore: '',
      letterGrade: '',
      attendanceDays: '',
      teacherNotes: '',
    })),
  };
}

function attendanceEntryFromCell(cell: HTMLElement) {
  return {
    childId: cell.dataset.childId || '',
    date: cell.dataset.date || '',
    status: cell.dataset.status || 'present',
    minutes: cell.dataset.minutes || '',
    notes: cell.dataset.notes || '',
  };
}

function setAttendanceCellStatus(cell: HTMLElement, status: string) {
  const next = status || 'present';
  const holidayName = cell.dataset.holidayName || '';
  cell.dataset.status = next;
  cell.classList.remove('is-present', 'is-absent', 'is-excused', 'is-holiday');
  cell.classList.add(`is-${next}`);
  const strong = cell.querySelector<HTMLElement>('strong');
  const small = cell.querySelector<HTMLElement>('small');
  if (strong) strong.textContent = attendanceStatusMark(next);
  if (small) small.textContent = holidayName && next === 'holiday' ? holidayName : attendanceStatusLabel(next);
  cell.setAttribute(
    'aria-label',
    `${cell.dataset.childId || 'Student'} ${cell.dataset.date || ''}: ${attendanceStatusLabel(next)}${holidayName && next === 'holiday' ? ` (${holidayName})` : ''}`
  );
}

function wireGrades(vm: LearnGradesVm) {
  const form = root!.querySelector<HTMLFormElement>('[data-grades-form]');
  if (!form) return;
  const status = root!.querySelector<HTMLElement>('[data-grades-status]');
  const setStatus = (message: string, tone = 'muted') => {
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  };
  const attendanceForm = root!.querySelector<HTMLFormElement>('[data-attendance-form]');
  const attendanceStatus = root!.querySelector<HTMLElement>('[data-attendance-status]');
  const setAttendanceStatus = (message: string, tone = 'muted') => {
    if (!attendanceStatus) return;
    attendanceStatus.textContent = message;
    attendanceStatus.dataset.tone = tone;
  };
  attendanceForm?.addEventListener('click', (event) => {
    const toggle = (event.target as HTMLElement).closest<HTMLElement>('[data-attendance-toggle]');
    if (toggle) {
      const body = attendanceForm.querySelector<HTMLElement>('[data-attendance-body]');
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      const nextExpanded = !expanded;
      toggle.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
      toggle.textContent = nextExpanded ? 'Minimize' : 'Expand';
      if (body) body.hidden = !nextExpanded;
      attendanceForm.classList.toggle('is-collapsed', !nextExpanded);
      setAttendanceStatus(
        nextExpanded
          ? 'Click a day to cycle its status.'
          : 'Attendance card minimized. Mark the week present or expand for details.'
      );
      return;
    }
    const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-attendance-cell]');
    if (!cell) return;
    const statuses = ['present', 'absent', 'excused', 'holiday'];
    const index = statuses.indexOf(cell.dataset.status || 'present');
    setAttendanceCellStatus(cell, statuses[(index + 1) % statuses.length]);
    setAttendanceStatus('Attendance changed. Save when ready.');
  });
  attendanceForm?.querySelector<HTMLButtonElement>('[data-attendance-present-week]')?.addEventListener('click', () => {
    attendanceForm
      .querySelectorAll<HTMLButtonElement>('[data-attendance-cell]')
      .forEach((cell) =>
        setAttendanceCellStatus(cell, cell.dataset.defaultStatus === 'holiday' ? 'holiday' : 'present')
      );
    setAttendanceStatus('Week marked present with national holidays preserved. Save when ready.');
  });
  attendanceForm?.querySelector<HTMLButtonElement>('[data-attendance-save]')?.addEventListener('click', async () => {
    const save = attendanceForm.querySelector<HTMLButtonElement>('[data-attendance-save]');
    if (save) {
      (save as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
      save.textContent = 'Saving...';
    }
    setAttendanceStatus('Saving attendance...');
    try {
      await apiPost('/api/learn/attendance', {
        academicYearName:
          (
            (form as HTMLFormElement).elements as HTMLFormControlsCollection & Record<string, { value: string }>
          ).academicYearName?.value?.trim() || vm.academicYear.name,
        entries: [...attendanceForm.querySelectorAll<HTMLButtonElement>('[data-attendance-cell]')].map(
          attendanceEntryFromCell
        ),
      });
      setAttendanceStatus('Attendance saved.', 'success');
    } catch (error) {
      setAttendanceStatus((error as LearnShellError).message || 'Attendance could not be saved.', 'error');
    } finally {
      if (save) {
        (save as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
        save.textContent = 'Save Attendance';
      }
    }
  });
  form.querySelector<HTMLSelectElement>('[data-grades-child]')?.addEventListener('change', (event) => {
    const params = new URLSearchParams(window.location.search);
    params.set('childId', (event.currentTarget as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value);
    window.location.search = params.toString();
  });
  form.querySelector<HTMLElement>('[name="academicYearName"]')?.addEventListener('change', (event) => {
    const params = new URLSearchParams(window.location.search);
    params.set(
      'academicYear',
      (event.currentTarget as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value.trim()
    );
    window.location.search = params.toString();
  });
  form.querySelector<HTMLButtonElement>('[data-grade-add-course]')?.addEventListener('click', () => {
    const listEl = root!.querySelector<HTMLElement>('[data-grade-course-list]');
    if (!listEl) return;
    if (!listEl.querySelector<HTMLElement>('[data-grade-course]')) listEl.innerHTML = '';
    listEl.insertAdjacentHTML(
      'beforeend',
      renderGradeCourseEditor(
        blankGradeCourse(vm),
        vm,
        listEl.querySelectorAll<HTMLElement>('[data-grade-course]').length
      )
    );
  });
  form.addEventListener('click', (event) => {
    const remove = (event.target as HTMLElement).closest<HTMLElement>('[data-grade-remove-course]');
    if (!remove) return;
    remove.closest<HTMLElement>('[data-grade-course]')?.remove();
    if (!root!.querySelector<HTMLElement>('[data-grade-course]')) {
      root!.querySelector<HTMLElement>('[data-grade-course-list]')!.innerHTML = emptyState(
        'No courses have been recorded for this student yet. Add a course to begin the transcript trail.'
      );
    }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const save = form.querySelector<HTMLButtonElement>('[data-grade-save]');
    const childId =
      ((form as HTMLFormElement).elements as HTMLFormControlsCollection & Record<string, { value: string }>).childId
        ?.value || vm.selectedChildId;
    const payload = {
      childId,
      academicYearName:
        (
          (form as HTMLFormElement).elements as HTMLFormControlsCollection & Record<string, { value: string }>
        ).academicYearName?.value?.trim() || vm.academicYear.name,
      courses: [...root!.querySelectorAll<HTMLElement>('[data-grade-course]')].map((courseEl) =>
        gradeCourseFromElement(courseEl, childId)
      ),
    };
    if (save) {
      (save as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
      save.textContent = 'Saving...';
    }
    setStatus('Saving grades...');
    try {
      await apiPost('/api/learn/grades', payload);
      setStatus('Grades saved. Refreshing the gradebook...', 'success');
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setStatus((error as LearnShellError).message || 'Grades could not be saved.', 'error');
    } finally {
      if (save) {
        (save as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
        save.textContent = 'Save Grades';
      }
    }
  });
  root!.querySelectorAll<HTMLButtonElement>('[data-report-export]').forEach((button) => {
    button.addEventListener('click', async () => {
      const label = button.dataset.reportExport || 'Report Card';
      const original = button.textContent;
      (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = true;
      button.textContent = 'Generating...';
      try {
        const templateId = label.toLowerCase().includes('transcript') ? 'transcript' : 'report-card';
        const response = await fetch(`/api/learn/print/${templateId}`, {
          method: 'POST',
          headers: learnRequestHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify({ label }),
        });
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('application/pdf'))
          throw new Error('Unable to generate that PDF yet.');
        const blob = await response.blob();
        downloadBlob(`${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`, blob);
      } catch (error) {
        showLearnDialog(
          'Print Could Not Be Generated',
          (error as LearnShellError).message || 'Please refresh and try again.',
          []
        );
      } finally {
        (button as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = false;
        button.textContent = original;
      }
    });
  });
}

function testScoreFromElement(entryEl: HTMLElement) {
  const field = (name: string) =>
    (
      entryEl.querySelector<HTMLElement>(`[name="${name}"]`) as
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    )?.value?.trim() || '';
  const testType = entryEl.dataset.testType === 'SAT' ? 'SAT' : 'ACT';
  return {
    id: entryEl.dataset.scoreId || '',
    testType,
    testDate: field('testDate'),
    compositeScore: field('compositeScore'),
    totalScore: field('totalScore'),
    englishScore: field('englishScore'),
    mathScore: field('mathScore'),
    readingScore: field('readingScore'),
    scienceScore: field('scienceScore'),
    writingScore: field('writingScore'),
    readingWritingScore: field('readingWritingScore'),
  };
}
export type LearnShell2Part15 = {
  updateActiveButton: typeof updateActiveButton;
  wireCommunityLegacy: typeof wireCommunityLegacy;
  wireCommunity: typeof wireCommunity;
  wireReports: typeof wireReports;
  gradeCourseFromElement: typeof gradeCourseFromElement;
  blankGradeCourse: typeof blankGradeCourse;
  attendanceEntryFromCell: typeof attendanceEntryFromCell;
  setAttendanceCellStatus: typeof setAttendanceCellStatus;
  wireGrades: typeof wireGrades;
  testScoreFromElement: typeof testScoreFromElement;
};
