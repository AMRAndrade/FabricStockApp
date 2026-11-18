# POC-LOG — Reserva de Lotes (Fabric App / Rayfin)

Registo cronológico de achados. Formato: data · pergunta · fonte ou evidência · resultado (**funciona** / **falha** / **pouco claro** / **NÃO VERIFICADO**).

---

## Fase 0 — Pré-requisitos

### 2026-11-17 · Versões usadas

| componente | versão |
|---|---|
| Node.js | 24.14.1 |
| npm | 11.11.0 |
| Python | 3.12.1 |
| Git | 2.45.2 |
| `@microsoft/create-rayfin` | 2.0.0 |
| `@microsoft/rayfin-cli` | 2.0.0 (build de 12/11/2026) |
| `@microsoft/rayfin-*` (core, client, guide, …) | 2.0.0 (alinhadas) |
| TypeScript (template) | ~6.0.2 |
| Docker | não instalado (ver abaixo) |
| Azure Functions Core Tools (`func`) | não instalado (ver abaixo) |

Pré-requisitos do tenant (capacidade, região, workspace `fabric-app-reserva-lotes`, permissões, workload Fabric Apps, Lakehouse, Dataflow Gen2): **confirmados pelo utilizador** em 2026-11-17. Não verificados pelo Claude (sem acesso ao tenant).

### 2026-11-17 · Estatuto do produto (ambiguidade a levar ao relatório)
- Microsoft Learn (`fabric/apps/overview`, atualizado a 2026-11-11): "Fabric Apps (preview) is built on the Rayfin SDK" — funcionalidade do Fabric em **preview**.
- O site rayfin.ai declara não ser um produto Microsoft nem ter suporte da Microsoft; os pacotes npm são publicados como `@microsoft/rayfin-*` com autor "Microsoft".
- Resultado: **pouco claro** quanto ao modelo de suporte. Registar no relatório final.

### 2026-11-17 · Docker é necessário?
- Microsoft Learn (overview): "Run the full stack locally with Docker".
- rayfin.ai `/docs/start/develop-locally`: `rayfin dev` corre o frontend (e Functions) localmente com o **backend no Fabric**; não menciona Docker.
- Resultado: **pouco claro** na documentação; para Rayfin 2.0.0 o caminho documentado não usa Docker. Não instalado. Se algum comando o exigir, registar aqui.

### 2026-11-17 · Escolha do template: `blankapp` vs `dataapp`
Fonte: `npm create @microsoft/rayfin@2.0.0 -- --list-templates`, rayfin.ai `/docs/reference/cli/templates`, e scaffold dos dois numa pasta temporária.

| | `blankapp` (Universal App) | `dataapp` |
|---|---|---|
| `data` (BD própria) | ligado por `--services auth,data` | desligado |
| estrutura | monorepo npm: `packages/frontend`, `packages/data`, `packages/shared`; `packages/functions` via pack | plano (`src/`, `rayfin/`) |
| packs | `data-modeling`, `functions`, `connectors` (Lakehouse SQL endpoint incluído), `storage`, `visuals` | orientado a modelo semântico (DAX) |
| autenticação | `AuthGate`, `use-auth`, `rayfin-auth.service` | Fabric SSO |

**Escolha: `blankapp`**, porque a PoC escreve (reservas, auditoria) e precisa de `data` + `functions` + conector SQL; o `dataapp` é um starter de análise sobre modelo semântico (o caso do DRE). Comando: `npm create @microsoft/rayfin@2.0.0 -- app-reserva-lotes --template blankapp --dialect mssql --services auth,data --auth-methods fabric`.

Nota: com `blankapp` as entidades vivem em `packages/data/src/` (não em `rayfin/data/`, que é a convenção dos templates planos).

### 2026-11-17 · Scaffold e build
- `npm run build` → **funciona** (vite build sem erros, 349 kB JS).
- `npm run typecheck` (`tsc -b`) → **funciona**.

### 2026-11-17 · Leitura documental para a Fase 4 (antes de qualquer teste)
| pergunta | fonte | resultado |
|---|---|---|
| A API gerada suporta atualização condicional / incremento / linhas afetadas? | rayfin.ai `/docs/data/mutations`: "Only `id` is supported in the filter"; `update` é patch parcial; nada sobre incremento, linhas afetadas ou concorrência otimista | **falha (documental)** para a abordagem 1; a confirmar empiricamente |
| Transações entre entidades pela API gerada? | idem; sem batch nem transações | **falha (documental)** |
| Raw SQL em funções (`ctx.sql`) | rayfin.ai `/docs/functions/raw-sql`: experimental, ativado pelo serviço por tenant, só em funções implantadas, corre com a **identidade da app**, ignora políticas das entidades; `execute` devolve `rowsAffected` | **NÃO VERIFICADO**; transações (`BEGIN TRAN`), lotes com várias instruções e `OUTPUT` não documentados |
| Função com token `AudienceType.Sql` + driver SQL próprio | `rayfin-guide/functions/connections/index.md`: tokens da identidade da app para "Fabric Lakehouse / Warehouse / SQL DB" | **NÃO VERIFICADO** se a identidade da app tem acesso à BD da própria app; seria o caminho para uma transação T-SQL completa (`UPDLOCK, HOLDLOCK`) |
| Procedimentos armazenados | `raw-sql`: apenas menciona que `execute` serve um procedimento sem saída; nenhum mecanismo para os criar por código | **NÃO VERIFICADO** |
| Restrições `CHECK` / compostas | known-limitations: "`@entity()` has no multi-field constraints" | **falha (documental)** para `CHECK (qtd_reservada <= qtd_sap)` por decorador |
| Unicidade | `bulk-import.md`: recomenda unicidade na BD e apanhar o erro de chave única em corridas | **funciona (documental)**; útil para idempotência de alertas |
| Identidade nas funções | rayfin.ai `/docs/auth/delegated-access`: `ctx.user.id` para carimbar o dono; `ctx.getDataClient()` corre como o utilizador que chamou | **NÃO VERIFICADO** empiricamente |
| Identidade do conector `fabric-sqlanalytics` | idem: `--auth application` (omissão) ou `delegated` | a testar na Fase 3 |
| Aviso Microsoft Learn | overview: "might not be suitable for: Applications requiring complex multi-step transactions or stored procedures" | confirmado no texto atual |

