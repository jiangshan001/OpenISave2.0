import { Providers } from './providers';
import { AppRouter } from './router';
import { SecurityGate } from './SecurityGate';
import { AppUpdateProvider } from '@/features/updates/AppUpdateProvider';

export function App() {
  return (
    <Providers>
      <AppUpdateProvider>
        <SecurityGate>
          <AppRouter />
        </SecurityGate>
      </AppUpdateProvider>
    </Providers>
  );
}
