const MAX_BYTES = 2 * 1024 * 1024 - 1;
const TIMEOUT_MS = 15000;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const OMIT = 'script, style, nav, header, footer, aside, noscript, template, form, svg, canvas, iframe, [hidden], [aria-hidden="true"]';
const BLOCKS = new Set(['article', 'main', 'section', 'div', 'p', 'br', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'pre', 'tr']);
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

class IntakeError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function publicUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) throw new IntakeError(400, 'A valid public URL is required.');
  let url;
  try {
    url = new URL(value, base);
  } catch {
    throw new IntakeError(400, 'A valid public URL is required.');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      host.includes(':') || /^[\d.]+$/.test(host) ||
      !host.includes('.') || host.length > 253 ||
      !host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
      /(?:^|\.)(?:localhost|local|internal|intranet|lan|home|test|invalid|example|onion|arpa)$/.test(host)) {
    throw new IntakeError(400, 'Only public HTTP or HTTPS domain URLs are allowed.');
  }
  url.hostname = host;
  url.hash = '';
  return url;
}

function publicAddress(address) {
  if (address.includes(':')) {
    const groups = address.toLowerCase().split(':');
    const first = parseInt(groups[0], 16);
    const second = parseInt(groups[1] || '0', 16);
    return /^[0-9a-f:]+$/i.test(address) && first >= 0x2000 && first < 0x4000 &&
      first !== 0x2002 && first !== 0x3fff &&
      !(first === 0x2001 && (second < 0x0200 || second === 0x0db8));
  }
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

async function boundedBody(response, signal, limit = MAX_BYTES) {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new IntakeError(413, 'The source exceeds the download size limit.');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new IntakeError(413, 'The source exceeds the download size limit.');
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const charset = response.headers.get('content-type')?.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1] || 'utf-8';
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    throw new IntakeError(415, 'The source uses an unsupported character encoding.');
  }
}

async function checkDestination(url, signal) {
  const answers = await Promise.all(['A', 'AAAA'].map(async type => {
    const query = new URL('https://cloudflare-dns.com/dns-query');
    query.searchParams.set('name', url.hostname);
    query.searchParams.set('type', type);
    const response = await fetch(query, {
      headers: { Accept: 'application/dns-json' },
      redirect: 'manual', credentials: 'omit', signal,
    });
    if (!response.ok) throw new IntakeError(502, 'Destination address validation is unavailable.');
    let data;
    try {
      data = JSON.parse(await boundedBody(response, signal, 65536));
    } catch (error) {
      if (error instanceof IntakeError || signal.aborted) throw error;
      throw new IntakeError(502, 'Destination address validation is unavailable.');
    }
    if (data.Status !== 0 && data.Status !== 3) {
      throw new IntakeError(502, 'Destination address validation is unavailable.');
    }
    return (data.Answer || []).filter(answer => answer.type === 1 || answer.type === 28).map(answer => answer.data);
  }));
  const addresses = answers.flat();
  if (!addresses.length) throw new IntakeError(422, 'The destination has no public address.');
  if (addresses.some(address => !publicAddress(address))) {
    throw new IntakeError(400, 'The destination resolves to a restricted address.');
  }
}

