// Acesso a dados da UI. Só consome o backend (regra 8): conector do Lakehouse
// (leitura, identidade do utilizador), BD da app (leitura) e funções (escrita).
// Sem dados embutidos: qualquer falha sobe para o ecrã como estado de erro.

import { useCallback, useEffect, useState } from 'react';
import { getRayfinClient } from './rayfin-client';

export const LIMITE_LEITURA = 1000;

export interface linha_encomenda {
  num_encomenda: string;
  num_linha: number;
  cod_artigo: string;
  nome_artigo: string;
  qtd_pendente: number;
  nome_cliente: string;
  data_entrega: string;
}

export interface atributo_numerico {
  cod_atributo: string;
  nome_atributo: string;
  unidade: string;
}

export interface lote_disponivel {
  cod_empresa: string;
  cod_armazem: string;
  cod_artigo: string;
  cod_lote: string;
  estado_lote: string;
  data_validade: string;
  qtd_sap: number;
  qtd_reservada: number;
  disponivel: number;
  /** Atributos de qualidade do lote: cod_atributo → valor (número ou texto). */
  atributos: Record<string, number | string>;
}

export interface reserva_ativa {
  id: string;
  num_encomenda: string;
  num_linha: number;
  criado_em: string;
  detalhes: { cod_armazem: string; cod_artigo: string; cod_lote: string; qtd: number }[];
}

export interface alerta_stock {
  id: string;
  cod_artigo: string;
  cod_lote: string;
  reserva_id: string;
  num_encomenda: string;
  qtd_reservada: number;
  qtd_sap: number;
  criado_em: string;
}

const texto = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const numero = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const data_curta = (v: unknown) => (v ? new Date(String(v)).toISOString().slice(0, 10) : '');

/** Linhas das encomendas abertas, com artigo e cliente. */
export async function ler_linhas_encomenda(): Promise<linha_encomenda[]> {
  const lh = (await getRayfinClient()).connectors.lh_reserva_lotes;
  const [encomendas, linhas, artigos] = await Promise.all([
    lh.fato_encomenda.select(['num_encomenda', 'nome_cliente', 'data_entrega']).first(LIMITE_LEITURA).execute(),
    lh.fato_encomenda_linha.select(['num_encomenda', 'num_linha', 'cod_artigo', 'qtd_pendente']).first(LIMITE_LEITURA).execute(),
    lh.dim_artigo.select(['cod_artigo', 'nome_artigo']).first(LIMITE_LEITURA).execute(),
  ]);
  const enc = new Map(encomendas.map((e) => [texto(e.num_encomenda), e]));
  const art = new Map(artigos.map((a) => [texto(a.cod_artigo), texto(a.nome_artigo)]));
  return linhas
    .map((l) => {
      const e = enc.get(texto(l.num_encomenda));
      return {
        num_encomenda: texto(l.num_encomenda),
        num_linha: numero(l.num_linha),
        cod_artigo: texto(l.cod_artigo),
        nome_artigo: art.get(texto(l.cod_artigo)) ?? texto(l.cod_artigo),
        qtd_pendente: numero(l.qtd_pendente),
        nome_cliente: texto(e?.nome_cliente),
        data_entrega: data_curta(e?.data_entrega),
      };
    })
    .sort((a, b) => a.num_encomenda.localeCompare(b.num_encomenda) || a.num_linha - b.num_linha);
}

export async function ler_atributos_numericos(): Promise<atributo_numerico[]> {
  const lh = (await getRayfinClient()).connectors.lh_reserva_lotes;
  const atributos = await lh.dim_atributo_qualidade
    .select(['cod_atributo', 'nome_atributo', 'tipo_valor', 'unidade'])
    .where({ tipo_valor: { eq: 'numero' } })
    .first(LIMITE_LEITURA).execute();
  return atributos.map((a) => ({ cod_atributo: texto(a.cod_atributo), nome_atributo: texto(a.nome_atributo), unidade: texto(a.unidade) }));
}

/**
 * Lotes de um artigo com atributos (Lakehouse) e saldo (BD da app).
 * Disponível = qtd_sap − qtd_reservada (app_saldo_lote, sincronizado do Lakehouse).
 */
