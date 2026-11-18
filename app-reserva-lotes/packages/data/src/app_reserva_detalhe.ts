import { decimal, entity, one, role, text, uuid } from '@microsoft/rayfin-core';
import { app_reserva } from './app_reserva.js';

/** Quantidade reservada de um lote dentro de uma reserva (FK reserva_id). */
@entity()
@role('authenticated', 'read')
export class app_reserva_detalhe {
  @uuid() id!: string;
  @one(() => app_reserva) reserva!: app_reserva;
  @text({ max: 10 }) cod_armazem!: string;
  @text({ max: 20 }) cod_artigo!: string;
  @text({ max: 30 }) cod_lote!: string;
  @decimal({ precision: 18, scale: 3, min: 0 }) qtd!: number;
}
