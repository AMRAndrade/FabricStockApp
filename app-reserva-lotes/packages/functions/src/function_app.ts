import {
  AudienceType,
  UserDataFunctions,
  type RayfinContext,
  type SqlErrorDetails,
  type WithSql,
} from '@microsoft/fabric-user-data-functions';
import { parquetReadObjects } from 'hyparquet';
import type { UniversalAppSchema } from '@rayfin-app/shared';

const udf = new UserDataFunctions();

// Todas as escritas na BD da app passam por aqui, com raw SQL (`ctx.sql`), que
// corre com a identidade da app (dono do item). A identidade do utilizador vem
// sempre de `ctx.user.id` — nunca de um parâmetro (regra 7).
type contexto_sql = RayfinContext<UniversalAppSchema> & WithSql;
type contexto_sql_onelake = RayfinContext<UniversalAppSchema, AudienceType.Storage> & WithSql;

const COD_EMPRESA_UNICA = 'EMP01';
const LOTES_TESTE = ['L-CONC', 'L-ATOM', 'L-ALRT', 'L-FORA', 'L-LIM'];
const MAX_LINHAS = 20;
const TENTATIVAS_DEADLOCK = 3;

// ------------------------------------------------------------------ tipos

/** Uma linha do pedido de reserva: um lote e a quantidade a reservar. */
export interface linha_reserva {
  cod_armazem: string;
  cod_artigo: string;
  cod_lote: string;
  qtd: number;
}

export interface resultado_reserva {
  aceite: boolean;
  reserva_id: string | null;
  /** Mensagem para o utilizador quando recusada (ex.: stock insuficiente). */
  motivo: string | null;
  /** Lotes sem disponível suficiente: `lote: pedido X, disponível Y`. */
  lotes_insuficientes: string[];
  ms_sql: number;
}

export interface resultado_libertacao {
  libertada: boolean;
  motivo: string | null;
  ms_sql: number;
}

export interface resultado_sincronizacao {
  linhas_origem: number;
  inseridos: number;
  atualizados: number;
  alertas_novos: number;
  alertas_abertos: number;
  ms: number;
  /** Etapa e erro quando a sincronização falha (a plataforma esconde exceções). */
  erro: string | null;
}

export interface resultado_reposicao {
  reservas_apagadas: number;
  lotes_repostos: number;
}

interface resultado_sonda {
  ok: boolean;
  detalhe: string;
}

interface resultado_diagnostico {
  utilizador: string;
  sql_identidade: resultado_sonda;
  sql_tabelas_app: resultado_sonda;
  sql_restricoes: resultado_sonda;
  sql_indices_unicos: resultado_sonda;
  sql_transacao_multi_instrucao: resultado_sonda;
}

// --------------------------------------------------------------- auxiliares

class erro_validacao extends Error {}

function descrever_erro(erro: unknown): string {
  const d = erro as SqlErrorDetails & { message?: string };
  return [d.code && `code=${d.code}`, d.sqlErrorNumber !== undefined && `sql=${d.sqlErrorNumber}`, d.message]
    .filter(Boolean).join(' · ').slice(0, 500);
}

function texto(valor: unknown, campo: string, max: number): string {
  if (typeof valor !== 'string' || valor.trim() === '' || valor.length > max) {
    throw new erro_validacao(`${campo} inválido`);
  }
  return valor.trim();
}

function quantidade(valor: unknown, campo: string): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0 || valor > 1e9
    || Math.round(valor * 1000) !== valor * 1000) {
    throw new erro_validacao(`${campo}: quantidade tem de ser > 0 com no máximo 3 casas decimais`);
  }
  return valor;
}

function e_deadlock(erro: unknown): boolean {
  const d = erro as SqlErrorDetails;
  return d.sqlErrorNumber === 1205;
}

/** Repete a operação quando o SQL Server a escolhe como vítima de deadlock. */
async function com_repeticao<T>(acao: () => Promise<T>): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await acao();
    } catch (erro) {
      if (!e_deadlock(erro) || tentativa >= TENTATIVAS_DEADLOCK) throw erro;
      await new Promise((r) => setTimeout(r, 50 * tentativa + Math.random() * 50));
    }
  }
}

