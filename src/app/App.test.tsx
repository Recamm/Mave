import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { FeedbackMessage } from './components/FeedbackMessage';

describe('App', () => {
  it('renders the application heading', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Mave' })).toBeInTheDocument();
  });

  it('announces errors as alerts', () => {
    render(<FeedbackMessage tone="error">No se pudo cargar la sesión.</FeedbackMessage>);

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar la sesión.');
  });
});
