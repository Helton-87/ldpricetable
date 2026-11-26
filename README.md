# Tabela de preços

Catálogo mobile-first em português, com busca e itens agrupados por categoria. A administração fica em `/admin`. A consulta do catálogo fica aberta a quem puder acessar o endereço do servidor.

## GitHub Pages

- Consulta: https://helton-87.github.io/ldpricetable/
- Preparar atualização: https://helton-87.github.io/ldpricetable/admin/

Abra a página de atualização, selecione o Excel e valide. Baixe `catalog.json` e use o botão **Abrir o GitHub** para enviar esse arquivo ao repositório. Confira o nome do arquivo e clique em **Commit changes** com a conta que tem permissão de escrita. O GitHub Pages atualizará a consulta após a publicação. Apenas o catálogo convertido é público. O Excel original fica no seu dispositivo.

O GitHub Pages publica os arquivos da raiz do repositório. Para regenerar a interface, execute `npm ci` e `node pages/build.js`. O gerador preserva `catalog.json`.

## Executar localmente

Requisitos: Node.js 24+ e npm.

1. Execute `npm ci`.
2. Crie um arquivo local `.env` com `ADMIN_PASSWORD` definido como uma senha única de 16 a 512 caracteres.
3. Inicie com `node --env-file=.env server.js`.
4. Abra `http://localhost:3000` para consultar e `http://localhost:3000/admin` para importar.

## Planilha

Salve como `.xlsx` com até 10 MB. Na primeira aba, use estes cabeçalhos na primeira linha:

| Categoria | Descrição | Preço | PIX - 2% | 3% (3+ UN.) |
| --- | --- | --- | --- | --- |
| Bebidas | Suco | 10,00 | 9,80 | 9,70 |
| Lanches | Sanduíche | 14,00 | | |

O cabeçalho Item também é aceito no lugar de Descrição. As duas colunas de desconto são opcionais e aparecem no catálogo apenas quando a célula contém um preço. Os valores vêm da planilha.

Preços são em reais, com até duas casas decimais. O importador aceita células numéricas, texto no formato brasileiro e fórmulas com resultado numérico salvo pelo Excel. Use até 10.000 itens. Entre como administrador, selecione o arquivo, valide os dados e confira a prévia. **Publicar catálogo** substitui a versão atual. A planilha é lida localmente e apenas os dados do catálogo são enviados e gravados.

## Hospedagem

Use um servidor Node com HTTPS, na raiz de um domínio, e um volume persistente para o SQLite. Configure `ADMIN_PASSWORD` como segredo, `NODE_ENV=production` para ativar cookies seguros, `DATABASE_PATH` para apontar para o volume, e `HOST=0.0.0.0` caso o provedor precise acessar o processo pela rede. A porta padrão é 3000 e pode ser alterada com `PORT`. Execute uma instância da aplicação e faça backup do banco. A sessão administrativa termina após oito horas ou ao reiniciar o processo.

A primeira visita exibe o convite de instalação. Navegadores compatíveis oferecem o botão nativo mediante toque. No Safari do iPhone e iPad, siga as instruções para adicionar à Tela de Início. A cópia mais recente carregada fica disponível offline e é marcada como tal. A administração requer conexão. O service worker funciona em HTTPS e em localhost.
