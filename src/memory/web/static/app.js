let tree = document.querySelector('#docs-tree');
const content = document.querySelector('#content');
const currentPath = document.querySelector('#current-path');
const mirrorName = document.querySelector('#mirror-name');
const mirrorSelector = document.querySelector('#mirror-selector');
const chooser = document.querySelector('#chooser');
const warning = document.querySelector('#warning');
const docsPanel = document.querySelector('#docs-panel');
const contentGrid = document.querySelector('.content-grid');
const tabs = [...document.querySelectorAll('[data-view]')];
let currentDocPath = null;
let docsLoaded = false;
let activeView = 'workspace';
let selectedWorkspaceJourney = null;
let workspaceSubview = 'scene';
let showCompletedJourneys = false;
let expandedJourneyParents = new Set(JSON.parse(sessionStorage.getItem('expandedJourneyParents') || '[]'));
let shellState = null;
let operationsCatalog = [];
let warningTimeout = null;

function closeMirrorSelectorOnOutsideClick(event) {
  if (!mirrorSelector || mirrorSelector.hidden || mirrorSelector.contains(event.target)) return;
  const details = mirrorSelector.querySelector('details');
  if (details) details.open = false;
}

function clearWarning() {
  if (warningTimeout) {
    clearTimeout(warningTimeout);
    warningTimeout = null;
  }
  warning.hidden = true;
  warning.textContent = '';
}

async function boot() {
  const shell = await fetchJson('/api/shell');
  applyShell(shell);
  document.addEventListener('click', closeMirrorSelectorOnOutsideClick);

  const hashView = viewFromHash();
  chooser.hidden = true;
  if (hashView?.view === 'conversation') {
    await loadConversation(hashView.id, { updateHistory: false });
    return;
  }

  activeView = hashView?.view || shell.defaultPerspective || 'workspace';
  await showView(activeView, { updateHash: false });
}

function applyShell(shell) {
  shellState = shell;
  applyTheme(shell.theme || 'system');
  if (mirrorName) mirrorName.textContent = shell.profile?.displayName || shell.mirror?.name || 'Local Mirror';
  renderMirrorSelector(shell.mirrors || []);
  showWarning(shell.warning);
}

function applyTheme(theme) {
  const selected = ['light', 'dark'].includes(theme) ? theme : 'system';
  document.documentElement.dataset.theme = selected;
}

function showWarning(message) {
  if (warningTimeout) {
    clearTimeout(warningTimeout);
    warningTimeout = null;
  }
  warning.hidden = !message;
  warning.textContent = message || '';
  if (message) {
    warningTimeout = setTimeout(() => {
      clearWarning();
    }, 5000);
  }
}

function renderMirrorSelector(mirrors) {
  if (!mirrorSelector || !mirrors.length) return;
  const current = mirrors.find((mirror) => mirror.isCurrent) || mirrors[0];
  const profile = shellState?.profile || {};
  const options = mirrors.map((mirror) => `
    <li>
      <button type="button" class="mirror-option ${mirror.isCurrent ? 'active' : ''}" data-mirror-name="${escapeHtml(mirror.name)}" ${mirror.isCurrent ? 'disabled' : ''}>
        <span class="mirror-option-mark" aria-hidden="true">${escapeHtml(mirror.avatarSymbol || (mirror.isCurrent ? '◆' : '◇'))}</span>
        <span>
          <span class="mirror-option-name">${escapeHtml(mirror.displayName || mirror.name)}</span>
          <small>${escapeHtml(mirror.name)} · ${mirror.isCurrent ? 'current Mirror' : 'select this Mirror'}</small>
        </span>
      </button>
    </li>
  `).join('');
  mirrorSelector.hidden = false;
  mirrorSelector.innerHTML = `
    <details>
      <summary>
        <span class="user-avatar" aria-hidden="true">${escapeHtml(profile.avatarSymbol || '◇')}</span>
        <span class="mirror-selector-name">${escapeHtml(profile.displayName || current.name || 'Local Mirror')}</span>
        <span class="mirror-selector-count">(${escapeHtml(mirrors.length)})</span>
      </summary>
      <div class="mirror-menu">
        <p class="mirror-menu-note">Local Mirrors found near the current home. Choose one to switch this web session.</p>
        <ul>${options}</ul>
      </div>
    </details>
  `;
}

async function selectMirror(name) {
  const shell = await fetchJson('/api/mirrors/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  selectedWorkspaceJourney = null;
  applyShell(shell);
  await showView(activeView, { updateHash: false });
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
  clearWarning();
  activeView = view;
  const docsActive = view === 'docs';
  if (docsPanel) docsPanel.hidden = !docsActive;
  currentPath.hidden = true;
  contentGrid.classList.toggle('docs-active', docsActive);
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.view === view));
  if (updateHash) {
    window.history.replaceState({ view }, '', `#${view}`);
  }

  if (view === 'preferences') {
    await renderPreferences();
    return;
  }

  if (view === 'configuration') {
    await renderConfiguration();
    return;
  }

  if (view === 'operations') {
    await renderOperations();
    return;
  }

  if (view === 'docs') {
    await renderDocsFrame();
    return;
  }

  if (view === 'conversations') {
    await loadAllConversations({ updateHistory: false });
    return;
  }

  if (view === 'journeys') {
    await loadAllJourneys({ updateHistory: false });
    return;
  }

  const url = view === 'workspace' && selectedWorkspaceJourney
    ? `/api/surface/workspace?journey=${encodeURIComponent(selectedWorkspaceJourney)}`
    : `/api/surface/${view}`;
  const surface = await fetchJson(url);
  if (view === 'workspace') {
    selectedWorkspaceJourney = surface.selected_journey_id || null;
    workspaceSubview = selectedWorkspaceJourney ? 'journey' : 'scene';
  }
  currentPath.textContent = view === 'atlas' ? 'Identity' : 'Workspace';
  content.innerHTML = view === 'atlas' ? renderAtlas(surface) : renderWorkspace(surface, null, workspaceSubview);
  if (view === 'workspace' && !surface.selected_journey_id && surface.scene?.synthesis?.state === 'missing') {
    window.setTimeout(() => generateSceneSynthesis(content.querySelector('[data-scene-panel]')), 0);
  }
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

function renderPreferences() {
  const profile = shellState?.profile || {};
  const mirror = shellState?.mirror || {};
  const mirrors = shellState?.mirrors || [];
  currentPath.textContent = 'Preferences';
  content.innerHTML = `
    <section class="surface-intro surface-line preferences-hero">
      <p><strong>How this web session identifies your Mirror:</strong> profile preferences are stored locally for the active Mirror and do not change structural identity.</p>
    </section>
    <section class="preferences-shell">
      <article class="preferences-card">
        <p class="eyebrow">Active Mirror</p>
        <h3>${escapeHtml(mirror.name || 'Local Mirror')}</h3>
        <dl class="preferences-facts">
          <div><dt>Mirror home</dt><dd>${escapeHtml(mirror.path || 'Not configured')}</dd></div>
          <div><dt>Local Mirrors</dt><dd>${escapeHtml(mirrors.length)} discovered</dd></div>
          <div><dt>Preferences file</dt><dd>${escapeHtml(shellState?.preferencesPath || 'Not persisted')}</dd></div>
        </dl>
      </article>
      <article class="preferences-card">
        <p class="eyebrow">Web profile</p>
        <h3>Header identity</h3>
        <form class="preferences-form" data-profile-form>
          <label>
            <span>Display name</span>
            <input name="displayName" value="${escapeHtml(profile.displayName || mirror.name || 'Mirror')}" maxlength="80" />
          </label>
          <label>
            <span>Avatar symbol</span>
            <input name="avatarSymbol" value="${escapeHtml(profile.avatarSymbol || '◇')}" maxlength="4" />
          </label>
          <button type="submit">Save profile</button>
        </form>
      </article>
      <article class="preferences-card">
        <p class="eyebrow">Appearance</p>
        <h3>Theme</h3>
        <form class="theme-options" data-theme-form>
          ${renderThemeOption('system', 'System', 'Follow your operating system.')}
          ${renderThemeOption('light', 'Light', 'Use the warm light surface.')}
          ${renderThemeOption('dark', 'Dark', 'Use the low-light surface.')}
        </form>
      </article>
    </section>
  `;
}

async function renderOperations(lastResult = null, selectedOperationId = null) {
  const [catalog, runs] = await Promise.all([
    fetchJson('/api/operations/catalog'),
    fetchJson('/api/operations/runs'),
  ]);
  operationsCatalog = catalog;
  currentPath.textContent = 'Operations';
  const selectedOperation = catalog.find((operation) => operation.id === selectedOperationId);
  const cards = catalog.map(renderOperationCard).join('');
  const history = runs.length ? runs.map(renderOperationRun).join('') : '<p class="empty-state">No operation runs recorded yet.</p>';
  content.innerHTML = `
    <section class="surface-intro surface-line operations-hero">
      <p><strong>How your Mirror cares for itself:</strong> run bounded maintenance operations with explicit parameters and local audit evidence.</p>
      <p class="surface-note">Operations now start as local asynchronous runs. The browser receives a run id, watches status through the audit surface, and preserves evidence without exposing arbitrary command, path, SQL, restore, delete, update, or shell access.</p>
    </section>
    ${selectedOperation ? renderOperationDetail(selectedOperation, runs, lastResult) : ''}
    <section class="operations-console">
      <div class="operations-table">
        <div class="operations-table-head" aria-hidden="true">
          <span>Operation</span>
          <span>Risk</span>
          <span>Dry-run</span>
          <span>Status</span>
          <span></span>
        </div>
        ${cards}
      </div>
      <aside class="operations-history">
        <p class="eyebrow">Recent runs</p>
        <h3>Audit evidence</h3>
        <div class="operation-run-list">${history}</div>
      </aside>
    </section>
  `;
}

function renderOperationCard(operation) {
  const runnable = operation.execution === 'runnable';
  return `
    <article class="operation-row risk-${escapeHtml(operation.riskLevel || 'unknown')}">
      <div class="operation-main">
        <span class="operation-icon" aria-hidden="true">${operationIcon(operation.id)}</span>
        <div>
          <h3>${escapeHtml(operation.title)}</h3>
          <p title="${escapeHtml(operation.description || '')}">${escapeHtml(operation.description || '')}</p>
          <small>${escapeHtml(operation.category || 'operation')}</small>
        </div>
      </div>
      <span class="operation-pill">${escapeHtml(operation.riskLevel || 'unknown')}</span>
      <span class="operation-pill">${escapeHtml(operation.dryRun || 'unknown')}</span>
      <span class="readiness-badge">${escapeHtml(operation.execution)}</span>
      <button type="button" class="operation-icon-action ${runnable ? '' : 'disabled'}" ${runnable ? `data-operation-open="${escapeHtml(operation.id)}"` : 'disabled'} aria-label="${runnable ? `Open ${escapeHtml(operation.title)}` : `${escapeHtml(operation.title)} is future work`}">${runnable ? '▶' : '○'}</button>
    </article>
  `;
}

function renderOperationDetail(operation, runs, lastResult = null) {
  const parameters = (operation.parameters || []).map(renderOperationParameter).join('');
  const operationRuns = runs.filter((run) => run.operationId === operation.id).slice(0, 6);
  const history = operationRuns.length ? operationRuns.map(renderOperationRun).join('') : '<p class="empty-state">No runs for this operation yet.</p>';
  return `
    <section class="operation-detail">
      <div class="operation-detail-head">
        <button type="button" class="secondary-action" data-operation-open="">Back to all operations</button>
        <span class="operation-pill">${escapeHtml(operation.execution)}</span>
      </div>
      <div class="operation-main detail">
        <span class="operation-icon" aria-hidden="true">${operationIcon(operation.id)}</span>
        <div>
          <p class="eyebrow">${escapeHtml(operation.category || 'operation')}</p>
          <h3>${escapeHtml(operation.title)}</h3>
          <p>${escapeHtml(operation.description || '')}</p>
        </div>
      </div>
      <div class="operation-detail-grid">
        <div>
          <h4>Run configuration</h4>
          <p class="surface-note">Review the parameters before running. Mutating operations stay bounded by the server-side allowlist.</p>
          <form class="operation-form" data-operation-form data-operation-id="${escapeHtml(operation.id)}">
            ${parameters || '<p class="empty-state">No parameters required.</p>'}
            <button type="submit">Run now</button>
          </form>
        </div>
        <div>
          <h4>Operation history</h4>
          <div class="operation-run-list compact">${history}</div>
        </div>
      </div>
      ${lastResult && lastResult.operationId === operation.id ? renderOperationResult(lastResult) : ''}
    </section>
  `;
}

function operationIcon(id) {
  if (id === 'runtime-health') return '⌁';
  if (id === 'runtime-diagnose') return '⌕';
  if (id === 'run-console-demo') return '◷';
  if (id === 'database-backup') return '◫';
  if (id === 'conversation-journey-repair') return '↔';
  if (id === 'conversation-journey-backfill') return '↔';
  if (id === 'orphan-conversation-cleanup') return '⌫';
  if (id === 'agent-run-prototype') return '✦';
  if (id === 'conversation-logger-health') return '◌';
  return '◇';
}

function renderOperationParameter(parameter) {
  const name = escapeHtml(parameter.name);
  const label = escapeHtml(parameter.label || parameter.name);
  const description = parameter.description ? `<small>${escapeHtml(parameter.description)}</small>` : '';
  if (parameter.kind === 'boolean') {
    const checked = parameter.default !== false ? 'checked' : '';
    return `
      <label class="operation-check">
        <input type="checkbox" name="${name}" ${checked} />
        <span>${label}</span>
        ${description}
      </label>
    `;
  }
  if (parameter.kind === 'choice') {
    const options = (parameter.choices || []).map((choice) => `
      <option value="${escapeHtml(choice)}" ${choice === parameter.default ? 'selected' : ''}>${escapeHtml(choice)}</option>
    `).join('');
    return `
      <label>
        <span>${label}</span>
        <select name="${name}">${options}</select>
        ${description}
      </label>
    `;
  }
  if (parameter.kind === 'integer') {
    const min = parameter.minimum ?? '';
    const max = parameter.maximum ?? '';
    const value = parameter.default ?? '';
    return `
      <label>
        <span>${label}</span>
        <input type="number" name="${name}" value="${escapeHtml(value)}" min="${escapeHtml(min)}" max="${escapeHtml(max)}" />
        ${description}
      </label>
    `;
  }
  return `
    <label>
      <span>${label}</span>
      <input name="${name}" value="${escapeHtml(parameter.default || '')}" />
      ${description}
    </label>
  `;
}

