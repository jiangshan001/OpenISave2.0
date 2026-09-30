import { Alert, Form, Input, Modal, Select } from 'antd';
import { useEffect } from 'react';

import { useSaveCategory } from '@/hooks/useResources';
import type { Category, CategoryKind } from '@/types';
import { validateOrNull } from '@/utils/forms';
import { validParents } from '../categoryTree';

interface FormValues {
  name: string;
  parent_id?: number | null;
}

interface CategoryFormModalProps {
  open: boolean;
  kind: CategoryKind;
  categories: Category[];
  /** Set when editing; null when creating. */
  category?: Category | null;
  /** Pre-selected parent when creating a subcategory. */
  defaultParentId?: number | null;
  onClose: () => void;
}

function labelFor(category: Category, all: Category[]): string {
  const parts = [category.name];
  let current = category;
  while (current.parent_id != null) {
    const parent = all.find((item) => item.id === current.parent_id);
    if (!parent) break;
    parts.unshift(parent.name);
    current = parent;
  }
  return parts.join(' · ');
}

export function CategoryFormModal({
  open,
  kind,
  categories,
  category,
  defaultParentId = null,
  onClose,
}: CategoryFormModalProps) {
  const [form] = Form.useForm<FormValues>();
  const save = useSaveCategory(onClose);
  const isEdit = Boolean(category);

  const parentOptions = validParents(categories, category?.id ?? null).map((item) => ({
    value: item.id,
    label: labelFor(item, categories),
  }));

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      name: category?.name ?? '',
      parent_id: category ? category.parent_id : defaultParentId,
    });
  }, [open, category, defaultParentId, form]);

  const handleSubmit = async () => {
    const values = await validateOrNull(form);
    if (!values) return;
    save.mutate({
      id: category?.id,
      payload: {
        name: values.name.trim(),
        kind,
        parent_id: values.parent_id ?? null,
      },
    });
  };

  return (
    <Modal
      open={open}
      title={isEdit ? `Edit ${category?.name}` : 'New category'}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={isEdit ? 'Save changes' : 'Create'}
      confirmLoading={save.isPending}
      width={480}
      destroyOnHidden
    >
      {isEdit && (category?.transaction_count ?? 0) > 0 ? (
        <Alert
          type="info"
          showIcon
          className="oi-form-alert"
          message={`Used by ${category?.transaction_count} transaction(s). Renaming updates them all; they keep their history either way.`}
        />
      ) : null}
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item
          name="name"
          label="Name"
          rules={[{ required: true, message: 'Give the category a name' }]}
        >
          <Input placeholder="e.g. Computer Accessories" autoFocus />
        </Form.Item>
        <Form.Item
          name="parent_id"
          label="Parent category"
          tooltip="Leave empty for a top-level category. Budgets set on a parent include its children."
        >
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Top level"
            options={parentOptions}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
