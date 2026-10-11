import { beforeEach, describe, expect, it, vi } from 'vitest';

import { categoriesApi } from '@/api/resources';
import { makeCategory } from '@/test/fixtures';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
import { CategoryFormModal } from './CategoryFormModal';

describe('CategoryFormModal', () => {
  beforeEach(() => {
    vi.spyOn(categoriesApi, 'create').mockResolvedValue(makeCategory());
    vi.spyOn(categoriesApi, 'update').mockResolvedValue(makeCategory());
  });

  it('creates an explicit top-level parent', async () => {
    const user = setupUser();
    renderWithProviders(<CategoryFormModal open kind="expense" categories={[]} onClose={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Parent (top level)' })).toBeChecked();
    await user.type(screen.getByLabelText('Name'), 'Transport');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(categoriesApi.create).toHaveBeenCalledWith({
      name: 'Transport', kind: 'expense', parent_id: null,
    }));
  });

  it('creates a child and new parent in one request', async () => {
    const user = setupUser();
    renderWithProviders(<CategoryFormModal open kind="income" categories={[]} onClose={() => {}} />);
    await user.click(screen.getByRole('radio', { name: 'Child (subcategory)' }));
    await user.click(screen.getByRole('radio', { name: 'Create new parent' }));
    await user.type(screen.getByLabelText('Name'), 'Consulting');
    await user.type(screen.getByLabelText('New parent name'), 'Side projects');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(categoriesApi.create).toHaveBeenCalledWith({
      name: 'Consulting', kind: 'income', parent_id: null, new_parent_name: 'Side projects',
    }));
  });

  it('requires a parent for child mode, and discards it when switched to top level', async () => {
    const user = setupUser();
    renderWithProviders(<CategoryFormModal open kind="expense" categories={[]} onClose={() => {}} />);
    await user.click(screen.getByRole('radio', { name: 'Child (subcategory)' }));
    await user.type(screen.getByLabelText('Name'), 'Taxi');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Choose a parent category', { selector: '.ant-form-item-explain-error' })).toBeInTheDocument();
    expect(categoriesApi.create).not.toHaveBeenCalled();
    await user.click(screen.getByRole('radio', { name: 'Parent (top level)' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(categoriesApi.create).toHaveBeenCalledWith({
      name: 'Taxi', kind: 'expense', parent_id: null,
    }));
  });

  it('preserves the add-child shortcut', async () => {
    const user = setupUser();
    const root = makeCategory({ id: 9, name: 'Transport' });
    renderWithProviders(<CategoryFormModal open kind="expense" categories={[root]}
      defaultParentId={9} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Child (subcategory)' })).toBeChecked());
    await user.type(screen.getByLabelText('Name'), 'Taxi');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(categoriesApi.create).toHaveBeenCalledWith({
      name: 'Taxi', kind: 'expense', parent_id: 9,
    }));
  });

  it('edits a child without changing its parent', async () => {
    const user = setupUser();
    const root = makeCategory({ id: 9, name: 'Transport' });
    const child = makeCategory({ id: 10, name: 'Taxi', parent_id: 9, depth: 1 });
    renderWithProviders(<CategoryFormModal open kind="expense" categories={[root, child]}
      category={child} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Child (subcategory)' })).toBeChecked());
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Cab');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(categoriesApi.update).toHaveBeenCalledWith(10, { name: 'Cab', parent_id: 9 }));
  });
});