function catalogOperationById(operationId) {
  return operationsCatalog.find((operation) => operation.id === operationId) || null;
}

function operationRunToResult(run, started = {}) {
  return {
    runId: run.id || started.runId,
    operationId: run.operationId || started.operationId,
    status: run.status || started.status,
    outcome: run.outcome || started.outcome,
    summary: run.summary || started.summary,
    result: run.result || started.result,
    error: run.error || started.error,
    events: run.events || started.events || [],
    parameters: run.parameters || started.parameters || {},
    startedAt: run.startedAt || started.startedAt,
    completedAt: run.completedAt || started.completedAt,
  };
}

function showRunConsole(result, operation = null) {
  const runId = result.runId || result.id || '';
  const operationId = result.operationId || operation?.id || 'operation';
  const terminal = !['queued', 'running', 'cancellation_requested', 'approval_required'].includes(result.status);
  const waitingForApproval = result.status === 'approval_required';
  const summary = (result.summary || []).map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  const actionButtons = waitingForApproval ? '' : renderRunConsoleActions(result);
  const detailsIntro = operation ? `
    <section class="operation-evidence-list">
      <strong>${escapeHtml(operation.title)}</strong>
      <p>${escapeHtml(operation.description || '')}</p>
    </section>
  ` : '';
  const runFacts = `
    <div class="operation-result-grid">
      ${renderResultFact('Status', result.outcome || result.status || 'unknown')}
      ${renderResultFact('Run id', runId || 'unknown')}
      ${renderResultFact('Risk', operation?.riskLevel || 'unknown')}
      ${renderResultFact('Dry-run', operation?.dryRun || 'unknown')}
    </div>
  `;
  const agentInput = operationId === 'agent-run-prototype' ? `
    <section class="operation-evidence-list agent-input-preview">
      <strong>Future agent input</strong>
      <textarea disabled placeholder="Future releases will let you continue the agent run here."></textarea>
      <button type="button" disabled>Send to agent</button>
      <small>Disabled in this prototype. The current run is read-only and proposal-oriented.</small>
    </section>
  ` : '';
  const showDetailsFirst = terminal && operationId === 'historical-metadata-backfill';
  content.innerHTML = `
    <section class="run-console-shell single">
      <section class="run-console-main">
        <div class="run-console-head">
          <p class="eyebrow">Operation execution</p>
          <h2>${escapeHtml(operation?.title || operationId)}</h2>
          <p class="surface-note">This surface updates from durable run state. True SSE/WebSocket streaming remains future work.</p>
          ${actionButtons}
        </div>
        ${waitingForApproval ? renderApprovalRequiredPanel(result, operation) : `
          <div class="workspace-tabs run-frame-tabs" role="tablist" aria-label="Run result frame">
            <button type="button" class="workspace-tab ${showDetailsFirst ? '' : 'active'}" data-run-tab="console" role="tab" aria-selected="${showDetailsFirst ? 'false' : 'true'}">Polled console</button>
            ${terminal ? `<button type="button" class="workspace-tab result-ready ${showDetailsFirst ? 'active' : ''}" data-run-tab="details" role="tab" aria-selected="${showDetailsFirst ? 'true' : 'false'}">Result details</button>` : ''}
          </div>
          <div class="run-tab-panel ${showDetailsFirst ? '' : 'active'}" data-run-panel="console" role="tabpanel" ${showDetailsFirst ? 'hidden' : ''}>
            <div class="run-terminal">
              ${renderConsoleLines(result)}
            </div>
            ${terminal ? renderRunCompletionInvite(result) : ''}
          </div>
        `}
        ${terminal ? `<div class="run-tab-panel ${showDetailsFirst ? 'active' : ''}" data-run-panel="details" role="tabpanel" ${showDetailsFirst ? '' : 'hidden'}>
          ${detailsIntro}
          ${runFacts}
          ${summary ? `<div class="operation-evidence-list"><strong>Summary</strong><ul>${summary}</ul></div>` : ''}
          ${renderOperationTimeline(result.events || [])}
          ${renderOperationResultCards(result)}
          ${agentInput}
          ${renderRawEvidence(result.result)}
        </div>` : ''}
      </section>
    </section>
  `;
  const terminalEl = content.querySelector('.run-terminal');
  if (terminalEl) terminalEl.scrollTop = terminalEl.scrollHeight;
}

function renderApprovalRequiredPanel(result, operation = null) {
  const runId = result.runId || result.id || '';
  return `
    <section class="approval-required-panel">
      <p class="eyebrow">Approval required</p>
      <h3>This operation can change your Mirror data.</h3>
      <p>${escapeHtml(operation?.title || result.operationId || 'This operation')} is queued, but it will not run until you approve it.</p>
      <div class="run-actions approval-actions">
        <button type="button" class="danger-action" data-operation-approve="${escapeHtml(runId)}">Approve and run operation</button>
        <button type="button" class="secondary-action" data-operation-cancel="${escapeHtml(runId)}">Cancel</button>
      </div>
    </section>
  `;
}

function renderRunCompletionInvite(result) {
  const failed = result.error || result.status === 'failed';
  const cancelled = result.status === 'cancelled';
  const label = failed ? 'Operation failed.' : (cancelled ? 'Operation cancelled.' : 'Operation completed.');
  return `
    <section class="run-completion-invite ${failed ? 'failed' : 'success'}">
      <strong>${escapeHtml(label)}</strong>
      <button type="button" class="secondary-action" data-run-tab="details">View result details</button>
    </section>
  `;
}

function renderRunConsoleActions(result) {
  const runId = result.runId || result.id;
  if (!runId) return '';
  const parts = [];
  if (result.status === 'approval_required') {
    parts.push(`<button type="button" class="danger-action" data-operation-approve="${escapeHtml(runId)}">Approve and run operation</button>`);
  }
  if (['queued', 'running', 'cancellation_requested', 'approval_required'].includes(result.status)) {
    parts.push(`<button type="button" class="secondary-action" data-operation-cancel="${escapeHtml(runId)}">Request cancel</button>`);
  }
  return parts.length ? `<div class="run-actions">${parts.join('')}</div>` : '';
}

function consoleStatusTone(result) {
  if (result.error || result.status === 'failed') return 'failed';
  if (String(result.outcome || '').includes('attention') || ['queued', 'running', 'approval_required', 'cancellation_requested', 'cancelled'].includes(result.status)) return 'attention';
  return 'success';
}

function renderConsoleLines(result) {
  const progressLines = (result.events || [])
    .filter((event) => event.kind === 'progress')
    .map((event) => `
      <div class="console-line status-attention">
        <span>${escapeHtml(formatDateTime(event.createdAt))}</span>
        <strong>progress</strong>
        <code>${escapeHtml(event.message || '')}</code>
      </div>
    `).join('');
  const command = result.result?.command;
  const commandLines = command ? `
    <div class="console-line"><span>command</span><strong>${escapeHtml(command.commandId || '')}</strong><code>${escapeHtml((command.argv || []).join(' '))}</code></div>
    ${command.stdout ? `<pre class="console-output">${escapeHtml(command.stdout)}</pre>` : ''}
    ${command.stderr ? `<pre class="console-output attention">${escapeHtml(command.stderr)}</pre>` : ''}
  ` : '';
  const agent = result.result?.agent;
  const agentLines = agent ? `
    <div class="console-line"><span>intent</span><strong>agent</strong><code>${escapeHtml(agent.intent || '')}</code></div>
    <pre class="console-output">${escapeHtml(JSON.stringify({ proposal: agent.proposal, boundaries: agent.boundaries, nextStep: agent.nextStep }, null, 2))}</pre>
  ` : '';
  const operationLabel = String(result.operationId || 'operation').replaceAll('-', ' ');
  const summaryLines = !commandLines && !agentLines && (result.summary || []).length ? `
    <div class="console-line console-title-line status-${escapeHtml(consoleStatusTone(result))}"><span>result of ${escapeHtml(operationLabel)}</span><strong>${escapeHtml(result.outcome || result.status || 'completed')}</strong></div>
    <pre class="console-output">${escapeHtml((result.summary || []).join('\n'))}</pre>
  ` : '';
  if (!progressLines && !commandLines && !agentLines && !summaryLines) return '<div class="console-line"><span>waiting</span><strong>queued</strong><code>Waiting for console output...</code></div>';
  return `${progressLines}${commandLines}${agentLines}${summaryLines}`;
}

function renderOperationResult(result) {
  const ok = !result.error;
  const summary = (result.summary || []).map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  return `
    <section class="operation-result ${ok ? 'success' : 'failure'}">
      <p class="eyebrow">Last operation</p>
      <h3>${escapeHtml(result.operationId || 'Operation')} · ${escapeHtml(result.outcome || result.status || (ok ? 'completed' : 'failed'))}</h3>
      ${result.runId ? `<p>Run id: <code>${escapeHtml(result.runId)}</code></p>` : ''}
      ${result.error ? `<p>${escapeHtml(result.error)}</p>` : ''}
      ${summary ? `<ul>${summary}</ul>` : ''}
      ${renderOperationTimeline(result.events || [])}
      ${renderOperationResultCards(result)}
      ${renderRawEvidence(result.result)}
    </section>
  `;
}

function renderOperationTimeline(events) {
  if (!events.length) return '';
  const items = events.map((event) => `
    <li>
      <strong>${escapeHtml(event.kind || 'event')}</strong>
      <span>${escapeHtml(event.message || '')}</span>
      <small>${escapeHtml(formatDateTime(event.createdAt))}</small>
    </li>
  `).join('');
  return `
    <div class="operation-evidence-list">
      <strong>Run timeline</strong>
      <ul>${items}</ul>
    </div>
  `;
}

function renderOperationResultCards(result) {
  const data = result.result || {};
  if (result.operationId === 'runtime-health') return renderRuntimeHealthResult(data);
  if (result.operationId === 'runtime-diagnose') return renderCommandResult(data.command || {});
  if (result.operationId === 'database-backup') return renderBackupResult(data);
  if (result.operationId === 'conversation-journey-repair') return renderRepairResult(data);
  if (result.operationId === 'conversation-journey-backfill') return renderJourneyBackfillResult(data);
  if (result.operationId === 'historical-metadata-backfill') return renderMetadataBackfillResult(data);
  if (result.operationId === 'orphan-conversation-cleanup') return renderOrphanCleanupResult(data);
  if (result.operationId === 'agent-run-prototype') return renderAgentPrototypeResult(data.agent || {});
  return '';
}

function renderJourneyBackfillResult(data) {
  const candidates = data.candidates || [];
  const candidateList = candidates.slice(0, 50).map((item) => `
    <li><code>${escapeHtml(item.conversationId || '')}</code> → <strong>${escapeHtml(item.journey || '')}</strong> · ${escapeHtml(item.reason || '')}: ${escapeHtml(item.evidence || '')}</li>
  `).join('');
  return `
    <section class="operation-result-card">
      <p class="eyebrow">Journey backfill</p>
      <h3>${data.appliedCount ? 'Journeys assigned' : 'Backfill preview'}</h3>
      <div class="operation-result-grid">
        ${renderResultFact('Mode', data.mode || 'unknown')}
        ${renderResultFact('Candidates', String(data.candidateCount || 0))}
        ${renderResultFact('Applied', String(data.appliedCount || 0))}
        ${renderResultFact('Backup', data.backupPath ? 'created' : 'not needed')}
      </div>
      ${data.backupPath ? `<p>Backup: <code>${escapeHtml(data.backupPath)}</code></p>` : ''}
      ${candidateList ? `<div class="operation-evidence-list"><strong>Candidate assignments</strong><ul>${candidateList}</ul></div>` : ''}
    </section>
  `;
}

function renderMetadataBackfillResult(data) {
  const preview = data.preview || {};
  const apply = data.apply || null;
  const backup = data.backupPath || null;
  const changed = apply?.changed_count ?? 0;
  const candidates = apply?.candidate_count ?? preview.candidate_count ?? 0;
  const noChanges = (apply?.results || []).filter((item) => !item.mutated);
  const noChangeList = noChanges.slice(0, 30).map((item) => `<li><code>${escapeHtml(item.conversation_id || '')}</code></li>`).join('');
  return `
    <section class="operation-result-card">
      <p class="eyebrow">Metadata backfill</p>
      <h3>${apply ? 'Backfill applied' : 'Backfill preview'}</h3>
      <div class="operation-result-grid">
        ${renderResultFact('Mode', apply?.backfill_mode || preview.backfill_mode || 'unknown')}
        ${renderResultFact('Scope', preview.scope || 'all')}
        ${renderResultFact('Candidates', String(candidates))}
        ${renderResultFact('Changed', String(changed))}
        ${renderResultFact('No changes', String(noChanges.length))}
        ${renderResultFact('Backup', backup ? 'created' : 'not needed')}
      </div>
      ${backup ? `<p>Backup: <code>${escapeHtml(backup)}</code></p>` : ''}
      ${noChangeList ? `<div class="operation-evidence-list"><strong>No-change conversations</strong><ul>${noChangeList}</ul></div>` : ''}
    </section>
  `;
}

