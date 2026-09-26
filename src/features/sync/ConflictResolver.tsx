import type { Category } from '../categories/categoryService';
import type { FinancialAccountOption } from '../movements/movementService';
import type { MovementConflict, MovementConflictRevision } from './syncEngine';

type ConflictResolverProps = {
  categories: Category[];
  conflicts: MovementConflict[];
  financialAccounts: FinancialAccountOption[];
  onResolve: (conflict: MovementConflict, revision: MovementConflictRevision) => void;
};

export function ConflictResolver({
  categories,
  conflicts,
  financialAccounts,
  onResolve,
}: ConflictResolverProps) {
  return conflicts.map((conflict) => (
    <section
      aria-label="Conflicto de sincronización"
      className="sync-conflict"
      key={conflict.conflictId}
      role="region"
    >
      <h2>Elige qué versión conservar</h2>
      <div className="sync-conflict__revisions">
        {conflict.revisions.map((revision) => (
          <article className="sync-conflict__revision" key={revision.id}>
            <div>
              <h3>
                {revision.source === 'client' ? 'Versión del dispositivo' : 'Versión del servidor'}
              </h3>
              <p>
                {revision.payload.kind === 'expense' ? 'Gasto' : 'Ingreso'} ·{' '}
                {revision.payload.currency}{' '}
                {Number(revision.payload.amount).toLocaleString('es-AR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p>
                {categories.find((category) => category.id === revision.payload.categoryId)?.name ??
                  'Categoría archivada'}
                {' · '}
                {revision.payload.occurredOn}
              </p>
              <p>
                {revision.payload.financialAccountId
                  ? (financialAccounts.find(
                      (account) => account.id === revision.payload.financialAccountId,
                    )?.name ?? 'Cuenta no disponible')
                  : 'Sin cuenta'}
              </p>
              <p>Nota: {revision.payload.note || 'Sin nota'}</p>
            </div>
            <button onClick={() => onResolve(conflict, revision)} type="button">
              Conservar versión del {revision.source === 'client' ? 'dispositivo' : 'servidor'}
            </button>
          </article>
        ))}
      </div>
    </section>
  ));
}
