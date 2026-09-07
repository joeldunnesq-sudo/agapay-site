from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "docs" / "AGAPAY-Stripe-Setup-Guide.pdf"

NAVY = colors.HexColor("#061522")
BLUE = colors.HexColor("#0A365B")
GOLD = colors.HexColor("#C8A24A")
CREAM = colors.HexColor("#F6F1E8")
INK = colors.HexColor("#171715")
STONE = colors.HexColor("#6F6A60")
WHITE = colors.white
LOGO = ROOT / "public" / "favicons" / "android-chrome-512x512.png"
SERIF = "Times-Roman"
SERIF_BOLD = "Times-Bold"
SERIF_ITALIC = "Times-Italic"
font_root = Path("C:/Windows/Fonts")
if (font_root / "georgia.ttf").exists():
    for name, filename in [("GuideSerif", "georgia.ttf"), ("GuideSerifBold", "georgiab.ttf"), ("GuideSerifItalic", "georgiai.ttf")]:
        pdfmetrics.registerFont(TTFont(name, str(font_root / filename)))
    SERIF, SERIF_BOLD, SERIF_ITALIC = "GuideSerif", "GuideSerifBold", "GuideSerifItalic"


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#FCFAF6"))
    canvas.rect(0, 0, letter[0], letter[1], fill=1, stroke=0)
    canvas.drawImage(str(LOGO), 45, 742, width=29, height=29, mask="auto")
    canvas.setFillColor(NAVY)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(80, 754, "A G A P A Y")
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(STONE)
    canvas.drawRightString(560, 754, "PARISH ONBOARDING  /  SEPTEMBER 2026")
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(0.6)
    canvas.line(52, 732, 560, 732)
    canvas.setStrokeColor(colors.HexColor("#D9D1C1"))
    canvas.line(0.68 * inch, 0.55 * inch, 7.82 * inch, 0.55 * inch)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(STONE)
    canvas.drawString(0.72 * inch, 0.34 * inch, "LOVE HOW YOU GIVE")
    canvas.drawCentredString(letter[0] / 2, 0.34 * inch, "agapay.app")
    canvas.drawRightString(7.78 * inch, 0.34 * inch, f"{doc.page:02d}")
    canvas.restoreState()


