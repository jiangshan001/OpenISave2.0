import { Col, Form, Input, Modal, Row, Select } from 'antd';
import { useEffect, useMemo } from 'react';

import { useCategories } from '@/hooks/useResources';
import { useSaveRule } from '@/hooks/useImports';
import type { CategorisationRule, RuleMatchField, RuleMatchType } from '@/types/imports';
import { validateOrNull } from '@/utils/forms';
import { buildCategoryOptions } from '../../transactions/categoryOptions';

export const FIELD_OPTIONS: { value: RuleMatchField; label: string }[] = [
  { value: 'merchant', label: 'Merchant (交易对方)' },
  { value: 'product', label: 'Product (商品)' },
  { value: 'note', label: 'Note / remark' },
  { value: 'any_text', label: 'Description (any text)' },
  { value: 'source_type', label: 'Statement type (交易类型)' },
];

interface FormValues {
  name?: string;
  match_field: RuleMatchField;
  match_type: RuleMatchType;
  pattern: string;
  secondary_field?: RuleMatchField;
  secondary_pattern?: string;
  category_id: number;
}

interface RuleFormModalProps {
  open: boolean;
  rule?: CategorisationRule | null;
  onClose: () => void;
}

export function RuleFormModal({ open, rule, onClose }: RuleFormModalProps) {
  const [form] = Form.useForm<FormValues>();
  const save = useSaveRule(onClose);
  const { data: expense } = useCategories('expense');
  const { data: income } = useCategories('income');

  const categoryOptions = useMemo(
    () => [
      { label: 'Expense', options: buildCategoryOptions(expense ?? []) },
      { label: 'Income', options: buildCategoryOptions(income ?? []) },
    ],
    [expense, income],
  );

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      rule
        ? {
            name: rule.name,
            match_field: rule.match_field,
            match_type: rule.match_type,
            pattern: rule.pattern,
            secondary_field: rule.secondary_field ?? undefined,
            secondary_pattern: rule.secondary_pattern ?? undefined,
            category_id: rule.category_id,
          }
        : { match_field: 'merchant', match_type: 'contains' },
    );
  }, [open, rule, form]);

  const handleSubmit = async () => {
    const values = await validateOrNull(form);
    if (!values) return;
    save.mutate({
      id: rule?.id,
      payload: {
        name: values.name?.trim() || null,
        match_field: values.match_field,
        match_type: values.match_type,
        pattern: values.pattern.trim(),
        secondary_field: values.secondary_pattern?.trim() ? (values.secondary_field ?? null) : null,
        secondary_pattern: values.secondary_pattern?.trim() || null,
        category_id: values.category_id,
      },
    });
  };

  return (
    <Modal
      open={open}
      title={rule ? 'Edit rule' : 'New categorisation rule'}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={rule ? 'Save' : 'Create rule'}
      confirmLoading={save.isPending}
      width={620}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Row gutter={12}>
          <Col span={10}>
            <Form.Item name="match_field" label="When" rules={[{ required: true }]}>
              <Select options={FIELD_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="match_type" label="Match" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'contains', label: 'contains' },
                  { value: 'exact', label: 'is exactly' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="pattern" label="Text" rules={[{ required: true, message: 'Enter text' }]}>
              <Input placeholder="e.g. TESCO" maxLength={200} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={10}>
            <Form.Item name="secondary_field" label="And (optional)">
              <Select allowClear options={FIELD_OPTIONS} placeholder="Another field" />
            </Form.Item>
          </Col>
          <Col span={14}>
            <Form.Item name="secondary_pattern" label="contains">
              <Input placeholder="e.g. 机票" maxLength={200} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          name="category_id"
          label="File under"
          rules={[{ required: true, message: 'Choose a category' }]}
          extra="Expense categories apply to money out, income categories to money in."
        >
          <Select showSearch optionFilterProp="label" options={categoryOptions} />
        </Form.Item>
        <Form.Item name="name" label="Name">
          <Input placeholder="Optional; defaults to the condition" maxLength={120} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
