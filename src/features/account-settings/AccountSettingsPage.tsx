import { ExportDialog } from '../data-export/ExportDialog';
import { AppearanceSettings } from '../../app/components/AppearanceSettings';
import { DeletionSettings } from './DeletionSettings';

export function AccountSettingsPage() {
  return (
    <main className="movement-page account-settings-page">
      <header className="movement-page__header">
        <div>
          <p className="eyebrow">Privacidad y control</p>
          <h1>Datos y cuenta</h1>
        </div>
      </header>

      <section aria-label="Preferencias">
        <AppearanceSettings />
      </section>

      <section aria-labelledby="data-export-section" className="account-settings-section">
        <h2 id="data-export-section">Exportación</h2>
        <ExportDialog />
      </section>

      <section aria-labelledby="account-deletion-section" className="account-settings-section">
        <h2 id="account-deletion-section">Eliminación de cuenta</h2>
        <DeletionSettings />
      </section>
    </main>
  );
}
