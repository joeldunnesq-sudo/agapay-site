import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  archiveParishBulletin,
  buildBulletinCelebrationsBlock,
  buildSundayLiturgicalBlock,
  createParishBulletin,
  listParishTempleTroparia,
  listParishBulletins,
  saveParishTempleTroparia,
  updateParishBulletin,
  validateBulletinInput,
} from '../src/handlers/parish-bulletins.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlite = new DatabaseSync(':memory:');
for (const migration of [
  '0064_parish_content_reads.sql',
  '0065_parish_announcements.sql',
  '0067_parish_announcement_hero_images.sql',
  '0072_parish_teaching_posts.sql',
  '0074_parish_content_categories.sql',
  '0117_parish_bulletins.sql',
  '0118_parish_bulletin_troparia.sql',
]) {
  sqlite.exec(readFileSync(path.join(root, 'migrations', migration), 'utf8'));
}

const db = {
  prepare(sql) {
    return {
      parameters: [],
      bind(...parameters) {
        this.parameters = parameters;
        return this;
      },
      async first() {
        return sqlite.prepare(sql).get(...this.parameters) || null;
      },
      async all() {
        return { results: sqlite.prepare(sql).all(...this.parameters) };
      },
      async run() {
        const result = sqlite.prepare(sql).run(...this.parameters);
        return { success: true, meta: { changes: result.changes } };
      },
    };
  },
  async batch(statements) {
    for (const statement of statements) await statement.run();
    return statements.map(() => ({ success: true }));
  },
};

function edition(overrides = {}) {
  return {
    title: 'Sunday Bulletin',
    serviceDate: '2026-09-06',
    template: 'heritage',
    blocks: [
      {
        id: 'message-block-1',
        type: 'message',
        title: 'A word of welcome',
        body: 'Welcome to worship.',
      },
      {
        id: 'schedule-block-1',
        type: 'schedule',
        title: 'This week in worship',
        items: [{ label: 'Sunday', text: 'Divine Liturgy · 10:00 AM' }],
      },
    ],
    ...overrides,
  };
}

const validated = validateBulletinInput(edition());
assert.equal(validated.title, 'Sunday Bulletin');
assert.equal(validated.blocks.length, 2);
assert.equal(validated.blocks[1].items[0].text, 'Divine Liturgy · 10:00 AM');
assert.throws(() => validateBulletinInput(edition({ serviceDate: '2026-02-30' })), /valid bulletin date/);
assert.throws(() => validateBulletinInput(edition({ template: 'freeform' })), /supported bulletin design/);
assert.throws(() => validateBulletinInput(edition({ blocks: [] })), /at least one bulletin block/);
assert.equal(validateBulletinInput(edition({ template: 'folded' })).template, 'folded');
assert.throws(
  () => validateBulletinInput(edition({ blocks: [{ type: 'html', title: 'Unsafe', body: '<script>' }] })),
  /supported bulletin block/
);

