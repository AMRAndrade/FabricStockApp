# CLAUDE.md — Reserva de Lotes | PoC reduzida em Fabric App (Rayfin)

> Instruções do projeto para o Claude (Claude Code) executar a prova de conceito (PoC) de ponta a ponta:
> dados sintéticos → Dataflow Gen2 → Lakehouse → Fabric App (Rayfin) com base de dados própria, reserva e libertação atómicas, alertas de stock e relatório de decisão.
> Leia este ficheiro inteiro antes de executar qualquer fase. Execute uma fase de cada vez e valide antes de avançar.
> O projeto completo (SAP Business One, aprovações, papéis) está em `docs/PROJETO-BRIEF.md`. Este ficheiro cobre **apenas a PoC reduzida**.

---

## 1. Contexto

- **Projeto:** aplicação web para consultar stock por artigo e lote, filtrar lotes por qualidade (ex.: laranjas com Brix > 65) e reservar quantidades de vários lotes contra linhas de encomendas de venda.
- **Objetivo da PoC:** **não é o produto.** Produzir evidência para decidir entre:
  - **Opção A:** Rayfin / Fabric Apps (BD gerida no Fabric, APIs geradas, funções em TypeScript).
  - **Opção B:** SQL Server (procedimentos armazenados) + API fina + React, com Fabric/Power BI só para relatórios.
- **Perguntas que a PoC tem de responder (com evidência):**
  1. As reservas e libertações aguentam concorrência sem nunca alocar mais do que o disponível? (aviso da documentação oficial: Fabric Apps pode não servir para transações multi-passo ou procedimentos armazenados)
  2. A app consegue ler os dados de um Lakehouse alimentado por Dataflow Gen2 e filtrar lotes por atributos de qualidade com um modelo simples?
  3. A identidade do utilizador é obtida e imposta no servidor, e a auditoria é imutável?
  4. Uma alteração de stock na origem gera alertas corretos sobre reservas ativas?
- **Dados:** 100% sintéticos (seed 42), um CSV por tabela em `dataset/`, lidos pelo Dataflow Gen2 diretamente do GitHub.

### Fora de âmbito (não construir, não testar)
- **Aprovações e papéis** (requerente / aprovador / administrador): a reserva é criada diretamente no estado `ativa`.
- **Qualquer ligação ao SAP** (Service Layer, worker, validação em tempo real) e ao DWH.
- Notificações, comentários, modificação parcial de reservas, validação da quantidade reservada face à `qtd_pendente` da linha, multi-empresa, Power BI, endurecimento de segurança.

### Perguntas que esta PoC **não** responde (registar no relatório)
- Se a app consegue alcançar um SAP Service Layer em rede interna (o maior risco da arquitetura completa).
- Se os papéis e a aprovação funcionam com imposição no servidor.
- Licenciamento e capacidade além do consumo observado.

### Números de referência (dataset sintético) — usar para validar cada fase

Contagens fixadas pelo gerador `scripts/gerar_dataset.py` e testadas na Fase 2:

| tabela | linhas |
|---|---|
| `dim_armazem` | 2 |
| `dim_artigo` | 20 (3 do grupo `laranja`) |
| `dim_lote` | 100 |
| `dim_atributo_qualidade` | 5 |
| `fato_lote_atributo` | 500 (100 lotes × 5 atributos) |
| `fato_stock` | 100 (cada lote em exatamente um armazém) |
| `fato_encomenda` | 10 |
| `fato_encomenda_linha` | 25 (as 5 primeiras encomendas com 2 linhas, as 5 últimas com 3) |

### Lotes fixos para os cenários de teste

| lote | artigo | brix | qtd_fisica | uso |
|---|---|---|---|---|
| `L-CONC` | laranja | 68 | 100 | concorrência |
| `L-ATOM` | laranja | 67 | 5 | atomicidade (falta de stock no 2.º lote) |
| `L-ALRT` | laranja | 66 | 50 | alertas de stock |
| `L-FORA` | laranja | 64 | 80 | fora do filtro (Brix baixo) |
| `L-LIM` | laranja | 65,0 | 40 | limite: `Brix > 65` é estrito, não pode aparecer |

Encomendas fixas: `ENC-0001` linha 1 (laranja, usada na concorrência), `ENC-0001` linha 2 (atomicidade), `ENC-0002` linha 1 (alertas).

### Cenários de teste (todos têm resultado esperado por construção)

