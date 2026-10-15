import { AudioPlayer } from '../../src/browser/listen/player.js';
import { ListenDB } from '../../src/browser/listen/db.js';
import { exportOpml, importOpml } from '../../src/browser/listen/opml.js';
import { parseDirectoryCsv, mapImportRows } from '../../src/browser/parish/directory-import-format.js';
import { createAccountingReportPdf, type AccountingPdfReport } from '../../src/browser/parish/accounting-report-pdf.js';
import { renderSanitizedMarkup } from '../../src/browser/learn/sanitized-render.js';
const player = new AudioPlayer();
player.load('https://example.test/audio', 30);
player.on('progress', (event) => {
  const seconds: number = event.elapsed;
  void seconds;
});
const database = new ListenDB();
void database.saveProgress('episode', 20, 300);
void database.downloadEpisode({ guid: 'episode', url: 'https://example.test/audio' });
exportOpml([{ xmlUrl: 'https://example.test/rss', title: 'Example' }]);
importOpml('<opml/>');
const table = parseDirectoryCsv('name,email\nExample,person@example.test');
mapImportRows(table, { name: 0, email: 1 });
declare const report: AccountingPdfReport;
void createAccountingReportPdf(report);
renderSanitizedMarkup(document.createElement('div'), '<strong>Example</strong>');
// @ts-expect-error Playback speed is numeric.
player.setSpeed('fast');
// @ts-expect-error Progress events do not contain DOM element targets.
player.on('progress', (event) => event.target);
// @ts-expect-error Download records require a textual episode identity.
void database.downloadEpisode({ guid: 42, url: 'https://example.test/audio' });
// @ts-expect-error Progress seconds are numeric.
void database.saveProgress('episode', 'twenty', 300);
// @ts-expect-error OPML subscription URLs are textual.
exportOpml([{ xmlUrl: 42 }]);
// @ts-expect-error CSV is text.
parseDirectoryCsv(false);
// @ts-expect-error Sanitized rendering requires an Element target.
renderSanitizedMarkup(false, '<b>Example</b>');