function renderOrphanCleanupResult(data) {
  const candidates = data.candidates || [];
  const candidateList = candidates.slice(0, 50).map((item) => `
    <li><code>${escapeHtml(item.conversationId || '')}</code> · ${escapeHtml(item.title || 'Untitled')} · ${escapeHtml(String(item.messageCount ?? 0))} msg · ${escapeHtml(item.cleanupReason || 'candidate')} · ${escapeHtml(item.journey || 'no journey')}</li>
  `).join('');
  return `
    <section class="operation-result-card">
      <p class="eyebrow">Orphan cleanup</p>
      <h3>${data.deletedCount ? 'Conversations deleted' : 'Cleanup preview'}</h3>
      <div class="operation-result-grid">
        ${renderResultFact('Source', data.source || 'unknown')}
        ${renderResultFact('Candidates', String(data.candidateCount || 0))}
        ${renderResultFact('Deleted', String(data.deletedCount || 0))}
        ${renderResultFact('Max messages', String(data.maximumMessages ?? 'unknown'))}
        ${renderResultFact('Backup', data.backupPath ? 'created' : 'not needed')}
      </div>
      ${data.backupPath ? `<p>Backup: <code>${escapeHtml(data.backupPath)}</code></p>` : ''}
      ${candidateList ? `<div class="operation-evidence-list"><strong>Candidate conversations</strong><ul>${candidateList}</ul></div>` : ''}
    </section>
  `;
}

function renderRuntimeHealthResult(data) {
  const issues = runtimeHealthIssues(data);
  const issueList = issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join('');
  return `
    <div class="operation-result-grid">
      ${renderResultFact('Status', data.status || 'unknown')}
      ${renderResultFact('Version', data.version || 'unknown')}
      ${renderResultFact('Database', data.database?.exists ? 'present' : 'missing')}
      ${renderResultFact('Git', data.git?.branch ? `${data.git.branch}${data.git.dirty ? ' · dirty' : ''}` : 'unknown')}
      ${renderResultFact('Core migrations', data.coreMigrations?.ready ? 'ready' : 'attention')}
      ${renderResultFact('Extensions', `${(data.extensions || []).length} installed`)}
    </div>
    <div class="operation-evidence-list ${issues.length ? 'attention' : 'success'}">
      <strong>${issues.length ? 'Needs attention' : 'No blocking issues detected'}</strong>
      ${issues.length ? `<ul>${issueList}</ul>` : '<p>Runtime status did not report dirty git state, missing database, migration drift, or extension health blockers.</p>'}
    </div>
  `;
}

function runtimeHealthIssues(data) {
  const issues = [];
  if (data.mirrorHomeError) issues.push(`Mirror home: ${data.mirrorHomeError}`);
  if (data.git?.error) issues.push(`Git: ${data.git.error}`);
  if (data.git?.dirty) issues.push('Git working tree has uncommitted changes.');
  if (data.database?.exists === false) issues.push(`Database is missing at ${data.database?.path || 'configured path'}.`);
  if (data.coreMigrations && !data.coreMigrations.ready) {
    const note = data.coreMigrations.note ? ` (${data.coreMigrations.note})` : '';
    issues.push(`Core migrations need attention${note}.`);
  }
  for (const health of data.extensionHealth || []) {
    if (!health.ready) issues.push(`Extension ${health.extensionId} needs attention${health.note ? `: ${health.note}` : ''}.`);
  }
  return issues;
}

function renderCommandResult(command) {
  return `
    <div class="operation-result-grid">
      ${renderResultFact('Command', command.commandId || 'unknown')}
      ${renderResultFact('Exit', command.timedOut ? 'timeout' : (command.returnCode ?? 'unknown'))}
      ${renderResultFact('Succeeded', command.succeeded ? 'yes' : 'no')}
    </div>
    ${command.stdout ? `<div class="operation-evidence-list"><strong>stdout</strong><pre>${escapeHtml(command.stdout)}</pre></div>` : ''}
    ${command.stderr ? `<div class="operation-evidence-list attention"><strong>stderr</strong><pre>${escapeHtml(command.stderr)}</pre></div>` : ''}
  `;
}

function renderBackupResult(data) {
  const entries = (data.verification?.entries || []).map((entry) => `<li>${escapeHtml(entry)}</li>`).join('');
  const route = (data.recoveryRoute || []).map((step) => `<li>${escapeHtml(step)}</li>`).join('');
  return `
    <div class="operation-result-grid">
      ${renderResultFact('Backup path', data.backupPath || 'not created')}
      ${renderResultFact('Verification', data.verification?.valid ? 'valid' : (data.verification ? 'invalid' : 'skipped'))}
    </div>
    ${entries ? `<div class="operation-evidence-list"><strong>Archive entries</strong><ul>${entries}</ul></div>` : ''}
    ${route ? `<div class="operation-evidence-list"><strong>Manual recovery route</strong><ol>${route}</ol></div>` : ''}
  `;
}

function renderRepairResult(data) {
  const candidates = (data.candidates || []).map((candidate) => `
    <li>
      <strong>${escapeHtml(candidate.journey)}</strong>
      <span>${escapeHtml(candidate.title || candidate.conversationId)}</span>
      <small>${escapeHtml(candidate.reason || '')}</small>
    </li>
  `).join('');
  return `
    <div class="operation-result-grid">
      ${renderResultFact('Candidates', data.candidateCount ?? 0)}
      ${renderResultFact('Applied', data.appliedCount ?? 0)}
      ${renderResultFact('Backup', data.backupPath || 'not created')}
    </div>
    ${candidates ? `<div class="operation-evidence-list"><strong>Repair candidates</strong><ul>${candidates}</ul></div>` : ''}
  `;
}