| fase | cenário | esperado |
|---|---|---|
| 3 | filtro: laranja, `brix > 65`, disponível > 0 | **12 lotes** (os 3 fixos `L-CONC`, `L-ATOM`, `L-ALRT` + 9 gerados); não aparecem `L-FORA`, `L-LIM` nem 2 lotes gerados com Brix > 65 e `qtd_fisica` 0 |
| 4 | 20 (e depois 50) reservas paralelas de 10 sobre `L-CONC` (`qtd_sap` 100) | exatamente **10 aceites**; as restantes recusadas por stock insuficiente; `qtd_reservada` = 100; nunca acima de 100 |
| 4 | reserva `[L-CONC 10, L-ATOM 10]` com `L-ATOM` a 5 | recusada; `L-CONC` inalterado; nenhuma reserva criada (tudo ou nada) |
| 4 | reserva `[L-CONC 10, L-ATOM 5]` | aceite, ambos reservados |
| 4 | libertar a mesma reserva 2 vezes em paralelo | só uma liberta; `qtd_reservada` desce uma só vez |
| 5 | `L-ALRT` com reserva de 40 e `qtd_sap` a descer de 50 para 30 | **1 alerta** (reservado 40 > sap 30) com artigo, lote, reserva e encomenda; repetir a sincronização não cria o segundo |

---

## 2. Regras do projeto (obrigatórias)

1. **Idioma:** português europeu em tudo (tabelas, colunas, textos da UI, comentários de código, commits, documentação). Respostas ao utilizador em português europeu.
2. **Nomenclatura:** `snake_case` em todos os identificadores: tabelas, colunas, ficheiros, variáveis, componentes e funções. Rótulos de exibição ficam em colunas `nome_*` (com acentos). Se o Rayfin não permitir `snake_case` nos nomes gerados a partir das classes TypeScript, registar no `docs/POC-LOG.md` e propor a adaptação.
3. **Prefixos:** `dim_` dimensões e `fato_` fatos (tabelas vindas do Lakehouse); `app_` tabelas operacionais escritas pela aplicação. Repositório e workspace `fabric-app-reserva-lotes`, app `app-reserva-lotes`, em kebab-case. O Lakehouse `lh_reserva_lotes` usa underscores.
4. **Segurança de dados:** nunca colar, versionar ou enviar dados reais em prompts, commits ou logs. A PoC usa apenas dados fictícios.
5. **Sem SAP:** esta PoC não liga ao SAP nem ao DWH. Nenhum código ou configuração dessas ligações.
6. **Reserva atómica:** a disponibilidade (`qtd_sap − qtd_reservada`) é verificada e atualizada **numa única operação atómica** sobre `app_saldo_lote`. Nunca "ler, calcular no cliente e gravar". Uma reserva com vários lotes aplica tudo ou nada. A libertação também é atómica e não pode libertar duas vezes.
7. **Identidade no servidor:** `criado_por` e o autor da auditoria vêm da identidade autenticada no servidor, nunca de um campo enviado pelo cliente. Testar chamando a API diretamente, não só pela UI. O acesso por omissão ao item do Fabric (todos os membros do workspace têm "Run and interact") não é autorização da aplicação.
8. **Sem mock na app:** a app só consome o backend. Se uma consulta falhar, mostrar estado de erro, nunca dados embutidos. As fixtures existem só nos testes.
9. **Sem credenciais no código:** usar a autenticação nativa do Fabric Apps (Entra ID/SSO). Segredos de funções com `npx rayfin secret set`. Nunca imprimir valores de segredos.
10. **Verificação documental (crítica):** nunca assumir que uma funcionalidade do Rayfin ou do Fabric existe. Ler primeiro a documentação oficial. O que a documentação não confirmar fica marcado como **NÃO VERIFICADO** e é testado empiricamente. Não inventar flags da CLI nem APIs: usar `npx rayfin --help` e a ajuda dos subcomandos.
11. **Falhas são resultado:** se algo falhar, **reportar**. Não contornar em silêncio. Cada achado vai para `docs/POC-LOG.md` (data, pergunta, fonte ou evidência, resultado: funciona / falha / pouco claro).
12. **Validar antes de avançar:** cada fase tem um checklist de pronto. Não saltar.
13. **Perguntar antes de:** fazer deploy (`npx rayfin up`), instalar software global, apagar ficheiros ou recursos, ou alterar definições do tenant ou do workspace. O deploy só vai para o workspace nomeado pelo utilizador.
14. **Esquema só por código:** nunca alterar manualmente a BD implantada. Mudanças de esquema só via código e `npx rayfin up db apply` (a documentação avisa que alterações manuais geram conflitos).
15. **Visual:** na PoC usar os estilos do template, sem personalização. **A confirmar com o utilizador:** se a decisão for GO, o produto adota o tema IBM Carbon (escuro g100 por omissão, claro g10) como no projeto DRE.

