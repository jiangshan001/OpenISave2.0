import { describe, expect, it } from 'vitest';

import { renderWithProviders, screen } from '@/test/utils';
import packageJson from '../../../package.json';
import { Sidebar } from './Sidebar';

describe('Sidebar', () => {
  it('shows the released app version from package.json', () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText(`v${packageJson.version} · Local`)).toBeInTheDocument();
    expect(packageJson.version).toBe('2.1.1');
  });
});
