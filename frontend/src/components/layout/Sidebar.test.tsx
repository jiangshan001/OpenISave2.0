import { describe, expect, it } from 'vitest';

import { renderWithProviders, screen } from '@/test/utils';
import packageJson from '../../../package.json';
import { Sidebar } from './Sidebar';

describe('Sidebar', () => {
  it('shows the released app version from package.json', () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText(`Version ${packageJson.version}`)).toBeInTheDocument();
    expect(packageJson.version).toBe('2.3.0');
  });

  it('keeps the privacy status and a compact theme control in the footer', () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText('Local & encrypted')).toBeInTheDocument();
    expect(screen.getByText('Theme')).toBeInTheDocument();
    for (const label of ['System', 'Light', 'Dark']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });
});
