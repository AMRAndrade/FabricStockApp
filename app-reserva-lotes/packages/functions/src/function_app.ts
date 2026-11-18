import {
  UserDataFunctions,
  type RayfinContext,
  type SqlErrorDetails,
  type WithSql,
} from '@microsoft/fabric-user-data-functions';
import type { UniversalAppSchema } from '@rayfin-app/shared';

const udf = new UserDataFunctions();

type contexto_sql = RayfinContext<UniversalAppSchema> & WithSql;

/** Resultado de uma sonda: ok, ou o erro devolvido pelo serviço (sem dados sensíveis). */
interface resultado_sonda {
  ok: boolean;
  detalhe: string;
}

interface resultado_diagnostico {
  /** `ctx.user.id` (claims.sub) visto no servidor. */
  utilizador: string;
  sql_identidade: resultado_sonda;
  sql_tabelas_app: resultado_sonda;
  sql_restricoes: resultado_sonda;
  sql_transacao_multi_instrucao: resultado_sonda;
}

function descrever_erro(erro: unknown): string {
  const detalhes = erro as SqlErrorDetails & { message?: string };
  return [
    detalhes.code && `code=${detalhes.code}`,
    detalhes.sqlErrorNumber !== undefined && `sql=${detalhes.sqlErrorNumber}`,
    detalhes.message,
  ].filter(Boolean).join(' · ').slice(0, 500);
}

async function sondar(acao: () => Promise<string>): Promise<resultado_sonda> {
  try {
    return { ok: true, detalhe: await acao() };
  } catch (erro) {
    return { ok: false, detalhe: descrever_erro(erro) };
  }
}

/**
 * Fase 3 — diagnóstico da plataforma (só leitura; a transação de teste não
 * altera dados). Responde: que identidade o servidor vê; se o raw SQL está
 * ativo neste tenant; que nomes de tabela o Rayfin gerou; que restrições
 * existem; e se um lote T-SQL com BEGIN TRAN / COMMIT corre numa só chamada.
 */
udf.func(
  'diagnostico',
  async (ctx: contexto_sql): Promise<resultado_diagnostico> => {
    const linhas = (r: { rows: unknown[][] }) => r.rows.map((l) => l.join(' ')).join(' | ');
    return {
      utilizador: ctx.user.id,
      sql_identidade: await sondar(async () =>
        linhas(await ctx.sql.query('SELECT DB_NAME(), SUSER_SNAME(), @@VERSION', {}))),
      sql_tabelas_app: await sondar(async () =>
        linhas(await ctx.sql.query(
          "SELECT TABLE_SCHEMA + '.' + TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE 'app[_]%' ORDER BY 1", {}))),
      sql_restricoes: await sondar(async () => {
        const chaves = await ctx.sql.query(
          "SELECT t.name, k.type_desc FROM sys.key_constraints k JOIN sys.tables t ON t.object_id = k.parent_object_id WHERE t.name LIKE 'app[_]%' ORDER BY 1, 2", {});
        const fks = await ctx.sql.query(
          "SELECT t.name, f.name FROM sys.foreign_keys f JOIN sys.tables t ON t.object_id = f.parent_object_id WHERE t.name LIKE 'app[_]%' ORDER BY 1", {});
        const checks = await ctx.sql.query(
          "SELECT t.name, CAST(c.definition AS nvarchar(400)) FROM sys.check_constraints c JOIN sys.tables t ON t.object_id = c.parent_object_id WHERE t.name LIKE 'app[_]%' ORDER BY 1", {});
        return `chaves: ${linhas(chaves)} || fks: ${linhas(fks)} || checks: ${linhas(checks) || '(nenhum)'}`;
      }),
      sql_transacao_multi_instrucao: await sondar(async () => {
        const r = await ctx.sql.execute(
          `SET XACT_ABORT ON;
           BEGIN TRAN;
             DECLARE @n int = (SELECT COUNT(*) FROM dbo.app_saldo_lotes WITH (UPDLOCK, HOLDLOCK) WHERE 1 = 0);
           COMMIT;`, {});
        return `rowsAffected=${r.rowsAffected}`;
      }),
    };
  },
  [],
);
