import type { Category } from '@/types';

export interface CategoryTreeNode {
  category: Category;
  children: CategoryTreeNode[];
}

/** Build a nested tree from the flat list the API returns. */
export function buildTree(categories: Category[]): CategoryTreeNode[] {
  const byId = new Map<number, CategoryTreeNode>();
  categories.forEach((category) => byId.set(category.id, { category, children: [] }));

  const roots: CategoryTreeNode[] = [];
  byId.forEach((node) => {
    const parentId = node.category.parent_id;
    const parent = parentId !== null ? byId.get(parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });

  const sort = (nodes: CategoryTreeNode[]) => {
    nodes.sort(
      (a, b) =>
        a.category.sort_order - b.category.sort_order ||
        a.category.name.localeCompare(b.category.name),
    );
    nodes.forEach((node) => sort(node.children));
  };
  sort(roots);
  return roots;
}

/** Ids of a category and everything beneath it — invalid targets when moving. */
export function subtreeIds(categories: Category[], categoryId: number): Set<number> {
  const childrenOf = new Map<number, number[]>();
  categories.forEach((category) => {
    if (category.parent_id === null) return;
    const siblings = childrenOf.get(category.parent_id) ?? [];
    siblings.push(category.id);
    childrenOf.set(category.parent_id, siblings);
  });

  const collected = new Set<number>();
  const stack = [categoryId];
  while (stack.length > 0) {
    const current = stack.pop() as number;
    collected.add(current);
    (childrenOf.get(current) ?? []).forEach((child) => stack.push(child));
  }
  return collected;
}

export function depthOf(categories: Category[], categoryId: number | null): number {
  if (categoryId === null) return -1;
  const byId = new Map(categories.map((category) => [category.id, category]));
  let depth = 0;
  let current = byId.get(categoryId);
  while (current?.parent_id != null) {
    current = byId.get(current.parent_id);
    depth += 1;
  }
  return depth;
}

export const MAX_DEPTH = 3;

/** Parents a category may move under without breaking the depth limit or cycling. */
export function validParents(
  categories: Category[],
  moving: number | null,
): Category[] {
  const banned = moving !== null ? subtreeIds(categories, moving) : new Set<number>();
  return categories.filter((category) => {
    // Cannot move a category inside itself or its own descendants.
    if (banned.has(category.id)) return false;
    // Mirrors the backend rule: a child of this parent must stay within MAX_DEPTH.
    return depthOf(categories, category.id) + 1 < MAX_DEPTH;
  });
}
