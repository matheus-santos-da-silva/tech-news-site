# tech-news-site

Site estático (Astro) que publica os resumos diários de tecnologia do repositório de conteúdo
`tech-news` (privado) no GitHub Pages.

## Como funciona

1. Às 08:00 (Brasília) uma routine do Claude Code escreve `digests/AAAA-MM-DD.json` no repo de conteúdo.
2. Às 08:45 (e de novo às 10:00) o workflow deste repo:
   - baixa só a pasta `digests/` do repo de conteúdo com uma deploy key **somente leitura**;
   - valida todos os digests (`scripts/validate-digest.mjs`). Se algum falhar, nada é publicado;
   - busca as imagens de capa (`og:image`) das fontes, com cache entre execuções;
   - gera o site e publica no GitHub Pages.

O agente que escreve o conteúdo não tem acesso a este repositório. Validação, renderização e
publicação ficam fora do alcance dele.

## Segurança

- O conteúdo é sempre renderizado como texto (`RichText.astro` aceita só `código` e **negrito**). Nunca use `set:html`.
- CSP sem scripts ou estilos inline (`src/layouts/Base.astro`). Não use `style=""` nem `<script>` inline.
- Links externos com `rel="noopener noreferrer nofollow"`.
- `scripts/fetch-images.mjs` aceita só https e bloqueia IPs literais e hosts de rede privada.
- Actions fixadas por SHA; Dependabot atualiza npm e actions.

## Desenvolvimento

```sh
npm install
npm run dev      # lê os digests de ../tech-news (ou de CONTENT_DIR)
npm run images   # opcional: busca as capas para .cache/images.json
npm run build
```

`scripts/validate-digest.mjs` é idêntico ao do repo de conteúdo. Mudou o formato? Atualize os dois.

## Páginas

- `/`: resumo mais recente
- `/AAAA-MM-DD/`: resumo de um dia
- `/arquivo/`: todos os dias
- `/rss.xml`, `/api/index.json`, `/api/digests/AAAA-MM-DD.json`