### 2026-11-17 · Functions: pré-requisito local
O pack `functions` usa `npm run dev` (`rayfin dev`) para gerar `types.ts`, o que exige Azure Functions Core Tools (`func`), não instalado. `ctx.sql` não corre em `rayfin dev`, por isso o teste da Fase 4 tem de ser feito com a app implantada de qualquer forma. **Pendente:** decidir com o utilizador se se instala `func` (software global → requer autorização, regra 13).

### 2026-11-17 · Instalação do `func` e primeiro ensaio de deploy
- Azure Functions Core Tools 4.16.1 instalado globalmente (`npm i -g azure-functions-core-tools@4`), com autorização do utilizador → **funciona**.
- `npx rayfin login status` → sessão ativa (identidade de utilizador).
- `npx rayfin up --workspace "fabric-app-reserva-lotes" --dry-run` → **falha**: `Workspace "fabric-app-reserva-lotes" not found`. A resolução do nome por API devolveu 200, mas o nome não consta da lista visível para a conta com sessão iniciada.
- `npx rayfin connector search --all-workspaces --type fabric-sqlanalytics` → só mostra Lakehouses de outro workspace; `lh_reserva_lotes` não aparece.
- Hipótese: a conta ou o tenant da sessão do CLI não é o do workspace da PoC, ou o workspace tem outro nome. Deploy **não** feito; aguardar o utilizador.
- Repetido com o ID do workspace indicado pelo utilizador (`--workspace-id`, `--dry-run`) → **falha**: `Fabric API error: 404 Not Found — The provided workspace was not found`. O workspace existe (o utilizador abriu-o no portal), logo a sessão do CLI está noutra conta/tenant ou sem acesso ao workspace.

### 2026-11-17 · Deploy *hello-world*
- O utilizador indicou o URL correto do workspace (o primeiro ID era de outro workspace). Com a mesma sessão, `npx rayfin up --workspace-id <id> --dry-run` resolveu o workspace `fabric-app-reserva-lotes` → **funciona**. O dry-run lista: verificar capacidade, criar/reutilizar o item AppBackend, aplicar runtime settings (auth, data), gerar a configuração DAB (Data API Builder), publicar o conteúdo estático.
- `npx rayfin up --workspace-id <id>` (autorizado pelo utilizador) → **funciona** em 75 s. Componentes: runtime, data e staticHosting `success`; storage, connectors e functions `disabled`. Sem pedido de capacidade nem trial (o workspace já tinha capacidade).
- **Região:** West Europe (endpoint `westeurope.pbidedicated.windows.net`, alojamento `*-westeurope.webapp.fabricapps.net`).
- Itens criados no workspace: Fabric App (AppBackend) `app-reserva-lotes` + SQL database `app-reserva-lotes` (filho).
- `npx rayfin up status` → management endpoint `Reachable`; serviços auth e data `enabled`.
- Pedido HTTP sem sessão ao URL da app → `HTTP 401`: os ficheiros estáticos estão protegidos (`assetAccess: protected`) → **funciona**.
- O `rayfin up` acrescenta o URL de alojamento a `services.auth.allowedRedirectUris` no `rayfin.yml` em **cada** deploy (documentado em `rayfin-guide/hosting/index.md`). Para não versionar URLs de alojamento, a linha é retirada antes de cada commit (o deploy volta a registá-la no backend). Também acrescentou `127.0.0.1:5173` e `storage`/`functions: enabled: false` (sem dados sensíveis, versionado).
- O `rayfin/.env` e o `rayfin/.deployments.json` (IDs, chave publicável) ficam fora do git pelo `.gitignore`.

### Pendente para fechar a Fase 0
- [x] `npx rayfin login`.
- [x] Deploy *hello-world* para o workspace `fabric-app-reserva-lotes`.
- [x] Acesso por SSO dentro do portal do Fabric: o utilizador confirmou que a app abre (ecrã de boas-vindas do template, sem conteúdo próprio). No workspace aparecem 3 itens: a Fabric App, a SQL database da app e o respetivo endpoint de análise SQL.
- [ ] Acesso fora do portal (URL de alojamento direto) — por confirmar.
- [ ] Consumo de capacidade (Fabric Capacity Metrics, se o utilizador tiver acesso).

---

## Fase 1 — Dados de origem (preparação local)

### 2026-11-17 · Gerador do dataset
- `python scripts/gerar_dataset.py` → 8 CSVs em `dataset/`, contagens 2/20/100/5/500/100/10/25 → **funciona**.
- Determinismo: duas execuções seguidas produzem ficheiros com o mesmo MD5 (8/8) → **funciona**.
- O gerador falha se as contagens ou o filtro (12 lotes, com `L-CONC`, `L-ATOM`, `L-ALRT`, sem `L-FORA`, `L-LIM`) não baterem certo.
- Composição dos lotes de laranja: 5 fixos + 9 gerados no filtro + 2 gerados com Brix > 65 e `qtd_fisica` 0 + 9 gerados com Brix ≤ 64,9. Todos `disponivel`. Os 75 lotes de outros artigos têm alguns `bloqueado` e alguns com stock 0.
- Atributos `texto` têm `valor_numero` vazio (→ nulo); atributos `numero` têm `valor_texto` `""`.