export async function ler_lotes_artigo(cod_artigo: string): Promise<lote_disponivel[]> {
  const cliente = await getRayfinClient();
  const lh = cliente.connectors.lh_reserva_lotes;
  const [lotes, atributos, saldos] = await Promise.all([
    lh.dim_lote.select(['cod_empresa', 'cod_artigo', 'cod_lote', 'estado_lote', 'data_validade'])
      .where({ cod_artigo: { eq: cod_artigo } }).first(LIMITE_LEITURA).execute(),
    lh.fato_lote_atributo.select(['cod_lote', 'cod_atributo', 'valor_numero', 'valor_texto'])
      .where({ cod_artigo: { eq: cod_artigo } }).first(LIMITE_LEITURA).execute(),
    cliente.data.app_saldo_lote.select(['cod_empresa', 'cod_armazem', 'cod_artigo', 'cod_lote', 'qtd_sap', 'qtd_reservada'])
      .where({ cod_artigo: { eq: cod_artigo } }).first(LIMITE_LEITURA).execute(),
  ]);
  const por_lote = new Map<string, Record<string, number | string>>();
  for (const a of atributos) {
    const mapa = por_lote.get(texto(a.cod_lote)) ?? {};
    mapa[texto(a.cod_atributo)] = a.valor_numero !== null && a.valor_numero !== undefined ? numero(a.valor_numero) : texto(a.valor_texto);
    por_lote.set(texto(a.cod_lote), mapa);
  }
  const info = new Map(lotes.map((l) => [texto(l.cod_lote), l]));
  return saldos
    .map((s) => {
      const l = info.get(texto(s.cod_lote));
      const qtd_sap = numero(s.qtd_sap);
      const qtd_reservada = numero(s.qtd_reservada);
      return {
        cod_empresa: texto(s.cod_empresa),
        cod_armazem: texto(s.cod_armazem),
        cod_artigo: texto(s.cod_artigo),
        cod_lote: texto(s.cod_lote),
        estado_lote: texto(l?.estado_lote),
        data_validade: data_curta(l?.data_validade),
        qtd_sap,
        qtd_reservada,
        disponivel: Math.round((qtd_sap - qtd_reservada) * 1000) / 1000,
        atributos: por_lote.get(texto(s.cod_lote)) ?? {},
      };
    })
    .sort((a, b) => a.cod_lote.localeCompare(b.cod_lote));
}

export async function ler_reservas_ativas(): Promise<reserva_ativa[]> {
  const cliente = await getRayfinClient();
  const reservas = await cliente.data.app_reserva
    .select(['id', 'num_encomenda', 'num_linha', 'criado_em'])
    .where({ estado: { eq: 'ativa' } })
    .orderBy({ criado_em: 'desc' })
    .first(LIMITE_LEITURA).execute();
  if (reservas.length === 0) return [];
  const detalhes = await cliente.data.app_reserva_detalhe
    .select(['reserva_id', 'cod_armazem', 'cod_artigo', 'cod_lote', 'qtd'])
    .where({ reserva_id: { in: reservas.map((r) => texto(r.id)) } })
    .first(LIMITE_LEITURA).execute();
  return reservas.map((r) => ({
    id: texto(r.id),
    num_encomenda: texto(r.num_encomenda),
    num_linha: numero(r.num_linha),
    criado_em: texto(r.criado_em),
    detalhes: detalhes
      .filter((d) => texto(d.reserva_id) === texto(r.id))
      .map((d) => ({ cod_armazem: texto(d.cod_armazem), cod_artigo: texto(d.cod_artigo), cod_lote: texto(d.cod_lote), qtd: numero(d.qtd) })),
  }));
}

export async function ler_alertas_abertos(): Promise<alerta_stock[]> {
  const cliente = await getRayfinClient();
  const alertas = await cliente.data.app_alerta_stock
    .select(['id', 'cod_artigo', 'cod_lote', 'reserva_id', 'num_encomenda', 'qtd_reservada', 'qtd_sap', 'criado_em'])
    .where({ estado: { eq: 'aberto' } })
    .orderBy({ criado_em: 'desc' })
    .first(LIMITE_LEITURA).execute();
  return alertas.map((a) => ({
    id: texto(a.id),
    cod_artigo: texto(a.cod_artigo),
    cod_lote: texto(a.cod_lote),
    reserva_id: texto(a.reserva_id),
    num_encomenda: texto(a.num_encomenda),
    qtd_reservada: numero(a.qtd_reservada),
    qtd_sap: numero(a.qtd_sap),
    criado_em: texto(a.criado_em),
  }));
}

export async function reservar(linha: linha_encomenda, lotes: { lote: lote_disponivel; qtd: number }[]) {
  const cliente = await getRayfinClient();
  return cliente.functions.reservar.invoke({
    num_encomenda: linha.num_encomenda,
    num_linha: linha.num_linha,
    linhas: lotes.map(({ lote, qtd }) => ({ cod_armazem: lote.cod_armazem, cod_artigo: lote.cod_artigo, cod_lote: lote.cod_lote, qtd })),
  });
}

export async function libertar(reserva_id: string) {
  const cliente = await getRayfinClient();
  return cliente.functions.libertar.invoke({ reserva_id });
}

export function mensagem_erro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

/** Estado de uma leitura assíncrona: a carregar, erro ou dados; `recarregar` repete. */
export function useLeitura<T>(ler: () => Promise<T>, dependencias: unknown[]) {
  const [versao, set_versao] = useState(0);
  // A leitura em curso é identificada pelas dependências + versão; enquanto o
  // resultado guardado for de outra chave, o estado é "a carregar".
  const chave = JSON.stringify([...dependencias, versao]);
  const [estado, set_estado] = useState<{ chave: string | null; erro: string | null; dados: T | null }>({
    chave: null, erro: null, dados: null,
  });
  const recarregar = useCallback(() => set_versao((v) => v + 1), []);
  useEffect(() => {
    let cancelado = false;
    ler()
      .then((dados) => { if (!cancelado) set_estado({ chave, erro: null, dados }); })
      .catch((erro: unknown) => { if (!cancelado) set_estado({ chave, erro: mensagem_erro(erro), dados: null }); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  const a_carregar = estado.chave !== chave;
  return {
    a_carregar,
    erro: a_carregar ? null : estado.erro,
    dados: a_carregar ? null : estado.dados,
    recarregar,
  };
}
