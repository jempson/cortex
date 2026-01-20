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