def cover(canvas, doc):
    canvas.saveState()
    width, height = letter
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(1)
    canvas.rect(0.38 * inch, 0.38 * inch, width - 0.76 * inch, height - 0.76 * inch, fill=0, stroke=1)
    canvas.setStrokeColor(colors.HexColor("#31404A"))
    canvas.setLineWidth(0.35)
    canvas.rect(0.47 * inch, 0.47 * inch, width - 0.94 * inch, height - 0.94 * inch, fill=0, stroke=1)
    canvas.drawImage(str(LOGO), width / 2 - 82, 545, width=164, height=164, mask="auto")
    canvas.setFillColor(GOLD)
    canvas.setFont(SERIF, 33)
    canvas.drawCentredString(width / 2, 522, "A G A P A Y")
    canvas.setFont("Helvetica", 8)
    canvas.drawCentredString(width / 2, 499, "L O V E   H O W   Y O U   G I V E")
    canvas.setStrokeColor(GOLD)
    canvas.line(270, 462, 342, 462)
    canvas.setFillColor(WHITE)
    canvas.setFont(SERIF, 38)
    canvas.drawCentredString(width / 2, 411, "Parish Onboarding")
    canvas.setFont(SERIF_ITALIC, 29)
    canvas.drawCentredString(width / 2, 368, "A guide to your first launch")
    canvas.setFillColor(CREAM)
    canvas.setFont("Helvetica", 10)
    for y, line in [(310, "Start your free trial. Connect your parish."), (291, "Welcome your community to a simpler way to give.")]:
        canvas.drawCentredString(width / 2, y, line)
    for x, number, label in [(155, "01", "ACCEPT ACCESS"), (306, "02", "CONNECT PAYMENTS"), (457, "03", "REVIEW & LAUNCH")]:
        canvas.setFillColor(GOLD)
        canvas.setFont(SERIF, 19)
        canvas.drawCentredString(x, 203, number)
        canvas.setFont("Helvetica", 7)
        canvas.drawCentredString(x, 184, label)
    canvas.setFillColor(GOLD)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawCentredString(width / 2, 0.98 * inch, "PARISH EDITION  /  SEPTEMBER 2026")
    canvas.setFillColor(CREAM)
    canvas.setFont("Helvetica", 8)
    canvas.drawCentredString(width / 2, 0.66 * inch, "For canonical Orthodox parishes, missions, cathedrals, and monasteries")
    canvas.restoreState()


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    "GuideTitle", parent=styles["Title"], fontName=SERIF, fontSize=26, alignment=0,
    leading=33, textColor=NAVY, spaceAfter=22,
))
styles.add(ParagraphStyle(
    "GuideH2", parent=styles["Heading2"], fontName=SERIF_BOLD, fontSize=14,
    leading=19, textColor=BLUE, spaceBefore=16, spaceAfter=10,
))
styles.add(ParagraphStyle(
    "GuideBody", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5,
    leading=14.5, textColor=INK, spaceAfter=10,
))
styles.add(ParagraphStyle(
    "GuideSmall", parent=styles["BodyText"], fontName="Helvetica", fontSize=8,
    leading=11, textColor=STONE,
))
styles.add(ParagraphStyle(
    "GuideCallout", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=10,
    leading=15, textColor=NAVY, backColor=CREAM, borderColor=GOLD,
    borderWidth=0.5, borderPadding=10, spaceBefore=18, spaceAfter=20,
))
styles.add(ParagraphStyle(
    "CoverLead", parent=styles["BodyText"], fontName="Helvetica", fontSize=11,
    leading=17, textColor=CREAM, alignment=TA_CENTER, leftIndent=35, rightIndent=35,
))
styles.add(ParagraphStyle(
    "GuideTableHead", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=8,
    leading=11, textColor=WHITE,
))
styles.add(ParagraphStyle(
    "GuideTableBody", parent=styles["BodyText"], fontName="Helvetica", fontSize=8,
    leading=11, textColor=INK,
))


def bullets(items):
    return [
        Paragraph(f"<b>{index}.</b> {text}", styles["GuideBody"])
        for index, text in enumerate(items, start=1)
    ]


