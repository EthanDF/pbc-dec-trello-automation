/**
 * claude.gs — Claude API integration: extract card data + strip PII
 */

var CLAUDE_MODEL = 'claude-sonnet-4-6';
var CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Sends raw content to Claude for extraction and PII scrubbing.
 * Returns a structured object: { title, description, dueDate, label, checklist, requestor }
 *
 * @param {string} rawContent - The email body or form submission text
 * @param {string} source - "Via Email" or "Via Form"
 * @returns {Object} Parsed card data
 */
function extractCardData(rawContent, source) {
  var apiKey = getProp('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in Script Properties');

  var labelNames = Object.keys(CONFIG.LABELS).join(', ');

  var prompt = 'You are a task extraction assistant for the Palm Beach County Democratic Executive Committee (PBC DEC). '
    + 'Given the raw text of an incoming request, extract structured card data for a Trello task board.\n\n'
    + '## PII Rules — CRITICAL (board is PUBLIC)\n'
    + '- STRIP all street addresses, phone numbers, email addresses, IP addresses, and volunteer lists/rosters\n'
    + '- STRIP any user agent strings or technical metadata\n'
    + '- KEEP the requestor\'s first and last name only\n'
    + '- Do NOT include stripped PII in the description — omit it entirely\n\n'
    + '## Urgency Mapping\n'
    + 'If urgency is mentioned, map it to an additional label:\n'
    + '- "🔴 Urgent" or "ASAP" → include "Urgent" in the labels array\n'
    + '- "🟠 High" → include "Responsive" in the labels array\n'
    + '- "⚪ Normal" or "🔵 When possible" → no urgency label needed\n\n'
    + '## Platform/Category Mapping\n'
    + 'If platforms are mentioned, map them to labels:\n'
    + '- "Website" → "Website"\n'
    + '- "Social Media" → "Social Media"\n'
    + '- "Email" → "Email"\n'
    + '- "Solidarity Tech" or "Volunteer Management" → "Solidarity Tech"\n'
    + '- "Internal Infrastructure" or "admin, planning, research" → "Internal Infrastructure"\n'
    + '- "Events" → "General"\n\n'
    + '## Output\n'
    + 'Return ONLY valid JSON with these fields:\n'
    + '{\n'
    + '  "title": "Concise action-oriented title (imperative, under 80 chars)",\n'
    + '  "description": "Structured summary of the request with PII removed",\n'
    + '  "dueDate": "YYYY-MM-DD if a deadline is mentioned, otherwise null",\n'
    + '  "labels": ["Primary category label", "Optional urgency label"],\n'
    + '  "checklist": ["Action item 1", "Action item 2"],\n'
    + '  "requestor": "First Last name of the person making the request, or null",\n'
    + '  "attachmentUrls": ["URL1", "URL2"]\n'
    + '}\n\n'
    + '## Available Labels\n'
    + labelNames + '\n\n'
    + '## Notes\n'
    + '- If no clear action items, return an empty checklist array\n'
    + '- labels should be an array with 1-3 labels from the available set\n'
    + '- The title should describe what needs to be done, not who asked\n'
    + '- If the request mentions attachments or linked files/URLs, include them in attachmentUrls\n'
    + '- Preserve Google Docs/Forms/Drive URLs — those are resources, not PII\n\n'
    + '## Source\n'
    + 'This request came ' + source + '.\n\n'
    + '## Raw Content\n'
    + rawContent;

  var payload = {
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    messages: [
      { role: 'user', content: prompt }
    ]
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(CLAUDE_API_URL, options);
  var status = response.getResponseCode();
  var body = response.getContentText();

  if (status !== 200) {
    Logger.log('Claude API error (' + status + '): ' + body);

    // Notify on billing/credit issues (402 = payment required, 429 = rate limit/quota)
    if (status === 402 || status === 429) {
      notifyBillingError(status, body);
    }

    throw new Error('Claude API returned status ' + status);
  }

  var result = JSON.parse(body);
  var text = result.content[0].text;

  // Extract JSON from response (handle markdown code blocks)
  var jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  var jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    Logger.log('Failed to parse Claude response as JSON: ' + jsonStr);
    throw new Error('Claude returned invalid JSON');
  }
}

/**
 * Sends an email notification when the Claude API returns a billing or quota error.
 */
function notifyBillingError(statusCode, responseBody) {
  var recipient = Session.getActiveUser().getEmail();
  var subject = '⚠️ PBC DEC Trello Automation — Anthropic API Credit Alert';
  var message = 'The Claude API returned an error that may indicate your credits have run out.\n\n'
    + 'Status code: ' + statusCode + '\n'
    + 'Response: ' + responseBody + '\n\n'
    + 'New form submissions and emails will NOT be processed until this is resolved.\n\n'
    + 'To add credits: https://console.anthropic.com/settings/billing\n';

  try {
    MailApp.sendEmail(recipient, subject, message);
    Logger.log('Billing alert email sent to ' + recipient);
  } catch (e) {
    Logger.log('Failed to send billing alert email: ' + e.message);
  }
}