---

## 3. Arquitetura

```
scripts/gerar_dataset.py (seed 42)
        │
        ▼
dataset/*.csv (GitHub)
        │  Dataflow Gen2 (url_dataset + ler_csv, cola-se o M de dataflow/*.pq)
        ▼
lh_reserva_lotes (Lakehouse) ──── conector fabric-sqlanalytics (leitura) ────┐
                                                                             ▼
                                  app-reserva-lotes (Fabric App, Rayfin, TypeScript)
                                  ├─ BD da app (SQL database in Fabric): app_*
                                  ├─ Funções TypeScript: reservar, libertar, sincronizar
                                  └─ UI React (2 ecrãs)
```

| item | nome |
|---|---|
| workspace | `fabric-app-reserva-lotes` (capacidade Fabric) |
| lakehouse | `lh_reserva_lotes` |
| dataflow | `df-reserva-lotes` (Gen2, destino: Lakehouse) |
| fabric app | `app-reserva-lotes` |

**Diferenças face ao projeto DRE (matriz):** o DRE só lia um modelo semântico (consulta DAX só de leitura) e tinha `data`, `storage` e `functions` desligados no `rayfin.yml`. Aqui a app **escreve** (reservas, auditoria), por isso a BD própria (`data`) e as funções ficam **ligadas**. O Lakehouse passa a existir porque os conectores do Fabric Apps não leem Dataflows diretamente, só Lakehouse, Warehouse, SQL database in Fabric e modelo semântico.

**Template:** o DRE usou `dataapp`. Antes do scaffold, comparar `dataapp` e `blankapp` (`npm create @microsoft/rayfin@latest -- --help` e documentação) e registar a escolha e o motivo no `POC-LOG.md`.

**Estrutura do repositório:**

```
fabric-app-reserva-lotes/
  CLAUDE.md
  docs/  PROJETO-BRIEF.md, POC-LOG.md, POC-RELATORIO.md
  dataset/            # CSVs sintéticos (gerados; são fictícios, podem ir para o git)
  dataflow/           # scripts M (url_dataset, ler_csv, uma consulta por tabela)
  sql/                # testes de qualidade para o endpoint SQL do Lakehouse
  scripts/            # gerar_dataset.py, testes/*.ts, repor_estado.ts, simular_queda_stock.ts
  app-reserva-lotes/  # projeto Rayfin
```

Não versionar IDs do tenant (workspace, itens, capacidade), URLs de alojamento nem chaves: conferir o `git diff` antes de cada commit.

---

## 4. Fase 0 — Pré-requisitos

Marcar o que está feito. O Claude Code não consegue verificar o tenant sozinho: **perguntar ao utilizador** antes de avançar.

- [ ] Capacidade Fabric numa região com Fabric Apps disponível (ver a lista de regiões na documentação do Fabric).
- [ ] Workspace em **capacidade Fabric** (não em capacidade partilhada/Pro).
- [ ] Permissão Contributor, Member ou Admin no workspace.
- [ ] Tenant: workload **Fabric Apps (preview)** ativado pelo administrador.
- [ ] Node.js 20 ou superior e npm.
- [ ] Git, VS Code com o Claude Code e um repositório GitHub vazio, clonado.
- [ ] Python 3 (para `gerar_dataset.py`).
- [ ] Docker Desktop (a documentação refere a stack local com Docker; o site do Rayfin descreve o `rayfin dev` com backend no Fabric e frontend local; confirmar qual vale e se o Docker é mesmo necessário; verificar licenciamento do Docker Desktop na empresa).
- [ ] Lakehouse `lh_reserva_lotes` criado no workspace.
- [ ] Permissão para criar um Dataflow Gen2 no workspace.