def table(data, widths):
    wrapped = [
        [Paragraph(escape(str(cell)), styles["GuideTableHead" if row_index == 0 else "GuideTableBody"]) for cell in row]
        for row_index, row in enumerate(data)
    ]
    result = Table(wrapped, colWidths=widths, repeatRows=1, hAlign="LEFT")
    result.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("LEADING", (0, 0), (-1, -1), 11),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, 0), 1.3, GOLD),
        ("LINEBELOW", (0, 1), (-1, -1), 0.35, colors.HexColor("#D9D1C1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, CREAM]),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return result


doc = BaseDocTemplate(
    str(OUTPUT),
    pagesize=letter,
    leftMargin=0.72 * inch,
    rightMargin=0.72 * inch,
    topMargin=1.08 * inch,
    bottomMargin=0.72 * inch,
    title="AGAPAY Parish Onboarding Guide",
    author="AGAPAY",
    subject="Current AGAPAY Give parish setup, Stripe connection, and launch guide",
)
content_frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="content")
doc.addPageTemplates([
    PageTemplate(id="Cover", frames=content_frame, onPage=cover),
    PageTemplate(id="Body", frames=content_frame, onPage=footer),
])

story = [Spacer(1, 1), PageBreak()]
doc.handle_nextPageTemplate("Body")

story += [
    Paragraph("Your setup at a glance", styles["GuideTitle"]),
    Paragraph(
        "AGAPAY reviews every church or monastery for canonical standing before public activation. "
        "Your selected tier is recorded at registration so the review and onboarding process begins with the tools you intend to use.",
        styles["GuideBody"],
    ),
    Paragraph("Have these items ready", styles["GuideH2"]),
    table([
        ["Item", "What to have ready"],
        ["Canonical information", "Jurisdiction, parish website or directory listing, and the name of the relevant bishop or ecclesiastical authority."],
        ["Organization details", "Legal name, EIN, physical address, phone number, and authorized representative."],
        ["Banking", "The parish-owned checking account and ACH routing information used for Stripe payouts."],
        ["Leadership contacts", "Primary clergy or administrator contact and finance or treasurer contact."],
        ["Branding", "A parish logo, if using Give + or a higher tier."],
    ], [1.55 * inch, 5.1 * inch]),
    Paragraph("The six-part flow", styles["GuideH2"]),
    *bullets([
        "Register the community and select the tier you want to begin with.",
        "Wait for AGAPAY's canonical-standing review and approval email.",
        "Follow your access email and create or secure the parish dashboard password. Complete any MFA prompts.",
        "Start the free 30-day demo for your selected tier. No card is required; Monastic remains free.",
        "Complete Stripe-hosted identity, organization, and bank verification.",
        "Review giving setup, complete the treasurer signoff, and select Go Live. Then test and share your giving page.",
    ]),
    Paragraph(
        "AGAPAY never holds donated funds and does not charge an AGAPAY donation fee. "
        "Stripe's standard processing costs still apply, and donors may be offered the option to cover them.",
        styles["GuideCallout"],
    ),
    PageBreak(),
    Paragraph("Choose the right tier", styles["GuideTitle"]),
    table([
        ["Tier", "Monthly", "Designed for"],
        ["Give", "$9", "Core one-time and recurring giving, commemorations, General Operating, unlimited designated funds, candles, giving link, QR code, receipts, history, and CSV export."],
        ["Give +", "$79", "Everything in Give plus parish branding, custom funds, campaigns, pledges, Stewardship Health, annual statements, the Parish Directory, Bookstore, Parish Library, and Koinonia."],
        ["Parish", "From $149", "The complete parish platform, including every add-on, at a flat rate based on active households."],
        ["Cathedral / Diocese", "Custom", "Cathedral, diocesan, and multi-parish needs with organization-level reporting and support."],
        ["Monastic", "$0", "Give + capabilities for canonical monasteries, sketes, and convents, with no monthly platform fee."],
    ], [1.32 * inch, 0.72 * inch, 4.62 * inch]),
    Paragraph("Add exactly what Give + needs", styles["GuideH2"]),
    table([
        ["Add-on", "Monthly", "Unlocks"],
        ["Sacraments & Services", "$9", "Parishioner requests, scheduling, priest workflows, and calendar connections."],
        ["Full Commerce", "$29", "Events, meals, orders, and tax workflows. Bookstore is already included in Give +."],
        ["Accounting Suite", "$129", "Full Commerce plus fund accounting, journals, reconciliation, financial reporting, and statements."],
    ], [1.42 * inch, 0.72 * inch, 4.52 * inch]),
    Paragraph(
        "Each remaining Give + add-on is purchased and gated independently. Koinonia and Parish Library are included in Give +. Accounting Suite includes Full Commerce, so included capabilities never stack. "
        "You may change tiers or add-ons later; dashboard and backend access update to match the active subscription.",
        styles["GuideCallout"],
    ),
    PageBreak(),
    Paragraph("After canonical approval", styles["GuideTitle"]),
    *bullets([
        "Open the parish dashboard or secure invitation link in your access email.",
        "Follow that email's access instructions. If it supplies a Parish ID and temporary password, sign in and replace the temporary password. If it supplies an invitation, open it and create your password.",
        "Complete any multi-factor authentication (MFA) prompts, such as a passkey or authenticator check. Keep recovery information private.",
        "Review the selected tier and select <b>Start free 30-day demo</b>. If setup was interrupted, select <b>Continue demo setup</b>.",
        "If the parish claimed a sales-tax exemption, confirm its review status before paid checkout.",
    ]),
    Paragraph("Your trial and billing", styles["GuideH2"]),
    Paragraph(
        "The free 30-day demo does not require a card. Review the trial end date and plan price in the dashboard. "
        "Add billing information only if you choose to continue after the demo. If the demo ends without activation, "
        "the dashboard asks you to choose a tier and activate a subscription to restore subscription access. Monastic has no monthly platform fee.",
        styles["GuideBody"],
    ),
    Paragraph(
        "AGAPAY billing pays for the platform. Stripe donation setup connects the parish's organization and payout bank account. "
        "These are separate steps. Once the demo is active, choose Connect Stripe for donations.",
        styles["GuideCallout"],
    ),
    Paragraph("One dashboard for initial setup", styles["GuideH2"]),
    Paragraph(
        "The secured shared parish dashboard is sufficient for initial setup and launch during the trial. "
        "A separate personal treasurer login is not required for initial Go Live. Individual staff invitations create personal access; "
        "follow those separately when issued, including the treasurer invitation when the parish becomes paid.",
        styles["GuideBody"],
    ),
    PageBreak(),
    Paragraph("Connect the parish Stripe account", styles["GuideTitle"]),
    Paragraph(
        "Stripe onboarding takes place on Stripe's secure hosted pages. Use the parish's legal and banking information, "
        "not an individual's personal bank account. AGAPAY receives status updates but does not receive the parish's full bank credentials.",
        styles["GuideBody"],
    ),
    Paragraph("Stripe checklist", styles["GuideH2"]),
    *bullets([
        "Confirm the organization type and legal name exactly as shown on IRS and bank records.",
        "Enter the EIN and parish address.",
        "Identify an authorized representative and provide any identity documentation Stripe requests.",
        "Connect the parish-owned bank account for payouts.",
        "Return to the AGAPAY dashboard and confirm that charges and payouts are enabled.",
    ]),
    Paragraph(
        "If setup is incomplete, select Continue Stripe setup. After completing Stripe's requirements, return and select Check Stripe status. "
        "Verification can take longer than the time spent filling out the forms; wait for the dashboard to confirm readiness.",
        styles["GuideBody"],
    ),
    Paragraph("Common verification delays", styles["GuideH2"]),
    table([
        ["Issue", "What to check"],
        ["Legal-name mismatch", "Compare the Stripe entry with IRS and bank documentation, including punctuation and abbreviations."],
        ["Representative review", "Use the representative's current legal name, address, date of birth, and requested identification."],
        ["Bank verification", "Confirm routing and account numbers and that the account is owned by the registering organization."],
        ["Pending requirements", "Open the Stripe setup link from the dashboard and complete every outstanding requirement."],
    ], [1.65 * inch, 5 * inch]),
    PageBreak(),
    Paragraph("Configure and launch Giving", styles["GuideTitle"]),
    Paragraph("Give launch checklist", styles["GuideH2"]),
    *bullets([
        "Select <b>Review giving setup</b>. Confirm the general operating fund, designated funds, recurring-gift choices, and other options shown for your tier.",
        "Save the setup and indicate whether you need help importing existing donor or pledge records.",
        "When the dashboard shows <b>Review and launch</b>, open the treasurer signoff. If it shows AGAPAY review or another next step, complete that step or contact onboarding support.",
        "The authorized treasurer reviews all four sections, checks all eight confirmations, enters their name and title, and confirms authority. Check the treasurer email on file; contact support if it is incorrect.",
        "Select <b>Go Live</b> and wait for <b>Giving is live</b>. The secured shared parish dashboard can approve this initial launch, including during the trial.",
        "Open the giving page, verify parish details, test the QR code, and complete a small real gift. Confirm receipt delivery and dashboard history before distributing the link widely.",
    ]),
    Paragraph(
        "Initial launch does not require a separate treasurer login or accounting PIN. Accounting remains protected by its own treasurer PIN and authorized accounting session, with the appropriate plan access.",
        styles["GuideCallout"],
    ),
    Paragraph("Give + and higher", styles["GuideH2"]),
    *bullets([
        "Upload the parish logo for the dashboard, giving pages, campaigns, and church search.",
        "Review funds in the Funds tab; the shared catalog supports Giving and Accounting. Give also includes unlimited designated funds.",
        "Create campaigns with clear goals, dates, and descriptions.",
        "Configure liturgical commemorations and annual statement settings as appropriate.",
    ]),
    PageBreak(),
    Paragraph("Set up parish tools and finance", styles["GuideTitle"]),
    Paragraph("Give + and Parish", styles["GuideH2"]),
    *bullets([
        "Review pledge tracking, recurring-gift visibility, and Stewardship Health.",
        "Give + includes Directory, Bookstore, Parish Library, and Koinonia. Turn on their member-facing experiences when the parish is ready to use them.",
        "Configure any purchased Sacraments & Services, Full Commerce, or Accounting Suite add-ons; Parish includes all three.",
        "Assign staff access carefully and keep finance permissions limited to authorized personnel.",
    ]),
    Paragraph("Accounting access and setup", styles["GuideH2"]),
    Paragraph(
        "When your plan includes Accounting, use its separate treasurer PIN and accounting access flow. "
        "Shared-dashboard launch approval does not grant accounting access. Before relying on automated entries, "
        "review the chart of accounts, fund and revenue mappings, integration start date, and posting settings with your treasurer. "
        "A successful Stripe connection alone does not confirm that accounting posting is enabled.",
        styles["GuideBody"],
    ),
    Paragraph("Monthly finance routine", styles["GuideH2"]),
    *bullets([
        "Compare AGAPAY gifts with Stripe charges and payouts.",
        "Review processing fees and donor-covered fee offsets.",
        "Confirm gifts are assigned to the correct fund from the Funds catalog.",
        "Export the period's CSV or accounting report and retain it with parish records.",
        "Close or reconcile the period only after the bank deposit and Stripe payout agree.",
    ]),
    PageBreak(),
    Paragraph("Protect your parish access", styles["GuideTitle"]),
    Paragraph("Security practices", styles["GuideH2"]),
    *bullets([
        "Use a unique dashboard password and change temporary credentials immediately.",
        "Do not share sign-in credentials by text message or in a public parish document.",
        "Complete required MFA and use individual staff invitations and roles when issued. Keep the separate treasurer PIN private.",
        "Treat unexpected requests to change payout banking information as high risk and verify them independently.",
        "Contact AGAPAY support promptly if an administrator leaves or access may be compromised.",
    ]),
    Paragraph(
        "Support: reply to an AGAPAY onboarding email or contact support@agapay.app. "
        "Include the parish name and registration reference, but never send a password or full bank account number by email.",
        styles["GuideCallout"],
    ),
    PageBreak(),
    Paragraph("Post-launch checklist", styles["GuideTitle"]),
    table([
        ["Area", "Confirm"],
        ["Public page", "Parish identity and location are correct; logo appears only if the tier includes branding."],
        ["Giving", "General Stewardship and every active custom fund accept the intended one-time or recurring gifts."],
        ["Campaigns", "Active campaigns have accurate dates, goals, images, and destinations."],
        ["QR code", "The code opens the correct parish giving page on multiple phones."],
        ["Receipts", "The test donor received a receipt and the parish dashboard records the same gift."],
        ["Stripe", "Charges and payouts are enabled and the bank destination is correct."],
        ["Trial and billing", "The trial end date and selected plan price are understood. Add billing information if continuing after the free demo."],
        ["Launch approval", "The treasurer signoff is complete and the dashboard confirms Giving is live before broad distribution."],
        ["Accounting", "Separate PIN access, fund and revenue mappings, integration start date, and posting settings are reviewed if using Accounting."],
        ["Staff", "Only current authorized users can access parish or finance functions."],
    ], [1.35 * inch, 5.3 * inch]),
    Paragraph("Keep this guide current", styles["GuideH2"]),
    Paragraph(
        "The dashboard copy of this guide is the current source. If a previously downloaded or emailed copy conflicts "
        "with the live dashboard, download the guide again from Parish Dashboard > Settings.",
        styles["GuideBody"],
    ),
    Paragraph(
        "AGAPAY pricing and product availability may evolve. The live pricing page and the parish's active subscription "
        "entitlements control access.",
        styles["GuideCallout"],
    ),
]

doc.build(story)
print(OUTPUT)
