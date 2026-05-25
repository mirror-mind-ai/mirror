let tree = document.querySelector('#docs-tree');
const content = document.querySelector('#content');
const currentPath = document.querySelector('#current-path');
const mirrorName = document.querySelector('#mirror-name');
const chooser = document.querySelector('#chooser');
const warning = document.querySelector('#warning');
const docsPanel = document.querySelector('#docs-panel');
const contentGrid = document.querySelector('.content-grid');
const tabs = [...document.querySelectorAll('[data-view]')];
let currentDocPath = null;
let docsLoaded = false;
let activeView = 'workspace';
let selectedWorkspaceJourney = null;

async function boot() {
  const shell = await fetchJson('/api/shell');
  mirrorName.textContent = shell.mirror?.name || 'Local Mirror';
  showWarning(shell.warning);

  if (!shell.defaultPerspective) {
    chooser.hidden = true;
    activeView = 'workspace';
    await showView('workspace', { updateHash: false });
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
  if (docsPanel) docsPanel.hidden = !docsActive;
  currentPath.hidden = true;
  contentGrid.classList.toggle('docs-active', docsActive);
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.view === view));
  if (updateHash) {
    window.history.replaceState({ view }, '', `#${view}`);
  }

  if (view === 'docs') {
    await renderDocsFrame();
    return;
  }

  const url = view === 'workspace' && selectedWorkspaceJourney
    ? `/api/surface/workspace?journey=${encodeURIComponent(selectedWorkspaceJourney)}`
    : `/api/surface/${view}`;
  const surface = await fetchJson(url);
  if (view === 'workspace') selectedWorkspaceJourney = surface.selected_journey_id || null;
  currentPath.textContent = view === 'atlas' ? 'Identity' : 'Workspace';
  content.innerHTML = view === 'atlas' ? renderAtlas(surface) : renderWorkspace(surface);
  window.scrollTo({ top: 0 });
}

function renderAtlas(surface) {
  const regions = (surface.regions || []).map(renderAtlasRegion).join('');
  return `
    <section class="surface-intro surface-line atlas-hero">
      <p><strong>How your Mirror reflects you today:</strong> ${escapeHtml(surface.synthesis || 'Identity map is ready for Mirror visibility.')}</p>
    </section>
    <div class="atlas-map" aria-label="Identity map">${regions}</div>
  `;
}

function renderWorkspace(surface) {
  const metrics = (surface.metrics || [])
    .filter((metric) => metric.id !== 'active-journeys')
    .map(renderWorkspaceMetric)
    .join('');
  const sections = (surface.sections || []).map(renderWorkspaceTabPanel).join('');
  const tabs = (surface.sections || []).map(renderWorkspaceTab).join('');
  const selected = surface.selected_journey;
  return `
    <section class="surface-intro surface-line workspace-hero">
      <p><strong>How Mirror can help you today:</strong> ${escapeHtml(surface.status || 'Where you find your journeys, conversations, memories and decisions.')}</p>
    </section>
    <div class="workspace-shell">
      <aside class="journey-sidebar">
        <p class="eyebrow">Journeys (${escapeHtml((surface.journeys || []).length)})</p>
        ${renderJourneyMenu(surface.journeys || [], surface.selected_journey_id)}
      </aside>
      <section class="journey-workspace">
        ${renderJourneyProfile(selected, metrics)}
        <div class="workspace-tabs" role="tablist" aria-label="Journey workspace tabs">${tabs}</div>
        <div class="workspace-tab-panels">${sections}</div>
      </section>
    </div>
  `;
}

function renderJourneyMenu(journeys, selectedId) {
  if (!journeys.length) return `<p class="empty-state">No active journeys are available yet.</p>`;
  return `
    <div class="journey-menu">
      ${journeys.map((journey) => `
        <button type="button" class="journey-menu-item ${journey.id === selectedId ? 'active' : ''}" title="${escapeHtml(journey.title)}" data-workspace-journey="${escapeHtml(journey.id)}">
          <span>${escapeHtml(journey.metadata?.icon || '⌁')}</span>
          <strong>${escapeHtml(journey.title)}</strong>
          ${journey.status ? `<small>${escapeHtml(journey.status)}</small>` : ''}
        </button>
      `).join('')}
    </div>
  `;
}

