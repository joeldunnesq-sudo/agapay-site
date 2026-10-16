import type {
  LearnSetupTileValues,
  LearnTruthyFilter,
  LearnGradeRecord,
  LearnGradeCourse,
  LearnReportsVm,
  LearnShellNode,
  LearnShellSectionOptions,
  LearnBooksVm,
  LearnGradesVm,
  LearnCoOpVm,
  LearnSetupVm,
} from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell.js';

declare const bookCover: LearnShellBindings['bookCover'];
declare const bar: LearnShellBindings['bar'];
declare const shell: LearnShellBindings['shell'];
declare const setupWeekdays: LearnShellBindings['setupWeekdays'];
declare const html: LearnShellBindings['html'];
declare const learnExperience: LearnShellBindings['learnExperience'];
declare const emptyState: LearnShellBindings['emptyState'];
declare const panel: LearnShellBindings['panel'];
declare const renderAttendanceTracker: LearnShellBindings['renderAttendanceTracker'];
declare const DEFAULT_TERM_WEEK_COUNT: LearnShellBindings['DEFAULT_TERM_WEEK_COUNT'];
declare const formationRhythmSetupRow: LearnShellBindings['formationRhythmSetupRow'];
declare const formationRecitationSetupRow: LearnShellBindings['formationRecitationSetupRow'];
declare const formationEnrichmentSetupRow: LearnShellBindings['formationEnrichmentSetupRow'];
declare const learnSectionHref: LearnShellBindings['learnSectionHref'];

