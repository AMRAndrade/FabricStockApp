// Repõe o estado dos lotes de teste (CLAUDE.md §8) e sincroniza o stock.
//
// Como é feito o reset: a função `repor_lotes_teste` (servidor, auditada) apaga
// alertas, detalhes e reservas que só envolvem os 5 lotes fixos e põe
// qtd_reservada = 0; a seguir `sincronizar_stock` repõe qtd_sap a partir de
// fato_stock no Lakehouse. A auditoria anterior não é apagada.
//
// Uso: cd scripts; npx tsx repor_estado.ts

import { criar_cliente_autenticado, type cliente_app } from './lib/cliente.ts';

export const LOTES_TESTE = ['L-CONC', 'L-ATOM', 'L-ALRT', 'L-FORA', 'L-LIM'];

export async function repor_estado(cliente: cliente_app) {
  const reposicao = await cliente.functions.repor_lotes_teste.invoke();
  const sincronizacao = await cliente.functions.sincronizar_stock.invoke();
  return { reposicao, sincronizacao };
}

export async function estado_lotes(cliente: cliente_app, lotes: string[] = LOTES_TESTE) {
  const linhas = await cliente.data.app_saldo_lote
    .select(['cod_lote', 'qtd_sap', 'qtd_reservada'])
    .where({ cod_lote: { in: lotes } })
    .execute();
  return Object.fromEntries(linhas.map((l) => [l.cod_lote, { qtd_sap: Number(l.qtd_sap), qtd_reservada: Number(l.qtd_reservada) }]));
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) {
  const cliente = await criar_cliente_autenticado();
  console.log(JSON.stringify(await repor_estado(cliente), null, 2));
  console.table(await estado_lotes(cliente));
  cliente.dispose();
}
