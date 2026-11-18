// Corre a sincronização Lakehouse (fato_stock) → app_saldo_lote no servidor
// (função `sincronizar_stock`) e imprime o resultado. Uso: npx tsx sincronizar.ts
import { criar_cliente_autenticado } from './lib/cliente.ts';

const cliente = await criar_cliente_autenticado();
console.log(JSON.stringify(await cliente.functions.sincronizar_stock.invoke(), null, 2));
cliente.dispose();
