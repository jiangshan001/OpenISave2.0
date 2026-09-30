import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppearanceCard } from '@/features/settings/components/AppearanceCard';
import { APPEARANCE_STORAGE_KEY } from './appearance';
import { AppearanceSwitch } from './AppearanceSwitch';
import { mockSystemTheme, type SystemThemeMock } from './mediaMock';
import { ThemeProvider } from './ThemeProvider';
import { useAppearance, useChartPalette } from './themeContext';

let system: SystemThemeMock;

function Probe() {
  const { preference, resolved } = useAppearance();
  const palette = useChartPalette();
  return (
    <output data-testid="probe">
      {preference}/{resolved}/{palette.grid}
    </output>
  );
}

function renderApp(osDark: boolean) {
  system = mockSystemTheme(osDark);
  return render(
    <ThemeProvider>
      <AppearanceSwitch />
      <Probe />
    </ThemeProvider>,
  );
}

const theme = () => document.documentElement.dataset.theme;
const user = () => userEvent.setup({ pointerEventsCheck: 0 });

beforeEach(() => window.localStorage.clear());
afterEach(() => system.restore());

describe('ThemeProvider', () => {
  it('defaults to System and follows the OS', () => {
    renderApp(true);
    expect(screen.getByTestId('probe')).toHaveTextContent(/^system\/dark\//);
    expect(theme()).toBe('dark');
  });

  it('switches to Light and Dark immediately and remembers the choice', async () => {
    renderApp(false);
    await user().click(screen.getByText('Dark'));
    expect(theme()).toBe('dark');
    expect(screen.getByTestId('probe')).toHaveTextContent(/^dark\/dark\//);
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('dark');

    await user().click(screen.getByText('Light'));
    expect(theme()).toBe('light');
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('light');
  });

  it('restores the saved preference on the next launch', () => {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, 'dark');
    renderApp(false);
    expect(screen.getByTestId('probe')).toHaveTextContent(/^dark\/dark\//);
    expect(theme()).toBe('dark');
  });

  it('reacts live to Windows changing theme while on System, and only then', async () => {
    renderApp(false);
    expect(theme()).toBe('light');
    act(() => system.setDark(true));
    expect(theme()).toBe('dark');

    await user().click(screen.getByText('Light'));
    act(() => system.setDark(true));
    expect(theme()).toBe('light');
  });

  it('hands charts a palette for the active theme', async () => {
    renderApp(false);
    const light = screen.getByTestId('probe').textContent;
    await user().click(screen.getByText('Dark'));
    expect(screen.getByTestId('probe').textContent).not.toBe(light);
  });
});

describe('Settings → Appearance', () => {
  it('offers System, Light and Dark and explains the current state', async () => {
    system = mockSystemTheme(true);
    render(
      <ThemeProvider>
        <AppearanceCard />
      </ThemeProvider>,
    );
    expect(screen.getByText('Appearance')).toBeInTheDocument();
    for (const label of ['System', 'Light', 'Dark']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByTestId('appearance-note')).toHaveTextContent('Following Windows, currently dark');

    await user().click(screen.getByText('Light'));
    expect(screen.getByTestId('appearance-note')).toHaveTextContent('Always light');
    expect(theme()).toBe('light');
  });
});
