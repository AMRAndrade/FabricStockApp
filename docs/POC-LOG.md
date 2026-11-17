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

### Pendente para fechar a Fase 0
- [ ] `npx rayfin login` (interativo, pelo utilizador).
- [ ] Deploy *hello-world* para o workspace `fabric-app-reserva-lotes` (`npx rayfin up --workspace "fabric-app-reserva-lotes"`), com autorização explícita.
- [ ] Acesso por SSO ao URL da app; região e consumo de capacidade.

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
- **NÃO VERIFICADO:** `Web.Contents` + `RelativePath` dentro de Dataflow Gen2 (a testar no portal); o repositório tem de ser legível pelo dataflow (público ou credencial configurada).

### 2026-11-17 · Testes de qualidade (`sql/qualidade_lakehouse.sql`)
- 39 testes (contagens, chaves, integridade, sinal, referência).
- Ensaio prévio: a mesma lógica corrida em SQLite sobre os CSVs (traduções mínimas de dialeto) → 39 testes, 0 falhas. **Isto não substitui** a execução no endpoint SQL do Lakehouse (Fase 2).
