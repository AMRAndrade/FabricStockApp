// Fase 5 — gera dataset_variacao/: cópia dos 8 CSVs de dataset/ com o lote
// L-ALRT a 30 em fato_stock (em vez de 50). O Dataflow lê esta variante quando
// o parâmetro url_dataset aponta para .../main/dataset_variacao.
//
// Uso: cd scripts; npx tsx simular_queda_stock.ts

import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..');
const ORIGEM = join(RAIZ, 'dataset');
const DESTINO = join(RAIZ, 'dataset_variacao');
const LOTE = 'L-ALRT';
const QTD_ORIGINAL = '50.0';
const QTD_NOVA = '30.0';

mkdirSync(DESTINO, { recursive: true });
for (const ficheiro of readdirSync(ORIGEM).filter((f) => f.endsWith('.csv'))) {
  copyFileSync(join(ORIGEM, ficheiro), join(DESTINO, ficheiro));
}

const caminho = join(DESTINO, 'fato_stock.csv');
const linhas = readFileSync(caminho, 'utf8').split('\n');
const cabecalho = linhas[0].split(',');
const i_lote = cabecalho.indexOf('cod_lote');
const i_qtd = cabecalho.indexOf('qtd_fisica');
let alteradas = 0;
const novas = linhas.map((linha, n) => {
  const campos = linha.split(',');
  if (n === 0 || campos[i_lote] !== LOTE) return linha;
  if (campos[i_qtd] !== QTD_ORIGINAL) throw new Error(`${LOTE}: esperado ${QTD_ORIGINAL}, encontrado ${campos[i_qtd]}`);
  campos[i_qtd] = QTD_NOVA;
  alteradas++;
  return campos.join(',');
});
if (alteradas !== 1) throw new Error(`esperada 1 linha de ${LOTE}, alteradas ${alteradas}`);
writeFileSync(caminho, novas.join('\n'), 'utf8');
console.log(`dataset_variacao/: 8 CSVs; fato_stock ${LOTE} ${QTD_ORIGINAL} → ${QTD_NOVA}`);