### 2026-11-17 · Scripts M (`dataflow/*.pq`)
- `url_dataset` (parâmetro), `ler_csv(arquivo, tipos)` e uma consulta por tabela; `fato_stock` acrescenta `data_hora_carga` (UTC).
- **NÃO VERIFICADO:** `Web.Contents` + `RelativePath` dentro de Dataflow Gen2 (a testar no portal).

### 2026-11-18 · Repositório e fonte dos CSVs
- Repositório GitHub `AMRAndrade/FabricStockApp`, tornado **público** pelo utilizador (os dados são fictícios). Enquanto era privado, o URL raw devolvia 404 sem autenticação.
- `url_dataset` = `https://raw.githubusercontent.com/AMRAndrade/FabricStockApp/main/dataset`.
- Os 8 CSVs foram descarregados por HTTP anónimo: todos `200` e iguais byte a byte aos locais → **funciona**.

### 2026-11-17 · Testes de qualidade (`sql/qualidade_lakehouse.sql`)
- 39 testes (contagens, chaves, integridade, sinal, referência).
- Ensaio prévio: a mesma lógica corrida em SQLite sobre os CSVs (traduções mínimas de dialeto) → 39 testes, 0 falhas. **Isto não substitui** a execução no endpoint SQL do Lakehouse (Fase 2).

### 2026-11-18 · Dataflow criado/atualizado pela API REST do Fabric
- Azure CLI 2.93.0 instalado (com autorização); `az login --allow-no-subscriptions` feito pelo utilizador. Token `https://api.fabric.microsoft.com` obtido pelo `az` → **funciona**.
- `scripts/criar_dataflow.ts` monta `queryMetadata.json` + `mashup.pq` (formato `202502`) a partir de `dataflow/*.pq`.
- **Incidente:** já existia um `df-reserva-lotes` no workspace (criado pelo utilizador no portal; existem também os itens de staging `StagingLakehouseForDataflows_*` / `StagingWarehouseForDataflows_*` de 2026-11-18 11:20). O script fez `updateDefinition` e **substituiu** a definição anterior sem a guardar primeiro. A API não guarda versões anteriores. Correção: o script passa a recusar substituir um Dataflow existente sem `--substituir`.
- `getDefinition` depois da atualização: 10 consultas (`url_dataset` parâmetro, `ler_csv` função, 8 tabelas) e partes `queryMetadata.json`, `mashup.pq`, `.platform` → **funciona**.
- Microsoft Learn (`data-factory/dataflow-gen2-public-apis`, "Current limitations"): os destinos de dados não podem ser definidos pela API (só no portal); "You can invoke Run APIs, but the actual run never succeeds". O refresh pela API fica **NÃO VERIFICADO**.

### 2026-11-18 · Destinos, refresh e carga no Lakehouse
- O utilizador configurou no portal os 8 destinos (Lakehouse `lh_reserva_lotes`, nova tabela) e publicou. `getDefinition` confirma 8 `DataDestinations` (`Settings = [Kind = "Automatic"]`, que substitui a tabela) e as ligações `Web` (anónima, GitHub) e `Lakehouse`.
- Publicar **não** executa o refresh: o histórico de jobs só tinha `Publish` e as tabelas não existiam.
- Refresh pela API (`POST …/jobs/instances?jobType=Refresh`, com `executionData` com UPN e object ID do utilizador) → `202`, `Completed` em ~56 s → **funciona**. Contradiz a limitação da Microsoft Learn ("the actual run never succeeds"), pelo menos com identidade de utilizador e em 2026-11-18.
- `Web.Contents(url_dataset, [RelativePath = …])` num Dataflow Gen2 → **funciona** (era NÃO VERIFICADO).
- Tipos no endpoint SQL: texto `varchar`, datas `date`, quantidades e `valor_numero` `float`, `num_linha` `bigint`, `data_hora_carga` `datetime2` → conforme o dicionário.

### 2026-11-18 · Acesso ao endpoint SQL a partir de scripts
- Driver Node.js `tedious` 18.6.2 com token Entra (`azure-active-directory-access-token`): TCP 1433 abre, o PRELOGIN passa, e o servidor fecha a ligação logo após o LOGIN7 (`socket hang up`). Testado com `encrypt: true` e `strict` (TDS 8) e com tokens para `database.windows.net`, `database.windows.net/` e `analysis.windows.net/powerbi/api` → **falha** (causa não apurada).
- `System.Data.SqlClient` (.NET Framework, Windows PowerShell 5.1) com `AccessToken` do Azure CLI → **funciona**. Os testes de qualidade passam a correr por `scripts/testes/qualidade_lakehouse.ps1`.
- Implicação a seguir na Fase 4: os scripts de teste devem passar pela API da app (Rayfin) e não por SQL direto a partir de Node.

---

## Fase 2 — Qualidade dos dados