function renderAgentPrototypeResult(agent) {
  const proposal = (agent.proposal || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const boundaries = (agent.boundaries || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  return `
    <div class="operation-result-grid">
      ${renderResultFact('Intent', agent.intent || 'not provided')}
      ${renderResultFact('Mirror', agent.mirrorHome || 'unknown')}
    </div>
    ${proposal ? `<div class="operation-evidence-list"><strong>Prototype proposal</strong><ol>${proposal}</ol></div>` : ''}
    ${boundaries ? `<div class="operation-evidence-list attention"><strong>Boundaries</strong><ul>${boundaries}</ul></div>` : ''}
    ${agent.nextStep ? `<p>${escapeHtml(agent.nextStep)}</p>` : ''}
  `;
}

function renderResultFact(label, value) {
  return `
    <div class="operation-result-fact">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderRawEvidence(result) {
  if (!result) return '';
  return `
    <details class="raw-evidence">
      <summary>Raw evidence</summary>
      <pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>
    </details>
  `;
}

function renderOperationRun(run) {
  const cancellable = ['queued', 'running', 'cancellation_requested', 'approval_required'].includes(run.status);
  const approvable = run.status === 'approval_required';
  return `
    <article class="operation-run status-${escapeHtml(runStatusTone(run))}" data-operation-view-run="${escapeHtml(run.id)}" role="button" tabindex="0">
      <span class="operation-run-dot" aria-hidden="true"></span>
      <div class="operation-run-body">
        <div>
          <strong>${escapeHtml(run.operationId)}</strong>
          <em>${escapeHtml(run.outcome || run.status)}</em>
        </div>
        <small>${escapeHtml(formatDateTime(run.startedAt))}</small>
        ${approvable ? `<button type="button" class="danger-action" data-operation-approve="${escapeHtml(run.id)}">Approve</button>` : ''}
        ${cancellable ? `<button type="button" class="secondary-action" data-operation-cancel="${escapeHtml(run.id)}">Request cancel</button>` : ''}
      </div>
    </article>
  `;
}

function runStatusTone(run) {
  if (run.status === 'failed') return 'failed';
  if (['queued', 'running', 'cancellation_requested', 'cancelled', 'approval_required'].includes(run.status)) return 'attention';
  if (String(run.outcome || '').includes('attention') || String(run.outcome || '').includes('dry_run')) return 'attention';
  return 'completed';
}

async function pollRunConsole(runId, attempts = 1800) {
  for (let index = 0; index < attempts; index += 1) {
    const run = await fetchJson(`/api/operations/runs/${encodeURIComponent(runId)}`);
    showRunConsole(operationRunToResult(run), catalogOperationById(run.operationId));
    if (run.status !== 'queued' && run.status !== 'running' && run.status !== 'cancellation_requested') {
      showWarning(run.status === 'failed' ? 'Operation failed.' : 'Operation completed.');
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  showWarning('Operation is still running; polling timed out. Reopen the run from history to continue watching.');
  return null;
}

async function waitForOperationRun(runId, attempts = 20) {
  let run = null;
  for (let index = 0; index < attempts; index += 1) {
    run = await fetchJson(`/api/operations/runs/${encodeURIComponent(runId)}`);
    if (run.status !== 'queued' && run.status !== 'running') return run;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return run;
}

function operationPayloadFromForm(form) {
  const parameters = {};
  const data = new FormData(form);
  form.querySelectorAll('input[name], select[name]').forEach((input) => {
    if (input.type === 'checkbox') {
      parameters[input.name] = input.checked;
      return;
    }
    if (input.type === 'number') {
      parameters[input.name] = Number(data.get(input.name));
      return;
    }
    parameters[input.name] = String(data.get(input.name) || '');
  });
  return { operationId: form.dataset.operationId, parameters };
}

async function renderConfiguration() {
  const overview = await fetchJson('/api/configuration/overview');
  currentPath.textContent = 'Configuration';
  const sections = overview.sections || [];
  const tabs = sections.map((section, index) => renderConfigurationTab(section, index)).join('');
  const panels = sections.map((section, index) => renderConfigurationSection(section, index)).join('');
  content.innerHTML = `
    <section class="surface-intro surface-line configuration-hero">
      <p><strong>${escapeHtml(overview.title || 'Configuration overview')}:</strong> ${escapeHtml(overview.description || 'Read-only local Mirror configuration.')}</p>
    </section>
    <section class="configuration-console">
      <div class="configuration-tabs" role="tablist" aria-label="Configuration sections">${tabs}</div>
      <div class="configuration-panels">${panels}</div>
    </section>
  `;
}

function renderConfigurationTab(section, index) {
  return `
    <button type="button" class="configuration-tab ${index === 0 ? 'active' : ''}" data-configuration-tab="${escapeHtml(section.id)}" role="tab" aria-selected="${index === 0 ? 'true' : 'false'}">
      ${escapeHtml(section.title)}
    </button>
  `;
}

function renderConfigurationSection(section, index) {
  const items = (section.items || []).map(renderConfigurationItem).join('');
  return `
    <article class="configuration-card ${index === 0 ? 'active' : ''}" data-configuration-panel="${escapeHtml(section.id)}" role="tabpanel">
      <p class="eyebrow">${escapeHtml(section.id)}</p>
      <h3>${escapeHtml(section.title)}</h3>
      <p>${escapeHtml(section.description || '')}</p>
      <dl class="configuration-list">${items}</dl>
    </article>
  `;
}

function renderConfigurationItem(item) {
  const exists = item.exists === true ? 'exists' : item.exists === false ? 'missing' : 'neutral';
  const status = item.exists === true ? 'Found' : item.exists === false ? 'Missing' : 'Info';
  const requirementLabel = item.required ? 'Required' : 'Optional';
  const requirementIcon = item.required ? '●' : '○';
  const reference = item.docHref
    ? `<button type="button" class="configuration-icon configuration-doc-link" data-doc-reference="${escapeHtml(item.docHref)}" aria-label="Open ${escapeHtml(item.label)} reference" title="Open reference">i</button>`
    : '';
  return `
    <div class="configuration-item configuration-${exists}">
      <dt>${escapeHtml(item.label)}</dt>
      <dd>
        <code>${escapeHtml(item.value)}</code>
        <small>${escapeHtml(item.description || '')}</small>
      </dd>
      <div class="configuration-item-actions" aria-label="Configuration item metadata">
        <span class="configuration-status">${status}</span>
        <span class="configuration-icon configuration-requirement ${item.required ? 'required' : 'optional'}" aria-label="${escapeHtml(requirementLabel)}" title="${escapeHtml(requirementLabel)}">${requirementIcon}</span>
        ${reference}
      </div>
    </div>
  `;
}

function renderThemeOption(value, label, description) {
  const checked = (shellState?.theme || 'system') === value ? 'checked' : '';
  return `
    <label class="theme-option">
      <input type="radio" name="theme" value="${escapeHtml(value)}" ${checked} />
      <span>
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(description)}</small>
      </span>
    </label>
  `;
}

function renderWorkspace(surface, mainContent = null, subview = 'scene') {
  const metrics = (surface.metrics || [])
    .filter((metric) => metric.id !== 'active-journeys')
    .map(renderWorkspaceMetric)
    .join('');
  const selected = surface.selected_journey;
  const sections = selected ? [renderCurrentSceneTabPanel(surface.scene || null), ...(surface.sections || []).map((section, index) => renderWorkspaceTabPanel(section, index + 1))].join('') : '';
  const tabs = selected ? [renderCurrentSceneTab(), ...(surface.sections || []).map((section, index) => renderWorkspaceTab(section, index + 1))].join('') : '';
  return `
    <section class="surface-intro surface-line workspace-hero">
      <p><strong>How Mirror can help you today:</strong> ${escapeHtml(surface.status || 'Where you find your journeys, conversations, memories and decisions.')}</p>
    </section>
    <div class="workspace-shell">
      <aside class="journey-sidebar">
        ${renderGlobalWorkspaceMenu(surface.selected_journey_id, subview)}
        <p class="eyebrow">Your Journeys (${escapeHtml((surface.journeys || []).length)})</p>
        <button type="button" class="journey-create-button" data-new-journey>+ New journey</button>
        ${renderJourneyMenu(surface.journeys || [], surface.selected_journey_id)}
      </aside>
      <section class="journey-workspace">
        ${mainContent || `
          ${selected ? '' : renderScene(surface.scene || null)}
          ${selected ? renderJourneyProfile(selected, metrics) : ''}
          ${selected ? `<div class="workspace-tabs" role="tablist" aria-label="Journey workspace tabs">${tabs}</div>` : ''}
          ${selected ? `<div class="workspace-tab-panels">${sections}</div>` : ''}
        `}
      </section>
    </div>
  `;
}

function renderGlobalWorkspaceMenu(selectedJourneyId, subview = 'scene') {
  return `
    <section class="global-workspace-menu" aria-label="Global workspace navigation">
      <p class="eyebrow">Your Moment</p>
      <button type="button" class="global-workspace-item ${subview === 'scene' && !selectedJourneyId ? 'active' : ''}" data-global-scene>
        <span>◉</span>
        <span><strong>Current Scene</strong><small>Where am I now?</small></span>
      </button>
      <button type="button" class="global-workspace-item ${subview === 'conversations' ? 'active' : ''}" data-all-conversations>
        <span>☷</span>
        <span><strong>Conversations</strong><small>What has been said</small></span>
      </button>
      <button type="button" class="global-workspace-item ${subview === 'journeys' ? 'active' : ''}" data-all-journeys>
        <span>⌁</span>
        <span><strong>All journeys</strong><small>The wider field</small></span>
      </button>
    </section>
  `;
}

function renderScene(scene) {
  if (!scene) return '';
  const synthesis = scene.synthesis || {};
  return `
    <section class="scene-panel scene-panel-synthesis-only" data-scene-panel data-scene-journey-id="${escapeHtml(scene.selectedJourneyId || '')}">
      <div class="scene-synthesis ${synthesis.state === 'generated' ? 'generated' : 'fallback'} ${synthesis.outdated ? 'outdated' : ''}" data-scene-synthesis>
        ${renderSceneOrientation(synthesis, { scope: scene.selectedJourneyId ? 'journey' : 'global' })}
      </div>
    </section>
  `;
}

function renderSceneOrientation(synthesis, { showKicker = true, scope = 'global' } = {}) {
  if (synthesis.state === 'missing') return renderMissingSceneOrientation({ showKicker, scope });
  const orientation = synthesis.orientation || {};
  const summary = orientation.summary || synthesis.text || 'Scene orientation is unavailable right now.';
  const paragraphs = String(summary).split(/\n\s*\n/).filter(Boolean).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
  const signals = (orientation.signals || []).map((signal) => `<li>${escapeHtml(signal)}</li>`).join('');
  const buttonLabel = synthesis.outdated ? 'Refresh orientation' : 'Regenerate orientation';
  return `
    <div class="orientation-head">
      <div>
        ${showKicker ? '<p class="concept-kicker">Current Scene</p>' : ''}
        <h2>${escapeHtml(orientation.title || 'Your current scene')}</h2>
      </div>
      ${synthesis.outdated ? '<span class="orientation-status outdated" title="This orientation was generated before the latest scene signals.">↻ Outdated</span>' : ''}
    </div>
    <div class="orientation-summary">${paragraphs}</div>
    ${signals ? `<div class="orientation-signals"><p class="eyebrow">Signals used</p><ul>${signals}</ul></div>` : ''}
    ${orientation.next ? `<div class="orientation-next"><p class="eyebrow">Next movement</p><p>${escapeHtml(orientation.next)}</p></div>` : ''}
    <button type="button" class="secondary-action" data-generate-scene-synthesis>${buttonLabel}</button>
  `;
}

function renderMissingSceneOrientation({ showKicker = true, scope = 'global' } = {}) {
  const global = scope === 'global';
  return `
    <div class="orientation-head">
      <div>
        ${showKicker ? '<p class="concept-kicker">Current Scene</p>' : ''}
        <h2>${global ? 'Let Mirror read your moment' : 'Let Mirror read this journey'}</h2>
      </div>
    </div>
    <div class="orientation-summary">
      <p>${global ? 'Mirror can look across recent conversations, memories, tasks, and journeys to compose a grounded orientation.' : 'When you are ready, Mirror can look at recent movement in this journey and compose a grounded orientation.'}</p>
    </div>
    <button type="button" class="secondary-action" data-generate-scene-synthesis>${global ? 'Read my moment' : 'Read this journey'}</button>
  `;
}

async function generateSceneSynthesis(panel) {
  if (!panel) return;
  const box = panel.querySelector('[data-scene-synthesis]');
  const button = panel.querySelector('[data-generate-scene-synthesis]');
  if (box) box.innerHTML = '<p class="orientation-loading">Generating orientation…</p>';
  if (button) button.disabled = true;
  try {
    const result = await fetchJson('/api/surface/workspace/scene-synthesis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ journeyId: panel.dataset.sceneJourneyId || null }),
    });
    const synthesis = result.synthesis || {};
    if (box) {
      box.classList.toggle('generated', synthesis.state === 'generated');
      box.classList.toggle('fallback', synthesis.state !== 'generated');
      box.classList.toggle('outdated', Boolean(synthesis.outdated));
      box.innerHTML = renderSceneOrientation(synthesis, {
        showKicker: !box.classList.contains('scene-synthesis-inline'),
        scope: panel.dataset.sceneJourneyId ? 'journey' : 'global',
      });
    }
  } catch (error) {
    if (box) box.querySelector('p').textContent = String(error.message || error);
    if (button) button.disabled = false;
  }
}

function renderSceneJourneyMapItem(item) {
  const children = (item.children || []).map((child) => `
    <li class="scene-map-child"><span>↳</span><strong>${escapeHtml(child.title || child.id)}</strong><small>${escapeHtml(child.horizon || '')}</small></li>
  `).join('');
  return `
    <article class="scene-map-item">
      <div><strong>${escapeHtml(item.title || item.id)}</strong><small>${escapeHtml(item.horizon || '')}</small></div>
      ${children ? `<ul>${children}</ul>` : ''}
    </article>
  `;
}

function renderJourneyMenu(journeys, selectedId) {
  if (!journeys.length) return `<p class="empty-state">No journeys are available yet.</p>`;
  const completedJourneys = (journeys || []).filter((journey) => journey.status === 'completed');
  const completedSelected = completedJourneys.some((journey) => journey.id === selectedId);
  const includeCompleted = showCompletedJourneys || completedSelected;
  const visibleJourneys = includeCompleted ? journeys : (journeys || []).filter((journey) => journey.status !== 'completed');
  const renderItems = (items) => hierarchicalJourneyItems(items, selectedId).map(({ journey, depth, hasChildren, expanded }) => `
    <div class="journey-menu-row ${depth ? 'journey-menu-child-row' : ''}">
      ${hasChildren ? `
        <button type="button" class="journey-expand-toggle" title="${expanded ? 'Collapse journey' : 'Expand journey'}" data-toggle-journey-parent="${escapeHtml(journey.id)}">
          ${expanded ? '▾' : '▸'}
        </button>
      ` : '<span class="journey-expand-spacer"></span>'}
      <button type="button" class="journey-menu-item ${['completed', 'paused'].includes(journey.status) ? 'journey-menu-muted' : ''} ${journey.status === 'completed' ? 'journey-menu-completed' : ''} ${journey.status === 'paused' ? 'journey-menu-paused' : ''} ${depth ? 'journey-menu-child' : ''} ${journey.id === selectedId ? 'active' : ''}" title="${escapeHtml(journey.title)}" data-workspace-journey="${escapeHtml(journey.id)}">
        <span>${escapeHtml(depth ? '↳' : (journey.metadata?.icon || '⌁'))}</span>
        <span class="journey-menu-title">${escapeHtml(journey.title)}</span>
      </button>
    </div>
  `).join('');
  return `
    <div class="journey-menu">
      ${completedJourneys.length ? `
        <button type="button" class="journey-completed-toggle" data-toggle-completed-journeys>
          ${includeCompleted ? 'Hide completed journeys' : `Show completed journeys (${escapeHtml(completedJourneys.length)})`}
        </button>
      ` : ''}
      ${renderItems(visibleJourneys)}
    </div>
  `;
}

function hierarchicalJourneyItems(journeys, selectedId = '') {
  const byId = new Map((journeys || []).map((journey) => [journey.id, journey]));
  const children = new Map();
  const roots = [];
  (journeys || []).forEach((journey) => {
    const parent = journey.metadata?.parent_journey || journey.parent_journey || '';
    if (parent && byId.has(parent)) {
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(journey);
    } else {
      roots.push(journey);
    }
  });
  const selectedParent = (journeys || []).find((journey) => journey.id === selectedId)?.metadata?.parent_journey || '';
  const ordered = [];
  roots.forEach((journey) => {
    const childItems = children.get(journey.id) || [];
    const hasChildren = childItems.length > 0;
    const expanded = expandedJourneyParents.has(journey.id) || selectedParent === journey.id;
    ordered.push({ journey, depth: 0, hasChildren, expanded });
    if (expanded) childItems.forEach((child) => ordered.push({ journey: child, depth: 1, hasChildren: false, expanded: false }));
  });
  return ordered;
}

async function loadNewJourneyForm(draft = null) {
  activeView = 'workspace';
  const status = draft?.status || 'active';
  let journeyOptions = [];
  try {
    const payload = await fetchJson('/api/conversations/unassigned?limit=1');
    journeyOptions = payload.journeys || [];
  } catch (error) {
    journeyOptions = [];
  }
  content.innerHTML = `
    <section class="surface-intro surface-line workspace-hero">
      <button type="button" class="text-link" data-back-view="workspace">← Back to Workspace</button>
      <p class="eyebrow">Journey creation</p>
      <h2>New journey</h2>
      <p>Describe the field of work in natural language, generate a draft, review the markdown, then create the journey.</p>
    </section>
    <section class="journey-create-panel">
      <form class="journey-create-form" data-journey-draft-form>
        <label>
          <span>Name</span>
          <input name="name" value="${escapeHtml(draft?.name || '')}" placeholder="Customer Discovery" />
        </label>
        <label>
          <span>Description</span>
          <textarea name="description" rows="5" required placeholder="What is this journey, why does it exist, and what conversations should belong here?">${escapeHtml(draft?.description || '')}</textarea>
        </label>
        <label>
          <span>Current focus</span>
          <input name="currentFocus" value="${escapeHtml(draft?.currentFocus || '')}" placeholder="What is active now?" />
        </label>
        <label>
          <span>Stage</span>
          <input name="stage" value="${escapeHtml(draft?.stage || '')}" placeholder="Starting" />
        </label>
        <label>
          <span>Status</span>
          <select name="status">
            ${['active', 'planned', 'paused', 'completed'].map((item) => `<option value="${item}" ${item === status ? 'selected' : ''}>${item}</option>`).join('')}
          </select>
        </label>
        <button type="submit">Generate draft</button>
      </form>
      ${draft ? renderJourneyCreateReview(draft, journeyOptions) : '<p class="empty-state">Generate a draft to review the journey identity before saving.</p>'}
    </section>
  `;
  window.scrollTo({ top: 0 });
}

function renderJourneyCreateReview(draft, journeyOptions = []) {
  return `
    <form class="journey-create-form journey-create-review" data-journey-create-form>
      <label>
        <span>Slug</span>
        <input name="slug" value="${escapeHtml(draft.slug || '')}" required />
      </label>
      <label>
        <span>Project path</span>
        <input name="projectPath" placeholder="/path/to/project" />
      </label>
      <label>
        <span>Icon</span>
        <input name="icon" value="${escapeHtml(draft.icon || '')}" maxlength="8" placeholder="⌁" />
      </label>
      <label>
        <span>Color</span>
        <input name="color" value="${escapeHtml(draft.color || '')}" placeholder="violet" />
      </label>
      ${renderJourneyParentSelect(journeyOptions, draft.slug || '', draft.parentJourney || '')}
      <label class="journey-content-field">
        <span>Journey identity markdown</span>
        <textarea name="content" rows="16" required>${escapeHtml(draft.content || '')}</textarea>
      </label>
      <button type="submit">Create journey</button>
    </form>
  `;
}

async function loadAllConversations({ updateHistory = true } = {}) {
  activeView = 'conversations';
  workspaceSubview = 'conversations';
  selectedWorkspaceJourney = null;
  if (docsPanel) docsPanel.hidden = true;
  currentPath.hidden = true;
  contentGrid.classList.remove('docs-active');
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.view === 'conversations'));
  if (updateHistory) {
    window.history.pushState({ view: 'conversations' }, '', '#conversations');
  }
  const [surface, payload] = await Promise.all([
    fetchJson('/api/surface/workspace'),
    fetchJson('/api/conversations?limit=300'),
  ]);
  content.innerHTML = renderWorkspace(surface, renderAllConversationsContent(payload), 'conversations');
  window.scrollTo({ top: 0 });
}

function renderAllConversationsContent(payload) {
  const groups = groupConversationCardsByDay(payload.cards || []);
  const groupedRows = groups.map((group) => `
    <section class="conversation-day-group">
      <h3>${escapeHtml(group.label)}</h3>
      <div class="global-conversation-list compact">${group.cards.map(renderGlobalConversationRow).join('')}</div>
    </section>
  `).join('');
  return `
    <section class="surface-intro surface-line workspace-hero compact-workspace-hero">
      <p class="eyebrow">Your Moment</p>
      <h2>${escapeHtml(payload.title || 'Conversations')}</h2>
      <p>${escapeHtml(payload.description || '')}</p>
      <span class="readiness-badge">${escapeHtml(payload.count || 0)} shown</span>
    </section>
    <section class="bulk-assignment-panel">
      <form data-bulk-journey-form>
        <label>
          <span>Assign selected to journey</span>
          <select name="journey">${renderJourneySelectOptions(payload.journeys || [], '')}</select>
        </label>
        <button type="submit">Assign selected</button>
        <button type="button" class="danger-action" data-delete-selected-conversations>Delete selected</button>
      </form>
      <small>Select one or more conversations below, choose a journey, then assign, or delete selected conversations.</small>
    </section>
    <section class="workspace-tab-panel active all-conversation-list">
      ${groupedRows || '<p class="empty-state">No conversations found.</p>'}
    </section>
  `;
}

function renderGlobalConversationRow(card) {
  const metadata = card.metadata || {};
  const journey = metadata.journey_name || metadata.journey || 'Unassigned';
  const messageCount = Number(metadata.message_count || 0);
  const messageLabel = messageCount === 1 ? '1 message' : `${messageCount} messages`;
  return `
    <article class="global-conversation-row conversation-card-link" role="button" tabindex="0" data-conversation-card-id="${escapeHtml(card.id)}">
      <label class="bulk-conversation-check global-conversation-check" title="Select conversation">
        <input type="checkbox" data-bulk-conversation-id="${escapeHtml(card.id)}" aria-label="Select conversation ${escapeHtml(card.title || card.id)}" />
      </label>
      <div class="global-conversation-main">
        <h4>${escapeHtml(card.title || card.id)}</h4>
        <p>${escapeHtml(messageLabel)}${metadata.persona ? ` · ${escapeHtml(metadata.persona)}` : ''}${metadata.started_at ? ` · ${escapeHtml(formatDateTime(metadata.started_at))}` : ''}</p>
      </div>
      <span class="conversation-journey-pill ${metadata.journey ? '' : 'muted'}">${escapeHtml(journey)}</span>
    </article>
  `;
}

function groupConversationCardsByDay(cards) {
  const groups = new Map();
  (cards || []).forEach((card) => {
    const label = conversationDayLabel(card.metadata?.started_at);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(card);
  });
  return [...groups.entries()].map(([label, groupCards]) => ({ label, cards: groupCards }));
}

function conversationDayLabel(value) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday - startOfDate) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

async function loadAllJourneys({ updateHistory = true } = {}) {
  activeView = 'journeys';
  workspaceSubview = 'journeys';
  selectedWorkspaceJourney = null;
  if (docsPanel) docsPanel.hidden = true;
  currentPath.hidden = true;
  contentGrid.classList.remove('docs-active');
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.view === 'journeys'));
  if (updateHistory) {
    window.history.pushState({ view: 'journeys' }, '', '#journeys');
  }
  const surface = await fetchJson('/api/surface/workspace');
  const broadFields = hierarchicalJourneyItems(surface.journeys || [], '').map(({ journey, depth, hasChildren }) => {
    if (depth) return '';
    const children = (surface.journeys || []).filter((item) => item.metadata?.parent_journey === journey.id);
    return renderAllJourneyCard(journey, children, hasChildren);
  }).join('');
  const mainContent = `
    <section class="surface-intro surface-line workspace-hero compact-workspace-hero">
      <p class="eyebrow">Your Moment</p>
      <h2>All journeys</h2>
      <p>A broader reading of your journey field, beyond the navigation tree.</p>
    </section>
    <section class="all-journeys-grid">
      ${broadFields || '<p class="empty-state">No journeys found.</p>'}
    </section>
  `;
  content.innerHTML = renderWorkspace(surface, mainContent, 'journeys');
  window.scrollTo({ top: 0 });
}

function renderAllJourneyCard(journey, children) {
  const status = journey.status || 'unknown';
  const childList = (children || []).map((child) => {
    const childStatus = child.status || 'unknown';
    return `<li><span class="journey-status-icon status-${escapeHtml(childStatus)}" title="${escapeHtml(childStatus)}">${escapeHtml(journeyStatusIcon(childStatus))}</span><span>${escapeHtml(child.title)}</span><small>${escapeHtml(childStatus)}</small></li>`;
  }).join('');
  return `
    <article class="all-journey-card ${journey.status !== 'active' ? 'muted' : ''}">
      <div class="all-journey-head">
        <span>${escapeHtml(journey.metadata?.icon || '⌁')}</span>
        <div>
          <h3>${escapeHtml(journey.title)}</h3>
          <p>${escapeHtml(journey.description || 'No description available.')}</p>
        </div>
        <strong class="journey-status-badge status-${escapeHtml(status)}"><span>${escapeHtml(journeyStatusIcon(status))}</span>${escapeHtml(status)}</strong>
      </div>
      ${childList ? `<div class="all-journey-children"><p class="eyebrow">Child journeys</p><ul>${childList}</ul></div>` : ''}
      <button type="button" class="secondary-action all-journey-open" data-workspace-journey="${escapeHtml(journey.id)}">Open journey</button>
    </article>
  `;
}

function journeyStatusIcon(status) {
  return {
    active: '●',
    planned: '○',
    paused: 'Ⅱ',
    completed: '✓',
    archived: '□',
  }[status] || '◇';
}

async function loadUnassignedConversations() {
  activeView = 'workspace';
  const payload = await fetchJson('/api/conversations/unassigned?limit=200');
  const cards = (payload.cards || []).map(renderUnassignedConversationCard).join('');
  content.innerHTML = `
    <section class="surface-intro surface-line workspace-hero">
      <button type="button" class="text-link" data-back-view="workspace">← Back to Workspace</button>
      <p class="eyebrow">Conversation maintenance</p>
      <h2>${escapeHtml(payload.title || 'Unassigned conversations')}</h2>
      <p>${escapeHtml(payload.description || '')}</p>
      <span class="readiness-badge">${escapeHtml(payload.count || 0)} shown</span>
    </section>
    <section class="bulk-assignment-panel">
      <form data-bulk-journey-form>
        <label>
          <span>Assign selected to journey</span>
          <select name="journey">${renderJourneySelectOptions(payload.journeys || [], '')}</select>
        </label>
        <button type="submit">Assign selected</button>
        <button type="button" class="danger-action" data-delete-selected-conversations>Delete selected</button>
      </form>
      <small>Select one or more conversations below, choose a journey, then assign, or delete selected conversations.</small>
    </section>
    <section class="workspace-tab-panel active unassigned-conversation-list">
      ${cards ? `<div class="workspace-list">${cards}</div>` : '<p class="empty-state">No unassigned conversations found.</p>'}
    </section>
  `;
  window.scrollTo({ top: 0 });
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

function renderCurrentSceneTab() {
  return `
    <button type="button" class="workspace-tab active" data-workspace-tab="current-scene">
      Current Scene
    </button>
  `;
}

function renderCurrentSceneTabPanel(scene) {
  const synthesis = scene?.synthesis || {};
  return `
    <section class="workspace-tab-panel active current-scene-tab-panel" data-workspace-panel="current-scene" data-scene-panel data-scene-journey-id="${escapeHtml(scene?.selectedJourneyId || '')}">
      <div class="workspace-section-head">
        <div>
          <p class="eyebrow">current scene</p>
          <h3>Current Scene</h3>
          <p>Orientation for this journey from recent movement signals.</p>
        </div>
      </div>
      <div class="scene-synthesis scene-synthesis-inline ${synthesis.state === 'generated' ? 'generated' : 'fallback'} ${synthesis.outdated ? 'outdated' : ''}" data-scene-synthesis>
        ${renderSceneOrientation(synthesis, { showKicker: false, scope: 'journey' })}
      </div>
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
  const settings = section.metadata?.settings ? renderJourneySettings(section.metadata.settings, section.metadata?.journeyOptions || []) : '';
  const itemCount = content || settings ? '' : `<span class="readiness-badge">${escapeHtml((section.cards || []).length)} items</span>`;
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
      ${content ? `<div class="rendered-content workspace-briefing">${content}</div>` : settings || (cards ? `<div class="workspace-list">${cards}</div>` : `<p class="empty-state">${escapeHtml(section.empty_state || 'Nothing to show yet.')}</p>`)}
    </section>
  `;
}

function renderJourneySettings(settings, journeyOptions = []) {
  const readonly = (settings || []).map((item) => `
    <div class="journey-setting-item">
      <dt>${escapeHtml(item.label)}</dt>
      <dd><code>${escapeHtml(item.value)}</code><small>${escapeHtml(item.description || '')}</small></dd>
    </div>
  `).join('');
  const values = Object.fromEntries((settings || []).map((item) => [item.key, item.value]));
  return `
    <dl class="journey-settings-list">${readonly}</dl>
    <form class="journey-settings-form" data-journey-settings-form data-journey-id="${escapeHtml(values.journeyId || '')}">
      <p class="eyebrow">Edit metadata</p>
      ${renderJourneyParentSelect(journeyOptions, values.journeyId || '', values.parentJourney)}
      ${renderJourneySettingInput('title', 'Journey title', values.title)}
      ${renderJourneyStatusSelect(values.status)}
      ${renderJourneySettingInput('projectPath', 'Project path', values.projectPath)}
      ${renderJourneySettingInput('syncFile', 'Sync file', values.syncFile)}
      ${renderJourneySettingInput('icon', 'Icon', values.icon)}
      ${renderJourneySettingInput('color', 'Color', values.color)}
      <button type="submit">Save journey settings</button>
    </form>
  `;
}

function renderJourneyParentSelect(journeys, journeyId, selected) {
  const safeSelected = selected === 'Not configured' ? '' : selected || '';
  const options = (journeys || [])
    .filter((journey) => journey.id !== journeyId)
    .map((journey) => {
      const value = journey.id || '';
      const label = journey.name || value;
      const status = journey.status && journey.status !== 'active' ? ` · ${journey.status}` : '';
      const prefix = journey.parent_journey ? '↳ ' : '';
      return `<option value="${escapeHtml(value)}" ${value === safeSelected ? 'selected' : ''}>${escapeHtml(prefix + label)} (${escapeHtml(value)}${escapeHtml(status)})</option>`;
    })
    .join('');
  return `
    <label>
      <span>Parent journey</span>
      <select name="parentJourney">
        <option value="" ${safeSelected ? '' : 'selected'}>No parent</option>
        ${options}
      </select>
    </label>
  `;
}

function renderJourneyStatusSelect(selected) {
  const statuses = ['active', 'planned', 'paused', 'completed'];
  const safeSelected = selected || 'active';
  return `
    <label>
      <span>Status</span>
      <select name="status">
        ${statuses.map((status) => `<option value="${escapeHtml(status)}" ${status === safeSelected ? 'selected' : ''}>${escapeHtml(status)}</option>`).join('')}
      </select>
    </label>
  `;
}

function renderJourneySettingInput(name, label, value) {
  const safeValue = value === 'Not configured' ? '' : value || '';
  return `
    <label>
      <span>${escapeHtml(label)}</span>
      <input name="${escapeHtml(name)}" value="${escapeHtml(safeValue)}" maxlength="500" />
    </label>
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
  if (card.kind === 'conversation') return renderConversationCard(card);

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

function renderUnassignedConversationCard(card) {
  return `
    <div class="bulk-conversation-row">
      <label class="bulk-conversation-check" title="Select conversation">
        <input type="checkbox" data-bulk-conversation-id="${escapeHtml(card.id)}" />
      </label>
      ${renderConversationCard(card)}
    </div>
  `;
}

function renderConversationCard(card) {
  const metadata = card.metadata || {};
  const icon = metadata.persona ? '✣' : '☷';
  const started = formatDate(metadata.started_at);
  const messageCount = Number(metadata.message_count || 0);
  const messageLabel = messageCount === 1 ? '1 message' : `${messageCount} messages`;
  const chips = [
    card.id ? `ID: ${card.id}` : null,
    metadata.persona ? `✣ ${metadata.persona}` : null,
    metadata.journey ? `⌁ ${metadata.journey}` : null,
    started ? `◷ ${started}` : null,
  ].filter(Boolean).map((value) => `<span>${escapeHtml(value)}</span>`).join('');
  return `
    <article class="workspace-card conversation-card conversation-card-link" role="button" tabindex="0" data-conversation-card-id="${escapeHtml(card.id)}" aria-label="Open conversation ${escapeHtml(card.title)}">
      <div class="workspace-card-icon conversation-icon" aria-hidden="true">${escapeHtml(icon)}</div>
      <div class="conversation-card-body">
        <div class="conversation-card-head">
          <div>
            <div class="card-meta">Conversation${card.status ? ` · ${escapeHtml(card.status)}` : ''}</div>
            <h4>${escapeHtml(card.title)}</h4>
          </div>
          <strong class="conversation-message-count">${escapeHtml(messageLabel)}</strong>
        </div>
        ${card.description ? `<p>${escapeHtml(card.description)}</p>` : ''}
        ${chips ? `<div class="workspace-card-detail">${chips}</div>` : ''}
      </div>
    </article>
  `;
}

function workspaceCardDetail(card) {
  const metadata = card.metadata || {};
  const values = [];
  if (metadata.journey) values.push(`⌁ ${metadata.journey}`);
  if (metadata.persona) values.push(`✣ ${metadata.persona}`);
  if (metadata.message_count !== undefined) values.push(`☷ ${metadata.message_count} messages`);
  if (metadata.memory_type) values.push(`Type: ${metadata.memory_type}`);
  if (metadata.content_type) values.push(`Type: ${metadata.content_type}`);
  if (metadata.tags) values.push(`Tags: ${metadata.tags}`);
  if (metadata.stage) values.push(`Stage: ${metadata.stage}`);
  if (metadata.due_date) values.push(`Due: ${metadata.due_date}`);
  return values.map((value) => `<span>${escapeHtml(value)}</span>`).join('');
}

async function loadSearchResults(query, { updateHistory = true } = {}) {
  activeView = 'search';
  if (docsPanel) docsPanel.hidden = true;
  currentPath.hidden = true;
  contentGrid.classList.remove('docs-active');
  tabs.forEach((tab) => tab.classList.remove('active'));

  const results = await fetchJson(`/api/surface/search?q=${encodeURIComponent(query)}&perspective=${encodeURIComponent(activeView)}`);
  content.innerHTML = renderSearchResultsPage(results);
  if (updateHistory) {
    window.history.pushState({ view: 'search', query }, '', `#search/${encodeURIComponent(query)}`);
  }
  window.scrollTo({ top: 0 });
}

function renderSearchResultsPage(results) {
  const cards = (results.results || []).map(renderSearchResultCard).join('');
  return `
    <section class="surface-intro surface-line search-hero">
      <p><strong>Search retained memories:</strong> ${escapeHtml(results.query || 'Type a query to search recent memory context.')}</p>
    </section>
    ${cards ? `<div class="workspace-list memory-result-list">${cards}</div>` : `<p class="empty-state">${escapeHtml(results.empty_state || 'No results available yet.')}</p>`}
  `;
}

async function loadMemoryCategory(category, { updateHistory = true } = {}) {
  activeView = 'memories';
  if (docsPanel) docsPanel.hidden = true;
  currentPath.hidden = true;
  contentGrid.classList.remove('docs-active');
  tabs.forEach((tab) => tab.classList.remove('active'));

  const results = await fetchJson(`/api/surface/memories?category=${encodeURIComponent(category)}`);
  content.innerHTML = renderMemoryCategoryPage(results);
  if (updateHistory) {
    window.history.pushState({ view: 'memory-category', category }, '', `#memories/${category}`);
  }
  window.scrollTo({ top: 0 });
}

function renderMemoryCategoryPage(results) {
  const cards = (results.results || []).map(renderSearchResultCard).join('');
  return `
    <button type="button" class="text-link detail-back" data-back-view="atlas">← Back to Identity Map</button>
    <section class="surface-intro surface-line memories-hero">
      <p><strong>${escapeHtml(results.query)} memories:</strong> Recent retained context from this memory category.</p>
    </section>
    ${cards ? `<div class="workspace-list memory-result-list">${cards}</div>` : `<p class="empty-state">${escapeHtml(results.empty_state || 'No memories are available yet.')}</p>`}
  `;
}

function renderSearchResultCard(result) {
  const metadata = result.metadata || {};
  const detail = [metadata.memory_type, metadata.layer, metadata.journey, metadata.persona].filter(Boolean);
  const description = result.description || '';
  const renderedDescription = metadata.memory_type === 'journal' && looksLikeMarkdown(description)
    ? `<div class="rendered-content memory-card-markdown">${renderDetailContent(description)}</div>`
    : `<p>${escapeHtml(description)}</p>`;
  return `
    <article class="workspace-card memory-result-card" role="button" tabindex="0" data-object-kind="${escapeHtml(result.kind)}" data-object-id="${escapeHtml(result.id)}">
      <div class="workspace-card-icon" aria-hidden="true">${escapeHtml(metadata.icon || '◫')}</div>
      <div>
        <div class="card-meta">${escapeHtml(detail.join(' · ') || result.kind)}</div>
        <h4>${escapeHtml(result.title)}</h4>
        ${renderedDescription}
      </div>
    </article>
  `;
}

async function loadConversation(id, { updateHistory = true } = {}) {
  activeView = 'conversation';
  if (docsPanel) docsPanel.hidden = true;
  currentPath.hidden = true;
  contentGrid.classList.remove('docs-active');
  tabs.forEach((tab) => tab.classList.remove('active'));
  const response = await fetch(`/api/conversations/detail?id=${encodeURIComponent(id)}`);
  const detail = await response.json();
  if (!response.ok) {
    content.innerHTML = renderConversationError(detail.error || 'Conversation not found');
    return;
  }
  content.innerHTML = renderConversationDetail(detail);
  if (updateHistory) {
    window.history.pushState({ view: 'conversation', id }, '', `#conversation/${encodeURIComponent(id)}`);
  }
  window.scrollTo({ top: 0 });
}

function renderConversationError(message) {
  return `
    <section class="surface-intro">
      <button type="button" class="text-link" data-back-view="workspace">← Back to Workspace</button>
      <p class="eyebrow">Conversation</p>
      <h2>Conversation not found</h2>
      <p>${escapeHtml(message)}</p>
    </section>
  `;
}

function renderConversationDetail(detail) {
  const chips = [
    detail.interface ? `Interface: ${detail.interface}` : null,
    detail.status ? `Status: ${detail.status}` : null,
    detail.journey ? `Journey: ${detail.journey}` : null,
    detail.persona ? `Persona: ${detail.persona}` : null,
    detail.startedAt ? `Started: ${formatDateTime(detail.startedAt)}` : null,
    detail.endedAt ? `Ended: ${formatDateTime(detail.endedAt)}` : null,
  ].filter(Boolean).map((value) => `<span>${escapeHtml(value)}</span>`).join('');
  const messages = (detail.messages || []).map(renderConversationMessage).join('');
  const journeyOptions = renderConversationJourneyOptions(detail);
  const count = Number(detail.messageCount || 0);
  const countLabel = count === 1 ? '1 message' : `${count} messages`;
  return `
    <button type="button" class="text-link detail-back" data-back-view="workspace">← Back to Workspace</button>
    <section class="conversation-detail" data-conversation-detail-id="${escapeHtml(detail.id)}">
      <header class="conversation-detail-head">
        <p class="concept-kicker">Conversation transcript</p>
        <h2>${escapeHtml(detail.title || detail.id)}</h2>
        <p>${escapeHtml(detail.description || countLabel)}</p>
        ${chips ? `<div class="workspace-card-detail">${chips}</div>` : ''}
        <div class="conversation-title-actions conversation-delete-actions">
          <button type="button" class="danger-action" data-delete-conversation="${escapeHtml(detail.id)}">Delete conversation</button>
        </div>
        <section class="conversation-maintenance" data-metadata-maintenance data-conversation-id="${escapeHtml(detail.id)}">
          <p class="eyebrow">Metadata maintenance</p>
          <p>Check whether this conversation needs metadata updates before making any changes.</p>
          <div class="conversation-title-actions">
            <button type="button" class="secondary-action" data-metadata-preview>Check if metadata needs updating</button>
          </div>
          <div class="metadata-maintenance-report" data-metadata-report hidden></div>
          <div class="conversation-title-actions" data-metadata-apply-actions hidden>
            <button type="button" class="secondary-action" data-metadata-apply>Apply metadata update</button>
          </div>
        </section>
      </header>
      <section class="conversation-title-section">
        <p class="eyebrow">Journey</p>
        <form class="conversation-journey-form" data-conversation-journey-form data-conversation-id="${escapeHtml(detail.id)}">
          <label>
            <span>Conversation journey</span>
            <select name="journey">${journeyOptions}</select>
          </label>
          <div class="conversation-title-actions">
            <button type="submit">Save journey</button>
          </div>
        </form>
      </section>
      <section class="conversation-title-section">
        <p class="eyebrow">Title</p>
        <form class="conversation-title-form" data-conversation-title-form data-conversation-id="${escapeHtml(detail.id)}">
          <label>
            <span>Conversation title</span>
            <input name="title" value="${escapeHtml(detail.rawTitle || '')}" maxlength="160" required />
          </label>
          <div class="conversation-title-actions">
            <button type="submit">Save title</button>
            <button type="button" class="secondary-action" data-suggest-title>Suggest title</button>
          </div>
          <div class="title-suggestion" data-title-suggestion hidden></div>
        </form>
      </section>
      <section class="conversation-summary">
        <p class="eyebrow">Summary</p>
        <form class="conversation-summary-form" data-conversation-summary-form data-conversation-id="${escapeHtml(detail.id)}">
          <label>
            <span>Conversation summary</span>
            <textarea name="summary" rows="5" maxlength="1000">${escapeHtml(detail.summary || '')}</textarea>
          </label>
          <div class="conversation-title-actions">
            <button type="submit">Save summary</button>
            <button type="button" class="secondary-action" data-suggest-summary>Suggest summary</button>
          </div>
          <div class="summary-suggestion" data-summary-suggestion hidden></div>
        </form>
      </section>
      <section class="conversation-tags-section">
        <p class="eyebrow">Tags</p>
        <form class="conversation-tags-form" data-conversation-tags-form data-conversation-id="${escapeHtml(detail.id)}">
          <label>
            <span>Conversation tags</span>
            <input name="tags" value="${escapeHtml((detail.tags || []).join(', '))}" placeholder="metadata, conversation" />
          </label>
          <div class="conversation-title-actions">
            <button type="submit">Save tags</button>
          </div>
        </form>
      </section>
      <section class="conversation-transcript" aria-label="Conversation messages">
        <div class="conversation-transcript-head">
          <p class="eyebrow">Transcript</p>
          <strong>${escapeHtml(countLabel)}</strong>
        </div>
        ${messages || '<p class="empty-state">No messages are stored for this conversation yet.</p>'}
      </section>
    </section>
  `;
}

function selectedBulkConversationIds() {
  return Array.from(content.querySelectorAll('[data-bulk-conversation-id]:checked'))
    .map((input) => input.dataset.bulkConversationId)
    .filter(Boolean);
}

async function deleteConversations(conversationIds) {
  return fetchJson('/api/conversations/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationIds }),
  });
}

async function deleteConversationTurn(conversationId, userMessageId) {
  return fetchJson('/api/conversations/delete-turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, userMessageId }),
  });
}

