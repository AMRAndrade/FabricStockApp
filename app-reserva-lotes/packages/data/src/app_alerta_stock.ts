import { date, decimal, entity, one, role, set, text, uuid } from '@microsoft/rayfin-core';
import { app_reserva } from './app_reserva.js';

/**
 * Alerta criado pela sincronização quando qtd_reservada > qtd_sap num lote
 * com reservas ativas. `chave` (`reserva_id|cod_lote`, unique) impede que uma
 * nova sincronização duplique o alerta.
 */
@entity()
@role('authenticated', 'read')
export class app_alerta_stock {
  @uuid() id!: string;
  @text({ max: 80, unique: true }) chave!: string;
  @one(() => app_reserva) reserva!: app_reserva;
  @text({ max: 10 }) cod_armazem!: string;
  @text({ max: 20 }) cod_artigo!: string;
  @text({ max: 30 }) cod_lote!: string;
  @text({ max: 20 }) num_encomenda!: string;
  @decimal({ precision: 18, scale: 3 }) qtd_reservada!: number;
  @decimal({ precision: 18, scale: 3 }) qtd_sap!: number;
  @set('aberto', 'resolvido') estado!: 'aberto' | 'resolvido';
  @date() criado_em!: Date;
}
