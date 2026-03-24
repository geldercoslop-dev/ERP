# Teste de ConexÃ£o ERP

Use este arquivo para testar se as correÃ§Ãµes funcionaram:

## Como usar:

1. Abra o arquivo `test-connection.html` no navegador
2. Acesse `http://localhost:3000/test-connection.html` 
3. Verifique os resultados dos testes

## O que Ã© testado:

1. **ConexÃ£o com backend** - Verifica se `/api/trpc/auth.me` responde
2. **Proxy do Vite** - Verifica se o proxy estÃ¡ redirecionando corretamente
3. **Carregamento de pÃ¡ginas** - Verifica se a pÃ¡gina de login estÃ¡ acessÃ­vel

## Resultados esperados:

âœ… Backend respondendo corretamente  
âœ… Proxy do Vite funcionando  
âœ… PÃ¡gina de login acessÃ­vel  

## Se houver erros:

- **Backend nÃ£o responde**: Verifique se o servidor estÃ¡ rodando na porta 3000
- **Proxy nÃ£o funciona**: Verifique a configuraÃ§Ã£o do vite.config.ts
- **PÃ¡gina nÃ£o carrega**: Verifique as rotas no frontend

## Atalhos:

- **Ctrl+R**: Executar testes novamente
