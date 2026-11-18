import { app_saldo_lote } from './app_saldo_lote.js';
import { app_reserva } from './app_reserva.js';
import { app_reserva_detalhe } from './app_reserva_detalhe.js';
import { app_alerta_stock } from './app_alerta_stock.js';
import { app_registo_auditoria } from './app_registo_auditoria.js';
import type { UniversalAppSchema } from '@rayfin-app/shared';

/**
 * Esquema da BD própria da app (tabelas app_*). Manter alinhado com
 * `UniversalAppSchema` em `@rayfin-app/shared`.
 */
export type { UniversalAppSchema };
export { app_saldo_lote, app_reserva, app_reserva_detalhe, app_alerta_stock, app_registo_auditoria };

export const schema = [app_saldo_lote, app_reserva, app_reserva_detalhe, app_alerta_stock, app_registo_auditoria];