async function reloadCurrentBulkConversationView() {
  if (content.querySelector('.all-conversation-list')) {
    await loadAllConversations({ updateHistory: false });
    return;
  }
  await loadUnassignedConversations();
}

function renderConversationJourneyOptions(detail) {
  return `<option value="" ${detail.journey ? '' : 'selected'}>Unassigned</option>${renderJourneySelectOptions(detail.journeys || [], detail.journey || '')}`;
}

function renderJourneySelectOptions(journeys, selected = '') {
  return (journeys || []).map((journey) => {
    const value = journey.id || '';
    const label = journey.name || value;
    const status = journey.status && journey.status !== 'active' ? ` · ${journey.status}` : '';
    const prefix = journey.parent_journey ? '↳ ' : '';
    return `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(prefix + label)} (${escapeHtml(value)}${escapeHtml(status)})</option>`;
  }).join('');
}

function renderConversationMessage(message) {
  const role = message.role || 'unknown';
  const roleLabel = conversationRoleLabel(role);
  const deleteTurn = message.turnDeletable
    ? `<button type="button" class="danger-action subtle-danger" data-delete-turn-message="${escapeHtml(message.id)}">Delete turn</button>`
    : '';
  return `
    <article class="conversation-message role-${escapeHtml(role)}" data-message-id="${escapeHtml(message.id)}" ${message.turnId ? `data-turn-id="${escapeHtml(message.turnId)}"` : ''}>
      <div class="conversation-message-meta">
        <strong>${escapeHtml(roleLabel)}</strong>
        <span>${escapeHtml(formatDateTime(message.createdAt))}</span>
        ${message.tokenCount ? `<span>${escapeHtml(message.tokenCount)} tokens</span>` : ''}
        ${deleteTurn}
      </div>
      <div class="conversation-message-content">${renderPlainTranscript(message.content || '')}</div>
    </article>
  `;
}

