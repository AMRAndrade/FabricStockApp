/**
 * Contratos isomórficos (browser e servidor) das entidades da app.
 * Manter alinhados com as classes decoradas em `@rayfin-app/data`;
 * este pacote não importa as classes decoradas.
 */
export interface app_saldo_lote_registo {
  id: string;
  chave: string;
  cod_empresa: string;
  cod_armazem: string;
  cod_artigo: string;
  cod_lote: string;
  qtd_sap: number;
  qtd_reservada: number;
  atualizado_em: Date;
}

export type estado_reserva = 'ativa' | 'libertada';

export interface app_reserva_registo {
  id: string;
  cod_empresa: string;
  num_encomenda: string;
  num_linha: number;
  estado: estado_reserva;
  criado_por: string;
  criado_em: Date;
  libertado_em?: Date;
}

export interface app_reserva_detalhe_registo {
  id: string;
  reserva_id: string;
  cod_armazem: string;
  cod_artigo: string;
  cod_lote: string;
  qtd: number;
}

export interface app_alerta_stock_registo {
  id: string;
  chave: string;
  reserva_id: string;
  cod_armazem: string;
  cod_artigo: string;
  cod_lote: string;
  num_encomenda: string;
  qtd_reservada: number;
  qtd_sap: number;
  estado: 'aberto' | 'resolvido';
  criado_em: Date;
}

export interface app_registo_auditoria_registo {
  id: string;
  utilizador: string;
  acao: string;
  entidade: string;
  entidade_id: string;
  antes?: string;
  depois?: string;
  criado_em: Date;
}

export type UniversalAppSchema = {
  app_saldo_lote: app_saldo_lote_registo;
  app_reserva: app_reserva_registo;
  app_reserva_detalhe: app_reserva_detalhe_registo;
  app_alerta_stock: app_alerta_stock_registo;
  app_registo_auditoria: app_registo_auditoria_registo;
};
