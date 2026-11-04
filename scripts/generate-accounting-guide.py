"""Rebuild the public accounting handbook from reviewed, versioned content.

Run with Python plus reportlab. The public filename remains stable for dashboard links.
Each topic has its own page; an overflow is a build failure, not a silent layout change.
"""
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.pdfgen import canvas
from pypdf import PdfReader
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public/docs/AGAPAY-Accounting-Suite-Guide-Comprehensive.pdf'
DELIVERY = ROOT / 'output/pdf/AGAPAY-Accounting-Suite-Guide-Comprehensive.pdf'
EDITION = 'Updated November 3, 2026'
NAVY = colors.HexColor('#173A47')
GOLD = colors.HexColor('#A9863C')
INK = colors.HexColor('#263D46')
MUTED = colors.HexColor('#596B70')
WASH = colors.HexColor('#F1F5F2')
CREAM = colors.HexColor('#FAF7F0')
FONT, BOLD, SERIF = 'GuideSans', 'GuideBold', 'Times-Bold'
font_root = ROOT / 'public/vendor/accounting-fonts'
pdfmetrics.registerFont(TTFont(FONT, str(font_root / 'NotoSans-Regular.ttf')))
pdfmetrics.registerFont(TTFont(BOLD, str(font_root / 'NotoSans-Bold.ttf')))

STYLES = {
    'kicker': ParagraphStyle('kicker', fontName=BOLD, fontSize=9, leading=12, textColor=GOLD, spaceAfter=9),
    'title': ParagraphStyle('title', fontName=SERIF, fontSize=27, leading=33, textColor=NAVY, spaceAfter=13),
    'lead': ParagraphStyle('lead', fontName=FONT, fontSize=11.5, leading=16, textColor=MUTED, spaceAfter=17),
    'h': ParagraphStyle('h', fontName=BOLD, fontSize=12, leading=16, textColor=NAVY, spaceBefore=12, spaceAfter=7),
    'body': ParagraphStyle('body', fontName=FONT, fontSize=10.5, leading=14.7, textColor=INK, spaceAfter=8),
    'small': ParagraphStyle('small', fontName=FONT, fontSize=9, leading=12.5, textColor=MUTED, spaceAfter=6),
    'cell': ParagraphStyle('cell', fontName=FONT, fontSize=9.5, leading=13, textColor=INK),
    'cellhead': ParagraphStyle('cellhead', fontName=BOLD, fontSize=9.5, leading=13, textColor=colors.white),
}

def p(text, style='body'):
    return Paragraph(text, STYLES[style])

def step(number, title, text):
    return KeepTogether([p(f'{number:02d}  {escape(title)}', 'h'), p(text)])

def box(title, text):
    table = Table([[p(escape(title), 'h')], [p(text)]], colWidths=[504])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), WASH), ('BOX', (0, 0), (-1, -1), .5, colors.HexColor('#D4DFD8')),
        ('LEFTPADDING', (0, 0), (-1, -1), 12), ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, 0), 2), ('BOTTOMPADDING', (0, -1), (-1, -1), 5),
    ]))
    return KeepTogether([Spacer(1, 7), table, Spacer(1, 8)])

def grid(headers, rows, widths=None):
    widths = widths or ([414,90] if headers==['Task','Page'] else [100,404] if headers==['Order','Review'] else [160,344])
    data = [[p(escape(str(v)), 'cellhead') for v in headers]]
    for row in rows:
        cells=[p(str(v), 'cell') for v in row]
        if headers==['Task','Page']:
            first=str(row[1]).split('-')[0]
            cells[1]=p(f'<link href="#page-{first}" color="#173A47">{row[1]}</link>','cell')
        data.append(cells)
    table = Table(data, colWidths=widths, repeatRows=1, hAlign='LEFT')
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), NAVY), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, WASH]),
        ('LEFTPADDING', (0, 0), (-1, -1), 9), ('RIGHTPADDING', (0, 0), (-1, -1), 9),
        ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LINEBELOW', (0, 0), (-1, 0), .6, GOLD),
    ]))
    return table

