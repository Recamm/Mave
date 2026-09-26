import { useState, type FormEvent } from 'react';
import { goalService, GoalInputError, type SavingsGoal } from './goalService';

type GoalContributionFormProps = {
  goal: Pick<SavingsGoal, 'id' | 'name'>;
  onAdded: () => void;
};

export function GoalContributionForm({ goal, onAdded }: GoalContributionFormProps) {
  const [amount, setAmount] = useState('');
  const [contributedOn, setContributedOn] = useState(getTodayCivilDate);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);

    try {
      await goalService.addContribution({
        amount,
        contributedOn,
        goalId: goal.id,
      });
      setAmount('');
      setSuccess('Aporte registrado.');
      onAdded();
    } catch (caughtError) {
      setError(
        caughtError instanceof GoalInputError
          ? caughtError.message
          : 'No se pudo registrar el aporte. Revisa los datos e inténtalo de nuevo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      aria-label="Registrar aporte"
      className="goal-contribution-form"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <label htmlFor={`goal-contribution-amount-${goal.id}`}>Importe del aporte</label>
      <input
        autoComplete="off"
        id={`goal-contribution-amount-${goal.id}`}
        inputMode="decimal"
        onChange={(event) => {
          setAmount(event.target.value);
          setError('');
          setSuccess('');
        }}
        required
        value={amount}
      />

      <label htmlFor={`goal-contribution-date-${goal.id}`}>Fecha del aporte</label>
      <input
        id={`goal-contribution-date-${goal.id}`}
        onChange={(event) => {
          setContributedOn(event.target.value);
          setError('');
          setSuccess('');
        }}
        required
        type="date"
        value={contributedOn}
      />

      {error ? (
        <p
          className="goal-contribution-form__feedback goal-contribution-form__feedback--error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          className="goal-contribution-form__feedback goal-contribution-form__feedback--success"
          role="status"
        >
          {success}
        </p>
      ) : null}
      <button className="button-primary" disabled={isSubmitting} type="submit">
        Agregar aporte
      </button>
    </form>
  );
}

function getTodayCivilDate(): string {
  const today = new Date();
  const year = String(today.getFullYear()).padStart(4, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
