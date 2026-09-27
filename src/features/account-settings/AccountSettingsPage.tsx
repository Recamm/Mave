import { useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronRight, Database, Palette, ShieldCheck, UserRound } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppIconSettings } from '../../app/components/AppIconSettings';
import { AppearanceSettings } from '../../app/components/AppearanceSettings';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { MobileNavigationSettings } from '../../app/components/MobileNavigationSettings';
import { MovementTypeDisplaySettings } from '../../app/components/MovementTypeDisplaySettings';
import { useAuthSession } from '../../app/useAuthSession';
import { ExportDialog } from '../data-export/ExportDialog';
import { signOutWithPendingWarning } from '../auth/logoutService';
import { WebLoginPushSettings } from '../auth/WebLoginPushSettings';
import { AccountAccessSettings } from './AccountAccessSettings';
import { AppPinSettings } from './AppPinSettings';
import { DeletionSettings } from './DeletionSettings';

export function AccountSettingsPage() {
  const [searchParams] = useSearchParams();
  const section = searchParams.get('section');

  if (section === 'account') {
    return <AccountSettingsAccountPage />;
  }

  if (section === 'appearance') {
    return <AccountSettingsAppearancePage />;
  }

  if (section === 'security') {
    return <AccountSettingsSecurityPage />;
  }

  if (section === 'data') {
    return <AccountSettingsDataPage />;
  }

  return (
    <SettingsPageLayout title="Configuración">
      <nav aria-label="Secciones de configuración" className="settings-directory">
        <Link className="settings-directory__item" to="/profile?section=account">
          <span aria-hidden="true" className="settings-directory__icon">
            <UserRound size={20} />
          </span>
          <span className="settings-directory__copy">
            <strong>Cuenta</strong>
            <span>Correo, contraseña y sesión</span>
          </span>
          <ChevronRight aria-hidden="true" className="settings-directory__arrow" size={19} />
        </Link>
        <Link className="settings-directory__item" to="/profile?section=appearance">
          <span aria-hidden="true" className="settings-directory__icon">
            <Palette size={20} />
          </span>
          <span className="settings-directory__copy">
            <strong>Apariencia</strong>
            <span>Tema, icono y navegación</span>
          </span>
          <ChevronRight aria-hidden="true" className="settings-directory__arrow" size={19} />
        </Link>
        <Link
          className="settings-directory__item settings-directory__item--security"
          to="/profile?section=security"
        >
          <span aria-hidden="true" className="settings-directory__icon">
            <ShieldCheck size={20} />
          </span>
          <span className="settings-directory__copy">
            <strong>Seguridad</strong>
            <span>Bloqueo de acceso en este navegador</span>
          </span>
          <span className="settings-recommended">Recomendado</span>
          <ChevronRight aria-hidden="true" className="settings-directory__arrow" size={19} />
        </Link>
        <Link className="settings-directory__item" to="/profile?section=data">
          <span aria-hidden="true" className="settings-directory__icon">
            <Database size={20} />
          </span>
          <span className="settings-directory__copy">
            <strong>Tus datos</strong>
            <span>Exportar cuentas y movimientos</span>
          </span>
          <ChevronRight aria-hidden="true" className="settings-directory__arrow" size={19} />
        </Link>
      </nav>
    </SettingsPageLayout>
  );
}

export function AccountSettingsAccountPage() {
  const { session } = useAuthSession();
  const [signOutFailed, setSignOutFailed] = useState(false);
  const accountEmail = session?.user.email;

  async function handleSignOut() {
    if (!session?.user.id) {
      return;
    }

    try {
      await signOutWithPendingWarning(session.user.id);
    } catch {
      setSignOutFailed(true);
    }
  }

  return (
    <SettingsSectionPage title="Cuenta">
      <section aria-labelledby="settings-access-title" className="settings-section">
        <div className="settings-section__heading">
          <h2 id="settings-access-title">Acceso</h2>
        </div>
        <div className="settings-section__content">
          <div className="settings-account">
            <p>{accountEmail ?? 'Sesión activa'}</p>
          </div>
          {accountEmail ? <AccountAccessSettings currentEmail={accountEmail} /> : null}
        </div>
      </section>

      <section aria-labelledby="settings-session-title" className="settings-section">
        <div className="settings-section__heading">
          <h2 id="settings-session-title">Sesión</h2>
        </div>
        <div className="settings-section__content">
          <button className="settings-sign-out" onClick={() => void handleSignOut()} type="button">
            Cerrar sesión
          </button>
          {signOutFailed ? (
            <FeedbackMessage tone="error">
              No se pudo cerrar la sesión. Inténtalo de nuevo.
            </FeedbackMessage>
          ) : null}
        </div>
      </section>

      <section
        aria-labelledby="settings-delete-title"
        className="settings-section settings-section--danger"
      >
        <div className="settings-section__heading">
          <h2 id="settings-delete-title">Eliminar cuenta</h2>
        </div>
        <div className="settings-section__content">
          <DeletionSettings />
        </div>
      </section>
    </SettingsSectionPage>
  );
}

export function AccountSettingsAppearancePage() {
  return (
    <SettingsSectionPage title="Apariencia">
      <section aria-labelledby="settings-appearance-title" className="settings-section">
        <div className="settings-section__heading">
          <h2 id="settings-appearance-title">Visualización</h2>
        </div>
        <div className="settings-section__content">
          <AppearanceSettings />
          <AppIconSettings />
          <MobileNavigationSettings />
          <MovementTypeDisplaySettings />
        </div>
      </section>
    </SettingsSectionPage>
  );
}

export function AccountSettingsSecurityPage() {
  const { session } = useAuthSession();

  if (!session) {
    return null;
  }

  return (
    <SettingsSectionPage title="Seguridad">
      <section aria-labelledby="settings-security-title" className="settings-section">
        <div className="settings-section__heading">
          <h2 id="settings-security-title">PIN de acceso</h2>
          <span className="settings-recommended">Recomendado</span>
        </div>
        <div className="settings-section__content">
          <AppPinSettings />
        </div>
      </section>
      <section aria-labelledby="settings-web-login-push-title" className="settings-section">
        <div className="settings-section__heading">
          <h2 id="settings-web-login-push-title">Notificaciones</h2>
        </div>
        <div className="settings-section__content">
          <WebLoginPushSettings />
        </div>
      </section>
    </SettingsSectionPage>
  );
}

export function AccountSettingsDataPage() {
  return (
    <SettingsSectionPage title="Tus datos">
      <section aria-labelledby="settings-data-title" className="settings-section">
        <div className="settings-section__heading">
          <h2 id="settings-data-title">Exportación</h2>
        </div>
        <div className="settings-section__content">
          <ExportDialog />
        </div>
      </section>
    </SettingsSectionPage>
  );
}

function SettingsSectionPage({ children, title }: { children: ReactNode; title: string }) {
  return (
    <SettingsPageLayout showBackLink title={title}>
      {children}
    </SettingsPageLayout>
  );
}

function SettingsPageLayout({
  children,
  showBackLink = false,
  title,
}: {
  children: ReactNode;
  showBackLink?: boolean;
  title: string;
}) {
  return (
    <main className="movement-page account-settings-page">
      {showBackLink ? (
        <Link className="settings-back-link" to="/profile">
          <ArrowLeft aria-hidden="true" size={17} />
          <span>Volver a configuración</span>
        </Link>
      ) : null}
      <header className="movement-page__header">
        <div>
          <p className="eyebrow">Tu espacio personal</p>
          <h1>{title}</h1>
        </div>
      </header>
      {children}
    </main>
  );
}
