# POC-RELATÓRIO — Reserva de Lotes em Fabric Apps (Rayfin)

**Data:** 2026-11-18 · **Ambiente:** workspace `fabric-app-reserva-lotes` (capacidade Fabric, West Europe) · **Versões:** Rayfin CLI e pacotes `@microsoft/rayfin-*` 2.0.0, Node 24.14.1 · **Dados:** 100% sintéticos (seed 42).
Evidência detalhada em `docs/POC-LOG.md` e `docs/evidencia/`.

## 1. Decisão

**Recomendação: GO condicionado.**

A pergunta crítica da PoC — reservas simultâneas nunca alocam mais do que o disponível — foi respondida **com evidência empírica**: 5/5 rondas de 20 e 50 reservas paralelas, sempre exatamente 10 aceites e `qtd_reservada` = 100, com atomicidade "tudo ou nada", libertação única e auditoria na mesma transação. Pela tabela de decisão do `CLAUDE.md` (Fase 4 passa 5/5), o Rayfin/Fabric Apps serve o núcleo de reservas.

O "condicionado" vem de cinco pontos que esta PoC não fecha e que pesam no projeto completo:

1. **A abordagem vencedora depende de raw SQL nas funções (`ctx.sql`), que a documentação classifica como experimental** e ativada pelo serviço por tenant. Não há data de disponibilidade geral.
2. **O SQL das funções corre com a conta do dono da app** (quem fez o deploy), não com uma identidade de serviço.
3. **As funções não conseguem ligar-se ao endpoint SQL do Lakehouse**; a sincronização lê as tabelas Delta diretamente do OneLake com código próprio.
4. **A ligação ao SAP Service Layer** (o maior risco da arquitetura completa) não foi testada.
5. **O teste manual da UI no browser com 2 utilizadores ainda não foi feito** (ver §3, Pergunta 2 e §4).

Próximo passo: uma 2.ª PoC com SAP Service Layer, aprovações e papéis, antes de comprometer o projeto completo (§7).

## 2. Resumo dos resultados por fase

| fase | resultado | evidência |
|---|---|---|
| 0 — pré-requisitos | scaffold `blankapp` (Universal App), build sem erros, deploy *hello-world* em 75 s, SSO confirmado pelo utilizador dentro do portal e no URL direto | POC-LOG, Fase 0 |
| 1 — Dataflow → Lakehouse | 8 tabelas carregadas; refresh 48–85 s; criação do Dataflow e refresh pela API REST | POC-LOG, Fase 1 |
| 2 — qualidade | **39 testes, 0 falhas** (contagens, chaves, integridade, sinal, referência; filtro = 12 lotes) | POC-LOG, Fase 2 |
| 3 — modelo, identidade, leitura | **13 testes, 0 falhas**; `filtro_01` = 12 lotes (3,2 s a frio, ~0,5 s a quente) | `docs/evidencia/fase3_identidade_filtro.txt` |
| 4 — concorrência | **5/5 rondas; 30 testes, 0 falhas**; p50 384 ms, p95 712 ms | `docs/evidencia/fase4_concorrencia_5_rondas.txt` |
| 5 — sincronização e alertas | **7 testes, 0 falhas**; 1 alerta correto, sem duplicados | `docs/evidencia/fase5_alertas.txt` |
| 6 — UI | 2 ecrãs implantados; 56 testes de UI (vitest) e 11/11 consultas dos ecrãs contra o backend; **teste manual no browser pendente** | POC-LOG, Fase 6 |

## 3. Respostas às perguntas da PoC

### Pergunta 1 — As reservas e libertações aguentam concorrência sem nunca alocar mais do que o disponível?

**Resposta: sim, com a abordagem 2 (função Rayfin com transação T-SQL).**