### 2026-11-18 · Execução no endpoint SQL do `lh_reserva_lotes`
- `powershell -File scripts/testes/qualidade_lakehouse.ps1 -workspace_id <id>` → **39 testes, 0 falhas**, 10,5 s (primeira execução, endpoint frio).
- Grupos: contagens 9/9, chaves 13/13, integridade 8/8, sinal 3/3, referência 6/6 (5 lotes fixos + filtro laranja, `brix > 65`, `qtd_fisica > 0` = **12 lotes**).
- Fase 1 e Fase 2: **prontas**.

---

## Fase 3 — Modelo da app, identidade e leitura do Lakehouse

### 2026-11-18 · Packs, entidades e esquema
- Packs do template aplicados em série: `data-modeling`, `connectors`, `functions` → **funciona**. O `Item` de exemplo foi removido.
- 5 entidades em `packages/data/src/` (`app_saldo_lote`, `app_reserva`, `app_reserva_detalhe`, `app_alerta_stock`, `app_registo_auditoria`), todas `@role('authenticated', 'read')`: **os clientes só leem; todas as escritas passam por funções no servidor** (regras 6 e 7).
- Sem chaves compostas no Rayfin (`known-limitations`): unicidade de (empresa, armazém, artigo, lote) por uma coluna `chave` com `unique: true`.
- `npx rayfin up` (83 s) + `npx rayfin up db apply` (`{"version":2,"driftCheckRan":true}`) → **funciona**. Esquema aplicado só por código.
- **Regra 2 (nomes):** o Rayfin pluraliza o nome da tabela com a biblioteca `pluralize` (`rayfin-lib` `EntityNameResolver.getPlural`): `app_saldo_lote` → tabela `app_saldo_lotes`, etc. Entidades GraphQL, classes e colunas mantêm o `snake_case` exato. Existe `EntityNameResolver.setCustomPlural`, mas não está documentado como suportado pelo CLI e um plural igual ao singular pode colidir nos nomes GraphQL. **Proposta:** aceitar o plural (continua `snake_case`, com prefixo `app_`).
- Restrições criadas na BD (consultadas por `ctx.sql` em `sys.*`):
  - PK em todas as tabelas; FK `reserva_id` em `app_reserva_detalhes` e `app_alerta_stocks` (de `@one`);
  - `CHECK` gerados a partir de `min` (`qtd_sap >= 0`, `qtd_reservada >= 0`, `qtd >= 0`, `num_linha >= 1`) e de `@set` (`estado IN (...)`, collation BIN2);
  - **não** aparece restrição `UNIQUE` para `chave` em `sys.key_constraints` (pode ser índice único; **NÃO VERIFICADO**, rever na Fase 4/5 antes de depender dela);
  - não há forma documentada de declarar `CHECK (qtd_reservada <= qtd_sap)` (multi-coluna).

### 2026-11-18 · Conector do Lakehouse
- `npx rayfin connector add --type fabric-sqlanalytics --workspace-id <id> --item-id <id> --name lh_reserva_lotes --operations read --auth delegated -y` → **funciona**; schema discovery: 8 tabelas; o `itemId` gravado é o do endpoint SQL, não o do Lakehouse.
- **Identidade:** `delegated` — cada leitura corre como o utilizador autenticado (precisa de acesso ao `lh_reserva_lotes`). O omissão do CLI seria `application` (dono da app).
- Metadados do Lakehouse: sem PK nem FK e todas as colunas anuláveis (esperado pela documentação) → 8 entidades só de leitura, sem chave. Nomes em `snake_case` iguais às tabelas, em vez do PascalCase do contrato de geração (regra 2).
- IDs do tenant retirados do `rayfin.yml` com interpolação `${LH_RESERVA_LOTES_WORKSPACE_ID}` / `${LH_RESERVA_LOTES_ITEM_ID}` definidos em `rayfin/.env` (fora do git). O `rayfin up` resolve-os → **funciona**.
- `npx rayfin connector inspect --name lh_reserva_lotes [--entity dim_armazem]` → **falha** com `Fabric API error: 400 Bad Request` (causa não apurada; possivelmente a interpolação `${…}` no `inspect`). A leitura pela app/SDK funciona (ver `filtro_01`).

### 2026-11-18 · Identidade (mecanismo e limitações)
- Testes chamam a API diretamente com o SDK 2.0.0 (`scripts/lib/cliente.ts`): token Entra delegado → `signInWithEntraToken` → sessão Rayfin.
- O Azure CLI **não** obtém `Item.Execute.All` (`declined scopes`); o token vem do módulo de autenticação do CLI do Rayfin (mesmo caminho do `rayfin connector invoke`, escopo `https://analysis.windows.net/powerbi/api/.default`). Dependência de um módulo interno do CLI: aceitável para a PoC, a rever.
- No servidor, `ctx.user.id` (= `claims.sub`) **é igual** ao `session.user.id` do cliente → **funciona**. É o único campo de identidade do `RayfinUser`; não há email nem nome (para mostrar nomes será preciso outra fonte).
- `ctx.sql` (raw SQL) **está ativo** neste tenant e corre como `SUSER_SNAME()` = **conta do dono da app** (quem fez o deploy), não uma identidade de serviço. Implicação: se o dono sair da organização ou perder acesso, as funções deixam de escrever (risco para o relatório).

### 2026-11-18 · Sonda para a Fase 4 (função `diagnostico`)
- `ctx.sql.execute` com um lote T-SQL de várias instruções (`SET XACT_ABORT ON; BEGIN TRAN; … WITH (UPDLOCK, HOLDLOCK) …; COMMIT;`) numa só chamada → **funciona** (`rowsAffected=-1`). Era NÃO VERIFICADO. A abordagem 2 da Fase 4 é viável à partida.
- Latência de uma invocação com 4–6 consultas SQL: ~3,8–4,9 s (primeira chamada, inclui troca de token).

