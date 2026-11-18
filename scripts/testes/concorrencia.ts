// Fase 4 — concorrência, atomicidade, libertação e auditoria (CLAUDE.md §8),
// chamando as funções diretamente (não a UI).
//
//   conc_01  20 reservas paralelas de 10 sobre L-CONC (qtd_sap 100) → 10 aceites, 10 recusadas
//   conc_02  50 reservas paralelas de 10 → 10 aceites, 40 recusadas
//   conc_03  estado final de L-CONC: qtd_reservada = 100 (nunca acima)
//            conc_01..03 repetidos RONDAS vezes, repondo o estado entre execuções
//   atom_01  [L-CONC 10, L-ATOM 10] com L-ATOM a 5 → recusada; nada muda; nenhuma reserva
//   atom_02  [L-CONC 10, L-ATOM 5] → aceite; ambos reservados
//   lib_01   libertar uma reserva de 10 → qtd_reservada desce 10
//   lib_02   libertar a mesma reserva 2 (e 5) vezes em paralelo → só uma liberta
//   aud_01   uma linha de auditoria por reserva aceite e por libertação
//   aut_02   criado_por forjado no corpo do pedido → o servidor grava a identidade autenticada
//   aut_03   alterar/apagar uma linha REAL de auditoria → negado; linha intacta
//
// Uso: cd scripts; npx tsx testes/concorrencia.ts [rondas=5]

import { capturar_erro, criar_cliente_autenticado, obter_token_utilizador, type cliente_app } from '../lib/cliente.ts';
import { estado_lotes, repor_estado } from '../repor_estado.ts';

const RONDAS = Number(process.argv[2] ?? 5);
const N_CLIENTES = 5;

interface resultado_teste { teste: string; esperado: string; obtido: string; status: 'ok' | 'falha' }
const resultados: resultado_teste[] = [];
const registar = (teste: string, esperado: string, obtido: string, passou: boolean) =>
  resultados.push({ teste, esperado, obtido, status: passou ? 'ok' : 'falha' });

// Interceção para aut_02: acrescenta campos forjados ao corpo do pedido de `reservar`.
let forjar_identidade = false;
let chaves_corpo_original: string[] = [];
const fetch_original = globalThis.fetch;
globalThis.fetch = async (entrada: RequestInfo | URL, init?: RequestInit) => {
  if (forjar_identidade && String(entrada).includes('/functions/reservar/invoke') && typeof init?.body === 'string') {
    const corpo = JSON.parse(init.body) as Record<string, unknown>;
    chaves_corpo_original = Object.keys(corpo);
    corpo.criado_por = 'forjado@exemplo.pt';
    corpo.utilizador = 'forjado@exemplo.pt';
    for (const valor of Object.values(corpo)) {
      if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
        (valor as Record<string, unknown>).criado_por = 'forjado@exemplo.pt';
        (valor as Record<string, unknown>).utilizador = 'forjado@exemplo.pt';
      }
    }
    return fetch_original(entrada, { ...init, body: JSON.stringify(corpo) });
  }
  return fetch_original(entrada, init);
};

function percentil(valores: number[], p: number): number {
  const ord = [...valores].sort((a, b) => a - b);
  return ord[Math.min(ord.length - 1, Math.floor((p / 100) * ord.length))] ?? 0;
}

const token = await obter_token_utilizador();
const clientes: cliente_app[] = [];
for (let i = 0; i < N_CLIENTES; i++) clientes.push(await criar_cliente_autenticado(token));
const principal = clientes[0];
const id_utilizador = principal.auth.getSession().user?.id ?? '';

async function reservar(i: number, num_linha: number, linhas: { cod_lote: string; qtd: number }[]) {
  const inicio = performance.now();
  const r = await capturar_erro(() => clientes[i % N_CLIENTES].functions.reservar.invoke({
    num_encomenda: 'ENC-0001',
    num_linha,
    linhas: linhas.map((l) => ({ cod_armazem: 'A01', cod_artigo: 'ART-001', cod_lote: l.cod_lote, qtd: l.qtd })),
  }));
  return { ...r, ms: Math.round(performance.now() - inicio) };
}

async function auditoria_de(ids: string[]) {
  if (ids.length === 0) return [];
  return principal.data.app_registo_auditoria
    .select(['id', 'acao', 'entidade_id', 'utilizador'])
    .where({ entidade_id: { in: ids } })
    .first(1000)
    .execute();
}