/** Primeira linha do resultado como objeto, pelos nomes das colunas. */
function primeira_linha(r: { columns: { name: string }[]; rows: unknown[][] }): Record<string, unknown> {
  const linha = r.rows[0] ?? [];
  return Object.fromEntries(r.columns.map((c, i) => [c.name, linha[i]]));
}

/** Claims não sensíveis de um JWT, para diagnóstico (nunca devolve o token). */
function claims_token(token: string): string {
  try {
    const c = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;
    return JSON.stringify({ aud: c.aud, idtyp: c.idtyp, appid: c.appid, upn: c.upn, scp: c.scp, roles: c.roles, tid_ok: Boolean(c.tid) });
  } catch {
    return 'ilegível';
  }
}

// ------------------------------------------------------------- OneLake (Delta)

const ONELAKE = 'https://onelake.dfs.fabric.microsoft.com';
const WORKSPACE = 'fabric-app-reserva-lotes';
const LAKEHOUSE = 'lh_reserva_lotes.Lakehouse';

/**
 * Lê uma tabela Delta do Lakehouse pelo OneLake (HTTPS, token Storage da app):
 * reproduz os commits JSON de `_delta_log` para obter os ficheiros parquet
 * ativos e lê-os com hyparquet. Sem suporte a deletion vectors nem a logs já
 * compactados (suficiente para tabelas escritas pelo Dataflow em modo substituir).
 */
async function ler_tabela_delta(token: string, tabela: string, colunas: string[]): Promise<Record<string, unknown>[]> {
  const cab = { Authorization: `Bearer ${token}`, 'x-ms-version': '2023-11-03' };
  // Lakehouse com esquemas: as tabelas ficam em Tables/<esquema>/<tabela>.
  const pasta = `${LAKEHOUSE}/Tables/dbo/${tabela}`;
  const lista = await fetch(`${ONELAKE}/${WORKSPACE}?resource=filesystem&recursive=false&directory=${encodeURIComponent(`${pasta}/_delta_log`)}`, { headers: cab });
  if (!lista.ok) throw new Error(`listar _delta_log: HTTP ${lista.status} ${(await lista.text()).slice(0, 200)}`);
  const { paths } = (await lista.json()) as { paths: { name: string }[] };
  const commits = paths.map((p) => p.name).filter((n) => /\/\d{20}\.json$/.test(n)).sort();
  if (commits.length === 0 || !commits[0].endsWith('00000000000000000000.json')) {
    throw new Error(`_delta_log sem o commit 0 (${commits.length} commits): log compactado não suportado`);
  }
  const ativos = new Set<string>();
  for (const commit of commits) {
    const r = await fetch(`${ONELAKE}/${WORKSPACE}/${commit}`, { headers: cab });
    if (!r.ok) throw new Error(`ler ${commit}: HTTP ${r.status}`);
    for (const linha of (await r.text()).split(/\r?\n/)) {
      if (!linha.trim()) continue;
      const acao = JSON.parse(linha) as { add?: { path: string; deletionVector?: unknown }; remove?: { path: string } };
      if (acao.add?.deletionVector) throw new Error('deletion vectors não suportados');
      if (acao.add) ativos.add(decodeURIComponent(acao.add.path));
      if (acao.remove) ativos.delete(decodeURIComponent(acao.remove.path));
    }
  }
  const linhas: Record<string, unknown>[] = [];
  for (const ficheiro of ativos) {
    const r = await fetch(`${ONELAKE}/${WORKSPACE}/${pasta}/${ficheiro.split('/').map(encodeURIComponent).join('/')}`, { headers: cab });
    if (!r.ok) throw new Error(`ler ${ficheiro}: HTTP ${r.status}`);
    linhas.push(...(await parquetReadObjects({ file: await r.arrayBuffer(), columns: colunas })));
  }
  return linhas;
}

// ------------------------------------------------------------------ reservar

