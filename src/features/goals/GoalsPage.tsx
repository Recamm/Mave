import { useEffect, useState, type FormEvent } from 'react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { formatCivilDate, formatMoney } from '../../lib/money/format';
import { parseDecimal } from '../../lib/money/decimal';
import { goalService, GoalInputError, type GoalCurrency, type SavingsGoal } from './goalService';
import { GoalContributionForm } from './GoalContributionForm';

export function GoalsPage() {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadGoals() {
      setIsLoading(true);
      setHasLoadError(false);

      try {
        const data = await goalService.listGoals();
        if (isActive) {
          setGoals(data);
        }
      } catch {
        if (isActive) {
          setHasLoadError(true);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadGoals();
    return () => {
      isActive = false;
    };
  }, [refreshKey]);

  function refreshGoals() {
    setRefreshKey((currentKey) => currentKey + 1);
  }

  return (
    <main className="movement-page goals-page">
      <header className="movement-page__header">
        <div>
          <p className="eyebrow">Planificación personal</p>
          <h1>Metas de ahorro</h1>
        </div>
      </header>

      <div className="goals-page__layout">
        <GoalCreateForm onCreated={refreshGoals} />

        <section className="goal-list-panel" aria-labelledby="goal-list-heading">
          <header className="goal-list-panel__heading">
            <h2 id="goal-list-heading">Seguimiento</h2>
            <span>{goals.length}</span>
          </header>

          {hasLoadError ? (
            <FeedbackMessage tone="error">
              No se pudieron cargar tus metas. Inténtalo de nuevo.
            </FeedbackMessage>
          ) : null}

          {isLoading && goals.length === 0 ? (
            <FeedbackMessage tone="info">Cargando metas.</FeedbackMessage>
          ) : null}

          {!isLoading && !hasLoadError && goals.length === 0 ? (
            <p className="goal-list-panel__empty">Todavía no hay metas de ahorro.</p>
          ) : null}

          {goals.length > 0 ? (
            <ul className="savings-goal-list" aria-label="Metas de ahorro">
              {goals.map((goal) => (
                <li className="savings-goal" key={goal.id}>
                  <article>
                    <header className="savings-goal__heading">
                      <div>
                        <h3>{goal.name}</h3>
                        <p>
                          {goal.currency}
                          {goal.targetDate ? (
                            <>
                              <span aria-hidden="true"> · </span>
                              Fecha objetivo {formatCivilDate(goal.targetDate)}
                            </>
                          ) : null}
                        </p>
                      </div>
                      <p className="savings-goal__totals">
                        <strong>{formatMoney(goal.progress, goal.currency)}</strong>
                        <span>de {formatMoney(goal.targetAmount, goal.currency)}</span>
                      </p>
                    </header>

                    <progress
                      aria-label={`Progreso de ${goal.name}`}
                      className="savings-goal__progress"
                      max={1}
                      value={getProgressRatio(goal)}
                    />

                    <GoalContributionForm goal={goal} onAdded={refreshGoals} />

                    <section className="savings-goal__contributions" aria-label="Aportes">
                      <h4>Aportes</h4>
                      {goal.contributions.length > 0 ? (
                        <ol>
                          {goal.contributions.map((contribution) => (
                            <li key={contribution.id}>
                              <time dateTime={contribution.contributedOn}>
                                {formatCivilDate(contribution.contributedOn)}
                              </time>
                              <strong>{formatMoney(contribution.amount, goal.currency)}</strong>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p>Sin aportes todavía.</p>
                      )}
                    </section>
                  </article>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function GoalCreateForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currency, setCurrency] = useState<GoalCurrency>('ARS');
  const [targetDate, setTargetDate] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; tone: 'error' | 'success' } | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setIsSubmitting(true);

    try {
      await goalService.createGoal({ name, targetAmount, currency, targetDate });
      setName('');
      setTargetAmount('');
      setTargetDate('');
      setFeedback({ message: 'Meta creada.', tone: 'success' });
      onCreated();
    } catch (error) {
      setFeedback({
        message:
          error instanceof GoalInputError
            ? error.message
            : 'No se pudo crear la meta. Revisa los datos e inténtalo de nuevo.',
        tone: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="goal-editor" aria-labelledby="goal-editor-heading">
      <header className="goal-editor__heading">
        <h2 id="goal-editor-heading">Crear meta</h2>
      </header>
      <form aria-label="Crear meta de ahorro" onSubmit={(event) => void handleSubmit(event)}>
        <label htmlFor="goal-name">Nombre de la meta</label>
        <input
          autoComplete="off"
          id="goal-name"
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />

        <label htmlFor="goal-target-amount">Importe objetivo</label>
        <input
          autoComplete="off"
          id="goal-target-amount"
          inputMode="decimal"
          onChange={(event) => setTargetAmount(event.target.value)}
          required
          value={targetAmount}
        />

        <label htmlFor="goal-currency">Moneda de la meta</label>
        <select
          id="goal-currency"
          onChange={(event) => setCurrency(event.target.value as GoalCurrency)}
          value={currency}
        >
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>

        <label htmlFor="goal-target-date">Fecha objetivo (opcional)</label>
        <input
          id="goal-target-date"
          onChange={(event) => setTargetDate(event.target.value)}
          type="date"
          value={targetDate}
        />

        {feedback ? (
          <p
            className={`goal-editor__feedback goal-editor__feedback--${feedback.tone}`}
            role={feedback.tone === 'error' ? 'alert' : 'status'}
          >
            {feedback.message}
          </p>
        ) : null}
        <button className="button-primary" disabled={isSubmitting} type="submit">
          Crear meta
        </button>
      </form>
    </section>
  );
}

function getProgressRatio(goal: SavingsGoal): number {
  const progress = parseDecimal(goal.progress);
  const target = parseDecimal(goal.targetAmount);
  if (progress.gte(target)) {
    return 1;
  }

  return progress.div(target).toNumber();
}
