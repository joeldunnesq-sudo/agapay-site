from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
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


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#D9D1C1"))
    canvas.line(0.68 * inch, 0.55 * inch, 7.82 * inch, 0.55 * inch)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(STONE)
    canvas.drawString(0.68 * inch, 0.34 * inch, "AGAPAY Parish Onboarding Guide")
    canvas.drawRightString(7.82 * inch, 0.34 * inch, f"Page {doc.page}")
    canvas.restoreState()


def cover(canvas, doc):
    canvas.saveState()
    width, height = letter
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(1)
    canvas.rect(0.38 * inch, 0.38 * inch, width - 0.76 * inch, height - 0.76 * inch, fill=0, stroke=1)
    canvas.setFillColor(GOLD)
    canvas.setFont("Helvetica-Bold", 11)
    canvas.drawCentredString(width / 2, height - 1.08 * inch, "AGAPAY")
    canvas.setFont("Helvetica", 8)
    canvas.drawCentredString(width / 2, height - 1.3 * inch, "LOVE HOW YOU GIVE")
    canvas.setFillColor(WHITE)
    canvas.setFont("Times-Bold", 30)
    canvas.drawCentredString(width / 2, height - 2.28 * inch, "Parish Onboarding Guide")
    canvas.setFillColor(CREAM)
    canvas.setFont("Times-Italic", 14)
    canvas.drawCentredString(width / 2, height - 2.7 * inch, "Choose your plan, connect Stripe, and launch with confidence")
    canvas.setFillColor(GOLD)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawCentredString(width / 2, 0.88 * inch, "CURRENT AGAPAY GIVE SETUP & OPERATIONS")
    canvas.setFillColor(CREAM)
    canvas.setFont("Helvetica", 8)
    canvas.drawCentredString(width / 2, 0.66 * inch, "For canonical Orthodox parishes, missions, cathedrals, and monasteries")
    canvas.restoreState()


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    "GuideTitle", parent=styles["Title"], fontName="Times-Bold", fontSize=25,
    leading=29, textColor=NAVY, spaceAfter=14,
))
styles.add(ParagraphStyle(
    "GuideH2", parent=styles["Heading2"], fontName="Times-Bold", fontSize=17,
    leading=21, textColor=BLUE, spaceBefore=12, spaceAfter=8,
))
styles.add(ParagraphStyle(
    "GuideBody", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5,
    leading=14, textColor=INK, spaceAfter=8,
))
styles.add(ParagraphStyle(
    "GuideSmall", parent=styles["BodyText"], fontName="Helvetica", fontSize=8,
    leading=11, textColor=STONE,
))
styles.add(ParagraphStyle(
    "GuideCallout", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=10,
    leading=15, textColor=NAVY, backColor=CREAM, borderColor=GOLD,
    borderWidth=0.7, borderPadding=10, spaceBefore=8, spaceAfter=12,
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
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D9D1C1")),
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
    topMargin=0.72 * inch,
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

story = [
    Spacer(1, 2.95 * inch),
    Paragraph(
        "A practical guide for selecting the right AGAPAY tier, completing canonical review, "
        "activating billing, connecting your parish-owned Stripe account, and preparing your public giving page.",
        styles["CoverLead"],
    ),
    PageBreak(),
]
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
        "Sign in with the Parish ID and temporary password from the welcome email.",
        "Activate billing for the selected paid tier; Monastic remains free.",
        "Complete Stripe-hosted identity, organization, and bank verification.",
        "Configure funds and campaigns available to the tier, test the page, and launch.",
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
        ["Give", "$9", "Core one-time and recurring giving, commemorations, one General Stewardship fund, one designated fund, candles, giving link, QR code, receipts, history, and CSV export."],
        ["Give +", "$79", "Everything in Give plus parish branding, custom funds, campaigns, pledges, Stewardship Health, annual statements, and the Parish Directory."],
        ["Parish", "From $149", "The complete parish platform, including every add-on; early-adopter and standard rates are based on active households."],
        ["Cathedral / Diocese", "Custom", "Cathedral, diocesan, and multi-parish needs with organization-level reporting and support."],
        ["Monastic", "$0", "Give + capabilities for canonical monasteries, sketes, and convents, with no monthly platform fee."],
    ], [1.32 * inch, 0.72 * inch, 4.62 * inch]),
    Paragraph(
        "The tier controls feature access in both the dashboard and backend. You may upgrade or downgrade later; "
        "features and paywalls update to match the active subscription.",
        styles["GuideCallout"],
    ),
    Paragraph("After canonical approval", styles["GuideH2"]),
    *bullets([
        "Open the parish dashboard link in the approval email.",
        "Sign in with the Parish ID and temporary password supplied at registration.",
        "Change the temporary password when prompted.",
        "Review the selected tier and begin subscription checkout.",
        "If the parish claimed a sales-tax exemption, confirm its review status before paid checkout.",
    ]),
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
        "Review the General Stewardship fund.",
        "Open the public giving page and confirm parish name and location.",
        "Download the QR code and test it with a phone.",
        "Complete a small test gift and verify the receipt and dashboard history.",
        "Place the giving link and QR code on the parish website, bulletin, and printed materials.",
    ]),
    Paragraph("Give + and higher", styles["GuideH2"]),
    *bullets([
        "Upload the parish logo for the dashboard, giving pages, campaigns, and church search.",
        "Create and name custom funds in the Funds tab; that catalog is the source of truth for Giving and Accounting.",
        "Create campaigns with clear goals, dates, and descriptions.",
        "Configure liturgical commemorations and annual statement settings as appropriate.",
    ]),
    Paragraph("Give + and Parish", styles["GuideH2"]),
    *bullets([
        "Review pledge tracking, recurring-gift visibility, and Stewardship Health.",
        "For Parish, enable Directory, Sacraments & Services, and Text-to-Give only when the parish is ready to use them.",
        "Assign staff access carefully and keep finance permissions limited to authorized personnel.",
    ]),
    PageBreak(),
    Paragraph("Payouts, reconciliation, and security", styles["GuideTitle"]),
    Paragraph("Monthly finance routine", styles["GuideH2"]),
    *bullets([
        "Compare AGAPAY gifts with Stripe charges and payouts.",
        "Review processing fees and donor-covered fee offsets.",
        "Confirm gifts are assigned to the correct fund from the Funds catalog.",
        "Export the period's CSV or accounting report and retain it with parish records.",
        "Close or reconcile the period only after the bank deposit and Stripe payout agree.",
    ]),
    Paragraph("Security practices", styles["GuideH2"]),
    *bullets([
        "Use a unique dashboard password and change temporary credentials immediately.",
        "Do not share sign-in credentials by text message or in a public parish document.",
        "Use individual staff invitations and roles where available.",
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
        ["Accounting", "Funds and revenue mappings reflect the parish's approved chart and reporting practice."],
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