/**
 * Reserva quantidades de vários lotes contra uma linha de encomenda.
 *
 * Atómica (regra 6): numa única transação T-SQL, um só UPDATE condicional sobre
 * `app_saldo_lotes` (WITH UPDLOCK, HOLDLOCK) soma `qtd` a `qtd_reservada` apenas
 * onde `qtd_sap − qtd_reservada ≥ qtd`. Se o número de lotes atualizados for
 * diferente do pedido, faz ROLLBACK (tudo ou nada). A reserva, os detalhes e a
 * linha de auditoria são gravados na mesma transação.
 */
udf.func(
  'reservar',
  async (
    ctx: contexto_sql,
    num_encomenda: string,
    num_linha: number,
    linhas: linha_reserva[],
  ): Promise<resultado_reserva> => {
    const inicio = Date.now();
    let pedido: linha_reserva[];
    try {
      texto(num_encomenda, 'num_encomenda', 20);
      if (!Number.isInteger(num_linha) || num_linha < 1) throw new erro_validacao('num_linha inválido');
      if (!Array.isArray(linhas) || linhas.length === 0 || linhas.length > MAX_LINHAS) {
        throw new erro_validacao(`indique entre 1 e ${MAX_LINHAS} lotes`);
      }
      pedido = linhas.map((l, i) => ({
        cod_armazem: texto(l?.cod_armazem, `linhas[${i}].cod_armazem`, 10),
        cod_artigo: texto(l?.cod_artigo, `linhas[${i}].cod_artigo`, 20),
        cod_lote: texto(l?.cod_lote, `linhas[${i}].cod_lote`, 30),
        qtd: quantidade(l?.qtd, `linhas[${i}].qtd`),
      }));
    } catch (erro) {
      if (erro instanceof erro_validacao) {
        return { aceite: false, reserva_id: null, motivo: erro.message, lotes_insuficientes: [], ms_sql: 0 };
      }
      throw erro;
    }

    const r = await com_repeticao(() => ctx.sql.query(
      `SET NOCOUNT ON; SET XACT_ABORT ON;
       DECLARE @l TABLE (chave nvarchar(120) PRIMARY KEY, cod_armazem nvarchar(10), cod_artigo nvarchar(20),
                         cod_lote nvarchar(30), qtd decimal(18,3));
       INSERT @l (chave, cod_armazem, cod_artigo, cod_lote, qtd)
         SELECT @cod_empresa + '|' + cod_armazem + '|' + cod_artigo + '|' + cod_lote,
                cod_armazem, cod_artigo, cod_lote, SUM(qtd)
           FROM OPENJSON(@linhas) WITH (cod_armazem nvarchar(10), cod_artigo nvarchar(20),
                                        cod_lote nvarchar(30), qtd decimal(18,3))
          GROUP BY cod_armazem, cod_artigo, cod_lote;
       DECLARE @pedidos int = (SELECT COUNT(*) FROM @l), @atualizados int;
       DECLARE @resultado nvarchar(20), @detalhe nvarchar(2000), @id uniqueidentifier = NULL;

       BEGIN TRAN;
         UPDATE s
            SET s.qtd_reservada = s.qtd_reservada + l.qtd, s.atualizado_em = SYSUTCDATETIME()
           FROM dbo.app_saldo_lotes AS s WITH (UPDLOCK, HOLDLOCK)
           JOIN @l AS l ON l.chave = s.chave
          WHERE s.qtd_sap - s.qtd_reservada >= l.qtd;
         SET @atualizados = @@ROWCOUNT;

         IF @atualizados = @pedidos
         BEGIN
           SET @id = NEWID();
           INSERT dbo.app_reservas (id, cod_empresa, num_encomenda, num_linha, estado, criado_por, criado_em)
             VALUES (@id, @cod_empresa, @num_encomenda, @num_linha, 'ativa', @utilizador, SYSUTCDATETIME());
           INSERT dbo.app_reserva_detalhes (id, reserva_id, cod_armazem, cod_artigo, cod_lote, qtd)
             SELECT NEWID(), @id, cod_armazem, cod_artigo, cod_lote, qtd FROM @l;
           INSERT dbo.app_registo_auditorias (id, utilizador, acao, entidade, entidade_id, antes, depois, criado_em)
             VALUES (NEWID(), @utilizador, 'reservar', 'app_reserva', LOWER(CONVERT(nvarchar(60), @id)), NULL,
                     (SELECT @num_encomenda AS num_encomenda, @num_linha AS num_linha,
                             (SELECT cod_armazem, cod_artigo, cod_lote, qtd FROM @l FOR JSON PATH) AS linhas
                         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                     SYSUTCDATETIME());
           COMMIT;
           SET @resultado = 'aceite';
         END
         ELSE
         BEGIN
           ROLLBACK;
           SET @resultado = 'recusada';
           SELECT @detalhe = STRING_AGG(l.cod_lote + ': pedido ' + CONVERT(nvarchar(30), l.qtd) + ', disponível '
                    + ISNULL(CONVERT(nvarchar(30), s.qtd_sap - s.qtd_reservada), 'lote inexistente'), ' | ')
             FROM @l AS l LEFT JOIN dbo.app_saldo_lotes AS s ON s.chave = l.chave
            WHERE s.chave IS NULL OR s.qtd_sap - s.qtd_reservada < l.qtd;
         END

       SELECT @resultado AS resultado, LOWER(CONVERT(nvarchar(36), @id)) AS reserva_id, @detalhe AS detalhe;`,
      {
        cod_empresa: COD_EMPRESA_UNICA,
        num_encomenda: num_encomenda.trim(),
        num_linha,
        linhas: JSON.stringify(pedido),
        utilizador: ctx.user.id,
      },
    ));
    const linha = primeira_linha(r);
    const aceite = linha.resultado === 'aceite';
    const detalhe = typeof linha.detalhe === 'string' ? linha.detalhe : '';
    return {
      aceite,
      reserva_id: aceite ? String(linha.reserva_id) : null,
      motivo: aceite ? null : `Stock insuficiente: ${detalhe || 'disponível alterado entretanto'}`,
      lotes_insuficientes: aceite || !detalhe ? [] : detalhe.split(' | '),
      ms_sql: Date.now() - inicio,
    };
  },
  [],
);