let requestedLiturgicalUrl = '';
const liturgicalBlock = await buildSundayLiturgicalBlock({
  serviceDate: '2026-09-06',
  registration: { liturgicalCalendar: 'julian' },
  fetcher: async (url) => {
    requestedLiturgicalUrl = url;
    return new Response(
      JSON.stringify({
        summary_title: 'Holy Martyr Anthimus of Nicomedia',
        feast_level_description: 'Saint of the day',
        saints: ['Holy Martyr Anthimus of Nicomedia'],
        stories: [
          {
            title: 'Holy Martyr Anthimus of Nicomedia',
            story:
              '<p>Saint Anthimus served the Church as bishop of Nicomedia and strengthened the faithful during a time of persecution.</p>',
          },
        ],
        readings: [
          { source: 'epistle', display: '1 Corinthians 16:13–24', description: 'Sunday Epistle' },
          { source: 'gospel', display: 'Matthew 21:33–42', description: 'Sunday Gospel' },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  },
});
assert.match(requestedLiturgicalUrl, /\/julian\/2026\/9\/6\/$/);
assert.equal(liturgicalBlock.saint, 'Holy Martyr Anthimus of Nicomedia');
assert.match(liturgicalBlock.saintLife, /served the Church as bishop of Nicomedia/);
assert.doesNotMatch(liturgicalBlock.saintLife, /<p>/);
assert.deepEqual(
  liturgicalBlock.items.map((item) => item.label),
  ['Epistle', 'Gospel']
);
const validatedLiturgical = validateBulletinInput(
  edition({
    blocks: [
      {
        ...liturgicalBlock,
        id: 'liturgical-block-1',
        quoteText: 'Let all that you do be done in love.',
        quoteAttribution: 'St. Paul the Apostle',
      },
    ],
  })
);
assert.equal(validatedLiturgical.blocks[0].saint, 'Holy Martyr Anthimus of Nicomedia');
assert.equal(validatedLiturgical.blocks[0].saintLife, liturgicalBlock.saintLife);
assert.equal(validatedLiturgical.blocks[0].quoteText, 'Let all that you do be done in love.');
assert.equal(validatedLiturgical.blocks[0].quoteAttribution, 'St. Paul the Apostle');
assert.equal(validatedLiturgical.blocks[0].items[1].text, 'Matthew 21:33–42 · Sunday Gospel');

const celebrationsBlock = await buildBulletinCelebrationsBlock(null, 'parish-one', '2026-09-06', {
  milestoneLoader: async (_env, options) => {
    assert.equal(options.context.parishId, 'parish-one');
    assert.equal(options.days, 7);
    return {
      items: [
        {
          id: 'nameday-1',
          type: 'nameday',
          typeLabel: 'Name day',
          label: 'Maria Petrov',
          detail: 'The Nativity of the Theotokos',
          date: '2026-09-08',
        },
      ],
    };
  },
});
assert.equal(celebrationsBlock.items[0].source, 'directory');
assert.match(celebrationsBlock.items[0].text, /Maria Petrov · Name day/);
const validatedCelebrations = validateBulletinInput(
  edition({ blocks: [{ ...celebrationsBlock, id: 'celebrations-block-1' }] })
);
assert.equal(validatedCelebrations.blocks[0].items[0].source, 'directory');

const templeTroparia = await saveParishTempleTroparia(db, {
  parishId: 'parish-one',
  createdBy: 'rector@example.test',
  input: {
    troparia: [
      {
        id: 'temple-hymn-1',
        kind: 'troparion',
        title: 'Troparion of the Holy Transfiguration',
        tone: 'Tone 7',
        text: 'Thou wast transfigured on the mountain, O Christ God.',
      },
      {
        id: 'temple-hymn-2',
        kind: 'kontakion',
        title: 'Kontakion of the Holy Transfiguration',
        tone: 'Tone 7',
        text: 'On the mountain Thou wast transfigured, O Christ God.',
      },
    ],
  },
});
assert.equal(templeTroparia.length, 2);
assert.equal(templeTroparia[1].kind, 'kontakion');
assert.deepEqual(await listParishTempleTroparia(db, 'parish-two'), []);
const validatedHymns = validateBulletinInput(
  edition({ blocks: [{ id: 'hymns-block-1', type: 'hymns', title: 'Troparia & kontakia', hymns: templeTroparia }] })
);
assert.equal(validatedHymns.blocks[0].hymns[0].tone, 'Tone 7');
assert.throws(
  () =>
    sqlite
      .prepare(
        `
        INSERT INTO parish_bulletins
          (id, parish_id, title, service_date, template, status, content_json, created_by)
        VALUES ('invalid-date', 'parish-one', 'Invalid', 'not-a-date', 'heritage', 'draft', '[]', 'staff')
      `
      )
      .run(),
  /CHECK constraint failed/,
  'the schema must reject non-calendar edition dates independently of request validation'
);

const created = await createParishBulletin(db, {
  parishId: 'parish-one',
  createdBy: 'treasurer@example.test',
  input: edition(),
});
assert.ok(created.id);
assert.equal(created.status, 'draft');
assert.equal(created.parishId, 'parish-one');
assert.deepEqual(created.blocks, validated.blocks, 'the validated content snapshot should be stored unchanged');
assert.deepEqual(
  (await listParishBulletins(db, 'parish-one')).map((item) => item.id),
  [created.id]
);
assert.deepEqual(await listParishBulletins(db, 'parish-two'), [], 'bulletin lists must remain parish-scoped');

sqlite
  .prepare(
    `
  INSERT INTO parish_announcements (id, parish_id, title, body, status, created_by)
  VALUES ('announcement-1', 'parish-one', 'Coffee hour', 'Coffee hour follows Liturgy.', 'published', 'staff')
`
  )
  .run();
const snapshot = await createParishBulletin(db, {
  parishId: 'parish-one',
  createdBy: 'treasurer@example.test',
  input: edition({
    title: 'Snapshot edition',
    blocks: [
      {
        id: 'announcement-block-1',
        type: 'announcements',
        title: 'Parish life',
        body: 'Coffee hour\nCoffee hour follows Liturgy.',
      },
    ],
  }),
});
sqlite
  .prepare("UPDATE parish_announcements SET body = 'Changed after bulletin save.' WHERE id = 'announcement-1'")
  .run();
assert.match(
  (await listParishBulletins(db, 'parish-one')).find((item) => item.id === snapshot.id).blocks[0].body,
  /follows Liturgy/,
  'saved bulletins must retain a content snapshot when source announcements change'
);

const updated = await updateParishBulletin(db, {
  parishId: 'parish-one',
  bulletinId: created.id,
  input: edition({ title: 'Sunday of the Nativity' }),
});
assert.equal(updated.title, 'Sunday of the Nativity');
assert.equal(
  await updateParishBulletin(db, {
    parishId: 'parish-two',
    bulletinId: created.id,
    input: edition(),
  }),
  null,
  'another parish must not update a bulletin by ID'
);

assert.equal(await archiveParishBulletin(db, { parishId: 'parish-one', bulletinId: created.id }), true);
assert.deepEqual(
  (await listParishBulletins(db, 'parish-one')).map((item) => item.id),
  [snapshot.id],
  'archived editions should leave the active editor list'
);

const dashboard = readFileSync(path.join(root, 'public', 'parish', 'dashboard.html'), 'utf8');
const client = readFileSync(path.join(root, 'public', 'parish', 'features', 'koinonia', 'bulletins.js'), 'utf8');
assert.match(client, /data-koinonia-view="bulletins"/);
assert.match(dashboard, /id="bulletinMount"/);
assert.match(client, /id="bulletinPagePreview"/);
assert.match(client, /id="bulletinBlockEditor"/);
assert.match(client, /method: draft\.id \? 'PATCH' : 'POST'/);
assert.match(client, /printWindow\.print\(\)/);
assert.match(client, /updateBulletinServiceDate/);
assert.match(client, /Saint of the Sunday/);
assert.match(client, /Saint & appointed readings/);
assert.match(client, /Life of the saint/);
assert.match(client, /Temple hymns library/);
assert.match(client, /Troparia & kontakia/);
assert.match(client, /Parish celebrations/);
assert.match(client, /Folded booklet/);
assert.match(client, /Saint quotation/);
assert.match(client, /renderFoldedBulletin/);
assert.match(client, /Continuous editing preview/);
assert.match(client, /Downloads as four folded panels/);
assert.match(client, /printPageMarkup = folded/);
assert.doesNotMatch(client, /bulletin-cover-cross|☦/);
assert.match(client, /\.\.\.byType\('schedule'\), \.\.\.byType\('hymns'\)/);

console.log(
  'PASS - parish bulletins persist safe Sunday saint and reading snapshots with tenant isolation and a print-ready editor'
);