function renderJourneyProfile(journey, metrics) {
  if (!journey) {
    return `<section class="journey-profile empty-state">No active journey is selected.</section>`;
  }
  return `
    <section class="journey-profile">
      <div class="journey-profile-banner" aria-hidden="true"></div>
      <div class="journey-profile-body">
        <div class="journey-profile-icon">${escapeHtml(journey.metadata?.icon || '⌁')}</div>
        <div>
          <p class="concept-kicker">Journey</p>
          <h3>${escapeHtml(journey.title)}</h3>
          <p>${escapeHtml(journey.description || 'No journey briefing is available yet.')}</p>
        </div>
        ${journey.status ? `<span class="readiness-badge">${escapeHtml(journey.status)}</span>` : ''}
      </div>
      ${metrics ? `<div class="workspace-metrics compact" aria-label="Selected journey metrics">${metrics}</div>` : ''}
    </section>
  `;
}

function renderWorkspaceTab(section, index) {
  return `
    <button type="button" class="workspace-tab ${index === 0 ? 'active' : ''}" data-workspace-tab="${escapeHtml(section.id)}">
      ${escapeHtml(section.title)}
    </button>
  `;
}

function renderWorkspaceTabPanel(section, index) {
  const cards = (section.cards || []).map(renderWorkspaceCard).join('');
  const content = section.metadata?.content ? renderDetailContent(section.metadata.content) : '';
  const itemCount = content ? '' : `<span class="readiness-badge">${escapeHtml((section.cards || []).length)} items</span>`;
  return `
    <section class="workspace-tab-panel ${index === 0 ? 'active' : ''}" data-workspace-panel="${escapeHtml(section.id)}">
      <div class="workspace-section-head">
        <div>
          <p class="eyebrow">${escapeHtml(section.id)}</p>
          <h3>${escapeHtml(section.title)}</h3>
          ${section.description ? `<p>${escapeHtml(section.description)}</p>` : ''}
        </div>
        ${itemCount}
      </div>
      ${content ? `<div class="rendered-content workspace-briefing">${content}</div>` : cards ? `<div class="workspace-list">${cards}</div>` : `<p class="empty-state">${escapeHtml(section.empty_state || 'Nothing to show yet.')}</p>`}
    </section>
  `;
}

function renderWorkspaceMetric(metric) {
  return `
    <article class="workspace-metric ${metric.status ? `metric-${escapeHtml(metric.status)}` : ''}">
      <strong>${escapeHtml(metric.value ?? 0)}</strong>
      <span>${escapeHtml(metric.label)}</span>
      ${metric.description ? `<small>${escapeHtml(metric.description)}</small>` : ''}
    </article>
  `;
}

function renderAtlasRegion(region) {
  const role = region.metadata?.atlas_role || 'support';
  if (['self', 'ego', 'shadow'].includes(role)) {
    return renderConceptRegion(region, role);
  }
  if (role === 'personas') {
    return renderPersonaRegion(region);
  }

  const readiness = region.metadata?.data_readiness || 'unknown';
  const cards = (region.cards || [])
    .slice(0, 8)
    .map((card) => (card.kind === 'memory-category' ? renderMemoryCategory(card) : renderCard(card)))
    .join('');
  return `
    <section class="atlas-region atlas-${escapeHtml(role)} readiness-${escapeHtml(readiness)}">
      <div>
        <h3>${escapeHtml(region.title)}</h3>
        <p>${escapeHtml(region.description)}</p>
      </div>
      ${cards ? `<div class="card-grid atlas-cards">${cards}</div>` : `<p class="empty-state">${escapeHtml(region.empty_state || 'Nothing to show yet.')}</p>`}
    </section>
  `;
}

function renderPersonaRegion(region) {
  const people = (region.cards || []).map(renderPersonaToken).join('');
  const chips = (region.metadata?.chips || [])
    .map((chip) => `<span>${escapeHtml(chip)}</span>`)
    .join('');
  return `
    <section class="atlas-region atlas-personas persona-team">
      <div class="team-copy concept-side">
        <div class="concept-icon" aria-label="${escapeHtml(region.title)}">${escapeHtml(region.metadata?.icon || '✣')}</div>
        <p class="concept-kicker">${escapeHtml(region.title)}</p>
        <h3>${escapeHtml(region.metadata?.motif || 'Team')}</h3>
        <p>${escapeHtml(region.description)}</p>
        ${chips ? `<div class="variant-list concept-chips" aria-label="Concepts">${chips}</div>` : ''}
      </div>
      ${people ? `<div class="persona-orbit" aria-label="Persona team">${people}</div>` : `<p class="empty-state">${escapeHtml(region.empty_state || 'No personas are available yet.')}</p>`}
    </section>
  `;
}

