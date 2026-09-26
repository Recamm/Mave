import { useState, type FormEvent } from 'react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { categoryService, type Category } from './categoryService';

type CategoryManagerProps = {
  categories: Category[];
  onCategoriesChanged: () => Promise<void>;
  onClose: () => void;
};

export function CategoryManager({
  categories,
  onCategoriesChanged,
  onClose,
}: CategoryManagerProps) {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editedNames, setEditedNames] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);

    try {
      await categoryService.createCategory(newCategoryName);
      setNewCategoryName('');
      await onCategoriesChanged();
    } catch {
      setErrorMessage('No se pudo agregar la categoría. Verifica el nombre e inténtalo de nuevo.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRename(category: Category) {
    const name = (editedNames[category.id] ?? category.name).trim();
    if (!name || name === category.name) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await categoryService.renameCategory(category.id, name);
      await onCategoriesChanged();
      setEditedNames((current) => ({ ...current, [category.id]: name }));
    } catch {
      setErrorMessage(
        'No se pudo cambiar el nombre. Verifica que no esté repetido e inténtalo de nuevo.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleArchive(category: Category) {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      await categoryService.archiveCategory(category.id);
      await onCategoriesChanged();
    } catch {
      setErrorMessage('No se pudo archivar la categoría. Inténtalo de nuevo.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section aria-label="Gestionar categorías" className="category-manager" role="region">
      <div className="category-manager__header">
        <h2>Categorías</h2>
        <button onClick={onClose} type="button">
          Cerrar categorías
        </button>
      </div>

      <form className="category-manager__create" onSubmit={handleCreate}>
        <label htmlFor="new-category">Nueva categoría</label>
        <input
          id="new-category"
          maxLength={80}
          onChange={(event) => setNewCategoryName(event.target.value)}
          required
          value={newCategoryName}
        />
        <button disabled={isSaving} type="submit">
          Agregar categoría
        </button>
      </form>

      {errorMessage ? <FeedbackMessage tone="error">{errorMessage}</FeedbackMessage> : null}

      <ul aria-label="Categorías propias" className="category-manager__list">
        {categories.map((category) => {
          const isArchived = category.archived_at !== null;

          return (
            <li className="category-manager__item" key={category.id}>
              <span>{category.name}</span>
              {isArchived ? <span>Archivada</span> : null}
              <label className="visually-hidden" htmlFor={`category-${category.id}`}>
                Nombre de categoría
              </label>
              <input
                id={`category-${category.id}`}
                maxLength={80}
                onChange={(event) =>
                  setEditedNames((current) => ({ ...current, [category.id]: event.target.value }))
                }
                value={editedNames[category.id] ?? category.name}
              />
              <button disabled={isSaving} onClick={() => void handleRename(category)} type="button">
                Guardar nombre
              </button>
              {!isArchived ? (
                <button
                  disabled={isSaving}
                  onClick={() => void handleArchive(category)}
                  type="button"
                >
                  Archivar
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