> Fabric Apps e o Rayfin estão em **preview**. No início da Fase 0 registar no `POC-LOG.md` as versões usadas (Rayfin CLI, pacotes `@microsoft/rayfin-*`, Node) e rever https://learn.microsoft.com/en-us/fabric/apps/ e https://rayfin.ai/docs. O site do Rayfin diz que não é um produto Microsoft nem tem suporte da Microsoft, enquanto a Microsoft Learn documenta Fabric Apps como funcionalidade do Fabric: registar esta ambiguidade no relatório final.

**Leitura obrigatória antes de escrever código Rayfin:** https://rayfin.ai/llms.txt e https://rayfin.ai/docs/reference/agent-rules.md (qualquer página de rayfin.ai/docs está disponível em Markdown acrescentando `.md` ao URL) e as páginas de Fabric Apps da Microsoft Learn (visão geral, modelos de dados, conectores, funções, autenticação, implantação, referência da CLI).

### Pronto quando
- [ ] Scaffold criado, `npm run build` sem erros.
- [ ] `npx rayfin login` feito; app *hello-world* implantada no workspace nomeado (com autorização) e acessível com SSO.
- [ ] Região, versões e consumo de capacidade (se visível) registados no `POC-LOG.md`.

---

## 5. Fase 1 — Dados de origem (Dataflow Gen2 → Lakehouse)

### 5.1 Fonte
`scripts/gerar_dataset.py` gera os CSVs de `dataset/` de forma **determinística** (seed 42), incluindo os lotes e encomendas fixos da seção 1. O Dataflow Gen2 lê os CSVs do GitHub com duas expressões (como no projeto DRE, adaptadas ao M do dataflow):

- `url_dataset` (parâmetro, texto): URL base do repositório (`.../raw/main/dataset`).
- `ler_csv(arquivo, tipos)` (função): `Web.Contents(url_dataset, [RelativePath = arquivo & ".csv"])` → `Csv.Document` UTF-8 → cabeçalho → confere que as colunas são exatamente as esperadas → `Text.Trim` em tudo → tipos com cultura `en-US` → **falha o refresh** se alguma linha tiver valor que não converte.

O Claude Code escreve os scripts M em `dataflow/*.pq` (uma consulta por tabela) e o utilizador cola-os no Dataflow Gen2, no portal. O destino de cada consulta é uma tabela do `lh_reserva_lotes`. Se o `Web.Contents` com `RelativePath` não funcionar num Dataflow Gen2, registar e usar alternativa documentada.

### 5.2 Dicionário de dados

| tabela | colunas (tipo) | grão |
|---|---|---|
| `dim_armazem` | cod_empresa, cod_armazem, nome_armazem (string) | 2 armazéns |
| `dim_artigo` | cod_artigo, nome_artigo, grupo_artigo, unidade (string) | 20 artigos |
| `dim_lote` | cod_empresa, cod_artigo, cod_lote (string), data_producao, data_rececao, data_validade (date), estado_lote (`disponivel`/`bloqueado`) | 100 lotes |
| `dim_atributo_qualidade` | cod_atributo, nome_atributo, tipo_valor (`numero`/`texto`), unidade (string) | 5 atributos: brix, acidez, variedade, origem, calibre |
| `fato_lote_atributo` | cod_empresa, cod_artigo, cod_lote, cod_atributo (string), valor_numero (double), valor_texto (string) | lote × atributo |
| `fato_stock` | cod_empresa, cod_armazem, cod_artigo, cod_lote (string), qtd_fisica (double), data_hora_carga (datetime, gerado no Power Query) | empresa × armazém × artigo × lote |
| `fato_encomenda` | cod_empresa, num_encomenda, cod_cliente, nome_cliente (string), data_encomenda, data_entrega (date) | 1 linha por encomenda aberta |
| `fato_encomenda_linha` | cod_empresa, num_encomenda, num_linha (int), cod_artigo (string), qtd_pendente (double) | encomenda × linha |

Regras: `qtd_fisica ≥ 0`; texto vazio é `""`, nunca nulo; atributos de qualidade em formato chave-valor (`fato_lote_atributo`), para não alterar o esquema quando surgir um atributo novo. A coluna `cod_empresa` mantém-se para o futuro multi-empresa, mas só há uma empresa.

### Pronto quando
- [ ] Dataflow corre sem erro e as 8 tabelas existem no Lakehouse.
- [ ] Contagens iguais às da seção 1 (teste da Fase 2).
- [ ] Nenhum CSV contém dados reais.

---

## 6. Fase 2 — Qualidade dos dados

