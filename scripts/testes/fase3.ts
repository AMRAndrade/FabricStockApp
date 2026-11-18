// Testes da Fase 3 (CLAUDE.md §7.3), chamando a API diretamente (não a UI).
//   aut_01  escrita sem autenticação → negada (API de dados e funções)
//   aut_03  alterar/apagar app_registo_auditoria com sessão válida → negado
//   extra   escrita direta em app_saldo_lote/app_reserva com sessão válida → negada
//   filtro_01  laranja, brix > 65, stock > 0 → 12 lotes (com tempo)
// aut_02 (criado_por forjado) depende da função `reservar` e corre na Fase 4.
//
// Uso: cd scripts; npx tsx testes/fase3.ts

import { randomUUID } from 'node:crypto';
import { capturar_erro, criar_cliente, criar_cliente_autenticado, ler_env } from '../lib/cliente.ts';

// Interceta o fetch para registar a resposta real do servidor (estado e erros
// GraphQL) das recusas.
const respostas: { url: string; status: number; corpo: string }[] = [];
const fetch_original = globalThis.fetch;
globalThis.fetch = async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const r = await fetch_original(entrada, init);
  if (String(entrada).includes('/graphql')) {
    respostas.push({ url: String(entrada), status: r.status, corpo: (await r.clone().text()).slice(0, 400) });
  }
  return r;
};
const ultimo_erro_servidor = () => {
  const r = respostas.at(-1);
  return r ? ` [servidor: HTTP ${r.status} ${r.corpo.replace(/\s+/g, ' ').slice(0, 220)}]` : '';
};

interface resultado_teste {
  teste: string;
  esperado: string;
  obtido: string;
  status: 'ok' | 'falha';
}

const resultados: resultado_teste[] = [];
function registar(teste: string, esperado: string, obtido: string, passou: boolean): void {
  resultados.push({ teste, esperado, obtido, status: passou ? 'ok' : 'falha' });
}

const LOTES_ESPERADOS = ['L-ALRT', 'L-ATOM', 'L-CONC'];
const LOTES_EXCLUIDOS = ['L-FORA', 'L-LIM'];

// ---------------------------------------------------------------- aut_01
{
  const anonimo = criar_cliente();
  const escrita = await capturar_erro(() =>
    anonimo.data.app_saldo_lote.create({
      chave: 'X|X|X|X', cod_empresa: 'X', cod_armazem: 'X', cod_artigo: 'X', cod_lote: 'X',
      qtd_sap: 1, qtd_reservada: 0, atualizado_em: new Date(),
    }));
  registar('aut_01_dados_create_sem_sessao', 'negado', escrita.erro ?? 'ACEITE', escrita.erro !== null);

  const funcao = await capturar_erro(() => anonimo.functions.diagnostico.invoke());
  registar('aut_01_funcao_sem_sessao', 'negado', funcao.erro ?? 'ACEITE', funcao.erro !== null);

  anonimo.dispose();

  // Pedidos HTTP crus, sem Authorization: a recusa tem de vir do servidor, não do SDK.
  const env = ler_env();
  const base = env.RAYFIN_PUBLIC_API_URL.endsWith('/') ? env.RAYFIN_PUBLIC_API_URL : `${env.RAYFIN_PUBLIC_API_URL}/`;
  const cab = { 'Content-Type': 'application/json', 'x-rayfin-publishable-key': env.RAYFIN_PUBLIC_PUBLISHABLE_KEY };
  const gql = await fetch_original(new URL('graphql', base), {
    method: 'POST', headers: cab, body: JSON.stringify({ query: '{ __typename }' }),
  });
  registar('aut_01_graphql_http_sem_token', 'HTTP 401/403', `HTTP ${gql.status}`, gql.status === 401 || gql.status === 403);
  const fn = await fetch_original(new URL('functions/diagnostico/invoke', base), {
    method: 'POST', headers: cab, body: '{}',
  });
  registar('aut_01_funcao_http_sem_token', 'HTTP 401/403', `HTTP ${fn.status}`, fn.status === 401 || fn.status === 403);
}

const cliente = await criar_cliente_autenticado();

// ---------------------------------------------------------------- aut_03
{
  const id = randomUUID();
  const criar = await capturar_erro(() =>
    cliente.data.app_registo_auditoria.create({
      utilizador: 'forjado', acao: 'teste', entidade: 'teste', entidade_id: id, criado_em: new Date(),
    }));
  registar('aut_03_auditoria_create_cliente', 'negado', (criar.erro ?? 'ACEITE') + ultimo_erro_servidor(), criar.erro !== null);

  const alterar = await capturar_erro(() => cliente.data.app_registo_auditoria.update({ id }, { acao: 'alterada' }));
  registar('aut_03_auditoria_update', 'negado', (alterar.erro ?? 'ACEITE') + ultimo_erro_servidor(), alterar.erro !== null);

  const apagar = await capturar_erro(() => cliente.data.app_registo_auditoria.delete({ id }));
  registar('aut_03_auditoria_delete', 'negado', (apagar.erro ?? 'ACEITE') + ultimo_erro_servidor(), apagar.erro !== null);

  const ler = await capturar_erro(() => cliente.data.app_registo_auditoria.select(['id']).first(1).execute());
  registar('aut_03_auditoria_read', 'permitido', ler.erro ?? 'permitido', ler.erro === null);
}

