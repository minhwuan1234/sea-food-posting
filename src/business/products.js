import { randomUUID } from 'node:crypto';
import { AppError, requireFound } from './errors.js';
import { cleanText, validImages } from './validation.js';

const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/heic': '.heic' };

export function createProductsService({ state, persist, saveImage, findRegion }) {
  const find = id => state.products.find(item => item.id === id);
  return {
    list() { return state.products.map(product => ({ id: product.id, name: product.name, coverImage: product.images[0] ?? null, imageCount: product.images.length, variantCount: Object.keys(product.variants ?? {}).length })); },
    get(id) { return requireFound(find(id), 'Không tìm thấy mặt hàng.'); },
    async create(input) {
      const name = cleanText(input.name, 150);
      const caption = cleanText(input.caption);
      if (!name || !caption) throw new AppError('Cần tên mặt hàng và caption.');
      const product = { id: randomUUID(), name, caption, images: [], variants: {}, createdAt: new Date().toISOString() };
      state.products.push(product); await persist(); return product;
    },
    async update(id, input) {
      const product = requireFound(find(id), 'Không tìm thấy mặt hàng.');
      const name = cleanText(input.name, 150);
      const caption = cleanText(input.caption);
      if (!name || !caption) throw new AppError('Cần tên mặt hàng và caption.');
      product.name = name; product.caption = caption; await persist(); return product;
    },
    async remove(id) {
      const index = state.products.findIndex(item => item.id === id);
      if (index < 0) throw new AppError('Không tìm thấy mặt hàng.', 404);
      state.products.splice(index, 1); await persist();
    },
    async addImages(id, files, regionId) {
      const product = requireFound(find(id), 'Không tìm thấy mặt hàng.');
      if (regionId) requireFound(findRegion(regionId), 'Không tìm thấy khu vực.');
      if (!files?.length) throw new AppError('Chọn ảnh JPG, PNG, WebP, GIF hoặc HEIC.');
      const names = [];
      for (const file of files) {
        const extension = extensions[file.mimetype];
        if (!extension) throw new AppError('Định dạng ảnh không được hỗ trợ.');
        const name = `${randomUUID()}${extension}`;
        await saveImage(name, file.mimetype, file.buffer);
        names.push(name);
      }
      if (regionId) {
        const variant = product.variants[regionId] ?? { caption: '', images: [] };
        variant.images.push(...names); product.variants[regionId] = variant;
      } else product.images.push(...names);
      await persist(); return product;
    },
    async setImages(id, input) {
      const product = requireFound(find(id), 'Không tìm thấy mặt hàng.');
      if (!validImages(input.images)) throw new AppError('Danh sách ảnh không hợp lệ.');
      const regionId = input.regionId;
      const current = regionId ? product.variants[regionId]?.images ?? [] : product.images;
      if (!input.images.every(name => current.includes(name))) throw new AppError('Ảnh không thuộc mặt hàng này.');
      if (regionId) {
        requireFound(findRegion(regionId), 'Không tìm thấy khu vực.');
        const variant = product.variants[regionId] ?? { caption: '', images: [] };
        variant.images = input.images; product.variants[regionId] = variant;
      } else product.images = input.images;
      await persist(); return product;
    },
    async setRegionCaption(id, regionId, input) {
      const product = requireFound(find(id), 'Không tìm thấy mặt hàng.');
      requireFound(findRegion(regionId), 'Không tìm thấy khu vực.');
      const variant = product.variants[regionId] ?? { caption: '', images: [] };
      variant.caption = cleanText(input.caption);
      product.variants[regionId] = variant;
      await persist(); return product;
    }
  };
}
