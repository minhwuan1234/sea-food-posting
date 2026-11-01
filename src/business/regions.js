import { randomUUID } from 'node:crypto';
import { AppError, requireFound } from './errors.js';
import { cleanText, requireGroup } from './validation.js';

export function createRegionsService({ state, persist }) {
  const find = id => state.regions.find(item => item.id === id);
  return {
    find,
    list() { return state.regions.map(region => ({ id: region.id, name: region.name, groupCount: region.groups.length })); },
    get(id) { return requireFound(find(id), 'Không tìm thấy khu vực.'); },
    async create(input) {
      const name = cleanText(input.name, 150);
      if (!name) throw new AppError('Cần tên khu vực.');
      const region = { id: randomUUID(), name, groups: [] };
      state.regions.push(region); await persist(); return region;
    },
    async update(id, input) {
      const region = requireFound(find(id), 'Không tìm thấy khu vực.');
      const name = cleanText(input.name, 150);
      if (!name) throw new AppError('Cần tên khu vực.');
      region.name = name; await persist(); return region;
    },
    async remove(id) {
      const index = state.regions.findIndex(item => item.id === id);
      if (index < 0) throw new AppError('Không tìm thấy khu vực.', 404);
      state.regions.splice(index, 1);
      for (const product of state.products) delete product.variants[id];
      await persist();
    },
    async addGroup(id, input) {
      const region = requireFound(find(id), 'Không tìm thấy khu vực.');
      const { name, url } = requireGroup(input.name, input.url);
      if (region.groups.some(group => group.url === url)) throw new AppError('Group đã có trong khu vực này.');
      const group = { id: randomUUID(), name, url };
      region.groups.push(group); await persist(); return group;
    },
    async updateGroup(id, groupId, input) {
      const region = requireFound(find(id), 'Không tìm thấy khu vực.');
      const group = requireFound(region.groups.find(item => item.id === groupId), 'Không tìm thấy group.');
      const { name, url } = requireGroup(input.name, input.url);
      if (region.groups.some(item => item.id !== groupId && item.url === url)) throw new AppError('Group đã có trong khu vực này.');
      group.name = name; group.url = url; await persist(); return group;
    },
    async removeGroup(id, groupId) {
      const region = requireFound(find(id), 'Không tìm thấy khu vực.');
      const index = region.groups.findIndex(item => item.id === groupId);
      if (index < 0) throw new AppError('Không tìm thấy group.', 404);
      region.groups.splice(index, 1); await persist();
    }
  };
}
