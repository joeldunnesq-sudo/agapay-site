window.KoinoniaExperience.parishContext(null, false);
window.KoinoniaExperience.parishContext({ id: 'parish', signupsEnabled: true }, true);
window.KoinoniaExperience.compactFasting(document.createElement('div'), 'Strict fast');
window.KoinoniaExperience.liturgicalDay('2026-10-14', undefined, 'October 14');
// @ts-expect-error Capability flags must be booleans.
window.KoinoniaExperience.parishContext({ signupsEnabled: 'yes' }, true);
// @ts-expect-error Communications visibility must be explicit.
window.KoinoniaExperience.parishContext({});
// @ts-expect-error Fasting text is a string.
window.KoinoniaExperience.compactFasting(document.createElement('div'), 5);
// @ts-expect-error A real DOM element is required.
window.KoinoniaExperience.compactFasting(null, 'Fast');
