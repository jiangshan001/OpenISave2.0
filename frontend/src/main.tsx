import React from 'react';
import ReactDOM from 'react-dom/client';

import { resolveApiOrigin } from './api/runtime';
import { App } from './app/App';
import { StartupScreen } from './app/StartupScreen';
import { initAppearance } from './theme/appearance';
import './styles/tokens.css';
import './styles/global.css';
import './styles/shell.css';
import './styles/controls.css';
import './styles/overlays.css';
import './styles/toolbar.css';
import './styles/cards.css';
import './styles/charts.css';
import './styles/overview.css';
import './styles/settings.css';
import './styles/imports.css';

// index.html has already applied the theme before first paint; this keeps
// the two in step (and covers environments that skip the inline script).
initAppearance();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

function showStarting(message: string) {
  root.render(
    <React.StrictMode>
      <StartupScreen message={message} />
    </React.StrictMode>,
  );
}

// The desktop shell starts the backend in the background, so the window can
// appear straight away. Show progress until it reports a usable API.
showStarting('Starting…');

resolveApiOrigin(showStarting).then((result) => {
  root.render(
    <React.StrictMode>
      {result.status === 'ready' ? <App /> : <StartupScreen failed message={result.message} />}
    </React.StrictMode>,
  );
});
