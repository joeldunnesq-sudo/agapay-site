function page(title, subtitle, sections) {
  return {
    title,
    subtitle,
    sections: sections.filter((section) => section.items.length)
  };
}

function childFormLabel(child = {}) {
  if (child.formLabel || child.gradeLabel || child.form) return child.formLabel || child.gradeLabel || child.form;
  const years = Number(child.ageYears);
  if (!Number.isFinite(years)) return "Household Form";
  if (years <= 5) return "Little Ones";
  if (years <= 8) return "Form I";
  if (years <= 11) return "Form II";
  if (years <= 14) return "Form III";
  if (years <= 16) return "Form IV";
  return "Form V";
}

function groupChildRowsByForm(childRows = []) {
  const groups = new Map();
  childRows.forEach((row) => {
    const label = childFormLabel(row.child);
    if (!groups.has(label)) {
      groups.set(label, {
        label,
        children: new Set(),
        details: [],
        minutes: 0
      });
    }
    const group = groups.get(label);
    if (row.child?.firstName) group.children.add(row.child.firstName);
    if (row.title) group.details.push(row.detail ? `${row.title}: ${row.detail}` : row.title);
    group.minutes += row.minutes.reduce((sum, minutes) => sum + Number(minutes || 0), 0);
  });
  return Array.from(groups.values());
}

export function buildWeeklyHouseholdPrintDocument({ household, week, calendarToggle }) {
  const formRows = groupChildRowsByForm(week.childRows);
  return page(
    "Weekly Household Plan",
    `${household.name} - ${week.label} - ${calendarToggle.description}`,
    [
      {
        title: "Household Stream",
        items: week.householdRows.map((row) => ({
          label: row.title,
          detail: row.detail,
          minutes: row.minutes.reduce((sum, minutes) => sum + Number(minutes || 0), 0)
        }))
      },
      {
        title: "Form Plans",
        items: formRows.map((row) => ({
          label: row.label,
          detail: [Array.from(row.children).join(", "), row.details.slice(0, 4).join("; ")].filter(Boolean).join(" - "),
          minutes: row.minutes
        }))
      }
    ]
  );
}

export function buildPrintJobRequest({ templateId, format = "pdf", rangeLabel = "", requestedBy = "household" }) {
  return {
    templateId,
    format,
    rangeLabel,
    requestedBy,
    status: "ready",
    createdAt: new Date().toISOString()
  };
}