- Cada reserva é **um único `UPDATE` condicional** sobre `app_saldo_lotes` (`WITH (UPDLOCK, HOLDLOCK)`, condição `qtd_sap − qtd_reservada ≥ qtd`) dentro de uma transação; se o número de lotes atualizados for diferente do pedido, `ROLLBACK`. A reserva, os detalhes e a auditoria são gravados na mesma transação.
- `conc_01` (20 paralelas) e `conc_02` (50 paralelas): **5/5 rondas** com 10 aceites, as restantes recusadas, 0 erros; `qtd_reservada` = 100 = soma dos detalhes, nunca acima de `qtd_sap`.
- `atom_01`/`atom_02`: tudo ou nada confirmado. `lib_01`/`lib_02`: com 2 e 5 libertações paralelas da mesma reserva só uma liberta; `qtd_reservada` desce uma vez.
- Abordagens descartadas: a API gerada não permite atualização condicional (só filtra por `id`); não há `CHECK` multi-coluna nos decoradores; procedimentos armazenados não foram necessários (e criá-los fora do `rayfin up db apply` violaria a regra 14).
- O aviso da Microsoft Learn ("might not be suitable for complex multi-step transactions or stored procedures") **mantém-se válido para a API gerada**; as transações só são possíveis pelo raw SQL nas funções.

**Confiança: alta** no comportamento observado (350 reservas paralelas, 0 sobre-reservas); **média** na sustentabilidade, porque `ctx.sql` é experimental e depende de ativação no tenant.

### Pergunta 2 — A app consegue ler um Lakehouse alimentado por Dataflow Gen2 e filtrar lotes por qualidade com um modelo simples?

**Resposta: sim pela API; o teste manual da UI no browser está pendente.**

- Conector `fabric-sqlanalytics` só de leitura, identidade **delegated** (cada utilizador lê com as suas permissões). 8 entidades geradas a partir do `metadata.json` (o Lakehouse não expõe PK/FK, por isso são entidades sem chave).
- Atributos de qualidade em chave-valor (`fato_lote_atributo`): o filtro "laranja, Brix > 65, stock > 0" devolve **12 lotes**, inclui `L-CONC`, `L-ATOM` e `L-ALRT` e exclui `L-FORA` e `L-LIM` (`Brix > 65` estrito).
- A UI (ecrã 1) filtra por atributo numérico e mostra o disponível de `app_saldo_lote`. As consultas dos ecrãs foram validadas contra o backend implantado (11/11), mas **ninguém usou ainda os ecrãs no browser**, e não está registado se a app ligada ao Lakehouse funciona fora do portal.
- O endpoint SQL do Lakehouse **não é acessível a partir das funções** (TDS cai no runtime das funções, apesar de o mesmo driver e token funcionarem no PC). A sincronização lê a tabela Delta pelo OneLake (HTTPS, `hyparquet`), com limitações (sem deletion vectors nem logs compactados).

**Confiança: alta** na leitura e no filtro pela API; **média** na experiência no browser (pendente) e na leitura do Lakehouse a partir das funções (solução própria, não suportada pela documentação).

### Pergunta 3 — A identidade do utilizador é obtida e imposta no servidor, e a auditoria é imutável?

**Resposta: sim para a app; com uma ressalva sobre a identidade das escritas.**

- `ctx.user.id` (= `claims.sub`) no servidor é igual ao `session.user.id` do cliente. `criado_por` e o autor da auditoria vêm de `ctx.user.id`; as funções não têm parâmetro de identidade.
- `aut_01`: escrita sem token → **HTTP 401** no servidor (GraphQL e funções). `aut_02`: `criado_por`/`utilizador` forjados no corpo do pedido são ignorados. `aut_03`: update e delete na auditoria negados (também sobre uma linha real), leitura permitida.
- Todas as entidades `app_*` são só de leitura para clientes (`authenticated: read`); a configuração DAB aplicada confirma-o.
- Ressalvas:
  - a imutabilidade é imposta **na API**; na base de dados, as funções (identidade do dono da app) podem escrever em qualquer tabela. Uma auditoria resistente a administradores exigiria outra camada (por exemplo, exportação para armazenamento só de acréscimo);
  - as recusas de escrita chegam ao cliente como `Internal server error`, não como 403;
  - o servidor só conhece um identificador opaco (`sub`), sem nome nem email;
  - o acesso por omissão ao item ("Run and interact" para todos os membros do workspace) não é autorização da aplicação; papéis ficaram fora de âmbito.

