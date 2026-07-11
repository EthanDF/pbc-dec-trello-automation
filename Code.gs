/**
 * Code.gs — Main entry points: doPost() webhook handler, Gmail poller, trigger setup
 */

// ── Webhook Handler (Gravity Forms + forwarded Gmail) ─────────
/**
 * Receives POST requests from Gravity Forms webhook or internal Gmail forwarder.
 * Detects source, deduplicates, processes through Claude, creates Trello card.
 */
function doPost(e) {
  try {
    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (err) {
      // Gravity Forms may send form-encoded data
      payload = e.parameter;
    }

    // Detect source
    var source, dedupKey, rawContent;

    if (payload.form_id || payload.entry_id) {
      // Gravity Forms submission
      source = 'Via Form';
      dedupKey = 'gf_' + (payload.entry_id || payload.form_id + '_' + Date.now());
      rawContent = buildFormContent(payload);
    } else if (payload.messageId || payload.subject) {
      // Gmail forwarded via Apps Script
      source = 'Via Email';
      dedupKey = 'em_' + (payload.messageId || Utilities.computeDigest(
        Utilities.DigestAlgorithm.MD5,
        payload.subject + payload.body
      ).map(function(b) { return (b + 128).toString(16); }).join(''));
      rawContent = 'Subject: ' + (payload.subject || '') + '\n\n' + (payload.body || '');
    } else {
      // Unknown source — try to process anyway
      source = 'Via Form';
      dedupKey = 'unk_' + Date.now();
      rawContent = JSON.stringify(payload);
    }

    // Dedup check
    if (isDuplicate(dedupKey)) {
      Logger.log('Skipping duplicate: ' + dedupKey);
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'skipped', reason: 'duplicate' })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // Capture sender email for confirmation (before PII stripping)
    // Gravity Forms field 10 = Email, also check common field names
    var senderEmail = payload['10'] || payload.email || null;

    // Process through Claude
    var cardData = extractCardData(rawContent, source);

    // Create Trello card
    var card = createTrelloCard(cardData, source);

    // Send confirmation to original sender
    if (senderEmail) {
      sendConfirmationEmail(senderEmail, cardData.title, card.url);
    }

    // Mark as processed
    markProcessed(dedupKey);

    return ContentService.createTextOutput(
      JSON.stringify({ status: 'ok', cardId: card.id })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('doPost error: ' + err.message + '\n' + err.stack);
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Gmail Poller ──────────────────────────────────────────────
/**
 * Polls Gmail for messages with the "task-requests" label.
 * Processes them into Trello cards, then removes the label.
 * Called by a time-driven trigger every 10 minutes.
 */
function pollGmail() {
  var query = CONFIG.GMAIL.QUERY;
  var threads = GmailApp.search(query, 0, 20);

  if (threads.length === 0) {
    Logger.log('No new emails matching: ' + query);
    return;
  }

  var taskLabel = getOrCreateLabel(CONFIG.GMAIL.TASK_LABEL);

  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    var messages = thread.getMessages();
    var msg = messages[messages.length - 1]; // latest message in thread

    var messageId = msg.getId();
    var dedupKey = 'em_' + messageId;

    if (isDuplicate(dedupKey)) {
      // Already processed — just remove the label
      thread.removeLabel(taskLabel);
      continue;
    }

    try {
      var senderEmail = msg.getFrom();
      var rawContent = 'Subject: ' + msg.getSubject()
        + '\nFrom: ' + senderEmail
        + '\nDate: ' + msg.getDate()
        + '\n\n' + msg.getPlainBody();

      var cardData = extractCardData(rawContent, 'Via Email');
      var card = createTrelloCard(cardData, 'Via Email');

      // Send confirmation to original sender
      sendConfirmationEmail(senderEmail, cardData.title, card.url);

      markProcessed(dedupKey);
      Logger.log('Created card ' + card.id + ' from email: ' + msg.getSubject());

    } catch (err) {
      Logger.log('Error processing email "' + msg.getSubject() + '": ' + err.message);
    }

    // Remove the label so it's not picked up again
    thread.removeLabel(taskLabel);
  }
}

// ── Deduplication ─────────────────────────────────────────────
/**
 * Checks if a dedup key has already been processed.
 * Uses Script Properties as a simple key-value store.
 */
function isDuplicate(key) {
  return PropertiesService.getScriptProperties().getProperty('dedup_' + key) !== null;
}

function markProcessed(key) {
  PropertiesService.getScriptProperties().setProperty('dedup_' + key, new Date().toISOString());
}

// ── Gmail Helpers ─────────────────────────────────────────────
function getOrCreateLabel(labelName) {
  var label = GmailApp.getUserLabelByName(labelName);
  if (!label) {
    label = GmailApp.createLabel(labelName);
  }
  return label;
}

// ── Form Content Builder ──────────────────────────────────────
/**
 * Known Gravity Forms field mapping for Form 78 (Internal Work Request).
 * The webhook add-on can send either field IDs (input_1, input_2) or labels.
 * This handles both formats.
 */
var FORM_FIELD_MAP = {
  // By common GF webhook field names / labels
  'first':                  'First Name',
  'last':                   'Last Name',
  'email':                  'Email',
  'phone':                  'Phone',
  "what's the task?":       'Task',
  'what platforms do you think need to be updated?': 'Platforms',
  'when does this need to be done?': 'Due Date',
  'how urgent is this?':    'Urgency',
  'additional context':     'Context',
  'related assets':         'Attachments'
};

// Fields that contain PII and should NOT be sent to Claude
var PII_FIELDS = ['email', 'phone', 'user ip', 'user_ip', 'ip', 'user agent', 'user_agent'];

/**
 * Converts a Gravity Forms webhook payload into readable text for Claude.
 * Strips PII fields before sending to the API.
 */
function buildFormContent(payload) {
  var lines = ['Form Submission (Internal Work Request):'];

  for (var key in payload) {
    if (!payload.hasOwnProperty(key)) continue;
    var val = payload[key];
    if (!val || (typeof val === 'string' && val.trim() === '')) continue;

    // Skip internal GF fields
    if (key.indexOf('gform_') === 0) continue;

    var keyLower = key.toLowerCase();

    // Strip PII fields — don't send to Claude at all
    var isPII = false;
    for (var i = 0; i < PII_FIELDS.length; i++) {
      if (keyLower === PII_FIELDS[i] || keyLower.indexOf(PII_FIELDS[i]) !== -1) {
        isPII = true;
        break;
      }
    }
    if (isPII) continue;

    // Use friendly label if we have a mapping
    var label = FORM_FIELD_MAP[keyLower] || key;
    lines.push(label + ': ' + val);
  }

  return lines.join('\n');
}

// ── Confirmation Email ───────────────────────────────────────
/**
 * Sends a confirmation email to the original requestor with a link
 * to their Trello card so they can track status changes.
 * CCs social@pbcdemocraticparty.org on all confirmations.
 *
 * @param {string} recipientEmail - The original sender's email address
 * @param {string} cardTitle - The Trello card title
 * @param {string} cardUrl - The Trello card URL
 */
function sendConfirmationEmail(recipientEmail, cardTitle, cardUrl) {
  if (!recipientEmail || !cardUrl) return;

  var subject = 'PBC DEC — Your request has been received: ' + cardTitle;
  var body = 'Hello,\n\n'
    + 'Thank you for submitting your request. A task has been created and our team will begin working on it.\n\n'
    + 'You can track the status of your request here:\n'
    + cardUrl + '\n\n'
    + 'Want automatic updates? Create a free Trello account at https://trello.com/signup, '
    + 'then click "Watch" on the card to receive notifications when the status changes.\n\n'
    + 'For any questions, please reference the card link above and email social@pbcdemocraticparty.org.\n\n'
    + 'Thank you,\n'
    + 'PBC Democratic Party\n'
    + 'Communications Committee';

  try {
    MailApp.sendEmail({
      to: recipientEmail,
      cc: 'social@pbcdemocraticparty.org',
      subject: subject,
      body: body
    });
    Logger.log('Confirmation email sent to ' + recipientEmail + ' for card: ' + cardTitle);
  } catch (e) {
    Logger.log('Failed to send confirmation email to ' + recipientEmail + ': ' + e.message);
  }
}

// ── Trigger Setup ─────────────────────────────────────────────
/**
 * Run once to set up the Gmail polling trigger (every 10 minutes).
 */
function setupGmailTrigger() {
  // Remove existing triggers for pollGmail to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'pollGmail') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('pollGmail')
    .timeBased()
    .everyMinutes(10)
    .create();

  Logger.log('Gmail polling trigger created (every 10 min)');
}
