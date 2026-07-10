/**
 * trello.gs — Trello REST API: create card, add checklist, assign label
 */

var TRELLO_API_BASE = 'https://api.trello.com/1';

/**
 * Creates a Trello card in the Backlog list with the extracted data.
 *
 * @param {Object} cardData - Output from extractCardData()
 * @param {string} source - "Via Email" or "Via Form"
 * @returns {string} The created card's ID
 */
function createTrelloCard(cardData, source) {
  var apiKey = getProp('TRELLO_API_KEY');
  var token = getProp('TRELLO_TOKEN');
  if (!apiKey || !token) throw new Error('Trello credentials not set in Script Properties');

  // Handle multiple labels (new format) or single label (legacy)
  var labelIds = [];
  if (cardData.labels && Array.isArray(cardData.labels)) {
    for (var i = 0; i < cardData.labels.length; i++) {
      labelIds.push(getLabelId(cardData.labels[i]));
    }
  } else if (cardData.label) {
    labelIds.push(getLabelId(cardData.label));
  }

  // Build description with source tag and requestor
  var desc = cardData.description || '';
  desc += '\n\n---\n';
  desc += '**Source:** ' + source + '\n';
  if (cardData.requestor) {
    desc += '**Requested by:** ' + cardData.requestor + '\n';
  }

  var cardParams = {
    key: apiKey,
    token: token,
    idList: CONFIG.BACKLOG_LIST_ID,
    name: cardData.title,
    desc: desc,
    idLabels: labelIds.join(','),
    pos: 'bottom'
  };

  if (cardData.dueDate) {
    cardParams.due = cardData.dueDate;
  }

  var response = UrlFetchApp.fetch(TRELLO_API_BASE + '/cards', {
    method: 'post',
    payload: cardParams,
    muteHttpExceptions: true
  });

  var status = response.getResponseCode();
  if (status !== 200) {
    Logger.log('Trello create card error (' + status + '): ' + response.getContentText());
    throw new Error('Trello API returned status ' + status);
  }

  var card = JSON.parse(response.getContentText());
  Logger.log('Created card: ' + card.id + ' — ' + card.name);

  // Add checklist if there are action items
  if (cardData.checklist && cardData.checklist.length > 0) {
    addChecklist(card.id, cardData.checklist, apiKey, token);
  }

  // Attach URLs if any (Google Docs, flyers, etc.)
  if (cardData.attachmentUrls && cardData.attachmentUrls.length > 0) {
    addAttachments(card.id, cardData.attachmentUrls, apiKey, token);
  }

  // Auto-subscribe the API token owner so the team gets notifications
  subscribeToCard(card.id, apiKey, token);

  return { id: card.id, url: card.shortUrl || card.url };
}

/**
 * Adds a checklist with items to an existing card.
 */
function addChecklist(cardId, items, apiKey, token) {
  // Create the checklist
  var checklistResp = UrlFetchApp.fetch(TRELLO_API_BASE + '/checklists', {
    method: 'post',
    payload: {
      key: apiKey,
      token: token,
      idCard: cardId,
      name: 'Action Items'
    },
    muteHttpExceptions: true
  });

  if (checklistResp.getResponseCode() !== 200) {
    Logger.log('Failed to create checklist: ' + checklistResp.getContentText());
    return;
  }

  var checklist = JSON.parse(checklistResp.getContentText());

  // Add each item
  for (var i = 0; i < items.length; i++) {
    UrlFetchApp.fetch(TRELLO_API_BASE + '/checklists/' + checklist.id + '/checkItems', {
      method: 'post',
      payload: {
        key: apiKey,
        token: token,
        name: items[i]
      },
      muteHttpExceptions: true
    });
  }

  Logger.log('Added ' + items.length + ' checklist items to card ' + cardId);
}

/**
 * Subscribes the API token owner to a card so the team receives
 * notifications when the card's status changes.
 */
function subscribeToCard(cardId, apiKey, token) {
  var response = UrlFetchApp.fetch(TRELLO_API_BASE + '/cards/' + cardId + '/subscribed', {
    method: 'put',
    payload: {
      key: apiKey,
      token: token,
      value: true
    },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() === 200) {
    Logger.log('Subscribed to card ' + cardId);
  } else {
    Logger.log('Failed to subscribe to card ' + cardId + ': ' + response.getContentText());
  }
}

/**
 * Attaches URLs to an existing card (flyers, Google Docs, etc.).
 */
function addAttachments(cardId, urls, apiKey, token) {
  for (var i = 0; i < urls.length; i++) {
    UrlFetchApp.fetch(TRELLO_API_BASE + '/cards/' + cardId + '/attachments', {
      method: 'post',
      payload: {
        key: apiKey,
        token: token,
        url: urls[i]
      },
      muteHttpExceptions: true
    });
  }
  Logger.log('Attached ' + urls.length + ' URLs to card ' + cardId);
}
