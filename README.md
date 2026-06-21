# PBC Dems Trello Card Automation

Automated pipeline that converts Gmail messages and Gravity Forms submissions into structured, PII-safe Trello cards in the **Backlog** list of the PBC Dems To Dos board.

## How It Works

```
Gmail (polled every 10 min)  ──┐
                               ├──→ Apps Script ──→ Claude API ──→ Trello Card
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

## Troubleshooting

- **Check logs:** In Apps Script, go to **Executions** to see logs and errors
- **Test the webhook:** Use the Apps Script editor to run `doPost()` with a test payload
- **Claude errors:** Verify `ANTHROPIC_API_KEY` is set correctly in Script Properties
- **Trello errors:** Verify `TRELLO_API_KEY` and `TRELLO_TOKEN` are set and have write access to the board