Testes SQL em `sql/qualidade_lakehouse.sql`, executados no endpoint SQL do Lakehouse. Cada teste devolve `grupo`, `teste`, `esperado`, `obtido`, `status` (`falha` quando diferente). Correr depois de cada refresh do dataflow.

| grupo | testes |
|---|---|
| `contagens` | linhas das 8 tabelas (seção 1) |
| `chaves` | chaves das dimensões sem vazio e sem duplicidade; grão de `fato_stock`, `fato_lote_atributo` e `fato_encomenda_linha` |
| `integridade` | lotes de `fato_stock` e `fato_lote_atributo` existem em `dim_lote`; artigos e armazéns existem nas dimensões; linhas de encomenda apontam para encomendas existentes |
| `sinal` | `qtd_fisica ≥ 0`; `qtd_pendente > 0` |
| `referencia` | os 5 lotes fixos com os valores da seção 1; filtro `laranja`, `brix > 65`, `qtd_fisica > 0` devolve 12 lotes |

### Pronto quando
- [ ] Todos os testes passam (0 falhas), com evidência no `POC-LOG.md`.

---

## 7. Fase 3 — Modelo da app, identidade e leitura do Lakehouse

### 7.1 Conector de leitura
Adicionar o conector do endpoint SQL do Lakehouse **só com leitura** (`npx rayfin connector add --type fabric-sqlanalytics ... --operations read`; confirmar a sintaxe exata com `npx rayfin connector add --help` e a documentação). Não usar o conector de Dataflows. Registar se a app implantada lê o Lakehouse com a identidade do utilizador ou da app, e que permissões são necessárias.

### 7.2 Entidades da app (BD própria, prefixo `app_`)

| entidade | colunas principais |
|---|---|
| `app_saldo_lote` | cod_empresa, cod_armazem, cod_artigo, cod_lote, qtd_sap, qtd_reservada, atualizado_em (**âncora da concorrência**) |
| `app_reserva` | id, cod_empresa, num_encomenda, num_linha, estado (`ativa`/`libertada`), criado_por, criado_em, libertado_em |
| `app_reserva_detalhe` | reserva_id, cod_armazem, cod_artigo, cod_lote, qtd |
| `app_alerta_stock` | cod_lote, reserva_id, num_encomenda, qtd_reservada, qtd_sap, estado, criado_em |
| `app_registo_auditoria` | id, utilizador, acao, entidade, antes, depois, criado_em (só inserção) |

Disponível = `qtd_sap − qtd_reservada`, por empresa, armazém, artigo e lote. Confirmar como o Rayfin gera nomes de tabelas e colunas a partir das classes (regra 2). Registar como se obtém a identidade do utilizador num endpoint ou função (claims do token).

### 7.3 Testes (chamando a API diretamente, não a UI)

| teste | esperado |
|---|---|
| `aut_01` chamada sem autenticação a qualquer operação de escrita | negada |
| `aut_02` reserva criada com `criado_por` diferente no corpo do pedido | o servidor ignora-o e grava a identidade autenticada |
| `aut_03` qualquer utilizador tenta alterar ou apagar `app_registo_auditoria` | negado |
| `filtro_01` laranja, `brix > 65`, disponível > 0 | 12 lotes (registar o tempo da consulta) |

### Pronto quando
- [ ] Esquema implantado só por código (`rayfin up db apply`).
- [ ] Os 4 testes passam e ficam registados com evidência.
- [ ] Mecanismo de identidade documentado, com as limitações encontradas.

---

## 8. Fase 4 — Concorrência (a fase mais importante)

**Pergunta:** consegue-se garantir que duas reservas simultâneas nunca alocam mais do que o disponível?

**Aviso da documentação:** a visão geral do Fabric Apps indica que a plataforma pode não ser adequada a aplicações com transações multi-passo complexas ou procedimentos armazenados. Não assumir que funciona nem que falha: testar.

Investigar por esta ordem e registar cada abordagem como funciona / falha / não verificado:

1. **Mutação atómica condicional** pela API gerada (uma só operação: `qtd_reservada = qtd_reservada + @qtd` com a condição `qtd_sap − qtd_reservada ≥ @qtd`, e verificar as linhas afetadas).
2. **Função Rayfin** com transação T-SQL com a identidade da app (`UPDATE` condicional ou `UPDLOCK, HOLDLOCK`). Confirmar se a função consegue ligar-se à BD da app e em que caminho de autenticação.
3. **Procedimento armazenado** por algum mecanismo documentado.
4. **`CHECK (qtd_reservada <= qtd_sap)`** como rede de segurança, apenas se puder ser aplicado sem quebrar o `rayfin up db apply`.

