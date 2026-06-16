function page(title, subtitle, sections) {
  return {
    title,
    subtitle,
    sections: sections.filter((section) => section.items.length)
  };
}

export function buildWeeklyHouseholdPrintDocument({ household, week, calendarToggle }) {
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
        title: "Child Plans",
        items: week.childRows.map((row) => ({
          label: `${row.child?.firstName || "Child"} - ${row.title}`,
          detail: row.detail,
          minutes: row.minutes.reduce((sum, minutes) => sum + Number(minutes || 0), 0)
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
