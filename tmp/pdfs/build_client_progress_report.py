from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, Image
)

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "pdf" / "JDL-Core-Website-Progress-and-Next-Steps.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

NAVY = colors.HexColor("#081826")
NAVY_2 = colors.HexColor("#173348")
GOLD = colors.HexColor("#C98E12")
GOLD_LIGHT = colors.HexColor("#F7E8BE")
INK = colors.HexColor("#243441")
MUTED = colors.HexColor("#667783")
PALE = colors.HexColor("#F4F6F7")
GREEN = colors.HexColor("#237A50")
WHITE = colors.white

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverKicker", fontName="Helvetica-Bold", fontSize=10, leading=14, textColor=GOLD, alignment=TA_CENTER, spaceAfter=8, tracking=1.8))
styles.add(ParagraphStyle(name="CoverTitle", fontName="Helvetica-Bold", fontSize=30, leading=36, textColor=WHITE, alignment=TA_CENTER, spaceAfter=14))
styles.add(ParagraphStyle(name="CoverSub", fontName="Helvetica", fontSize=13, leading=20, textColor=colors.HexColor("#D8E0E5"), alignment=TA_CENTER))
styles.add(ParagraphStyle(name="H1x", fontName="Helvetica-Bold", fontSize=23, leading=28, textColor=NAVY, spaceAfter=8))
styles.add(ParagraphStyle(name="H2x", fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=NAVY, spaceBefore=10, spaceAfter=6))
styles.add(ParagraphStyle(name="Bodyx", fontName="Helvetica", fontSize=9.4, leading=14, textColor=INK, spaceAfter=7))
styles.add(ParagraphStyle(name="Smallx", fontName="Helvetica", fontSize=7.8, leading=11, textColor=MUTED))
styles.add(ParagraphStyle(name="Bulletx", fontName="Helvetica", fontSize=9.2, leading=13.5, textColor=INK, leftIndent=12, firstLineIndent=-8, bulletIndent=0, spaceAfter=4))
styles.add(ParagraphStyle(name="CardTitle", fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=NAVY, spaceAfter=4))
styles.add(ParagraphStyle(name="CardBody", fontName="Helvetica", fontSize=8.5, leading=12.5, textColor=INK))
styles.add(ParagraphStyle(name="Status", fontName="Helvetica-Bold", fontSize=7.5, leading=10, textColor=GREEN, alignment=TA_CENTER))
styles.add(ParagraphStyle(name="Quote", fontName="Helvetica-Bold", fontSize=15, leading=21, textColor=NAVY, alignment=TA_CENTER))


def header_footer(canvas, doc):
    canvas.saveState()
    if doc.page > 1:
        canvas.setFillColor(NAVY)
        canvas.rect(0, A4[1] - 15*mm, A4[0], 15*mm, fill=1, stroke=0)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.setFillColor(GOLD)
        canvas.drawString(18*mm, A4[1] - 9.5*mm, "JDL CORE")
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor("#D8E0E5"))
        canvas.drawRightString(A4[0] - 18*mm, A4[1] - 9.5*mm, "Website Progress and Next Steps")
        canvas.setStrokeColor(colors.HexColor("#D9DEE2"))
        canvas.line(18*mm, 14*mm, A4[0]-18*mm, 14*mm)
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(MUTED)
        canvas.drawString(18*mm, 9*mm, "Prepared for client review - 25 August 2026")
        canvas.drawRightString(A4[0]-18*mm, 9*mm, f"Page {doc.page}")
    canvas.restoreState()


frame = Frame(18*mm, 17*mm, A4[0]-36*mm, A4[1]-36*mm, leftPadding=0, rightPadding=0, topPadding=4*mm, bottomPadding=2*mm)
doc = BaseDocTemplate(str(OUT), pagesize=A4, rightMargin=18*mm, leftMargin=18*mm, topMargin=20*mm, bottomMargin=18*mm, title="JDL Core Website Progress and Next Steps", author="JDL Core")
doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=header_footer)])


