/**
 * config.gs — Board configuration: IDs, label map, Gmail filter rules
 */

// ── Trello Board ──────────────────────────────────────────────
var CONFIG = {
  BOARD_ID: '6a1afd1059795ef74b7d2134',
  BACKLOG_LIST_ID: '6a1afd1059795ef74b7d214a',

  // Label name → Trello label ID
  LABELS: {
    'Email':                   '6a1afd1059795ef74b7d2151',
    'Social Media':            '6a1afd1059795ef74b7d2153',
    'Urgent':                  '6a1afd1059795ef74b7d2154',
    'Website':                 '6a1afd1059795ef74b7d2156',
    'Solidarity Tech':         '6a1afd1059795ef74b7d2155',
    'Internal Infrastructure': '6a1afe5455aab72a26a04a22',
    'Other':                   '6a1afd1059795ef74b7d2152',
    'General':                 '6a2b1eaaa156ddadfa59dd15',
    'Responsive':              '6a20d474bc16d560fdd36c88',
    'Proactive':               '6a20d47b995197edb5983d56',
    'TKJ':                     '6a20d4645106da50ad49de0d',
    'Design':                  '6a2b2153dbb3b433ebea1d48',
    'Content':                 '6a2b213d0600f064f9dbdd96'
  },

  // Gmail polling filter — adjust these to match your incoming requests
  GMAIL: {
    QUERY: 'label:task-requests',               // Gmail search query
    TASK_LABEL: 'task-requests'                 // removed after processing
  }
};

/**
 * Returns the Trello label ID for a given label name (case-insensitive).
 * Falls back to "Other" if no match.
 */
function getLabelId(labelName) {
  if (!labelName) return CONFIG.LABELS['Other'];
  for (var key in CONFIG.LABELS) {
    if (key.toLowerCase() === labelName.toLowerCase()) {
      return CONFIG.LABELS[key];
    }
  }
  return CONFIG.LABELS['Other'];
}

/**
 * Returns Script Properties helper for stored credentials.
 */
function getProp(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}
