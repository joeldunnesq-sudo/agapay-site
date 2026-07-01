-- Migration: 0006_st_fiacre_demo
-- Demo parish: St. Fiacre Orthodox Church (Demo)
-- parish_id: 'st-fiacre'
-- A believable ROCOR mission in South Texas, newly using AGAPAY Give.
-- Sized realistically: ~45 families, active but small, growing.
-- Run AFTER 0005_stewardship_annual_meetings.sql.

-- ── Giving funds ─────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO giving_funds
  (parish_id, name, code, is_default, sort_order)
VALUES
  ('st-fiacre', 'General Stewardship',     'stewardship',  1, 0),
  ('st-fiacre', 'Candles / Vigil Lights',  'candle',       0, 1),
  ('st-fiacre', 'Building Fund',            'building',     0, 2),
  ('st-fiacre', 'Poor Box / Alms',          'alms',         0, 3),
  ('st-fiacre', 'Iconography Fund',         'iconography',  0, 4),
  ('st-fiacre', 'Memorial / Panakhida',     'memorial',     0, 5);

-- ── Donor offerings (giving history) ────────────────────────────────────────
-- Covers Oct 2024 – Jan 2025 (approx 16 weeks).
-- Mix of recurring stewardship, one-time candle/building gifts.

INSERT OR IGNORE INTO donor_offerings
  (id, donor_email, parish_id, payment_intent_id,
   status, payment_status, created_at, updated_at, data)
VALUES

-- October 2024
('fiacre-don-001','james.mcallister@email.com','st-fiacre','pi_fiacre_001','complete','paid','2024-10-06T10:15:00Z','2024-10-06T10:15:00Z',
 '{"donorName":"James McAllister","donorEmail":"james.mcallister@email.com","amountCents":20000,"fund":"stewardship","parishId":"st-fiacre","currency":"usd","isRecurring":true}'),

('fiacre-don-002','mary.oconnell@email.com','st-fiacre','pi_fiacre_002','complete','paid','2024-10-06T11:00:00Z','2024-10-06T11:00:00Z',
 '{"donorName":"Mary O''Connell","donorEmail":"mary.oconnell@email.com","amountCents":5000,"fund":"candle","parishId":"st-fiacre","currency":"usd","isRecurring":false}'),

('fiacre-don-003','brendan.murphy@email.com','st-fiacre','pi_fiacre_003','complete','paid','2024-10-13T09:30:00Z','2024-10-13T09:30:00Z',
 '{"donorName":"Brendan Murphy","donorEmail":"brendan.murphy@email.com","amountCents":30000,"fund":"stewardship","parishId":"st-fiacre","currency":"usd","isRecurring":true}'),

('fiacre-don-004','colleen.ryan@email.com','st-fiacre','pi_fiacre_004','complete','paid','2024-10-13T10:45:00Z','2024-10-13T10:45:00Z',
 '{"donorName":"Colleen Ryan","donorEmail":"colleen.ryan@email.com","amountCents":10000,"fund":"building","parishId":"st-fiacre","currency":"usd","isRecurring":false}'),

('fiacre-don-005','patrick.fitzgerald@email.com','st-fiacre','pi_fiacre_005','complete','paid','2024-10-20T11:00:00Z','2024-10-20T11:00:00Z',
 '{"donorName":"Patrick Fitzgerald","donorEmail":"patrick.fitzgerald@email.com","amountCents":15000,"fund":"stewardship","parishId":"st-fiacre","currency":"usd","isRecurring":true}'),

('fiacre-don-006','siobhan.kelly@email.com','st-fiacre','pi_fiacre_006','complete','paid','2024-10-20T09:00:00Z','2024-10-20T09:00:00Z',
 '{"donorName":"Siobhan Kelly","donorEmail":"siobhan.kelly@email.com","amountCents":5000,"fund":"candle","parishId":"st-fiacre","currency":"usd","isRecurring":false}'),

