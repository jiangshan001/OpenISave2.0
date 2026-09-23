import { Col, DatePicker, Form, Input, Modal, Row, Select, Switch } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';

import { MoneyInput } from '@/components/forms/MoneyInput';
import { useAccounts } from '@/hooks/useLedger';
import { useSaveGoal } from '@/hooks/useResources';
import type { CurrencyCode, Goal, GoalSelectionMode } from '@/types';
import { toApiDate } from '@/utils/dates';
import { CURRENCY_CODES, toMajor, toMinor } from '@/utils/money';
import { validateOrNull } from '@/utils/forms';
import { GoalAccountPicker } from './GoalAccountPicker';

interface FormValues {
  name: string;
  currency: CurrencyCode;
  has_target: boolean;
  target_amount?: number;
  deadline?: Dayjs | null;
  note?: string;
}

interface GoalFormModalProps {
  open: boolean;
  goal?: Goal | null;
  onClose: () => void;
}

export function GoalFormModal({ open, goal, onClose }: GoalFormModalProps) {
  const [form] = Form.useForm<FormValues>();
  const [currency, setCurrency] = useState<CurrencyCode>('CNY');
  const [hasTarget, setHasTarget] = useState(true);
  const [mode, setMode] = useState<GoalSelectionMode>('selected');
  const [selected, setSelected] = useState<number[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);

  const { data: accounts } = useAccounts();
  const save = useSaveGoal(onClose);
  const isEdit = Boolean(goal);

  useEffect(() => {
    if (!open) return;
    setAccountError(null);
    if (goal) {
      setCurrency(goal.currency);
      setHasTarget(goal.target_amount_minor !== null);
      setMode(goal.selection_mode);
      setSelected(goal.selection_mode === 'selected' ? goal.account_ids : []);
      form.setFieldsValue({
        name: goal.name,
        currency: goal.currency,
        has_target: goal.target_amount_minor !== null,
        target_amount: goal.target_amount_minor
          ? toMajor(goal.target_amount_minor, goal.currency)
          : undefined,
        deadline: goal.deadline ? dayjs(goal.deadline) : null,
        note: goal.note ?? undefined,
      });
    } else {
      setCurrency('CNY');
      setHasTarget(true);
      setMode('selected');
      setSelected([]);
      form.resetFields();
      form.setFieldsValue({ currency: 'CNY', has_target: true });
    }
  }, [open, goal, form]);

  const handleSubmit = async () => {
    if (mode === 'selected' && selected.length === 0) {
      setAccountError('Choose at least one account, or switch to all eligible accounts.');
      return;
    }
    setAccountError(null);
    const values = await validateOrNull(form);
    if (!values) return;
    save.mutate({
      id: goal?.id,
      payload: {
        name: values.name.trim(),
        currency: values.currency,
        target_amount_minor:
          values.has_target && values.target_amount
            ? toMinor(values.target_amount, values.currency)
            : null,
        deadline: values.deadline ? toApiDate(values.deadline) : null,
        selection_mode: mode,
        account_ids: mode === 'selected' ? selected : [],
        note: values.note?.trim() || null,
      },
    });
  };

  return (
    <Modal
      open={open}
      title={isEdit ? `Edit ${goal?.name}` : 'Add savings goal'}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={isEdit ? 'Save changes' : 'Create goal'}
      confirmLoading={save.isPending}
      width={640}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item
          name="name"
          label="Goal name"
          rules={[{ required: true, message: 'Give the goal a name' }]}
        >
          <Input placeholder="e.g. 三年存够50万" autoFocus />
        </Form.Item>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
              <Select
                onChange={(value: CurrencyCode) => setCurrency(value)}
                options={CURRENCY_CODES.map((code) => ({ value: code, label: code }))}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="has_target" label="Set a target" valuePropName="checked">
              <Switch onChange={setHasTarget} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="deadline" label="Deadline">
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Col>
        </Row>

        {hasTarget ? (
          <Form.Item
            name="target_amount"
            label="Target amount"
            rules={[
              { required: true, message: 'Enter a target' },
              {
                validator: (_, value) =>
                  value > 0 ? Promise.resolve() : Promise.reject(new Error('Must be above zero')),
              },
            ]}
          >
            <MoneyInput currency={currency} />
          </Form.Item>
        ) : null}

        <Form.Item
          label="Accounts funding this goal"
          required
          validateStatus={accountError ? 'error' : undefined}
          help={
            accountError ??
            'Goals only read balances. An account can fund several goals without duplicating money.'
          }
        >
          <GoalAccountPicker
            accounts={accounts ?? []}
            mode={mode}
            selected={selected}
            onModeChange={(next) => {
              setMode(next);
              setAccountError(null);
            }}
            onSelectedChange={(ids) => {
              setSelected(ids);
              if (ids.length > 0) setAccountError(null);
            }}
          />
        </Form.Item>

        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