Operações a construir: `reservar(linha, [{lote, qtd}])` e `libertar(reserva_id)`, ambas com registo de auditoria na mesma transação.

Scripts: `scripts/testes/concorrencia.ts` e `scripts/repor_estado.ts` (repõe o estado dos lotes de teste; registar como o reset é feito).

| teste | cenário | esperado |
|---|---|---|
| `conc_01` | 20 reservas paralelas de 10 sobre `L-CONC` | 10 aceites, 10 recusadas |
| `conc_02` | 50 reservas paralelas de 10 sobre `L-CONC` | 10 aceites, 40 recusadas |
| `conc_03` | estado final de `L-CONC` | `qtd_reservada` = 100; nunca acima de 100 |
| `atom_01` | `[L-CONC 10, L-ATOM 10]`, com `L-ATOM` a 5 | recusada; `L-CONC` inalterado; nenhuma `app_reserva` criada |
| `atom_02` | `[L-CONC 10, L-ATOM 5]` | aceite, ambos reservados |
| `lib_01` | libertar uma reserva de 10 | `qtd_reservada` desce 10 |
| `lib_02` | libertar a mesma reserva 2 vezes em paralelo | uma só liberta; a segunda é recusada; `qtd_reservada` desce uma só vez |
| `aud_01` | cada reserva aceite e cada libertação | uma linha de auditoria na mesma transação |

Correr `conc_01` a `conc_03` **5 vezes**, repondo o estado entre execuções. Medir latência.

### Pronto quando
- [ ] 5/5 execuções passam, **ou** a falha está documentada com evidência (qual abordagem, qual erro, quantas reservas ficaram acima do disponível).
- [ ] Abordagem vencedora descrita no `POC-LOG.md` com o código mínimo.

---

## 9. Fase 5 — Sincronização e alertas de stock

**Sincronização Lakehouse → BD da app:** função ou script que lê `fato_stock` pelo conector e atualiza `app_saldo_lote.qtd_sap`, **preservando** `qtd_reservada`. Idempotente.

**Deteção:** depois de cada sincronização, criar um `app_alerta_stock` para cada saldo com `qtd_reservada > qtd_sap`, sem duplicar alertas existentes. O alerta identifica artigo, lote, reserva e encomenda.

**Simulação:** `scripts/simular_queda_stock.ts` produz uma variante do CSV `fato_stock` com `L-ALRT` a 30 (em `dataset_variacao/`), o dataflow volta a correr e a sincronização é repetida.

**Frescura:** registar o intervalo mínimo de refresh do dataflow (agendamento e pipeline). Não verificado: se uma pipeline permite cadência mais curta. Testar.

| teste | esperado |
|---|---|
| `alrt_01` queda de `L-ALRT` de 50 para 30 com 40 reservados | exatamente 1 alerta com artigo, lote, reserva e encomenda |
| `alrt_02` repetir a sincronização | continua 1 alerta |
| `sync_01` sincronizar sem alterações | `qtd_reservada` intacta em todos os lotes |

### Pronto quando
- [ ] `alrt_01`, `alrt_02` e `sync_01` passam.
- [ ] Cadência de refresh documentada, com a limitação para o requisito de alertas.
- [ ] Como agendar a sincronização de 15 a 30 minutos documentado (não construir).

---

## 10. Fase 6 — UI mínima (2 ecrãs)

Só depois de a Fase 4 passar. Estilos do template, sem personalização (regra 15). Reutilizar do template o fluxo de autenticação (`AuthGate`, `use-auth` ou equivalente): **não criar outro fluxo de login.**

- **Ecrã 1 — Stock e reserva:** lista de encomendas e linhas → escolher uma linha → filtrar lotes por qualidade (artigo, atributos como Brix) → ver disponível por lote → escolher lotes e quantidades → reservar. Validação no cliente **e** no servidor.
- **Ecrã 2 — Reservas e alertas:** reservas ativas por artigo e lote, alertas de stock, botão libertar.
- Estados de carregamento, vazio e erro. Sem dados fictícios.