async function download(initialUrl, signal) {
  let url = initialUrl;
  for (let redirects = 0; redirects <= 4; redirects++) {
    url = publicUrl(url.href);
    await checkDestination(url, signal);
    const response = await fetch(url, {
      method: 'GET', redirect: 'manual', credentials: 'omit', signal,
      headers: { Accept: 'text/html, application/rss+xml, application/atom+xml, application/feed+json, application/json, application/xml, text/xml;q=0.9' },
    });
    if (REDIRECT_CODES.has(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new IntakeError(502, 'The source returned a redirect without a destination.');
      if (redirects === 4) throw new IntakeError(422, 'The source exceeded four redirects.');
      url = publicUrl(location, url);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new IntakeError(502, `Source access was blocked or unavailable (HTTP ${response.status}).`);
    }
    if (response.headers.get('cf-mitigated') === 'challenge') {
      await response.body?.cancel();
      throw new IntakeError(422, `Source access requires a browser challenge (HTTP ${response.status}).`);
    }
    return { body: await boundedBody(response, signal), type: response.headers.get('content-type') || '', status: response.status, url };
  }
}

function cleanText(value, limit = MAX_BYTES) {
  return value.replace(/[\t\f\v \u00a0]+/g, ' ').replace(/ *\r?\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, limit);
}

function htmlEntities(value) {
  const entities = {
    nbsp: ' ', copy: '\u00a9', reg: '\u00ae', trade: '\u2122', hellip: '\u2026',
    ndash: '\u2013', mdash: '\u2014', lsquo: '\u2018', rsquo: '\u2019',
    ldquo: '\u201c', rdquo: '\u201d', bull: '\u2022', middot: '\u00b7',
    laquo: '\u00ab', raquo: '\u00bb', euro: '\u20ac', pound: '\u00a3',
    yen: '\u00a5', cent: '\u00a2', times: '\u00d7', divide: '\u00f7',
    minus: '\u2212', plusmn: '\u00b1', deg: '\u00b0', micro: '\u00b5',
    ensp: ' ', emsp: ' ', thinsp: ' ', shy: '', zwnj: '', zwj: '',
  };
  return xmlEntities(value.replace(/&([a-z]+);/gi, (match, name) => entities[name] ?? match));
}

async function htmlText(html, article = false) {
  const chunks = { title: [], article: [], main: [], body: [], all: [] };
  let suppressed = 0;
  const rewriter = new HTMLRewriter().on(OMIT, {
    element(element) {
      if (VOID_TAGS.has(element.tagName)) return;
      suppressed++;
      element.onEndTag(() => { suppressed--; });
    },
  }).on('*', {
    element(element) {
      if (!suppressed && BLOCKS.has(element.tagName)) {
        for (const buffer of Object.values(chunks)) buffer.push('\n');
        if (!VOID_TAGS.has(element.tagName)) {
          element.onEndTag(() => {
            for (const buffer of Object.values(chunks)) buffer.push('\n');
          });
        }
      }
    },
  });
  for (const tag of ['title', 'article', 'main', 'body']) {
    rewriter.on(tag, { text(chunk) { if (!suppressed) chunks[tag].push(chunk.text); } });
  }
  rewriter.onDocument({ text(chunk) { if (!suppressed) chunks.all.push(chunk.text); } });
  await rewriter.transform(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })).arrayBuffer();
  const title = cleanText(htmlEntities(chunks.title.join('')), 1000).replace(/\s+/g, ' ');
  const text = article
    ? cleanText(htmlEntities(chunks.article.join(''))) || cleanText(htmlEntities(chunks.main.join(''))) || cleanText(htmlEntities(chunks.body.join('')))
    : cleanText(htmlEntities(chunks.all.join('')));
  return { title, text };
}

function yearFrom(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getUTCFullYear();
}

function record(title, text, url, role, date = null) {
  return { title: cleanText(title, 1000), text, url: url.href, role, sourceGroup: url.origin, year: yearFrom(date) };
}

function xmlEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (entity[0] !== '#') return named[entity.toLowerCase()];
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
  });
}

function parseXml(source) {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new IntakeError(415, 'Feed document declarations are unsupported.');
  const root = { name: '', attrs: {}, children: [] };
  const stack = [root];
  let count = 0;
  const tokens = source.match(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/?[a-z_][\w:.-]*(?:"[^"]*"|'[^']*'|[^'">])*\/?\s*>|[^<]+/gi) || [];
  for (const token of tokens) {
    const parent = stack[stack.length - 1];
    if (token.startsWith('<!--') || token.startsWith('<?')) continue;
    if (token.startsWith('<![CDATA[')) {
      parent.children.push(token.slice(9, -3));
    } else if (token.startsWith('</')) {
      if (stack.length < 2 || parent.fullName !== token.slice(2, -1).trim()) {
        throw new IntakeError(422, 'The feed XML is malformed.');
      }
      stack.pop();
    } else if (token.startsWith('<')) {
      const fullName = token.match(/^<([^\s/>]+)/)[1];
      const attrs = {};
      for (const match of token.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        attrs[match[1].toLowerCase()] = xmlEntities(match[2] ?? match[3]);
      }
      const node = { fullName, name: fullName.toLowerCase().split(':').pop(), attrs, children: [], parent };
      parent.children.push(node);
      if (++count > 30000 || stack.length > 64) throw new IntakeError(413, 'The feed structure exceeds the extraction limit.');
      if (!/\/\s*>$/.test(token)) stack.push(node);
    } else {
      parent.children.push(xmlEntities(token));
    }
  }
  if (stack.length !== 1) throw new IntakeError(422, 'The feed XML is incomplete.');
  return root.children.find(child => typeof child !== 'string');
}

function children(node, name) {
  return node.children.filter(child => typeof child !== 'string' && child.name === name);
}