function conversationRoleLabel(role) {
  if (role === 'assistant') return 'Mirror';
  if (role === 'user') return shellState?.profile?.displayName || shellState?.mirror?.name || 'User';
  return role;
}

function renderPlainTranscript(content) {
  return `<pre>${escapeHtml(content)}</pre>`;
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
  if (link.kind === 'conversation' && link.id) {
    return `<button type="button" class="relationship-pill" data-conversation-link-id="${escapeHtml(link.id)}">${escapeHtml(link.label)}</button>`;
  }
  if (link.kind === 'journey' && link.id) {
    return `<button type="button" class="relationship-pill" data-workspace-journey="${escapeHtml(link.id)}">${escapeHtml(link.label)}</button>`;
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
    blocks.push(`<p>${renderInlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push(`<ul>${list.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ul>`);
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

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
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
    || /(^|\n)>\s?\S/.test(content)
    || /(^|\n)```/.test(content);
}

function renderInlineMarkdown(text) {
  return escapeHtml(text).replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
    const safeHref = String(href || '');
    const conversationMatch = safeHref.match(/^mirror:\/\/conversation\/([^/]+)$/);
    if (conversationMatch) {
      return `<button type="button" class="inline-link" data-conversation-link-id="${escapeHtml(conversationMatch[1])}">${label}</button>`;
    }
    const allowed = safeHref.startsWith('#') || safeHref.startsWith('/');
    if (!allowed) return label;
    return `<a href="${escapeHtml(safeHref)}">${label}</a>`;
  });
}

function objectTargetFromHref(href) {
  const match = String(href || '').match(/^\/objects\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { kind: decodeURIComponent(match[1]), id: decodeURIComponent(match[2]) };
}

function renderMemoryCategory(card) {
  const category = String(card.id || '').replace(/^memory-category:/, '');
  const count = Number(card.count ?? 0);
  const countLabel = count === 1 ? '1 memory' : `${count} memories`;
  return `
    <button type="button" class="memory-type" data-memory-category="${escapeHtml(category)}">
      <span class="memory-type-head">
        <span class="memory-type-icon" aria-hidden="true">${escapeHtml(card.metadata?.icon || '◫')}</span>
        <span>${escapeHtml(card.title)}</span>
        <strong>${escapeHtml(countLabel)}</strong>
      </span>
      <span class="memory-intensity intensity-${escapeHtml(String(card.metadata?.intensity || 'Low').toLowerCase())}">${escapeHtml(card.metadata?.intensity || 'Low')} presence</span>
    </button>
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

async function openDocReference(reference) {
  const [path, rawHash] = String(reference || '').split('#');
  if (!path) return;
  activeView = 'docs';
  if (docsPanel) docsPanel.hidden = false;
  currentPath.hidden = true;
  contentGrid.classList.add('docs-active');
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.view === 'docs'));
  window.history.pushState({ view: 'docs', path, hash: rawHash || null }, '', '#docs');
  await renderDocsFrame();
  await loadDoc(path, { replace: true });
  if (rawHash) {
    document.querySelector(`#${CSS.escape(rawHash)}`)?.scrollIntoView();
  }
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

  const conversationLinkTarget = event.target.closest('[data-conversation-link-id]');
  if (conversationLinkTarget) {
    event.preventDefault();
    await loadConversation(conversationLinkTarget.dataset.conversationLinkId);
    return;
  }

  const conversationTarget = event.target.closest('[data-conversation-card-id]');
  if (conversationTarget && !event.target.closest('input, select, button, label')) {
    event.preventDefault();
    await loadConversation(conversationTarget.dataset.conversationCardId);
    return;
  }

  const deleteSelectedTarget = event.target.closest('[data-delete-selected-conversations]');
  if (deleteSelectedTarget) {
    event.preventDefault();
    const conversationIds = selectedBulkConversationIds();
    if (!conversationIds.length) {
      showWarning('Select at least one conversation.');
      return;
    }
    if (!window.confirm(`Delete ${conversationIds.length} selected conversation(s)? This cannot be undone.`)) return;
    const result = await deleteConversations(conversationIds);
    showWarning(`Deleted ${result.deletedCount} conversation(s).`);
    await reloadCurrentBulkConversationView();
    return;
  }

  const deleteTurnTarget = event.target.closest('[data-delete-turn-message]');
  if (deleteTurnTarget) {
    event.preventDefault();
    const conversationEl = deleteTurnTarget.closest('[data-conversation-detail-id]');
    const conversationId = conversationEl?.dataset.conversationDetailId;
    const messageId = deleteTurnTarget.dataset.deleteTurnMessage;
    if (!conversationId || !messageId) return;
    if (!window.confirm('Delete this full turn, including the user message and the following Mirror response?')) return;
    const result = await deleteConversationTurn(conversationId, messageId);
    showWarning(`Deleted ${result.deletedCount} message(s) from this turn.`);
    if (result.conversation) {
      content.innerHTML = renderConversationDetail(result.conversation);
    } else {
      await loadConversation(conversationId, { updateHistory: false });
    }
    return;
  }

  const deleteConversationTarget = event.target.closest('[data-delete-conversation]');
  if (deleteConversationTarget) {
    event.preventDefault();
    const conversationId = deleteConversationTarget.dataset.deleteConversation;
    if (!conversationId) return;
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
    await deleteConversations([conversationId]);
    showWarning('Conversation deleted.');
    await showView('workspace', { updateHash: true });
    return;
  }

  const sceneSynthesisTarget = event.target.closest('[data-generate-scene-synthesis]');
  if (sceneSynthesisTarget) {
    event.preventDefault();
    await generateSceneSynthesis(sceneSynthesisTarget.closest('[data-scene-panel]'));
    return;
  }

  const globalSceneTarget = event.target.closest('[data-global-scene]');
  if (globalSceneTarget) {
    event.preventDefault();
    selectedWorkspaceJourney = null;
    workspaceSubview = 'scene';
    await showView('workspace', { updateHash: true });
    return;
  }

  const allConversationsTarget = event.target.closest('[data-all-conversations]');
  if (allConversationsTarget) {
    event.preventDefault();
    await loadAllConversations();
    return;
  }

  const allJourneysTarget = event.target.closest('[data-all-journeys]');
  if (allJourneysTarget) {
    event.preventDefault();
    await loadAllJourneys();
    return;
  }

  const journeyParentToggle = event.target.closest('[data-toggle-journey-parent]');
  if (journeyParentToggle) {
    event.preventDefault();
    const parentId = journeyParentToggle.dataset.toggleJourneyParent;
    if (expandedJourneyParents.has(parentId)) expandedJourneyParents.delete(parentId);
    else expandedJourneyParents.add(parentId);
    sessionStorage.setItem('expandedJourneyParents', JSON.stringify([...expandedJourneyParents]));
    await showView('workspace', { updateHash: false });
    return;
  }

  const completedToggleTarget = event.target.closest('[data-toggle-completed-journeys]');
  if (completedToggleTarget) {
    event.preventDefault();
    showCompletedJourneys = !showCompletedJourneys;
    await showView('workspace', { updateHash: false });
    return;
  }

  const newJourneyTarget = event.target.closest('[data-new-journey]');
  if (newJourneyTarget) {
    event.preventDefault();
    await loadNewJourneyForm();
    return;
  }

  const unassignedTarget = event.target.closest('[data-unassigned-conversations]');
  if (unassignedTarget) {
    event.preventDefault();
    await loadUnassignedConversations();
    return;
  }

  const journeyTarget = event.target.closest('[data-workspace-journey]');
  if (journeyTarget) {
    event.preventDefault();
    selectedWorkspaceJourney = journeyTarget.dataset.workspaceJourney;
    workspaceSubview = 'journey';
    await showView('workspace', { updateHash: false });
    return;
  }

  const tabTarget = event.target.closest('[data-workspace-tab]');
  if (tabTarget) {
    event.preventDefault();
    showWorkspaceTab(tabTarget.dataset.workspaceTab);
    return;
  }

  const configurationTab = event.target.closest('[data-configuration-tab]');
  if (configurationTab) {
    event.preventDefault();
    showConfigurationTab(configurationTab.dataset.configurationTab);
    return;
  }

  const docReferenceTarget = event.target.closest('[data-doc-reference]');
  if (docReferenceTarget) {
    event.preventDefault();
    await openDocReference(docReferenceTarget.dataset.docReference);
    return;
  }

  const memoryCategoryTarget = event.target.closest('[data-memory-category]');
  if (memoryCategoryTarget) {
    event.preventDefault();
    await loadMemoryCategory(memoryCategoryTarget.dataset.memoryCategory);
    return;
  }

  const suggestTitleTarget = event.target.closest('[data-suggest-title]');
  if (suggestTitleTarget) {
    event.preventDefault();
    await suggestConversationTitle(suggestTitleTarget.closest('[data-conversation-title-form]'));
    return;
  }

  const suggestSummaryTarget = event.target.closest('[data-suggest-summary]');
  if (suggestSummaryTarget) {
    event.preventDefault();
    await suggestConversationSummary(suggestSummaryTarget.closest('[data-conversation-summary-form]'));
    return;
  }

  const useSummarySuggestionTarget = event.target.closest('[data-use-summary-suggestion]');
  if (useSummarySuggestionTarget) {
    event.preventDefault();
    const form = useSummarySuggestionTarget.closest('[data-conversation-summary-form]');
    const input = form?.querySelector('textarea[name="summary"]');
    if (input) input.value = useSummarySuggestionTarget.dataset.useSummarySuggestion || '';
    return;
  }

  const useTitleSuggestionTarget = event.target.closest('[data-use-title-suggestion]');
  if (useTitleSuggestionTarget) {
    event.preventDefault();
    const form = useTitleSuggestionTarget.closest('[data-conversation-title-form]');
    const input = form?.querySelector('input[name="title"]');
    if (input) input.value = useTitleSuggestionTarget.dataset.useTitleSuggestion || '';
    return;
  }

  const metadataPreviewTarget = event.target.closest('[data-metadata-preview]');
  if (metadataPreviewTarget) {
    event.preventDefault();
    await previewConversationMetadata(metadataPreviewTarget.closest('[data-metadata-maintenance]'));
    return;
  }

  const metadataApplyTarget = event.target.closest('[data-metadata-apply]');
  if (metadataApplyTarget) {
    event.preventDefault();
    await applyConversationMetadata(metadataApplyTarget.closest('[data-metadata-maintenance]'));
    return;
  }

  const operationViewRun = event.target.closest('[data-operation-view-run]');
  if (operationViewRun && !event.target.closest('button')) {
    event.preventDefault();
    try {
      const run = await fetchJson(`/api/operations/runs/${encodeURIComponent(operationViewRun.dataset.operationViewRun)}`);
      showRunConsole(operationRunToResult(run), catalogOperationById(run.operationId));
    } catch (error) {
      showWarning(String(error.message || error));
    }
    return;
  }

  const runTab = event.target.closest('[data-run-tab]');
  if (runTab) {
    event.preventDefault();
    const tabName = runTab.dataset.runTab;
    document.querySelectorAll('[data-run-tab]').forEach((tab) => {
      const active = tab.dataset.runTab === tabName;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-run-panel]').forEach((panel) => {
      const active = panel.dataset.runPanel === tabName;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
    return;
  }

  const operationApprove = event.target.closest('[data-operation-approve]');
  if (operationApprove) {
    event.preventDefault();
    try {
      const approved = await fetchJson(`/api/operations/runs/${encodeURIComponent(operationApprove.dataset.operationApprove)}/approve`, { method: 'POST' });
      showWarning('Operation approved. Watching progress…');
      showRunConsole(operationRunToResult(approved), catalogOperationById(approved.operationId));
      await pollRunConsole(approved.id);
    } catch (error) {
      showWarning(String(error.message || error));
    }
    return;
  }

  const operationCancel = event.target.closest('[data-operation-cancel]');
  if (operationCancel) {
    event.preventDefault();
    try {
      const cancelled = await fetchJson(`/api/operations/runs/${encodeURIComponent(operationCancel.dataset.operationCancel)}/cancel`, { method: 'POST' });
      showWarning('Cancellation requested.');
      showRunConsole(operationRunToResult(cancelled), catalogOperationById(cancelled.operationId));
    } catch (error) {
      showWarning(String(error.message || error));
    }
    return;
  }

  const operationOpenTarget = event.target.closest('[data-operation-open]');
  if (operationOpenTarget) {
    event.preventDefault();
    await renderOperations(null, operationOpenTarget.dataset.operationOpen || null);
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
  if (isEditableTarget(event.target)) return;
  if (!['Enter', ' '].includes(event.key)) return;

  const conversationTarget = event.target.closest('[data-conversation-card-id]');
  if (conversationTarget) {
    event.preventDefault();
    await loadConversation(conversationTarget.dataset.conversationCardId);
    return;
  }

  const runTarget = event.target.closest('[data-operation-view-run]');
  if (runTarget) {
    event.preventDefault();
    const run = await fetchJson(`/api/operations/runs/${encodeURIComponent(runTarget.dataset.operationViewRun)}`);
    showRunConsole(operationRunToResult(run), catalogOperationById(run.operationId));
    return;
  }

  const objectTarget = event.target.closest('[data-object-kind][data-object-id]');
  if (!objectTarget) return;
  event.preventDefault();
  await loadObject(objectTarget.dataset.objectKind, objectTarget.dataset.objectId);
});

document.querySelectorAll('[data-choose]').forEach((button) => {
  button.addEventListener('click', () => chooseDefault(button.dataset.choose));
});

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    showView(tab.dataset.view);
  });
});