def p(text, style="Bodyx"):
    return Paragraph(text, styles[style])


def bullet(text):
    return Paragraph(f"• {text}", styles["Bulletx"])


def section_title(number, title, intro=None):
    items = [p(f"{number}  {title}", "H1x")]
    if intro:
        items.append(p(intro))
    items.append(Spacer(1, 3*mm))
    return items


def cards(rows):
    data = []
    for row in rows:
        data.append([p(f"{title}<br/><font name='Helvetica' size='8.5'>{body}</font>", "CardTitle") for title, body in row])
    t = Table(data, colWidths=[(A4[0]-40*mm)/len(data[0])]*len(data[0]), hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), PALE), ("BOX", (0,0), (-1,-1), 0.6, colors.HexColor("#D9DEE2")),
        ("INNERGRID", (0,0), (-1,-1), 0.6, colors.HexColor("#D9DEE2")), ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 9), ("RIGHTPADDING", (0,0), (-1,-1), 9),
        ("TOPPADDING", (0,0), (-1,-1), 9), ("BOTTOMPADDING", (0,0), (-1,-1), 9),
    ]))
    return t


story = []

# Cover
story.append(Spacer(1, 22*mm))
logo = ROOT / "public" / "logo-inspection.png"
if logo.exists():
    im = Image(str(logo), width=42*mm, height=42*mm)
    im.hAlign = "CENTER"
    story += [im, Spacer(1, 8*mm)]
story += [
    Table([[p("PROJECT PROGRESS REPORT", "CoverKicker")], [p("JDL Core Digital Platform", "CoverTitle")], [p("What has been delivered, how it supports the business, and what comes next", "CoverSub")]], colWidths=[A4[0]-36*mm], style=TableStyle([("BACKGROUND",(0,0),(-1,-1),NAVY),("LEFTPADDING",(0,0),(-1,-1),18),("RIGHTPADDING",(0,0),(-1,-1),18),("TOPPADDING",(0,0),(-1,0),12),("BOTTOMPADDING",(0,-1),(-1,-1),22)])),
    Spacer(1, 16*mm),
    p("Prepared for JDL Core", "Quote"),
    Spacer(1, 3*mm),
    p("Client review edition  |  25 August 2026", "CoverSub"),
    PageBreak(),
]

# Executive summary
story += section_title("01", "Executive summary", "The JDL Core website has developed into a connected digital platform serving prospective clients, inspection clients, Academy learners, Analytics subscribers, and the internal management team.")
story += [
    cards([[('Public presence','A professional group website presents JDL Core and guides visitors to Inspection, Analytics, and Academy services.'),('Client service','Inspection clients can securely follow jobs, receive updates, download reports, and access invoices.'),('Learning','The Academy provides a public catalogue, learner accounts, lessons, assessments, progress tracking, and certificates.')]]),
    Spacer(1, 4*mm),
    cards([[('Analytics','Approved subscribers can use a private, source-based research assistant and retain their work.'),('Administration','A central management area controls enquiries, clients, jobs, courses, learners, Analytics access, content, and communications.'),('Communication','Key events automatically trigger professional email updates, while every delivery attempt is recorded.')]]),
    Spacer(1, 7*mm),
    p("Current position", "H2x"),
    p("The core customer journeys and management tools are in place. The platform is ready for structured client review and operational testing. The next phase should focus on controlled staff access, automated follow-up, reporting improvements, production readiness, and online payments."),
    p("In simple terms: the foundation and main rooms are built. The next phase adds stronger access control, more automation, final quality checks, and the payment counter.", "Quote"),
    PageBreak(),
]