### 2026-11-18 · Testes da Fase 3 (`npx tsx scripts/testes/fase3.ts`) — 13 testes, 0 falhas

| teste | esperado | obtido |
|---|---|---|
| `aut_01` SDK sem sessão (create em dados; invocar função) | negado | negado no cliente (`AuthError NO_REFRESH_TOKEN`) |
| `aut_01` HTTP cru sem token ao GraphQL | 401/403 | **HTTP 401** |
| `aut_01` HTTP cru sem token a `functions/diagnostico/invoke` | 401/403 | **HTTP 401** |
| `aut_03` create / update / delete em `app_registo_auditoria` com sessão válida | negado | negado (GraphQL `InternalServerError`, HTTP 200) |
| `aut_03` read | permitido | permitido |
| escrita direta em `app_saldo_lote` (create, update) e `app_reserva` (create) com sessão | negado | negado (idem) |
| nenhuma linha das tentativas gravada (consulta posterior) | 0 | 0 / 0 / 0 |
| `filtro_01` laranja, `brix > 65`, stock > 0 | 12 lotes | **12 lotes**, 3,2 s (1.ª) / ~0,5 s (seguintes); inclui `L-CONC`, `L-ATOM`, `L-ALRT`; exclui `L-FORA`, `L-LIM` |

Notas:
- As recusas de escrita com sessão devolvem um erro genérico (`Internal server error`), não um 403 explícito: **pouco claro** para diagnóstico e para a mensagem ao utilizador. A prova da recusa é a configuração DAB aplicada (`authenticated: ["read"]` em todas as entidades `app_*`, em `rayfin/.temp/dab-config.json`) mais a consulta que confirma 0 linhas gravadas.
- A introspeção GraphQL devolve o esquema vazio (nem as consultas `app_*`): não serve como prova.
- `filtro_01` ainda usa `qtd_fisica` do Lakehouse; quando existir `app_saldo_lote` sincronizado (Fase 4/5) o filtro passa a `qtd_sap − qtd_reservada > 0`.
- **`aut_02`** (criado_por forjado no corpo) depende da função `reservar`: passa para a Fase 4. Por construção, `criado_por` não é parâmetro da função e vem de `ctx.user.id`.
- `aut_03` foi testado com um id inexistente (a tabela está vazia). **Repetir na Fase 4** sobre uma linha real de auditoria.

### 2026-11-18 · Pendentes
- O commit de 2026-11-18 (`9271224`) e seguintes estão por enviar para o GitHub: o `git push` não interativo pede credenciais (o utilizador corre `git push`).

---

## Fase 4 — Concorrência

### 2026-11-18 · Abordagens investigadas

| # | abordagem | resultado | evidência |
|---|---|---|---|
| 1 | Mutação atómica condicional pela API gerada | **falha (documental e estrutural)** | `update` só filtra por `id`, sem incremento nem condição nem linhas afetadas (`data/mutations`); um "ler, calcular, gravar" pelo cliente violaria a regra 6. Na app as entidades `app_*` são só de leitura para clientes, por isso a API gerada nem permite escrever |
| 2 | **Função Rayfin com transação T-SQL (`ctx.sql`, identidade da app)** | **funciona — abordagem vencedora** | 5/5 rondas; ver abaixo |
| 3 | Procedimento armazenado | não testado (desnecessário) | criar um procedimento por `ctx.sql` seria alterar o esquema fora do `rayfin up db apply` (regra 14); a abordagem 2 já cobre o requisito |
| 4 | `CHECK (qtd_reservada <= qtd_sap)` | **falha (documental)** | não há restrições multi-coluna nos decoradores; existem `CHECK (qtd_reservada >= 0)` e `CHECK (qtd_sap >= 0)` gerados por `min: 0`, que servem de rede contra libertações a mais |

Pré-requisitos confirmados nesta fase: raw SQL ativo no tenant; `ctx.sql.query` aceita um lote T-SQL com `DECLARE`, variáveis de tabela, `OPENJSON`, `BEGIN TRAN`/`COMMIT`/`ROLLBACK`, `UPDATE … WITH (UPDLOCK, HOLDLOCK)` e devolve o último `SELECT`.

### Código mínimo da abordagem vencedora (`packages/functions/src/function_app.ts`, função `reservar`)

```sql
SET NOCOUNT ON; SET XACT_ABORT ON;
-- @l: lotes pedidos (OPENJSON do parâmetro @linhas, agregados por chave)
BEGIN TRAN;
  UPDATE s SET s.qtd_reservada = s.qtd_reservada + l.qtd, s.atualizado_em = SYSUTCDATETIME()
    FROM dbo.app_saldo_lotes AS s WITH (UPDLOCK, HOLDLOCK)
    JOIN @l AS l ON l.chave = s.chave
   WHERE s.qtd_sap - s.qtd_reservada >= l.qtd;          -- verificação e escrita numa só operação
  IF @@ROWCOUNT = @pedidos
    BEGIN  -- inserir app_reservas, app_reserva_detalhes e app_registo_auditorias; COMMIT  END
  ELSE
    BEGIN  ROLLBACK;  -- tudo ou nada; depois lê o disponível para a mensagem de recusa  END
SELECT @resultado, @id, @detalhe;
```