('fiacre-don-007','thomas.burke@email.com','st-fiacre','pi_fiacre_007','complete','paid','2024-10-27T10:00:00Z','2024-10-27T10:00:00Z',
 '{"donorName":"Thomas Burke","donorEmail":"thomas.burke@email.com","amountCents":25000,"fund":"stewardship","parishId":"st-fiacre","currency":"usd","isRecurring":true}'),

('fiacre-don-008','nora.gallagher@email.com','st-fiacre','pi_fiacre_008','complete','paid','2024-10-27T11:30:00Z','2024-10-27T11:30:00Z',
 '{"donorName":"Nora Gallagher","donorEmail":"nora.gallagher@email.com","amountCents":7500,"fund":"alms","parishId":"st-fiacre","currency":"usd","isRecurring":false}'),

-- November 2024
('fiacre-don-009','sean.doherty@email.com','st-fiacre','pi_fiacre_009','complete','paid','2024-11-03T09:45:00Z','2024-11-03T09:45:00Z',
 '{"donorName":"Sean Doherty","donorEmail":"sean.doherty@email.com","amountCents":20000,"fund":"stewardship","parishId":"st-fiacre","currency":"usd","isRecurring":true}'),

('fiacre-don-010','aine.mcdermott@email.com','st-fiacre','pi_fiacre_010','complete','paid','2024-11-03T10:30:00Z','2024-11-03T10:30:00Z',
 '{"donorName":"Aine McDermott","donorEmail":"aine.mcdermott@email.com","amountCents":50000,"fund":"iconography","parishId":"st-fiacre","currency":"usd","isRecurring":false}'),

('fiacre-don-011','liam.boyle@email.com','st-fiacre','pi_fiacre_011','complete','paid','2024-11-10T09:00:00Z','2024-11-10T09:00:00Z',
 '{"donorName":"Liam Boyle","donorEmail":"liam.boyle@email.com","amountCents":15000,"fund":"stewardship","parishId":"st-fiacre","currency":"usd","isRecurring":true}'),

('fiacre-don-012','maeve.quinn@email.com','st-fiacre','pi_fiacre_012','complete','paid','2024-11-10T11:00:00Z','2024-11-10T11:00:00Z',
 '{"donorName":"Maeve Quinn","donorEmail":"maeve.quinn@email.com","amountCents":5000,"fund":"candle","parishId":"st-fiacre","currency":"usd","isRecurring":false}'),

('fiacre-don-013','declan.brennan@email.com','st-fiacre','pi_fiacre_013','complete','paid','2024-11-17T10:00:00Z','2024-11-17T10:00:00Z',
 '{"donorName":"Declan Brennan","donorEmail":"declan.brennan@email.com","amountCents":20000,"fund":"stewardship","parishId":"st-fiacre","currency":"usd","isRecurring":true}'),

('fiacre-don-014','fiona.walsh@email.com','st-fiacre','pi_fiacre_014','complete','paid','2024-11-17T09:15:00Z','2024-11-17T09:15:00Z',
 '{"donorName":"Fiona Walsh","donorEmail":"fiona.walsh@email.com","amountCents":10000,"fund":"building","parishId":"st-fiacre","currency":"usd","isRecurring":false}'),

('fiacre-don-015','cormac.hayes@email.com','st-fiacre','pi_fiacre_015','complete','paid','2024-11-24T10:30:00Z','2024-11-24T10:30:00Z',
 '{"donorName":"Cormac Hayes","donorEmail":"cormac.hayes@email.com","amountCents":30000,"fund":"stewardship","parishId":"st-fiacre","currency":"usd","isRecurring":true}'),

('fiacre-don-016','roisin.lynch@email.com','st-fiacre','pi_fiacre_016','complete','paid','2024-11-24T11:00:00Z','2024-11-24T11:00:00Z',
 '{"donorName":"Roisin Lynch","donorEmail":"roisin.lynch@email.com","amountCents":10000,"fund":"memorial","parishId":"st-fiacre","currency":"usd","isRecurring":false}'),

