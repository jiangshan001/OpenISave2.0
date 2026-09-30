import type { ThemeConfig } from 'antd';

/**
 * Shared design tokens. Colours and spacing live here (and in
 * styles/tokens.css, which mirrors them for plain CSS), not in components.
 */
const FONT =
  "'Segoe UI Variable Text', 'Segoe UI', -apple-system, BlinkMacSystemFont, 'PingFang SC', " +
  "'Microsoft YaHei', Roboto, Helvetica, Arial, sans-serif";

export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#2f5bd3',
    colorSuccess: '#1a7f55',
    colorError: '#c2412d',
    colorWarning: '#b7791f',
    colorInfo: '#2f5bd3',
    colorText: '#151a23',
    colorTextSecondary: '#6a7282',
    colorTextTertiary: '#98a0ad',
    colorBgLayout: '#f4f5f7',
    colorBorder: '#dcdfe5',
    colorBorderSecondary: '#eceef1',
    colorFillSecondary: '#f1f3f6',
    borderRadius: 8,
    borderRadiusLG: 14,
    borderRadiusSM: 6,
    controlHeight: 34,
    fontFamily: FONT,
    fontSize: 14,
    boxShadowSecondary: '0 12px 32px -8px rgba(22, 28, 44, 0.22), 0 2px 6px rgba(22, 28, 44, 0.06)',
    motionEaseOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
  },
  components: {
    Layout: {
      siderBg: '#fafbfc',
      bodyBg: '#f4f5f7',
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: '#edf1fc',
      itemSelectedColor: '#2449b3',
      itemHoverBg: '#f0f2f5',
      itemColor: '#3c4350',
      itemHeight: 36,
      itemMarginInline: 10,
      itemBorderRadius: 8,
      groupTitleColor: '#98a0ad',
      groupTitleFontSize: 11.5,
      iconSize: 15,
    },
    Card: {
      paddingLG: 22,
      headerHeight: 54,
      headerFontSize: 15,
    },
    Button: {
      primaryShadow: 'none',
      defaultShadow: 'none',
      dangerShadow: 'none',
      fontWeight: 500,
    },
    Table: {
      headerBg: '#f8f9fb',
      headerColor: '#6a7282',
      headerSplitColor: 'transparent',
      rowHoverBg: '#f8f9fb',
      borderColor: '#eef0f3',
    },
    Segmented: {
      trackBg: '#eef0f3',
      itemSelectedBg: '#ffffff',
      itemColor: '#6a7282',
      itemSelectedColor: '#151a23',
    },
    Tag: {
      defaultBg: '#f1f3f6',
      defaultColor: '#3c4350',
    },
    Progress: {
      remainingColor: '#edf0f3',
    },
    Tabs: {
      itemColor: '#6a7282',
      titleFontSize: 14,
    },
  },
};