- `criado_por` e o autor da auditoria vêm de `ctx.user.id` (parâmetro SQL `@utilizador`); a função não tem parâmetro de identidade.
- `libertar`: `UPDATE app_reservas … WITH (UPDLOCK, HOLDLOCK) WHERE id = @id AND estado = 'ativa'`; só se `@@ROWCOUNT = 1` desconta `qtd_reservada` e audita, na mesma transação.
- Repetição automática (até 3 vezes) se o SQL Server escolher a transação como vítima de deadlock (erro 1205). Nos testes não houve nenhum deadlock.

### Reposição do estado (`scripts/repor_estado.ts`)
- Função `repor_lotes_teste` (servidor, auditada; só para a PoC): apaga alertas, detalhes e reservas que envolvem apenas os 5 lotes fixos e põe `qtd_reservada = 0`; depois `sincronizar_stock` repõe `qtd_sap` a partir do Lakehouse. A auditoria anterior não é apagada.

### 2026-11-18 · Resultados (`npx tsx scripts/testes/concorrencia.ts 5`) — 30 testes, 0 falhas
Evidência completa: `docs/evidencia/fase4_concorrencia_5_rondas.txt`.

| teste | esperado | obtido (5 rondas) |
|---|---|---|
| `conc_01` 20 paralelas de 10 sobre `L-CONC` | 10 aceites, 10 recusadas | **5/5**: 10 aceites, 10 recusadas, 0 erros |
| `conc_02` 50 paralelas de 10 | 10 aceites, 40 recusadas | **5/5**: 10 aceites, 40 recusadas, 0 erros |
| `conc_03` estado final | `qtd_reservada` = 100, nunca acima | **10/10**: `qtd_reservada` = 100 = soma dos detalhes aceites; nunca acima de `qtd_sap` |
| `atom_01` `[L-CONC 10, L-ATOM 10]`, `L-ATOM` a 5 | recusada, nada muda | recusada ("L-ATOM: pedido 10, disponível 5"); `L-CONC` 0→0; 0 reservas criadas |
| `atom_02` `[L-CONC 10, L-ATOM 5]` | aceite | aceite; `L-CONC` 10, `L-ATOM` 5 |
| `lib_01` libertar reserva | desce 10 | libertada; `L-CONC` 10→0, `L-ATOM` 5→0 |
| `lib_02` 2 e 5 libertações paralelas da mesma reserva | só uma | 1 libertada + 1 recusada; 1 libertada + 4 recusadas; `qtd_reservada` desce uma vez |
| `aud_01` | 1 linha por reserva e por libertação | 10/10 reservas com exatamente 1 linha `reservar`; 3/3 libertações com 1 linha `libertar`; autor = utilizador autenticado |
| `aut_02` `criado_por`/`utilizador` forjados no corpo do pedido | ignorados | `criado_por` e autor da auditoria = utilizador autenticado (corpo original: `num_encomenda, num_linha, linhas`) |
| `aut_03` update/delete numa linha **real** de auditoria | negado | negados; linha intacta |

- **Latência** `reservar` (cliente → função → SQL → cliente, 350 chamadas, até 50 em paralelo): p50 384 ms, p95 712 ms, máx. 1 014 ms. Na ronda de ensaio, a frio: p50 660 ms, p95 3,5 s.
- **Pronto quando:** 5/5 execuções passam → **cumprido**. Recomendação prevista no CLAUDE.md: **GO condicionado** (a confirmar no relatório com as Fases 5 e 6).

### 2026-11-18 · Sincronização no servidor (preparação da Fase 5)
- Tentativa 1: função com `AudienceType.Sql` + `mssql@12.6.0` (`tedious` 19.2.2) ao endpoint SQL do Lakehouse → **falha** no runtime das funções (`ESOCKET socket hang up`). O token é válido (`aud=https://database.windows.net`, identidade de utilizador = dono da app, `user_impersonation`); o mesmo driver e o mesmo tipo de token funcionam a partir do PC (100 linhas). Conclusão: o runtime das Fabric Functions não consegue abrir a ligação TDS ao endpoint SQL do Lakehouse (rede/redirecionamento; causa não apurada).
- Correção do achado da Fase 2: o `socket hang up` do `tedious` 18.6.2 no PC é o bug do LOGIN7 documentado na Microsoft Learn/Rayfin (`tedious <= 19.1.2`); com 19.2.2 funciona no PC.
- Tentativa 2 (**adotada**): ler a tabela Delta `fato_stock` diretamente do OneLake por HTTPS (`AudienceType.Storage`, identidade da app), reproduzindo os commits JSON de `_delta_log` e lendo os parquet com `hyparquet@1.30.0` (JS puro) → **funciona**: 100 linhas, 100 saldos inseridos em ~1,1 s; a repetição não altera nada (0 inseridos, 0 atualizados).
- O Lakehouse foi criado **com esquemas**: as tabelas ficam em `Tables/dbo/<tabela>` (explica também o 400 da API "List Tables" na Fase 2).
- Limitações da leitura Delta própria: sem deletion vectors nem logs já compactados (falha explícita nesses casos). Para produção seria preferível uma via suportada (por exemplo pipeline que escreve na BD da app).
- O segredo `LH_SQL_SERVIDOR` (criado para a tentativa 1) foi apagado (`npx rayfin secret delete`).

---

## Fase 5 — Sincronização e alertas (preparado; execução pendente do push)

