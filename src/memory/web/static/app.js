const tree = document.querySelector('#docs-tree');
const content = document.querySelector('#content');
const currentPath = document.querySelector('#current-path');
const mirrorName = document.querySelector('#mirror-name');
const activePerspective = document.querySelector('#active-perspective');
const chooser = document.querySelector('#chooser');
const warning = document.querySelector('#warning');
const docsPanel = document.querySelector('#docs-panel');
const contentGrid = document.querySelector('.content-grid');
const tabs = [...document.querySelectorAll('[data-view]')];
let currentDocPath = null;
let docsLoaded = false;
let activeView = 'atlas';

async function boot() {
  const shell = await fetchJson('/api/shell');
  mirrorName.textContent = shell.mirror?.name || 'Local Mirror';
  showWarning(shell.warning);

  if (!shell.defaultPerspective) {
    chooser.hidden = true;
    activeView = 'atlas';
    await showView('atlas', { updateHash: false });
  } else {
    chooser.hidden = true;
    activeView = shell.defaultPerspective;
    await showView(activeView, { updateHash: false });
  }
}

function showWarning(message) {
  warning.hidden = !message;
  warning.textContent = message || '';
}

async function chooseDefault(perspective) {
  const result = await fetchJson('/api/preferences/default-perspective', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ defaultPerspective: perspective }),
  });
  showWarning(result.warning);
  chooser.hidden = !!result.defaultPerspective;
  await showView(result.defaultPerspective || perspective);
}

async function showView(view, { updateHash = true } = {}) {
  activeView = view;
  const docsActive = view === 'docs';
  docsPanel.hidden = !docsActive;
  contentGrid.classList.toggle('docs-active', docsActive);
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.view === view));
  activePerspective.textContent = view === 'docs' ? 'Docs' : `Perspective · ${capitalize(view)}`;

  if (updateHash) {
    window.history.replaceState({ view }, '', `#${view}`);
  }

  if (view === 'docs') {
    await loadTree();
    return;
  }

  const surface = await fetchJson(`/api/surface/${view}`);
  currentPath.textContent = view === 'atlas' ? 'Atlas' : 'Workspace';
  content.innerHTML = view === 'atlas' ? renderAtlas(surface) : renderWorkspace(surface);
  window.scrollTo({ top: 0 });
}

function renderAtlas(surface) {
  const regions = (surface.regions || []).map(renderAtlasRegion).join('');
  return `
    <section class="surface-intro atlas-hero">
      <p class="eyebrow">Atlas</p>
      <h2>How your Mirror sees you today</h2>
      <p>${escapeHtml(surface.synthesis || 'Atlas is ready for Mirror visibility.')}</p>
    </section>
    <div class="atlas-map" aria-label="Atlas psyche map">${regions}</div>
  `;
}

function renderWorkspace(surface) {
  const sections = (surface.sections || []).map(renderWorkspaceSection).join('');
  return `
    <section class="surface-intro">
      <p class="eyebrow">Workspace</p>
      <h2>Operational dashboard</h2>
      <p>${escapeHtml(surface.status || 'Read-only operational overview')}</p>
    </section>
    <div class="section-stack">${sections}</div>
  `;
}

function renderAtlasRegion(region) {
  const role = region.metadata?.atlas_role || 'support';
  const readiness = region.metadata?.data_readiness || 'unknown';
  const cards = (region.cards || []).slice(0, 3).map(renderCard).join('');
  return `
    <section class="atlas-region atlas-${escapeHtml(role)} readiness-${escapeHtml(readiness)}">
      <div>
        <div class="region-heading">
          <p class="eyebrow">${escapeHtml(region.id)}</p>
          <span class="readiness-badge">${escapeHtml(readiness)}</span>
        </div>
        <h3>${escapeHtml(region.title)}</h3>
        <p>${escapeHtml(region.description)}</p>
      </div>
      ${cards ? `<div class="card-grid atlas-cards">${cards}</div>` : `<p class="empty-state">${escapeHtml(region.empty_state || 'Nothing to show yet.')}</p>`}
    </section>
  `;
}

function renderWorkspaceSection(section) {
  const cards = (section.cards || []).map(renderCard).join('');
  return `
    <section class="surface-group wide">
      <div>
        <p class="eyebrow">${escapeHtml(section.id)}</p>
        <h3>${escapeHtml(section.title)}</h3>
        ${section.description ? `<p>${escapeHtml(section.description)}</p>` : ''}
      </div>
      ${cards ? `<div class="card-grid compact">${cards}</div>` : `<p class="empty-state">${escapeHtml(section.empty_state || 'Nothing to show yet.')}</p>`}
    </section>
  `;
}

