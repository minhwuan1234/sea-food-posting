import { AppError } from './errors.js';

export function cleanText(value, max = 20000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function validGroupUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(url.hostname)
      && /^\/groups\/[^/]+/.test(url.pathname);
  } catch { return false; }
}

export function requireGroup(name, url) {
  const cleanName = cleanText(name, 150);
  const cleanUrl = cleanText(url, 1000);
  if (!cleanName || !validGroupUrl(cleanUrl)) throw new AppError('Cần tên và link Facebook group hợp lệ.');
  return { name: cleanName, url: cleanUrl };
}

export function validImages(images) {
  return Array.isArray(images) && images.every(name => typeof name === 'string' && /^[a-f0-9-]+\.(jpg|jpeg|png|webp|gif|heic)$/i.test(name));
}
