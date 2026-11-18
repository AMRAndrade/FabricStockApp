// Gerado a partir de metadata.json (conector lh_reserva_lotes, Lakehouse só de leitura).
// Sem chave nem relações: o endpoint SQL do Lakehouse não expõe PK/FK.
// Nomes em snake_case iguais à tabela (regra 2 do projeto).
import { entity, role, date, text } from '@microsoft/rayfin-core';
import { Source } from '@microsoft/rayfin-connectors';

@role('authenticated', ['read'])
@entity()
export class fato_encomenda extends Source({ schema: 'dbo', table: 'fato_encomenda', primaryKey: [] }) {
  @text({ optional: true, max: 8000 }) cod_empresa?: string;
  @text({ optional: true, max: 8000 }) num_encomenda?: string;
  @text({ optional: true, max: 8000 }) cod_cliente?: string;
  @text({ optional: true, max: 8000 }) nome_cliente?: string;
  @date({ optional: true }) data_encomenda?: Date;
  @date({ optional: true }) data_entrega?: Date;
}