// ------------------------------------------------------- conc_01..03 (rondas)
const latencias: number[] = [];
for (let ronda = 1; ronda <= RONDAS; ronda++) {
  for (const [nome, n, aceites_esperados] of [['conc_01', 20, 10], ['conc_02', 50, 10]] as const) {
    await repor_estado(principal);
    const respostas = await Promise.all(Array.from({ length: n }, (_, i) => reservar(i, 1, [{ cod_lote: 'L-CONC', qtd: 10 }])));
    latencias.push(...respostas.map((r) => r.ms));
    const aceites = respostas.filter((r) => (r.resultado as { aceite?: boolean } | undefined)?.aceite === true);
    const recusadas = respostas.filter((r) => r.erro === null && (r.resultado as { aceite?: boolean }).aceite === false);
    const erros = respostas.filter((r) => r.erro !== null);
    registar(`${nome}_ronda_${ronda}`, `${aceites_esperados} aceites, ${n - aceites_esperados} recusadas, 0 erros`,
      `${aceites.length} aceites, ${recusadas.length} recusadas, ${erros.length} erros${erros[0] ? ` (${erros[0].erro})` : ''}`,
      aceites.length === aceites_esperados && recusadas.length === n - aceites_esperados && erros.length === 0);

    const estado = (await estado_lotes(principal, ['L-CONC']))['L-CONC'];
    const ids = aceites.map((r) => (r.resultado as { reserva_id: string }).reserva_id);
    const detalhes = ids.length
      ? await principal.data.app_reserva_detalhe.select(['qtd']).where({ reserva_id: { in: ids } }).first(1000).execute()
      : [];
    const soma = detalhes.reduce((s, d) => s + Number(d.qtd), 0);
    registar(`conc_03_${nome}_ronda_${ronda}`, 'qtd_reservada = 100 = soma dos detalhes aceites; ≤ qtd_sap',
      `qtd_sap=${estado?.qtd_sap}, qtd_reservada=${estado?.qtd_reservada}, soma_detalhes=${soma}`,
      estado?.qtd_reservada === 100 && soma === 100 && estado.qtd_reservada <= estado.qtd_sap);

    if (ronda === 1 && nome === 'conc_01') {
      const aud = await auditoria_de(ids);
      const por_id = new Map<string, number>();
      for (const a of aud) if (a.acao === 'reservar') por_id.set(String(a.entidade_id), (por_id.get(String(a.entidade_id)) ?? 0) + 1);
      const certos = ids.filter((id) => por_id.get(id) === 1).length;
      registar('aud_01_reservas', `1 linha 'reservar' por reserva aceite (${ids.length})`,
        `${certos}/${ids.length} com exatamente 1; total linhas 'reservar' = ${[...por_id.values()].reduce((a, b) => a + b, 0)}`,
        certos === ids.length && aud.filter((a) => a.acao === 'reservar').length === ids.length);
    }
  }
}
registar('latencia_reservar', 'medida', `n=${latencias.length}, p50=${percentil(latencias, 50)} ms, p95=${percentil(latencias, 95)} ms, máx=${Math.max(...latencias)} ms`, true);

// ------------------------------------------------------------- atom_01 / 02
await repor_estado(principal);
{
  const antes = await estado_lotes(principal, ['L-CONC', 'L-ATOM']);
  const reservas_antes = (await principal.data.app_reserva.select(['id']).where({ num_encomenda: { eq: 'ENC-0001' }, num_linha: { eq: 2 } }).execute()).length;
  const r = await reservar(0, 2, [{ cod_lote: 'L-CONC', qtd: 10 }, { cod_lote: 'L-ATOM', qtd: 10 }]);
  const depois = await estado_lotes(principal, ['L-CONC', 'L-ATOM']);
  const reservas_depois = (await principal.data.app_reserva.select(['id']).where({ num_encomenda: { eq: 'ENC-0001' }, num_linha: { eq: 2 } }).execute()).length;
  const res = r.resultado as { aceite: boolean; motivo: string | null } | undefined;
  registar('atom_01', 'recusada; L-CONC e L-ATOM inalterados; nenhuma reserva criada',
    `aceite=${res?.aceite}, motivo="${res?.motivo ?? r.erro}", L-CONC ${antes['L-CONC'].qtd_reservada}→${depois['L-CONC'].qtd_reservada}, L-ATOM ${antes['L-ATOM'].qtd_reservada}→${depois['L-ATOM'].qtd_reservada}, reservas ${reservas_antes}→${reservas_depois}`,
    res?.aceite === false && depois['L-CONC'].qtd_reservada === antes['L-CONC'].qtd_reservada
      && depois['L-ATOM'].qtd_reservada === antes['L-ATOM'].qtd_reservada && reservas_depois === reservas_antes);
}

let reserva_atom_02 = '';
{
  const r = await reservar(0, 2, [{ cod_lote: 'L-CONC', qtd: 10 }, { cod_lote: 'L-ATOM', qtd: 5 }]);
  const res = r.resultado as { aceite: boolean; reserva_id: string | null } | undefined;
  reserva_atom_02 = res?.reserva_id ?? '';
  const depois = await estado_lotes(principal, ['L-CONC', 'L-ATOM']);
  registar('atom_02', 'aceite; L-CONC +10, L-ATOM +5',
    `aceite=${res?.aceite}, L-CONC=${depois['L-CONC'].qtd_reservada}, L-ATOM=${depois['L-ATOM'].qtd_reservada}${r.erro ? ` erro=${r.erro}` : ''}`,
    res?.aceite === true && depois['L-CONC'].qtd_reservada === 10 && depois['L-ATOM'].qtd_reservada === 5);
}

