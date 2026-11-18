// App da PoC "Reserva de lotes": dois ecrãs (stock e reserva; reservas e
// alertas). Fica dentro do AuthGate/AuthProvider do template (Root.tsx):
// não há outro fluxo de login.
//
// Nota (regra 2): componentes React em PascalCase e hooks em useCamelCase,
// exigidos pelo JSX e pela regra de lint rules-of-hooks; ficheiros, variáveis
// e funções restantes em snake_case (desvio registado no POC-LOG).

import { useState } from 'react';
import { EcraStock } from './ecras/ecra_stock';
import { EcraReservas } from './ecras/ecra_reservas';

type nome_ecra = 'stock' | 'reservas';

const ECRAS: { id: nome_ecra; nome: string }[] = [
  { id: 'stock', nome: 'Stock e reserva' },
  { id: 'reservas', nome: 'Reservas e alertas' },
];

function App() {
  const [ecra, set_ecra] = useState<nome_ecra>('stock');
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-xl font-semibold">Reserva de lotes</h1>
        <p className="text-sm text-muted-foreground">PoC — dados sintéticos</p>
        <nav className="mt-3 flex gap-2" aria-label="Ecrãs">
          {ECRAS.map((e) => (
            <button key={e.id} type="button" onClick={() => set_ecra(e.id)} aria-current={ecra === e.id ? 'page' : undefined}
              className={`rounded-md px-3 py-1 text-sm ${ecra === e.id ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-accent'}`}>
              {e.nome}
            </button>
          ))}
        </nav>
      </header>
      <main className="p-6">
        {ecra === 'stock' ? <EcraStock key="stock" /> : <EcraReservas key="reservas" />}
      </main>
    </div>
  );
}

export default App;
