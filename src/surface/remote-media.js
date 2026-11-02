import { mediaMime } from '../business/media.js';

const maxFileSize = 100 * 1024 * 1024;
const validName = /^[a-f0-9-]+\.(jpg|jpeg|png|webp|gif|heic|mp4|mov)$/i;

export function createRemoteMediaLoader({ base, authorization, fetchMedia = fetch }) {
  const cached = new Map();
  return name => {
    if (!validName.test(name) || !mediaMime(name)) throw new Error(`Tên tệp không hợp lệ: ${name}`);
    if (!cached.has(name)) {
      const download = (async () => {
        let response;
        try {
          response = await fetchMedia(`${base}/uploads/${encodeURIComponent(name)}`, {
            headers: { Authorization: authorization }, signal: AbortSignal.timeout(120000)
          });
        } catch (error) { throw new Error(`Không tải được ${name} từ Railway: ${error.message}`); }
        if (!response.ok) throw new Error(`Không tải được ${name} từ Railway (HTTP ${response.status}).`);
        const type = response.headers.get('content-type')?.split(';')[0].trim();
        if (type !== mediaMime(name)) throw new Error(`Railway trả sai loại tệp ${name}.`);
        const reportedSize = Number(response.headers.get('content-length'));
        if (reportedSize > maxFileSize) throw new Error(`Tệp ${name} vượt quá 100 MB.`);
        const body = Buffer.from(await response.arrayBuffer());
        if (body.length > maxFileSize) throw new Error(`Tệp ${name} vượt quá 100 MB.`);
        return body;
      })();
      cached.set(name, download);
    }
    return cached.get(name);
  };
}
