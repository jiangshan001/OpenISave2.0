import { Col, DatePicker, Form, InputNumber, Radio, Row, Select } from 'antd';

import type { RecurringFrequency } from '@/types/recurring';
import { DAY_OF_MONTH_OPTIONS } from '../recurringFormat';

const UNIT_LABEL: Record<RecurringFrequency, string> = {
  weekly: 'week(s)',
  monthly: 'month(s)',
  yearly: 'year(s)',
};

/** Schedule and execution-mode fields of the recurring form. */
export function ScheduleFields({ frequency }: { frequency: RecurringFrequency }) {
  return (
    <>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item name="frequency" label="Repeats" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
                { value: 'yearly', label: 'Yearly' },
              ]}
            />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="interval" label="Every" rules={[{ required: true }]}>
            <InputNumber min={1} max={366} className="oi-full" addonAfter={UNIT_LABEL[frequency]} />
          </Form.Item>
        </Col>
        <Col span={8}>
          {frequency === 'monthly' ? (
            <Form.Item
              name="day_of_month"
              label="On day"
              tooltip="Short months use their last day, e.g. the 31st falls on 30 April and 28 February."
            >
              <Select options={DAY_OF_MONTH_OPTIONS} />
            </Form.Item>
          ) : null}
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="start_date"
            label="Starts"
            rules={[{ required: true, message: 'Pick a start date' }]}
            extra="Occurrences since this date that are already due will be listed for review."
          >
            <DatePicker className="oi-full" format="DD MMM YYYY" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="end_date" label="Ends" extra="Leave empty to repeat indefinitely.">
            <DatePicker className="oi-full" format="DD MMM YYYY" allowClear />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item name="mode" label="When it falls due">
        <Radio.Group>
          <Radio value="review">
            Review first <span className="oi-muted">— show it as due; I confirm each one</span>
          </Radio>
          <Radio value="automatic">
            Automatic <span className="oi-muted">— record it without asking</span>
          </Radio>
        </Radio.Group>
      </Form.Item>
    </>
  );
}
