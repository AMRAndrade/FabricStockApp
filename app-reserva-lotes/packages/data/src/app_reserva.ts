import { date, entity, int, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * Reserva de stock contra uma linha de encomenda de venda.
 *
 * Criada diretamente em `ativa` (sem aprovações nesta PoC). `criado_por` é a
 * identidade autenticada obtida no servidor (`ctx.user.id`), nunca um valor
 * enviado pelo cliente (regra 7). Os clientes só leem.
 */
@entity()
@role('authenticated', 'read')
export class app_reserva {
  @uuid() id!: string;
  @text({ max: 10 }) cod_empresa!: string;
  @text({ max: 20 }) num_encomenda!: string;
  @int({ min: 1 }) num_linha!: number;
  @set('ativa', 'libertada') estado!: 'ativa' | 'libertada';
  @text({ max: 200 }) criado_por!: string;
  @date() criado_em!: Date;
  @date({ optional: true }) libertado_em?: Date;
}