Guião de teste manual para 2 utilizadores em `docs/POC-LOG.md`: dois utilizadores a reservar o mesmo lote quase ao mesmo tempo.

### Pronto quando
- [ ] Fluxo ponta a ponta funciona: filtrar, reservar, ver alerta, libertar.
- [ ] O segundo utilizador recebe uma recusa clara quando o stock acabou.
- [ ] A app abre dentro do portal do Fabric (registar se apps ligadas ao Lakehouse têm a limitação de só funcionarem abertas no portal).

---

## 11. Fase 7 — Relatório e decisão

Escrever `docs/POC-RELATORIO.md`. Para cada pergunta da seção 1: resposta, evidência (referência ao `POC-LOG.md`), confiança (alta / média / baixa). Incluir:

- as perguntas que a PoC **não** respondeu (seção 1) e o que seria preciso para as responder;
- tabela de riscos (preview sem data de disponibilidade geral, suporte, regiões, capacidade, transações);
- consumo observado de capacidade; licenciamento só com o que a documentação confirma (não inventar preços);
- estimativa de esforço para a fase seguinte;
- **recomendação:**

| resultado | decisão |
|---|---|
| Fase 4 passa (5/5) | **GO condicionado:** o Rayfin serve o núcleo de reservas; seguir para uma 2.ª PoC com SAP Service Layer, aprovações e papéis antes de comprometer o projeto completo |
| Fase 4 só passa com uma abordagem frágil ou parcial | **GO com reservas:** descrever o risco e o plano de mitigação |
| Fase 4 falha | **NO-GO** → descrever a Opção B |

### Opção B (plano de recurso)
SQL Server ou Azure SQL com procedimentos armazenados e bloqueio de linha em `saldo_lote` (`UPDLOCK, HOLDLOCK` ou atualização condicional), API fina (ASP.NET Core ou Node/TS), front-end React com Entra ID, Fabric e Power BI só para relatórios. A PoC reaproveita: modelo de dados, dataset, dataflow, testes de concorrência e identidade.

### Pronto quando
- [ ] Relatório completo, com decisão e próximos passos, sem afirmações não verificadas.

---

## 12. Roteiro da demo

1. Mostrar o workspace, o Lakehouse e o Dataflow, depois os testes de qualidade: 0 falhas.
2. No ecrã de stock, filtrar laranjas com Brix > 65: 12 lotes (`L-LIM` e `L-FORA` ficam de fora).
3. Reservar 10 de `L-CONC` para uma linha de encomenda e ver a auditoria.
4. **"Momento concorrência":** correr `scripts/testes/concorrencia.ts` com 50 reservas paralelas: exatamente 10 aceites, `qtd_reservada` = 100, 40 recusadas.
5. Tentar `[L-CONC 10, L-ATOM 10]`: recusada, nada reservado (tudo ou nada).
6. Simular a queda de stock de `L-ALRT`, correr o dataflow e a sincronização: 1 alerta com artigo, lote, reserva e encomenda. Libertar a reserva.
7. Mostrar o `POC-LOG.md` e o relatório de decisão.

---

## 13. Ordem de execução para o Claude

1. Ler este ficheiro, `docs/PROJETO-BRIEF.md` e a documentação listada na Fase 0. **Não escrever código ainda.** Responder em português europeu com: o que percebeu da PoC (cerca de 10 linhas), o que precisa do utilizador antes da Fase 0 e os comandos exatos que planeia correr. Esperar pelo OK.
2. Confirmar com o utilizador os pré-requisitos da Fase 0 (não é possível verificar o tenant sozinho).
3. Executar **uma fase de cada vez**; no fim de cada uma resumir: feito / verificado / falhou / preciso de ti. Commits pequenos depois de cada passo que funciona.
4. Mudou tabela, coluna ou M do dataflow: confirmar que os testes da Fase 2 continuam com 0 falhas e que a app não referencia campo removido.
5. Validar contra os números e cenários da seção 1 a cada fase.
6. Se uma fase estiver bloqueada há mais de cerca de 2 horas, parar e reportar as opções, em vez de insistir.
7. Nunca usar dados reais; parar e perguntar se aparecer qualquer ficheiro que não seja o dataset fictício.
8. Nunca versionar IDs do tenant, URLs de alojamento ou chaves: conferir o `git diff` antes de cada commit.
9. Código estrito em TypeScript, caminhos de Windows/PowerShell, sem frameworks nem abstrações que a PoC não precise.
