import { Alert, Form, Input, Modal, Radio, Select } from 'antd';
import { useEffect, useState } from 'react';

import { useSaveCategory } from '@/hooks/useResources';
import type { Category, CategoryKind } from '@/types';
import { validateOrNull } from '@/utils/forms';
import { validParents } from '../categoryTree';

interface FormValues {
  name: string;
  parent_id?: number | null;
  new_parent_name?: string;
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
  const [level, setLevel] = useState<'parent' | 'child'>('parent');
  const [parentSource, setParentSource] = useState<'existing' | 'new'>('existing');
  const save = useSaveCategory(onClose);
  const isEdit = Boolean(category);

  const parentOptions = validParents(categories, category?.id ?? null)
    .filter((item) => item.is_active || item.id === category?.parent_id).map((item) => ({
    value: item.id,
    label: labelFor(item, categories),
  }));

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setLevel((category ? category.parent_id : defaultParentId) != null ? 'child' : 'parent');
    setParentSource('existing');
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
        parent_id: level === 'child' && parentSource === 'existing' ? values.parent_id : null,
        ...(level === 'child' && parentSource === 'new'
          ? { new_parent_name: values.new_parent_name?.trim() } : {}),
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
        <Form.Item label="Category level" required>
          <Radio.Group name="category-level" value={level} onChange={(event) => setLevel(event.target.value)}>
            <Radio.Button value="parent">Parent (top level)</Radio.Button>
            <Radio.Button value="child">Child (subcategory)</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item
          name="name"
          label="Name"
          rules={[{ required: true, whitespace: true, max: 80, message: 'Enter a name (1–80 characters)' }]}
        >
          <Input placeholder={level === 'parent' ? 'e.g. Transport' : 'e.g. Taxi'} maxLength={80} autoFocus />
        </Form.Item>
        {level === 'child' && !isEdit ? (
          <Form.Item label="Parent" required>
            <Radio.Group name="category-parent-source" value={parentSource} onChange={(event) => setParentSource(event.target.value)}>
              <Radio.Button value="existing">Choose existing</Radio.Button>
              <Radio.Button value="new">Create new parent</Radio.Button>
            </Radio.Group>
          </Form.Item>
        ) : null}
        {level === 'child' && parentSource === 'existing' ? <Form.Item
          name="parent_id"
          label="Parent category"
          tooltip="Budgets set on a parent include its children."
          rules={[{ required: true, message: 'Choose a parent category' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Choose a parent category"
            options={parentOptions}
          />
        </Form.Item> : null}
        {level === 'child' && parentSource === 'new' ? (
          <Form.Item name="new_parent_name" label="New parent name"
            extra="The parent and this subcategory will be created together."
            rules={[{ required: true, whitespace: true, max: 80, message: 'Enter a parent name (1–80 characters)' }]}>
            <Input placeholder="e.g. Transport" maxLength={80} />
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
}
