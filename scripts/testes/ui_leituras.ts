// Fase 6 — verifica, pela API, as mesmas consultas que os ecrãs fazem
// (packages/frontend/src/lib/dados.ts), para detetar erros de forma de consulta
// antes do teste manual no browser. Cria e liberta uma reserva de teste.
// Uso: cd scripts; npx tsx testes/ui_leituras.ts

import { capturar_erro, criar_cliente_autenticado } from '../lib/cliente.ts';
import { repor_estado } from '../repor_estado.ts';

const cliente = await criar_cliente_autenticado();
const lh = cliente.connectors.lh_reserva_lotes;
const L = 1000;
const verificacoes: { consulta: string; resultado: string; status: 'ok' | 'falha' }[] = [];
async function verificar(consulta: string, acao: () => Promise<unknown[]>, minimo = 0) {
  const r = await capturar_erro(acao);
  const n = Array.isArray(r.resultado) ? r.resultado.length : -1;
  verificacoes.push({ consulta, resultado: r.erro ?? `${n} linhas`, status: r.erro === null && n >= minimo ? 'ok' : 'falha' });
}

await repor_estado(cliente);
const reserva = await cliente.functions.reservar.invoke({
  num_encomenda: 'ENC-0001', num_linha: 1,
  linhas: [{ cod_armazem: 'A01', cod_artigo: 'ART-001', cod_lote: 'L-CONC', qtd: 10 }],
});

await verificar('fato_encomenda', () => lh.fato_encomenda.select(['num_encomenda', 'nome_cliente', 'data_entrega']).first(L).execute(), 10);
await verificar('fato_encomenda_linha', () => lh.fato_encomenda_linha.select(['num_encomenda', 'num_linha', 'cod_artigo', 'qtd_pendente']).first(L).execute(), 25);
await verificar('dim_artigo', () => lh.dim_artigo.select(['cod_artigo', 'nome_artigo']).first(L).execute(), 20);
await verificar('dim_atributo_qualidade numéricos', () => lh.dim_atributo_qualidade.select(['cod_atributo', 'nome_atributo', 'tipo_valor', 'unidade']).where({ tipo_valor: { eq: 'numero' } }).first(L).execute(), 2);
await verificar('dim_lote ART-001', () => lh.dim_lote.select(['cod_empresa', 'cod_artigo', 'cod_lote', 'estado_lote', 'data_validade']).where({ cod_artigo: { eq: 'ART-001' } }).first(L).execute(), 5);
await verificar('fato_lote_atributo ART-001', () => lh.fato_lote_atributo.select(['cod_lote', 'cod_atributo', 'valor_numero', 'valor_texto']).where({ cod_artigo: { eq: 'ART-001' } }).first(L).execute(), 25);
await verificar('app_saldo_lote ART-001', () => cliente.data.app_saldo_lote.select(['cod_empresa', 'cod_armazem', 'cod_artigo', 'cod_lote', 'qtd_sap', 'qtd_reservada']).where({ cod_artigo: { eq: 'ART-001' } }).first(L).execute(), 5);
await verificar('app_reserva ativas orderBy', () => cliente.data.app_reserva.select(['id', 'num_encomenda', 'num_linha', 'criado_em']).where({ estado: { eq: 'ativa' } }).orderBy({ criado_em: 'desc' }).first(L).execute(), 1);
await verificar('app_reserva_detalhe in', () => cliente.data.app_reserva_detalhe.select(['reserva_id', 'cod_armazem', 'cod_artigo', 'cod_lote', 'qtd']).where({ reserva_id: { in: [String(reserva.reserva_id)] } }).first(L).execute(), 1);
await verificar('app_alerta_stock abertos orderBy', () => cliente.data.app_alerta_stock.select(['id', 'cod_artigo', 'cod_lote', 'reserva_id', 'num_encomenda', 'qtd_reservada', 'qtd_sap', 'criado_em']).where({ estado: { eq: 'aberto' } }).orderBy({ criado_em: 'desc' }).first(L).execute());

const lib = await cliente.functions.libertar.invoke({ reserva_id: String(reserva.reserva_id) });
verificacoes.push({ consulta: 'reservar + libertar', resultado: `aceite=${reserva.aceite}, libertada=${lib.libertada}`, status: reserva.aceite && lib.libertada ? 'ok' : 'falha' });
await repor_estado(cliente);
cliente.dispose();
console.table(verificacoes);
process.exit(verificacoes.some((v) => v.status === 'falha') ? 1 : 0);