// ------------------------------------------------------------------ libertar

/**
 * Liberta uma reserva ativa. A transição `ativa → libertada` é um UPDATE
 * condicional (WITH UPDLOCK, HOLDLOCK): de duas chamadas simultâneas só uma
 * encontra `estado = 'ativa'`; a outra é recusada e qtd_reservada desce uma vez.
 */
udf.func(
  'libertar',
  async (ctx: contexto_sql, reserva_id: string): Promise<resultado_libertacao> => {
    const inicio = Date.now();
    if (typeof reserva_id !== 'string' || !/^[0-9a-fA-F-]{36}$/.test(reserva_id)) {
      return { libertada: false, motivo: 'reserva_id inválido', ms_sql: 0 };
    }
    const r = await com_repeticao(() => ctx.sql.query(
      `SET NOCOUNT ON; SET XACT_ABORT ON;
       DECLARE @id uniqueidentifier = TRY_CONVERT(uniqueidentifier, @reserva_id), @n int, @resultado nvarchar(20);
       BEGIN TRAN;
         UPDATE r SET r.estado = 'libertada', r.libertado_em = SYSUTCDATETIME()
           FROM dbo.app_reservas AS r WITH (UPDLOCK, HOLDLOCK)
          WHERE r.id = @id AND r.estado = 'ativa';
         SET @n = @@ROWCOUNT;
         IF @n = 1
         BEGIN
           UPDATE s SET s.qtd_reservada = s.qtd_reservada - d.qtd, s.atualizado_em = SYSUTCDATETIME()
             FROM dbo.app_saldo_lotes AS s WITH (UPDLOCK, HOLDLOCK)
             JOIN (SELECT r.cod_empresa + '|' + d.cod_armazem + '|' + d.cod_artigo + '|' + d.cod_lote AS chave,
                          SUM(d.qtd) AS qtd
                     FROM dbo.app_reserva_detalhes AS d JOIN dbo.app_reservas AS r ON r.id = d.reserva_id
                    WHERE d.reserva_id = @id
                    GROUP BY r.cod_empresa, d.cod_armazem, d.cod_artigo, d.cod_lote) AS d ON d.chave = s.chave;
           UPDATE dbo.app_alerta_stocks SET estado = 'resolvido' WHERE reserva_id = @id AND estado = 'aberto';
           INSERT dbo.app_registo_auditorias (id, utilizador, acao, entidade, entidade_id, antes, depois, criado_em)
             VALUES (NEWID(), @utilizador, 'libertar', 'app_reserva', LOWER(CONVERT(nvarchar(60), @id)),
                     '{"estado":"ativa"}', '{"estado":"libertada"}', SYSUTCDATETIME());
           COMMIT;
           SET @resultado = 'libertada';
         END
         ELSE
         BEGIN
           ROLLBACK;
           SET @resultado = CASE WHEN EXISTS (SELECT 1 FROM dbo.app_reservas WHERE id = @id)
                                 THEN 'ja_libertada' ELSE 'inexistente' END;
         END
       SELECT @resultado AS resultado;`,
      { reserva_id, utilizador: ctx.user.id },
    ));
    const resultado = primeira_linha(r).resultado;
    return {
      libertada: resultado === 'libertada',
      motivo: resultado === 'libertada' ? null
        : resultado === 'ja_libertada' ? 'A reserva já foi libertada' : 'Reserva inexistente',
      ms_sql: Date.now() - inicio,
    };
  },
  [],
);

