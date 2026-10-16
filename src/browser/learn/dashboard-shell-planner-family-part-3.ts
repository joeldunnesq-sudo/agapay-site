import type { LearnShellNode } from './dashboard-shell-contracts.js';
import type { LearnShellBindings } from './dashboard-shell-planner-family.js';

declare const eventRecurrenceOptions: LearnShellBindings['eventRecurrenceOptions'];
declare const html: LearnShellBindings['html'];
declare const setupInput: LearnShellBindings['setupInput'];
declare const setupSelect: LearnShellBindings['setupSelect'];
declare const setupRemoveButton: LearnShellBindings['setupRemoveButton'];

function familyEventSetupRow(event: LearnShellNode = {}) {
  return `<div data-setup-row="familyEvents" data-id="${html(event.id || '')}" class="learn-family-row learn-event-row">${setupInput('Event', 'title', event.title || '')}${setupSelect(
    'Type',
    'eventType',
    event.eventType || 'appointment',
    [
      { value: 'appointment', label: 'Appointment' },
      { value: 'field-trip', label: 'Field trip' },
      { value: 'extracurricular', label: 'Extracurricular' },
      { value: 'family', label: 'Family' },
      { value: 'other', label: 'Other' },
    ]
  )}${setupInput('Date', 'date', event.date || '', { type: 'date' })}${setupInput('Starts', 'startTime', event.startTime || '', { type: 'time' })}${setupSelect('Repeats', 'recurrence', event.recurrence || 'none', eventRecurrenceOptions)}${setupInput('Location', 'location', event.location || '')}${setupInput('Notes', 'notes', event.notes || '')}${setupRemoveButton()}</div>`;
}

function recipeSetupRow(recipe: LearnShellNode = {}) {
  return `<div data-setup-row="recipes" data-id="${html(recipe.id || '')}" class="learn-family-row learn-recipe-row">${setupInput('Recipe', 'title', recipe.title || '')}${setupSelect(
    'Fasting fit',
    'fastingType',
    recipe.fastingType || 'adaptable',
    [
      { value: 'fast-friendly', label: 'Fast-friendly' },
      { value: 'adaptable', label: 'Easy to adapt' },
      { value: 'regular', label: 'Regular meal' },
    ]
  )}${setupInput('Category', 'category', recipe.category || 'Dinner')}${setupInput('Source link', 'sourceUrl', recipe.sourceUrl || '', { type: 'url' })}${setupInput('Ingredients', 'ingredients', recipe.ingredients || '')}${setupInput('Notes / method', 'instructions', recipe.instructions || '')}${setupRemoveButton()}</div>`;
}

function grocerySetupRow(item: LearnShellNode = {}) {
  const isPantry = Boolean(item.pantry || item.inPantry);
  return `<div data-setup-row="groceryItems" data-id="${html(item.id || '')}" class="learn-family-row learn-grocery-row">${setupInput('Item', 'name', item.name || '')}${setupInput('Quantity', 'quantity', item.quantity || '')}${setupSelect('Aisle', 'category', item.category || (isPantry ? 'Pantry' : 'Produce'), ['Produce', 'Pantry', 'Bakery', 'Dairy', 'Frozen', 'Household', 'Other'])}<label class="learn-check-field"><input type="checkbox" name="checked" ${item.checked ? 'checked' : ''}> In cart</label><label class="learn-check-field"><input type="checkbox" name="pantry" ${isPantry ? 'checked' : ''}> Pantry staple</label>${setupRemoveButton()}</div>`;
}

function nextSevenDates(startDate: string = '') {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? new Date(`${startDate}T12:00:00`) : new Date();
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
}
export type LearnShell1Part2 = {
  familyEventSetupRow: typeof familyEventSetupRow;
  recipeSetupRow: typeof recipeSetupRow;
  grocerySetupRow: typeof grocerySetupRow;
  nextSevenDates: typeof nextSevenDates;
};