# Public website
story += section_title("02", "Public website and enquiry journey", "The public website gives the group a consistent, credible presence and turns visitor interest into organised enquiries for the team.")
story += [p("What visitors can do", "H2x"),
    bullet("Understand the JDL Core group and move easily between its Inspection, Analytics, and Academy divisions."),
    bullet("Review the Inspection service offer, service process, standards, and reasons to choose JDL Core."),
    bullet("Submit an inspection quotation request with the information needed for follow-up."),
    bullet("Send a general contact message or request a human follow-up from the website chat assistant."),
    bullet("Join interest lists for developing services where applicable."),
    p("What the business team can do", "H2x"),
    bullet("Receive every website enquiry in one organised inbox rather than relying on scattered messages."),
    bullet("Filter enquiries by type and review the original details submitted by the visitor."),
    bullet("Update the public phone number, email address, office address, and WhatsApp information from the administration area."),
    bullet("Convert a quotation request into a real client account and inspection job without entering the same information twice."),
    Spacer(1, 5*mm),
    cards([[('Business benefit','Faster response to opportunities, fewer missed enquiries, and a consistent first impression.'),('Client benefit','Clear services, simpler contact options, and an easier path from interest to engagement.')]]),
    PageBreak()]

# Inspection portal
story += section_title("03", "Inspection client portal", "The portal gives inspection clients a secure place to follow their work after engagement, reducing routine status calls and email searching.")
story += [p("Client experience", "H2x"),
    bullet("Sign in to a private account and view all assigned inspection jobs."),
    bullet("Open each job to see the current stage, location, service details, and dated progress history."),
    bullet("Download reports, certificates of quantity, and other documents placed against the job."),
    bullet("View invoices and download professionally prepared PDF copies."),
    bullet("Recover a forgotten password through a secure email link."),
    p("Operations and finance controls", "H2x"),
    bullet("Create client accounts and reset access when needed."),
    bullet("Create jobs, assign them to clients, and move them through clear stages from submission to closure."),
    bullet("Post client-facing updates and attach job documents."),
    bullet("Issue invoices, mark payments as received, download PDF invoices, and send payment reminders."),
    bullet("Notify clients automatically when a job stage changes, a document is added, or an invoice is issued."),
    Spacer(1, 5*mm),
    cards([[('Business benefit','A clearer operational record and fewer repetitive follow-up messages.'),('Client benefit','One dependable location for progress, documents, and billing information.')]]),
    PageBreak()]

# Academy
story += section_title("04", "JDL Core Academy and learning portal", "The Academy is a working learning service rather than a simple promotional page. It supports the journey from course discovery through assessment and certification.")
story += [p("Learner experience", "H2x"),
    bullet("Browse published courses and understand the course level, duration, content, and expected learning outcome."),
    bullet("Create a learner account, sign in securely, and access a personal learning dashboard."),
    bullet("Enrol in available courses and work through organised modules and lessons."),
    bullet("Complete knowledge checks and scored assessments with a defined pass requirement."),
    bullet("Track lesson and course progress and continue learning from the dashboard."),
    bullet("Receive a completion email and a uniquely numbered certificate after meeting all requirements."),
    bullet("View, verify, and download a certificate as a PDF."),
    p("Academy management", "H2x"),
    bullet("Create draft courses and publish them when ready for learners."),
    bullet("Edit course information, learning outcomes, modules, lessons, and ordering."),
    bullet("Build questions and answer choices for quizzes and final assessments."),
    bullet("Review learners, enrolment progress, assessment performance, and issued credentials."),
    bullet("Verify or revoke credentials when required."),
    Spacer(1, 5*mm),
    cards([[('Business benefit','A complete base for delivering structured professional training online.'),('Learner benefit','A clear learning journey with measurable progress and verifiable achievement.')]]),
    PageBreak()]

