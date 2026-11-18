/**
 * Function schema types for RayfinClient.
 *
 * AUTO-GENERATED — do not edit manually.
 * Re-generated automatically when function source files change.
 *
 * If this file is not updating automatically, run:
 *   rayfin dev functions apply
 *
 * The schema is a closed object type: only the function names listed
 * below are accepted by RayfinClient.functions.<name>.invoke(...).
 * Adding, renaming, or changing the signature of a udf.func() call
 * regenerates this file and surfaces type errors at every consumer.
 *
 * IMPORTANT: This file must NOT import any Node.js packages — it is
 * resolved by the frontend app's TypeScript compiler.
 */

export type AppFunctionsSchema = {
  reservar: {
    input: { num_encomenda: string; num_linha: number; linhas: { cod_armazem: string; cod_artigo: string; cod_lote: string; qtd: number }[] };
    output: { aceite: boolean; reserva_id: null | string; motivo: null | string; lotes_insuficientes: string[]; ms_sql: number };
  };
  libertar: {
    input: { reserva_id: string };
    output: { libertada: boolean; motivo: null | string; ms_sql: number };
  };
  sincronizar_stock: {
    input: Record<string, never>;
    output: { linhas_origem: number; inseridos: number; atualizados: number; alertas_novos: number; alertas_abertos: number; ms: number; erro: null | string };
  };
  repor_lotes_teste: {
    input: Record<string, never>;
    output: { reservas_apagadas: number; lotes_repostos: number };
  };
  diagnostico: {
    input: Record<string, never>;
    output: { utilizador: string; sql_identidade: { ok: boolean; detalhe: string }; sql_tabelas_app: { ok: boolean; detalhe: string }; sql_restricoes: { ok: boolean; detalhe: string }; sql_indices_unicos: { ok: boolean; detalhe: string }; sql_transacao_multi_instrucao: { ok: boolean; detalhe: string } };
  };
};
