import { useId, useState } from 'react';
import {
  appIconOptions,
  applyAppIconPreference,
  getAppIconPreference,
  saveAppIconPreference,
  type AppIconPreference,
} from '../appIcon';

export function AppIconSettings() {
  const [preference, setPreference] = useState(getAppIconPreference);
  const idPrefix = useId();

  function handleChange(nextPreference: AppIconPreference) {
    saveAppIconPreference(nextPreference);
    applyAppIconPreference(nextPreference);
    setPreference(nextPreference);
  }

  return (
    <fieldset aria-label="Icono de inicio" className="app-icon-settings">
      <legend>Icono de inicio</legend>
      <div className="app-icon-settings__options">
        {appIconOptions.map((option) => {
          const id = `${idPrefix}-${option.value}`;

          return (
            <label htmlFor={id} key={option.value}>
              <input
                checked={preference === option.value}
                id={id}
                name="app-icon"
                onChange={() => handleChange(option.value)}
                type="radio"
                value={option.value}
              />
              <img alt="" src={option.src} />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
      <p className="app-icon-settings__notice">
        iOS fija el icono al instalar. Para cambiar el fondo de una instalación existente, elimina
        Mave de Inicio y vuelve a añadirla desde Safari.
      </p>
    </fieldset>
  );
}