function renderCard(card) {
  const icon = card.metadata?.icon || card.title?.slice(0, 1) || '?';
  const iconKind = card.metadata?.icon_kind || 'glyph';
  const label = card.metadata?.display_label ?? card.title;
  const variants = (card.metadata?.variants || [])
    .map((variant) => `<span>${escapeHtml(variant.label || variant.key)}</span>`)
    .join('');
  const chips = (card.metadata?.chips || [])
    .map((chip) => `<span>${escapeHtml(chip)}</span>`)
    .join('');
  return `
    <article class="surface-card">
      <div class="card-head">
        <div class="card-icon ${escapeHtml(iconKind)}" aria-label="${escapeHtml(card.title)}">${escapeHtml(icon)}</div>
        <div>
          <div class="card-meta">${escapeHtml(card.kind)}${card.status ? ` · ${escapeHtml(card.status)}` : ''}</div>
          ${label ? `<h4>${escapeHtml(label)}</h4>` : ''}
        </div>
      </div>
      <p>${escapeHtml(card.description || '')}</p>
      ${variants ? `<div class="variant-list" aria-label="Available layers">${variants}</div>` : ''}
      ${chips ? `<div class="variant-list" aria-label="Concepts">${chips}</div>` : ''}
    </article>
  `;
}

async function loadTree() {
  if (docsLoaded) {
    if (!currentDocPath) await loadInitialDoc();
    return;
  }

  const nodes = await fetchJson('/api/docs/tree');
  tree.innerHTML = '';
  const list = document.createElement('ul');
  list.className = 'doc-tree';
  for (const node of nodes) {
    list.appendChild(renderNode(node, 0));
  }
  tree.appendChild(list);
  docsLoaded = true;
  await loadInitialDoc(nodes);
}

async function loadInitialDoc(nodes = null) {
  const loadedNodes = nodes || await fetchJson('/api/docs/tree');
  const docsHome = findNodeByPath(loadedNodes, 'docs/index.md');
  const firstFile = findFirstFile(loadedNodes);
  const initialDoc = docsHome || firstFile;
  if (initialDoc) await loadDoc(initialDoc.path, { replace: true });
}

function renderNode(node, depth = 0) {
  const item = document.createElement('li');
  item.className = `tree-node ${node.type}`;

  if (node.type === 'directory') {
    const details = document.createElement('details');
    details.open = depth === 0;
    const summary = document.createElement('summary');
    summary.textContent = node.title;
    if (node.path) {
      summary.title = node.path;
      summary.addEventListener('click', () => loadDoc(node.path));
    }
    details.appendChild(summary);

    const list = document.createElement('ul');
    for (const child of node.children || []) {
      list.appendChild(renderNode(child, depth + 1));
    }
    details.appendChild(list);
    item.appendChild(details);
    return item;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = node.title;
  button.title = node.path;
  button.addEventListener('click', () => loadDoc(node.path));
  item.appendChild(button);
  return item;
}

function findFirstFile(nodes) {
  for (const node of nodes) {
    if (node.type === 'file') return node;
    const found = findFirstFile(node.children || []);
    if (found) return found;
  }
  return null;
}

function findNodeByPath(nodes, path) {
  for (const node of nodes) {
    if (node.path === path) return node;
    const found = findNodeByPath(node.children || [], path);
    if (found) return found;
  }
  return null;
}

async function loadDoc(path, { replace = false } = {}) {
  if (currentDocPath === path && !replace) return;

  const response = await fetch(`/api/docs/file?path=${encodeURIComponent(path)}`);
  const doc = await response.json();

  if (!response.ok) {
    currentPath.textContent = path;
    content.innerHTML = `<pre>${escapeHtml(doc.error || 'Could not load document')}</pre>`;
    return;
  }

  currentDocPath = doc.path;
  currentPath.textContent = doc.path;
  content.innerHTML = doc.html;
  window.scrollTo({ top: 0 });
}

content.addEventListener('click', async (event) => {
  const link = event.target.closest('a');
  if (!link || activeView !== 'docs' || !currentDocPath) return;

  const href = link.getAttribute('href');
  if (!href || isExternalLink(href) || href.startsWith('#')) return;

  const resolved = resolveDocHref(currentDocPath, href);
  if (!resolved || !resolved.path.endsWith('.md')) return;

  event.preventDefault();
  await loadDoc(resolved.path);
  if (resolved.hash) {
    document.querySelector(resolved.hash)?.scrollIntoView();
  }
});

document.querySelectorAll('[data-choose]').forEach((button) => {
  button.addEventListener('click', () => chooseDefault(button.dataset.choose));
});

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    if (tab.dataset.view === 'docs') {
      showView('docs');
      return;
    }
    chooseDefault(tab.dataset.view);
  });
});

function isExternalLink(href) {
  return /^(https?:|mailto:|tel:)/.test(href);
}

function resolveDocHref(basePath, href) {
  const [rawPath, rawHash] = href.split('#');
  if (!rawPath) return null;

  const baseParts = basePath.split('/');
  baseParts.pop();
  const parts = rawPath.startsWith('/') ? [] : baseParts;

  for (const part of rawPath.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return {
    path: parts.join('/'),
    hash: rawHash ? `#${CSS.escape(rawHash)}` : null,
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Request failed: ${url}`);
  return payload;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

boot().catch((error) => {
  currentPath.textContent = 'Error';
  content.innerHTML = `<pre>${escapeHtml(String(error))}</pre>`;
});