function renderBooks(vm: LearnBooksVm) {
  const tefaActive = learnExperience().tefaActive;
  const libraryColumns = tefaActive ? '2fr 1.1fr 1fr .6fr 1fr' : '2fr 1.1fr 1fr .6fr .7fr 1fr';
  // ── Read-aloud cards ──────────────────────────────────────────────────────────
  const readAloudCards = vm.readAlouds.length
    ? vm.readAlouds
        .map(
          (book) => `
        <article style="display:flex;gap:14px;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:14px;min-width:0;box-shadow:0 1px 3px rgba(20,40,70,.04);">
          ${bookCover(book, '☰')}
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;">
            <strong style="font-family:'Cormorant Garamond',serif;font-size:19px;line-height:1.12;color:var(--ink);">${html(book.title)}</strong>
            <span style="font-size:12px;color:var(--muted);">${html(book.author)}</span>
            <span style="font-size:12px;color:var(--gold);font-weight:700;letter-spacing:.04em;">${html(book.assignment || book.stream || 'Household')}</span>
            <div style="margin-top:auto;padding-top:10px;">
              ${bar(book.progress)}
              <small style="display:block;color:var(--gold);font-weight:700;margin-top:4px;">${html(book.progress)}% complete</small>
            </div>
          </div>
        </article>`
        )
        .join('')
    : emptyState('Add read-alouds in Setup to track progress here.');

  // ── Library table — fixed overflow ────────────────────────────────────────────
  const libraryRows = vm.library.length
    ? vm.library
        .map(
          (book, i) => `
        <div style="display:grid;grid-template-columns:${libraryColumns};gap:10px;align-items:center;padding:10px 4px;border-top:1px solid var(--line);font-size:13px;background:${i % 2 ? 'var(--paper2)' : 'transparent'};">
          <span style="display:flex;align-items:center;gap:9px;min-width:0;">
            ${bookCover(book, '☰')}
            <span style="min-width:0;">
              <strong style="display:block;color:var(--ink);font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${html(book.title)}</strong>
              <small class="learn-muted">${html(book.assignment || '')}</small>
            </span>
          </span>
          <span style="color:var(--ink);">${html(book.author)}</span>
          <span class="learn-muted">${html(book.category)}</span>
          <span class="learn-muted">${html(book.ages || '—')}</span>
          ${tefaActive ? '' : `<span style="${book.orthodox ? 'color:var(--gold);font-weight:700;' : 'color:var(--muted);'}">${book.orthodox ? 'Orthodox' : '—'}</span>`}
          <span>${bar(book.progress)}<small style="color:var(--gold);font-weight:700;">${html(book.progress)}%</small></span>
        </div>`
        )
        .join('')
    : `<div style="padding:18px 4px;color:var(--muted);font-style:italic;">Add books in Setup to build the household library.</div>`;

  const libraryHeader = `
    <div style="display:grid;grid-template-columns:${libraryColumns};gap:10px;padding:0 4px 10px;border-bottom:1px solid var(--line);font-size:10px;letter-spacing:.1em;color:var(--muted);font-weight:700;text-transform:uppercase;">
      <span>Title</span><span>Author</span><span>Category</span><span>Ages</span>${tefaActive ? '' : '<span>Orthodox</span>'}<span>Progress</span>
    </div>`;

  // ── Book pacing ───────────────────────────────────────────────────────────────
  const pacingContent = vm.pacing.weeks.length
    ? `<strong style="font-family:'Cormorant Garamond',serif;font-size:20px;display:block;margin-bottom:4px;">${html(vm.pacing.title)}</strong>
       <small class="learn-muted">${html(vm.pacing.subtitle)}${vm.pacing.chaptersPerWeek ? ` · ${html(vm.pacing.chaptersPerWeek)} ch/wk` : ''}</small>
       ${vm.pacing.weeks
         .map(
           (week, i) => `
         <div style="display:grid;grid-template-columns:52px 1fr 52px;gap:8px;border-top:1px solid var(--line);padding:8px 0;font-size:13px;align-items:center;">
           <span class="learn-muted">Wk ${html(week.week)}</span>
           <strong style="font-size:14px;">${html(week.chapters)}</strong>
           <span style="color:var(--muted);text-align:right;">${html(week.pages)}</span>
         </div>`
         )
         .join('')}`
    : emptyState('Add a read-aloud with start and end chapters in Setup.');

  // ── Copywork sources ──────────────────────────────────────────────────────────
  const copyworkContent = vm.copywork.length
    ? vm.copywork
        .map(
          (source) => `
        <div style="padding:9px 0;border-top:1px solid var(--line);">
          <strong style="display:block;font-size:14px;">${html(source.title)}</strong>
          <small style="color:var(--muted);font-size:12px;line-height:1.4;">${html(source.detail)}</small>
        </div>`
        )
        .join('')
    : '';

  // ── Orthodox suggestions ──────────────────────────────────────────────────────
  const suggestionsContent = vm.suggestions.length
    ? vm.suggestions
        .map(
          (s) => `
        <div style="display:flex;gap:12px;padding:11px 0;border-top:1px solid var(--line);align-items:flex-start;">
          <span style="flex:none;width:36px;height:36px;border-radius:50%;background:${s.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;font-size:16px;">✥</span>
          <div>
            <strong style="font-family:'Cormorant Garamond',serif;font-size:17px;display:block;line-height:1.2;">${html(s.title)}</strong>
            <small style="color:var(--muted);font-size:12px;line-height:1.3;">${html(s.subtitle)}</small>
          </div>
        </div>`
        )
        .join('')
    : '';

  const body = `
    <section data-screen-label="Books" class="learn-stack">

      <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">

        <div style="flex:1 1 620px;min-width:0;display:flex;flex-direction:column;gap:16px;">

          ${panel(
            'Current Read-Alouds',
            `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;">${readAloudCards}</div>`,
            { icon: '☰' }
          )}

          ${panel(
            'Household Library',
            `<div style="overflow-x:auto;overflow-y:visible;">
               <div style="min-width:680px;">${libraryHeader}${libraryRows}</div>
             </div>`,
            { icon: '⌂' }
          )}

        </div>

        <aside style="flex:0 1 320px;min-width:240px;display:flex;flex-direction:column;gap:16px;">

          ${panel('Book Pacing', pacingContent, { icon: '♙' })}

          ${vm.copywork.length ? panel('Copywork Sources', copyworkContent, { icon: '✒' }) : ''}

          ${
            vm.suggestions.length
              ? panel(tefaActive ? 'Suggested Living Books' : 'Suggested Orthodox Books', suggestionsContent, {
                  icon: '✥',
                })
              : ''
          }

        </aside>

      </div>

    </section>`;
  return shell(vm, body);
}

function renderReports(vm: LearnReportsVm) {
  const exportButtons = vm.exports
    .map((item) => {
      const label = item.label || item.title || 'Learn Report';
      return `<button type="button" data-report-export="${html(label)}" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:12px;font-family:inherit;color:var(--ink);display:grid;gap:5px;text-align:left;cursor:pointer;"><strong>${html(label)}</strong><small class="learn-muted">${html(item.format)}</small></button>`;
    })
    .join('');
  const subjectRows = vm.subjectProgress.length
    ? vm.subjectProgress
        .map(
          (row) =>
            `<tr style="border-top:1px solid var(--line);"><td style="padding:10px;font-weight:700;">${html(row.subjectTitle)}</td><td style="padding:10px;">${html(row.childName)}</td><td style="padding:10px;">${html(row.formLabel)}</td><td style="padding:10px;">${html(row.source || row.subjectType)}</td><td style="padding:10px;">${html(row.completed)} / ${html(row.total)} ${html(row.progressionType)}</td><td style="padding:10px;min-width:130px;">${bar(row.percent, row.color)}<small>${html(row.percent)}%</small></td><td style="padding:10px;text-transform:capitalize;color:var(--gold);">${html(row.status)}</td></tr>`
        )
        .join('')
    : `<tr><td colspan="7" style="padding:18px;color:var(--muted);">Add subject ranges and Done Through progress in Setup to generate state-reporting rows.</td></tr>`;
  const body = `
    <section data-screen-label="Reports" class="learn-stack">
      <div style="display:grid;grid-template-columns:repeat(4,minmax(170px,1fr));gap:14px;">${vm.stats.map((stat) => `<div style="background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;gap:13px;align-items:center;"><span style="width:44px;height:44px;border-radius:50%;background:${stat.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;">✥</span><span><small style="display:block;color:var(--gold);letter-spacing:.12em;text-transform:uppercase;">${html(stat.label)}</small><strong style="font-family:'Cormorant Garamond',serif;font-size:25px;">${html(stat.value)}</strong><small style="display:block;color:var(--muted);">${html(stat.sub)}</small></span></div>`).join('')}</div>
      <div style="display:grid;grid-template-columns:1fr 360px;gap:16px;align-items:start;">
        ${panel('Child Progress Overview', vm.children!.map((child) => `<div style="display:grid;grid-template-columns:42px 1fr 150px;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--line);"><span style="width:38px;height:38px;border-radius:50%;background:${child.color};color:#f3ead4;display:flex;align-items:center;justify-content:center;">${html(child.initial)}</span><div><strong>${html(child.name)}</strong><small style="display:block;color:var(--muted);">${html(child.grade)} · Age ${html(child.age)} · ${html(child.summary)}</small><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;"><span><small class="learn-muted">Lessons ${html(child.lessons.done)} / ${html(child.lessons.total)}</small>${bar(child.lessons.percent, child.color)}</span><span><small class="learn-muted">Read-aloud ${html(child.readAloud.percent)}%</small>${bar(child.readAloud.percent, child.color)}</span></div></div><span style="text-transform:capitalize;color:var(--gold);">${html(child.status)}</span></div>`).join(''), { icon: '✥' })}
        ${panel('Year-End Report Preview', `<div style="border:1px solid var(--line);background:#fffaf0;border-radius:10px;min-height:260px;padding:26px;text-align:center;"><div style="color:var(--gold);font-size:32px;">✥</div><h2 style="font-family:'Cormorant Garamond',serif;margin:12px 0 4px;">${html(vm.pdf.title)}</h2><p>${html(vm.pdf.familyName)}</p><small style="display:block;color:var(--muted);">Generated from Learn setup progress, narrations, lessons, and attendance.</small><div style="text-align:left;margin-top:18px;color:#34405a;font-size:13px;">${vm.pdf.summary.map((line) => `<div style="border-top:1px solid var(--line);padding:8px 0;">${html(line)}</div>`).join('')}</div></div><button type="button" data-report-pdf style="margin-top:12px;width:100%;background:var(--navy);color:#fff;border:none;border-radius:10px;padding:11px;font-family:inherit;cursor:pointer;">Print Beautiful Report</button>`, { icon: '☰' })}
      </div>
      ${panel('State Reporting Subject Progress', `<div style="overflow:auto;"><table style="width:100%;border-collapse:collapse;font-size:14px;"><thead><tr style="color:var(--gold);font-size:11px;letter-spacing:.12em;text-transform:uppercase;"><th style="text-align:left;padding:8px;">Subject</th><th style="text-align:left;padding:8px;">Student</th><th style="text-align:left;padding:8px;">Form</th><th style="text-align:left;padding:8px;">Source</th><th style="text-align:left;padding:8px;">Progress</th><th style="text-align:left;padding:8px;">Complete</th><th style="text-align:left;padding:8px;">Status</th></tr></thead><tbody>${subjectRows}</tbody></table></div>`, { icon: '▤' })}
      ${panel('Narration Log', `<div style="overflow:auto;"><table style="width:100%;border-collapse:collapse;font-size:14px;"><tbody>${vm.narrations.map((log) => `<tr style="border-top:1px solid var(--line);"><td style="padding:10px;">${html(log.date)}</td><td style="padding:10px;">${html(log.child)}</td><td style="padding:10px;">${html(log.source)}</td><td style="padding:10px;text-transform:capitalize;">${html(log.type)}</td><td style="padding:10px;color:var(--muted);">${html(log.note)}</td></tr>`).join('')}</tbody></table></div>`, { icon: '✒' })}
      ${panel('Compliance-Friendly Exports', `<div style="display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px;">${exportButtons}</div>`, { icon: '▤' })}
    </section>`;
  return shell(vm, body);
}

function gradeOption(value: unknown, selectedValue: string) {
  return `<option value="${html(value)}" ${value === selectedValue ? 'selected' : ''}>${html(value || 'Select')}</option>`;
}

function renderGradeTermFields(course: LearnGradeCourse, grade: LearnGradeRecord) {
  return `
    <fieldset class="learn-grade-term" data-grade-term="${grade.termIndex}">
      <legend>Term ${grade.termIndex}</legend>
      <label>Score
        <input name="numericScore" inputmode="decimal" value="${html(grade.numericScore)}" placeholder="96" />
      </label>
      <label>Grade
        <select name="letterGrade">
          ${['', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'].map((value) => gradeOption(value, grade.letterGrade)).join('')}
        </select>
      </label>
      <label>Attendance
        <input name="attendanceDays" inputmode="numeric" value="${html(grade.attendanceDays)}" placeholder="60" />
      </label>
      <label class="learn-grade-notes">Narrative notes
        <textarea name="teacherNotes" rows="3" placeholder="Narrative evaluation for this course and term">${html(grade.teacherNotes)}</textarea>
      </label>
    </fieldset>
  `;
}

function renderGradeCourseEditor(course: LearnGradeCourse, vm: LearnGradesVm, index: number) {
  return `
    <article class="learn-grade-course" data-grade-course data-course-id="${html(course.id)}">
      <header>
        <span style="--course-color:${html(course.color)}">${html(String(index + 1))}</span>
        <div>
          <input name="courseTitle" value="${html(course.courseTitle)}" aria-label="Course title" />
          <small>${html(course.subjectCategory)} · Grade ${html(course.gradeLevel)} · ${html(course.creditHours)} credit${Number(course.creditHours) === 1 ? '' : 's'}</small>
        </div>
        <button type="button" data-grade-remove-course aria-label="Remove course">×</button>
      </header>
      <div class="learn-grade-course-meta">
        <label>Subject
          <select name="subjectCategory">
            ${vm.subjectCategories.map((category) => `<option value="${html(category)}" ${category === course.subjectCategory ? 'selected' : ''}>${html(category)}</option>`).join('')}
          </select>
        </label>
        <label>Grade level
          <select name="gradeLevel">
            ${[9, 10, 11, 12].map((gradeLevel) => `<option value="${gradeLevel}" ${Number(course.gradeLevel) === gradeLevel ? 'selected' : ''}>${gradeLevel}</option>`).join('')}
          </select>
        </label>
        <label>Credit hours
          <input name="creditHours" inputmode="decimal" value="${html(course.creditHours)}" />
        </label>
      </div>
      <div class="learn-grade-term-grid">
        ${course.grades!.map((grade) => renderGradeTermFields(course, grade)).join('')}
      </div>
    </article>
  `;
}

function renderTestScoreRow(entry: LearnShellNode = {}) {
  const isSat = entry.testType === 'SAT';
  const id = entry.id || '';
  const val = (v: unknown) => (v === null || v === undefined ? '' : v);
  if (isSat) {
    return `<article class="learn-grade-course" data-test-score data-test-type="SAT" data-score-id="${html(id)}">
      <header><span style="--course-color:var(--gold);">SAT</span><div><input name="testDate" type="date" value="${html(entry.testDate || '')}" aria-label="Test date" /><small>SAT</small></div><button type="button" data-test-score-remove aria-label="Remove score">×</button></header>
      <div class="learn-grade-course-meta">
        <label>Total Score<input name="totalScore" inputmode="numeric" value="${html(val(entry.totalScore))}" placeholder="1200" /></label>
        <label>Reading/Writing<input name="readingWritingScore" inputmode="numeric" value="${html(val(entry.readingWritingScore))}" placeholder="620" /></label>
        <label>Math<input name="mathScore" inputmode="numeric" value="${html(val(entry.mathScore))}" placeholder="580" /></label>
      </div>
    </article>`;
  }
  return `<article class="learn-grade-course" data-test-score data-test-type="ACT" data-score-id="${html(id)}">
    <header><span style="--course-color:var(--navy);">ACT</span><div><input name="testDate" type="date" value="${html(entry.testDate || '')}" aria-label="Test date" /><small>ACT</small></div><button type="button" data-test-score-remove aria-label="Remove score">×</button></header>
    <div class="learn-grade-course-meta">
      <label>Composite<input name="compositeScore" inputmode="numeric" value="${html(val(entry.compositeScore))}" placeholder="27" /></label>
      <label>English<input name="englishScore" inputmode="numeric" value="${html(val(entry.englishScore))}" placeholder="26" /></label>
      <label>Math<input name="mathScore" inputmode="numeric" value="${html(val(entry.mathScore))}" placeholder="27" /></label>
      <label>Reading<input name="readingScore" inputmode="numeric" value="${html(val(entry.readingScore))}" placeholder="28" /></label>
      <label>Science<input name="scienceScore" inputmode="numeric" value="${html(val(entry.scienceScore))}" placeholder="26" /></label>
      <label>Writing (optional)<input name="writingScore" inputmode="numeric" value="${html(val(entry.writingScore))}" placeholder="8" /></label>
    </div>
  </article>`;
}

function renderTestScoresPanel(vm: LearnGradesVm) {
  const scores = vm.testScores || [];
  const rows = scores.length ? scores.map((entry: LearnShellNode) => renderTestScoreRow(entry)).join('') : '';
  return panel(
    'Test Scores',
    `
    <p class="learn-muted" style="margin:0 0 12px;font-size:13px;">Add ACT or SAT results as they come in — they print directly on this student's transcript.</p>
    <div class="learn-grades-actions" style="margin-bottom:12px;">
      <button type="button" data-test-score-add="ACT">Add ACT Score</button>
      <button type="button" data-test-score-add="SAT">Add SAT Score</button>
      <button type="button" data-test-scores-save>Save Test Scores</button>
    </div>
    <div data-test-scores-status class="learn-grades-status" aria-live="polite"></div>
    <div class="learn-grade-editor" data-test-score-list>${rows || emptyState('No ACT or SAT scores recorded yet for this student.')}</div>
  `,
    { icon: '✎' }
  );
}

function renderGrades(vm: LearnGradesVm) {
  const selectedCourses = vm.childCourses;
  const childOptions = vm.children
    .map(
      (child) =>
        `<option value="${html(child.id)}" ${child.id === vm.selectedChildId ? 'selected' : ''}>${html(child.name)}${child.gradeLabel ? ` · ${html(child.gradeLabel)}` : ''}</option>`
    )
    .join('');
  const transcriptRows = selectedCourses.length
    ? selectedCourses
        .map((course) => {
          const finalGrade = [...course.grades].reverse().find((grade) => grade.letterGrade)?.letterGrade || '';
          return `<tr><th scope="row">${html(course.courseTitle)}</th><td>${html(course.subjectCategory)}</td><td>Grade ${html(course.gradeLevel)}</td><td>${html(course.creditHours)}</td><td>${html(finalGrade || 'Open')}</td></tr>`;
        })
        .join('')
    : `<tr><td colspan="5">Add courses to begin transcript tracking.</td></tr>`;
  const body = `
    <section data-screen-label="Grades" class="learn-grades-page">
      <form data-grades-form>
        <div class="learn-grades-toolbar">
          <label>Student
            <select name="childId" data-grades-child>
              ${childOptions}
            </select>
          </label>
          <label>Academic year
            <input name="academicYearName" value="${html(vm.academicYear.name)}" />
            <small class="learn-muted">Entering records for a past year (child started high school before AGAPAY)? Type that year's name here, e.g. "2022-2023 School Year", to switch and add courses for it.</small>
          </label>
          <div class="learn-grades-actions">
            <button type="button" data-grade-add-course>Add Course</button>
            <button type="submit" data-grade-save>Save Grades</button>
          </div>
        </div>

        <div class="learn-grades-summary">
          <article><small>Student</small><strong>${html(vm.selectedChild.name || 'Student')}</strong><span>${html(vm.selectedChild.gradeLabel || 'High school records')}</span></article>
          <article><small>Courses</small><strong>${html(String(selectedCourses.length))}</strong><span>For selected student</span></article>
          <article><small>Credits Earned</small><strong data-grade-summary-credits>${html(vm.summary.totalCredits)}</strong><span>Transcript total</span></article>
          <article><small>Unweighted GPA</small><strong data-grade-summary-gpa>${html(vm.summary.cumulativeGpa)}</strong><span>4.0 scale</span></article>
          <article><small>Attendance</small><strong>${html(String(vm.summary.attendanceDays || 0))}</strong><span>Instructional days</span></article>
        </div>

        ${renderAttendanceTracker(vm)}

        <div data-grades-status class="learn-grades-status" aria-live="polite"></div>

        <div class="learn-grade-editor" data-grade-course-list>
          ${selectedCourses.length ? selectedCourses.map((course, index) => renderGradeCourseEditor(course, vm, index)).join('') : emptyState('No courses have been recorded for this student yet. Add a course to begin the transcript trail.')}
        </div>
      </form>

      ${panel('Transcript Readiness', `<div style="overflow:auto;"><table class="learn-grade-transcript-table"><thead><tr><th>Course</th><th>Subject</th><th>Level</th><th>Credit</th><th>Final</th></tr></thead><tbody>${transcriptRows}</tbody></table></div><div class="learn-grade-print-actions"><a href="${learnSectionHref('print-center')}">Open Print Center</a><button type="button" data-report-export="Report Card" data-report-child-id="${html(vm.selectedChildId)}">Print Report Card</button><button type="button" data-report-export="Transcript" data-report-child-id="${html(vm.selectedChildId)}">Print Transcript</button></div>`, { icon: '▤' })}
      ${renderTestScoresPanel(vm)}
    </section>
  `;
  return shell(vm, body);
}

function renderCoOp(vm: LearnCoOpVm) {
  const body = `
    <section data-screen-label="Co-op" class="learn-stack">
      ${panel('Co-op Coming Soon', `<div style="display:grid;grid-template-columns:130px 1fr;gap:22px;align-items:center;"><div style="height:132px;border:1px solid var(--line);border-radius:12px;background:linear-gradient(180deg,#f8f0dd,#efe0ba);display:flex;align-items:center;justify-content:center;color:var(--gold);font-size:54px;">◎</div><div><small style="color:var(--gold);letter-spacing:.16em;text-transform:uppercase;">Future Learn Add-On</small><h2 style="font-family:'Cormorant Garamond',serif;font-size:34px;margin:8px 0 6px;">Co-op tools are coming soon</h2><p style="margin:0;color:#34405a;line-height:1.5;max-width:760px;">For launch, AGAPAY Learn is focused on setup, Today, planning, Church rhythms, formation, books, Grace Mode, and printable household plans. Co-op creation, invitations, and shared schedules will come in a later release.</p></div></div>`, { icon: '◎' })}
      <div style="display:grid;grid-template-columns:repeat(3,minmax(180px,1fr));gap:16px;">
        ${panel('Planned Later', `<div class="learn-list-row">Create or join a co-op</div><div class="learn-list-row">Invite AGAPAY member families</div><div class="learn-list-row">Shared schedules and rotation</div>`, { icon: '▣' })}
        ${panel('Launch Focus', `<div class="learn-list-row">Simple and Advanced Setup</div><div class="learn-list-row">Planner and Print Center</div><div class="learn-list-row">Formation, books, and Grace Mode</div>`, { icon: '✥' })}
        ${panel('Status', `<strong style="font-family:'Cormorant Garamond',serif;font-size:26px;">Coming Soon</strong><small style="display:block;color:var(--muted);margin-top:6px;">This tab is intentionally parked for the first revenue-focused launch.</small>`, { icon: '♢' })}
      </div>
    </section>`;
  return shell(vm, body);
}

function scheduledDays(value: unknown, legacyFrequency: unknown = '') {
  const direct = Array.isArray(value) ? (value as unknown[]) : String(value || '').split(',');
  const valid = direct
    .map((day) => String(day).trim().toLowerCase())
    .filter((day) => setupWeekdays.some((option) => option.value === day));
  if (valid.length) return [...new Set(valid)];
  const presets = {
    daily: ['mon', 'tue', 'wed', 'thu', 'fri'],
    '4x': ['mon', 'tue', 'wed', 'thu'],
    '3x': ['mon', 'wed', 'fri'],
    '2x': ['tue', 'thu'],
    weekly: ['wed'],
    '1x': ['wed'],
    'as-needed': [],
  };
  return (
    (presets as unknown as Record<string, (typeof presets)[keyof typeof presets] | undefined>)[
      String(legacyFrequency || '').toLowerCase()
    ] || ['mon', 'tue', 'wed', 'thu', 'fri']
  );
}

function setupDayPicker(value: unknown, legacyFrequency: unknown = '') {
  const selected = scheduledDays(value, legacyFrequency);
  const summary = selected.length
    ? setupWeekdays
        .filter((day) => selected.includes(day.value))
        .map((day) => day.label)
        .join(' · ')
    : 'Choose days';
  return `<details class="learn-day-picker"><summary><span>Days</span><strong data-day-summary>${html(summary)}</strong></summary><div class="learn-day-picker-menu">${setupWeekdays.map((day) => `<label><input type="checkbox" data-day-choice value="${day.value}" ${selected.includes(day.value) ? 'checked' : ''}>${day.label}</label>`).join('')}</div><input type="hidden" name="scheduledDays" value="${html(selected.join(','))}"></details>`;
}

function setupSourceInput(label: string, name: string, value: unknown = '') {
  const resolved = String(value || '').trim();
  const link = /^https?:\/\//i.test(resolved)
    ? `<a href="${html(resolved)}" target="_blank" rel="noopener noreferrer" class="learn-source-link">Open source</a>`
    : '';
  return `<label>${html(label)}<input type="text" name="${html(name)}" value="${html(resolved)}" inputmode="url" placeholder="Book title, source note, or https://..." />${link}</label>`;
}

function setupWeeklyPlanFields(value: unknown = []) {
  const entries = Array.isArray(value) ? value : String(value || '').split('|');
  return `<details class="learn-weekly-plan-fields"><summary><span>Weekly chapters / lessons / pages</span><strong>Optional</strong></summary><div class="learn-weekly-plan-grid">${Array.from({ length: DEFAULT_TERM_WEEK_COUNT }, (_, index) => `<label>Week ${index + 1}<input type="text" name="weeklyPlans.${index + 1}" value="${html(entries[index] || '')}" placeholder="Ch. 1, pp. 4-9, lesson 2..." /></label>`).join('')}</div></details>`;
}

function setupMultiChildPicker(children: LearnShellNode[] = [], selectedIds: (string | undefined)[] = []) {
  // Normalise: selectedIds may be a comma-joined string or an array
  const selected = Array.isArray(selectedIds)
    ? selectedIds
    : String(selectedIds || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean as unknown as LearnTruthyFilter);
  const summary = selected.length
    ? children
        .filter((child) => selected.includes(child.id))
        .map((child) => child.name || child.firstName || child.id)
        .join(', ')
    : 'Use Form Assignment';
  return `<details class="learn-day-picker learn-child-multi-picker"><summary><span>Specific children</span><strong data-child-multi-summary>${html(summary)}</strong></summary><div class="learn-day-picker-menu">${children.map((child) => `<label><input type="checkbox" data-child-multi-choice value="${html(child.id)}" ${selected.includes(child.id) ? 'checked' : ''}>${html(child.name || child.firstName || child.id)}</label>`).join('')}</div><input type="hidden" name="childIds" value="${html(selected.join(','))}"></details>`;
}

function churchRhythmSetupPanel(vm: LearnSetupVm) {
  const formation = vm.formationSetup || {};
  const tefa = learnExperience().tefaActive;
  const sectionStyle =
    'border:1px solid var(--line);border-radius:13px;background:rgba(255,252,245,.64);padding:14px;display:grid;gap:12px;';
  const sectionTitle = (title: string, subtitle = '') =>
    `<div><strong style="display:block;font-family:var(--sans);font-size:15px;color:var(--ink);">${html(title)}</strong>${subtitle ? `<small style="display:block;color:var(--muted);line-height:1.35;margin-top:2px;">${html(subtitle)}</small>` : ''}</div>`;
  return `
    <div style="display:grid;gap:14px;">
      <p style="margin:0;color:var(--muted);line-height:1.45;">${tefa ? 'Build a simple household opening routine that helps everyone begin the school day together.' : "This is the household's daily Church anchor. It lives above school subjects because it shapes the day before lesson planning begins."}</p>
      <div style="${sectionStyle}">
        ${sectionTitle('Daily rhythm items', tefa ? 'Morning meeting, read-aloud, movement, planning, and other shared anchors.' : 'Prayer, Gospel, Epistle, saints, feasts, and fasting notes.')}
        <div data-setup-list="formationRhythms" style="display:grid;gap:10px;">${(formation.churchRhythms?.length ? formation.churchRhythms : [{}]).map((rhythm) => formationRhythmSetupRow(rhythm)).join('')}</div>
        <button type="button" data-setup-add-row="formationRhythms" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add ${tefa ? 'Household Rhythm' : 'Church Rhythm'}</button>
      </div>
    </div>`;
}

function setupTileValue<T extends LearnSetupTileValues>(vm: LearnSetupVm, group: string, panelId: string, fallback: T) {
  const tile = vm.setupTiles?.[group]?.[panelId] || {};
  const allowSavedTitle = group !== 'subjects' || learnExperience().tefaActive;
  return {
    ...fallback,
    title: allowSavedTitle ? tile.title || fallback.title : fallback.title,
    detail: allowSavedTitle ? tile.detail || fallback.detail : fallback.detail,
    minutes: tile.minutes || fallback.minutes || '20',
  };
}

function setupSectionCard({ group, panel: panelId, title, detail, count = 0, icon = '✥' }: LearnShellSectionOptions) {
  const controls = `learnSetupPanel-${group}-${panelId}`;
  const countLabel = count ? `${count} item${count === 1 ? '' : 's'}` : 'Open';
  return `<button type="button" class="learn-setup-section-card" data-setup-section-toggle data-setup-section-group="${html(group)}" data-setup-section-panel="${html(panelId)}" aria-expanded="false" aria-controls="${html(controls)}"><small><span class="learn-setup-card-icon" aria-hidden="true">${html(icon)}</span><span>${html(countLabel)}</span></small><strong data-setup-section-card-title>${html(title)}</strong><span data-setup-section-card-detail>${html(detail)}</span><em>Open</em></button>`;
}

function setupSectionPanel({
  group,
  panel: panelId,
  title,
  detail = '',
  minutes = '20',
  teksUrl = '',
  content,
}: LearnShellSectionOptions) {
  const id = `learnSetupPanel-${group}-${panelId}`;
  const hasTileMinutes = group === 'subjects' || (group === 'formation' && panelId !== 'recitation');
  const teksLink = teksUrl
    ? `<a href="${html(teksUrl)}" target="_blank" rel="noopener noreferrer" class="learn-setup-teks-link" style="font-size:12px;color:var(--gold);text-decoration:none;white-space:nowrap;">TEA subject page ↗</a>`
    : '';
  return `<div id="${html(id)}" class="learn-setup-subsection" data-setup-section-group="${html(group)}" data-setup-section-panel="${html(panelId)}" hidden><div class="learn-setup-subsection-header"><div><strong data-setup-section-panel-title>${html(title)}</strong>${detail ? `<span data-setup-section-panel-detail>${html(detail)}</span>` : ''}${teksLink}</div><button type="button" class="learn-setup-subsection-close" data-setup-section-close data-setup-section-group="${html(group)}" data-setup-section-panel="${html(panelId)}">Collapse</button></div><div class="learn-setup-tile-editor"><label>Tile title<input name="setupTiles.${html(group)}.${html(panelId)}.title" data-setup-section-title-input data-setup-section-group="${html(group)}" data-setup-section-panel="${html(panelId)}" value="${html(title)}" /></label><label>Tile description<textarea name="setupTiles.${html(group)}.${html(panelId)}.detail" data-setup-section-detail-input data-setup-section-group="${html(group)}" data-setup-section-panel="${html(panelId)}" rows="2">${html(detail)}</textarea></label>${hasTileMinutes ? `<label>Minutes<input type="number" name="setupTiles.${html(group)}.${html(panelId)}.minutes" data-setup-section-minutes-input value="${html(minutes || '20')}" /></label>` : ''}</div>${content}</div>`;
}

function formationSetupPanel(vm: LearnSetupVm) {
  const tefa = learnExperience().tefaActive;
  const formation = vm.formationSetup || {};
  const currentTermId = vm.schoolYear.currentTermId || vm.term.id;
  const enrichmentBlocks = formation.enrichmentBlocks || [];
  const countByType = (type: string) =>
    enrichmentBlocks.filter((block) => String(block.blockType || block.type || '').toLowerCase() === type.toLowerCase())
      .length;
  const sections = [
    {
      panel: 'catechesis',
      title: 'Catechesis',
      detail: 'Doctrine, Scripture, faith conversations, and parish formation.',
      icon: '✥',
      type: 'Catechesis',
    },
    {
      panel: 'recitation',
      title: 'Recitation',
      detail: tefa
        ? 'Poems, speeches, vocabulary, facts, and memory work.'
        : 'Creeds, prayers, psalms, Scripture, poems, and speeches.',
      icon: '✦',
      type: 'Recitation & Memory Work',
      rows: formation.recitationTracks || [],
      rowKind: 'recitation',
    },
    {
      panel: 'saints',
      title: 'Saints',
      detail: 'Lives of saints, feast preparation, and century-book notes.',
      icon: '☰',
      type: 'Saints & Feasts',
    },
    {
      panel: 'icons',
      title: 'Icons',
      detail: 'Icon study, sacred art observation, and copywork prompts.',
      icon: '▣',
      type: 'Icon Study',
    },
    {
      panel: 'hymns',
      title: 'Hymns',
      detail: 'Troparia, kontakia, hymn study, and singing practice.',
      icon: '♪',
      type: 'Hymn Study',
    },
    {
      panel: 'artists',
      title: 'Artists',
      detail: 'Artist study, picture study, and visual narration.',
      icon: '◎',
      type: 'Art Study',
    },
    {
      panel: 'composers',
      title: 'Composers',
      detail: tefa
        ? 'Composer study, music history, and attentive listening.'
        : 'Composer study, sacred music, and attentive listening.',
      icon: '♫',
      type: 'Music Study',
    },
    {
      panel: 'folk-songs',
      title: 'Folk Songs',
      detail: 'Folk songs, seasonal songs, and family singing.',
      icon: '♬',
      type: 'Folk Songs',
    },
    {
      panel: 'poetry',
      title: 'Poetry',
      detail: 'Poet study, recitation, copywork, and beautiful language.',
      icon: '✒',
      type: 'Poetry',
    },
    {
      panel: 'shakespeare',
      title: 'Shakespeare',
      detail: 'Plays, scenes, narration, and performance notes.',
      icon: '♜',
      type: 'Shakespeare',
    },
  ]
    .filter((section) => !tefa || !['catechesis', 'saints', 'icons', 'hymns'].includes(section.panel))
    .map((section) => setupTileValue(vm, 'formation', section.panel, section));
  const sectionRows = (section: (typeof sections)[number]) =>
    section.rowKind === 'recitation'
      ? (section.rows.length ? section.rows : [{}])
          .map((track: LearnShellNode) => formationRecitationSetupRow(track, vm.children, vm.preferences.groupingMode))
          .join('')
      : (enrichmentBlocks.filter(
          (block) => String(block.blockType || block.type || '').toLowerCase() === section.type.toLowerCase()
        ).length
          ? enrichmentBlocks.filter(
              (block) => String(block.blockType || block.type || '').toLowerCase() === section.type.toLowerCase()
            )
          : [{ blockType: section.type }]
        )
          .map((block) =>
            formationEnrichmentSetupRow(
              { ...block, blockType: block.blockType || section.type },
              vm.children,
              vm.terms,
              currentTermId,
              vm.preferences.groupingMode,
              section.minutes
            )
          )
          .join('');
  const sectionContent = (section: (typeof sections)[number]) =>
    section.rowKind === 'recitation'
      ? `<div data-setup-list="formationRecitation" style="display:grid;gap:10px;">${sectionRows(section)}</div><button type="button" data-setup-add-row="formationRecitation" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add Recitation</button>`
      : `<div id="learnSetupFormation-${html(section.panel)}" data-setup-list="formationEnrichment" style="display:grid;gap:10px;">${sectionRows(section)}</div><button type="button" data-setup-add-row="formationEnrichment" data-setup-add-target="learnSetupFormation-${html(section.panel)}" data-setup-add-block-type="${html(section.type)}" style="border:1px solid var(--line);background:var(--paper2);border-radius:10px;padding:10px 16px;font-family:inherit;">Add ${html(section.title)}</button>`;
  return `
    <div style="display:grid;gap:14px;">
      <p style="margin:0;color:var(--muted);line-height:1.45;">Each tile is a planning basket. Open the tile you want, add the books, recitations, hymns, poets, artists, or other enrichment you want available, then choose whether each item is shared by the whole family or assigned by ${vm.preferences.groupingMode === 'grades' ? 'grade' : 'Form'}.</p>
      <p class="learn-setup-helper-note"><strong>How this becomes a week:</strong> These enrichment items become draggable subject cards in the Planner Week view. You will be able to drag each one into the day you want, then add chapters, pages, lessons, or notes for that specific day without changing Setup.</p>
      <div class="learn-setup-section-grid">${sections.map((section: (typeof sections)[number]) => setupSectionCard({ group: 'formation', ...section, count: section.rowKind === 'recitation' ? section.rows.length : countByType(section.type) })).join('')}</div>
      ${sections.map((section: (typeof sections)[number]) => setupSectionPanel({ group: 'formation', panel: section.panel, title: section.title, detail: section.detail, minutes: section.minutes, content: sectionContent(section) })).join('')}
    </div>`;
}
export type LearnShell2Part5 = {
  renderBooks: typeof renderBooks;
  renderReports: typeof renderReports;
  gradeOption: typeof gradeOption;
  renderGradeTermFields: typeof renderGradeTermFields;
  renderGradeCourseEditor: typeof renderGradeCourseEditor;
  renderTestScoreRow: typeof renderTestScoreRow;
  renderTestScoresPanel: typeof renderTestScoresPanel;
  renderGrades: typeof renderGrades;
  renderCoOp: typeof renderCoOp;
  scheduledDays: typeof scheduledDays;
  setupDayPicker: typeof setupDayPicker;
  setupSourceInput: typeof setupSourceInput;
  setupWeeklyPlanFields: typeof setupWeeklyPlanFields;
  setupMultiChildPicker: typeof setupMultiChildPicker;
  churchRhythmSetupPanel: typeof churchRhythmSetupPanel;
  setupTileValue: typeof setupTileValue;
  setupSectionCard: typeof setupSectionCard;
  setupSectionPanel: typeof setupSectionPanel;
  formationSetupPanel: typeof formationSetupPanel;
};