-- December 2024 (Nativity season – giving spikes)
('fiacre-don-017','james.mcallister@email.com','st-fiacre','pi_fiacre_017','complete','paid','2024-12-01T09:00:00Z','2024-12-01T09:00:00Z',
 '{"donorName":"James McAllister","donorEmail":"james.mcallister@email.com","amountCents":20000,"fund":"stewardship","parishId":"st-fiacre","currency":"usd","isRecurring":true}'),

('fiacre-don-018','brendan.murphy@email.com','st-fiacre','pi_fiacre_018','complete','paid','2024-12-01T10:00:00Z','2024-12-01T10:00:00Z',
 '{"donorName":"Brendan Murphy","donorEmail":"brendan.murphy@email.com","amountCents":30000,"fund":"stewardship","parishId":"st-fiacre","currency":"usd","isRecurring":true}'),

('fiacre-don-019','anonymous.donor@email.com','st-fiacre','pi_fiacre_019','complete','paid','2024-12-08T11:00:00Z','2024-12-08T11:00:00Z',
 '{"donorName":"Anonymous","donorEmail":"anonymous.donor@email.com","amountCents":100000,"fund":"building","parishId":"st-fiacre","currency":"usd","isRecurring":false}'),

('fiacre-don-020','thomas.burke@email.com','st-fiacre','pi_fiacre_020','complete','paid','2024-12-08T09:30:00Z','2024-12-08T09:30:00Z',
 '{"donorName":"Thomas Burke","donorEmail":"thomas.burke@email.com","amountCents":25000,"fund":"stewardship","parishId":"st-fiacre","currency":"usd","isRecurring":true}'),

('fiacre-don-021','patrick.fitzgerald@email.com','st-fiacre','pi_fiacre_021','complete','paid','2024-12-15T10:00:00Z','2024-12-15T10:00:00Z',
 '{"donorName":"Patrick Fitzgerald","donorEmail":"patrick.fitzgerald@email.com","amountCents":15000,"fund":"stewardship","parishId":"st-fiacre","currency":"usd","isRecurring":true}'),

('fiacre-don-022','colleen.ryan@email.com','st-fiacre','pi_fiacre_022','complete','paid','2024-12-15T11:00:00Z','2024-12-15T11:00:00Z',
 '{"donorName":"Colleen Ryan","donorEmail":"colleen.ryan@email.com","amountCents":25000,"fund":"iconography","parishId":"st-fiacre","currency":"usd","isRecurring":false}'),

('fiacre-don-023','sean.doherty@email.com','st-fiacre','pi_fiacre_023','complete','paid','2024-12-22T09:00:00Z','2024-12-22T09:00:00Z',
 '{"donorName":"Sean Doherty","donorEmail":"sean.doherty@email.com","amountCents":20000,"fund":"stewardship","parishId":"st-fiacre","currency":"usd","isRecurring":true}'),

('fiacre-don-024','liam.boyle@email.com','st-fiacre','pi_fiacre_024','complete','paid','2024-12-22T10:30:00Z','2024-12-22T10:30:00Z',
 '{"donorName":"Liam Boyle","donorEmail":"liam.boyle@email.com","amountCents":15000,"fund":"stewardship","parishId":"st-fiacre","currency":"usd","isRecurring":true}'),

('fiacre-don-025','mary.oconnell@email.com','st-fiacre','pi_fiacre_025','complete','paid','2024-12-29T09:45:00Z','2024-12-29T09:45:00Z',
 '{"donorName":"Mary O''Connell","donorEmail":"mary.oconnell@email.com","amountCents":5000,"fund":"candle","parishId":"st-fiacre","currency":"usd","isRecurring":false}'),

