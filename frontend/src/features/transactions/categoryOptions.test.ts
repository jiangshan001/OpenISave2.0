import { describe, expect, it } from 'vitest';

import { makeCategory } from '@/test/fixtures';
import { buildCategoryOptions } from './categoryOptions';

describe('buildCategoryOptions', () => {
  it('labels every level with its full path, depth first', () => {
    const options = buildCategoryOptions([
      makeCategory({ id: 1, name: 'Lifestyle' }),
      makeCategory({ id: 2, name: 'Electronics', parent_id: 1 }),
      makeCategory({ id: 3, name: 'Computer Accessories', parent_id: 2 }),
      makeCategory({ id: 4, name: 'Food', sort_order: 1 }),
    ]);
    expect(options).toEqual([
      { value: 1, label: 'Lifestyle' },
      { value: 2, label: 'Lifestyle · Electronics' },
      { value: 3, label: 'Lifestyle · Electronics · Computer Accessories' },
      { value: 4, label: 'Food' },
    ]);
  });

  it('still offers a category whose parent is not in the list', () => {
    const options = buildCategoryOptions([
      makeCategory({ id: 3, name: 'Computer Accessories', parent_id: 2 }),
    ]);
    expect(options).toEqual([{ value: 3, label: 'Computer Accessories' }]);
  });
});
