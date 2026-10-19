import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { PDFDocument } from 'pdf-lib';
import { newPdfState, embedFonts } from '../src/learn/print-documents-shared.js';
import {
  newFormState,
  addFormPage,
  buildAcademicReportCardPdf,
  buildAcademicTranscriptPdf,
} from '../src/learn/print-academic-pdf.js';
import { renderPrintDocumentPdf } from '../src/learn/print-documents.js';
for (const path of ['public/learn/dashboard-shell.js', 'public/learn/dashboard-shell-planner-family.js']) {
  const source = fs.readFileSync(path, 'utf8'),
    ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const helpers = ast.statements.filter((n) => ts.isFunctionDeclaration(n) && n.name?.text.startsWith('learnOwnValue'));
  assert.ok(helpers.length);
  for (const node of helpers) {
    const box = vm.createContext({});
    vm.runInContext(node.getText(ast), box);
    const read = box[node.name.text];
    const table = { dashboard: { title: 'Home' }, empty: '', zero: 0, disabled: false };
    for (const key of Object.keys(table)) assert.equal(read(table, key), table[key]);
    for (const key of ['unknown', '__proto__', 'constructor', 'toString']) assert.equal(read(table, key), undefined);
    const inherited = Object.create({ dashboard: 'inherited' });
    inherited.owned = 'value';
    assert.equal(read(inherited, 'dashboard'), undefined);
    assert.equal(read(inherited, 'owned'), 'value');
    const prototypeData = JSON.parse('{"__proto__":"data"}');
    assert.equal(read(prototypeData, '__proto__'), 'data');
  }
}
const pdf = await PDFDocument.create(),
  fonts = await embedFonts(pdf);
for (const state of [newPdfState(pdf, fonts), newFormState(pdf, fonts, null)]) {
  assert.equal(state.pages.length, 0);
  assert.equal(pdf.getPageCount(), 0);
  assert.throws(() => state.page, /Create a PDF page/);
  const page = pdf.addPage();
  state.page = page;
  assert.equal(state.page, page);
  pdf.removePage(0);
}
const form = newFormState(pdf, fonts, null);
addFormPage(form, { title: 'Report' });
assert.equal(pdf.getPageCount(), 1);
assert.equal(form.pages.length, 1);
assert.equal(form.page, pdf.getPage(0));
// Fingerprints from accepted main 8eaec2442b3cc03e872d79d7c8127cd8b3258988.
// Compare page dimensions and actual drawing streams, excluding document timestamps.
const expected = [
  {
    pages: 2,
    shapes: [
      [612, 792],
      [612, 792],
    ],
    streams: [
      '96563998e668aa395a455d78976c4d74b60172f6e7f3f4f9c210869d668d907f',
      '95e6b45e56f0c4de79620db9c9c2b158a2f3e067bdf45f44b11449aadd639e09',
    ],
  },
  {
    pages: 2,
    shapes: [
      [612, 792],
      [612, 792],
    ],
    streams: [
      '96563998e668aa395a455d78976c4d74b60172f6e7f3f4f9c210869d668d907f',
      'aa5232bc016797bd17debcf8caa57f00b1010d6ce47ce5d9c54b1e960844f3b6',
    ],
  },
  {
    pages: 6,
    shapes: [
      [612, 792],
      [612, 792],
      [612, 792],
      [612, 792],
      [612, 792],
      [612, 792],
    ],
    streams: [
      '96563998e668aa395a455d78976c4d74b60172f6e7f3f4f9c210869d668d907f',
      '3e4fce4048ac788998197d57cb1016a510a4d2991ae6d107517a5af157b2924e',
      '90725f80390c931d00dee56f8fec0c28c6ed2cab6e1aa16adc82ab0853de03aa',
      '58602357c73d721870a8ece668e42bd1066283fd0ec5f315c6d19441a0ec6339',
      '7d4d560d978d14c8a0210019c35c84a74d74d47427bfebe2744f1ef8bea56aad',
      '00cfc56025963aa584fad72b761be0090f4539cd89168965bbed8ecfc4603c29',
    ],
  },
  {
    pages: 1,
    shapes: [[792, 612]],
    streams: ['d89983ecfe388f8fe325e40603c4a070fbb93ca324b6bb9e8331f5280d0dbb84'],
  },
  {
    pages: 1,
    shapes: [[612, 792]],
    streams: ['7fb4395ae37cbe5079350cdcacd7814d9263428bebea04386fc10c129519e5a4'],
  },
  {
    pages: 1,
    shapes: [[612, 792]],
    streams: ['1788453d65aa1b7eab8d9534ed14a7f9971e39dc6bb13481391ed5a63c2ba546'],
  },
];
async function fingerprint(bytes) {
  const doc = await PDFDocument.load(bytes);
  return {
    pages: doc.getPageCount(),
    shapes: doc.getPages().map((page) => [page.getWidth(), page.getHeight()]),
    streams: doc.getPages().map((page) =>
      createHash('sha256')
        .update(
          Buffer.concat(
            page.node
              .Contents()
              .asArray()
              .map((ref) => Buffer.from(doc.context.lookup(ref).getContents()))
          )
        )
        .digest('hex')
    ),
  };
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response('', { status: 404 });
try {
  const actual = [];
  for (const sections of [
    [],
    [{ type: 'list', items: [{ title: 'A short report.' }] }],
    Array.from({ length: 50 }, () => ({
      type: 'list',
      heading: 'Section',
      items: [{ title: 'A long report. '.repeat(40) }],
    })),
  ])
    actual.push(
      await fingerprint(
        await renderPrintDocumentPdf({
          title: 'Boundary regression',
          subtitle: 'Synthetic',
          sections,
          generatedAt: '2026-10-18',
        })
      )
    );
  actual.push(
    await fingerprint(
      await renderPrintDocumentPdf({
        title: 'Landscape',
        subtitle: 'Synthetic',
        sections: [],
        layout: 'designed-week-forms-landscape',
        designedForms: [{ label: 'Family', days: [] }],
        generatedAt: '2026-10-18',
      })
    )
  );
  for (const renderer of [buildAcademicReportCardPdf, buildAcademicTranscriptPdf])
    actual.push(await fingerprint(await renderer({ generatedAt: '2026-10-18' })));
  assert.deepEqual(
    actual,
    expected,
    'cover, overflow, landscape, report-card and transcript drawing streams must match accepted production'
  );
} finally {
  globalThis.fetch = originalFetch;
}
console.log('PASS - owned Learn lookups and explicitly initialized PDF pages preserve fallbacks and rendering');
