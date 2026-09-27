import { useEffect, useId, useState } from 'react';
import {
  applyMobileNavigationStyle,
  getMobileNavigationStyle,
  saveMobileNavigationStyle,
  type MobileNavigationStyle,
} from '../mobileNavigation';

const options: { label: string; value: MobileNavigationStyle }[] = [
  { label: 'Normal', value: 'normal' },
  { label: 'Flotante', value: 'floating' },
];

export function MobileNavigationSettings() {
  const [style, setStyle] = useState(getMobileNavigationStyle);
  const idPrefix = useId();

  useEffect(() => {
    applyMobileNavigationStyle(style);
  }, [style]);

  function handleChange(nextStyle: MobileNavigationStyle) {
    saveMobileNavigationStyle(nextStyle);
    setStyle(nextStyle);
  }

  return (
    <fieldset aria-label="Barra de navegación" className="navigation-style-settings">
      <legend>Barra inferior</legend>
      <div className="appearance-settings__options">
        {options.map((option) => {
          const id = `${idPrefix}-${option.value}`;

          return (
            <label htmlFor={id} key={option.value}>
              <input
                checked={style === option.value}
                id={id}
                name="mobile-navigation-style"
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
