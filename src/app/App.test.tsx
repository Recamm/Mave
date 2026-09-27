import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { FeedbackMessage } from './components/FeedbackMessage';

describe('App', () => {
  it('keeps the app header visible while checking the session', () => {
    render(<App />);

    expect(screen.getByRole('link', { name: 'Mave, inicio' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Comprobando la sesión' })).toBeInTheDocument();
  });

  it('announces errors as alerts', () => {
    render(<FeedbackMessage tone="error">No se pudo cargar la sesión.</FeedbackMessage>);

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar la sesión.');
  });
});
