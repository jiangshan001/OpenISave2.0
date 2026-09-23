import type { ThemeConfig } from 'antd';

/** Shared design tokens. Colours and spacing live here, not in components. */
export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#2f6feb',
    colorSuccess: '#22a06b',
    colorError: '#d4543a',
    colorWarning: '#e8912d',
    colorBgLayout: '#f4f6fa',
    colorBorderSecondary: '#e7eaf0',
    borderRadius: 10,
    fontFamily:
      "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', " +
      "'Microsoft YaHei', Roboto, Helvetica, Arial, sans-serif",
    fontSize: 14,
  },
  components: {
    Layout: {
      headerBg: '#ffffff',
      headerHeight: 56,
      siderBg: '#ffffff',
    },
    Menu: {
      itemSelectedBg: '#eaf1fe',
      itemSelectedColor: '#2f6feb',
      itemHeight: 40,
      itemMarginInline: 8,
    },
    Card: {
      paddingLG: 20,
    },
    Table: {
      headerBg: '#fafbfd',
      headerColor: '#5b6472',
    },
  },
};
