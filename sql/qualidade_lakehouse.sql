-- Testes de qualidade do lh_reserva_lotes (endpoint SQL do Lakehouse).
-- Correr depois de cada refresh do df-reserva-lotes. Cada linha: grupo, teste,
-- esperado, obtido, status ('ok' / 'falha'). Resultado aceite: 0 falhas.
-- As falhas aparecem primeiro na ordenação.

WITH
brix AS (
    SELECT cod_empresa, cod_artigo, cod_lote, valor_numero AS brix
    FROM dbo.fato_lote_atributo
    WHERE cod_atributo = 'brix'
),
testes AS (
    -- contagens --------------------------------------------------------
    SELECT 'contagens' AS grupo, 'dim_armazem' AS teste, CAST(2 AS bigint) AS esperado, COUNT_BIG(*) AS obtido FROM dbo.dim_armazem
    UNION ALL SELECT 'contagens', 'dim_artigo', 20, COUNT_BIG(*) FROM dbo.dim_artigo
    UNION ALL SELECT 'contagens', 'dim_artigo_laranja', 3, COUNT_BIG(*) FROM dbo.dim_artigo WHERE grupo_artigo = 'laranja'
    UNION ALL SELECT 'contagens', 'dim_lote', 100, COUNT_BIG(*) FROM dbo.dim_lote
    UNION ALL SELECT 'contagens', 'dim_atributo_qualidade', 5, COUNT_BIG(*) FROM dbo.dim_atributo_qualidade
    UNION ALL SELECT 'contagens', 'fato_lote_atributo', 500, COUNT_BIG(*) FROM dbo.fato_lote_atributo
    UNION ALL SELECT 'contagens', 'fato_stock', 100, COUNT_BIG(*) FROM dbo.fato_stock
    UNION ALL SELECT 'contagens', 'fato_encomenda', 10, COUNT_BIG(*) FROM dbo.fato_encomenda
    UNION ALL SELECT 'contagens', 'fato_encomenda_linha', 25, COUNT_BIG(*) FROM dbo.fato_encomenda_linha

    -- chaves: vazias e duplicadas (esperado 0) -----------------------
    UNION ALL SELECT 'chaves', 'dim_armazem_vazia', 0, COUNT_BIG(*) FROM dbo.dim_armazem
        WHERE NULLIF(cod_empresa, '') IS NULL OR NULLIF(cod_armazem, '') IS NULL
    UNION ALL SELECT 'chaves', 'dim_armazem_duplicada', 0, COUNT_BIG(*) FROM (
        SELECT cod_empresa, cod_armazem FROM dbo.dim_armazem GROUP BY cod_empresa, cod_armazem HAVING COUNT(*) > 1) d
    UNION ALL SELECT 'chaves', 'dim_artigo_vazia', 0, COUNT_BIG(*) FROM dbo.dim_artigo WHERE NULLIF(cod_artigo, '') IS NULL
    UNION ALL SELECT 'chaves', 'dim_artigo_duplicada', 0, COUNT_BIG(*) FROM (
        SELECT cod_artigo FROM dbo.dim_artigo GROUP BY cod_artigo HAVING COUNT(*) > 1) d
    UNION ALL SELECT 'chaves', 'dim_lote_vazia', 0, COUNT_BIG(*) FROM dbo.dim_lote
        WHERE NULLIF(cod_empresa, '') IS NULL OR NULLIF(cod_artigo, '') IS NULL OR NULLIF(cod_lote, '') IS NULL
    UNION ALL SELECT 'chaves', 'dim_lote_duplicada', 0, COUNT_BIG(*) FROM (
        SELECT cod_empresa, cod_artigo, cod_lote FROM dbo.dim_lote GROUP BY cod_empresa, cod_artigo, cod_lote HAVING COUNT(*) > 1) d
    UNION ALL SELECT 'chaves', 'dim_atributo_qualidade_vazia', 0, COUNT_BIG(*) FROM dbo.dim_atributo_qualidade WHERE NULLIF(cod_atributo, '') IS NULL
    UNION ALL SELECT 'chaves', 'dim_atributo_qualidade_duplicada', 0, COUNT_BIG(*) FROM (
        SELECT cod_atributo FROM dbo.dim_atributo_qualidade GROUP BY cod_atributo HAVING COUNT(*) > 1) d
    UNION ALL SELECT 'chaves', 'fato_stock_grao', 0, COUNT_BIG(*) FROM (
        SELECT cod_empresa, cod_armazem, cod_artigo, cod_lote FROM dbo.fato_stock
        GROUP BY cod_empresa, cod_armazem, cod_artigo, cod_lote HAVING COUNT(*) > 1) d
    UNION ALL SELECT 'chaves', 'fato_stock_lote_um_armazem', 0, COUNT_BIG(*) FROM (
        SELECT cod_empresa, cod_artigo, cod_lote FROM dbo.fato_stock
        GROUP BY cod_empresa, cod_artigo, cod_lote HAVING COUNT(*) > 1) d
    UNION ALL SELECT 'chaves', 'fato_lote_atributo_grao', 0, COUNT_BIG(*) FROM (
        SELECT cod_empresa, cod_artigo, cod_lote, cod_atributo FROM dbo.fato_lote_atributo
        GROUP BY cod_empresa, cod_artigo, cod_lote, cod_atributo HAVING COUNT(*) > 1) d
    UNION ALL SELECT 'chaves', 'fato_encomenda_duplicada', 0, COUNT_BIG(*) FROM (
        SELECT cod_empresa, num_encomenda FROM dbo.fato_encomenda GROUP BY cod_empresa, num_encomenda HAVING COUNT(*) > 1) d
    UNION ALL SELECT 'chaves', 'fato_encomenda_linha_grao', 0, COUNT_BIG(*) FROM (
        SELECT cod_empresa, num_encomenda, num_linha FROM dbo.fato_encomenda_linha
        GROUP BY cod_empresa, num_encomenda, num_linha HAVING COUNT(*) > 1) d

    -- integridade (esperado 0 órfãos) --------------------------------
    UNION ALL SELECT 'integridade', 'fato_stock_lote_sem_dim', 0, COUNT_BIG(*) FROM dbo.fato_stock s
        WHERE NOT EXISTS (SELECT 1 FROM dbo.dim_lote l
            WHERE l.cod_empresa = s.cod_empresa AND l.cod_artigo = s.cod_artigo AND l.cod_lote = s.cod_lote)
    UNION ALL SELECT 'integridade', 'fato_stock_armazem_sem_dim', 0, COUNT_BIG(*) FROM dbo.fato_stock s
        WHERE NOT EXISTS (SELECT 1 FROM dbo.dim_armazem a WHERE a.cod_empresa = s.cod_empresa AND a.cod_armazem = s.cod_armazem)
    UNION ALL SELECT 'integridade', 'dim_lote_sem_stock', 0, COUNT_BIG(*) FROM dbo.dim_lote l
        WHERE NOT EXISTS (SELECT 1 FROM dbo.fato_stock s
            WHERE s.cod_empresa = l.cod_empresa AND s.cod_artigo = l.cod_artigo AND s.cod_lote = l.cod_lote)
    UNION ALL SELECT 'integridade', 'fato_lote_atributo_lote_sem_dim', 0, COUNT_BIG(*) FROM dbo.fato_lote_atributo f
        WHERE NOT EXISTS (SELECT 1 FROM dbo.dim_lote l
            WHERE l.cod_empresa = f.cod_empresa AND l.cod_artigo = f.cod_artigo AND l.cod_lote = f.cod_lote)
    UNION ALL SELECT 'integridade', 'fato_lote_atributo_atributo_sem_dim', 0, COUNT_BIG(*) FROM dbo.fato_lote_atributo f
        WHERE NOT EXISTS (SELECT 1 FROM dbo.dim_atributo_qualidade a WHERE a.cod_atributo = f.cod_atributo)
    UNION ALL SELECT 'integridade', 'dim_lote_artigo_sem_dim', 0, COUNT_BIG(*) FROM dbo.dim_lote l
        WHERE NOT EXISTS (SELECT 1 FROM dbo.dim_artigo a WHERE a.cod_artigo = l.cod_artigo)
    UNION ALL SELECT 'integridade', 'fato_encomenda_linha_artigo_sem_dim', 0, COUNT_BIG(*) FROM dbo.fato_encomenda_linha el
        WHERE NOT EXISTS (SELECT 1 FROM dbo.dim_artigo a WHERE a.cod_artigo = el.cod_artigo)
    UNION ALL SELECT 'integridade', 'fato_encomenda_linha_sem_encomenda', 0, COUNT_BIG(*) FROM dbo.fato_encomenda_linha el
        WHERE NOT EXISTS (SELECT 1 FROM dbo.fato_encomenda e
            WHERE e.cod_empresa = el.cod_empresa AND e.num_encomenda = el.num_encomenda)

    -- sinal ----------------------------------------------------------
    UNION ALL SELECT 'sinal', 'qtd_fisica_negativa_ou_nula', 0, COUNT_BIG(*) FROM dbo.fato_stock WHERE qtd_fisica IS NULL OR qtd_fisica < 0
    UNION ALL SELECT 'sinal', 'qtd_pendente_nao_positiva', 0, COUNT_BIG(*) FROM dbo.fato_encomenda_linha WHERE qtd_pendente IS NULL OR qtd_pendente <= 0
    UNION ALL SELECT 'sinal', 'texto_nulo', 0, COUNT_BIG(*) FROM dbo.fato_lote_atributo WHERE valor_texto IS NULL

    -- referência: lotes fixos (1 = linha com os valores da secção 1) ---
    UNION ALL SELECT 'referencia', 'lote_' + v.cod_lote, 1, COUNT_BIG(l.cod_lote)
    FROM (VALUES ('L-CONC', 68.0, 100.0), ('L-ATOM', 67.0, 5.0), ('L-ALRT', 66.0, 50.0),
                 ('L-FORA', 64.0, 80.0), ('L-LIM', 65.0, 40.0)) v(cod_lote, brix, qtd_fisica)
    LEFT JOIN dbo.dim_lote l ON l.cod_lote = v.cod_lote
        AND EXISTS (SELECT 1 FROM dbo.dim_artigo a WHERE a.cod_artigo = l.cod_artigo AND a.grupo_artigo = 'laranja')
        AND EXISTS (SELECT 1 FROM brix b WHERE b.cod_lote = l.cod_lote AND b.brix = v.brix)
        AND EXISTS (SELECT 1 FROM dbo.fato_stock s WHERE s.cod_lote = l.cod_lote AND s.qtd_fisica = v.qtd_fisica)
    GROUP BY v.cod_lote
    UNION ALL SELECT 'referencia', 'filtro_laranja_brix_65', 12, COUNT_BIG(*)
    FROM dbo.dim_lote l
    JOIN dbo.dim_artigo a ON a.cod_artigo = l.cod_artigo AND a.grupo_artigo = 'laranja'
    JOIN brix b ON b.cod_empresa = l.cod_empresa AND b.cod_artigo = l.cod_artigo AND b.cod_lote = l.cod_lote
    JOIN dbo.fato_stock s ON s.cod_empresa = l.cod_empresa AND s.cod_artigo = l.cod_artigo AND s.cod_lote = l.cod_lote
    WHERE b.brix > 65 AND s.qtd_fisica > 0
)
SELECT grupo, teste, esperado, obtido,
       CASE WHEN esperado = obtido THEN 'ok' ELSE 'falha' END AS status
FROM testes
ORDER BY CASE WHEN esperado = obtido THEN 1 ELSE 0 END, grupo, teste;