// ------------------------------------------- escrita direta nas âncoras (regra 6)
{
  const saldo = await capturar_erro(() =>
    cliente.data.app_saldo_lote.create({
      chave: 'X|X|X|X', cod_empresa: 'X', cod_armazem: 'X', cod_artigo: 'X', cod_lote: 'X',
      qtd_sap: 1, qtd_reservada: 0, atualizado_em: new Date(),
    }));
  registar('extra_saldo_create_cliente', 'negado', (saldo.erro ?? 'ACEITE') + ultimo_erro_servidor(), saldo.erro !== null);

  const saldo_upd = await capturar_erro(() => cliente.data.app_saldo_lote.update({ id: randomUUID() }, { qtd_reservada: 0 }));
  registar('extra_saldo_update_cliente', 'negado', (saldo_upd.erro ?? 'ACEITE') + ultimo_erro_servidor(), saldo_upd.erro !== null);

  const reserva = await capturar_erro(() =>
    cliente.data.app_reserva.create({
      cod_empresa: 'EMP01', num_encomenda: 'ENC-0001', num_linha: 1, estado: 'ativa',
      criado_por: 'forjado', criado_em: new Date(),
    }));
  registar('extra_reserva_create_cliente', 'negado', (reserva.erro ?? 'ACEITE') + ultimo_erro_servidor(), reserva.erro !== null);
}


// ------------------------- prova no servidor: nenhuma linha das tentativas gravada
{
  // Nota: a introspeção GraphQL devolve o esquema vazio neste serviço (nem as
  // consultas app_* aparecem), por isso não serve de prova; a evidência
  // estrutural é a configuração DAB aplicada (authenticated: só read).
  const contar = async (q: () => Promise<unknown[]>) => (await q()).length;
  const n_saldo = await contar(() => cliente.data.app_saldo_lote.select(['id']).where({ chave: { eq: 'X|X|X|X' } }).execute());
  const n_reserva = await contar(() => cliente.data.app_reserva.select(['id']).where({ criado_por: { eq: 'forjado' } }).execute());
  const n_auditoria = await contar(() => cliente.data.app_registo_auditoria.select(['id']).where({ utilizador: { eq: 'forjado' } }).execute());
  registar('extra_nenhuma_linha_gravada', '0 linhas das tentativas recusadas',
    `saldo=${n_saldo}, reserva=${n_reserva}, auditoria=${n_auditoria}`, n_saldo + n_reserva + n_auditoria === 0);
}

// ---------------------------------------------------------------- filtro_01
{
  const lh = cliente.connectors.lh_reserva_lotes;
  const inicio = performance.now();
  const [artigos, brix, stock] = await Promise.all([
    lh.dim_artigo.select(['cod_artigo']).where({ grupo_artigo: { eq: 'laranja' } }).first(1000).execute(),
    lh.fato_lote_atributo.select(['cod_empresa', 'cod_artigo', 'cod_lote', 'valor_numero'])
      .where({ cod_atributo: { eq: 'brix' }, valor_numero: { gt: 65 } }).first(1000).execute(),
    lh.fato_stock.select(['cod_empresa', 'cod_artigo', 'cod_lote', 'qtd_fisica'])
      .where({ qtd_fisica: { gt: 0 } }).first(1000).execute(),
  ]);
  const ms = Math.round(performance.now() - inicio);
  const laranja = new Set(artigos.map((a) => a.cod_artigo));
  const com_stock = new Set(stock.map((s) => `${s.cod_empresa}|${s.cod_artigo}|${s.cod_lote}`));
  const lotes = brix
    .filter((b) => laranja.has(b.cod_artigo) && com_stock.has(`${b.cod_empresa}|${b.cod_artigo}|${b.cod_lote}`))
    .map((b) => b.cod_lote as string)
    .sort();
  const passou = lotes.length === 12
    && LOTES_ESPERADOS.every((l) => lotes.includes(l))
    && LOTES_EXCLUIDOS.every((l) => !lotes.includes(l));
  registar('filtro_01', `12 lotes (com ${LOTES_ESPERADOS.join(', ')}; sem ${LOTES_EXCLUIDOS.join(', ')})`,
    `${lotes.length} lotes em ${ms} ms: ${lotes.join(', ')}`, passou);
}

cliente.dispose();
console.table(resultados);
const falhas = resultados.filter((r) => r.status === 'falha').length;
console.log(`${new Date().toISOString()} | ${resultados.length} testes | ${falhas} falhas`);
process.exit(falhas > 0 ? 1 : 0);
