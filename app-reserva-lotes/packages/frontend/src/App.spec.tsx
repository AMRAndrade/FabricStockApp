//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Os ecrãs leem o backend; nos testes de UI as leituras ficam pendentes.
vi.mock('@/lib/dados', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/dados')>();
  return {
    ...actual,
    useLeitura: () => ({ a_carregar: true, erro: null, dados: null, recarregar: () => {} }),
  };
});

import App from '@/App';

describe('App', () => {
  it('renders without throwing', () => {
    expect(() => render(<App />)).not.toThrow();
  });

  it('mounts content into the document', () => {
    render(<App />);
    expect(document.body).not.toBeEmptyDOMElement();
  });

  it('mostra o título e os dois ecrãs', () => {
    const { getByRole } = render(<App />);
    expect(getByRole('heading', { name: 'Reserva de lotes' })).toBeTruthy();
    expect(getByRole('button', { name: 'Stock e reserva' })).toBeTruthy();
    expect(getByRole('button', { name: 'Reservas e alertas' })).toBeTruthy();
  });
});
