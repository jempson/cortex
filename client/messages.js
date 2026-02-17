// Firefly-themed messages for Cortex
// "Can't stop the signal, Mal."

// ============ SUCCESS MESSAGES ============
export const SUCCESS = {
  generic: "Shiny!",
  messageSent: "Signal's away",
  messageUpdated: "Signal corrected",
  messageDeleted: "Signal scrubbed",
  waveCreated: "New signal on the cortex",
  waveUpdated: "Signal adjusted",
  waveDeleted: "Signal terminated",
  waveArchived: "Signal archived",
  waveRestored: "Signal restored",
  copied: "Coordinates locked",
  contactAdded: "New crew member aboard",
  contactRemoved: "Crew member departed",
  contactRequestSent: "Hail sent",
  contactRequestAccepted: "Welcome aboard!",
  joined: "You're in the air",
  left: "You've jumped ship",
  crewCreated: "Crew assembled",
  crewDeleted: "Crew disbanded",
  invitationSent: "Invitation transmitted",
  profileUpdated: "Ship's log updated",
  passwordChanged: "New codes set",
  shared: "Signal boosted",
  encrypted: "Running silent",
  reported: "Report filed with the Alliance",
  blocked: "Airlock sealed",
  unblocked: "Airlock opened",
  muted: "Comm channel muted",
  unmuted: "Comm channel open",
  pingSent: "Signal's away",
};

// ============ ERROR PREFIX ============
export const ERROR_PREFIX = "Gorram it!";

// ============ EMPTY STATES ============
export const EMPTY = {
  noWaves: "Cortex is quiet",
  noWavesCreate: "Cortex is quiet. Start a signal?",
  noNotifications: "Ain't heard a peep",
  noPings: "Nothing but black out here",
  noSearchResults: "Nothing in the black matches that",
  noContacts: "No crew yet",
  noCrews: "Flying solo",
  noGifs: "No captures found",
  noUsers: "No souls out here",
  noAlerts: "All quiet on the cortex",
  noSessions: "No active docking bays",
};

// ============ LOADING STATES ============
export const LOADING = {
  generic: "Spinning up...",
  searching: "Scanning the cortex...",
  sending: "Transmitting...",
  connecting: "Awaiting docking clearance...",
  loading: "Spinning up...",
  encrypting: "Running encryption protocols...",
  uploading: "Uploading cargo...",
};

// ============ CONFIRMATION BUTTONS ============
export const CONFIRM = {
  delete: "Let's be bad guys",
  destructive: "I aim to misbehave",
  cancel: "Belay that",
  leave: "Jump ship",
  confirm: "Do the job",
};

// ============ FOOTER TAGLINES ============
export const TAGLINES = [
  "Can't stop the signal",
  "Keep flying",
  "We're still flying, that's something",
  "You can't take the sky from me",
  "Find a crew, find a job, keep flying",
  "Privacy isn't a feature, it's a foundation",
  "The signal is strong",
  "Shiny",
  "I aim to misbehave",
  "We have done the impossible, and that makes us mighty",
];

// ============ HELPERS ============
export const getRandomTagline = () =>
  TAGLINES[Math.floor(Math.random() * TAGLINES.length)];

// Format error with Firefly prefix (for non-technical errors)
export const formatError = (message) =>
  `${ERROR_PREFIX} ${message}`;

// ============ ERROR MESSAGES ============
export const ERROR = {
  generic: "Something went sideways",
  connectionFailed: "Lost signal",
  serverUnreachable: "Ship's grounded",
  accessDenied: "Alliance interference",
  sendFailed: "Signal didn't make it",
  loadFailed: "Couldn't pull that in",
  uploadFailed: "Cargo didn't make it aboard",
  deleteFailed: "Couldn't jettison that",
  updateFailed: "Couldn't patch that through",
  encryptionFailed: "Encryption protocols failed",
  searchFailed: "Scanner's on the fritz",
  notFound: "Nothing out there in the black",
};

// ============ NOTIFICATION MESSAGES ============
export const NOTIFICATION = {
  waveDeleted: (title) => `"${title}" has gone dark`,
  keyRotated: "Encryption keys rotated",
  participantAdded: (name) => `${name} has boarded`,
  participantRemoved: "Crew member removed from wave",
  participantLeft: "A crew member jumped ship",
  participantKicked: "Crew member shown the airlock",
  addedToWave: (title) => `You've been pulled into "${title}"`,
  removedFromWave: (title) => `You've been pulled from "${title}"`,
  contactRequestReceived: (name) => `${name} wants to join your crew`,
  contactRequestAccepted: "Your hail was answered — welcome aboard!",
  contactRequestDeclined: "Your hail was declined",
  crewInviteReceived: (inviter, crew) => `${inviter} wants you in the ${crew} crew`,
  crewInviteAccepted: "Crew invite accepted",
  crewInviteDeclined: "Crew invite declined",
  federationRequest: (node) => `Federation request from ${node}`,
  watchPartyStarted: (name) => `${name} started a watch party`,
  watchPartyEnded: "Watch party ended",
};

// ============ CONFIRM DIALOG MESSAGES ============
export const CONFIRM_DIALOG = {
  deleteCrew: "Disband this crew? There's no putting it back together.",
  leaveCrew: "Jump ship from this crew? You'll need a new invite to get back.",
  leaveWave: "Leave this wave? You'll drift out of range.",
  deleteMessage: "Scrub this signal from the cortex? Can't unring that bell.",
  deleteBot: (name) => `Decommission ${name}? This can't be undone.`,
  regenerateKey: "Generate new encryption keys? Old messages stay locked with the old keys.",
  removeConnection: "Cut ties with this contact? The black is lonely.",
  removeFederationNode: "Cut this node loose from the network?",
  declineFederationRequest: "Decline this federation request?",
  deleteAlert: "Scrub this alert from the cortex?",
  unsubscribe: "Stop listening on this channel?",
  deleteCategory: "Jettison this category? Waves inside will go uncategorized.",
  removeParticipant: (name) => `Show ${name} the airlock?`,
  revokeAccess: (title) => `Revoke access to "${title}"? They'll be cut off.`,
  deleteWebhook: "Pull the plug on this webhook?",
  clearLocalData: "Wipe local data? You'll need to log in again.",
  deleteTheme: (name) => `Jettison the "${name}" theme? Can't get it back.`,
};

// ============ UI LABELS ============
export const UI_LABELS = {
  exportData: "Ship's Manifest",
  deleteAccount: "Abandon Ship",
  downloadData: "DOWNLOAD SHIP'S MANIFEST",
  exportingData: "PREPARING MANIFEST...",
};

// ============ ERROR BOUNDARY ============
export const ERROR_BOUNDARY = {
  title: "Gorram it! Something went sideways",
  retry: "Try to reboot",
  stackTrace: "Diagnostic readout",
};

// ============ OFFLINE INDICATOR ============
export const OFFLINE = {
  message: "LOST SIGNAL — Running on reserve power",
};
