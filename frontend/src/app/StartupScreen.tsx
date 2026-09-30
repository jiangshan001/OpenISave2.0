import { BrandMark } from '@/components/common/BrandMark';
import '@/styles/startup.css';

/**
 * Shown while the desktop shell brings the local data service up, and if that
 * never happens. This is the one failure the rest of the app cannot report,
 * because nothing can be fetched at all.
 */
interface StartupScreenProps {
  failed?: boolean;
  message?: string;
}

export function StartupScreen({ failed = false, message }: StartupScreenProps) {
  if (!failed) {
    return (
      <div className="oi-startup-page">
        <div className="oi-startup" role="status" aria-live="polite">
          <BrandMark className="oi-startup-mark" />
          <div className="oi-startup-title">OpenISave</div>
          <div className="oi-startup-note">{message ?? 'Starting…'}</div>
          <div className="oi-startup-bar" aria-hidden>
            <span />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="oi-startup-page">
      <div className="oi-startup">
        <BrandMark className="oi-startup-mark" />
        <h1 className="oi-startup-title">OpenISave could not start</h1>
        <p className="oi-startup-body">
          {message ?? 'The local data service did not come up.'} Your accounts could not be
          loaded, but nothing has been lost: your encrypted database is untouched on this
          computer.
        </p>
        <p className="oi-startup-body oi-muted">
          Close OpenISave and open it again. If it keeps happening, check the log at
          <code> %LOCALAPPDATA%\OpenISave2Data\logs\openisave2.log</code>.
        </p>
        <button type="button" className="oi-startup-retry" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    </div>
  );
}