function renderPersonaToken(card) {
  const initials = card.metadata?.icon || card.title.slice(0, 2).toUpperCase();
  const label = card.metadata?.display_label || card.title;
  return `
    <button type="button" class="persona-token" title="${escapeHtml(card.title)}" data-object-kind="${escapeHtml(card.kind)}" data-object-id="${escapeHtml(card.id)}">
      <span class="persona-avatar">${escapeHtml(initials)}</span>
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function renderConceptRegion(region, role) {
  const card = (region.cards || [])[0];
  const icon = card?.metadata?.icon || conceptFallbackIcon(role);
  const title = card?.title || region.title;
  const description = card?.description || region.description;
  const chips = (card?.metadata?.chips || [])
    .map((chip) => `<span>${escapeHtml(chip)}</span>`)
    .join('');
  const variants = (card?.metadata?.variants || [])
    .map((variant) => `<span>${escapeHtml(variant.label || variant.key)}</span>`)
    .join('');
  const target = objectTargetFromHref(card?.href) || (card ? { kind: card.kind, id: card.id } : null);
  const targetAttrs = target ? ` role="button" tabindex="0" data-object-kind="${escapeHtml(target.kind)}" data-object-id="${escapeHtml(target.id)}"` : '';
  return `
    <section class="atlas-region atlas-concept atlas-${escapeHtml(role)}"${targetAttrs}>
      <div class="concept-icon" aria-label="${escapeHtml(region.title)}">${escapeHtml(icon)}</div>
      <p class="concept-kicker">${escapeHtml(region.title)}</p>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
      ${chips ? `<div class="variant-list concept-chips" aria-label="Concepts">${chips}</div>` : ''}
      ${variants ? `<div class="variant-list concept-chips" aria-label="Available layers">${variants}</div>` : ''}
      ${!card && region.empty_state ? `<p class="empty-state">${escapeHtml(region.empty_state)}</p>` : ''}
    </section>
  `;
}

function conceptFallbackIcon(role) {
  if (role === 'self') return '♛';
  if (role === 'ego') return '◉';
  if (role === 'shadow') return '◐';
  return '◇';
}

function renderWorkspaceCard(card) {
  const icon = card.metadata?.icon || '◇';
  const metaParts = [card.kind, card.status, card.accent].filter(Boolean);
  const detail = workspaceCardDetail(card);
  return `
    <article class="workspace-card">
      <div class="workspace-card-icon" aria-hidden="true">${escapeHtml(icon)}</div>
      <div>
        <div class="card-meta">${escapeHtml(metaParts.join(' · '))}</div>
        <h4>${escapeHtml(card.title)}</h4>
        <p>${escapeHtml(card.description || '')}</p>
        ${detail ? `<div class="workspace-card-detail">${detail}</div>` : ''}
      </div>
    </article>
  `;
}

function workspaceCardDetail(card) {
  const metadata = card.metadata || {};
  const values = [];
  if (metadata.journey) values.push(`Journey: ${metadata.journey}`);
  if (metadata.persona) values.push(`Persona: ${metadata.persona}`);
  if (metadata.message_count !== undefined) values.push(`${metadata.message_count} messages`);
  if (metadata.memory_type) values.push(`Type: ${metadata.memory_type}`);
  if (metadata.stage) values.push(`Stage: ${metadata.stage}`);
  if (metadata.due_date) values.push(`Due: ${metadata.due_date}`);
  if (metadata.data_readiness) values.push(`Readiness: ${metadata.data_readiness}`);
  return values.map((value) => `<span>${escapeHtml(value)}</span>`).join('');
}

async function loadObject(kind, id) {
  activeView = 'object';
  if (docsPanel) docsPanel.hidden = true;
  currentPath.hidden = true;
  contentGrid.classList.remove('docs-active');
  tabs.forEach((tab) => tab.classList.remove('active'));
  const encodedKind = encodeURIComponent(kind);
  const encodedId = encodeURIComponent(id);
  const response = await fetch(`/api/surface/object?kind=${encodedKind}&id=${encodedId}`);
  const detail = await response.json();
  if (!response.ok) {
    content.innerHTML = renderObjectError(detail.error || 'Object not found');
    return;
  }
  content.innerHTML = renderObjectDetail(detail);
  window.scrollTo({ top: 0 });
}

function renderObjectError(message) {
  return `
    <section class="surface-intro">
      <button type="button" class="text-link" data-back-view="atlas">← Back to Identity Map</button>
      <p class="eyebrow">Object detail</p>
      <h2>Object not found</h2>
      <p>${escapeHtml(message)}</p>
    </section>
  `;
}

function renderObjectDetail(detail) {
  const metadata = detail.metadata || {};
  const chips = (metadata.chips || [])
    .map((chip) => `<span>${escapeHtml(chip)}</span>`)
    .join('');
  const relationships = (detail.relationships || [])
    .map(renderRelationship)
    .join('');
  const renderedContent = renderDetailContent(detail.content || 'No content available.');
  const metadataRows = Object.entries(metadata)
    .filter(([key]) => !['chips', 'icon'].includes(key))
    .map(([key, value]) => `<div><span>${escapeHtml(key)}</span><strong>${escapeHtml(value ?? '')}</strong></div>`)
    .join('');
  const source = detail.source || {};
  return `
    <button type="button" class="text-link detail-back" data-back-view="atlas">← Back to Identity Map</button>
    <section class="object-detail">
      <div class="object-summary">
        <div class="concept-icon" aria-label="${escapeHtml(metadata.public_kind || detail.kind)}">${escapeHtml(metadata.icon || '◇')}</div>
        <p class="concept-kicker">${escapeHtml(metadata.public_kind || detail.kind)}</p>
        <h2>${escapeHtml(detail.title)}</h2>
        <p>${escapeHtml(detail.description || '')}</p>
        ${chips ? `<div class="variant-list concept-chips" aria-label="Concepts">${chips}</div>` : ''}
      </div>
      <aside class="source-panel">
        <p class="eyebrow">${escapeHtml(source.label || 'Source')}</p>
        <h3>Where this comes from</h3>
        <p>${escapeHtml(source.description || 'No source context is available yet.')}</p>
        ${source.path ? `<code>${escapeHtml(source.path)}</code>` : ''}
        ${source.provenance_state ? `<p class="source-state">${escapeHtml(source.provenance_state)}</p>` : ''}
      </aside>
      <section class="detail-block detail-content">
        <p class="eyebrow">Content</p>
        <div class="rendered-content">${renderedContent}</div>
      </section>
      <section class="detail-block">
        <p class="eyebrow">Related</p>
        ${relationships ? `<div class="relationship-list">${relationships}</div>` : `<p class="empty-state">No related objects are available yet.</p>`}
      </section>
      <section class="detail-block">
        <p class="eyebrow">Metadata</p>
        ${metadataRows ? `<div class="metadata-list">${metadataRows}</div>` : `<p class="empty-state">No metadata available.</p>`}
      </section>
    </section>
  `;
}

function renderRelationship(link) {
  if (link.kind === 'identity' && link.id) {
    return `<button type="button" class="relationship-pill" data-object-kind="identity" data-object-id="${escapeHtml(link.id)}">${escapeHtml(link.label)}</button>`;
  }
  return `<span class="relationship-pill muted">${escapeHtml(link.label)}</span>`;
}

function renderDetailContent(content) {
  if (!looksLikeMarkdown(content)) {
    return `<pre>${escapeHtml(content)}</pre>`;
  }

  const lines = content.split('\n');
  const blocks = [];
  let paragraph = [];
  let list = [];
  let code = [];
  let inCode = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${escapeHtml(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push(`<ul>${list.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
    list = [];
  };
  const flushCode = () => {
    blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
    code = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        flushParagraph();
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length + 2;
      blocks.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  if (inCode) flushCode();

  return blocks.join('\n') || `<pre>${escapeHtml(content)}</pre>`;
}

function looksLikeMarkdown(content) {
  return /(^|\n)#{1,6}\s+\S/.test(content)
    || /(^|\n)\s*[-*]\s+\S/.test(content)
    || /(^|\n)```/.test(content);
}

function objectTargetFromHref(href) {
  const match = String(href || '').match(/^\/objects\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { kind: decodeURIComponent(match[1]), id: decodeURIComponent(match[2]) };
}

function renderMemoryCategory(card) {
  const ratio = Math.max(0.04, Math.min(1, Number(card.metadata?.bar_ratio || 0)));
  return `
    <article class="memory-type">
      <div class="memory-type-head">
        <span class="memory-type-icon" aria-hidden="true">${escapeHtml(card.metadata?.icon || '◫')}</span>
        <span>${escapeHtml(card.title)}</span>
        <strong>${escapeHtml(card.count ?? 0)}</strong>
      </div>
      <div class="memory-bar" aria-hidden="true"><span style="width: ${ratio * 100}%"></span></div>
    </article>
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
    return;
  }

  const nodes = await fetchJson('/api/docs/tree');
  if (!tree) return;
  tree.innerHTML = '';
  const list = document.createElement('ul');
  list.className = 'doc-tree';
  for (const node of nodes) {
    list.appendChild(renderNode(node, 0));
  }
  tree.appendChild(list);
  docsLoaded = true;
}

