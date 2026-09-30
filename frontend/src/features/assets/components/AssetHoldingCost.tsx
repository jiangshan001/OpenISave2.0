import { Card, Col, Row, Tooltip } from 'antd';

import type { Asset } from '@/types/asset';
import { formatMoney } from '@/utils/money';

/**
 * Presents the holding-cost figures the backend calculated. Nothing is
 * recomputed here — the definitions live in one place, in asset_service.py.
 */
export function AssetHoldingCost({ asset }: { asset: Asset }) {
  const held = asset.status === 'holding';
  const currency = asset.purchase_currency;

  return (
    <Card title="What it costs to own" variant="borderless">
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <div className="oi-stat-label">Purchase price</div>
          <div className="oi-money-lg">
            {formatMoney(asset.purchase_price_minor, currency)}
          </div>
        </Col>
        <Col xs={12} md={6}>
          <div className="oi-stat-label">
            <Tooltip title="Whole days between the purchase date and today (or the sale date), at least one.">
              Days held
            </Tooltip>
          </div>
          <div className="oi-money-lg">{asset.days_held.toLocaleString()}</div>
        </Col>

        {held ? (
          <Col xs={12} md={6}>
            <div className="oi-stat-label">
              <Tooltip title="Purchase price divided by days held.">Cost per day</Tooltip>
            </div>
            <div className="oi-money-lg">
              {formatMoney(asset.holding_cost_per_day_minor, currency)}
            </div>
          </Col>
        ) : (
          <>
            <Col xs={12} md={6}>
              <div className="oi-stat-label">
                <Tooltip title="Purchase price minus what you sold it for.">Net cost</Tooltip>
              </div>
              <div
                className={`oi-money-lg ${(asset.net_cost_minor ?? 0) < 0 ? 'oi-positive' : ''}`}
              >
                {formatMoney(asset.net_cost_minor, currency)}
              </div>
            </Col>
            <Col xs={12} md={6}>
              <div className="oi-stat-label">
                <Tooltip title="Net cost divided by the days you owned it.">
                  Effective cost per day
                </Tooltip>
              </div>
              <div className="oi-money-lg">
                {formatMoney(asset.effective_cost_per_day_minor, currency)}
              </div>
            </Col>
          </>
        )}

        {held ? (
          <Col xs={12} md={6}>
            <div className="oi-stat-label">Current value</div>
            <div className="oi-money-lg">
              {asset.current_value
                ? formatMoney(asset.current_value.value_minor, asset.current_value.currency)
                : '—'}
            </div>
            {asset.current_value?.source === 'purchase_price' ? (
              <div className="oi-meta">
                using purchase value
              </div>
            ) : null}
          </Col>
        ) : (
          <Col xs={12} md={6}>
            <div className="oi-stat-label">Sold for</div>
            <div className="oi-money-lg">
              {formatMoney(asset.sale_price_minor, asset.sale_currency ?? currency)}
            </div>
          </Col>
        )}
      </Row>
    </Card>
  );
}