# Entries are reviewed against the deployed browser labels and accounting services.
TOPICS = [
('Start here', 'A clear way to use this guide', 'Select a page number below, or use the PDF bookmarks to jump to a task.', [
    ('h', 'Find your task'),
    ('table', ['Task', 'Page'], [
        ('Access, roles and the homepage', '3'), ('Guided setup and moving earlier records', '4-5'),
        ('Income, non-cash gifts and online donations', '6-8'), ('Bills, payments and checks', '9-10'),
        ('Funds, reporting dates and transaction detail', '11-13'), ('Budgets, departments/projects and council packages', '14-16'),
        ('Assets, historical openings and corrections', '17-19'), ('Reconciliation and closing the books', '20-21'),
        ('Ledger tools, documents, support and recovery', '22-23'), ('Monthly checklist and troubleshooting', '24'),
    ]),
    ('box', 'What changed in this edition', 'Guided setup; prominent income, bill and non-cash actions; shared report dates and search; transaction drilldowns; historical assets and audited corrections; department/project budgets; saved council PDFs; fee coverage in donor totals; and dashboard support with a business-hour response target.'),
    ('p', 'Screen availability depends on your plan, staff permissions and setup state. Treasurer and Accountant views use the same underlying books. A worked example is illustrative, not your parish\'s actual financial position.'),
]),
('Access and navigation', 'Your workspace, your responsibility', 'Start in Accounting with the correct parish and a named staff profile.', [
    ('step', 'Open the right parish', 'Sign in to the Parish Dashboard, complete verification if requested, then open <b>Accounting</b>. Check the parish name before entering or reviewing records.'),
    ('step', 'Unlock your own staff profile', 'Use your assigned profile and Accounting PIN. Keep profiles individual so the audit history can identify the operator. Do not share a PIN or paste it into a support ticket.'),
    ('step', 'Choose your working view', '<b>Treasurer view</b> emphasizes routine parish tasks. <b>Accountant view</b> exposes more ledger and review tools. Switching the view does not grant additional permissions or change financial records.'),
    ('step', 'Use the homepage actions', 'The Accounting homepage highlights <b>Record Income</b>, <b>Pay a Bill</b> and <b>Record a Non-Cash Gift</b>. Use <b>Continue guided setup</b> for readiness and <b>Reports</b> to investigate balances.'),
    ('box', 'Role examples', 'Treasurers manage setup and higher-trust workflows; bookkeepers handle permitted routine work; rector/council access follows assigned capabilities. A plan upgrade or a view toggle does not replace permission checks. Use Settings to manage named staff access.'),
    ('p', 'Overview summaries load automatically. A loading or unavailable summary is not a zero balance. Follow its status message and refresh or report an error if it does not recover.'),
]),
('Guided onboarding', 'From setup to a first reconciliation', 'Open Accounting > Overview or Setup > Continue guided setup.', [
    ('table', ['Milestone', 'What to review'], [
        ('Fiscal year', 'Check the dates against the parish\'s accounting year.'),
        ('Categories', 'Review the seeded chart; existing categories do not mean someone has reviewed them.'),
        ('Funds and giving', 'Confirm restrictions, operating funds and online-giving destinations.'),
        ('Earlier records', 'Choose importing, new books, or completed existing/imported books; explain the decision.'),
        ('Older assets', 'Review linked cost and accumulated depreciation, or explicitly record that no older assets exist.'),
        ('Bank account', 'Prepare the ledger bank account used for statement matching.'),
        ('Ledger checks', 'Resolve setup and validation warnings.'),
        ('First reconciliation', 'Complete reconciliation through its normal zero-difference controls.'),
    ]),
    ('h', 'Save a useful review'),
    ('p', 'Open the next highlighted step, inspect its records, choose the applicable decision and enter what you checked. Select <b>Save review</b>. The parish retains the reviewer, time, reason and review history.'),
    ('box', 'Progress reflects evidence', 'Changed configuration requires a fresh review. Deferred work stays pending. An explicitly ongoing import is not finished merely because part of its opening balance has posted. Viewing this journey and saving reviews do not post financial amounts.'),
]),
('Opening records and migration', 'Bring the parish over once', 'Use Setup > Open migration wizard for the reviewed CSV workflow.', [
    ('step', 'Agree on a cutover date', 'Have the responsible treasurer/accountant approve the fiscal calendar, prior balance sheet or trial balance, fund list, vendor list and latest statement. Decide what historical detail will remain in the earlier system.'),
    ('step', 'Preview categories, vendors and funds', 'Use the supported import steps and inspect validation messages. Match funds to the correct AGAPAY destinations. Resolve duplicates and unmapped categories before committing.'),
    ('step', 'Review and post opening balances', 'Inspect the preview by account and fund, confirm the effective date and post using the authorized workflow. A preview alone does not establish a posted starting balance.'),
    ('step', 'Bring older assets into the subledger', 'After the related opening entries exist, use the historical-asset fields described on page 18. Link existing amounts instead of entering another acquisition or another opening depreciation journal.'),
    ('step', 'Confirm the result', 'Compare the trial balance, financial position, fund balances and asset controls to the approved source records. Return to guided setup and record when the import is complete.'),
    ('box', 'Avoid overlapping sources', 'Do not import history covering online donations or other transactions already posted by AGAPAY integrations. Transaction-history imports require deliberate review of dates, mappings and duplicates. Reconcile the result before routine posting.'),
]),
('Routine work', 'Record income and split a deposit', 'Use Record Income for cash, checks and other receipts that are not already posted by an integration.', [
    ('step', 'Check the source first', 'Search for an existing entry, receipt or source record. A donor gift, its processor settlement and its bank payout are related events; entering each as fresh income would duplicate revenue.'),
    ('step', 'Enter the deposit', 'Choose the receiving bank/cash account, posting date, income category, fund, amount and a clear description. Use parish categories such as Stewardship &amp; Tithes, General Donations or Candle Offerings as appropriate.'),
    ('step', 'Split when needed', 'For one deposit covering several purposes, add allocation rows with the relevant income categories and funds. The total allocation must equal the deposit.'),
    ('step', 'Review, save and verify', 'Confirm the date, fund and amount before saving. After a successful post, inspect the resulting entry or report detail and attach supporting records where appropriate. Investigate an uncertain result before retrying.'),
    ('table', ['Illustrative collection', 'Allocation'], [('Operating stewardship', '$700.00 to the operating fund'), ('Building gifts', '$200.00 to the building fund'), ('Candle offerings', '$100.00 to the relevant fund/category'), ('One bank deposit', '$1,000.00 total; allocations also total $1,000.00')]),
    ('box', 'Plain-language entry still needs review', 'The form builds the balanced journal. The operator remains responsible for the correct amount, date, category, fund and source. Closed-period and permission controls still apply.'),
]),
('Non-cash contributions', 'Record a gift without inventing cash', 'Open Record a Non-Cash Gift on the Accounting homepage.', [
    ('step', 'Describe what the parish received', 'Record the item, receipt date and sufficient supporting detail. Confirm that the responsible accountant agrees with recognition and classification before recording an uncertain contribution.'),
    ('step', 'Document the accounting value', 'Enter the amount and valuation basis supported by the parish\'s records. A bookkeeping valuation does not establish the donor\'s tax deduction.'),
    ('step', 'Choose expense or asset treatment', 'Select an appropriate permitted expense account for an item used currently, or an asset account for property to capitalize. Choose the correct fund. Do not select a bank account as though cash had arrived.'),
    ('step', 'Verify the posted entry', 'The non-cash contribution uses its own income treatment. For a capital item, register the asset against its posted asset debit and retain the appraisal, invoice or other supporting documents.'),
    ('box', 'Accounting record and donor acknowledgment are different', 'Do not reuse the internal accounting value as an automatic donor tax valuation. For non-cash gifts, IRS acknowledgment guidance distinguishes describing the property from stating its value. Have the responsible person review the acknowledgment and any required donor documentation.'),
    ('p', 'Reference: <link href="https://www.irs.gov/charities-non-profits/charitable-organizations/charitable-contributions-written-acknowledgments" color="#173A47">IRS: Charitable contributions - written acknowledgments</link>.'),
]),
('Online giving and annual totals', 'Follow the gift through to the bank', 'Check Accounting integration settings before relying on automatic posting.', [
    ('step', 'Review giving destinations', 'Confirm the selected fund/campaign, recurring-giving settings and accounting mappings. Check the integration state and investigate items awaiting review or an open accounting period.'),
    ('step', 'Keep gross giving and costs distinct', 'Donor fee coverage is included in the total paid and donor giving totals. Actual processor fees and net settlement are separate accounting components. Compare the receipt, processor record, ledger and payout at the correct level.'),
    ('step', 'Verify receipts and annual statements', 'Use the donor\'s recorded giving total, including a fee-covering addition, when reviewing cash-gift receipts and annual giving statements. Confirm refunds and donor identity before issuing final statements.'),
    ('table', ['Illustrative transaction', 'Amount'], [('Intended gift', '$100.00'), ('Donor fee-covering addition', '$3.30'), ('Total paid / donor giving total', '$103.30'), ('Illustrative actual processor fee', '$3.30 expense'), ('Illustrative net settlement', '$100.00; actual fees and payout timing may differ')]),
    ('box', 'Use the qualified disclosure', 'Checkout describes the fee-covering addition as part of the charitable gift and generally tax-deductible to the same extent as the donation. Eligibility and any goods/services received still matter. Include the addition in annual donor giving totals, and keep those totals separate from the net bank deposit.'),
    ('p', 'General reference: <link href="https://www.irs.gov/taxtopics/tc506" color="#173A47">IRS Topic 506: Charitable contributions</link>. For a payout containing several gifts, reconcile the full settlement rather than expecting each gift total to match a bank line.'),
]),
('Accounts payable', 'Pay a bill with a clear trail', 'Open Pay a Bill on the homepage or use Payables.', [
    ('step', 'Enter the bill', 'Select the vendor and enter its invoice reference, dates, category, fund and amount. Add supporting documents and inspect any duplicate warning.'),
    ('step', 'Review and approve as required', 'Use the available submit/approval workflow. Whether a separate reviewer is required depends on the configured controls and permissions. Do not assume that saving a draft means the bill is approved or posted.'),
    ('step', 'Post the bill and record payment', 'A posted bill and its payment are separate events. Select the relevant bank ledger account and the actual payment method/reference. Confirm the external payment status with the parish\'s approved banking process.'),
    ('step', 'Reconcile the bank activity', 'Match the payment against the statement and retain the invoice and payment evidence. Do not enter another expense merely because the payment appears on the bank statement.'),
    ('p', 'Use Payables overview and aging to review unpaid balances and due dates. Distinguish a posted bill from a payment that has actually cleared.'),
    ('box', 'Recording is not a bank-transfer confirmation', 'Selecting ACH, wire or another method in a bookkeeping form does not by itself prove a transfer was sent. Check the external provider/bank and use the actual outcome. Resolve an uncertain payment before retrying.'),
    ('p', 'Recurring-bill schedules can reduce re-entry. Review each generated bill, its date, fund and amount; a schedule is not a substitute for approval or source-document review.'),
]),
('Payment runs and vendor review', 'Handle checks and batches carefully', 'Use the existing payment-run and check controls for permitted posted payments.', [
    ('step', 'Prepare a payment run', 'Choose the bank account and eligible bills. Review vendors, unpaid balances, payment dates and the proposed run before posting.'),
    ('step', 'Review check numbering', 'Confirm the configured check settings and available numbers. Use the system reservation controls rather than maintaining an independent check-number spreadsheet.'),
    ('step', 'Print or reprint the same check', 'A reprint refers to the same check/payment and is marked as a reprint. It must not create another payment. Follow the void/reissue workflow when the payment itself needs to change; a voided check cannot be printed as live.'),
    ('h', 'Vendor annual reporting'),
    ('p', 'Use vendor reporting to review the year\'s recorded payments and payment-method classifications. Check missing vendor details and discrepancies before exporting information for the accountant.'),
    ('box', 'Review aid, not a filing service', 'Confirm the applicable tax-year rules, thresholds and vendor classifications with the responsible tax professional. Do not treat a displayed software threshold or payment summary as a completed filing or a determination of filing obligations.'),
    ('p', 'Review actual AGAPAY subscription/service charges separately from donation processing fees. Compare the billed amount and recorded expense rather than assuming advertised plan pricing is the amount charged.'),
    ('p', 'Keep a record of who reviewed the run, external payment references, check exceptions and the supporting invoices. Available controls depend on permissions and the parish\'s configuration.'),
]),
('Funds and parish work', 'Three different questions', 'Use funds, departments and projects for their distinct purposes.', [
    ('table', ['Dimension', 'Question it answers'], [('Fund', 'What purpose or restriction governs this money?'), ('Department', 'Which continuing part of parish work used or raised it?'), ('Project', 'Which defined undertaking does this activity support?')]),
    ('p', '<b>Example:</b> a roof expense might use a donor-restricted building fund, the Property department and the Roof repair project. A Church School purchase may use operating funds and the Church School department.'),
    ('h', 'Review the fund list'),
    ('p', 'Inspect fund restrictions and giving destinations in the parish fund controls and Accounting Funds/integration views. Verify the synchronized mapping before assuming a new giving destination is ready for accounting.'),
    ('h', 'Understand restriction classes'),
    ('p', 'Operating/unrestricted, council-designated and donor-restricted purposes are different. Use the parish\'s approved classifications and preserve donor restrictions. A department/project label does not authorize changing a restriction or moving cash.'),
    ('box', 'Keep Unassigned visible', 'Department/project reports include unclassified activity and the unallocated share of budgets as Unassigned. Review those rows; do not exclude them merely to make a presentation look complete.'),
    ('h', 'Bookstore and parish commerce'),
    ('p', 'For connected commerce, review sales, refunds, tax liabilities, actual processor costs and inventory/COGS mappings. Confirm item and quantity records. Sales proceeds are not automatically charitable gifts; avoid recording an integrated sale as income a second time.'),
    ('p', 'The department/project tools are under <b>Reports &gt; Departments, projects &amp; council packages</b>. Pages 15-16 explain classification, allocations and saved packets.'),
]),
('Report discovery and dates', 'Find the answer, then set the period', 'Open Reports and use the search field or treasurer shortcuts.', [
    ('step', 'Search by question', 'Try income, budget, tithes, cash, assets or expenses. Choose the matching report and check its title before presenting it.'),
    ('step', 'Choose shared reporting dates', 'Select the fiscal YTD preset or enter Report Start and Report End, then select <b>Apply report dates</b>. Confirm the displayed period after loading.'),
    ('step', 'Choose the correct comparison', 'Budget comparisons use the fiscal-year start through the selected month-end. A financial-position report is an as-of view, while activities and cash flows cover a period.'),
    ('table', ['Report', 'Use it to explain'], [('Statement of Activities', 'Income, expenses and change in net assets during the period.'), ('Financial Position', 'Assets, liabilities and net assets as of the end date.'), ('Cash Flows', 'Cash movement and its reconciliation to the actual cash change.'), ('Fund Activity', 'Opening balance, activity and closing balance by fund.'), ('Trial Balance / ledger', 'Account balances and detailed posted activity.'), ('Asset Register', 'Registered property, posted depreciation and book value.')]),
    ('p', 'Also use <b>Functional Expenses</b> for expense-purpose groupings and <b>Net Asset Rollforward</b> for restriction-class movements. Where comparative reports are available, verify both the current and prior periods.'),
    ('box', 'Worked date example', 'For an October 2026 YTD demo in a calendar-year parish, use January 1 through October 31, 2026. For a different fiscal year, use that parish\'s actual fiscal start. Verify the selected approved budget separately.'),
]),
('Investigating a number', 'Click through to its transactions', 'Use supported report links to explain a balance instead of guessing.', [
    ('step', 'Open a report with a known period', 'For example, open Budget to Actual, confirm the fiscal YTD cutoff and select the intended budget. Locate an income or expense line.'),
    ('step', 'Click the linked amount or account', 'Where supported, the report opens transaction detail for that account, fund and period. Inspect the detail heading and filters before comparing totals.'),
    ('step', 'Read the supporting entries', 'Review dates, entry numbers, descriptions and amounts. Use the available journal/detail controls and supporting documents to trace the underlying activity.'),
    ('step', 'Return and explain the variance', 'Separate timing, classification, omitted entries and genuine over/under spending. A drilldown is a read-only investigation; changes belong in the appropriate reviewed accounting workflow.'),
    ('box', 'Department/project drilldowns', 'In a department or project report, click an actual amount to open the underlying income/expense lines with the applicable label, account, fund and date filters. The screen may show only the latest 500 lines; shorten the period if it reports truncation.'),
    ('h', 'Downloads preserve the presentation'),
    ('p', 'Use the available PDF, print or CSV actions. Check the downloaded title, dates, selected filters and totals. Interactive links are for investigation in the app; do not assume a static PDF can open the same authenticated transaction detail.'),
]),
('Budget versus actual', 'Explain fiscal YTD performance', 'Open Reports > Budget to Actual and confirm the budget and cutoff.', [
    ('step', 'Prepare the plan', 'Create the fiscal-year budget with income and expense lines by account and fund. Review its monthly allocation rather than assuming the annual total is divided the way your parish intends.'),
    ('step', 'Submit, approve and lock as appropriate', 'Use the configured review controls. Confirm the status and version that will serve as the comparison. Preserve prior versions when revising the plan.'),
    ('step', 'Use the selected YTD cutoff', 'Compare actual posted activity through the selected month-end with budget allocated to that same elapsed fiscal period. Do not compare October actuals with a full-year budget and label it a YTD variance.'),
    ('step', 'Investigate the difference', 'Click supported actual amounts for transactions. Distinguish income shortfalls from expense overruns: an actual-minus-budget amount has a different favorable direction for revenue and expenses.'),
    ('table', ['Illustrative expense category', 'YTD result'], [('Budget through October', '$10,000'), ('Actual through October', '$11,200'), ('Actual less budget', '$1,200 over plan; review timing, coding and supporting entries')]),
    ('box', 'Forecast and pledge comparisons', 'Forecasts extrapolate recorded activity and are planning aids, not assurances. When using pledge comparisons, confirm the relevant giving year and configured stewardship revenue category; a pledge is not automatically cash received.'),
]),
('Departments and projects', 'Connect spending to the work it serves', 'Open Reports > Departments, projects & council packages.', [
    ('step', 'Create the labels you need', 'Add a department or project with a clear code and name, such as SCHOOL / Church School or ROOF / Roof repair. Keep labels meaningful for the parish council.'),
    ('step', 'Classify posted income and expenses', 'Open <b>Classify income &amp; expenses</b>. Select the department and/or project, enter a reason and save the classification. This creates reporting metadata and audit history; it does not change journal amounts or fund restrictions.'),
    ('step', 'Allocate a draft budget', 'Choose a budget and select <b>Allocate a draft budget</b>. Review the current shares, enter the intended department/project percentages and use <b>Replace allocations</b> deliberately. Shares may total up to 100%; the remainder stays Unassigned.'),
    ('step', 'Review the resulting report', 'Choose Department report or Project report with the shared date range. Select a budget for fiscal YTD comparison, or leave it unselected for actual activity only. Click an actual amount to inspect its lines.'),
    ('box', 'Preserve the comparison', 'Submitted, approved and locked budget allocations cannot be edited as a draft allocation set. Budget copies preserve their allocations for review. Classification changes can affect live dimensional reports; use a saved council snapshot to preserve an earlier presentation.'),
    ('p', 'Revenue, expenses and surplus/deficit are shown separately. Do not add income and expense totals together and describe the result as profit.'),
]),
('Council reporting', 'Save one coherent report package', 'Use Saved council packages in the reporting workspace.', [
    ('step', 'Save the report selection', 'Name the package, such as Monthly parish council, and choose the reports required: activities, position, cash flow, fund activity, assets, departments and/or projects.'),
    ('step', 'Set the shared dates and budget', 'Confirm Report Start and Report End before generating. Budget comparisons require an approved or locked budget and a fiscal-year-start through month-end range.'),
    ('step', 'Generate and review', 'Select <b>Generate with selected dates</b>. Review every section, including validation messages, Unassigned activity and asset-control differences. Resolve material issues before presenting.'),
    ('step', 'Download the combined PDF', 'Use <b>Download council PDF</b>. Verify its dates, section selection and totals. Previously generated packages remain available in the workspace.'),
    ('box', 'A saved copy stays unchanged', 'Later bookkeeping or classification corrections do not silently rewrite a generated council snapshot. Generate a new copy when a corrected presentation is needed, and identify which version council reviewed.'),
    ('p', 'The existing budget-focused council packet and the saved multi-report package serve different needs. Use the budget packet for a planning summary; use a saved report package when council needs several financial statements in one PDF.'),
]),
('Asset management', 'Register a newly acquired parish asset', 'Record the acquisition first, then link it in Assets.', [
    ('step', 'Prepare the chart', 'Use <b>Set up asset accounts</b> to choose or create the appropriate cost, accumulated-depreciation and expense accounts. Account setup itself does not post a purchase.'),
    ('step', 'Record the acquisition or gift', 'Use the appropriate purchase, journal or non-cash-gift workflow. Confirm that a posted asset debit exists for the correct account and fund.'),
    ('step', 'Register the asset', 'Select the acquisition line and enter the tag, name, in-service date, allocated cost, salvage value, life and method. Add location, serial number, insurance value and notes as useful.'),
    ('step', 'Check the register', 'Registration links the subledger to the existing acquisition; it does not book the cost again. Review cost, posted depreciation and book value as of the selected date.'),
    ('box', 'Schedules are estimates until posted', 'Monthly straight-line includes full applicable months. A displayed schedule is not proof that depreciation has been posted. Use the preview/post workflow and review control-account differences against the ledger.'),
    ('p', 'Keep invoices, appraisals and property documents with the acquisition journal. Assets linked to that entry share its supporting documents. Financial registration terms are protected; correct them through the supported history-preserving process.'),
]),
('Historical assets', 'Bring over existing depreciation once', 'In the asset registration form, expand Import an older asset with opening depreciation.', [
    ('step', 'Post or identify the approved opening entries', 'The existing ledger must contain the asset cost debit and, when applicable, its accumulated-depreciation credit. Verify the fund and mapped accounts before linking them.'),
    ('step', 'Enter the original and opening dates', 'Record the original acquisition date and in-service date. Select the opening-depreciation through date: a month-end in the ledger-recognition month or immediately before it.'),
    ('step', 'Link the opening credit and remaining life', 'Enter accumulated depreciation already recorded and select its existing posted credit. Enter the remaining useful life after the opening month, not the original total life.'),
    ('step', 'Reconcile before posting more depreciation', 'Check the opening book value and the next scheduled charge. Registration must not create another cost or depreciation opening entry.'),
    ('table', ['Illustrative historical equipment', 'Opening review'], [('Recorded cost', '$10,000'), ('Already recorded depreciation', '$6,000'), ('Opening book value', '$4,000'), ('Salvage / remaining life', '$1,000 / 24 months'), ('Remaining depreciable amount', '$3,000; illustrative charge $125 per month')]),
    ('p', 'Use the actual ledger-recognition date and approved estimates. If the credit or acquisition allocation is unavailable, investigate the source entry or another registration; do not create a duplicate to force the import through.'),
]),
('Asset postings and corrections', 'Preview the effect and preserve history', 'Open the asset detail for depreciation, disposal or a correction.', [
    ('step', 'Post depreciation deliberately', 'Choose the through/posting date, preview the journal and verify its expense, accumulated depreciation and book value. Confirm only after reviewing the exact entries.'),
    ('step', 'Dispose or retire an asset', 'Enter actual proceeds, including zero for a retirement, and the appropriate accounts. Review depreciation due, book value and the resulting gain/loss before posting.'),
    ('step', 'Correct the latest asset posting', 'Enter a correction date and reason. Preview the equal-and-opposite journal, then explicitly confirm it. Correct the latest unreversed asset posting first; date and period controls still apply.'),
    ('step', 'Replace incorrect registration terms', 'Reverse the asset\'s postings as required, cancel its registration with a dated reason, then register the replacement against the released existing ledger allocation. The replacement cannot precede the cancellation date.'),
    ('box', 'Use the asset correction path', 'Do not try to reverse an asset-linked entry through an unrelated general-ledger shortcut. The original acquisition, postings, corrections and cancelled registration remain in history. Cancellation of the registration does not itself reverse the acquisition journal.'),
    ('p', 'Historical reports respect posting and correction dates. Compare both the original period and correction period when explaining a change, and review cash-flow treatment after a disposal correction.'),
]),
('Bank reconciliation', 'Match the statement and reach zero', 'Open Reconciliation in Accounting.', [
    ('step', 'Prepare the statement period', 'Select the correct ledger bank account, start/end dates and statement opening/closing balances. Confirm continuity with the prior completed reconciliation.'),
    ('step', 'Preview and import statement rows', 'Review the supported CSV mapping and duplicate checks. Avoid importing the same statement twice. Source descriptions and dates help explain proposed matches.'),
    ('step', 'Review and confirm matches', 'The system can suggest matches. Inspect and confirm them; a suggestion is not operator approval. Investigate outstanding deposits, withdrawals and unmatched activity.'),
    ('step', 'Complete only when balanced', 'The reconciliation difference must be zero. Use the permitted adjustment workflow for a genuine accounting item, with supporting evidence and the right period. A reviewer may be required by configuration.'),
    ('box', 'A note does not turn a difference into a reconciliation', 'Document the investigation, but do not treat an explanatory note as permission to complete a non-zero reconciliation. A completed reconciliation supplies the final milestone in guided setup; an in-progress one does not.'),
    ('p', 'Reconciliation and period close are separate workflows. Reconciliation compares a specific statement to the ledger; close reviews and locks the accounting period after its required checks.'),
]),
('Month-end and year-end', 'Close through the real checks', 'Open Month-end checklist / Period Close after reviewing the period.', [
    ('step', 'Prepare the period', 'Enter missing income and bills, resolve integration exceptions, review source documents and post any approved depreciation or adjustments.'),
    ('step', 'Reconcile and validate', 'Complete the applicable statement reconciliation. Run the close checklist and address blockers across the relevant subsystems rather than relying only on a balanced trial balance.'),
    ('step', 'Complete the authorized close', 'Review the session, retain required explanations and preserve its snapshot. Complete the close only through the permitted workflow. Closed or locked periods restrict later posting.'),
    ('step', 'Prepare the council package', 'Use consistent fiscal dates and the reviewed budget. Save the generated package that was presented; create a new snapshot if a corrected presentation is needed.'),
    ('h', 'At fiscal year-end'),
    ('p', 'Year-end is a separate reviewed process. Complete the required prior-period work, preview the revenue/expense closing effect, inspect net assets and generate the accountant handoff as appropriate. Archiving the year is distinct from ordinary monthly close.'),
    ('box', 'When a closed period needs correction', 'Use only the authorized reopen, adjustment or reversal workflow available for the record\'s current state. Preserve the reason and audit trail. Consult the responsible accountant before changes affecting an issued year-end presentation or archived year.'),
]),
('Ledger, documents and controls', 'Use the underlying evidence', 'Accountant view provides the detailed tools behind routine entry.', [
    ('table', ['Tool', 'Working rule'], [('Journal entries', 'Review accounts, funds, dates, balance and source before posting. A draft is not a posted result.'), ('Reverse / void', 'Void eligible unposted drafts. Correct posted entries through reversal or adjustment; retain the original history.'), ('Asset-linked entries', 'Use the asset correction workflow so the ledger and subledger remain consistent.'), ('Opening balances', 'Use approved cutover amounts and review by account and fund.'), ('Attachments', 'Attach source documents to supported bills, journals and reconciliations; respect access and retention controls.'), ('Account lifecycle', 'Review before archiving; system protections may block changes while related activity remains.'), ('Governance / retention', 'Review integrity warnings and applicable retention or legal-hold controls. Use authorized workflows and support rather than direct database edits.'), ('Staff access', 'Assign named profiles and the minimum responsibility needed; switching view does not change capabilities.')]),
    ('box', 'Handle uncertain outcomes carefully', 'If saving or posting times out, inspect the original operation\'s outcome before retrying. Keep the entry/source reference and safe error ID. Avoid creating a second entry merely because the screen did not immediately refresh.'),
    ('p', 'Documents support the accounting record; they do not replace approval or reconciliation. Do not assume an attachment is publicly accessible, immutable forever, or outside retention/deletion policies. Use the supported private download and recovery paths.'),
]),
('Support and continuity', 'Get help without losing the trail', 'Use Get help / Support in the Parish Dashboard, or the support button in guided setup.', [
    ('step', 'Submit a clear ticket', 'Describe what happened, what you expected, the screen, relevant dates and safe record/error references. Never include passwords, MFA codes, full bank credentials or donor lists.'),
    ('step', 'Keep the reference', 'The confirmation keeps the ticket reference and calculated response deadline visible. A ticket is saved before notification is attempted; a failed notification does not remove it from the support queue.'),
    ('box', 'Regular support', '<b>support@agapay.app</b><br/>Monday-Friday, 8 a.m.-6 p.m. Central Time.<br/>First response within <b>16 business hours</b>. This is a response commitment; resolution time depends on the issue. Weekend hours do not count, and the calculation follows Central daylight-saving changes.'),
    ('h', 'Backups and recovery'),
    ('p', 'Use the available parish/accounting backup and recovery controls. Confirm the parish, scope, snapshot date and document verification. A recovery rehearsal in disposable resources is different from replacing active production books. Review external payment activity and preserve a safety state before an authorized restore.'),
    ('h', 'Hand the role to the next volunteer'),
    ('p', 'Review named staff access, fiscal dates, funds, reconciliations, unpaid bills, asset estimates, budget versions, close status and saved council packages. Keep supporting documents and setup-review reasons with the records. Contact support before attempting an uncertain restore or historical correction.'),
]),
('Quick reference', 'A repeatable monthly rhythm', 'Use this page as the working checklist beside your desk.', [
    ('table', ['Order', 'Review'], [('1. Enter', 'Record receipts, non-cash gifts and bills once; resolve integration exceptions.'), ('2. Support', 'Attach invoices and statements; confirm funds and source references.'), ('3. Assets', 'Review acquisitions, historical registrations, depreciation and disposals.'), ('4. Reconcile', 'Confirm statement matches and complete the zero-difference reconciliation.'), ('5. Explain', 'Use fiscal YTD budget comparisons and transaction drilldowns; review Unassigned activity.'), ('6. Close', 'Run the month-end checks, resolve blockers and preserve the close evidence.'), ('7. Present', 'Generate a dated council package and retain the reviewed copy.'), ('8. Handoff', 'Keep access, review notes and unresolved issues clear for the next operator.')]),
    ('h', 'If a report looks wrong'),
    ('p', 'Check the parish, dates, budget version, fund, classification and posted status. Trace the transactions. Separate gross giving from net settlement, and resolve validation or loading errors before presenting.'),
    ('h', 'If an action is unavailable'),
    ('p', 'Check permissions, plan, setup and period/record locks. Reload stale records. Use Get help with the safe ticket/error reference if the supported workflow cannot resolve the issue.'),
    ('box', 'Current edition', 'Updated November 3, 2026 for the deployed guided-setup, reporting, asset and support workflows. This handbook explains product operation. Parish policy, source verification, accounting judgment and tax filings remain with the responsible authorized people.'),
]),
]

class GuideCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.setTitle('AGAPAY Accounting Suite Guide - November 2026')
        self.setAuthor('AGAPAY')
        self.setSubject('Parish accounting workflows, reporting, onboarding, assets and support')

def decorate(c, doc):
    n = doc.page
    c.saveState()
    c.bookmarkPage(f'page-{n}')
    if n>1 and n<=24:c.addOutlineEntry(TOPICS[n-2][1],f'page-{n}',level=0)
    c.setStrokeColor(GOLD)
    c.setLineWidth(.8)
    c.line(54, 53, 558, 53)
    c.setFillColor(MUTED)
    c.setFont(FONT, 8)
    c.drawString(54, 38, 'AGAPAY Accounting Suite  |  agapay.app  |  support@agapay.app')
    c.drawRightString(558, 38, f'{n} / 24')
    if n > 1:
        c.setFont(BOLD, 8)
        c.setFillColor(NAVY)
        c.drawString(54, 759, 'AGAPAY  /  PARISH ACCOUNTING HANDBOOK')
        c.setFont(FONT, 8)
        c.drawRightString(558, 759, EDITION)
    c.restoreState()

def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    story = [Spacer(1, 70), p('AGAPAY  /  PARISH OPERATIONS', 'kicker'),
             p('The Accounting Suite<br/>for Parish Treasurers', 'title'),
             p('A practical handbook for clear records, confident reviews and a repeatable month-end.', 'lead'),
             Spacer(1, 15), box('Connected parish work', 'Giving, people, ministry work and finances connected in one system - with clear tools for the volunteers responsible for them.'),
             Spacer(1, 15), grid(['Work with confidence', 'What this guide covers'], [('Start well', 'Guided setup, fiscal dates and reviewed opening records'), ('Record once', 'Income, non-cash gifts, bills and integrated giving'), ('Understand the numbers', 'Reports, fiscal YTD budgets and transaction drilldowns'), ('Preserve the trail', 'Assets, corrections, reconciliation and council snapshots'), ('Get help', 'Dashboard tickets, support hours and volunteer handoffs')]),
             Spacer(1, 25), p(EDITION, 'h'), p('For Orthodox parishes and monasteries using AGAPAY. Examples are illustrative; follow the permissions, review controls and actual records of your parish.', 'small'), PageBreak()]
    assert len(TOPICS) == 23
    for index, (kicker, title, lead, blocks) in enumerate(TOPICS):
        story += [p(kicker.upper(), 'kicker'), p(title, 'title'), p(lead, 'lead')]
        number = 0
        for block in blocks:
            kind, *args = block
            if kind == 'step':
                number += 1
                story.append(step(number, *args))
            elif kind == 'box': story.append(box(*args))
            elif kind == 'table': story += [grid(*args), Spacer(1, 9)]
            else: story.append(p(args[0], 'h' if kind == 'h' else 'body'))
        if index < len(TOPICS)-1: story.append(PageBreak())
    candidate=ROOT / 'tmp/pdfs/accounting-guide-build.pdf'
    candidate.parent.mkdir(parents=True,exist_ok=True)
    doc = SimpleDocTemplate(str(candidate), pagesize=letter, rightMargin=54, leftMargin=54, topMargin=59, bottomMargin=66, pageCompression=1)
    doc.build(story, onFirstPage=decorate, onLaterPages=decorate, canvasmaker=GuideCanvas)
    reader = PdfReader(candidate)
    if len(reader.pages) != 24:
        raise RuntimeError(f'Expected 24 curated pages; got {len(reader.pages)}. Fix the overflowing topic before delivery.')
    for index,topic in enumerate(TOPICS, start=1):
        text=' '.join(reader.pages[index].extract_text().split())
        if ' '.join(topic[1].split()) not in text:raise RuntimeError(f'Topic moved or title missing on page {index+1}: {topic[1]}')
    shutil.copyfile(candidate, OUTPUT)
    DELIVERY.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(OUTPUT, DELIVERY)
    print(f'Built and checked {len(reader.pages)} pages: {OUTPUT}')

if __name__ == '__main__':
    build()
