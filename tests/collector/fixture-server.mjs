import { createServer } from 'node:http';

const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Collector Integration</title>
  </head>
  <body><main>collector fixture</main></body>
</html>`;

const server = createServer((_request, response) => {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(html);
});

server.listen(4173, '127.0.0.1', () => {
  console.log('collector fixture ready on 127.0.0.1:4173');
});
