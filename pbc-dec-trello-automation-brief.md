# PBC DEC Trello Automation — Project Brief

## Goal
Build a fully automated pipeline that converts incoming requests (from Gmail and Gravity Forms) into structured, PII-safe Trello cards in the **Backlog** list of the PBC Dems board.

---

## Architecture

```
Gmail (Apps Script timer, every 10 min)
  └─→ filter by label/sender criteria
  └─→ POST to Apps Script Web App endpoint

Gravity Forms (Webhook on submit — add-on is Active)
  └─→ POST to same Apps Script Web App endpoint

Apps Script Web App (doPost handler)
  └─→ Claude API (claude-sonnet-4-6)
        • Extract: card title, description, due date, category/label
        • Strip PII: addresses, phone numbers, email addresses, volunteer lists
        • Keep: requestor first and last name
        • Tag source: "Via Email" or "Via Form"
  └─→ Trello REST API → create card in Backlog list
```

One endpoint handles both sources. Claude formats and scrubs in a single step. Card lands in Backlog.

---

## Trello Board

- **Board name:** PBC Dems To Dos
- **Board ID:** `6a1afd1059795ef74b7d2134`
- **Short URL:** https://trello.com/b/OQN7FgvR
- **Board is set to PUBLIC** — PII must never appear on any card
- **Target list:** Backlog

### Labels (from board — need IDs confirmed)
From `labelNames` on the board object:
- `green` → "Email"
- `yellow` → "Other"
- `orange` → "Social Media"
- (additional labels TBD — pull full `labels` array via Trello API to get all IDs)

> **TODO:** Run `GET https://api.trello.com/1/boards/6a1afd1059795ef74b7d2134?lists=open&labels=all&key=KEY&token=TOKEN` to get full label and list IDs. Backlog list ID needs to be confirmed.

---

## PII Rules

**Strip / mask:**
- Street addresses
- Phone numbers
- Email addresses
- Volunteer lists or rosters
- Any other personal identifying details beyond name

**Keep:**
- Requestor first and last name

---

## Sources

### 1. Gmail
- Account: `ethanfenichel@gmail.com`
- Trigger: Apps Script time-based trigger (every 10 min)
- Filter: TBD — define criteria (e.g. specific label, subject keyword, sender domain)
- Source tag on card: `Via Email`

### 2. Gravity Forms
- Site: `pbcdemocraticparty.org`
- Form: Internal Task Requests (`/internal-task-requests/`)
- Webhooks Add-On: **Active** ✓
- Trigger: On form submit → POST to Apps Script Web App URL
- Source tag on card: `Via Form`

---

## Card Format

```
Title:       [Concise action-oriented title extracted by Claude]
Description: [Structured summary of the request, PII scrubbed]
             Source: Via Email | Via Form
             Requested by: [First Last]
             Due: [Date if mentioned, else blank]
Checklist:   [Action items extracted from the request]
Label:       [Assigned from Trello label set]
List:        Backlog
```

---

## Credentials Needed (store in Apps Script Properties)

- `TRELLO_API_KEY` — from https://trello.com/app-key
- `TRELLO_TOKEN` — from https://trello.com/app-key (generate token link)
- `ANTHROPIC_API_KEY` — from https://console.anthropic.com
- `TRELLO_BACKLOG_LIST_ID` — confirm via API call above
- `TRELLO_BOARD_ID` — `6a1afd1059795ef74b7d2134`

---

## Files to Build

1. `Code.gs` — main Apps Script: `doPost()` handler, Gmail polling function, time trigger setup
2. `claude.gs` — Claude API call: prompt template, PII scrubbing logic, response parsing
3. `trello.gs` — Trello REST API: create card, assign label, set due date
4. `config.gs` — board config: label map, list IDs, filter rules
5. `README.md` — setup instructions: deploy web app, configure Gravity Forms webhook, set Script Properties

---

## Constraints & Notes

- Apps Script fetch is outbound-only; Gravity Forms webhook POSTs to the deployed web app URL
- Apps Script Web App must be deployed as "Execute as Me, Anyone can access" for the webhook to reach it
- Gmail polling should mark processed emails (e.g. apply a "Processed" label) to avoid duplicates
- Claude model: `claude-sonnet-4-6`
- The Gravity Forms webhook payload format needs to be confirmed — check the add-on settings for field mapping
- Consider idempotency: if the same form entry or email triggers twice, don't create duplicate cards (use entry ID or email Message-ID as a dedup key stored in Apps Script Properties or a Google Sheet)