async function renderDocsFrame() {
  currentPath.textContent = 'Docs';
  content.innerHTML = `
    <section class="surface-intro surface-line docs-hero">
      <p><strong>How to orient yourself while using Mirror:</strong> Browse the living documentation that keeps the product, project, and process coherent.</p>
    </section>
    <div class="docs-frame">
      <aside class="docs-panel">
        <h2>Docs</h2>
        <nav id="docs-tree" aria-label="Documentation files"></nav>
      </aside>
      <article id="docs-content" class="docs-content-frame">
        <p class="empty-state">Loading documentation…</p>
      </article>
    </div>
  `;
  tree = document.querySelector('#docs-tree');
  await loadTree();
  if (!currentDocPath) {
    await loadInitialDoc();
    return;
  }
  await loadDoc(currentDocPath, { replace: true });
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
  const docsContent = document.querySelector('#docs-content');

  if (!response.ok) {
    currentPath.textContent = path;
    const errorHtml = `<pre>${escapeHtml(doc.error || 'Could not load document')}</pre>`;
    if (docsContent) {
      docsContent.innerHTML = errorHtml;
    } else {
      content.innerHTML = errorHtml;
    }
    return;
  }

  currentDocPath = doc.path;
  currentPath.textContent = doc.path;
  if (docsContent) {
    currentPath.hidden = true;
    docsContent.innerHTML = doc.html;
  } else {
    currentPath.hidden = false;
    content.innerHTML = doc.html;
  }
  window.scrollTo({ top: 0 });
}

