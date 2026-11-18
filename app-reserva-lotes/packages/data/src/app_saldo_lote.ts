import { date, decimal, entity, role, text, uuid } from '@microsoft/rayfin-core';

/**
 * Saldo de um lote num armazém: âncora da concorrência das reservas.
 *
 * disponível = qtd_sap − qtd_reservada. Os clientes só leem; qtd_reservada é
 * alterada apenas por funções no servidor, numa operação atómica (regra 6).
 * qtd_sap vem da sincronização com fato_stock (Lakehouse) e nunca toca em
 * qtd_reservada.
 *
 * O Rayfin não suporta chaves compostas, por isso a unicidade de
 * (empresa, armazém, artigo, lote) é garantida pela coluna `chave`
 * (`cod_empresa|cod_armazem|cod_artigo|cod_lote`) com restrição unique.
 */
@entity()
@role('authenticated', 'read')
export class app_saldo_lote {
  @uuid() id!: string;
  @text({ max: 120, unique: true }) chave!: string;
  @text({ max: 10 }) cod_empresa!: string;
  @text({ max: 10 }) cod_armazem!: string;
  @text({ max: 20 }) cod_artigo!: string;
  @text({ max: 30 }) cod_lote!: string;
  @decimal({ precision: 18, scale: 3, min: 0 }) qtd_sap!: number;
  @decimal({ precision: 18, scale: 3, min: 0 }) qtd_reservada!: number;
  @date() atualizado_em!: Date;
}
