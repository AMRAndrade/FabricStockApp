// #region rayfin:app-owned — copied verbatim by the Rayfin CLI; edit freely.
//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import type {
  ConnectorConfigs,
  ConnectorsRuntime,
} from '@microsoft/rayfin-connectors';
// #endregion rayfin:app-owned

// Ficheiro mantido à mão (marcador @generated retirado): o CLI imprime a
// ligação necessária em vez de reescrever este ficheiro.
import {
  connectorConfig as lh_reserva_lotes_config,
  type LhReservaLotesSchema,
} from '../../../../rayfin/connectors/lh_reserva_lotes/schema';

export type AppConnectorsSchema = {
  lh_reserva_lotes: LhReservaLotesSchema;
};

export const connectorConfigs = {
  lh_reserva_lotes: lh_reserva_lotes_config,
} satisfies ConnectorConfigs<AppConnectorsSchema>;

// Categoria A (SQL): não precisa de runtime.
export const connectorRuntimes: ConnectorsRuntime = {};
