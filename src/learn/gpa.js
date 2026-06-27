const GPA_POINTS = new Map([
  ["A+", 4.0],
  ["A", 4.0],
  ["A-", 3.7],
  ["B+", 3.3],
  ["B", 3.0],
  ["B-", 2.7],
  ["C+", 2.3],
  ["C", 2.0],
  ["C-", 1.7],
  ["D+", 1.3],
  ["D", 1.0],
  ["D-", 0.7],
  ["F", 0.0]
]);

function normalizeLetterGrade(letterGrade) {
  return String(letterGrade ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function gradeForCourse(course = {}) {
  if (course.letterGrade) return course.letterGrade;
  if (course.letter_grade) return course.letter_grade;
  if (course.grade?.letterGrade) return course.grade.letterGrade;
  if (course.grade?.letter_grade) return course.grade.letter_grade;
  return "";
}

function creditsForCourse(course = {}) {
  return numeric(course.creditHours ?? course.credit_hours ?? course.credits, 0);
}

export function getGPAPoints(letterGrade) {
  const normalized = normalizeLetterGrade(letterGrade);
  return GPA_POINTS.has(normalized) ? GPA_POINTS.get(normalized) : null;
}

export function calculateCumulativeGPA(coursesWithGrades = []) {
  let totalWeightedPoints = 0;
  let totalCredits = 0;

  for (const course of Array.isArray(coursesWithGrades) ? coursesWithGrades : []) {
    const creditHours = creditsForCourse(course);
    const gradePoints = getGPAPoints(gradeForCourse(course));

    if (creditHours <= 0 || gradePoints === null) continue;

    totalCredits += creditHours;
    totalWeightedPoints += gradePoints * creditHours;
  }

  if (totalCredits <= 0) return "0.00";
  return (totalWeightedPoints / totalCredits).toFixed(2);
}