// ------------------------------------------------------------ sincronização

/**
 * Lê `fato_stock` do Lakehouse (OneLake/Delta, identidade da app) e atualiza
 * `app_saldo_lotes.qtd_sap` com MERGE, preservando `qtd_reservada`. Idempotente.
 * Depois cria um alerta por (reserva ativa, lote) onde qtd_reservada > qtd_sap,
 * sem duplicar alertas já existentes.
 */
udf.func(
  'sincronizar_stock',
  async (ctx: contexto_sql_onelake): Promise<resultado_sincronizacao> => {
    const inicio = Date.now();
    let etapa = 'token_storage';
    const falha = (erro: unknown): resultado_sincronizacao => ({
      linhas_origem: 0, inseridos: 0, atualizados: 0, alertas_novos: 0, alertas_abertos: 0,
      ms: Date.now() - inicio, erro: `${etapa}: ${descrever_erro(erro)}`,
    });
    try {
    const token = ctx.Tokens.Storage;
    etapa = 'ler_fato_stock_onelake';
    const stock = (await ler_tabela_delta(token, 'fato_stock', ['cod_empresa', 'cod_armazem', 'cod_artigo', 'cod_lote', 'qtd_fisica']))
      .map((l) => ({ ...l, qtd_fisica: Number(l.qtd_fisica) }));
    etapa = 'merge_saldo';
    const r = await com_repeticao(() => ctx.sql.query(
      `SET NOCOUNT ON; SET XACT_ABORT ON;
       DECLARE @f TABLE (chave nvarchar(120) PRIMARY KEY, cod_empresa nvarchar(10), cod_armazem nvarchar(10),
                         cod_artigo nvarchar(20), cod_lote nvarchar(30), qtd decimal(18,3));
       INSERT @f SELECT cod_empresa + '|' + cod_armazem + '|' + cod_artigo + '|' + cod_lote,
                        cod_empresa, cod_armazem, cod_artigo, cod_lote, qtd_fisica
                   FROM OPENJSON(@stock) WITH (cod_empresa nvarchar(10), cod_armazem nvarchar(10),
                        cod_artigo nvarchar(20), cod_lote nvarchar(30), qtd_fisica decimal(18,3));
       DECLARE @acoes TABLE (acao nvarchar(10));
       DECLARE @alertas_novos int;
       BEGIN TRAN;
         MERGE dbo.app_saldo_lotes WITH (HOLDLOCK) AS s
         USING @f AS f ON s.chave = f.chave
         WHEN MATCHED AND s.qtd_sap <> f.qtd THEN
           UPDATE SET s.qtd_sap = f.qtd, s.atualizado_em = SYSUTCDATETIME()
         WHEN NOT MATCHED BY TARGET THEN
           INSERT (id, chave, cod_empresa, cod_armazem, cod_artigo, cod_lote, qtd_sap, qtd_reservada, atualizado_em)
           VALUES (NEWID(), f.chave, f.cod_empresa, f.cod_armazem, f.cod_artigo, f.cod_lote, f.qtd, 0, SYSUTCDATETIME())
         OUTPUT $action INTO @acoes;

         INSERT dbo.app_alerta_stocks (id, chave, reserva_id, cod_armazem, cod_artigo, cod_lote, num_encomenda,
                                       qtd_reservada, qtd_sap, estado, criado_em)
         SELECT NEWID(), CONVERT(nvarchar(36), r.id) + '|' + d.cod_lote, r.id, d.cod_armazem, d.cod_artigo, d.cod_lote,
                r.num_encomenda, s.qtd_reservada, s.qtd_sap, 'aberto', SYSUTCDATETIME()
           FROM dbo.app_saldo_lotes AS s
           JOIN dbo.app_reservas AS r ON r.estado = 'ativa' AND r.cod_empresa = s.cod_empresa
           JOIN dbo.app_reserva_detalhes AS d ON d.reserva_id = r.id AND d.cod_armazem = s.cod_armazem
                                              AND d.cod_artigo = s.cod_artigo AND d.cod_lote = s.cod_lote
          WHERE s.qtd_reservada > s.qtd_sap
            AND NOT EXISTS (SELECT 1 FROM dbo.app_alerta_stocks AS a WITH (UPDLOCK, HOLDLOCK)
                             WHERE a.chave = CONVERT(nvarchar(36), r.id) + '|' + d.cod_lote);
         SET @alertas_novos = @@ROWCOUNT;
         IF @alertas_novos > 0 OR EXISTS (SELECT 1 FROM @acoes)
           INSERT dbo.app_registo_auditorias (id, utilizador, acao, entidade, entidade_id, antes, depois, criado_em)
             VALUES (NEWID(), @utilizador, 'sincronizar', 'app_saldo_lote', 'fato_stock', NULL,
                     (SELECT (SELECT COUNT(*) FROM @acoes WHERE acao = 'INSERT') AS inseridos,
                             (SELECT COUNT(*) FROM @acoes WHERE acao = 'UPDATE') AS atualizados,
                             @alertas_novos AS alertas_novos FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                     SYSUTCDATETIME());
       COMMIT;
       SELECT (SELECT COUNT(*) FROM @f) AS linhas_origem,
              (SELECT COUNT(*) FROM @acoes WHERE acao = 'INSERT') AS inseridos,
              (SELECT COUNT(*) FROM @acoes WHERE acao = 'UPDATE') AS atualizados,
              @alertas_novos AS alertas_novos,
              (SELECT COUNT(*) FROM dbo.app_alerta_stocks WHERE estado = 'aberto') AS alertas_abertos;`,
      { stock: JSON.stringify(stock), utilizador: ctx.user.id },
    ));
    const l = primeira_linha(r);
    return {
      linhas_origem: Number(l.linhas_origem),
      inseridos: Number(l.inseridos),
      atualizados: Number(l.atualizados),
      alertas_novos: Number(l.alertas_novos),
      alertas_abertos: Number(l.alertas_abertos),
      ms: Date.now() - inicio,
      erro: null,
    };
    } catch (erro) {
      const r = falha(erro);
      if (etapa !== 'token_storage' && etapa !== 'merge_saldo') r.erro = `${r.erro} · token: ${claims_token(ctx.Tokens.Storage)}`;
      return r;
    }
  },
  [],
);

