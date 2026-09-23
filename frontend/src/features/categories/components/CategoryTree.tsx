import {
  DeleteOutlined,
  EditOutlined,
  InboxOutlined,
  PlusOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { Button, Popconfirm, Space, Table, Tag, Tooltip } from 'antd';

import { useArchiveCategory, useDeleteCategory } from '@/hooks/useResources';
import type { Category } from '@/types';
import { MAX_DEPTH, type CategoryTreeNode } from '../categoryTree';

interface CategoryTreeProps {
  nodes: CategoryTreeNode[];
  loading?: boolean;
  onEdit: (category: Category) => void;
  onAddChild: (parent: Category) => void;
}

interface Row {
  key: number;
  category: Category;
  children?: Row[];
}

function toRows(nodes: CategoryTreeNode[]): Row[] {
  return nodes.map((node) => ({
    key: node.category.id,
    category: node.category,
    children: node.children.length > 0 ? toRows(node.children) : undefined,
  }));
}

export function CategoryTree({ nodes, loading, onEdit, onAddChild }: CategoryTreeProps) {
  const archive = useArchiveCategory();
  const remove = useDeleteCategory();
  const rows = toRows(nodes);

  return (
    <Table<Row>
      rowKey="key"
      size="middle"
      loading={loading}
      dataSource={rows}
      pagination={false}
      defaultExpandAllRows
      indentSize={22}
      locale={{ emptyText: <span className="oi-muted">No categories</span> }}
      columns={[
        {
          title: 'Category',
          render: (_, row) => (
            <Space size={8}>
              <span className={row.category.is_active ? 'oi-strong' : 'oi-muted'}>
                {row.category.name}
              </span>
              {!row.category.is_active ? <Tag>Archived</Tag> : null}
            </Space>
          ),
        },
        {
          title: 'Used by',
          align: 'right',
          width: 170,
          render: (_, row) => {
            const own = row.category.transaction_count;
            const subtree = row.category.subtree_transaction_count;
            if (subtree === 0) return <span className="oi-muted">not used</span>;
            return (
              <Tooltip
                title={
                  own === subtree
                    ? undefined
                    : `${own} directly, ${subtree} including subcategories`
                }
              >
                <span>
                  {own} transaction{own === 1 ? '' : 's'}
                  {subtree !== own ? (
                    <span className="oi-muted"> ({subtree} in branch)</span>
                  ) : null}
                </span>
              </Tooltip>
            );
          },
        },
        {
          title: '',
          width: 240,
          align: 'right',
          render: (_, row) => {
            const category = row.category;
            const canNest = category.depth + 1 < MAX_DEPTH;
            const deletable = category.subtree_transaction_count === 0 && !row.children;
            return (
              <Space size={2}>
                {canNest ? (
                  <Tooltip title="Add a subcategory">
                    <Button
                      size="small"
                      type="text"
                      aria-label={`Add a subcategory under ${category.name}`}
                      icon={<PlusOutlined />}
                      onClick={() => onAddChild(category)}
                    />
                  </Tooltip>
                ) : null}
                <Button
                  size="small"
                  type="text"
                  aria-label={`Edit ${category.name}`}
                  icon={<EditOutlined />}
                  onClick={() => onEdit(category)}
                />
                <Tooltip
                  title={
                    category.is_active
                      ? 'Archive — existing transactions keep this category'
                      : 'Restore'
                  }
                >
                  <Button
                    size="small"
                    type="text"
                    aria-label={`${category.is_active ? 'Archive' : 'Restore'} ${category.name}`}
                    loading={archive.isPending}
                    icon={category.is_active ? <InboxOutlined /> : <UndoOutlined />}
                    onClick={() =>
                      archive.mutate({ id: category.id, archived: category.is_active })
                    }
                  />
                </Tooltip>
                {deletable ? (
                  <Popconfirm
                    title="Delete this category?"
                    description="It is not used anywhere, so nothing will be lost."
                    okText="Delete"
                    onConfirm={() => remove.mutate(category.id)}
                  >
                    <Button
                      size="small"
                      type="text"
                      danger
                      aria-label={`Delete ${category.name}`}
                      icon={<DeleteOutlined />}
                    />
                  </Popconfirm>
                ) : (
                  <Tooltip title="In use or has subcategories — archive it instead">
                    <Button
                      size="small"
                      type="text"
                      disabled
                      aria-label={`Delete ${category.name}`}
                      icon={<DeleteOutlined />}
                    />
                  </Tooltip>
                )}
              </Space>
            );
          },
        },
      ]}
    />
  );
}