content.addEventListener('click', async (event) => {
  const objectTarget = event.target.closest('[data-object-kind][data-object-id]');
  if (objectTarget) {
    event.preventDefault();
    await loadObject(objectTarget.dataset.objectKind, objectTarget.dataset.objectId);
    return;
  }

  const journeyTarget = event.target.closest('[data-workspace-journey]');
  if (journeyTarget) {
    event.preventDefault();
    selectedWorkspaceJourney = journeyTarget.dataset.workspaceJourney;
    await showView('workspace', { updateHash: false });
    return;
  }

  const tabTarget = event.target.closest('[data-workspace-tab]');
  if (tabTarget) {
    event.preventDefault();
    showWorkspaceTab(tabTarget.dataset.workspaceTab);
    return;
  }

  const backTarget = event.target.closest('[data-back-view]');
  if (backTarget) {
    event.preventDefault();
    await showView(backTarget.dataset.backView || 'atlas');
    return;
  }

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

content.addEventListener('keydown', async (event) => {
  const objectTarget = event.target.closest('[data-object-kind][data-object-id]');
  if (!objectTarget || !['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  await loadObject(objectTarget.dataset.objectKind, objectTarget.dataset.objectId);
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

document.querySelectorAll('[data-home]').forEach((homeLink) => {
  homeLink.addEventListener('click', async (event) => {
    event.preventDefault();
    await showView('workspace');
  });
});

function showWorkspaceTab(tabId) {
  document.querySelectorAll('[data-workspace-tab]').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.workspaceTab === tabId);
  });
  document.querySelectorAll('[data-workspace-panel]').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.workspacePanel === tabId);
  });
}

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