function xmlValue(node) {
  if (!node) return '';
  if (['script', 'style', 'nav', 'header', 'footer', 'aside', 'noscript', 'template'].includes(node.name) ||
      Object.hasOwn(node.attrs, 'hidden') || node.attrs['aria-hidden'] === 'true') return '';
  return node.children.map(child => typeof child === 'string' ? child : xmlValue(child)).join(' ');
}

function field(node, name) {
  return xmlValue(children(node, name)[0]).trim();
}

function entryBase(node, documentUrl) {
  const chain = [];
  for (let current = node; current; current = current.parent) chain.unshift(current);
  let base = documentUrl;
  for (const current of chain) {
    if (current.attrs['xml:base']) base = publicUrl(current.attrs['xml:base'], base);
  }
  return base;
}

async function xmlFeed(body, url) {
  const root = parseXml(body);
  if (!root || !['rss', 'feed', 'rdf'].includes(root.name)) throw new IntakeError(415, 'The document is not a supported feed.');
  const atom = root.name === 'feed';
  const channel = children(root, 'channel')[0] || root;
  const entries = root.name === 'rdf' ? children(root, 'item') : children(channel, atom ? 'entry' : 'item');
  const records = [];
  for (const entry of entries.slice(0, 15)) {
    const link = children(entry, 'link').find(node => !node.attrs.rel || node.attrs.rel === 'alternate');
    const candidate = atom ? link?.attrs.href : xmlValue(link).trim();
    if (!candidate) continue;
    const target = publicUrl(candidate, entryBase(link || entry, url));
    const content = field(entry, 'encoded') || field(entry, 'content') || field(entry, 'description') || field(entry, 'summary');
    const text = (await htmlText(content)).text;
    if (!text) continue;
    const title = (await htmlText(field(entry, 'title'))).text;
    const date = field(entry, 'published') || field(entry, 'pubdate') || field(entry, 'date') || field(entry, 'updated');
    records.push({ ...record(title, text, target, 'source', date), date: date || null });
  }
  if (!records.length) throw new IntakeError(422, 'The feed contains no entries with public URLs and readable content.');
  return { kind: 'feed', title: (await htmlText(field(channel, 'title'))).text, url: url.href, records };
}

async function jsonFeed(data, url) {
  if (typeof data.version !== 'string' || !/^https:\/\/jsonfeed\.org\/version\/(?:1|1\.1)$/.test(data.version) || !Array.isArray(data.items)) {
    throw new IntakeError(415, 'The JSON document is not a supported JSON Feed.');
  }
  let base = url;
  if (data.home_page_url) base = publicUrl(data.home_page_url, url);
  const records = [];
  for (const item of data.items.slice(0, 15)) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item.url || item.external_url;
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    const target = publicUrl(candidate, base);
    const text = typeof item.content_text === 'string' ? cleanText(item.content_text) :
      (await htmlText(typeof item.content_html === 'string' ? item.content_html : '')).text;
    if (!text) continue;
    const date = typeof item.date_published === 'string' ? item.date_published :
      typeof item.date_modified === 'string' ? item.date_modified : null;
    records.push({ ...record(typeof item.title === 'string' ? item.title : '', text, target, 'source', date), date: typeof date === 'string' ? date : null });
  }
  if (!records.length) throw new IntakeError(422, 'The feed contains no entries with public URLs and readable content.');
  return { kind: 'feed', title: typeof data.title === 'string' ? cleanText(data.title, 1000) : '', url: url.href, records };
}

function redditRequest(url) {
  if (!['reddit.com', 'www.reddit.com', 'old.reddit.com'].includes(url.hostname)) return null;
  if (!/^\/r\/[^/]+\/comments\/[a-z0-9]+(?:\/|$)/i.test(url.pathname) && !/^\/comments\/[a-z0-9]+(?:\/|$)/i.test(url.pathname)) {
    throw new IntakeError(400, 'A public discussion permalink is required.');
  }
  const target = new URL(url.href);
  target.hostname = 'www.reddit.com';
  target.pathname = target.pathname.replace(/\/(?:\.json)?$/, '').replace(/\.json$/, '') + '.json';
  target.search = '?raw_json=1&limit=12&depth=3';
  return target;
}