-- January 2025
('fiacre-don-026','declan.brennan@email.com','st-fiacre','pi_fiacre_026','complete','paid','2025-01-05T10:00:00Z','2025-01-05T10:00:00Z',
 '{"donorName":"Declan Brennan","donorEmail":"declan.brennan@email.com","amountCents":20000,"fund":"stewardship","parishId":"st-fiacre","currency":"usd","isRecurring":true}'),

('fiacre-don-027','aine.mcdermott@email.com','st-fiacre','pi_fiacre_027','complete','paid','2025-01-05T11:15:00Z','2025-01-05T11:15:00Z',
 '{"donorName":"Aine McDermott","donorEmail":"aine.mcdermott@email.com","amountCents":10000,"fund":"alms","parishId":"st-fiacre","currency":"usd","isRecurring":false}'),

('fiacre-don-028','cormac.hayes@email.com','st-fiacre','pi_fiacre_028','complete','paid','2025-01-12T09:30:00Z','2025-01-12T09:30:00Z',
 '{"donorName":"Cormac Hayes","donorEmail":"cormac.hayes@email.com","amountCents":30000,"fund":"stewardship","parishId":"st-fiacre","currency":"usd","isRecurring":true}'),

('fiacre-don-029','nora.gallagher@email.com','st-fiacre','pi_fiacre_029','complete','paid','2025-01-12T10:00:00Z','2025-01-12T10:00:00Z',
 '{"donorName":"Nora Gallagher","donorEmail":"nora.gallagher@email.com","amountCents":5000,"fund":"candle","parishId":"st-fiacre","currency":"usd","isRecurring":false}'),

('fiacre-don-030','james.mcallister@email.com','st-fiacre','pi_fiacre_030','complete','paid','2025-01-19T09:00:00Z','2025-01-19T09:00:00Z',
 '{"donorName":"James McAllister","donorEmail":"james.mcallister@email.com","amountCents":20000,"fund":"stewardship","parishId":"st-fiacre","currency":"usd","isRecurring":true}');

-- ── Commemorations ────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO commemorations
  (id, parish_id, donor_email, created_at, data)
VALUES
  ('fiacre-comm-001', 'st-fiacre', 'james.mcallister@email.com', '2025-01-12T10:00:00Z',
   '{"living":["James","Catherine","Patrick","Brigid"],"departed":["Sean","Mary Margaret"],"createdAt":"2025-01-12T10:00:00Z"}'),
  ('fiacre-comm-002', 'st-fiacre', 'brendan.murphy@email.com', '2025-01-12T10:30:00Z',
   '{"living":["Brendan","Siobhan","Conor","Aoife"],"departed":["Michael","Agnes"],"createdAt":"2025-01-12T10:30:00Z"}'),
  ('fiacre-comm-003', 'st-fiacre', 'mary.oconnell@email.com', '2025-01-12T09:45:00Z',
   '{"living":["Mary","Kevin","Fiona"],"departed":["Francis","Bridget","Padraig"],"createdAt":"2025-01-12T09:45:00Z"}'),
  ('fiacre-comm-004', 'st-fiacre', 'thomas.burke@email.com', '2025-01-12T11:00:00Z',
   '{"living":["Thomas","Roisin","Liam","Ciara","Niamh"],"departed":["William"],"createdAt":"2025-01-12T11:00:00Z"}'),
  ('fiacre-comm-005', 'st-fiacre', 'patrick.fitzgerald@email.com', '2025-01-12T09:15:00Z',
   '{"living":["Patrick","Eileen"],"departed":["Daniel","Margaret","Joseph"],"createdAt":"2025-01-12T09:15:00Z"}');

-- ── Stewardship Suite: parish settings ───────────────────────────────────────

INSERT OR IGNORE INTO parish_stewardship_settings
  (parish_id, has_stewardship_suite, updated_at)
VALUES
  ('st-fiacre', 1, datetime('now'));

-- ── Stewardship Suite: giving fund snapshots ─────────────────────────────────
-- Matches the giving_funds seeded above with running balances

