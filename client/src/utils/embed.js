// ============ EMBED UTILITIES ============

// Platform icons and colors
export const EMBED_PLATFORMS = {
  youtube: { icon: '▶', color: '#ff0000', name: 'YouTube' },
  vimeo: { icon: '▶', color: '#1ab7ea', name: 'Vimeo' },
  spotify: { icon: '🎵', color: '#1db954', name: 'Spotify' },
  tiktok: { icon: '♪', color: '#ff0050', name: 'TikTok' },
  twitter: { icon: '𝕏', color: '#1da1f2', name: 'X/Twitter' },
  soundcloud: { icon: '☁', color: '#ff5500', name: 'SoundCloud' },
  tenor: { icon: '🎬', color: '#5856d6', name: 'Tenor' },
  giphy: { icon: '🎬', color: '#00ff99', name: 'GIPHY' },
};

// URL patterns for detecting embeddable content (mirrors server)
export const EMBED_URL_PATTERNS = {
  youtube: [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i,
    /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/i,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i,
  ],
  vimeo: [
    /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/i,
  ],
  spotify: [
    /(?:https?:\/\/)?open\.spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/i,
  ],
  tiktok: [
    /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/(\d+)/i,
    /(?:https?:\/\/)?(?:vm\.)?tiktok\.com\/([a-zA-Z0-9]+)/i,
  ],
  twitter: [
    /(?:https?:\/\/)?(?:www\.)?(twitter|x)\.com\/\w+\/status\/(\d+)/i,
  ],
  soundcloud: [
    /(?:https?:\/\/)?(?:www\.)?soundcloud\.com\/[\w-]+\/[\w-]+/i,
  ],
  tenor: [
    /(?:https?:\/\/)?(?:www\.)?tenor\.com\/view\/[\w-]+-(\d+)/i,
    /(?:https?:\/\/)?tenor\.com\/([a-zA-Z0-9]+)\.gif/i,
  ],
  giphy: [
    /(?:https?:\/\/)?(?:www\.)?giphy\.com\/gifs\/(?:[\w-]+-)*([a-zA-Z0-9]+)/i,
    /(?:https?:\/\/)?gph\.is\/([a-zA-Z0-9]+)/i,
  ],
};

// Detect embed URLs in text (skip image URLs already embedded as <img> tags)
export function detectEmbedUrls(text) {
  const embeds = [];
  const seenUrls = new Set(); // Prevent duplicate embeds

  // Collect URLs already embedded as <img> tags (we don't want to re-embed images)
  const imgSrcRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  const alreadyEmbeddedImages = new Set();
  let imgMatch;
  while ((imgMatch = imgSrcRegex.exec(text)) !== null) {
    alreadyEmbeddedImages.add(imgMatch[1]);
  }

  // Find all URLs in the text (including those in <a> tags - we want to embed videos)
  const urlRegex = /https?:\/\/[^\s<>"]+/gi;
  const urls = text.match(urlRegex) || [];

  for (const url of urls) {
    // Skip URLs already embedded as images
    if (alreadyEmbeddedImages.has(url)) continue;
    // Skip duplicate URLs
    if (seenUrls.has(url)) continue;

    for (const [platform, patterns] of Object.entries(EMBED_URL_PATTERNS)) {
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
          const embed = { platform, url, contentId: match[1] };

          // Handle Spotify's type/id format
          if (platform === 'spotify' && match[2]) {
            embed.contentType = match[1];
            embed.contentId = match[2];
          }

          // Generate embed URLs
          if (platform === 'youtube') {
            embed.embedUrl = `https://www.youtube.com/embed/${embed.contentId}?rel=0`;
            embed.thumbnail = `https://img.youtube.com/vi/${embed.contentId}/hqdefault.jpg`;
          } else if (platform === 'vimeo') {
            embed.embedUrl = `https://player.vimeo.com/video/${embed.contentId}`;
          } else if (platform === 'spotify') {
            embed.embedUrl = `https://open.spotify.com/embed/${embed.contentType}/${embed.contentId}`;
          }

          embeds.push(embed);
          seenUrls.add(url);
          break;
        }
      }
    }
  }

  return embeds;
}
