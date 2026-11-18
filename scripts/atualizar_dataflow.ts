// Aponta o parâmetro url_dataset do df-reserva-lotes para uma pasta do GitHub
// (dataset ou dataset_variacao) e corre o refresh. A definição é lida
// e reescrita a partir da atual, por isso os destinos e ligações configurados
// no portal mantêm-se. Depois corre o refresh (job Refresh).
//
// Uso: cd scripts; npx tsx atualizar_dataflow.ts --fonte dataset|dataset_variacao

import { correr_job, esperar_operacao, id_item, id_workspace, pedido, token_az } from './lib/fabric_api.ts';

const WORKSPACE = 'fabric-app-reserva-lotes';
const DATAFLOW = 'df-reserva-lotes';
const BASE = 'https://raw.githubusercontent.com/AMRAndrade/FabricStockApp/main/';

export type fonte_dataset = 'dataset' | 'dataset_variacao';

export async function atualizar_dataflow(fonte: fonte_dataset) {
  const token = token_az('https://api.fabric.microsoft.com');
  const ws = await id_workspace(token, WORKSPACE);
  const df = await id_item(token, ws, 'Dataflow', DATAFLOW);

  const definicao = (await esperar_operacao(token, await pedido(token, 'POST', `/workspaces/${ws}/items/${df}/getDefinition`))) as {
    definition: { parts: { path: string; payload: string; payloadType: string }[] };
  };
  const partes = definicao.definition.parts.filter((p) => p.path !== '.platform');
  const mashup = partes.find((p) => p.path === 'mashup.pq');
  if (!mashup) throw new Error('Definição sem mashup.pq');
  const texto = Buffer.from(mashup.payload, 'base64').toString('utf8');
  const padrao = /(shared url_dataset = ")[^"]*(")/;
  if (!padrao.test(texto)) throw new Error('Parâmetro url_dataset não encontrado no mashup');
  const novo = texto.replace(padrao, `$1${BASE}${fonte}$2`);
  if (!/DataDestinations/.test(novo)) throw new Error('Definição sem destinos de dados: configure-os no portal antes');
  mashup.payload = Buffer.from(novo, 'utf8').toString('base64');

  await esperar_operacao(token, await pedido(token, 'POST', `/workspaces/${ws}/items/${df}/updateDefinition`, { definition: { parts: partes } }));
  // O job 'Publish' devolve InvalidJobType neste Dataflow (CI/CD); o updateDefinition
  // já fica em vigor para o refresh seguinte (verificado pela variante L-ALRT na Fase 5).
  const refresh = await correr_job(token, ws, df, 'Refresh', DATAFLOW);
  return { url_dataset: `${BASE}${fonte}`, refresh };
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) {
  const i = process.argv.indexOf('--fonte');
  const fonte = i >= 0 ? process.argv[i + 1] : undefined;
  if (fonte !== 'dataset' && fonte !== 'dataset_variacao') throw new Error('Use --fonte dataset|dataset_variacao');
  const r = await atualizar_dataflow(fonte);
  console.log(JSON.stringify(r, null, 2));
  if (r.refresh.estado !== 'Completed') process.exit(1);
}
