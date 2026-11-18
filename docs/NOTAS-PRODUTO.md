# Notas de produto — feedback à UI da PoC (2026-11-18)

Ponto de partida para um **novo briefing** antes de construir a próxima versão.

## Feedback do utilizador sobre a UI da PoC
- O fluxo atual obriga o utilizador a **procurar a Sales Order e a linha** numa lista antes de ver stock: pouco prático.

## Visão pretendida
1. **Começar por um relatório de stock geral**, semelhante ao report de Power BI que já existe (visão global do stock por artigo/lote/armazém, com os atributos de qualidade).
2. **Escolher a Sales Order** e, dentro dela, **para cada linha escolher os stocks (lotes) a reservar**.
3. Em alternativa ou em complemento, **filtrar o stock por características** (por exemplo Brix) e reservar a partir daí.

## Perguntas para o novo briefing (a responder antes de construir)
- O relatório de Power BI existente deve ser **reaproveitado** (embebido, ou lido por conector de modelo semântico) ou **recriado** na app?
- Que colunas, agregações e filtros tem esse report hoje, e quais são indispensáveis no ecrã de stock?
- O ponto de entrada é o stock (filtrar → escolher lotes → associar a uma linha de SO) ou a SO (escolher SO → linha a linha escolher lotes)? Ou os dois?
- Numa SO com várias linhas, a reserva é feita **linha a linha** ou **toda a SO de uma vez** (tudo ou nada por SO)?
- Que características de qualidade são filtráveis (Brix, acidez, calibre, variedade, origem…) e com que operadores (>, intervalo, lista)?
- Sugestão automática de lotes (ex.: FEFO, melhor Brix) ou escolha sempre manual?

## O que a PoC já garante e se reaproveita
- Reserva atómica de vários lotes (`reservar`), libertação única (`libertar`), auditoria e identidade no servidor (POC-RELATORIO, Perguntas 1 e 3).
- Leitura do Lakehouse e filtro por atributos em chave-valor (Pergunta 2).
- Sincronização e alertas de stock (Pergunta 4).
A mudança é sobretudo de **experiência de utilização e de fluxo**; o núcleo transacional mantém-se.