// ------------------------------------------------------- reposição (testes)

/**
 * SÓ PARA A PoC: repõe os 5 lotes fixos de teste — apaga alertas, detalhes e
 * reservas que envolvam apenas esses lotes e põe qtd_reservada = 0. O qtd_sap
 * é reposto pela sincronização seguinte. A própria reposição fica auditada;
 * a auditoria anterior não é apagada.
 */
udf.func(
  'repor_lotes_teste',
  async (ctx: contexto_sql): Promise<resultado_reposicao> => {
    const r = await ctx.sql.query(
      `SET NOCOUNT ON; SET XACT_ABORT ON;
       DECLARE @lotes TABLE (cod_lote nvarchar(30) PRIMARY KEY);
       INSERT @lotes SELECT value FROM OPENJSON(@lotes_json);
       DECLARE @reservas TABLE (id uniqueidentifier PRIMARY KEY);
       INSERT @reservas SELECT DISTINCT d.reserva_id FROM dbo.app_reserva_detalhes AS d
         WHERE d.cod_lote IN (SELECT cod_lote FROM @lotes)
           AND NOT EXISTS (SELECT 1 FROM dbo.app_reserva_detalhes AS o
                            WHERE o.reserva_id = d.reserva_id AND o.cod_lote NOT IN (SELECT cod_lote FROM @lotes));
       DECLARE @n_reservas int = (SELECT COUNT(*) FROM @reservas), @n_lotes int;
       BEGIN TRAN;
         DELETE FROM dbo.app_alerta_stocks WHERE reserva_id IN (SELECT id FROM @reservas)
                                              OR cod_lote IN (SELECT cod_lote FROM @lotes);
         DELETE FROM dbo.app_reserva_detalhes WHERE reserva_id IN (SELECT id FROM @reservas);
         DELETE FROM dbo.app_reservas WHERE id IN (SELECT id FROM @reservas);
         UPDATE dbo.app_saldo_lotes WITH (UPDLOCK, HOLDLOCK)
            SET qtd_reservada = 0, atualizado_em = SYSUTCDATETIME()
          WHERE cod_lote IN (SELECT cod_lote FROM @lotes);
         SET @n_lotes = @@ROWCOUNT;
         INSERT dbo.app_registo_auditorias (id, utilizador, acao, entidade, entidade_id, antes, depois, criado_em)
           VALUES (NEWID(), @utilizador, 'repor_lotes_teste', 'app_saldo_lote', 'lotes_teste',
                   NULL, (SELECT @n_reservas AS reservas_apagadas, @n_lotes AS lotes_repostos
                            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER), SYSUTCDATETIME());
       COMMIT;
       SELECT @n_reservas AS reservas_apagadas, @n_lotes AS lotes_repostos;`,
      { lotes_json: JSON.stringify(LOTES_TESTE), utilizador: ctx.user.id },
    );
    const l = primeira_linha(r);
    return { reservas_apagadas: Number(l.reservas_apagadas), lotes_repostos: Number(l.lotes_repostos) };
  },
  [],
);