// ------------------------------------------------------------ lib_01 / 02
{
  const r = await capturar_erro(() => principal.functions.libertar.invoke({ reserva_id: reserva_atom_02 }));
  const depois = await estado_lotes(principal, ['L-CONC', 'L-ATOM']);
  registar('lib_01', 'libertada; L-CONC 10→0, L-ATOM 5→0',
    `libertada=${(r.resultado as { libertada?: boolean } | undefined)?.libertada}, L-CONC=${depois['L-CONC'].qtd_reservada}, L-ATOM=${depois['L-ATOM'].qtd_reservada}${r.erro ? ` erro=${r.erro}` : ''}`,
    (r.resultado as { libertada?: boolean } | undefined)?.libertada === true
      && depois['L-CONC'].qtd_reservada === 0 && depois['L-ATOM'].qtd_reservada === 0);
}

const libertadas_ids: string[] = [reserva_atom_02];
for (const paralelas of [2, 5]) {
  await repor_estado(principal);
  const nova = await reservar(0, 1, [{ cod_lote: 'L-CONC', qtd: 10 }]);
  const id = (nova.resultado as { reserva_id: string }).reserva_id;
  libertadas_ids.push(id);
  const respostas = await Promise.all(Array.from({ length: paralelas }, (_, i) =>
    capturar_erro(() => clientes[i % N_CLIENTES].functions.libertar.invoke({ reserva_id: id }))));
  const ok = respostas.filter((r) => (r.resultado as { libertada?: boolean } | undefined)?.libertada === true).length;
  const recusadas = respostas.filter((r) => (r.resultado as { libertada?: boolean } | undefined)?.libertada === false).length;
  const erros = respostas.filter((r) => r.erro !== null).length;
  const depois = (await estado_lotes(principal, ['L-CONC']))['L-CONC'];
  registar(`lib_02_${paralelas}_paralelas`, `1 libertada, ${paralelas - 1} recusadas; L-CONC 10→0 (desce uma vez)`,
    `${ok} libertadas, ${recusadas} recusadas, ${erros} erros; L-CONC=${depois.qtd_reservada}`,
    ok === 1 && recusadas === paralelas - 1 && erros === 0 && depois.qtd_reservada === 0);
}

{
  const aud = await auditoria_de(libertadas_ids);
  const libertacoes = aud.filter((a) => a.acao === 'libertar');
  const por_id = new Set(libertacoes.map((a) => String(a.entidade_id)));
  registar('aud_01_libertacoes', `1 linha 'libertar' por libertação (${libertadas_ids.length})`,
    `${libertacoes.length} linhas, ${por_id.size} reservas distintas; autor = utilizador autenticado: ${libertacoes.every((a) => a.utilizador === id_utilizador)}`,
    libertacoes.length === libertadas_ids.length && por_id.size === libertadas_ids.length
      && libertacoes.every((a) => a.utilizador === id_utilizador));
}

// ------------------------------------------------------------------- aut_02
await repor_estado(principal);
{
  forjar_identidade = true;
  const r = await reservar(0, 1, [{ cod_lote: 'L-CONC', qtd: 10 }]);
  forjar_identidade = false;
  const id = (r.resultado as { reserva_id?: string } | undefined)?.reserva_id;
  const gravada = id
    ? (await principal.data.app_reserva.select(['id', 'criado_por']).where({ id: { eq: id } }).execute())[0] ?? null
    : null;
  const aud = id ? await auditoria_de([id]) : [];
  registar('aut_02', 'criado_por e autor da auditoria = identidade autenticada (não o valor forjado)',
    `chaves do corpo original: [${chaves_corpo_original.join(', ')}]; criado_por=${gravada?.criado_por === id_utilizador ? 'utilizador autenticado' : gravada?.criado_por}; auditoria=${aud.every((a) => a.utilizador === id_utilizador) ? 'utilizador autenticado' : aud.map((a) => a.utilizador).join(',')}${r.erro ? ` erro=${r.erro}` : ''}`,
    Boolean(id) && gravada?.criado_por === id_utilizador && aud.length === 1 && aud[0].utilizador === id_utilizador);

  // aut_03 sobre uma linha real de auditoria
  const linha = aud[0];
  if (linha) {
    const upd = await capturar_erro(() => principal.data.app_registo_auditoria.update({ id: String(linha.id) }, { acao: 'adulterada' }));
    const del = await capturar_erro(() => principal.data.app_registo_auditoria.delete({ id: String(linha.id) }));
    const depois = (await principal.data.app_registo_auditoria.select(['id', 'acao']).where({ id: { eq: String(linha.id) } }).execute())[0];
    registar('aut_03_linha_real', 'update e delete negados; linha intacta',
      `update: ${upd.erro ? 'negado' : 'ACEITE'}; delete: ${del.erro ? 'negado' : 'ACEITE'}; acao depois='${depois?.acao}'`,
      upd.erro !== null && del.erro !== null && depois?.acao === 'reservar');
  }
}

await repor_estado(principal);
for (const c of clientes) c.dispose();
console.table(resultados);
const falhas = resultados.filter((r) => r.status === 'falha').length;
console.log(`${new Date().toISOString()} | ${resultados.length} testes | ${falhas} falhas`);
process.exit(falhas > 0 ? 1 : 0);
