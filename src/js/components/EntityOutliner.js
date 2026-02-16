/**
 * EntityOutliner.js - Dev mode entity outliner panel (left sidebar)
 * Read-only hierarchical tree view of all entities in the scene.
 * Categories are auto-discovered from preview.js manifests.
 * Usage: <entity-outliner></entity-outliner>
 */

const previewModules = import.meta.glob('/src/js/entities/**/preview.js', { eager: true });

const CATEGORY_LABELS = {
    hero: 'Hero',
    enemies: 'Enemies',
    pickups: 'Pickups',
    mechanics: 'Mechanics',
    effects: 'Effects',
};

const CATEGORY_ORDER = ['hero', 'enemies', 'pickups', 'mechanics', 'effects', 'other'];

// Build registry: configKey → { label, category }
// and categories: categoryId → [configKey, ...]
function buildRegistry() {
    const registry = {};
    const categories = {};

    for (const mod of Object.values(previewModules)) {
        const m = mod.manifest;
        if (!m || !m.configKey) continue;
        registry[m.configKey] = { label: m.name, category: m.category };
        if (!categories[m.category]) categories[m.category] = [];
        categories[m.category].push(m.configKey);
    }

    return { registry, categories };
}

const { registry: REGISTRY, categories: DISCOVERED_CATEGORIES } = buildRegistry();

