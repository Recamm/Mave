import { useEffect, useId, useState } from 'react';
import {
  applyAppearancePreference,
  getAppearancePreference,
  saveAppearancePreference,
  type AppearancePreference,
} from '../appearance';

const options: { label: string; value: AppearancePreference }[] = [
  { label: 'Clara', value: 'light' },
  { label: 'Oscura', value: 'dark' },
  { label: 'Del sistema', value: 'system' },
];

export function AppearanceSettings() {
  const [preference, setPreference] = useState(getAppearancePreference);
  const idPrefix = useId();

  useEffect(() => {
    const systemPreference = window.matchMedia('(prefers-color-scheme: dark)');
    const updateAppearance = () =>
      applyAppearancePreference(preference, document.documentElement, systemPreference.matches);

    updateAppearance();
    systemPreference.addEventListener('change', updateAppearance);

    return () => systemPreference.removeEventListener('change', updateAppearance);
  }, [preference]);

  function handleChange(nextPreference: AppearancePreference) {
    saveAppearancePreference(nextPreference);
    setPreference(nextPreference);
  }

  return (
    <fieldset aria-label="Apariencia" className="appearance-settings">
      <legend>Apariencia</legend>
      <div className="appearance-settings__options">
        {options.map((option) => {
          const id = `${idPrefix}-${option.value}`;

          return (
            <label htmlFor={id} key={option.value}>
              <input
                checked={preference === option.value}
                id={id}
                name="appearance"
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
