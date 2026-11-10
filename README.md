# Cevaí

PWA de pubs e benefícios em Porto Alegre, com identidade boêmia aprovada por Braian L. Saldanha.

## Versão inicial

- Descoberta por bairro, busca, categorias, favoritos e mapa Leaflet/OpenStreetMap.
- Perfil do pub, regras da oferta, QR Code real e código curto.
- Cupom com prazo máximo de 15 minutos, limitado ao encerramento da oferta.
- Área `/pub` (alias `/caixa`) com validação, criação/pausa de ofertas e contagem de resgates.
- PWA instalável, ícones, manifesto e página offline. Operações de cupom exigem conexão.
- Sem pagamentos, ranking ou gamificação.

## Demonstração e backend

Sem `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`, a aplicação funciona explicitamente em modo de demonstração. Os três pubs são fictícios. Testes ficam somente no navegador, sincronizados entre abas da mesma origem. Dados locais não são um backend de produção e não sincronizam entre dispositivos.

A conexão Supabase está implementada, mas não foi ativada: em 10/11/2026 a criação do projeto foi bloqueada pelo limite de dois projetos gratuitos ativos na conta. Nenhum projeto existente foi pausado, alterado ou reutilizado.

Para conectar o projeto dedicado após liberação do espaço:

1. Revisar e aplicar `supabase/schema.sql` como a primeira migração do projeto. A conexão atual usa autenticação Supabase por e-mail/senha; configurar confirmação de e-mail e URLs do ambiente no Auth.
2. Configurar as duas variáveis de runtime do `.env.example` na hospedagem. Usar apenas chave publishable; nunca enviar service-role ao navegador.
3. Publicar uma nova versão. Com as variáveis presentes, não há fallback silencioso para dados fictícios se ocorrer erro de rede ou permissão.
4. Testar cadastro, confirmação de e-mail, RLS com duas contas, cadastro de pub e um resgate em dois dispositivos. Executar advisors do Supabase antes de liberar operação real.
5. O usuário que cadastra um pub recebe papel de proprietário no banco. Outros operadores precisam ser adicionados à tabela de equipe por uma operação administrativa autorizada. A interface não promove clientes a operadores.

O esquema inclui RLS, funções públicas invoker, funções privilegiadas em schema privado com checagem de identidade, códigos limitados ao pub, bloqueio transacional da oferta, proteção contra uso repetido e limite de tentativas de validação. A publicação Realtime é configurada apenas para ofertas e resgates. A tela do cupom também consulta o estado como fallback.

Cupons previamente ativados continuam válidos quando a oferta é pausada. O benefício é aplicado manualmente pela equipe na comanda. Um resgate não é apresentado como comprovação de venda incremental.

## Desenvolvimento

Node 24. Instalar dependências conforme o fluxo Sites. Comandos:

```sh
npm run dev
npm run build
npm test
npx tsc --noEmit
```

O arquivo `.openai/hosting.json` preserva a identidade da hospedagem. A publicação inicial é privada. Não contém banco D1; o backend previsto é Supabase.

## Assets

Fotos ilustrativas geradas para os pubs fictícios. O símbolo do brinde deriva do logo aprovado. Imagens otimizadas e ícones 192/512 estão em `public/assets`; referência visual aprovada em `design/brand-approved.png`.

## Limites da verificação

Foram aprovados 12 testes das regras locais e um teste integrado do esquema SQL em PostgreSQL embarcado (PGlite), cobrindo RLS, papéis, RPCs, capacidade, cancelamento, expiração e uso único. O fluxo entre cliente e caixa também foi verificado em duas abas. Autenticação Supabase, RLS e Realtime hospedados ainda exigem o projeto real. Leitura por câmera depende de suporte a BarcodeDetector; digitação e leitor QR USB são alternativas. Permissões de GPS e câmera dependem do usuário e do dispositivo.
