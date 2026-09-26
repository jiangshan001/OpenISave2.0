import { describe, expect, it, vi } from 'vitest';

import { securityApi } from '@/api/security';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
import { RecoveryKeyModal } from './RecoveryKeyModal';

const KEY = 'OIS1-ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-Z2345-67ABC-DEFGH-IJKLM-NOPQR-STUVW';

describe('RecoveryKeyModal', () => {
  it('reveals the key only on an explicit click and requires acknowledgement', async () => {
    const user = setupUser();
    const exportKey = vi
      .spyOn(securityApi, 'exportRecoveryKey')
      .mockResolvedValue({ recovery_key: KEY });
    const onClose = vi.fn();

    renderWithProviders(<RecoveryKeyModal open onClose={onClose} />);
    expect(screen.queryByText(KEY)).not.toBeInTheDocument();
    expect(exportKey).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Reveal recovery key/ }));
    expect(await screen.findByText(KEY)).toBeInTheDocument();
    expect(exportKey).toHaveBeenCalledTimes(1);

    const done = screen.getByRole('button', { name: 'Done' });
    expect(done).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    expect(done).toBeEnabled();
    await user.click(done);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