async function redditDiscussion(data, fetchedUrl) {
  const post = data?.[0]?.data?.children?.find(child => child.kind === 't3')?.data;
  if (!post || typeof post.title !== 'string' || typeof post.permalink !== 'string') {
    throw new IntakeError(422, 'The discussion JSON contains no readable public post.');
  }
  const postUrl = publicUrl(post.permalink, fetchedUrl);
  const postText = typeof post.selftext === 'string' && !['[removed]', '[deleted]'].includes(post.selftext.trim()) ? cleanText(post.selftext) : '';
  const date = typeof post.created_utc === 'number' ? new Date(post.created_utc * 1000).toISOString() : null;
  const records = [{ ...record(post.title, postText || cleanText(post.title), postUrl, 'independent', date), author: typeof post.author === 'string' ? post.author : '', permalink: postUrl.href, date }];
  let comments = 0;
  async function visit(nodes, depth = 0) {
    if (!Array.isArray(nodes) || depth > 8) return;
    for (const node of nodes) {
      if (comments >= 12) break;
      if (node.kind !== 't1' || !node.data) continue;
      const comment = node.data;
      if (typeof comment.body === 'string' && comment.body.trim() && !['[removed]', '[deleted]'].includes(comment.body.trim()) && typeof comment.permalink === 'string') {
        const target = publicUrl(comment.permalink, postUrl);
        const date = typeof comment.created_utc === 'number' ? new Date(comment.created_utc * 1000).toISOString() : null;
        records.push({ ...record(post.title, cleanText(comment.body), target, 'independent', date), author: typeof comment.author === 'string' ? comment.author : '', permalink: target.href, date });
        comments++;
      }
      await visit(comment.replies?.data?.children, depth + 1);
    }
  }
  await visit(data?.[1]?.data?.children);
  return { kind: 'reddit', title: cleanText(post.title, 1000), url: postUrl.href, records };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function onRequestGet(context) {
  const { request } = context;
  const requestUrl = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin !== null && origin !== requestUrl.origin) {
    return jsonResponse({ error: 'Requests must originate from this site.' }, 403);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const input = requestUrl.searchParams.get('url');
    if (!input || input.length > 8192) throw new IntakeError(400, 'A public URL of at most 8192 characters is required.');
    const url = publicUrl(input);
    const cacheUrl = new URL(requestUrl.origin + requestUrl.pathname);
    cacheUrl.searchParams.set('url', url.href);
    const cacheKey = new Request(cacheUrl.href);
    const cache = globalThis.caches?.default;
    const cached = await cache?.match(cacheKey);
    if (cached) return cached;
    const discussionUrl = redditRequest(url);
    const source = await download(discussionUrl || url, controller.signal);
    const body = source.body.trim();
    let result;
    if (discussionUrl || /json/i.test(source.type) || /^[\[{]/.test(body)) {
      let data;
      try { data = JSON.parse(body); } catch { throw new IntakeError(422, 'The source returned invalid JSON.'); }
      result = discussionUrl ? await redditDiscussion(data, source.url) : await jsonFeed(data, source.url);
    } else if (/(?:rss|atom|xml)/i.test(source.type.replace(/application\/xhtml\+xml/gi, '')) || /^(?:<\?xml[^>]*>\s*)?<(?:rss|feed|rdf:RDF)\b/i.test(body)) {
      result = await xmlFeed(body, source.url);
    } else if (/text\/html|application\/xhtml\+xml/i.test(source.type) || /^<!doctype html|^<html\b/i.test(body)) {
      const article = await htmlText(body, true);
      if (article.text.length < 4000 &&
          (/^(?:just a moment[.!\u2026]*|access denied|attention required!?|robot check|security check)$/i.test(article.title) ||
           /enable javascript and cookies to continue|verify (?:that )?you are human/i.test(article.text))) {
        throw new IntakeError(422, `Source access requires browser verification (HTTP ${source.status}).`);
      }
      if (!article.text) throw new IntakeError(422, 'The page contains no readable article text. It may require scripts or block public access.');
      result = { kind: 'article', title: article.title, url: source.url.href, records: [record(article.title, article.text, source.url, 'source')] };
    } else {
      throw new IntakeError(415, 'The source is not a supported public article, feed, or discussion.');
    }
    const destinations = new Map();
    for (const item of result.records) {
      const target = publicUrl(item.url);
      if (target.hostname !== source.url.hostname) destinations.set(target.hostname, target);
    }
    await Promise.all([...destinations.values()].map(target => checkDestination(target, controller.signal)));
    controller.signal.throwIfAborted();
    const response = jsonResponse(result);
    if (cache && context.waitUntil) context.waitUntil(cache.put(cacheKey, response.clone()).catch(() => {}));
    return response;
  } catch (error) {
    if (controller.signal.aborted) return jsonResponse({ error: 'Source retrieval timed out after 15 seconds.' }, 504);
    if (error instanceof IntakeError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: 'The public source could not be retrieved or extracted.' }, 502);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
