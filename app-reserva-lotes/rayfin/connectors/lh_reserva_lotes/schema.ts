// Conector lh_reserva_lotes (fabric-sqlanalytics, só leitura, auth delegated).
import type { GraphQLBackedConnector } from '@microsoft/rayfin-connector-fabric-graphql';
import type { ConnectorConfig } from '@microsoft/rayfin-connectors';

import { dim_armazem } from './dim_armazem.js';
import { dim_artigo } from './dim_artigo.js';
import { dim_atributo_qualidade } from './dim_atributo_qualidade.js';
import { dim_lote } from './dim_lote.js';
import { fato_encomenda } from './fato_encomenda.js';
import { fato_encomenda_linha } from './fato_encomenda_linha.js';
import { fato_lote_atributo } from './fato_lote_atributo.js';
import { fato_stock } from './fato_stock.js';

export { dim_armazem } from './dim_armazem.js';
export { dim_artigo } from './dim_artigo.js';
export { dim_atributo_qualidade } from './dim_atributo_qualidade.js';
export { dim_lote } from './dim_lote.js';
export { fato_encomenda } from './fato_encomenda.js';
export { fato_encomenda_linha } from './fato_encomenda_linha.js';
export { fato_lote_atributo } from './fato_lote_atributo.js';
export { fato_stock } from './fato_stock.js';

export const connectorConfig = {
  connector: 'fabric-sqlanalytics',
  operations: ['read'],
  entities: { dim_armazem, dim_artigo, dim_atributo_qualidade, dim_lote, fato_encomenda, fato_encomenda_linha, fato_lote_atributo, fato_stock },
} as const satisfies ConnectorConfig;

export type LhReservaLotesSchema = GraphQLBackedConnector<
  { dim_armazem: typeof dim_armazem; dim_artigo: typeof dim_artigo; dim_atributo_qualidade: typeof dim_atributo_qualidade; dim_lote: typeof dim_lote; fato_encomenda: typeof fato_encomenda; fato_encomenda_linha: typeof fato_encomenda_linha; fato_lote_atributo: typeof fato_lote_atributo; fato_stock: typeof fato_stock },
  typeof connectorConfig
>;
