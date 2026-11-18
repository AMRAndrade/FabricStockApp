// Migra o df-reserva-lotes em vigor para url_dataset = raiz do repositório +
// parâmetro pasta_dataset (ver dataflow/url_dataset.pq). Motivo: o Dataflow
// associa a credencial da fonte Web ao caminho exato do URL; mudar a pasta no
// url_dataset falhava com "Credentials are required" (Fase 5, 2026-11-18).
//
// 1. cria (se não existir) uma ligação ShareableCloud Web anónima para a raiz;
// 2. reescreve a definição atual: parâmetros, ler_csv e a ligação Web associada,
//    mantendo os destinos de dados e a ligação ao Lakehouse configurados no portal.
// Idempotente. Uso: cd scripts; npx tsx migrar_dataflow_pasta.ts

import { randomUUID } from 'node:crypto';
import { esperar_operacao, id_item, id_workspace, pedido, token_az } from './lib/fabric_api.ts';

const WORKSPACE = 'fabric-app-reserva-lotes';
const DATAFLOW = 'df-reserva-lotes';
const RAIZ = 'https://raw.githubusercontent.com/AMRAndrade/FabricStockApp/main';

interface ligacao { id: string; gatewayId: string; connectionDetails: { type: string; path: string } }

const token = token_az('https://api.fabric.microsoft.com');

// 1. Ligação Web anónima para a raiz.
const lista = (await (await pedido(token, 'GET', '/connections')).json()) as { value: ligacao[] };
let raiz = lista.value.find((c) => c.connectionDetails?.type === 'Web' && c.connectionDetails.path === RAIZ);
if (!raiz) {
  raiz = (await (await pedido(token, 'POST', '/connections', {
    connectivityType: 'ShareableCloud',
    displayName: 'GitHub FabricStockApp (raiz, anónimo)',
    connectionDetails: { type: 'Web', creationMethod: 'Web', parameters: [{ dataType: 'Text', name: 'url', value: RAIZ }] },
    privacyLevel: 'Public',
    credentialDetails: {
      singleSignOnType: 'None', connectionEncryption: 'NotEncrypted',
      // A raiz do raw GitHub não devolve conteúdo (404); só os CSVs nas subpastas existem.
      skipTestConnection: true,
      credentials: { credentialType: 'Anonymous' },
    },
  })).json()) as ligacao;
  console.log('Ligação Web anónima criada para a raiz do repositório.');
} else {
  console.log('Ligação Web para a raiz já existia.');
}

// 2. Definição do Dataflow.
const ws = await id_workspace(token, WORKSPACE);
const df = await id_item(token, ws, 'Dataflow', DATAFLOW);
const definicao = (await esperar_operacao(token, await pedido(token, 'POST', `/workspaces/${ws}/items/${df}/getDefinition`))) as {
  definition: { parts: { path: string; payload: string; payloadType: string }[] };
};
const partes = definicao.definition.parts.filter((p) => p.path !== '.platform');
const ler = (caminho: string) => {
  const p = partes.find((x) => x.path === caminho);
  if (!p) throw new Error(`Definição sem ${caminho}`);
  return { parte: p, texto: Buffer.from(p.payload, 'base64').toString('utf8') };
};

const mashup = ler('mashup.pq');
let m = mashup.texto;
m = m.replace(/(shared url_dataset = ")[^"]*(")/, `$1${RAIZ}$2`);
if (!/shared pasta_dataset = /.test(m)) {
  m = m.replace(/(shared url_dataset = [^;]*;)/,
    '$1\r\nshared pasta_dataset = "dataset" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true];');
}
m = m.replace('[RelativePath = "/" & arquivo & ".csv"]', '[RelativePath = "/" & pasta_dataset & "/" & arquivo & ".csv"]');
if (!m.includes('pasta_dataset & "/" & arquivo') || !/DataDestinations/.test(m)) {
  throw new Error('Mashup inesperado: ler_csv não atualizado ou sem destinos de dados');
}
mashup.parte.payload = Buffer.from(m, 'utf8').toString('base64');

const meta = ler('queryMetadata.json');
const q = JSON.parse(meta.texto) as {
  queriesMetadata: Record<string, { queryId: string; queryName: string; loadEnabled?: boolean }>;
  connections?: { path: string; kind: string; connectionId: string }[];
};
q.queriesMetadata.pasta_dataset ??= { queryId: randomUUID(), queryName: 'pasta_dataset', loadEnabled: false };
q.connections = [
  ...(q.connections ?? []).filter((c) => c.kind !== 'Web'),
  { path: RAIZ, kind: 'Web', connectionId: JSON.stringify({ ClusterId: raiz.gatewayId, DatasourceId: raiz.id }) },
];
meta.parte.payload = Buffer.from(JSON.stringify(q, null, 2), 'utf8').toString('base64');

await esperar_operacao(token, await pedido(token, 'POST', `/workspaces/${ws}/items/${df}/updateDefinition`, { definition: { parts: partes } }));
console.log('Definição atualizada: url_dataset = raiz, pasta_dataset = "dataset", ligação Web = raiz.');