- `sincronizar_stock` (função, servidor): lê `fato_stock` do OneLake/Delta e faz `MERGE` em `app_saldo_lotes` (`qtd_sap`; `qtd_reservada` nunca é tocada), seguido da criação de alertas `(reserva ativa, lote)` com `qtd_reservada > qtd_sap`, sem duplicar (`NOT EXISTS` + índice único `UQ_app_alerta_stocks_chave` em `reserva_id|cod_lote`). Tudo numa transação, com auditoria.
- `libertar` passa a `resolvido` os alertas abertos dessa reserva.
- Idempotência já observada na Fase 4: sincronizar duas vezes sem alterações → 0 inseridos, 0 atualizados.
- `scripts/simular_queda_stock.ts` → `dataset_variacao/` (8 CSVs; `L-ALRT` 50 → 30).
- `scripts/atualizar_dataflow.ts --fonte dataset|dataset_variacao`: muda o parâmetro `url_dataset` na definição atual do Dataflow (`getDefinition` → `updateDefinition`, preservando destinos e ligações) e corre o refresh pela API.
  - O job `Publish` devolve `InvalidJobType` neste Dataflow (CI/CD), apesar de estar na Microsoft Learn; o `updateDefinition` basta.
  - **Frescura medida:** refresh completo do Dataflow (8 tabelas) = 56–64 s; sincronização = ~0,5–1,1 s. **NÃO VERIFICADO:** intervalo mínimo do agendamento do Dataflow e cadência de uma pipeline (a testar no portal).
- `scripts/testes/alertas.ts` (`sync_01`, `alrt_01`, `alrt_02`, alerta resolvido ao libertar; repõe a fonte e o estado no fim) — **por correr: precisa de `dataset_variacao/` no GitHub (push pelo utilizador).**
- Agendamento da sincronização de 15 a 30 minutos (documentar, não construir): a função `sincronizar_stock` pode ser chamada por um processo agendado com identidade de utilizador (por exemplo uma pipeline/notebook do Fabric a seguir ao refresh do Dataflow, ou um job agendado que use `signInWithEntraToken`). **NÃO VERIFICADO:** se o Fabric Apps tem gatilho temporizado próprio para funções (não encontrado na documentação do Rayfin 2.0.0).

---

## Fase 6 — UI mínima

### 2026-11-18 · Implementação
- Template mantido: `AuthProvider` + `AuthGate` + `rayfin-auth.service` (sem outro fluxo de login); página de boas-vindas retirada conforme o README do template (`sourceActivity` desligado; `Welcome*`, `EmptyStatePreview`, `FabricAppMark` removidos; specs adaptados mantendo a cobertura do `AuthGate`).
- Estilos do template (tokens Tailwind de `global.css`), sem personalização (regra 15).
- **Ecrã 1 — Stock e reserva** (`src/ecras/ecra_stock.tsx`): linha de encomenda → lotes do artigo da linha (atributos do Lakehouse + saldo da BD da app) → filtro por atributo numérico (por omissão `brix > 65`) e "só com disponível > 0" → quantidades por lote → reservar. Validação no cliente (> 0, ≤ disponível, 3 casas, lote bloqueado desativado) e no servidor (`reservar`). Recusa do servidor mostrada com o motivo ("Stock insuficiente: L-…: pedido X, disponível Y").
- **Ecrã 2 — Reservas e alertas** (`src/ecras/ecra_reservas.tsx`): alertas abertos; reservado por artigo e lote; reservas ativas com botão Libertar.
- Estados de carregamento, vazio e erro em todas as leituras; sem dados embutidos.
- **Regra 2 vs React:** componentes React em PascalCase (`EcraStock`, `EcraReservas`) e hook `useLeitura`, exigidos pelo JSX (minúsculas = elemento HTML) e pela regra de lint `react-hooks/rules-of-hooks`. Ficheiros, variáveis e restantes funções em `snake_case`. **Proposta:** aceitar esta exceção para identificadores React.
- Nota de modelo: o filtro do ecrã é por artigo da linha de encomenda (ex.: `ART-001` tem 12 lotes); o cenário "12 lotes de laranja com Brix > 65" abrange os 3 artigos de laranja (validado em `filtro_01`).
- Validação: typecheck, lint, 56 testes (vitest), build, `npx rayfin up` (71 s, todos os componentes `success`).
- `npx tsx scripts/testes/ui_leituras.ts`: as 10 consultas dos ecrãs + reservar/libertar contra o backend implantado → **11/11 ok**.

### Guião de teste manual (2 utilizadores)
Pré-requisito: dois utilizadores do tenant com permissão **Run and interact** no item `app-reserva-lotes` e acesso de leitura ao `lh_reserva_lotes` (o conector é `delegated`). Estado reposto com `npx tsx scripts/repor_estado.ts`.

1. Utilizador A e B abrem a app (portal do Fabric → workspace → `app-reserva-lotes`) e entram com SSO.
2. Ambos escolhem `ENC-0001 · linha 1` e filtram Brix > 65: `L-CONC` mostra SAP 100, reservado 0, disponível 100.
3. A escreve 60 em `L-CONC`; B escreve 60 em `L-CONC` (o cliente aceita: 60 ≤ 100).
4. Ambos carregam em **Reservar** quase ao mesmo tempo.
5. Esperado: um recebe "Reserva criada"; o outro recebe "Reserva recusada. Stock insuficiente: L-CONC: pedido 60.000, disponível 40.000". Depois de **Atualizar**, `L-CONC` mostra reservado 60, disponível 40.
6. No ecrã 2, a reserva aparece em "Reservas ativas" e em "Reservado por artigo e lote"; **Libertar** volta a pôr o disponível em 100. Um segundo clique (ou o outro utilizador a libertar a mesma reserva) recebe "Não libertada: A reserva já foi libertada".
7. Registar aqui: resultado, se a app abre dentro do portal, se abre no URL de alojamento direto e se a leitura do Lakehouse funciona fora do portal.

