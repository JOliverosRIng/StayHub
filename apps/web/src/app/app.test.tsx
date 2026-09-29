import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './app';

describe('App', () => {
  it('renderiza el encabezado principal', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'StayHub' })).toBeInTheDocument();
  });
});