mirrorSelector?.addEventListener('click', async (event) => {
  const option = event.target.closest('[data-mirror-name]');
  if (!option || option.disabled) return;
  event.preventDefault();
  await selectMirror(option.dataset.mirrorName);
});

async function previewConversationMetadata(section) {
  if (!section) return;
  const reportBox = section.querySelector('[data-metadata-report]');
  if (reportBox) {
    reportBox.hidden = false;
    reportBox.innerHTML = '<p>Running metadata lifecycle preview…</p>';
  }
  try {
    const report = await fetchJson('/api/conversations/metadata-lifecycle-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: section.dataset.conversationId }),
    });
    if (reportBox) reportBox.innerHTML = renderMetadataLifecycleReport(report);
    const applyActions = section.querySelector('[data-metadata-apply-actions]');
    if (applyActions) applyActions.hidden = false;
  } catch (error) {
    if (reportBox) reportBox.innerHTML = `<p>${escapeHtml(String(error.message || error))}</p>`;
  }
}

async function applyConversationMetadata(section) {
  if (!section) return;
  const reportBox = section.querySelector('[data-metadata-report]');
  const applyButton = section.querySelector('[data-metadata-apply]');
  if (applyButton) {
    applyButton.disabled = true;
    applyButton.textContent = 'Updating metadata…';
  }
  if (reportBox) {
    reportBox.hidden = false;
    reportBox.innerHTML = '<p class="metadata-loading">Updating metadata. I may need a moment to generate title, summary, or tags…</p>';
  }
  try {
    const result = await fetchJson('/api/conversations/metadata-lifecycle-apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: section.dataset.conversationId,
      }),
    });
    content.innerHTML = renderConversationDetail(result.conversation);
    const nextReportBox = content.querySelector('[data-metadata-report]');
    if (nextReportBox) {
      nextReportBox.hidden = false;
      nextReportBox.innerHTML = renderMetadataLifecycleReport(result.report);
    }
    showWarning(result.report?.mutated ? 'Metadata update applied.' : 'No metadata changes applied.');
  } catch (error) {
    if (applyButton) {
      applyButton.disabled = false;
      applyButton.textContent = 'Apply metadata update';
    }
    if (reportBox) reportBox.innerHTML = `<p>${escapeHtml(String(error.message || error))}</p>`;
  }
}

function renderMetadataLifecycleReport(report) {
  const fields = report.fields || report.dry_run?.fields || {};
  const didChange = Boolean(report.mutated);
  const fieldRows = Object.entries(fields).map(([name, field]) => {
    const status = metadataFieldStatus(field.decision);
    return `
      <li class="metadata-field metadata-field-${escapeHtml(status.kind)}">
        <div class="metadata-field-head">
          <strong>${escapeHtml(metadataFieldLabel(name))}</strong>
          <span class="metadata-status-badge">${escapeHtml(status.label)}</span>
        </div>
        <span>${escapeHtml(metadataDecisionCopy(field.decision, name, field.reason))}</span>
        ${field.reason ? `<small>${escapeHtml(metadataReasonCopy(field.reason))}</small>` : ''}
      </li>
    `;
  }).join('');
  const changedRows = report.changed ? Object.entries(report.changed).map(([name, value]) => `
    <li><strong>${escapeHtml(metadataFieldLabel(name))}</strong>: ${escapeHtml(Array.isArray(value) ? value.join(', ') : String(value))}</li>
  `).join('') : '';
  const skippedRows = report.skipped ? Object.entries(report.skipped).map(([name, reason]) => `
    <li><strong>${escapeHtml(metadataFieldLabel(name))}</strong>: ${escapeHtml(metadataSkipCopy(reason))}</li>
  `).join('') : '';
  return `
    <article class="operation-result-card">
      <p class="eyebrow">Conversation metadata</p>
      <h3>${didChange ? 'I updated this conversation.' : 'I checked this conversation.'}</h3>
      <p>${didChange ? 'Here is what changed and what I left untouched.' : 'No changes were made. Here is what I would do right now.'}</p>
      ${fieldRows ? `<ul>${fieldRows}</ul>` : ''}
      ${changedRows ? `<p><strong>I updated</strong></p><ul>${changedRows}</ul>` : ''}
      ${skippedRows ? `<p><strong>I left untouched</strong></p><ul>${skippedRows}</ul>` : ''}
    </article>
  `;
}

function metadataFieldStatus(decision) {
  if (['create', 'repair'].includes(decision)) return { kind: 'will-update', label: 'Will update' };
  if (decision === 'refine_candidate') return { kind: 'review', label: 'Review suggested' };
  if (['keep', 'preserve'].includes(decision)) return { kind: 'unchanged', label: 'No change' };
  if (decision === 'defer') return { kind: 'defer', label: 'Not ready' };
  return { kind: 'unknown', label: 'Check' };
}