# Analytics
story += section_title("05", "JDL Core Analytics", "Analytics provides approved users with a private research workspace designed to answer questions from a controlled collection of JDL Core reference materials.")
story += [p("Subscriber experience", "H2x"),
    bullet("Learn about the Analytics service through a dedicated public introduction page."),
    bullet("Activate invited access and sign in to a private workspace."),
    bullet("Ask questions and receive answers tied to approved source material."),
    bullet("See supporting references with answers, helping users understand where information came from."),
    bullet("Keep separate conversations, rename or remove them, and return to earlier research."),
    bullet("Export individual conversations for sharing or record keeping."),
    bullet("Recover account access through the shared secure password recovery service."),
    p("Management and oversight", "H2x"),
    bullet("Invite subscribers, grant or suspend access, and set individual usage allowances."),
    bullet("Upload and organise the trusted documents used by the service."),
    bullet("Review subscriber activity, usage, question volume, and recent conversations."),
    bullet("Export management reports for further review and client reporting."),
    Spacer(1, 5*mm),
    cards([[('Business benefit','A controlled, subscription-ready information service built around trusted company knowledge.'),('Subscriber benefit','Faster research with saved work and visible supporting references.')]]),
    PageBreak()]

# Admin and communication
story += section_title("06", "Administration, communication, and protection", "The administration area brings the platform together so daily tasks can be managed without changing the public website manually.")
status_data = [
    [p("AREA","CardTitle"), p("WHAT MANAGEMENT CAN CONTROL","CardTitle"), p("STATUS","CardTitle")],
    [p("Enquiries","CardBody"), p("Quotation requests, contact messages, chat follow-ups, and interest registrations.","CardBody"), p("IN PLACE","Status")],
    [p("Inspection operations","CardBody"), p("Clients, jobs, progress updates, documents, invoices, and payment status.","CardBody"), p("IN PLACE","Status")],
    [p("Academy","CardBody"), p("Courses, curriculum, assessments, learners, progress, and certificates.","CardBody"), p("IN PLACE","Status")],
    [p("Analytics","CardBody"), p("Subscriber access, usage allowances, trusted documents, activity, and reports.","CardBody"), p("IN PLACE","Status")],
    [p("Communications","CardBody"), p("Email service settings, test messages, automated notices, and delivery history.","CardBody"), p("IN PLACE","Status")],
    [p("Public details","CardBody"), p("Contact details displayed across the website.","CardBody"), p("IN PLACE","Status")],
]
t = Table(status_data, colWidths=[34*mm, 105*mm, 27*mm], repeatRows=1)
t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),NAVY),("TEXTCOLOR",(0,0),(-1,0),WHITE),("GRID",(0,0),(-1,-1),0.5,colors.HexColor("#D9DEE2")),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE,PALE]),("LEFTPADDING",(0,0),(-1,-1),7),("RIGHTPADDING",(0,0),(-1,-1),7),("TOPPADDING",(0,0),(-1,-1),8),("BOTTOMPADDING",(0,0),(-1,-1),8)]))
story += [t, Spacer(1, 6*mm), p("Communication already included", "H2x"),
    bullet("Welcome messages for new Academy learners and new client portal accounts."),
    bullet("Course completion and certificate availability messages."),
    bullet("Inspection job stage, document, invoice, and invoice reminder messages."),
    bullet("Analytics invitations and account recovery messages."),
    bullet("A recorded history of sent, skipped, or unsuccessful email attempts for follow-up."),
    p("Access protection", "H2x"),
    p("Private areas require sign-in. Passwords are protected, recovery links expire, account status can be controlled, and clients can only access records assigned to them."),
    PageBreak()]