INSERT OR IGNORE INTO household_pledges
  (id, parish_id, donor_email, amount_cents, frequency, status, year, created_at, updated_at, data)
VALUES
  ('fiacre-pledge-001','st-fiacre','james.mcallister@email.com', 240000,'monthly','active',2025,'2025-01-01T00:00:00Z','2025-01-01T00:00:00Z','{"donorName":"James McAllister","notes":""}'),
  ('fiacre-pledge-002','st-fiacre','brendan.murphy@email.com',   360000,'monthly','active',2025,'2025-01-01T00:00:00Z','2025-01-01T00:00:00Z','{"donorName":"Brendan Murphy","notes":""}'),
  ('fiacre-pledge-003','st-fiacre','thomas.burke@email.com',     300000,'monthly','active',2025,'2025-01-01T00:00:00Z','2025-01-01T00:00:00Z','{"donorName":"Thomas Burke","notes":""}'),
  ('fiacre-pledge-004','st-fiacre','patrick.fitzgerald@email.com',180000,'monthly','active',2025,'2025-01-01T00:00:00Z','2025-01-01T00:00:00Z','{"donorName":"Patrick Fitzgerald","notes":""}'),
  ('fiacre-pledge-005','st-fiacre','sean.doherty@email.com',     240000,'monthly','active',2025,'2025-01-01T00:00:00Z','2025-01-01T00:00:00Z','{"donorName":"Sean Doherty","notes":""}'),
  ('fiacre-pledge-006','st-fiacre','liam.boyle@email.com',       180000,'monthly','active',2025,'2025-01-01T00:00:00Z','2025-01-01T00:00:00Z','{"donorName":"Liam Boyle","notes":""}'),
  ('fiacre-pledge-007','st-fiacre','declan.brennan@email.com',   240000,'monthly','active',2025,'2025-01-01T00:00:00Z','2025-01-01T00:00:00Z','{"donorName":"Declan Brennan","notes":""}'),
  ('fiacre-pledge-008','st-fiacre','cormac.hayes@email.com',     360000,'monthly','active',2025,'2025-01-01T00:00:00Z','2025-01-01T00:00:00Z','{"donorName":"Cormac Hayes","notes":""}');

-- ── Annual Meeting Packet ─────────────────────────────────────────────────────

INSERT OR IGNORE INTO stewardship_annual_meetings
  (id, parish_id, title, fiscal_year, meeting_date, meeting_time, location,
   parish_name_override, jurisdiction, address, status, created_by, created_at, updated_at)
