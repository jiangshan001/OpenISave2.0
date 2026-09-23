import { describe, expect, it, vi, beforeEach } from 'vitest';

import { categoriesApi } from '@/api/resources';
import { makeCategory } from '@/test/fixtures';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
import { buildTree, subtreeIds, validParents } from '../categoryTree';
import { CategoryTree } from './CategoryTree';

const FLAT = [
  makeCategory({ id: 1, name: 'Lifestyle', depth: 0, subtree_transaction_count: 4 }),
  makeCategory({ id: 2, name: 'Electronics', parent_id: 1, depth: 1, subtree_transaction_count: 4 }),
  makeCategory({
    id: 3,
    name: 'Computer Accessories',
    parent_id: 2,
    depth: 2,
    transaction_count: 4,
    subtree_transaction_count: 4,
  }),
  makeCategory({ id: 4, name: 'Unused', depth: 0 }),
];

describe('category tree helpers', () => {
  it('nests the flat list', () => {
    const tree = buildTree(FLAT);
    const lifestyle = tree.find((node) => node.category.name === 'Lifestyle');
    expect(lifestyle?.children).toHaveLength(1);
    expect(lifestyle?.children[0].children[0].category.name).toBe('Computer Accessories');
  });

  it('collects a subtree', () => {
    expect(subtreeIds(FLAT, 1)).toEqual(new Set([1, 2, 3]));
  });

  it('never offers a category its own subtree as a parent', () => {
    const options = validParents(FLAT, 1).map((item) => item.id);
    expect(options).not.toContain(1);
    expect(options).not.toContain(2);
    expect(options).not.toContain(3);
    expect(options).toContain(4);
  });

  it('refuses parents that would breach the depth limit', () => {
    const options = validParents(FLAT, null).map((item) => item.id);
    // Depth 2 is the deepest allowed, so it cannot take children.
    expect(options).not.toContain(3);
    expect(options).toContain(1);
    expect(options).toContain(2);
  });
});

describe('CategoryTree', () => {
  beforeEach(() => {
    vi.spyOn(categoriesApi, 'archive').mockResolvedValue(makeCategory({ is_active: false }));
    vi.spyOn(categoriesApi, 'remove').mockResolvedValue(undefined);
  });

  it('renders the hierarchy with usage counts', () => {
    renderWithProviders(
      <CategoryTree nodes={buildTree(FLAT)} onEdit={() => {}} onAddChild={() => {}} />,
    );
    expect(screen.getByText('Lifestyle')).toBeInTheDocument();
    expect(screen.getByText('Computer Accessories')).toBeInTheDocument();
    expect(screen.getByText(/4 transactions/)).toBeInTheDocument();
    expect(screen.getAllByText('not used').length).toBeGreaterThan(0);
  });

  it('marks archived categories', () => {
    const archived = [makeCategory({ id: 9, name: 'Old', is_active: false })];
    renderWithProviders(
      <CategoryTree nodes={buildTree(archived)} onEdit={() => {}} onAddChild={() => {}} />,
    );
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('archives a category rather than deleting it when in use', async () => {
    const user = setupUser();
    renderWithProviders(
      <CategoryTree nodes={buildTree(FLAT)} onEdit={() => {}} onAddChild={() => {}} />,
    );

    // A category with transactions behind it cannot be destroyed.
    expect(
      screen.getByRole('button', { name: 'Delete Computer Accessories' }),
    ).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Archive Computer Accessories' }));
    await waitFor(() => expect(categoriesApi.archive).toHaveBeenCalledWith(3, true));
  });

  it('allows deleting a category nothing references', async () => {
    const user = setupUser();
    renderWithProviders(
      <CategoryTree nodes={buildTree(FLAT)} onEdit={() => {}} onAddChild={() => {}} />,
    );

    const deleteButton = screen.getByRole('button', { name: 'Delete Unused' });
    expect(deleteButton).not.toBeDisabled();

    await user.click(deleteButton);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(categoriesApi.remove).toHaveBeenCalledWith(4));
  });

  it('offers a subcategory action only where nesting is still allowed', () => {
    renderWithProviders(
      <CategoryTree nodes={buildTree(FLAT)} onEdit={() => {}} onAddChild={() => {}} />,
    );
    expect(
      screen.getByRole('button', { name: 'Add a subcategory under Lifestyle' }),
    ).toBeInTheDocument();
    // Computer Accessories sits at the deepest allowed level.
    expect(
      screen.queryByRole('button', { name: 'Add a subcategory under Computer Accessories' }),
    ).not.toBeInTheDocument();
  });
});
