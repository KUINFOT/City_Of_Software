# Vendor guide

For software companies and freelancers who want to find government software work early, judge it quickly, and not miss a deadline.

The app is mostly in Thai; the Advanced search page is in English. Menu and button names below are given in English first, with the Thai label in parentheses so you can find them.

> **The one thing to remember:** everything the AI reads is a *machine-generated aid*, never the official record. Every summary says so, every uncertain field is flagged, and the original document is one click away. Check the source before you rely on anything.

## What's in it for you

| You want to… | Go to |
| --- | --- |
| See what is open right now | [Search TORs](#find-tors) |
| Know whether you qualify | [The qualification panel](#read-a-tor) |
| Never miss a deadline | [Calendar, approaching deadlines](#keep-a-shortlist), [alerts](#alerts) |
| Shortlist and compare | [Save, notes, compare](#keep-a-shortlist) |
| Price a bid | [Analytics](#price-a-bid-with-evidence) |

---

## Create your account

Choose **Sign up (สมัครใช้งาน)**, then **Software vendor (ผู้ขายซอฟต์แวร์)**. It takes three steps.

**1. Your details.** Name, organisation, work email, phone and a password of **at least 10 characters**. Very common passwords such as `password123` are refused, and so is any password that has appeared in a known data breach; choose another if you see that message.

**2. Your capability profile.** This is what lets the platform match you to the right TORs and compare you with their requirements.

| Field | What to enter | Used for |
| --- | --- | --- |
| Organisation type (ประเภทองค์กร) | Company (บริษัท) or freelancer (ฟรีแลนซ์) | Companies also give a name |
| Technologies (เทคโนโลยีที่ใช้) | Comma-separated, for example `React, Node.js, PostgreSQL` | Matching a TOR's required technologies |
| Service categories (หมวดหมู่บริการ) | For example `web application, data analytics` | Profile completeness |
| Experience (ประสบการณ์) | Years, 0 to 100 | The "experience" requirement check |
| Team size | 1 or more | |
| Certifications (ใบรับรอง) | Name and issuer | The "certification" requirement check |
| Past contracts (ผลงานสัญญาที่ผ่านมา) | Title, agency, value in baht, year | The "contract value" check: your total is the sum |

You need at least **one technology or service category**. Everything is **self-declared**: the platform never shows it as verified, and never tells an agency that you are qualified.

**3. Verify your email.** We send a link that is valid for **24 hours**. Opening it creates your account. Nothing is saved before that. If it does not arrive, check spam, then use *send the link again (ส่งลิงก์ยืนยันอีกครั้ง)* (once a minute).

BMA officials (เจ้าหน้าที่กรุงเทพมหานคร) choose that option on the first screen instead; it skips the profile step.

### Or sign up with Google

Where the platform has Google sign-in switched on, **Continue with Google (ดำเนินการต่อด้วย Google)** on the sign-up page lets you skip the password. After Google, you give your name, organisation, phone and whether you are a software vendor or a BMA official, and your account is ready at once: there is no verification email, because Google has already confirmed your address. Vendors then fill in the capability profile under **Account profile (โปรไฟล์บัญชี)**, since matching needs it. An account made this way has no password you know; sign in with Google, or use **Forgot your password?** to set one.

## Signing in

**Sign in (เข้าสู่ระบบ)** with your email and password, or with Google if you signed up that way or have connected it.

- Already have a password account and want to use Google too? Sign in with your password, open **Settings → Personal information (ข้อมูลส่วนตัว)** and connect your Google account. Signing in with Google first will not work: a matching email address is not enough, on purpose.
- Five wrong passwords lock the account for **15 minutes**.
- You are signed out after **30 minutes of inactivity**, and always after 8 hours.
- **Forgot your password? (ลืมรหัสผ่าน)** sends a one-hour reset link. For privacy the page gives the same answer whether or not the address is registered. Resetting signs you out of every device.

---

## Find TORs

Two ways in, both visible to anyone, signed in or not. They show **published, reviewed** TORs only, and by default hide ones whose submission deadline has passed.

| | Search TORs (ค้นหา TOR) | Advanced search (ค้นหาขั้นสูง) |
| --- | --- | --- |
| Best for | Browsing everything, newest first | Narrowing down |
| Shows | Title, agency, the agency's stage, budget, deadline | The same, as cards |
| Filters | A search box (title or agency) and a stage drop-down | Technology, project type, agency, tender status, budget range, date-published and deadline ranges, and a *Show TORs* availability switch |
| Sort | Fixed: newest first | Highest match %, lowest/highest budget, newest/oldest, closest/furthest deadline |

### Tips

- **Keywords are broad.** Every word you type must appear somewhere in the title, agency, technologies, project type or AI summary. Thai works as well as English.
- **Your search is a link.** Filters and sort are stored in the page address, so you can bookmark a search or send it to a colleague.
- **Tender Status filter.** *Draft Feedback* covers plans, draft TORs, specifications and price references (you can still comment on these). *Open For Bids* is the invitation to bid. *Under Review* is anything the system could not classify. *Closed* is awarded or cancelled.
- **To see lapsed TORs** too (useful for researching what an agency bought before), choose **All TORs (including closed)** under *Show TORs*.
- **"Highest match %"** simply counts how many of your search words occur in the listing. It is not a smart ranking.

> [!NOTE]
> Two things on the Advanced search page are currently unreliable: the **Project Type** filter returns nothing, and the **Closest / Furthest deadline** sort orders are the wrong way round. Both are on the [known-bugs list](../status.md#known-bugs). Use the keyword box and the other filters meanwhile.

---

## Read a TOR

Open any result to reach its detail page.

### The agency's stage

Each TOR carries the **agency's** procurement stage, which is separate from our review:

| Label (Thai) | Meaning |
| --- | --- |
| Planning (อยู่ระหว่างวางแผน) | In the procurement plan |
| Draft TOR (ร่าง TOR) | Draft published, usually open for public comment |
| Specification (อยู่ระหว่างจัดทำรายละเอียด) | Specification being prepared |
| Reference price (อยู่ระหว่างพิจารณาราคากลาง) | Reference-price stage |
| Open for proposals (เปิดรับข้อเสนอ) | You can bid |
| Results announced (ประกาศผลแล้ว) | Awarded: not for you |
| Cancelled (ยกเลิก) | Withdrawn |

### The AI summary and the caution flags

- A plain-language **summary** sits at the top, always labelled *AI summary, not official information (สรุปโดยระบบ AI — ไม่ใช่ข้อมูลที่เป็นทางการ)*.
- Fields the AI read with low confidence show **"Should check (ควรตรวจสอบ)"** with a note: *the AI is not sure about this, please check the original document*. "Low" means under the review threshold (0.75 by default).
- **Every value the AI shows was backed by a quote from the document.** Anything the system could not find a quote for is dropped, not guessed. A blank field means "not found", not "not required".
- A person approved this record before you could see it (unless the platform has been configured to auto-publish, which is off by default).

### Key dates

Announcement, public-comment start and end, clarification meeting, proposal deadline, contract start and end, each with **days remaining**. A date within **7 days** is highlighted. Dates are shown as stated by the agency, to the day.

### Do I qualify? (signed-in vendors)

The qualification panel compares the TOR's stated requirements with your profile:

| Requirement | Compared with |
| --- | --- |
| Required certifications | Your certifications (by name) |
| Minimum accumulated contract value | The total of your past contracts |
| Minimum years of experience | Your experience |

Each line says **met**, **not met** (with the exact gap: *"needs at least 1,000,000 THB but your profile says 200,000 THB"*) or **can't tell yet** (you have not declared that value). It never says "eligible" or "ineligible": that is the agency's decision, and your profile is your own declaration. A guest sees an invitation to register instead.

### Why it matched you

If the TOR fits your interests you will see **Matches your profile (ตรงกับโปรไฟล์ของคุณ)** with the reasons: a technology you list, an agency you follow, a keyword you follow.

### Unusual budget

If the budget is far outside what the same agency paid for the same kind of project in the same year, you will see an **unusual budget (งบประมาณผิดปกติ…)** note. It is a statistical signal for further inquiry, **not a finding of wrongdoing**, and it only appears when there are at least five comparable projects.

### The original document

The **source** section tells you where and when the system captured the TOR, and whether it was collected automatically from the agency's website or uploaded by an administrator. Click a document to open the original. The link is valid for **15 minutes**; reload the page for a fresh one.

### Share and export

**Share link** copies the page address. **Export summary / save PDF (ส่งออกสรุป / บันทึก PDF)** opens a print-ready summary. Choose *Save as PDF* in your browser's print dialog. If nothing opens, allow pop-ups for the site. Your private notes are never included.

---

## Keep a shortlist

### Save a TOR

On a TOR page choose **Save project (บันทึกโครงการ)**. It appears under **Saved projects (โครงการที่บันทึกไว้)** and on your **Dashboard**. Unsaving is **Remove from saved (ยกเลิกการบันทึก)**. Only vendors can save.

### Private notes

Each saved TOR has a **private note (บันทึกส่วนตัว)** of up to 2,000 characters for your go / no-go thinking: *"call the team before bidding"*. Notes belong to you alone, are not shared with anyone, and are not part of any export.

### Compare

Open **Compare TORs (เปรียบเทียบ TOR)** in the sidebar. It takes two steps: tick **2 to 4** of your saved TORs, then view the comparison. You get a side-by-side view of budget (with whether it includes VAT), duration, deadline, technologies, qualification requirements, evaluation criteria and deliverables. **Export / save PDF (ส่งออก / บันทึก PDF)** produces a PDF.

### Calendar

**Calendar (ปฏิทิน)** puts submission deadlines on a month view. Toggle between your **saved** projects and **all** projects, step through months, and jump to today. Past-due items are marked.

### Approaching deadlines

**Approaching deadlines (กำหนดส่งที่ใกล้ถึง)** lists every published TOR whose deadline falls within the next **14 days**, soonest first, saved or not, with a save button on each.

### The Dashboard

**Dashboard (แดชบอร์ด)** is your starting page: a profile-completeness prompt, your saved TORs, your recent matches (each card shows a match percentage and the main reason it matched; open the TOR for the full list) and the deadlines coming up in the next 14 days.

---

## Alerts

You are alerted when a TOR that fits you **changes stage** on the agency's site:

| Event | Alert |
| --- | --- |
| A TOR enters the draft / public-comment stage | "Now open for public comment": your chance to raise a concern while the draft can still change |
| A TOR is formally announced for bidding | "Formally announced": the clock is now running. It refers back to your earlier alert if you had one |
| A TOR is cancelled | Alerts not yet sent are cancelled |

Each alert says what the TOR is, the agency, the estimated budget, **why it matched you**, and links to the page. You get at most one alert per TOR per stage.

### Choose how you hear

Under **Settings → Notifications (ตั้งค่าการแจ้งเตือน)**:

| Setting | Options |
| --- | --- |
| **Alert frequency** | *Instant* (แจ้งเตือนทันที) sends an email each time; *Daily summary* (สรุปรวมส่งวันละครั้ง) sends one email each morning |
| **Followed agencies** (หน่วยงานที่ติดตามเพิ่มเติม) | Get alerted for anything from these agencies, whatever your technologies |
| **Followed keywords** (คำสำคัญที่ติดตาม) | Comma-separated. Get alerted when a TOR's **title** contains one |

Following agencies and keywords is in *addition* to profile matching: a way to watch an area you are moving into.

### Unsubscribing

Every alert email ends with a one-click **unsubscribe** link. It needs no sign-in, takes effect immediately, and stops **email only**: alerts still appear in your dashboard, and your account is untouched.

### If you are not getting alerts

| Check | Why |
| --- | --- |
| Your technologies and followed agencies/keywords | An alert needs at least one reason to match. A TOR with no listed technologies can only match through an agency or keyword you follow |
| The stage changed on a *published* TOR | An alert fires when a TOR that is already published moves to a new stage. A TOR that was published already at "open for proposals" will not alert you |
| Email is configured on the server | Without a Gmail or Resend setup, emails are not delivered (alerts still show on the dashboard) |
| You have not unsubscribed | The unsubscribe link removes email for good |

---

## Price a bid with evidence

Under **Analytics** in the sidebar (any signed-in account):

- **Compare budgets (เปรียบเทียบงบประมาณ):** pick an agency and/or project type and a year range to see the spread of what comparable projects were announced at: minimum, quartiles, median, maximum, a band chart, and a trend by year.
- **Frequency by agency (ความถี่รายหน่วยงาน):** how many software procurements each agency runs per year and what a typical one is worth, so you can decide where to concentrate.

How to read them:

- Both always show **how many projects** the figure rests on. A figure from three projects is not the same as one from thirty.
- If a set has **fewer than 5 projects**, you will see "not enough data (ข้อมูลไม่เพียงพอ)" and no numbers. That is deliberate: a median of two is not worth quoting.
- Amounts are **as announced**: no inflation adjustment, and VAT is not normalised.
- Only **reviewed** TORs are counted.

The method is explained in [Analytics](../analytics.md).

---

## Keep your profile useful

Open **Account profile (โปรไฟล์บัญชี)** to review and edit your capability profile.

- The **completeness score** shows what is missing and how much each missing piece is worth. Technologies and service categories carry the most weight (25 and 20 of 100).
- Press **Edit profile (แก้ไขโปรไฟล์)**, change what you like, and **Save (บันทึกการแก้ไข)**. Each capability change is saved as a new **version**, so the platform can always explain a past match against the profile you had at the time.
- If you edit in two tabs, the second save is refused with "this profile changed in another session" instead of silently overwriting. Reload and re-apply.

---

## Questions people ask

**Why can't I see a TOR I found on an agency's website?** Either it has not been collected yet, or it is waiting for review (nothing is visible until a person approves it), or its deadline has passed (choose *All TORs (including closed)* on the Advanced search page).

**Is the AI summary official?** No. It is labelled machine-generated and non-authoritative on every page. The original document is the source of truth.

**A field is wrong. What do I do?** Use the original document, and tell an administrator, who can correct the record. Corrections are kept and never overwritten by a re-run.

**Why does it say "can't tell yet" on a requirement?** The TOR states a requirement, but your profile does not declare the matching value. Add it and the line resolves.

**Why is a budget missing?** The AI did not find one it could back with a quote, or the agency did not state one. We never invent a budget.

**Who can see my profile and notes?** Your profile feeds matching and the qualification panel for *you*. It is not shown to agencies or other vendors. Notes are private to you. Administrators can view profiles to assist you.

**Can I delete my account?** There is no self-service deletion yet. Ask an administrator.
