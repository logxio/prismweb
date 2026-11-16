# Touchstone

Run a static evidence studio with public dossiers and native browser queries.

Use Node 24 and pnpm 10. From this folder run `pnpm install` and `pnpm build`. Vite writes the production site to `dist/` with `base: './'`. Run `pnpm preview` to serve the production build locally. The generated files support another deployment subpath. Topic queries run directly in the browser without credentials or model downloads. Public URL extraction uses the optional Cloudflare Pages function in `functions/api/prismweb/intake.js`.

The single header contains search, four dossiers and Reader Brief or Investigator OSINT mode. Investigator mode adds three vertical provenance columns, a time window, relevance feedback, source removal and signed JSON-LD or HTML export. Full funder names expand beneath the graph. Drop JSON or CSV to import public evidence. CSV fields are title, text, url, role, sourceGroup and year. Source roles are self, primary and independent. Funding and live stance stay unknown until supported by source review.

Paste / Audit Paragraph opens a sentence-level Who / What / When / Scope plan. Two source-based composites load the matching dossier. Exact curated statements and snippets have traceable source states; lexical candidate retrieval alone remains UNVERIFIED. Each sentence requires an explicit human editorial disposition before signing an audited paragraph. ECDSA P-256 signs snippet SHA-256, nutrition and review records. Verify Cryptographic Manifest checks the complete package in Web Crypto. Its public JWK proves integrity under an ephemeral session key and makes no identity attestation. Exports without a paragraph explicitly record editorial review as pending.

Four WebMCP tools expose audit, nutrition, relevance feedback and signature verification with JSON Schemas. The page uses native document.modelContext when available, otherwise labels its compatibility registry and exposes a navigator.modelContext bridge. The declarative search form carries toolname. Investigator mode includes an executable agent contract with structured results and measured timings. Tools never set human editorial dispositions.

Wikipedia and Wikidata immediately render their returned evidence. OpenAlex and Europe PMC asynchronously merge academic records and funding without clearing earlier source IDs. Per-provider status and first-render timing remain visible. Each provider has a bounded request and one visible retry. Citations, revision comments, entity properties and full-text links remain available inside source details.


Live studio: https://yansu.me/prismweb/

Video: https://yansu.me/prismweb/video.mp4
