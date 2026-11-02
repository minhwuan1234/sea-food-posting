export const mediaExtensions = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/gif': '.gif', 'image/heic': '.heic',
  'video/mp4': '.mp4', 'video/quicktime': '.mov'
};

export function mediaMime(name) {
  const extension = name.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase();
  return Object.entries(mediaExtensions).find(([, value]) => value === extension)?.[0]
    ?? (extension === '.jpeg' ? 'image/jpeg' : null);
}

export function isVideo(name) { return mediaMime(name)?.startsWith('video/') ?? false; }
