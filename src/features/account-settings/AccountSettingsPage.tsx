import { useEffect, useState } from 'react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { MobileNavigationSettings } from '../../app/components/MobileNavigationSettings';
import { MovementTypeDisplaySettings } from '../../app/components/MovementTypeDisplaySettings';
import { useAuthSession } from '../../app/useAuthSession';
import { signOutWithPendingWarning } from '../auth/logoutService';
import { CategoryManager } from '../categories/CategoryManager';
import { categoryService, type Category } from '../categories/categoryService';
import { readOwnerLookups, writeOwnerLookups } from '../sync/ownerLookupCache';
import { ExportDialog } from '../data-export/ExportDialog';
import { AppearanceSettings } from '../../app/components/AppearanceSettings';
import { DeletionSettings } from './DeletionSettings';

export function AccountSettingsPage() {
  const { session } = useAuthSession();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [categoriesLoadFailed, setCategoriesLoadFailed] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    async function loadCategories() {
      try {
        const loadedCategories = await categoryService.listCategories();
        if (isCurrent) {
          setCategories(loadedCategories);
          setCategoriesLoadFailed(false);
        }
      } catch {
        if (isCurrent) {
          setCategoriesLoadFailed(true);
        }
      }
    }

    void loadCategories();
    return () => {
      isCurrent = false;
    };
  }, []);

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

  async function refreshCategories() {
    const updatedCategories = await categoryService.listCategories();
    setCategories(updatedCategories);
    setCategoriesLoadFailed(false);
    if (session?.user.id) {
      const cachedLookups = readOwnerLookups(session.user.id);
      if (cachedLookups) {
        writeOwnerLookups(session.user.id, {
          ...cachedLookups,
          categories: updatedCategories,
        });
      }
    }
  }

  return (
    <main className="movement-page account-settings-page">
      <header className="movement-page__header">
        <div>
          <p className="eyebrow">Tu espacio personal</p>
          <h1>Mi perfil</h1>
        </div>
      </header>

      <section aria-labelledby="profile-details-title" className="profile-section">
        <h2 id="profile-details-title">Cuenta</h2>
        <p>{session?.user.email ?? 'Sesión activa'}</p>
        <button onClick={() => void handleSignOut()} type="button">
          Cerrar sesión
        </button>
        {signOutFailed ? (
          <FeedbackMessage tone="error">
            No se pudo cerrar la sesión. Inténtalo de nuevo.
          </FeedbackMessage>
        ) : null}
      </section>

      <section aria-label="Preferencias">
        <AppearanceSettings />
        <MobileNavigationSettings />
        <MovementTypeDisplaySettings />
      </section>

      <section aria-labelledby="profile-categories-title" className="profile-section">
        <h2 id="profile-categories-title">Categorías</h2>
        <button
          aria-expanded={isCategoryManagerOpen}
          onClick={() => setIsCategoryManagerOpen((open) => !open)}
          type="button"
        >
          {isCategoryManagerOpen ? 'Ocultar categorías' : 'Gestionar categorías'}
        </button>
        {categoriesLoadFailed ? (
          <FeedbackMessage tone="error">No se pudieron cargar las categorías.</FeedbackMessage>
        ) : null}
        {isCategoryManagerOpen ? (
          <CategoryManager
            categories={categories}
            onCategoriesChanged={refreshCategories}
            onClose={() => setIsCategoryManagerOpen(false)}
          />
        ) : null}
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
