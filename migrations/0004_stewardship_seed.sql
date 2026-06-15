-- Migration: 0004_stewardship_seed
-- Demo data for St. Nicholas Orthodox Church -- 2027 Annual Meeting Packet
-- parish_id: 'st-nicholas-demo'

INSERT OR IGNORE INTO stewardship_annual_meetings
  (id, parish_id, title, fiscal_year, meeting_date, meeting_time, location,
   parish_name_override, jurisdiction, address, status, created_by, created_at, updated_at)
VALUES (
  'demo-meeting-2027',
  'st-nicholas-demo',
  'St. Nicholas Orthodox Church -- 2027 Annual Parish Meeting',
  2027,
  '2027-02-09',
  '12:00',
  'Parish Hall, St. Nicholas Orthodox Church',
  'St. Nicholas Orthodox Church',
  'Diocese of Eastern America, Russian Orthodox Church Outside Russia',
  '123 Orthodox Way, Springfield, IL 62701',
  'ready',
  'parish@saintnicholasorthodox.org',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO stewardship_agenda_items
  (id, annual_meeting_id, title, duration_minutes, sort_order, created_at)
VALUES
  ('demo-agenda-01', 'demo-meeting-2027', 'Call to Order and Opening Prayer', 5, 0, datetime('now')),
  ('demo-agenda-02', 'demo-meeting-2027', 'Reading of the Minutes from Prior Meeting', 5, 1, datetime('now')),
  ('demo-agenda-03', 'demo-meeting-2027', 'Rector report', 15, 2, datetime('now')),
  ('demo-agenda-04', 'demo-meeting-2027', 'Warden report', 10, 3, datetime('now')),
  ('demo-agenda-05', 'demo-meeting-2027', 'Treasurer report', 15, 4, datetime('now')),
  ('demo-agenda-06', 'demo-meeting-2027', 'Stewardship Summary', 10, 5, datetime('now')),
  ('demo-agenda-07', 'demo-meeting-2027', 'Restricted Funds Report', 5, 6, datetime('now')),
  ('demo-agenda-08', 'demo-meeting-2027', 'Parish Council Elections', 20, 7, datetime('now')),
  ('demo-agenda-09', 'demo-meeting-2027', 'Proposed Resolutions', 15, 8, datetime('now')),
  ('demo-agenda-10', 'demo-meeting-2027', 'New Business', 10, 9, datetime('now')),
  ('demo-agenda-11', 'demo-meeting-2027', 'Closing Prayer and Adjournment', 5, 10, datetime('now'));

INSERT OR IGNORE INTO stewardship_reports
  (id, annual_meeting_id, report_type, title, body, sort_order, created_at, updated_at)
VALUES
  ('demo-report-01', 'demo-meeting-2027', 'priest', 'Rector Report -- Fr. John Stavros',
   'Dear brothers and sisters in Christ,

It is with great joy and thanksgiving to our Lord and Savior Jesus Christ that I present this report. The past year has seen spiritual growth. Our Sunday liturgies averaged 175 faithful. We welcomed 12 new families and received 4 individuals into the Orthodox Faith through chrismation.

In Christ, Archpriest John Stavros, Rector',
   0, datetime('now'), datetime('now')),
  ('demo-report-02', 'demo-meeting-2027', 'warden', 'Warden Report -- Alexei Petrov',
   'The Parish Council met nine times. Major accomplishments include completion of the parish hall roof repair, launch of online giving through AGAPAY, and establishment of a new building maintenance fund.

Alexei Petrov, Parish Warden',
   1, datetime('now'), datetime('now')),
  ('demo-report-03', 'demo-meeting-2027', 'treasurer', 'Treasurer Report -- Maria Kowalski',
   'Total income for 2026 was $284,500 from stewardship pledges ($198,000), candle offerings ($42,000), and rental income ($28,500). Total operating expenses were $261,200. Net operating surplus: $23,300, transferred to the Building Reserve Fund.

Maria Kowalski, Treasurer',
   2, datetime('now'), datetime('now')),
  ('demo-report-04', 'demo-meeting-2027', 'stewardship', 'Stewardship Summary -- Nicholas Adamou',
   '89 families made pledges totaling $198,000, a 7% increase over the prior year. Pledge fulfillment rate was 94%. For 2027, our campaign goal is $210,000.

Nicholas Adamou, Stewardship Chair',
   3, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO stewardship_financial_summaries
  (id, annual_meeting_id, total_income_cents, total_expense_cents, net_cents,
   notes, snapshot_taken_at, created_at, updated_at)
VALUES (
  'demo-fin-2027', 'demo-meeting-2027',
  28450000, 26120000, 2330000,
  'Net surplus transferred to Building Reserve Fund per Parish Council resolution of December 15, 2026.',
  datetime('now'), datetime('now'), datetime('now')
);

INSERT OR IGNORE INTO stewardship_restricted_fund_snapshots
  (id, annual_meeting_id, fund_name,
   beginning_balance_cents, total_received_cents, total_disbursed_cents, ending_balance_cents,
   sort_order, created_at)
VALUES
  ('demo-fund-01', 'demo-meeting-2027', 'Building Reserve Fund', 1850000, 2560000, 180000, 4230000, 0, datetime('now')),
  ('demo-fund-02', 'demo-meeting-2027', 'Memorial Candle Fund', 285000, 420000, 390000, 315000, 1, datetime('now')),
  ('demo-fund-03', 'demo-meeting-2027', 'Iconostasis Renovation Fund', 4250000, 650000, 1200000, 3700000, 2, datetime('now')),
  ('demo-fund-04', 'demo-meeting-2027', 'Charity and Alms Fund', 82000, 640000, 590000, 132000, 3, datetime('now')),
  ('demo-fund-05', 'demo-meeting-2027', 'Youth Ministry Fund', 125000, 480000, 510000, 95000, 4, datetime('now'));

INSERT OR IGNORE INTO stewardship_nominees
  (id, annual_meeting_id, full_name, position, sort_order, created_at)
VALUES
  ('demo-nom-01', 'demo-meeting-2027', 'Alexei Petrov', 'Parish Warden (re-election)', 0, datetime('now')),
  ('demo-nom-02', 'demo-meeting-2027', 'Sofia Demetriou', 'Parish Council Member', 1, datetime('now')),
  ('demo-nom-03', 'demo-meeting-2027', 'Theodore Baranov', 'Parish Council Member', 2, datetime('now')),
  ('demo-nom-04', 'demo-meeting-2027', 'Catherine Molinski', 'Parish Council Member (re-election)', 3, datetime('now')),
  ('demo-nom-05', 'demo-meeting-2027', 'Michael Stepanov', 'Parish Council Member', 4, datetime('now'));

INSERT OR IGNORE INTO stewardship_resolutions
  (id, annual_meeting_id, title, resolved_text, sort_order, created_at)
VALUES
  ('demo-res-01', 'demo-meeting-2027', 'Approval of 2026 Financial Report', 'the financial report for fiscal year 2026 be and hereby is approved.', 0, datetime('now')),
  ('demo-res-02', 'demo-meeting-2027', 'Adoption of 2027 Operating Budget', 'the proposed operating budget for fiscal year 2027 in the amount of $275,000 be and hereby is adopted.', 1, datetime('now')),
  ('demo-res-03', 'demo-meeting-2027', 'Authorization of Iconostasis Renovation Phase II', 'the Parish Council be authorized to proceed with Phase II of the Iconostasis Renovation at a cost not to exceed $45,000 from the Iconostasis Renovation Fund.', 2, datetime('now')),
  ('demo-res-04', 'demo-meeting-2027', 'Election of Auditor', 'Volkov and Associates CPAs be appointed as the independent auditor for fiscal year 2027.', 3, datetime('now'));