### Pendentes da Fase 6
- [ ] Teste manual no browser pelo utilizador (fluxo ponta a ponta e 2 utilizadores).
- [ ] Alerta visível no ecrã 2: correr a simulação (`atualizar_dataflow.ts --fonte dataset_variacao` + `sincronizar.ts`) com uma reserva de 40 em `L-ALRT` e abrir o ecrã 2; repor com `--fonte dataset`.

### 2026-11-18 · Execução de `scripts/testes/alertas.ts` (1.ª tentativa) — 3 ok, 4 falhas
- `sync_01` → **ok**: 100 lotes, 0 inseridos, 0 atualizados, `qtd_reservada` intacta (reservado total 40).
- Refresh com `url_dataset = …/main/dataset_variacao` → **falha** em 11 s: `ModelBuilderEvaluationChallengedErrorCode … Bad credentials … DataSources: {"Kind":"Web","Path":"…/main/dataset_variacao"} … Credentials are required to connect to the Web source`.
  - Causa: o Dataflow associa a ligação/credencial Web ao **caminho exato** do URL (`…/main/dataset`). Trocar a pasta no `url_dataset` cria uma fonte nova sem credencial.
  - Consequência: `alrt_01`, `alrt_02` e "libertar resolve alerta" falharam por falta da queda de stock (não por erro da deteção).
- Reposição automática → **ok**: refresh com `dataset` concluído (85 s); `L-ALRT` sap 50, reservado 0.
- Ligações existentes (API `GET /connections`): a ligação do Dataflow é `ShareableCloud`, tipo `Web`, credencial `Anonymous`, caminho `…/main/dataset`; no `queryMetadata.json` aparece como `{"ClusterId": <gatewayId>, "DatasourceId": <id da ligação>}`.
- Correção proposta (em código, **não aplicada no Fabric**): `url_dataset` = raiz do repositório + novo parâmetro `pasta_dataset` (`dataflow/url_dataset.pq`, `dataflow/pasta_dataset.pq`, `ler_csv.pq`), para a fonte Web — e a credencial — ser sempre a mesma; `scripts/migrar_dataflow_pasta.ts` cria uma ligação Web anónima para a raiz (`skipTestConnection`, porque a raiz devolve 404) e reescreve a definição mantendo destinos e a ligação ao Lakehouse.
  - 1.ª chamada `POST /connections` → 400 (`Web.Contents failed` no teste de ligação à raiz). A repetição com `skipTestConnection: true` **não foi executada**: criar uma ligação no tenant e reescrever o Dataflow exige autorização do utilizador (regra 13).

### 2026-11-18 · Migração do Dataflow (autorizada pelo utilizador) e testes da Fase 5
- `npx tsx scripts/migrar_dataflow_pasta.ts` → **funciona**: ligação `ShareableCloud` Web anónima criada para a raiz do repositório (`skipTestConnection: true`); definição do `df-reserva-lotes` reescrita com `url_dataset` = raiz, novo parâmetro `pasta_dataset` e `ler_csv` com `RelativePath = "/" & pasta_dataset & "/" & arquivo & ".csv"`; destinos e ligação ao Lakehouse mantidos.
- Verificação a seguir: refresh com `pasta_dataset = "dataset"` → `Completed` em 64 s; `sql/qualidade_lakehouse.sql` → **39 testes, 0 falhas**.
- 2.ª execução de `testes/alertas.ts`: todos os valores corretos, mas `alrt_01` falhou na comparação do `reserva_id`: a função devolvia o GUID em maiúsculas (`CONVERT` do SQL Server) e a API de dados devolve-o em minúsculas. Correção: `reservar` devolve `LOWER(...)` e a auditoria grava `entidade_id` em minúsculas (as linhas antigas ficam em maiúsculas). Funções reimplantadas; 1 ronda de `concorrencia.ts` a seguir → 14 testes, 0 falhas.

### 2026-11-18 · Resultados (`npx tsx scripts/testes/alertas.ts`) — 7 testes, 0 falhas
Evidência: `docs/evidencia/fase5_alertas.txt`.

| teste | esperado | obtido |
|---|---|---|
| `sync_01` sincronizar sem alterações | `qtd_reservada` intacta | 100 lotes; 0 inseridos, 0 atualizados, 0 lotes alterados; reservado total 40 |
| queda na origem (Dataflow com `dataset_variacao`) | refresh concluído | `Completed` em 48 s |
| `alrt_01` `L-ALRT` 50 → 30 com 40 reservados | exatamente 1 alerta com artigo, lote, reserva e encomenda | 1 alerta: `ART-001`, `L-ALRT`, reserva certa, `ENC-0002`, 40 > 30 |
| `alrt_02` repetir a sincronização | continua 1 | 0 alertas novos; 1 aberto |
| libertar a reserva | alerta resolvido | libertada; alerta `resolvido` |
| reposição | fonte `dataset`, `L-ALRT` sap 50, reservado 0 | refresh `Completed` em 85 s; sap 50, reservado 0 |

- **Frescura (medida):** refresh do Dataflow 48–85 s + sincronização ~0,5–1 s. Uma queda de stock só é vista depois de (a) o refresh do Dataflow correr e (b) a sincronização correr. Com refresh e sincronização agendados de 15 em 15 minutos, um alerta pode chegar até ~30 min depois da alteração na origem. **NÃO VERIFICADO:** intervalo mínimo do agendamento do Dataflow e cadência de uma pipeline.
- **Pronto quando:** `alrt_01`, `alrt_02`, `sync_01` passam → **cumprido**.