function metadataFieldLabel(name) {
  if (name === 'title') return 'Title';
  if (name === 'summary') return 'Summary';
  if (name === 'tags') return 'Tags';
  return name;
}

function metadataDecisionCopy(decision, fieldName = '', reason = '') {
  if (decision === 'refine_candidate' && fieldName === 'title') {
    return 'I found a possible improvement, but I will not apply it automatically. Use “Suggest title” below if you want me to propose a better title.';
  }
  if (decision === 'refine_candidate' && fieldName === 'summary') {
    return 'I found a possible better summary, but I will not replace it automatically. Use “Suggest summary” below if you want me to propose a better summary.';
  }
  if (decision === 'defer' && fieldName === 'tags') {
    return 'I need more usable conversation substance before I create tags.';
  }
  const copy = {
    repair: 'I can improve this now.',
    create: 'I can create this now.',
    keep: 'This already looks good.',
    preserve: 'I will preserve your manual edit.',
    defer: 'I need more conversation context first.',
    refine_candidate: 'I found a possible improvement, but I will not apply it automatically.',
  };
  return copy[decision] || 'I am not sure what to do with this yet.';
}

function metadataReasonCopy(reason) {
  const copy = {
    'conversation has no title': 'This conversation does not have a title yet.',
    'current title is provisional or weak': 'The current title still looks provisional.',
    'conversation needs at least one user and one assistant message': 'I need at least one exchange before I can judge the title.',
    'later evidence is more specific than the current unlocked title': 'Later messages are more specific than the current title.',
    'conversation has enough later context for coherence refinement': 'There is enough later context to revisit the title.',
    'current title appears usable': 'The current title is usable.',
    'manual title lock is preserved': 'You edited this manually, so I will not overwrite it.',
    'stored summary needs editorial refinement': 'The current summary looks too much like raw transcript text. A good summary should be one or two clean paragraphs, without Markdown, bullets, paths, or copied message fragments.',
    'summary already exists': 'A summary already exists.',
    'conversation has enough substance for a summary': 'There is enough conversation substance for a useful summary.',
    'summary needs more conversation substance': 'There is not enough substance for a useful summary yet.',
    'tags already exist': 'Tags already exist for this conversation.',
    'summary-level substance is available for tags': 'There is enough conversation substance to create tags.',
    'conversation has enough substance for tags': 'There is enough conversation substance to create tags.',
    'summary needs review before tags': 'There is enough conversation substance to create tags.',
    'tags need more conversation substance': 'I need more conversation substance before creating tags.',
  };
  return copy[reason] || reason;
}

function metadataSkipCopy(reason) {
  const copy = {
    no_value_provided: 'No new value was provided.',
    manual_lock_preserved: 'You edited this manually, so I preserved it.',
    candidate_decision_requires_explicit_review: 'This needs explicit human review before changing.',
    decision_defer_not_applied: 'Not enough context yet.',
    decision_keep_not_applied: 'It already looks good.',
    decision_preserve_not_applied: 'It is protected from automatic changes.',
    blank_value: 'The provided value was blank.',
  };
  return copy[reason] || reason;
}

async function suggestConversationSummary(form) {
  if (!form) return;
  const suggestionBox = form.querySelector('[data-summary-suggestion]');
  if (suggestionBox) {
    suggestionBox.hidden = false;
    suggestionBox.innerHTML = '<p>Generating a summary suggestion…</p>';
  }
  try {
    const result = await fetchJson('/api/conversations/summary-suggestion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: form.dataset.conversationId }),
    });
    const suggestion = result.suggestedSummary || '';
    if (suggestionBox) {
      suggestionBox.innerHTML = `
        <p>${escapeHtml(suggestion)}</p>
        <button type="button" class="secondary-action" data-use-summary-suggestion="${escapeHtml(suggestion)}">Use suggestion</button>
        <small>Suggestion only. It is not saved until you click Save summary.</small>
      `;
    }
  } catch (error) {
    if (suggestionBox) suggestionBox.innerHTML = `<p>${escapeHtml(String(error.message || error))}</p>`;
  }
}

async function suggestConversationTitle(form) {
  if (!form) return;
  const suggestionBox = form.querySelector('[data-title-suggestion]');
  if (suggestionBox) {
    suggestionBox.hidden = false;
    suggestionBox.innerHTML = '<p>Generating a title suggestion…</p>';
  }
  try {
    const result = await fetchJson('/api/conversations/title-suggestion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: form.dataset.conversationId }),
    });
    const suggestion = result.suggestedTitle || '';
    if (suggestionBox) {
      suggestionBox.innerHTML = `
        <p><strong>${escapeHtml(suggestion)}</strong></p>
        <button type="button" class="secondary-action" data-use-title-suggestion="${escapeHtml(suggestion)}">Use suggestion</button>
        <small>Suggestion only. It is not saved until you click Save title.</small>
      `;
    }
  } catch (error) {
    if (suggestionBox) suggestionBox.innerHTML = `<p>${escapeHtml(String(error.message || error))}</p>`;
  }
}

content.addEventListener('submit', async (event) => {
  const journeyDraftForm = event.target.closest('[data-journey-draft-form]');
  if (journeyDraftForm) {
    event.preventDefault();
    const data = new FormData(journeyDraftForm);
    const draft = await fetchJson('/api/journeys/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: String(data.get('name') || ''),
        description: String(data.get('description') || ''),
        currentFocus: String(data.get('currentFocus') || ''),
        stage: String(data.get('stage') || ''),
        status: String(data.get('status') || 'active'),
      }),
    });
    await loadNewJourneyForm(draft);
    showWarning('Journey draft generated. Review before creating.');
    return;
  }

  const journeyCreateForm = event.target.closest('[data-journey-create-form]');
  if (journeyCreateForm) {
    event.preventDefault();
    const data = new FormData(journeyCreateForm);
    const result = await fetchJson('/api/journeys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: String(data.get('slug') || ''),
        content: String(data.get('content') || ''),
        projectPath: String(data.get('projectPath') || ''),
        icon: String(data.get('icon') || ''),
        color: String(data.get('color') || ''),
        parentJourney: String(data.get('parentJourney') || ''),
      }),
    });
    selectedWorkspaceJourney = result.journeyId;
    showWarning(`Journey created: ${result.journeyId}.`);
    await showView('workspace', { updateHash: true });
    return;
  }

  const summaryForm = event.target.closest('[data-conversation-summary-form]');
  if (summaryForm) {
    event.preventDefault();
    const data = new FormData(summaryForm);
    const detail = await fetchJson('/api/conversations/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: summaryForm.dataset.conversationId,
        summary: String(data.get('summary') || ''),
      }),
    });
    content.innerHTML = renderConversationDetail(detail);
    showWarning('Conversation summary saved.');
    return;
  }

  const tagsForm = event.target.closest('[data-conversation-tags-form]');
  if (tagsForm) {
    event.preventDefault();
    const data = new FormData(tagsForm);
    const detail = await fetchJson('/api/conversations/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: tagsForm.dataset.conversationId,
        tags: String(data.get('tags') || ''),
      }),
    });
    content.innerHTML = renderConversationDetail(detail);
    showWarning('Conversation tags saved.');
    return;
  }

  const bulkJourneyForm = event.target.closest('[data-bulk-journey-form]');
  if (bulkJourneyForm) {
    event.preventDefault();
    const data = new FormData(bulkJourneyForm);
    const conversationIds = selectedBulkConversationIds();
    if (!conversationIds.length) {
      showWarning('Select at least one conversation.');
      return;
    }
    const journey = String(data.get('journey') || '');
    if (!journey) {
      showWarning('Choose a journey.');
      return;
    }
    const result = await fetchJson('/api/conversations/journey-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationIds, journey }),
    });
    showWarning(`Assigned ${result.updatedCount} conversation(s) to ${result.journey}.`);
    await reloadCurrentBulkConversationView();
    return;
  }

  const journeyForm = event.target.closest('[data-conversation-journey-form]');
  if (journeyForm) {
    event.preventDefault();
    const data = new FormData(journeyForm);
    const detail = await fetchJson('/api/conversations/journey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: journeyForm.dataset.conversationId,
        journey: String(data.get('journey') || ''),
      }),
    });
    content.innerHTML = renderConversationDetail(detail);
    showWarning(detail.journey ? `Conversation moved to ${detail.journey}.` : 'Conversation marked unassigned.');
    return;
  }

  const titleForm = event.target.closest('[data-conversation-title-form]');
  if (titleForm) {
    event.preventDefault();
    const data = new FormData(titleForm);
    const detail = await fetchJson('/api/conversations/title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: titleForm.dataset.conversationId,
        title: String(data.get('title') || ''),
      }),
    });
    content.innerHTML = renderConversationDetail(detail);
    showWarning('Conversation title saved.');
    return;
  }

  const settingsForm = event.target.closest('[data-journey-settings-form]');
  if (settingsForm) {
    event.preventDefault();
    const data = new FormData(settingsForm);
    await fetchJson('/api/journeys/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        journeyId: settingsForm.dataset.journeyId,
        title: String(data.get('title') || ''),
        status: String(data.get('status') || 'active'),
        projectPath: String(data.get('projectPath') || ''),
        syncFile: String(data.get('syncFile') || ''),
        icon: String(data.get('icon') || ''),
        color: String(data.get('color') || ''),
        parentJourney: String(data.get('parentJourney') || ''),
      }),
    });
    showWarning('Journey settings saved.');
    await showView('workspace', { updateHash: false });
    showWorkspaceTab('settings');
    return;
  }

  const operationForm = event.target.closest('[data-operation-form]');
  if (operationForm) {
    event.preventDefault();
    const submit = operationForm.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const started = await fetchJson('/api/operations/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(operationPayloadFromForm(operationForm)),
      });
      showWarning('Operation queued.');
      const result = operationRunToResult({
        id: started.runId,
        operationId: started.operationId,
        status: started.status,
        outcome: started.outcome,
        summary: started.summary,
        result: started.result,
        events: started.events || [],
      }, started);
      showWarning('Operation queued.');
      await renderOperations(null, operationForm.dataset.operationId);
      showRunConsole(result, catalogOperationById(operationForm.dataset.operationId));
      if (started.runId) pollRunConsole(started.runId);
    } catch (error) {
      showWarning(String(error.message || error));
      await renderOperations({
        operationId: operationForm.dataset.operationId,
        status: 'failed',
        error: String(error.message || error),
      }, operationForm.dataset.operationId);
    }
    return;
  }

  const form = event.target.closest('[data-profile-form]');
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  const result = await fetchJson('/api/preferences/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: String(data.get('displayName') || ''),
      avatarSymbol: String(data.get('avatarSymbol') || ''),
    }),
  });
  shellState.profile = result.profile;
  if (mirrorName) mirrorName.textContent = result.profile?.displayName || shellState.mirror?.name || 'Local Mirror';
  renderMirrorSelector(shellState.mirrors || []);
  showWarning(result.warning || 'Profile preferences saved.');
});

content.addEventListener('change', async (event) => {
  const input = event.target.closest('[data-theme-form] input[name="theme"]');
  if (!input) return;
  const result = await fetchJson('/api/preferences/theme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme: input.value }),
  });
  shellState.theme = result.theme;
  applyTheme(result.theme);
  showWarning(result.warning || 'Theme preference saved.');
});

document.querySelectorAll('[data-search-form]').forEach((form) => {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = new FormData(form).get('q') || '';
    await loadSearchResults(String(query));
  });
});

document.querySelectorAll('[data-home]').forEach((homeLink) => {
  homeLink.addEventListener('click', async (event) => {
    event.preventDefault();
    await showView('workspace');
  });
});

window.addEventListener('popstate', async (event) => {
  const state = event.state || {};
  if (state.view === 'memory-category' && state.category) {
    await loadMemoryCategory(state.category, { updateHistory: false });
    return;
  }
  if (state.view === 'search') {
    await loadSearchResults(state.query || '', { updateHistory: false });
    return;
  }
  if (state.view === 'conversation' && state.id) {
    await loadConversation(state.id, { updateHistory: false });
    return;
  }
  const hashView = viewFromHash();
  if (hashView?.view === 'conversation') {
    await loadConversation(hashView.id, { updateHistory: false });
    return;
  }
  await showView(state.view || hashView?.view || 'workspace', { updateHash: false });
});

function viewFromHash() {
  const hash = window.location.hash.replace(/^#/, '');
  const conversation = hash.match(/^conversation\/(.+)$/);
  if (conversation) return { view: 'conversation', id: decodeURIComponent(conversation[1]) };
  if (['workspace', 'conversations', 'journeys', 'atlas', 'docs', 'preferences', 'configuration', 'operations'].includes(hash)) return { view: hash };
  return null;
}

function showWorkspaceTab(tabId) {
  document.querySelectorAll('[data-workspace-tab]').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.workspaceTab === tabId);
  });
  document.querySelectorAll('[data-workspace-panel]').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.workspacePanel === tabId);
  });
}

function showConfigurationTab(tabId) {
  document.querySelectorAll('[data-configuration-tab]').forEach((tab) => {
    const active = tab.dataset.configurationTab === tabId;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('[data-configuration-panel]').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.configurationPanel === tabId);
  });
}

function isEditableTarget(target) {
  return !!target?.closest?.('input, textarea, select, button, [contenteditable="true"]');
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


function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  const diffMs = Date.now() - date.getTime();
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  if (diffMs >= 0 && diffMs < minuteMs) return 'just now';
  if (diffMs >= 0 && diffMs < hourMs) {
    const minutes = Math.floor(diffMs / minuteMs);
    return `${minutes}m ago`;
  }
  if (diffMs >= 0 && diffMs < dayMs) {
    const hours = Math.floor(diffMs / hourMs);
    return `${hours}h ago`;
  }
  if (diffMs >= 0 && diffMs < 30 * dayMs) {
    const days = Math.floor(diffMs / dayMs);
    return `${days}d ago`;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
