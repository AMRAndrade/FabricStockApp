// Fase 5 — sincronização e alertas de stock (CLAUDE.md §9).
//   sync_01  sincronizar sem alterações → qtd_reservada intacta em todos os lotes
//   alrt_01  L-ALRT com 40 reservados; fonte a descer 50 → 30 → exatamente 1 alerta
//            com artigo, lote, reserva e encomenda
//   alrt_02  repetir a sincronização → continua 1 alerta
//   extra    libertar a reserva resolve o alerta
// No fim a fonte do Dataflow volta a `dataset` e o estado é reposto.
//
// Pré-requisito: dataset_variacao/ no GitHub (scripts/simular_queda_stock.ts + push).
// Uso: cd scripts; npx tsx testes/alertas.ts

import { capturar_erro, criar_cliente_autenticado } from '../lib/cliente.ts';
import { estado_lotes, repor_estado } from '../repor_estado.ts';
import { atualizar_dataflow } from '../atualizar_dataflow.ts';

interface resultado_teste { teste: string; esperado: string; obtido: string; status: 'ok' | 'falha' }
const resultados: resultado_teste[] = [];
const registar = (teste: string, esperado: string, obtido: string, passou: boolean) =>
  resultados.push({ teste, esperado, obtido, status: passou ? 'ok' : 'falha' });

const cliente = await criar_cliente_autenticado();

async function todos_saldos() {
  const linhas = await cliente.data.app_saldo_lote.select(['chave', 'qtd_sap', 'qtd_reservada']).first(1000).execute();
  return new Map(linhas.map((l) => [String(l.chave), { qtd_sap: Number(l.qtd_sap), qtd_reservada: Number(l.qtd_reservada) }]));
}

async function alertas_lote(cod_lote: string) {
  return cliente.data.app_alerta_stock
    .select(['id', 'cod_artigo', 'cod_lote', 'reserva_id', 'num_encomenda', 'qtd_reservada', 'qtd_sap', 'estado'])
    .where({ cod_lote: { eq: cod_lote } })
    .first(1000).execute();
}

try {
  await repor_estado(cliente);

  // Reserva de 40 sobre L-ALRT (qtd_sap 50) para ENC-0002 linha 1.
  const reserva = await cliente.functions.reservar.invoke({
    num_encomenda: 'ENC-0002', num_linha: 1,
    linhas: [{ cod_armazem: 'A01', cod_artigo: 'ART-001', cod_lote: 'L-ALRT', qtd: 40 }],
  });
  if (!reserva.aceite || !reserva.reserva_id) throw new Error(`reserva de L-ALRT recusada: ${reserva.motivo}`);

  // sync_01
  const antes = await todos_saldos();
  const s0 = await cliente.functions.sincronizar_stock.invoke();
  const depois = await todos_saldos();
  const diferentes = [...antes].filter(([k, v]) => depois.get(k)?.qtd_reservada !== v.qtd_reservada || depois.get(k)?.qtd_sap !== v.qtd_sap);
  const reservado_total = [...depois.values()].reduce((s, v) => s + v.qtd_reservada, 0);
  registar('sync_01', 'sem alterações: 0 inseridos, 0 atualizados; qtd_reservada intacta em todos os lotes',
    `${antes.size} lotes; inseridos=${s0.inseridos}, atualizados=${s0.atualizados}, lotes alterados=${diferentes.length}, reservado total=${reservado_total}${s0.erro ? ` erro=${s0.erro}` : ''}`,
    s0.erro === null && s0.inseridos === 0 && s0.atualizados === 0 && diferentes.length === 0 && reservado_total === 40);

  // Queda de stock na origem: Dataflow passa a ler dataset_variacao.
  const variacao = await atualizar_dataflow('dataset_variacao');
  registar('dataflow_variacao', 'refresh Completed', `${variacao.refresh.estado} em ${variacao.refresh.segundos} s`, variacao.refresh.estado === 'Completed');

  const s1 = await cliente.functions.sincronizar_stock.invoke();
  const alrt = (await estado_lotes(cliente, ['L-ALRT']))['L-ALRT'];
  const a1 = (await alertas_lote('L-ALRT')).filter((a) => a.estado === 'aberto');
  const a = a1[0];
  registar('alrt_01', '1 alerta: ART-001, L-ALRT, reserva, ENC-0002, reservado 40 > sap 30',
    `sync: atualizados=${s1.atualizados}, alertas_novos=${s1.alertas_novos}${s1.erro ? ` erro=${s1.erro}` : ''}; L-ALRT sap=${alrt.qtd_sap} reservado=${alrt.qtd_reservada}; `
      + `alertas=${a1.length}${a ? ` (${a.cod_artigo}, ${a.cod_lote}, reserva ${String(a.reserva_id) === reserva.reserva_id ? 'certa' : String(a.reserva_id)}, ${a.num_encomenda}, ${Number(a.qtd_reservada)} > ${Number(a.qtd_sap)})` : ''}`,
    a1.length === 1 && a?.cod_artigo === 'ART-001' && a.cod_lote === 'L-ALRT' && String(a.reserva_id) === reserva.reserva_id
      && a.num_encomenda === 'ENC-0002' && Number(a.qtd_reservada) === 40 && Number(a.qtd_sap) === 30);

  const s2 = await cliente.functions.sincronizar_stock.invoke();
  const a2 = (await alertas_lote('L-ALRT')).filter((x) => x.estado === 'aberto');
  registar('alrt_02', 'repetir a sincronização: continua 1 alerta', `alertas_novos=${s2.alertas_novos}, alertas abertos em L-ALRT=${a2.length}`,
    s2.alertas_novos === 0 && a2.length === 1);

  // Libertar resolve o alerta.
  const lib = await cliente.functions.libertar.invoke({ reserva_id: reserva.reserva_id });
  const a3 = await alertas_lote('L-ALRT');
  registar('extra_libertar_resolve_alerta', 'libertada; alerta passa a resolvido',
    `libertada=${lib.libertada}; estados=${a3.map((x) => x.estado).join(',')}`,
    lib.libertada && a3.length === 1 && a3[0].estado === 'resolvido');
} finally {
  // Repor a fonte original e o estado, mesmo que um teste falhe.
  const original = await capturar_erro(() => atualizar_dataflow('dataset'));
  const r = original.resultado as { refresh: { estado: string; segundos: number } } | undefined;
  registar('dataflow_reposto', 'refresh Completed com dataset', original.erro ?? `${r?.refresh.estado} em ${r?.refresh.segundos} s`,
    r?.refresh.estado === 'Completed');
  await repor_estado(cliente);
  const final = (await estado_lotes(cliente, ['L-ALRT']))['L-ALRT'];
  registar('estado_final', 'L-ALRT sap 50, reservado 0', `sap=${final.qtd_sap}, reservado=${final.qtd_reservada}`,
    final.qtd_sap === 50 && final.qtd_reservada === 0);
  cliente.dispose();
}

console.table(resultados);
const falhas = resultados.filter((r) => r.status === 'falha').length;
console.log(`${new Date().toISOString()} | ${resultados.length} testes | ${falhas} falhas`);
process.exit(falhas > 0 ? 1 : 0);
