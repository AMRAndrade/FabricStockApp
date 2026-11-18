import { date, entity, role, text, uuid } from '@microsoft/rayfin-core';

/**
 * Registo de auditoria, só de inserção. Os clientes só leem (sem update nem
 * delete na API gerada); as linhas são escritas pelas funções na mesma
 * transação da operação auditada. `utilizador` é a identidade do servidor.
 */
@entity()
@role('authenticated', 'read')
export class app_registo_auditoria {
  @uuid() id!: string;
  @text({ max: 200 }) utilizador!: string;
  @text({ max: 40 }) acao!: string;
  @text({ max: 60 }) entidade!: string;
  @text({ max: 60 }) entidade_id!: string;
  @text({ max: 4000, optional: true }) antes?: string;
  @text({ max: 4000, optional: true }) depois?: string;
  @date() criado_em!: Date;
}
