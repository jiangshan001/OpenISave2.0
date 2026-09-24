import { Providers } from './providers';
import { AppRouter } from './router';
import { SecurityGate } from './SecurityGate';

export function App() {
  return (
    <Providers>
      <SecurityGate>
        <AppRouter />
      </SecurityGate>
    </Providers>
  );
}
