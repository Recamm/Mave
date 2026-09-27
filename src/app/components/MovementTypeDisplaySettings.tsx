import { useId, useState } from 'react';
import {
  getMovementTypeDisplayPreference,
  saveMovementTypeDisplayPreference,
  type MovementTypeDisplayPreference,
} from '../movementTypeDisplay';

const options: { label: string; value: MovementTypeDisplayPreference }[] = [
  { label: 'Palabras: Ingreso / egreso', value: 'words' },
  { label: 'Signos: + / -', value: 'symbols' },
];

export function MovementTypeDisplaySettings() {
  const [preference, setPreference] = useState(() => getMovementTypeDisplayPreference());
  const idPrefix = useId();

  function handleChange(nextPreference: MovementTypeDisplayPreference) {
    saveMovementTypeDisplayPreference(nextPreference);
    setPreference(nextPreference);
  }

  return (
    <fieldset aria-label="Formato del tipo de movimiento" className="appearance-settings">
      <legend>Formato en el historial</legend>
      <div className="appearance-settings__options">
        {options.map((option) => {
          const id = `${idPrefix}-${option.value}`;

          return (
            <label htmlFor={id} key={option.value}>
              <input
                checked={preference === option.value}
                id={id}
                name="movement-type-display"
                onChange={() => handleChange(option.value)}
                type="radio"
                value={option.value}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
