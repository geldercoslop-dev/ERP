/**
 * Script para instalar dependências do Leo Operator Total
 *
 * Instala as bibliotecas necessárias para as fases de automação:
 * - robotjs (controle de mouse e teclado)
 * - screenshot-desktop (captura de tela)
 * - tesseract.js (OCR)
 */
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
const dependencies = [
    {
        name: 'screenshot-desktop',
        description: 'Captura de tela',
        phase: 'FASE 5 - Captura de tela'
    },
    {
        name: 'tesseract.js',
        description: 'OCR para leitura de tela',
        phase: 'FASE 6 - OCR para leitura de tela'
    }
];
/**
 * Instala uma dependência específica
 */
async function installDependency(dep) {
    try {
        console.log(`\n📦 Instalando ${dep.name}...`);
        console.log(`   ${dep.description}`);
        console.log(`   ${dep.phase}`);
        const versionSpecifier = dep.version ? `@${dep.version}` : '';
        const command = `npm install ${dep.name}${versionSpecifier}`;
        console.log(`   Comando: ${command}`);
        const { stdout, stderr } = await execAsync(command);
        if (stderr && !stderr.includes('warn')) {
            console.warn(`   ⚠️  Warnings: ${stderr}`);
        }
        console.log(`   ✅ ${dep.name} instalado com sucesso!`);
        return true;
    }
    catch (error) {
        console.error(`   ❌ Erro ao instalar ${dep.name}:`);
        console.error(`      ${error instanceof Error ? error.message : error}`);
        return false;
    }
}
/**
 * Verifica se uma dependência já está instalada
 */
async function checkDependency(dep) {
    try {
        const { stdout } = await execAsync(`npm list ${dep.name} --depth=0`);
        return stdout.includes(dep.name);
    }
    catch {
        return false;
    }
}
/**
 * Função principal
 */
async function main() {
    console.log('🤖 LEO - Instalação de Dependências para Operador Total');
    console.log('='.repeat(60));
    console.log('\n📋 Verificando dependências necessárias...');
    const results = [];
    for (const dep of dependencies) {
        console.log(`\n🔍 Verificando ${dep.name}...`);
        const alreadyExists = await checkDependency(dep);
        if (alreadyExists) {
            console.log(`   ✅ ${dep.name} já está instalado`);
            results.push({ dependency: dep.name, installed: true, alreadyExisted: true });
        }
        else {
            const installed = await installDependency(dep);
            results.push({ dependency: dep.name, installed, alreadyExisted: false });
        }
    }
    // Resumo
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DA INSTALAÇÃO');
    console.log('='.repeat(60));
    let successCount = 0;
    let alreadyCount = 0;
    for (const result of results) {
        const dep = dependencies.find(d => d.name === result.dependency);
        const status = result.installed ? '✅' : '❌';
        const note = result.alreadyExisted ? ' (já existia)' : '';
        console.log(`${status} ${result.dependency}${note}`);
        console.log(`   ${dep?.description}`);
        if (result.installed) {
            successCount++;
            if (result.alreadyExisted)
                alreadyCount++;
        }
    }
    console.log('\n📈 ESTATÍSTICAS:');
    console.log(`   Total de dependências: ${dependencies.length}`);
    console.log(`   Instaladas com sucesso: ${successCount}`);
    console.log(`   Já existiam: ${alreadyCount}`);
    console.log(`   Novas instalações: ${successCount - alreadyCount}`);
    console.log(`   Falhas: ${dependencies.length - successCount}`);
    if (successCount === dependencies.length) {
        console.log('\n🎉 Todas as dependências estão prontas!');
        console.log('\n🚀 Próximos passos:');
        console.log('   1. Reinicie o servidor de desenvolvimento');
        console.log('   2. As próximas fases do Leo já podem ser implementadas');
        console.log('   3. Execute: npm run dev');
    }
    else {
        console.log('\n⚠️  Algumas dependências falharam na instalação.');
        console.log('   Verifique os erros acima e tente manualmente se necessário.');
    }
    console.log('\n🔧 Dependências para fases futuras:');
    console.log('   FASE 4: robotjs - Controle de mouse e teclado');
    console.log('   FASE 5: screenshot-desktop - Captura de tela');
    console.log('   FASE 6: tesseract.js - OCR para leitura de tela');
}
// Executar script
if (require.main === module) {
    main().catch(console.error);
}
export { installDependency, checkDependency, dependencies };
