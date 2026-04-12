import archiver from 'archiver';
import { Response } from 'express';
import * as db from '../../db/index.js';

export async function gerarBackupZip(res: Response, tenantId: string): Promise<boolean> {
  try {
    // Buscar todos os dados
    const result = await db.gerarBackupCompleto(tenantId);
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Falha ao gerar backup');
    }
    const dados = result.data;
    
    // Configurar headers para download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="App Gelder.zip"');
    
    // Criar arquivo ZIP
    const archive = archiver('zip', {
      zlib: { level: 9 } // Máxima compressão
    });
    
    // Pipe do ZIP para a resposta HTTP
    archive.pipe(res);
    
    // Adicionar arquivo de informações do backup
    archive.append(JSON.stringify({
      dataBackup: dados.dataBackup,
      sistema: 'App Gelder - Sistema de Gestão de Vendas',
      versao: '1.0',
    }, null, 2), { name: 'info.json' });
    
    // Adicionar cada tabela como arquivo JSON separado
    archive.append(JSON.stringify(dados.produtos, null, 2), { name: 'produtos.json' });
    archive.append(JSON.stringify(dados.clientes, null, 2), { name: 'clientes.json' });
    archive.append(JSON.stringify(dados.vendedores, null, 2), { name: 'vendedores.json' });
    archive.append(JSON.stringify(dados.pedidos, null, 2), { name: 'pedidos.json' });
    archive.append(JSON.stringify(dados.cores, null, 2), { name: 'cores.json' });
    archive.append(JSON.stringify(dados.fornecedores, null, 2), { name: 'fornecedores.json' });
    archive.append(JSON.stringify(dados.planoContas, null, 2), { name: 'planoContas.json' });
    archive.append(JSON.stringify(dados.contasFixas, null, 2), { name: 'contasFixas.json' });
    archive.append(JSON.stringify(dados.contasPagar, null, 2), { name: 'contasPagar.json' });
    archive.append(JSON.stringify(dados.contasReceber, null, 2), { name: 'contasReceber.json' });
    archive.append(JSON.stringify(dados.comissoes, null, 2), { name: 'comissoes.json' });
    archive.append(JSON.stringify(dados.cargas, null, 2), { name: 'cargas.json' });
    
    // Finalizar o ZIP
    await archive.finalize();
    
    return true;
  } catch (error) {
    console.error('Erro ao gerar backup:', error);
    throw error;
  }
}