**Confiança: alta** para a imposição na API; **média** para a auditoria imutável em sentido forte.

### Pergunta 4 — Uma alteração de stock na origem gera alertas corretos sobre reservas ativas?

**Resposta: sim.**

- `L-ALRT` com 40 reservados e a origem a descer de 50 para 30 → **1 alerta** com artigo `ART-001`, lote `L-ALRT`, reserva e encomenda `ENC-0002` (40 > 30). Repetir a sincronização não cria segundo alerta (índice único + `NOT EXISTS`). Sincronizar sem alterações deixa `qtd_reservada` intacta em todos os lotes. Libertar a reserva resolve o alerta.
- **Frescura:** refresh do Dataflow 48–85 s + sincronização ~1 s. Com ambos agendados de 15 em 15 min, o atraso máximo esperado é ~30 min. **NÃO VERIFICADO:** o intervalo mínimo de agendamento do Dataflow e de uma pipeline.

**Confiança: alta** na deteção; **média** na cadência em produção (agendamento não construído).

## 4. O que esta PoC não respondeu

| pergunta | o que seria preciso |
|---|---|
| A app consegue alcançar um **SAP Service Layer em rede interna**? (maior risco) | 2.ª PoC: função Rayfin a chamar o Service Layer. As funções já mostraram limitações de rede (TDS ao Lakehouse falhou), por isso é preciso testar cedo um gateway, private endpoint ou API intermédia publicada. |
| **Papéis e aprovação** com imposição no servidor | 2.ª PoC: `udf.authClaims` (claims dinâmicas) + políticas `@role` e verificação nas funções; testar com 3 utilizadores (requerente, aprovador, administrador). |
| **Licenciamento e capacidade** além do consumo observado | Ler o consumo na app Fabric Capacity Metrics durante uma carga realista; confirmar com a Microsoft o modelo de suporte (ver §5). |
| **Experiência no browser** e uso por 2 utilizadores reais | Executar o guião manual da Fase 6 (`POC-LOG.md`) dentro e fora do portal. |
| **Agendamento** do refresh e da sincronização (15–30 min) | Testar o agendamento do Dataflow e uma pipeline/notebook que chame `sincronizar_stock`; medir o intervalo mínimo. |
| Funções sem o dono como identidade | Verificar se existe (ou chega) identidade de serviço/workspace para as funções. |

## 5. Riscos

| risco | probabilidade | impacto | mitigação |
|---|---|---|---|
| Fabric Apps em **preview**, sem data de disponibilidade geral; APIs podem mudar (já houve breaking changes entre 1.35 e 2.0) | alta | alto | Fixar versões; testes automáticos da PoC como regressão a cada atualização; manter a Opção B preparada. |
| **`ctx.sql` experimental** e ativado por tenant: a abordagem vencedora depende dele | média | **muito alto** | Confirmar com a Microsoft o roadmap; plano de recurso = Opção B (o mesmo T-SQL num procedimento armazenado). |
| **Suporte ambíguo:** a Microsoft Learn documenta Fabric Apps como funcionalidade do Fabric "built on the Rayfin SDK"; o site rayfin.ai diz que o Rayfin não é um produto Microsoft com suporte Microsoft | média | alto | Esclarecer o canal de suporte antes do GO definitivo. |
| Escritas das funções com a **conta do dono da app** | média | alto | Conta técnica dedicada como dona do item; procedimento de transferência; verificar identidade de workspace/serviço. |
| **Rede das funções:** TDS ao Lakehouse falhou; SAP em rede interna por testar | alta | **muito alto** | 2.ª PoC focada nisto em primeiro lugar. |
| Leitura Delta própria (OneLake + hyparquet) sem deletion vectors nem logs compactados | média | médio | Escrever o stock na BD da app por uma pipeline suportada, ou validar uma via oficial quando existir. |
| **Regiões:** Fabric Apps não está em todas as regiões (West Europe funcionou) | baixa | médio | Confirmar a região da capacidade de produção. |
| **Capacidade:** consumo não medido nesta PoC | média | médio | Medir na Capacity Metrics com carga realista. |
| Erros de permissão genéricos (`Internal server error`) | alta | baixo | Mensagens próprias nas funções; a UI só escreve por funções. |