# Next steps
story += section_title("07", "Recommended next phase", "The next phase is about strengthening management, reducing manual follow-up, and preparing the platform for dependable day-to-day use.")
next_rows = [
    ("1", "Staff accounts and permissions", "Give each authorised team member an individual account and limit access according to responsibility, such as management, operations, finance, Academy, or Analytics."),
    ("2", "Scheduled invoice follow-up", "Send reminders automatically before and after due dates, with clear controls so finance staff can pause or review communications."),
    ("3", "Expanded Academy reporting", "Add clearer enrolment, completion, assessment, and certificate summaries for management and training clients."),
    ("4", "Operational testing and refinement", "Test every important journey with realistic users and data, correct any unclear steps, and confirm messages and documents appear as expected."),
    ("5", "Production launch preparation", "Complete final branding details, confirm business contact information, configure live email delivery, prepare backups, and review access and privacy settings."),
    ("6", "Online payments", "Connect Paystack so clients or learners can make approved payments online and receive an immediate record of successful payment."),
]
for num, title, body in next_rows:
    story.append(KeepTogether([Table([[p(num,"CoverKicker"), p(f"{title}<br/><font name='Helvetica' size='8.5'>{body}</font>","CardTitle")]], colWidths=[14*mm,152*mm], style=TableStyle([("BACKGROUND",(0,0),(0,0),NAVY),("BACKGROUND",(1,0),(1,0),PALE),("BOX",(0,0),(-1,-1),0.5,colors.HexColor("#D9DEE2")),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("LEFTPADDING",(0,0),(-1,-1),9),("RIGHTPADDING",(0,0),(-1,-1),9),("TOPPADDING",(0,0),(-1,-1),9),("BOTTOMPADDING",(0,0),(-1,-1),9)])), Spacer(1,2.5*mm)]))
story += [PageBreak()]

# Handover
story += section_title("08", "Proposed delivery sequence", "This order keeps the work practical: protect access first, automate routine work second, then complete testing and launch preparation before introducing payments.")
phase_data = [
    [p("PHASE","CardTitle"),p("FOCUS","CardTitle"),p("EXPECTED OUTCOME","CardTitle")],
    [p("A","CardTitle"),p("Staff accounts and permissions","CardBody"),p("Clear responsibility and safer internal access.","CardBody")],
    [p("B","CardTitle"),p("Scheduled reminders and Academy reports","CardBody"),p("Less manual follow-up and better management visibility.","CardBody")],
    [p("C","CardTitle"),p("Client review, testing, and refinements","CardBody"),p("Confirmed journeys that are easy for real users to complete.","CardBody")],
    [p("D","CardTitle"),p("Production launch readiness","CardBody"),p("A dependable live service with final settings and safeguards in place.","CardBody")],
    [p("E","CardTitle"),p("Paystack payments","CardBody"),p("Online payment collection linked to relevant services and records.","CardBody")],
]
pt = Table(phase_data, colWidths=[18*mm,64*mm,84*mm], repeatRows=1)
pt.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),NAVY),("TEXTCOLOR",(0,0),(-1,0),WHITE),("GRID",(0,0),(-1,-1),0.5,colors.HexColor("#D9DEE2")),("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE,PALE]),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),8),("RIGHTPADDING",(0,0),(-1,-1),8),("TOPPADDING",(0,0),(-1,-1),9),("BOTTOMPADDING",(0,0),(-1,-1),9)]))
story += [pt, Spacer(1, 9*mm), p("Items to confirm with the client", "H2x"),
    bullet("The staff roles and which parts of the platform each role should access."),
    bullet("The preferred timing and wording for automatic invoice reminders."),
    bullet("The reports required by Academy management and corporate training customers."),
    bullet("The final business contact details, email sender address, branding assets, and launch domain settings."),
    bullet("Which services will accept online payment first and the rules for pricing, refunds, and payment confirmation."),
    Spacer(1, 8*mm),
    Table([[p("The platform now has a strong operational base. The recommended next step is a focused client review followed by staff access controls and launch preparation.","Quote")]], colWidths=[166*mm], style=TableStyle([("BACKGROUND",(0,0),(-1,-1),GOLD_LIGHT),("BOX",(0,0),(-1,-1),0.8,GOLD),("LEFTPADDING",(0,0),(-1,-1),14),("RIGHTPADDING",(0,0),(-1,-1),14),("TOPPADDING",(0,0),(-1,-1),14),("BOTTOMPADDING",(0,0),(-1,-1),14)])),
]

doc.build(story)
print(OUT)