// ---------------------------------------------------------------- diagnóstico

async function sondar(acao: () => Promise<string>): Promise<resultado_sonda> {
  try {
    return { ok: true, detalhe: await acao() };
  } catch (erro) {
    return { ok: false, detalhe: descrever_erro(erro) };
  }
}

/**
 * Diagnóstico da plataforma (só leitura): identidade vista no servidor, raw SQL
 * ativo, nomes de tabela gerados, restrições e índices únicos, e se um lote
 * T-SQL com BEGIN TRAN / COMMIT corre numa só chamada.
 */
udf.func(
  'diagnostico',
  async (ctx: contexto_sql): Promise<resultado_diagnostico> => {
    const linhas = (r: { rows: unknown[][] }) => r.rows.map((l) => l.join(' ')).join(' | ');
    return {
      utilizador: ctx.user.id,
      sql_identidade: await sondar(async () =>
        linhas(await ctx.sql.query('SELECT SUSER_SNAME(), @@VERSION', {}))),
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
      sql_indices_unicos: await sondar(async () =>
        linhas(await ctx.sql.query(
          `SELECT t.name, i.name, STRING_AGG(c.name, ',')
             FROM sys.indexes i JOIN sys.tables t ON t.object_id = i.object_id
             JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
             JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
            WHERE i.is_unique = 1 AND i.is_primary_key = 0 AND t.name LIKE 'app[_]%'
            GROUP BY t.name, i.name ORDER BY 1`, {})) || '(nenhum)'),
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