## 6. Capacidade e licenciamento

- **Consumo observado:** não medido. A app Fabric Capacity Metrics não foi consultada durante a PoC.
- **O que a documentação confirma** (`@microsoft/rayfin-guide`, "Pricing and capacity usage"):
  - não há cobranças específicas do Rayfin; paga-se em CUs da capacidade Fabric do workspace;
  - consomem CUs: a SQL database da app (computação e armazenamento; 1 CU = 0,383 vCores), a API GraphQL (10 CUs por hora de processamento de pedidos) e o armazenamento e leituras/escritas OneLake do conteúdo estático;
  - não têm CU próprio: o WebService do Rayfin, a autenticação (Entra SSO) e as operações de deploy.
- **Não documentado na página consultada:** o consumo das Functions (User Data Functions) e do raw SQL. Fica NÃO VERIFICADO.
- Sem preços nesta análise: dependem do SKU de capacidade contratado.

## 7. Próxima fase e estimativa de esforço

Estimativa indicativa para **uma pessoa** familiarizada com o resultado desta PoC; a confirmar depois da 2.ª PoC.

| bloco | âmbito | esforço |
|---|---|---|
| 2.ª PoC — SAP Service Layer | função a chamar o Service Layer em rede interna; leitura de stock/lotes e escrita de reservas; tratamento de sessão e erros | 1,5–3 semanas (muito dependente da rede) |
| 2.ª PoC — papéis e aprovações | claims dinâmicas, estados `pendente → ativa`, imposição no servidor, testes com 3 papéis | 1–1,5 semanas |
| Endurecimento do núcleo | conta técnica dona da app, agendamento refresh/sincronização, mensagens de erro, observabilidade (Application Insights) | 1 semana |
| UI de produto | tema IBM Carbon (escuro g100 por omissão, claro g10) **se confirmado pelo utilizador** (regra 15), ecrãs completos | 2–3 semanas |

## 8. Opção B (plano de recurso)

SQL Server/Azure SQL com procedimentos armazenados e bloqueio de linha em `saldo_lote` (o **mesmo T-SQL** validado aqui: `UPDATE … WITH (UPDLOCK, HOLDLOCK) WHERE disponível ≥ qtd`), API fina (ASP.NET Core ou Node/TS), React com Entra ID; Fabric e Power BI só para relatórios. Reaproveita desta PoC: modelo de dados, dataset, Dataflow e testes de qualidade, testes de concorrência e identidade (`scripts/testes/`), lógica T-SQL de reservar/libertar/sincronizar.

A Opção B passa a recomendada se: (a) `ctx.sql` não tiver compromisso de GA; (b) a 2.ª PoC mostrar que as funções não alcançam o SAP; ou (c) o modelo de suporte não for aceitável.

## 9. Desvios às regras do projeto (para decisão)

- **Regra 2 (nomes):** o Rayfin pluraliza os nomes das tabelas (`app_saldo_lotes`); proposta: aceitar. Componentes React em PascalCase e hooks `useX`, exigidos pelo JSX e pelo lint; proposta: aceitar só para identificadores React.
- **Dataflow:** `url_dataset` passou a ser a raiz do repositório, com novo parâmetro `pasta_dataset`, porque a credencial Web fica presa ao caminho exato do URL.
- **Sincronização:** lê o Lakehouse pelo OneLake/Delta, não pelo conector (que não funciona dentro das funções).
- **`repor_lotes_teste`:** função só para a PoC (apaga reservas dos 5 lotes de teste, auditada); retirar antes de produção.
