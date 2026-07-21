-- Operational canary bootstrap. Run after accounting migrations 0001-0005
-- and before 0006+, matching initializeLedger() without parish data.
INSERT OR IGNORE INTO accounting_account_types(id,code,name,category,normal_balance,statement_type,sort_order,is_system) VALUES
('type_asset','ASSET','Assets','asset','debit','balance_sheet',10,1),
('type_liability','LIABILITY','Liabilities','liability','credit','balance_sheet',20,1),
('type_net_asset','NET_ASSET','Net Assets','net_asset','credit','balance_sheet',30,1),
('type_revenue','REVENUE','Revenue','revenue','credit','activity_statement',40,1),
('type_expense','EXPENSE','Expenses','expense','debit','activity_statement',50,1);
INSERT OR IGNORE INTO accounting_accounts(id,account_number,name,account_type_id,normal_balance,is_posting_account,is_system,requires_fund) VALUES
('acct_1000','1000','Cash and Cash Equivalents','type_asset','debit',0,1,1),('acct_1010','1010','Operating Checking','type_asset','debit',1,1,1),
('acct_1100','1100','Undeposited Funds','type_asset','debit',1,1,1),('acct_2000','2000','Accounts Payable','type_liability','credit',1,0,1),
('acct_3000','3000','Net Assets Without Donor Restrictions','type_net_asset','credit',1,1,1),('acct_3100','3100','Net Assets With Donor Restrictions','type_net_asset','credit',1,0,1),
('acct_3990','3990','Opening Balance Net Assets','type_net_asset','credit',1,1,1),('acct_4000','4000','Stewardship and Tithes','type_revenue','credit',1,0,1),
('acct_4010','4010','General Donations','type_revenue','credit',1,0,1),('acct_4030','4030','Candle Donations','type_revenue','credit',1,0,1),
('acct_4040','4040','Commemoration Donations','type_revenue','credit',1,0,1),('acct_4300','4300','Bookstore Revenue','type_revenue','credit',1,0,1),
('acct_5000','5000','Clergy Compensation','type_expense','debit',1,0,1),('acct_5100','5100','Liturgical Supplies','type_expense','debit',1,0,1),
('acct_5200','5200','Building and Property','type_expense','debit',1,0,1),('acct_5300','5300','Diocesan Assessments','type_expense','debit',1,0,1),
('acct_5400','5400','Missions and Charitable Giving','type_expense','debit',1,0,1),('acct_5500','5500','Education and Church School','type_expense','debit',1,0,1),
('acct_5600','5600','Hospitality and Fellowship','type_expense','debit',1,0,1),('acct_5700','5700','Bookstore Cost of Goods Sold','type_expense','debit',1,0,1),
('acct_5800','5800','Professional and Administrative','type_expense','debit',0,0,1),('acct_5810','5810','Accounting','type_expense','debit',1,0,1),
('acct_5830','5830','Software and Technology','type_expense','debit',1,0,1),('acct_5840','5840','Bank and Payment Processing Fees','type_expense','debit',1,0,1);
INSERT OR IGNORE INTO accounting_funds(id,code,name,restriction_type,is_default,is_active,is_system) VALUES('fund_general','GENERAL','General Operating Fund','unrestricted',1,1,1);
INSERT OR IGNORE INTO accounting_fiscal_years(id,name,start_date,end_date,status,is_current) VALUES('fy_2026','2026','2026-01-01','2026-12-31','open',1);
INSERT OR IGNORE INTO accounting_periods(id,fiscal_year_id,period_number,name,start_date,end_date,status,opened_at) VALUES
('period_2026_1','fy_2026',1,'January','2026-01-01','2026-01-31','future',NULL),('period_2026_2','fy_2026',2,'February','2026-02-01','2026-02-28','future',NULL),
('period_2026_3','fy_2026',3,'March','2026-03-01','2026-03-31','future',NULL),('period_2026_4','fy_2026',4,'April','2026-04-01','2026-04-30','future',NULL),
('period_2026_5','fy_2026',5,'May','2026-05-01','2026-05-31','future',NULL),('period_2026_6','fy_2026',6,'June','2026-06-01','2026-06-30','future',NULL),
('period_2026_7','fy_2026',7,'July','2026-07-01','2026-07-31','open',datetime('now')),('period_2026_8','fy_2026',8,'August','2026-08-01','2026-08-31','future',NULL),
('period_2026_9','fy_2026',9,'September','2026-09-01','2026-09-30','future',NULL),('period_2026_10','fy_2026',10,'October','2026-10-01','2026-10-31','future',NULL),
('period_2026_11','fy_2026',11,'November','2026-11-01','2026-11-30','future',NULL),('period_2026_12','fy_2026',12,'December','2026-12-01','2026-12-31','future',NULL);
INSERT INTO accounting_database_metadata(key,value) VALUES('ledger_schema_version','1') ON CONFLICT(key) DO UPDATE SET value='1',updated_at=datetime('now');
INSERT INTO accounting_database_metadata(key,value) VALUES('ledger_initialization_state','initialized') ON CONFLICT(key) DO UPDATE SET value='initialized',updated_at=datetime('now');