class EntityOutliner extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._refreshInterval = null;
        this._collapsed = {};
        this._typeCollapsed = {};
    }

    connectedCallback() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 260px;
                    height: 100vh;
                    background: #001020;
                    border-right: 2px solid #ff450033;
                    z-index: 102;
                    font-family: monospace;
                    font-size: 12px;
                    color: #ccc;
                    overflow-y: auto;
                    display: none;
                }
                :host(.visible) { display: block; }

                .header {
                    padding: 10px 12px;
                    color: #ff4500;
                    font-weight: bold;
                    font-size: 13px;
                    border-bottom: 1px solid #ff450033;
                    position: sticky;
                    top: 0;
                    background: #001020;
                }

                .category {
                    border-bottom: 1px solid #ff450022;
                }
                .category-header {
                    padding: 8px 12px;
                    color: #ff4500;
                    cursor: pointer;
                    user-select: none;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-weight: bold;
                }
                .category-header:hover { background: #ff450011; }
                .category-header .arrow { transition: transform 0.15s; }
                .category-header .arrow.collapsed { transform: rotate(-90deg); }

                .category-body { padding: 0 0 4px; }
                .category-body.collapsed { display: none; }

                .type-row {
                    padding: 4px 12px 4px 24px;
                    cursor: pointer;
                    user-select: none;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .type-row:hover { background: #ff450008; }
                .type-row .arrow {
                    font-size: 10px;
                    transition: transform 0.15s;
                    margin-right: 4px;
                }
                .type-row .arrow.collapsed { transform: rotate(-90deg); }
                .type-label { color: #aaa; }
                .type-count { color: #666; font-size: 11px; }

                .instance-list { }
                .instance-list.collapsed { display: none; }

                .instance-row {
                    padding: 2px 12px 2px 40px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    color: #888;
                    font-size: 11px;
                }
                .instance-row:hover { background: #ff450006; }
                .instance-name { color: #999; }
                .instance-coords { color: #555; }

                .singleton-row {
                    padding: 4px 12px 4px 24px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .singleton-row .type-label { color: #aaa; }
                .singleton-coords { color: #555; font-size: 11px; }

                .not-spawned {
                    color: #444;
                    font-style: italic;
                    font-size: 11px;
                }

                .singleton-row.selectable, .instance-row.selectable {
                    cursor: pointer;
                }
                .singleton-row.selected, .instance-row.selected {
                    background: #ff450022;
                    outline: 1px solid #ff450066;
                }

                ::-webkit-scrollbar { width: 6px; }
                ::-webkit-scrollbar-track { background: #001020; }
                ::-webkit-scrollbar-thumb { background: #ff450044; border-radius: 3px; }
            </style>
            <div class="header">ENTITY OUTLINER</div>
            <div id="content"></div>
        `;
    }

    show() {
        this.classList.add('visible');
        this._buildAll();
        this._refreshInterval = setInterval(() => this._refresh(), 100);
    }

    hide() {
        this.classList.remove('visible');
        window.gameDevSelectedEntities = [];
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = null;
        }
    }

    _getCategories(entities) {
        const assigned = new Set();
        const result = [];

        for (const catId of CATEGORY_ORDER) {
            if (catId === 'other') continue;
            const keys = (DISCOVERED_CATEGORIES[catId] || []).filter(k => k in entities);
            if (keys.length === 0) continue;
            keys.forEach(k => assigned.add(k));
            result.push({ label: CATEGORY_LABELS[catId] || catId, keys });
        }

        // Collect any entity keys not covered by manifests into "Other"
        const otherKeys = Object.keys(entities).filter(k => !assigned.has(k));
        if (otherKeys.length > 0) {
            result.push({ label: 'Other', keys: otherKeys });
        }

        return result;
    }

    _buildAll() {
        const entities = window.gameDevGetEntities?.();
        if (!entities) return;

        const content = this.shadowRoot.getElementById('content');
        content.innerHTML = '';

        const categories = this._getCategories(entities);

        for (const category of categories) {
            const catEl = document.createElement('div');
            catEl.className = 'category';
            const catKey = category.label;
            const catCollapsed = this._collapsed[catKey] ?? false;

            catEl.innerHTML = `
                <div class="category-header" data-cat="${catKey}">
                    <span>${category.label}</span>
                    <span class="arrow ${catCollapsed ? 'collapsed' : ''}">▼</span>
                </div>
                <div class="category-body ${catCollapsed ? 'collapsed' : ''}" data-cat-body="${catKey}"></div>
            `;

            const body = catEl.querySelector(`[data-cat-body="${catKey}"]`);
            this._buildCategoryItems(body, category.keys, entities);

            catEl.querySelector('.category-header').addEventListener('click', () => {
                this._collapsed[catKey] = !this._collapsed[catKey];
                const b = catEl.querySelector(`[data-cat-body="${catKey}"]`);
                const arrow = catEl.querySelector('.category-header .arrow');
                b.classList.toggle('collapsed');
                arrow.classList.toggle('collapsed');
            });

            content.appendChild(catEl);
        }
    }

    _buildCategoryItems(body, keys, entities) {
        for (const key of keys) {
            const entity = entities[key];
            const info = REGISTRY[key];
            const label = info ? info.label : key;

            if (Array.isArray(entity)) {
                this._buildArrayType(body, key, label, entity);
            } else {
                // Singleton
                const row = document.createElement('div');
                row.className = 'singleton-row';
                if (entity == null) {
                    row.innerHTML = `
                        <span class="type-label">${label}</span>
                        <span class="not-spawned">not spawned</span>
                    `;
                } else {
                    row.classList.add('selectable');
                    row.setAttribute('data-select', key);
                    const coords = this._formatCoords(entity);
                    row.innerHTML = `
                        <span class="type-label">${label}</span>
                        <span class="singleton-coords" data-coords="${key}">${coords}</span>
                    `;
                    row.addEventListener('click', (e) => this._handleSelect(key, null, e));
                }
                body.appendChild(row);
            }
        }
    }

    _buildArrayType(body, key, label, arr) {
        const typeCollapsed = this._typeCollapsed[key] ?? (arr.length > 10);
        const hasInstances = arr.length > 0;

        const wrapper = document.createElement('div');

        const typeRow = document.createElement('div');
        typeRow.className = 'type-row';
        typeRow.innerHTML = `
            <span>
                ${hasInstances ? `<span class="arrow ${typeCollapsed ? 'collapsed' : ''}">▾</span>` : ''}
                <span class="type-label">${label}</span>
            </span>
            <span class="type-count" data-count="${key}">(${arr.length})</span>
        `;

        wrapper.appendChild(typeRow);

        if (hasInstances) {
            const instList = document.createElement('div');
            instList.className = `instance-list ${typeCollapsed ? 'collapsed' : ''}`;
            instList.setAttribute('data-instances', key);

            arr.forEach((inst, i) => {
                const instRow = document.createElement('div');
                instRow.className = 'instance-row selectable';
                instRow.setAttribute('data-select', `${key}[${i}]`);
                const coords = this._formatCoords(inst);
                instRow.innerHTML = `
                    <span class="instance-name">#${i + 1}</span>
                    <span class="instance-coords" data-inst-coords="${key}[${i}]">${coords}</span>
                `;
                instRow.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._handleSelect(key, i, e);
                });
                instList.appendChild(instRow);
            });

            wrapper.appendChild(instList);

            typeRow.addEventListener('click', () => {
                this._typeCollapsed[key] = !this._typeCollapsed[key];
                const list = wrapper.querySelector(`[data-instances="${key}"]`);
                const arrow = typeRow.querySelector('.arrow');
                list?.classList.toggle('collapsed');
                arrow?.classList.toggle('collapsed');
            });
        }

        body.appendChild(wrapper);
    }

    _handleSelect(key, index, event) {
        const sels = window.gameDevSelectedEntities;
        const entry = { key, index };
        const isSelected = sels.some(s => s.key === key && s.index === index);

        if (event.ctrlKey || event.metaKey) {
            if (isSelected) {
                window.gameDevSelectedEntities = sels.filter(s => !(s.key === key && s.index === index));
            } else {
                window.gameDevSelectedEntities = [...sels, entry];
            }
        } else if (event.shiftKey && window._gameDevLastSelected) {
            const anchor = window._gameDevLastSelected;
            if (anchor.key === key && anchor.index !== null && index !== null) {
                const lo = Math.min(anchor.index, index);
                const hi = Math.max(anchor.index, index);
                const range = [];
                for (let i = lo; i <= hi; i++) {
                    range.push({ key, index: i });
                }
                const existing = sels.filter(s => s.key !== key);
                window.gameDevSelectedEntities = [...existing, ...range];
            } else {
                window.gameDevSelectedEntities = [...sels, entry];
            }
        } else {
            if (isSelected && sels.length === 1) {
                window.gameDevSelectedEntities = [];
            } else {
                window.gameDevSelectedEntities = [entry];
            }
        }

        window._gameDevLastSelected = entry;
        this._syncSelection();
    }

    _syncSelection() {
        const sels = window.gameDevSelectedEntities;
        const rows = this.shadowRoot.querySelectorAll('[data-select]');
        rows.forEach(row => {
            const attr = row.getAttribute('data-select');
            const matches = sels.some(sel => {
                if (sel.index !== null) return attr === `${sel.key}[${sel.index}]`;
                return attr === sel.key;
            });
            row.classList.toggle('selected', matches);
        });
    }

    _formatCoords(entity) {
        if (entity == null) return '';
        const x = entity.x;
        const y = entity.y;
        if (x === undefined && y === undefined) return '';
        const xStr = x !== undefined ? `x: ${Math.round(x)}` : '';
        const yStr = y !== undefined ? `y: ${Math.round(y)}` : '';
        if (xStr && yStr) return `${xStr}  ${yStr}`;
        return xStr || yStr;
    }

    _refresh() {
        const entities = window.gameDevGetEntities?.();
        if (!entities) return;

        let needsRebuild = false;

        const categories = this._getCategories(entities);

        for (const category of categories) {
            for (const key of category.keys) {
                const entity = entities[key];

                if (Array.isArray(entity)) {
                    const countEl = this.shadowRoot.querySelector(`[data-count="${key}"]`);
                    if (countEl) {
                        const displayed = countEl.textContent;
                        const expected = `(${entity.length})`;
                        if (displayed !== expected) {
                            needsRebuild = true;
                            break;
                        }
                    } else {
                        needsRebuild = true;
                        break;
                    }

                    entity.forEach((inst, i) => {
                        const el = this.shadowRoot.querySelector(`[data-inst-coords="${key}[${i}]"]`);
                        if (el) el.textContent = this._formatCoords(inst);
                    });
                } else {
                    // Singleton — check spawn/despawn transitions
                    const coordsEl = this.shadowRoot.querySelector(`[data-coords="${key}"]`);
                    const wasSpawned = coordsEl !== null;
                    const isSpawned = entity != null;
                    if (wasSpawned !== isSpawned) {
                        needsRebuild = true;
                        break;
                    }
                    if (coordsEl && entity) {
                        coordsEl.textContent = this._formatCoords(entity);
                    }
                }
            }
            if (needsRebuild) break;
        }

        if (needsRebuild) this._buildAll();
        this._syncSelection();
    }
}

customElements.define('entity-outliner', EntityOutliner);

export default EntityOutliner;