VALUES (
  'fiacre-meeting-2025',
  'st-fiacre',
  'St. Fiacre Orthodox Church — 2025 Annual Parish Meeting',
  2025,
  '2025-02-02',
  '12:30',
  'Parish Hall, St. Fiacre Orthodox Church',
  'St. Fiacre Orthodox Church',
  'Diocese of Chicago and Mid-America, Russian Orthodox Church Outside Russia',
  '4821 Frankford Ave, Lubbock, TX 79424',
  'ready',
  'fr.seraphim@stfiacre.org',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO stewardship_agenda_items
  (id, annual_meeting_id, title, duration_minutes, sort_order, created_at)
VALUES
  ('fiacre-agenda-01','fiacre-meeting-2025','Opening Prayer',5,0,datetime('now')),
  ('fiacre-agenda-02','fiacre-meeting-2025','Approval of Minutes from 2024 Annual Meeting',5,1,datetime('now')),
  ('fiacre-agenda-03','fiacre-meeting-2025','Rector''s Report',15,2,datetime('now')),
  ('fiacre-agenda-04','fiacre-meeting-2025','Warden''s Report',10,3,datetime('now')),
  ('fiacre-agenda-05','fiacre-meeting-2025','Treasurer''s Report',15,4,datetime('now')),
  ('fiacre-agenda-06','fiacre-meeting-2025','Stewardship & AGAPAY Giving Summary',10,5,datetime('now')),
  ('fiacre-agenda-07','fiacre-meeting-2025','Restricted Funds Report',5,6,datetime('now')),
  ('fiacre-agenda-08','fiacre-meeting-2025','Parish Council Elections',20,7,datetime('now')),
  ('fiacre-agenda-09','fiacre-meeting-2025','Proposed Resolutions',10,8,datetime('now')),
  ('fiacre-agenda-10','fiacre-meeting-2025','New Business & Open Floor',10,9,datetime('now')),
  ('fiacre-agenda-11','fiacre-meeting-2025','Closing Prayer',5,10,datetime('now'));

INSERT OR IGNORE INTO stewardship_reports
  (id, annual_meeting_id, report_type, title, body, created_by, sort_order, created_at, updated_at)
VALUES
  ('fiacre-report-01','fiacre-meeting-2025','priest',
   'Rector''s Report — Fr. Seraphim Callahan',
   'Brothers and sisters in Christ,

Glory to Jesus Christ! Glory to Him forever!

It is with deep gratitude to God that I present this report on the life of our mission. The past year has been one of steady growth and spiritual deepening. Our Sunday Divine Liturgies averaged 58 faithful in attendance. We received three individuals into the Orthodox Faith through Baptism and Chrismation, and welcomed seven new families who are currently enrolled in catechesis.

Our kliros has grown to eight readers and singers, led ably by our Subdeacon. The feast of our patron, St. Fiacre the Gardener, was celebrated with a Divine Liturgy followed by a blessing of our new garden, which now provides fresh produce for distribution to families in need.

I am grateful to report that our launch of AGAPAY digital giving this autumn has strengthened stewardship considerably, with many families now giving consistently online. This is a genuine blessing and I commend it to those who have not yet set up recurring gifts.

Please keep our mission in your prayers. We are young, we are small, and we are growing in the love of God.

In Christ,
Hieromonk Seraphim (Callahan), Rector',
   'Fr. Seraphim Callahan', 0, datetime('now'), datetime('now')),

  ('fiacre-report-02','fiacre-meeting-2025','warden',
   'Warden''s Report — James McAllister',
   'The Parish Council met eight times in 2024. We welcomed two new council members and completed the following: installation of a new HVAC unit in the nave ($8,400), repainting of the fellowship hall ($2,100), and the launch of online giving through AGAPAY, which has already processed over $47,000 in gifts since October.

We are grateful to Brendan Murphy for coordinating our winter food drive, which collected over 800 pounds of non-perishables for the South Plains Food Bank.

James McAllister, Parish Warden',
   'James McAllister', 1, datetime('now'), datetime('now')),

  ('fiacre-report-03','fiacre-meeting-2025','treasurer',
   'Treasurer''s Report — Colleen Ryan',
   'Total income for 2024: $98,400
  — Stewardship pledges & offerings: $71,200
  — AGAPAY digital giving (Oct–Dec): $47,000 (included in above)
  — Candle & memorial offerings: $9,600
  — Building fund gifts: $17,600

Total operating expenses: $91,750
  — Clergy support: $48,000
  — Utilities & insurance: $18,200
  — HVAC repair: $8,400
  — Fellowship hall paint: $2,100
  — Liturgical supplies: $5,050
  — Diocesan assessment: $10,000

Net surplus: $6,650, held in the Building Reserve Fund.

Since launching AGAPAY in October, recurring giving has increased by 34% and our average gift size is up 18%. We are projecting continued growth in 2025.

Colleen Ryan, Treasurer',
   'Colleen Ryan', 2, datetime('now'), datetime('now')),

  ('fiacre-report-04','fiacre-meeting-2025','stewardship',
   'Stewardship & Digital Giving Report — Thomas Burke',
   '32 families made stewardship pledges for 2025 totaling $84,600. Eight families are now giving via AGAPAY recurring monthly giving. Pledge fulfillment in 2024 was 91%.

Our 2025 stewardship goal is $95,000. We encourage every family to consider increasing their pledge by one hour of their weekly wage.

Thomas Burke, Stewardship Chair',
   'Thomas Burke', 3, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO stewardship_financial_summaries
  (id, annual_meeting_id, total_income_cents, total_expense_cents, net_cents,
   notes, snapshot_taken_at, created_at, updated_at)
VALUES (
  'fiacre-fin-2025', 'fiacre-meeting-2025',
  9840000, 9175000, 665000,
  'Net surplus of $6,650 held in Building Reserve Fund per Parish Council resolution of December 18, 2024.',
  datetime('now'), datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO stewardship_restricted_fund_snapshots
  (id, annual_meeting_id, fund_name,
   beginning_balance_cents, total_received_cents, total_disbursed_cents, ending_balance_cents,
   sort_order, created_at)
VALUES
  ('fiacre-fund-01','fiacre-meeting-2025','Building Reserve Fund',   420000, 176000,  84000,  512000, 0, datetime('now')),
  ('fiacre-fund-02','fiacre-meeting-2025','Memorial Candle Fund',     48000,  96000,  91000,   53000, 1, datetime('now')),
  ('fiacre-fund-03','fiacre-meeting-2025','Iconography Restoration', 750000,  75000,      0,  825000, 2, datetime('now')),
  ('fiacre-fund-04','fiacre-meeting-2025','Charity & Alms',           18000,  64000,  59000,   23000, 3, datetime('now'));

INSERT OR IGNORE INTO stewardship_nominees
  (id, annual_meeting_id, full_name, position, bio, nominated_by, sort_order, created_at)
VALUES
  ('fiacre-nom-01','fiacre-meeting-2025','James McAllister','Parish Warden (re-election)',
   'James has served as Warden for two years and is a founding member of St. Fiacre. He works as a civil engineer and has led our facilities improvement projects.','Fr. Seraphim Callahan', 0, datetime('now')),
  ('fiacre-nom-02','fiacre-meeting-2025','Brendan Murphy','Parish Council Member',
   'Brendan joined our mission three years ago with his family. He coordinates our annual food drive and serves on the kliros.','James McAllister', 1, datetime('now')),
  ('fiacre-nom-03','fiacre-meeting-2025','Mary O''Connell','Parish Council Member',
   'Mary is a founding parishioner and coordinates the Ladies'' Auxiliary. She is a retired school principal.','Thomas Burke', 2, datetime('now')),
  ('fiacre-nom-04','fiacre-meeting-2025','Patrick Fitzgerald','Parish Council Member (re-election)',
   'Patrick has served one term on the council. He manages our parish social media and has helped grow our catechumenate program.','Colleen Ryan', 3, datetime('now'));

INSERT OR IGNORE INTO stewardship_resolutions
  (id, annual_meeting_id, title, resolved_text, sort_order, created_at)
VALUES
  ('fiacre-res-01','fiacre-meeting-2025','Approval of 2024 Financial Report',
   'the financial report for fiscal year 2024 be and hereby is approved as presented.',
   0, datetime('now')),
  ('fiacre-res-02','fiacre-meeting-2025','Adoption of 2025 Operating Budget',
   'the proposed operating budget for fiscal year 2025 in the amount of $102,000 be and hereby is adopted.',
   1, datetime('now')),
  ('fiacre-res-03','fiacre-meeting-2025','Continuation of AGAPAY Digital Giving',
   'the Parish Council be authorized to continue and expand the parish''s use of AGAPAY for digital stewardship giving, candle offerings, and commemorations.',
   2, datetime('now')),
  ('fiacre-res-04','fiacre-meeting-2025','Iconography Restoration Phase I',
   'the Parish Council be authorized to commission an iconographer for the restoration of the icon screen at a cost not to exceed $8,250, funded from the Iconography Restoration Fund.',
   3, datetime('now'));
