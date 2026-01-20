// ============ THEMES ============
// Theme definitions with preview colors for the gallery (v2.11.0)
export const THEMES = {
  // The Ship
  serenity: {
    name: 'Serenity',
    description: 'The ship - classic green terminal aesthetic',
    colors: {
      bgBase: '#050805',
      bgSurface: '#0d150d',
      bgElevated: '#0a100a',
      textPrimary: '#d5e5d5',
      textDim: '#7a8a7a',
      accentAmber: '#ffd23f',
      accentTeal: '#3bceac',
    },
  },

  // Main Characters
  malsBrowncoat: {
    name: "Mal's Browncoat",
    description: 'The Captain - dusty earth tones of rebellion',
    colors: {
      bgBase: '#0a0806',
      bgSurface: '#1a1510',
      bgElevated: '#14100c',
      textPrimary: '#e5d5c5',
      textDim: '#8a7a6a',
      accentAmber: '#d4a45a',
      accentTeal: '#7a9080',
    },
  },
  zoesWarrior: {
    name: "Zoe's Warrior",
    description: 'The Soldier - military green, strong and tactical',
    colors: {
      bgBase: '#060806',
      bgSurface: '#101510',
      bgElevated: '#0c100c',
      textPrimary: '#c5d5c5',
      textDim: '#6a7a6a',
      accentAmber: '#a5c55a',
      accentTeal: '#5a9570',
    },
  },
  washSky: {
    name: "Wash's Sky",
    description: 'The Pilot - ocean blue, flying through clouds',
    colors: {
      bgBase: '#050808',
      bgSurface: '#0d1518',
      bgElevated: '#0a1012',
      textPrimary: '#d5e5f0',
      textDim: '#7a8a95',
      accentAmber: '#7ac5e5',
      accentTeal: '#5aA5c5',
    },
  },
  kayleeFloweredDress: {
    name: "Kaylee's Flowered Dress",
    description: 'The Mechanic - pink and peach like her fancy ball dress',
    colors: {
      bgBase: '#0a0808',
      bgSurface: '#18100f',
      bgElevated: '#12100d',
      textPrimary: '#f0d5d5',
      textDim: '#957a7a',
      accentAmber: '#f5a5a5',
      accentTeal: '#e5c5a5',
    },
  },
  jaynesKnitCap: {
    name: "Jayne's Knit Cap",
    description: 'The Mercenary - rust orange like the hat his ma made',
    colors: {
      bgBase: '#0a0605',
      bgSurface: '#181008',
      bgElevated: '#120c06',
      textPrimary: '#f0d5c5',
      textDim: '#957a6a',
      accentAmber: '#ff8040',
      accentTeal: '#d5a575',
    },
  },
  inaraSilk: {
    name: "Inara's Silk",
    description: 'The Companion - deep purple and burgundy, elegant grace',
    colors: {
      bgBase: '#080508',
      bgSurface: '#140d14',
      bgElevated: '#100a10',
      textPrimary: '#e5d5e5',
      textDim: '#8a7a8a',
      accentAmber: '#c590c5',
      accentTeal: '#a580a5',
    },
  },
  simonsClinic: {
    name: "Simon's Clinic",
    description: 'The Doctor - clean blues and whites, precise and sterile',
    colors: {
      bgBase: '#080a0c',
      bgSurface: '#101418',
      bgElevated: '#0c1014',
      textPrimary: '#e5f0f5',
      textDim: '#8a9aa5',
      accentAmber: '#80c5e5',
      accentTeal: '#60a5c5',
    },
  },
  riversMind: {
    name: "River's Mind",
    description: 'The Psychic - dark ethereal purple, mysterious depths',
    colors: {
      bgBase: '#060508',
      bgSurface: '#0c0a10',
      bgElevated: '#0a080c',
      textPrimary: '#d5d0e5',
      textDim: '#7a758a',
      accentAmber: '#a080d5',
      accentTeal: '#8070b5',
    },
  },
  booksWisdom: {
    name: "Book's Wisdom",
    description: 'The Shepherd - calm grays, contemplative and peaceful',
    colors: {
      bgBase: '#080808',
      bgSurface: '#121212',
      bgElevated: '#0e0e0e',
      textPrimary: '#d5d5d5',
      textDim: '#7a7a7a',
      accentAmber: '#c5c5a5',
      accentTeal: '#95a5a5',
    },
  },

  // The Opposition
  reaverRed: {
    name: 'Reaver Red',
    description: 'The Nightmare - dark blood red, primal terror',
    colors: {
      bgBase: '#0a0505',
      bgSurface: '#150808',
      bgElevated: '#100606',
      textPrimary: '#f0d5d5',
      textDim: '#957a7a',
      accentAmber: '#ff4040',
      accentTeal: '#c55050',
    },
  },
  allianceWhite: {
    name: 'Alliance White',
    description: 'The Empire - clinical bright, cold and oppressive',
    colors: {
      bgBase: '#f5f5f5',
      bgSurface: '#e8e8e8',
      bgElevated: '#ffffff',
      textPrimary: '#1a1a1a',
      textDim: '#5a5a5a',
      accentAmber: '#b89000',
      accentTeal: '#2a7070',
    },
  },

  // Crossover Themes
  pipBoy: {
    name: 'Pip-Boy',
    description: 'Vault-Tec approved - classic green phosphor terminal',
    colors: {
      bgBase: '#0a1a0a',
      bgSurface: '#0f200f',
      bgElevated: '#0c180c',
      textPrimary: '#20ff20',
      textDim: '#10a010',
      accentAmber: '#30ff30',
      accentTeal: '#20c020',
    },
  },

  // Accessibility Themes
  highContrast: {
    name: 'High Contrast',
    description: 'Maximum readability',
    colors: {
      bgBase: '#000000',
      bgSurface: '#141414',
      bgElevated: '#0a0a0a',
      textPrimary: '#ffffff',
      textDim: '#a0a0a0',
      accentAmber: '#ffd23f',
      accentTeal: '#3bceac',
    },
  },
  amoled: {
    name: 'AMOLED Black',
    description: 'True black for OLED screens',
    colors: {
      bgBase: '#000000',
      bgSurface: '#0a0a0a',
      bgElevated: '#000000',
      textPrimary: '#ffffff',
      textDim: '#909090',
      accentAmber: '#ffd23f',
      accentTeal: '#3bceac',
    },
  },
  blackAndWhite: {
    name: 'Black and White',
    description: 'Simple high-contrast light theme',
    colors: {
      bgBase: '#ffffff',
      bgSurface: '#eeeeee',
      bgElevated: '#f5f5f5',
      textPrimary: '#000000',
      textDim: '#444444',
      accentAmber: '#000000',
      accentTeal: '#333333',
    },
  },
};
