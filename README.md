# PBC Dems Trello Card Automation

Automated pipeline that converts Gmail messages and Gravity Forms submissions into structured, PII-safe Trello cards in the **Backlog** list of the PBC Dems To Dos board.

## How It Works

```
Gmail (polled every 10 min)  ──┐
                               ├──→ Apps Script ──→ Claude API ──→ Trello Card ──→ Confirmation Email
Gravity Forms (webhook POST) ──┘
```

Claude extracts a title, description, due date, label, and action items from each request while stripping all PII (addresses, phone numbers, emails, volunteer lists). Only the requestor's name is kept.

## Setup

### 1. Create the Apps Script Project

1. Go to [script.google.com](https://script.google.com) and create a new project
2. Create these files and paste in the corresponding code:
   - `Code.gs` — main handler
   - `claude.gs` — Claude API integration
   - `trello.gs` — Trello card creation
   - `config.gs` — board IDs, labels, settings

### 2. Set Script Properties

Go to **Project Settings → Script Properties** and add:

| Property | Value |
|----------|-------|
| `TRELLO_API_KEY` | Your Trello API key ([get here](https://trello.com/app-key)) |
| `TRELLO_TOKEN` | Your Trello token (generate from the API key page) |
| `ANTHROPIC_API_KEY` | Your Anthropic API key ([get here](https://console.anthropic.com)) |

### 3. Deploy as Web App

1. Click **Deploy → New deployment**
2. Select **Web app**
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy** and copy the web app URL

**Current deployment:** `https://script.google.com/macros/s/AKfycbzef2V1wJuca7EJWP0YLFojbRfZ_iK7CxshfPWh25cMYJ4fAB8Js7Hq1lkYFpgAN6pF/exec`

### 4. Configure Gravity Forms Webhook

1. In WordPress admin, go to **Forms → Form 78 (Internal Work Request) → Settings → Webhooks**
2. Add a new webhook:
   - **Name:** Trello Card Automation
   - **Request URL:** the Apps Script web app URL from step 3
   - **Request Method:** POST
   - **Request Format:** JSON
   - **Request Body:** All Fields
   - **Request Headers:** leave blank
3. Save

### 5. Set Up Gmail Polling

1. In the Apps Script editor, open `Code.gs`
2. Run the `setupGmailTrigger()` function once
3. Authorize the required Gmail permissions when prompted
4. The trigger will poll every 10 minutes for emails matching the query in `config.gs`

**How it works:**
- The poller picks up any email with the `task-requests` label (read or unread)
- After processing, the label is **removed** — that's your signal the email was turned into a card
- The email's read/unread status is left untouched

### 6. Create Gmail Label

In Gmail, create a label called `task-requests`. To turn an email into a Trello card, apply this label to it. The label will be automatically removed once the card is created (within 10 minutes).

## Confirmation Emails

After a Trello card is created, the original requestor receives a confirmation email with:

- A direct link to the Trello card so they can track status
- Instructions to create a free Trello account and "Watch" the card for automatic updates
- Contact info (`social@pbcdemocraticparty.org`) for follow-up questions

All confirmation emails are CC'd to `social@pbcdemocraticparty.org`. The API token owner is also auto-subscribed to each new card so the team receives Trello notifications on status changes.

**Note:** Emails currently send from the script owner's Gmail account (ethanfenichel@gmail.com). To send from `social@pbcdemocraticparty.org`, DKIM authentication must be configured for the domain (see "Pending: DKIM Setup" below).

## Card Format

Cards are created in the **Backlog** list with:

- **Title:** Concise action-oriented summary
- **Description:** PII-scrubbed summary + source tag + requestor name
- **Label:** Best-matching category (Email, Social Media, Website, etc.)
- **Due date:** Extracted if mentioned
- **Checklist:** Action items extracted from the request

## Deduplication

Each processed item is tracked by a unique key in Script Properties:
- Gravity Forms: `gf_{entry_id}`
- Gmail: `em_{message_id}`

Duplicate submissions are silently skipped.

## Pending: DKIM Setup

To migrate the script to the `social@pbcdemocraticparty.org` account (so confirmation emails come from that address):

1. Add a DNS TXT record in **Cloudflare** (where pbcdemocraticparty.org nameservers are hosted):
   - **Type:** TXT
   - **Name:** `google._domainkey`
   - **Value:** *(the DKIM key from Google Admin → Apps → Gmail → Authenticate email)*
   - **Proxy status:** DNS only
2. In Google Admin, go to **Authenticate email** and click **Start Authentication**
3. Create a new Apps Script project under the social@ account, paste in all files, set Script Properties, deploy, and authorize permissions
4. Update the Gravity Forms webhook URL to the new deployment
5. Run `setupGmailTrigger()` in the new project

## Troubleshooting

- **Check logs:** In Apps Script, go to **Executions** to see logs and errors
- **Test the webhook:** Use the Apps Script editor to run `doPost()` with a test payload
- **Claude errors:** Verify `ANTHROPIC_API_KEY` is set correctly in Script Properties
- **Trello errors:** Verify `TRELLO_API_KEY` and `TRELLO_TOKEN` are set and have write access to the board
- **Confirmation email not sending:** Run any function from the Apps Script editor to trigger the authorization popup for `MailApp.sendEmail` permissions. Web app deployments won't prompt on their own.
- **Email rejected (message rejected error):** The sending account's domain likely needs DKIM/SPF configured. See "Pending: DKIM Setup" above.
