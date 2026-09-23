import type { Category } from '@/types';

export interface CategorySelectOption {
  value: number;
  label: string;
}

/**
 * Flatten the category tree into select options in depth-first order, each
 * labelled with its full path, e.g. "Lifestyle · Electronics · Accessories".
 *
 * A category whose parent is missing from the list (for example because the
 * parent is archived and filtered out) is still offered, labelled with the
 * part of its path that is known.
 */
export function buildCategoryOptions(categories: Category[]): CategorySelectOption[] {
  const ids = new Set(categories.map((category) => category.id));
  const childrenOf = new Map<number | null, Category[]>();
  categories.forEach((category) => {
    const key = category.parent_id !== null && ids.has(category.parent_id) ? category.parent_id : null;
    const siblings = childrenOf.get(key) ?? [];
    siblings.push(category);
    childrenOf.set(key, siblings);
  });
  childrenOf.forEach((siblings) =>
    siblings.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
  );

  const options: CategorySelectOption[] = [];
  const visit = (parentId: number | null, path: string[]) => {
    (childrenOf.get(parentId) ?? []).forEach((category) => {
      const labelPath = [...path, category.name];
      options.push({ value: category.id, label: labelPath.join(' · ') });
      visit(category.id, labelPath);
    });
  };
  visit(null, []);
  return options;
}

export function parentCategories(categories: Category[]): Category[] {
  return categories.filter((category) => category.parent_id === null);
}
