// OntoWEEE Demo Application
// 数据加载策略：
//   1. 优先从 graph_data.json 加载（由 convert_triples_to_graph.py 生成，无需服务器）
//   2. 回退到 server.py API（/api/queries + /api/triples/{id}）
//
// 数据更新流程：
//   1. 运行 python convert_triples_to_graph.py  重新生成 graph_data.json
//   2. 刷新页面即可看到新数据

let currentQuery = null;
const graphPositionMemory = new Map();
let allGraphs = {};       // 静态 JSON 模式：所有图数据
let queries = [];         // 当前显示的查询列表（可能经过过滤）
let fullQueries = [];     // 完整查询列表（所有可发现的 triples 源）
let useStaticJson = false;// 当前使用的数据模式
const graphDataCache = new Map();
let currentFullGraphData = null;
let currentViewGraphData = null;
let currentRenderedGraphData = null;
let currentRootNodeId = null;
let hideMaterialNoValueEdges = false;
function queryMatchesKeyword(query, keyword) {
    const fields = [
        query.title,
        query.description,
        query.source_title,
        query.folder_name,
        query.search_terms
    ];
    return fields.some(field => String(field || '').toLowerCase().includes(keyword));
}

// 节点类型颜色映射
const nodeColors = {
    'Product': '#667eea',
    'Component': '#764ba2',   // 紫色，同 PROCESSED_BY 边
    'Material': '#f6ad55',    // 橙黄，同 HAS_INPUT / HAS_OBSERVATION / TRANSFORMED_TO 边
    'Process': '#ed64a6',     // 粉红，同 HAS_OUTPUT 边
    'Equipment': '#a0aec0',
    'Hazard': '#fc8181',
    'Observation': '#4fd1c5'
};

// Remove 'Component' so Component nodes also aggregate and show details (scope/condition etc.)
const compactNodeDetailTypes = new Set(['Product', 'Material', 'Process']);

// 根据边类型返回宽度
function getEdgeWidth(predicate) {
    const widths = {
        'CONTAINS': 4,
        'PROCESSED_BY': 3,
        'HAS_OUTPUT': 3,
        'HAS_OBSERVATION': 3,
        'HAS_INPUT': 3,
        'HAS_CONTEXT': 2,
        'RELATED_TO': 2,
        'TRANSFORMED_TO': 3
    };
    return widths[predicate] || 2;
}

// 根据节点类型返回大小
function getNodeSize(type) {
    const sizes = {
        'Product': 36,
        'Component': 30,
        'Material': 24,
        'Process': 28,
        'Equipment': 18,
        'Hazard': 18,
        'Observation': 16
    };
    return sizes[type] || 20;
}

function asList(value) {
    if (isEmptyMeasurementValue(value)) return [];
    return Array.isArray(value) ? value : [value];
}

function addUnique(target, value) {
    asList(value).forEach(item => {
        if (isEmptyMeasurementValue(item)) return;
        const itemKey = JSON.stringify(item);
        if (!target.some(existing => JSON.stringify(existing) === itemKey)) {
            target.push(item);
        }
    });
}

function formatMeasurementValue(details) {
    const value = details?.value;
    if (isEmptyMeasurementValue(value)) return '';
    const unit = details.unit;
    return unit === null || unit === undefined || unit === '' ? String(value) : `${value}${unit}`;
}

function normalizeContextText(value) {
    return String(value ?? '')
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isEmptyMeasurementValue(value) {
    if (value === null || value === undefined) return true;
    if (Array.isArray(value)) return value.every(item => isEmptyMeasurementValue(item));
    if (typeof value === 'string') {
        const label = value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/^[*•\s]+|[*•\s]+$/g, '');
        return new Set([
            '',
            '-',
            '–',
            '—',
            'n/a',
            'n.a.',
            'na',
            'n.a',
            'not applicable',
            'not available',
            'none',
            'null',
            'nil',
            'no data'
        ]).has(label);
    }
    return false;
}

function isEmptyValuedComponentContains(triple) {
    const props = triple.properties || {};
    return (
        triple.predicate === 'CONTAINS' &&
        ['Product', 'Component'].includes(triple.subject_type) &&
        triple.object_type === 'Component' &&
        Object.prototype.hasOwnProperty.call(props, 'value') &&
        isEmptyMeasurementValue(props.value)
    );
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatDetailValue(value) {
    return asList(value).map(item => {
        if (item === null || item === undefined || item === '') return '';
        if (typeof item === 'object') {
            return item.name || item.label || item.value || item.id || JSON.stringify(item);
        }
        return String(item);
    }).filter(Boolean).join('; ');
}

function aggregateGraphEdges(edges, nodeMap = new Map()) {
    const groups = new Map();
    edges.forEach(edge => {
        const predicate = edge.label.split(' | ')[0];
        const key = `${edge.source}→${predicate}→${edge.target}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(edge);
    });

    const aggregated = [];
    groups.forEach(group => {
        if (group.length > 1 && isValuePrunableEdge(group[0], nodeMap) && group.some(edge => formatMeasurementValue(edge.details))) {
            group = group.filter(edge => formatMeasurementValue(edge.details));
        }

        if (group.length === 1) {
            aggregated.push(group[0]);
            return;
        }

        const first = group[0];
        const predicate = first.label.split(' | ')[0];
        const details = {
            measurement_count: group.length,
            measurements: [],
            condition: [],
            scope: [],
            property: []
        };
        const numericValues = [];
        let commonUnit = null;
        let mixedUnits = false;

        group.forEach(edge => {
            const edgeDetails = edge.details || {};
            const measurement = {
                value: edgeDetails.value,
                unit: edgeDetails.unit,
                secondary_value: edgeDetails.secondary_value,
                secondary_unit: edgeDetails.secondary_unit,
                condition: edgeDetails.condition,
                scope: edgeDetails.scope,
                property: edgeDetails.property
            };
            details.measurements.push(measurement);
            addUnique(details.condition, edgeDetails.condition);
            addUnique(details.scope, edgeDetails.scope);
            addUnique(details.property, edgeDetails.property);

            const parsed = Number(edgeDetails.value);
            if (!Number.isNaN(parsed)) {
                numericValues.push(parsed);
                if (commonUnit === null) commonUnit = edgeDetails.unit || '';
                if ((edgeDetails.unit || '') !== commonUnit) mixedUnits = true;
            }
        });

        if (numericValues.length > 0) {
            const min = Math.min(...numericValues);
            const max = Math.max(...numericValues);
            details.value_range = min === max ? String(min) : `${min}-${max}`;
            if (!mixedUnits && commonUnit) details.unit = commonUnit;
        }

        if (details.condition.length === 0) delete details.condition;
        if (details.scope.length === 0) delete details.scope;
        if (details.property.length === 0) delete details.property;

        const hasValues = group.some(edge => formatMeasurementValue(edge.details));
        aggregated.push({
            source: first.source,
            target: first.target,
            label: `${predicate} | ${group.length} ${hasValues ? 'measurements' : 'facts'}`,
            width: Math.max(first.width, 3),
            details
        });
    });

    return aggregated;
}

function isComponentContainsEdge(edge, nodeMap) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    const predicate = edge.label.split(' | ')[0];
    return (
        predicate === 'CONTAINS' &&
        ['Product', 'Component'].includes(sourceNode?.type) &&
        targetNode?.type === 'Component'
    );
}

function isValuePrunableEdge(edge, nodeMap) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    const predicate = edge.label.split(' | ')[0];
    return (
        isComponentContainsEdge(edge, nodeMap) ||
        (
            predicate === 'HAS_OUTPUT' &&
            sourceNode?.type === 'Process' &&
            ['Component', 'Material'].includes(targetNode?.type)
        )
    );
}

function asNormalizedContextList(value) {
    return asList(value)
        .map(item => {
            if (typeof item === 'object') {
                return normalizeContextText(item.name || item.label || item.value || item.id || JSON.stringify(item));
            }
            return normalizeContextText(item);
        })
        .filter(Boolean);
}

function detailMatchesRootScope(details, rootNode) {
    const rootLabel = normalizeContextText(rootNode?.label);
    const rootId = normalizeContextText(rootNode?.id);
    if (!rootLabel && !rootId) return false;

    return asNormalizedContextList(details?.scope).some(scope => (
        scope === rootLabel ||
        scope === rootId ||
        (rootLabel && scope.includes(rootLabel)) ||
        (rootId && scope.includes(rootId))
    ));
}

function rebuildAggregatedEdgeDetails(edge, measurements) {
    const details = {
        measurement_count: measurements.length,
        measurements,
        condition: [],
        scope: [],
        property: []
    };
    const numericValues = [];
    let commonUnit = null;
    let mixedUnits = false;

    measurements.forEach(measurement => {
        addUnique(details.condition, measurement.condition);
        addUnique(details.scope, measurement.scope);
        addUnique(details.property, measurement.property);

        const parsed = Number(measurement.value);
        if (!Number.isNaN(parsed)) {
            numericValues.push(parsed);
            const unit = measurement.unit || '';
            if (commonUnit === null) commonUnit = unit;
            if (unit !== commonUnit) mixedUnits = true;
        }
    });

    if (numericValues.length > 0) {
        const min = Math.min(...numericValues);
        const max = Math.max(...numericValues);
        details.value_range = min === max ? String(min) : `${min}-${max}`;
        if (!mixedUnits && commonUnit) details.unit = commonUnit;
    }

    if (details.condition.length === 0) delete details.condition;
    if (details.scope.length === 0) delete details.scope;
    if (details.property.length === 0) delete details.property;

    const predicate = edge.label.split(' | ')[0];
    return {
        ...edge,
        label: `${predicate} | ${measurements.length} measurements`,
        details
    };
}

function trimEdgeToRootContext(edge, rootNode, nodeMap) {
    if (!rootNode) return edge;
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    const predicate = edge.label.split(' | ')[0];
    const isScopedMeasurementEdge = (
        predicate === 'CONTAINS' &&
        sourceNode?.type === 'Component' &&
        targetNode?.type === 'Material'
    );
    if (!isScopedMeasurementEdge) return edge;

    const details = edge.details || {};
    if (Array.isArray(details.measurements)) {
        const scopedMeasurements = details.measurements.filter(measurement => detailMatchesRootScope(measurement, rootNode));
        if (scopedMeasurements.length > 0) {
            return rebuildAggregatedEdgeDetails(edge, scopedMeasurements);
        }

        const hasScopedMeasurements = details.measurements.some(measurement => asNormalizedContextList(measurement.scope).length > 0);
        return hasScopedMeasurements ? null : edge;
    }

    const scopes = asNormalizedContextList(details.scope);
    if (scopes.length > 0 && !detailMatchesRootScope(details, rootNode)) {
        return null;
    }
    return edge;
}

// 将原始 triples 数据转换为图格式（nodes + edges）
function transformTriplesToGraph(triplesData) {
    const nodeMap = new Map();
    let edges = [];

    triplesData.triples.forEach(triple => {
        if (triple.predicate === 'HAS_OBSERVATION') return;
        if (isEmptyValuedComponentContains(triple)) return;

        const { subject, subject_name, subject_type, predicate, object, object_name, object_type, properties } = triple;

        // 添加 subject 节点
        if (!nodeMap.has(subject)) {
            nodeMap.set(subject, {
                id: subject,
                label: subject_name,
                type: subject_type,
                size: getNodeSize(subject_type)
            });
        }

        // 添加 object 节点
        if (!nodeMap.has(object)) {
            nodeMap.set(object, {
                id: object,
                label: object_name,
                type: object_type,
                size: getNodeSize(object_type)
            });
        }

        // 构建边标签
        let edgeLabel = predicate;
        const props = properties || {};
        const value = props.value;
        const unit = props.unit;
        if (!isEmptyMeasurementValue(value)) {
            if (unit !== null && unit !== undefined && unit !== '') {
                edgeLabel += ` | ${value}${unit}`;
            } else {
                edgeLabel += ` | ${value}`;
            }
        }

        // 构建边详情
        const details = {};
        if (props.value !== null && props.value !== undefined) details.value = props.value;
        if (props.unit !== null && props.unit !== undefined) details.unit = props.unit;
        if (props.secondary_value !== null && props.secondary_value !== undefined) details.secondary_value = props.secondary_value;
        if (props.secondary_unit !== null && props.secondary_unit !== undefined) details.secondary_unit = props.secondary_unit;
        if (props.condition !== null && props.condition !== undefined) details.condition = props.condition;
        if (props.conditions !== null && props.conditions !== undefined) details.condition = props.conditions;
        if (props.condition_labels !== null && props.condition_labels !== undefined) details.condition = props.condition_labels;
        if (props.experiment_group !== null && props.experiment_group !== undefined) details.experiment_group = props.experiment_group;
        if (props.process_agents !== null && props.process_agents !== undefined) details.process_agents = props.process_agents;
        if (props.media !== null && props.media !== undefined) details.media = props.media;
        if (props.equipment !== null && props.equipment !== undefined) details.equipment = props.equipment;
        if (props.property !== null && props.property !== undefined) details.property = props.property;
        if (props.source_sample !== null && props.source_sample !== undefined) details.scope = props.source_sample;
        if (props.scope !== null && props.scope !== undefined) details.scope = props.scope;
        if (props.scope_description !== null && props.scope_description !== undefined) details.scope = props.scope_description;

        edges.push({
            source: subject,
            target: object,
            label: edgeLabel,
            width: getEdgeWidth(predicate),
            details: details
        });
    });
    edges = aggregateGraphEdges(edges, nodeMap);

    // 聚合每个节点关联边的 details（去重）
    const nodeDetailsMap = new Map();
    edges.forEach(edge => {
        const edgeDetails = edge.details || {};
        ['condition', 'conditions', 'experiment_group', 'process_agents', 'media', 'equipment', 'property', 'value', 'unit', 'scope'].forEach(key => {
            const val = edgeDetails[key];
            if (val !== null && val !== undefined && val !== '' && (Array.isArray(val) ? val.length > 0 : true)) {
                [edge.source, edge.target].forEach(nodeId => {
                    const node = nodeMap.get(nodeId);
                    if (node && compactNodeDetailTypes.has(node.type)) return;
                    if (!nodeDetailsMap.has(nodeId)) nodeDetailsMap.set(nodeId, {});
                    const nd = nodeDetailsMap.get(nodeId);
                    if (!nd[key]) nd[key] = [];
                    const items = Array.isArray(val) ? val : [val];
                    items.forEach(item => {
                        // 用 JSON.stringify 做深度比较去重
                        const itemStr = JSON.stringify(item);
                        if (!nd[key].some(existing => JSON.stringify(existing) === itemStr)) {
                            nd[key].push(item);
                        }
                    });
                });
            }
        });
    });
    nodeMap.forEach((node, id) => {
        const nd = nodeDetailsMap.get(id);
        if (nd && Object.keys(nd).length > 0) node.details = nd;
    });

    const nodes = Array.from(nodeMap.values());
    const docId = triplesData.doc_id || 'unknown';
    const tripleCount = triplesData.triple_count || triplesData.triples.length;

    return {
        nodes: nodes,
        edges: edges,
        stats: {
            nodes: nodes.length,
            edges: edges.length,
            papers: 1
        },
        paper: `${docId} | ${tripleCount} triples`
    };
}

// ---------------------------------------------------------------------------
// 数据加载：优先 graph_data.json，回退 server API
// ---------------------------------------------------------------------------

// 模式 1：从 graph_data.json 加载全部数据（无需服务器）
async function loadStaticJson() {
    try {
        const response = await fetch(`graph_data.json?v=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        fullQueries = data.queries || [];
        queries = [...fullQueries];
        allGraphs = data.graphs || {};
        // 如果 JSON 中有 nodeColors，覆盖默认值
        if (data.nodeColors) {
            Object.assign(nodeColors, data.nodeColors);
        }
        useStaticJson = true;
        console.log(`[Data] Loaded ${fullQueries.length} queries from graph_data.json`);
        return true;
    } catch (err) {
        console.warn(`[Data] graph_data.json not available (${err.message}), falling back to server API`);
        return false;
    }
}

// 模式 2：从 server.py API 获取查询列表（使用 /api/all 获取全部）
async function fetchQueriesFromApi() {
    try {
        const response = await fetch('/api/all');
        const data = await response.json();
        fullQueries = data.queries;
        queries = [...fullQueries];
        useStaticJson = false;
        console.log(`[Data] Loaded ${fullQueries.length} queries from server API`);
    } catch (err) {
        console.error('Failed to fetch queries:', err);
        fullQueries = [];
        queries = [];
    }
}

// 获取图数据（根据当前模式选择来源）
async function fetchGraphData(queryId) {
    // 模式 1：从静态 JSON 的内存缓存中读取
    if (useStaticJson && allGraphs[queryId]) {
        graphDataCache.set(queryId, allGraphs[queryId]);
        return allGraphs[queryId];
    }

    // 模式 2：从 server API 读取并转换
    try {
        const response = await fetch(`/api/triples/${queryId}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const triplesData = await response.json();
        const graphData = transformTriplesToGraph(triplesData);
        // 缓存到 allGraphs 中，避免重复请求
        allGraphs[queryId] = graphData;
        graphDataCache.set(queryId, graphData);
        return graphData;
    } catch (err) {
        console.error(`Failed to fetch graph data for ${queryId}:`, err);
        return null;
    }
}

// 初始化应用
async function init() {
    // 先尝试静态 JSON，失败则回退 server API
    const loaded = await loadStaticJson();
    if (!loaded) {
        await fetchQueriesFromApi();
    }
    renderQueryList();
    setupEventListeners();
}

// 渲染查询列表（可选：按关键词过滤）
function renderQueryList(filter = '') {
    const queryList = document.getElementById('query-list');
    queryList.innerHTML = '';

    const keyword = filter.toLowerCase().trim();
    if (!keyword) {
        queries = [];

        const emptyState = document.createElement('div');
        emptyState.className = 'query-empty-state';
        emptyState.textContent = 'Click the search box to choose a paper title, or type keywords to filter papers.';
        queryList.appendChild(emptyState);
        return;
    }

    queries = fullQueries.filter(q => queryMatchesKeyword(q, keyword));

    queries.forEach(query => {
        const card = document.createElement('div');
        card.className = 'query-card' + (currentQuery === query.id ? ' active' : '');
        card.dataset.queryId = query.id;
        card.innerHTML = `
            <h3>${query.source_title || query.title}</h3>
            <p>${query.description}</p>
            <span class="tag" style="background: ${query.color}">${query.tag}</span>
        `;
        card.addEventListener('click', () => selectQuery(query.id));
        queryList.appendChild(card);
    });
}

function getTitleSuggestionMatches(filter = '') {
    const keyword = filter.toLowerCase().trim();
    if (!keyword) return [...fullQueries];

    return fullQueries
        .filter(query => queryMatchesKeyword(query, keyword));
}

function renderTitleSuggestions(filter = '') {
    const suggestions = document.getElementById('title-suggestions');
    if (!suggestions) return;

    const matches = getTitleSuggestionMatches(filter);
    suggestions.innerHTML = '';

    if (matches.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'title-suggestions-empty';
        empty.textContent = 'No matching papers';
        suggestions.appendChild(empty);
        return;
    }

    matches.forEach(query => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'title-suggestion';
        option.dataset.queryId = query.id;

        const title = document.createElement('span');
        title.textContent = query.source_title || query.title;
        option.appendChild(title);

        const meta = document.createElement('span');
        meta.className = 'title-suggestion-meta';
        meta.textContent = query.tag || '';
        option.appendChild(meta);

        option.addEventListener('click', () => {
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.value = query.title;
            }
            hideTitleSuggestions();
            renderQueryList(query.title);
            selectQuery(query.id);
        });

        suggestions.appendChild(option);
    });
}

function showTitleSuggestions() {
    const searchInput = document.getElementById('search-input');
    const suggestions = document.getElementById('title-suggestions');
    if (!suggestions) return;

    renderTitleSuggestions(searchInput ? searchInput.value : '');
    suggestions.classList.add('open');
}

function hideTitleSuggestions() {
    const suggestions = document.getElementById('title-suggestions');
    if (suggestions) {
        suggestions.classList.remove('open');
    }
}

function getRootNodeMatches(filter = '') {
    if (!currentFullGraphData) return [];

    const keyword = filter.toLowerCase().trim();
    return currentFullGraphData.nodes
        .filter(node => node.type === 'Product' || node.type === 'Component')
        .filter(node => {
            if (!keyword) return true;
            return node.label.toLowerCase().includes(keyword) ||
                node.type.toLowerCase().includes(keyword);
        })
        .sort((a, b) => {
            const typeOrder = { Product: 0, Component: 1 };
            const typeCompare = typeOrder[a.type] - typeOrder[b.type];
            if (typeCompare !== 0) return typeCompare;

            const labelCompare = a.label.localeCompare(b.label, undefined, {
                sensitivity: 'base',
                numeric: true
            });
            if (labelCompare !== 0) return labelCompare;
            return a.type.localeCompare(b.type);
        });
}

function renderNodeSuggestions(filter = '') {
    const suggestions = document.getElementById('node-suggestions');
    if (!suggestions) return;

    const matches = getRootNodeMatches(filter);
    suggestions.innerHTML = '';

    if (matches.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'title-suggestions-empty';
        empty.textContent = 'No Product / Component nodes';
        suggestions.appendChild(empty);
        return;
    }

    matches.forEach(node => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'title-suggestion';
        option.dataset.nodeId = node.id;

        const label = document.createElement('span');
        label.textContent = node.label;
        option.appendChild(label);

        const meta = document.createElement('span');
        meta.className = 'title-suggestion-meta';
        meta.textContent = node.type;
        option.appendChild(meta);

        option.addEventListener('click', () => selectRootNode(node.id));
        suggestions.appendChild(option);
    });
}

function showNodeSuggestions(showAll = false) {
    const nodeInput = document.getElementById('node-search-input');
    const suggestions = document.getElementById('node-suggestions');
    if (!suggestions) return;

    renderNodeSuggestions(showAll ? '' : (nodeInput ? nodeInput.value : ''));
    suggestions.classList.add('open');
}

function hideNodeSuggestions() {
    const suggestions = document.getElementById('node-suggestions');
    if (suggestions) {
        suggestions.classList.remove('open');
    }
}

function setNodeSearchVisible(visible) {
    const section = document.getElementById('node-search-section');
    if (!section) return;
    section.classList.toggle('open', visible);
}

function resetNodeSearch() {
    currentRootNodeId = null;
    const nodeInput = document.getElementById('node-search-input');
    if (nodeInput) nodeInput.value = '';
    hideNodeSuggestions();
}

function edgeHasValue(edge) {
    const value = edge.details?.value;
    if (edge.details?.value_range) return true;
    if (Array.isArray(edge.details?.measurements)) {
        return edge.details.measurements.some(item => formatMeasurementValue(item));
    }
    return !isEmptyMeasurementValue(value);
}

function filterMaterialEdgesWithoutValue(graphData) {
    if (!hideMaterialNoValueEdges || !graphData) return graphData;

    const nodeById = new Map(graphData.nodes.map(node => [node.id, node]));
    const filteredEdges = graphData.edges.filter(edge => {
        const targetNode = nodeById.get(edge.target);
        if (targetNode?.type !== 'Material') return true;
        return edgeHasValue(edge);
    });

    const connectedNodeIds = new Set();
    filteredEdges.forEach(edge => {
        connectedNodeIds.add(edge.source);
        connectedNodeIds.add(edge.target);
    });

    if (currentRootNodeId && nodeById.has(currentRootNodeId)) {
        connectedNodeIds.add(currentRootNodeId);
    }

    const filteredNodes = graphData.nodes.filter(node => connectedNodeIds.has(node.id));

    return {
        ...graphData,
        nodes: filteredNodes,
        edges: filteredEdges,
        stats: {
            nodes: filteredNodes.length,
            edges: filteredEdges.length,
            papers: graphData.stats?.papers || 1
        }
    };
}

function renderCurrentGraph() {
    if (!currentQuery || !currentViewGraphData) return;
    renderGraph(currentQuery, filterMaterialEdgesWithoutValue(currentViewGraphData));
}

function extractRootSubgraph(graphData, rootNodeId) {
    const nodeMap = new Map(graphData.nodes.map(node => [node.id, node]));
    const adjacency = new Map();
    graphData.edges.forEach((edge, index) => {
        if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
        adjacency.get(edge.source).push({ target: edge.target, index });
    });

    const reachable = new Set([rootNodeId]);
    const usedEdges = new Set();
    const queue = [rootNodeId];

    while (queue.length > 0) {
        const nodeId = queue.shift();
        const outgoing = adjacency.get(nodeId) || [];
        outgoing.forEach(({ target, index }) => {
            usedEdges.add(index);
            if (!reachable.has(target)) {
                reachable.add(target);
                queue.push(target);
            }
        });
    }

    const rootNode = nodeMap.get(rootNodeId);
    const subgraphNodes = graphData.nodes.filter(node => reachable.has(node.id));
    const subgraphEdges = graphData.edges
        .filter((_, index) => usedEdges.has(index))
        .map(edge => trimEdgeToRootContext(edge, rootNode, nodeMap))
        .filter(Boolean);
    const visibleNodeIds = new Set([rootNodeId]);
    subgraphEdges.forEach(edge => {
        visibleNodeIds.add(edge.source);
        visibleNodeIds.add(edge.target);
    });
    const visibleSubgraphNodes = subgraphNodes.filter(node => visibleNodeIds.has(node.id));

    return {
        ...graphData,
        nodes: visibleSubgraphNodes,
        edges: subgraphEdges,
        stats: {
            nodes: visibleSubgraphNodes.length,
            edges: subgraphEdges.length,
            papers: graphData.stats?.papers || 1
        },
        paper: rootNode ? `${rootNode.label} subgraph` : graphData.paper
    };
}

function selectRootNode(nodeId) {
    if (!currentQuery || !currentFullGraphData) return;

    const node = currentFullGraphData.nodes.find(item => item.id === nodeId);
    if (!node) return;

    currentRootNodeId = nodeId;
    const nodeInput = document.getElementById('node-search-input');
    if (nodeInput) nodeInput.value = node.label;

    hideNodeSuggestions();
    const subgraphData = extractRootSubgraph(currentFullGraphData, nodeId);
    currentViewGraphData = subgraphData;
    renderCurrentGraph();
}

// 选择查询
async function selectQuery(queryId) {
    currentQuery = queryId;
    currentFullGraphData = null;
    currentViewGraphData = null;
    currentRenderedGraphData = null;
    clearEdgeDetailPanel();
    resetNodeSearch();
    setNodeSearchVisible(false);

    // 更新激活状态（重新渲染列表以保持 active 状态同步）
    const searchInput = document.getElementById('search-input');
    renderQueryList(searchInput ? searchInput.value : '');

    // 显示加载状态
    const graphContainer = document.getElementById('graph-container');
    graphContainer.innerHTML = '<div class="loading">Loading graph data...</div>';

    // 获取图数据并渲染
    const graphData = await fetchGraphData(queryId);
    if (graphData) {
        currentFullGraphData = graphData;
        currentViewGraphData = graphData;
        setNodeSearchVisible(true);
        renderCurrentGraph();
    } else {
        graphContainer.innerHTML = '<div class="loading" style="color:#e53e3e">Failed to load graph data. Is the server running?</div>';
    }
}

// 渲染图谱
function renderGraph(queryId, graphData) {
    if (!graphData) {
        console.error('Graph data is null/undefined for query:', queryId);
        return;
    }
    currentRenderedGraphData = graphData;

    // 动态计算统计信息
    const calculatedStats = {
        nodes: graphData.nodes.length,
        edges: graphData.edges.length,
        papers: graphData.stats?.papers || 1
    };
    updateStats(calculatedStats);

    // 渲染图例
    renderLegend(graphData);

    // 准备 Plotly 数据
    const graphState = preparePlotlyData(graphData, queryId);
    const traces = graphState.traces;

    // 配置布局
    const layout = {
        showlegend: false,
        hovermode: 'closest',
        clickmode: 'event',
        dragmode: 'pan',  // 默认启用平移模式
        margin: { t: 20, b: 20, l: 20, r: 20 },
        xaxis: {
            showgrid: false,
            zeroline: false,
            showticklabels: false,
            fixedrange: false,
            range: [-6, 6],
            title: ''
        },
        yaxis: {
            showgrid: true,
            gridcolor: 'rgba(102, 126, 234, 0.1)',
            zeroline: false,
            showticklabels: false,
            scaleanchor: 'x',
            fixedrange: false,
            range: [-6, 6],
            title: ''
        },
        plot_bgcolor: '#f8f9ff',
        paper_bgcolor: '#f8f9ff',
        annotations: []
    };

    // 配置项
    const config = {
        responsive: true,
        displayModeBar: true,
        scrollZoom: true,
        displaylogo: false,
        modeBarButtons: [['zoom2d', 'pan2d', 'zoomIn2d', 'zoomOut2d', 'resetScale2d', 'toImage']],
        editable: false
    };

    // 渲染
    const graphContainer = document.getElementById('graph-container');
    Plotly.newPlot('graph-container', traces, layout, config).then(() => {
        installNodeDrag(graphContainer, graphState);
        installEdgeDetailClick(graphContainer, graphState);
    });
}

function clearEdgeDetailPanel() {
    const panel = document.getElementById('edge-detail-panel');
    if (!panel) return;
    panel.classList.remove('open');
    panel.innerHTML = '';
}

function isSingleValuedPanelMeasurement(predicate, details) {
    return ['CONTAINS', 'HAS_OUTPUT'].includes(predicate) &&
        !details.measurement_count &&
        formatMeasurementValue(details);
}

function getEdgePanelMeasurements(predicate, details) {
    if (Array.isArray(details.measurements)) return details.measurements;
    return isSingleValuedPanelMeasurement(predicate, details) ? [details] : [];
}

function buildEdgeDetailPanelHtml(edge, source, target) {
    const predicate = edge.label.split(' | ')[0];
    const details = edge.details || {};
    const title = `${escapeHtml(source?.label || edge.source)} → ${escapeHtml(target?.label || edge.target)}`;
    const measurements = getEdgePanelMeasurements(predicate, details);
    const summaryParts = [`Type: ${escapeHtml(predicate)}`];
    const singlePanelValue = isSingleValuedPanelMeasurement(predicate, details) ? formatMeasurementValue(details) : '';

    if (details.measurement_count || singlePanelValue) {
        summaryParts.push(`Measurements: ${escapeHtml(details.measurement_count || 1)}`);
    }
    if (details.value_range) {
        summaryParts.push(`Value range: ${escapeHtml(details.value_range)}${escapeHtml(details.unit || '')}`);
    } else if (singlePanelValue) {
        summaryParts.push(`Value range: ${escapeHtml(singlePanelValue)}`);
    }

    const tableRows = measurements.map((measurement, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(formatMeasurementValue(measurement) || 'n/a')}</td>
            <td>${escapeHtml(formatDetailValue(measurement.scope) || '-')}</td>
            <td>${escapeHtml(formatDetailValue(measurement.condition) || '-')}</td>
            <td>${escapeHtml(formatDetailValue(measurement.property) || '-')}</td>
        </tr>
    `).join('');

    let tableHtml = '';
    if (measurements.length > 0) {
        tableHtml = `<div class="edge-detail-table-wrap">
            <table class="edge-detail-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Value</th>
                        <th>Scope</th>
                        <th>Condition</th>
                        <th>Property</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        </div>`;
    } else if (predicate !== 'CONTAINS') {
        tableHtml = `<div class="edge-detail-summary">No measurement table is available for this edge.</div>`;
    }

    return `
        <div class="edge-detail-header">
            <div class="edge-detail-title">${title}</div>
            <button class="edge-detail-close" type="button" aria-label="Close edge details">×</button>
        </div>
        <div class="edge-detail-summary">${summaryParts.join('<br>')}</div>
        ${tableHtml}
    `;
}

function showEdgeDetailPanel(edge, graphState) {
    const panel = document.getElementById('edge-detail-panel');
    if (!panel || !edge) return;

    const source = graphState.nodes.find(node => node.id === edge.source);
    const target = graphState.nodes.find(node => node.id === edge.target);
    panel.innerHTML = buildEdgeDetailPanelHtml(edge, source, target);
    panel.classList.add('open');
    panel.querySelector('.edge-detail-close')?.addEventListener('click', clearEdgeDetailPanel);
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function installEdgeDetailClick(graphContainer, graphState) {
    if (!graphContainer) return;
    graphContainer.__edgeGraphState = graphState;
    if (graphContainer.__edgeDetailClickHandler && graphContainer.removeListener) {
        graphContainer.removeListener('plotly_click', graphContainer.__edgeDetailClickHandler);
    }
    graphContainer.__edgeDetailClickInstalled = true;
    graphContainer.__edgeDetailClickHandler = event => {
        const activeState = graphContainer.__edgeGraphState;
        const point = event?.points?.[0];
        const customdata = point?.customdata;
        const edgeIndex = typeof customdata === 'number' ? customdata : customdata?.edgeIndex;
        if (typeof edgeIndex !== 'number') return;
        showEdgeDetailPanel(activeState.edges[edgeIndex], activeState);
    };
    graphContainer.on('plotly_click', graphContainer.__edgeDetailClickHandler);
}

// 构建边的详细 hover 文本
function buildEdgeHoverText(edge, source, target, predicate) {
    const details = edge.details || {};

    function formatDetailItem(item) {
        if (item === null || item === undefined) {
            return '';
        }
        if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
            return String(item);
        }
        if (typeof item === 'object') {
            const name = item.name || item.label || item.id || '';
            const value = item.value;
            const unit = item.unit || '';
            if (name && !isEmptyMeasurementValue(value)) {
                return `${name} (${value}${unit})`;
            }
            if (name) {
                return String(name);
            }
            const compact = Object.entries(item)
                .filter(([, v]) => v !== null && v !== undefined && v !== '')
                .slice(0, 3)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ');
            return compact || JSON.stringify(item);
        }
        return String(item);
    }

    function formatDetailList(value) {
        const list = Array.isArray(value) ? value : (value ? [value] : []);
        return list.map(formatDetailItem).filter(Boolean);
    }

    function formatValueWithUnit(value, unit) {
        if (unit === undefined || unit === null || unit === '') {
            return String(value);
        }
        return `${value}${unit}`;
    }

    function formatValuesWithUnits(values, units) {
        const valueList = Array.isArray(values) ? values : [values];
        const unitList = Array.isArray(units) ? units : [units];
        return valueList.map((value, index) => formatValueWithUnit(value, unitList[index] ?? unitList[0])).join(', ');
    }

    let text = `<b>${source.label}</b> → <b>${target.label}</b><br>`;
    text += `Type: ${predicate}<br>`;

    const singlePanelValue = isSingleValuedPanelMeasurement(predicate, details) ? formatMeasurementValue(details) : '';
    if (singlePanelValue) {
        text += `Measurements: 1<br>`;
        text += `Value range: ${singlePanelValue}<br>`;
        text += `Click edge for details`;
        return text;
    }

    if (
        predicate === 'CONTAINS' &&
        ['Product', 'Component'].includes(source.type) &&
        target.type === 'Component'
    ) {
        const value = details.value;
        const hasSingleValue = !isEmptyMeasurementValue(value) && !Array.isArray(value);
        if (hasSingleValue && !details.measurement_count) {
            text += `Value: ${formatMeasurementValue(details)}<br>`;
        }
        return text;
    }

    if (details.measurement_count && Array.isArray(details.measurements)) {
        text += `Measurements: ${details.measurement_count}<br>`;
        if (details.value_range) {
            text += `Value range: ${details.value_range}${details.unit || ''}<br>`;
        }
        text += `Click edge for details`;
        return text;
    }

    // CONTAINS 边只显示一个 value+unit，避免重复展示多个 value。
    if (predicate === 'CONTAINS') {
        const value = details.value;
        const unit = details.unit;
        if (!isEmptyMeasurementValue(value)) {
            if (unit !== undefined && unit !== null && unit !== '') {
                text += `Value: ${value}${unit}<br>`;
            } else {
                text += `Value: ${value}<br>`;
            }
        } else {
            const labelParts = edge.label.split(' | ');
            if (labelParts.length >= 2) {
                const valuePart = labelParts.slice(1).join(' | ');
                text += `Value: ${valuePart}<br>`;
            }
        }
        const conditions = Array.isArray(details.condition)
            ? details.condition
            : (details.condition ? [details.condition] : []);
        if (conditions.length > 0) {
            text += `Condition: ${conditions.join('; ')}<br>`;
        }
        const scopes = Array.isArray(details.scope)
            ? details.scope
            : (details.scope ? [details.scope] : []);
        if (scopes.length > 0) {
            text += `Scope: ${scopes.join('; ')}<br>`;
        }
        return text;
    }

    // experiment_group 可能是数组或字符串
    const groups = Array.isArray(details.experiment_group)
        ? details.experiment_group
        : (details.experiment_group ? [details.experiment_group] : []);
    if (groups.length > 0) {
        text += `Group: ${groups.map(g => g.replace(/_/g, ' ')).join(', ')}<br>`;
    }

    // value 可能是数组或字符串
    const values = Array.isArray(details.value)
        ? details.value.filter(value => !isEmptyMeasurementValue(value))
        : (!isEmptyMeasurementValue(details.value) ? [details.value] : []);
    if (values.length > 0) {
        text += `Value: ${formatValuesWithUnits(values, details.unit)}<br>`;
    }

    // secondary_value 可能是数组或字符串
    const secondaryValues = Array.isArray(details.secondary_value)
        ? details.secondary_value
        : (details.secondary_value ? [details.secondary_value] : []);
    if (secondaryValues.length > 0) {
        text += `Secondary: ${formatValuesWithUnits(secondaryValues, details.secondary_unit)}<br>`;
    }

    // condition 可能是数组或字符串
    const conditions = Array.isArray(details.condition)
        ? details.condition
        : (details.condition ? [details.condition] : []);
    if (conditions.length > 0) {
        text += `Condition: ${conditions.join('; ')}<br>`;
    }

    // 添加 process_agents
    const agents = formatDetailList(details.process_agents);
    if (agents.length > 0) {
        text += `Agents: ${agents.join(', ')}<br>`;
    }

    // 添加 media
    const media = formatDetailList(details.media);
    if (media.length > 0) {
        text += `Media: ${media.join(', ')}<br>`;
    }

    // 添加 equipment
    const equipment = formatDetailList(details.equipment);
    if (equipment.length > 0) {
        text += `Equipment: ${equipment.join(', ')}`;
    }

    return text;
}

function buildParallelEdgeMeta(edges) {
    const groups = new Map();
    edges.forEach((edge, index) => {
        const key = `${edge.source}→${edge.target}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(index);
    });

    const meta = new Map();
    groups.forEach(indices => {
        indices.forEach((edgeIndex, parallelIndex) => {
            meta.set(edgeIndex, {
                parallelIndex,
                parallelCount: indices.length
            });
        });
    });
    return meta;
}

function buildEdgePath(sourcePosition, targetPosition, parallelIndex = 0, parallelCount = 1) {
    const dx = targetPosition.x - sourcePosition.x;
    const dy = targetPosition.y - sourcePosition.y;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const perpX = -dy / length;
    const perpY = dx / length;
    const spacing = parallelCount > 8 ? 0.11 : 0.16;
    const offset = parallelCount <= 1 ? 0 : (parallelIndex - (parallelCount - 1) / 2) * spacing;
    const control = {
        x: (sourcePosition.x + targetPosition.x) / 2 + perpX * offset,
        y: (sourcePosition.y + targetPosition.y) / 2 + perpY * offset
    };

    const x = [];
    const y = [];
    for (let step = 0; step <= 12; step += 1) {
        const t = step / 12;
        const oneMinusT = 1 - t;
        x.push(
            oneMinusT * oneMinusT * sourcePosition.x +
            2 * oneMinusT * t * control.x +
            t * t * targetPosition.x
        );
        y.push(
            oneMinusT * oneMinusT * sourcePosition.y +
            2 * oneMinusT * t * control.y +
            t * t * targetPosition.y
        );
    }

    return {
        x,
        y,
        hover: control,
        arrowSource: { x: x[x.length - 2], y: y[y.length - 2] }
    };
}

// 准备 Plotly 数据
function preparePlotlyData(graphData, queryId) {
    const nodes = graphData.nodes;
    const edges = graphData.edges;

    // 节点坐标计算（力导向布局简化版）
    const positions = calculateForceLayout(nodes, edges);
    const savedPositions = graphPositionMemory.get(queryId);
    if (savedPositions) {
        positions.forEach(position => {
            const cached = savedPositions[position.id];
            if (!cached) return;
            if (typeof cached.x !== 'number' || typeof cached.y !== 'number') return;
            position.x = cached.x;
            position.y = cached.y;
        });
    }

    // 构建节点的hover信息
    function buildNodeHoverText(node, edges) {
        let text = `<b>Name:</b> ${node.label}<br><b>Type:</b> ${node.type}`;
        if (['Product', 'Component', 'Material'].includes(node.type)) {
            return text;
        }

        const details = node.details || {};

        if (compactNodeDetailTypes.has(node.type)) {
            return text;
        }

        const condList = details.condition || details.conditions || [];
        if (!['Product', 'Component'].includes(node.type) && condList.length > 0) {
            text += `<br><b>Condition:</b> ${condList.join('; ')}`;
        }

        // experiment_group
        const groups = details.experiment_group || [];
        if (groups.length > 0) {
            text += `<br><b>Group:</b> ${groups.map(g => g.replace(/_/g, ' ')).join(', ')}`;
        }

        // property + value + unit
        const prop = details.property;
        const val = details.value;
        const unit = details.unit;
        if (prop) {
            const propStr = Array.isArray(prop) ? prop.join(', ') : prop;
            let propLine = `<br><b>${propStr}</b>`;
            if (val !== undefined && val !== null && val !== '') {
                const valStr = Array.isArray(val) ? val.join(', ') : val;
                const unitStr = unit ? (Array.isArray(unit) ? unit.join(', ') : unit) : '';
                propLine += `: ${valStr}${unitStr}`;
            }
            text += propLine;
        }

        // process_agents (show names)
        const agents = details.process_agents || [];
        if (agents.length > 0) {
            const agentNames = agents.map(a => typeof a === 'object' ? (a.name || String(a)) : String(a));
            text += `<br><b>Agents:</b> ${agentNames.join(', ')}`;
        }

        // media (show names)
        const media = details.media || [];
        if (media.length > 0) {
            const mediaNames = media.map(m => typeof m === 'object' ? (m.name || String(m)) : String(m));
            text += `<br><b>Media:</b> ${mediaNames.join(', ')}`;
        }

        // equipment (show names)
        const equip = details.equipment || [];
        if (equip.length > 0) {
            const equipNames = equip.map(e => typeof e === 'object' ? (e.name || String(e)) : String(e));
            text += `<br><b>Equipment:</b> ${equipNames.join(', ')}`;
        }

        return text;
    }

    // 节点轨迹
    const nodeTrace = {
        x: positions.map(p => p.x),
        y: positions.map(p => p.y),
        mode: 'markers+text',
        type: 'scatter',
        marker: {
            size: nodes.map(n => n.size),
            color: nodes.map(n => nodeColors[n.type] || '#667eea'),
            line: {
                color: '#ffffff',
                width: 2
            },
            opacity: 0.95,
            shadow: {
                color: 'rgba(102, 126, 234, 0.4)',
                size: 8,
                opacity: 0.3
            }
        },
        text: nodes.map(n => n.label),
        textposition: 'bottom center',
        textfont: {
            size: 11,
            color: '#5a5a6e',
            family: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif'
        },
        hoverinfo: 'text',
        hovertemplate: '%{hovertext}<extra></extra>',
        hovertext: nodes.map(n => buildNodeHoverText(n, edges)),
        name: '节点'
    };

    // 边类型颜色映射
    const edgeColors = {
        'CONTAINS': '#667eea',
        'HAS_OUTPUT': '#ed64a6',
        'HAS_OBSERVATION': '#f6ad55',
        'HAS_INPUT': '#f6ad55',
        'HAS_CONTEXT': '#48bb78',
        'PROCESSED_BY': '#764ba2',
        'RELATED_TO': '#48bb78',
        'TRANSFORMED_TO': '#f6ad55'
    };

    // 提取边的谓词类型
    function getEdgePredicate(label) {
        const parts = label.split(' | ');
        return parts[0];
    }

    // 边轨迹
    const edgeTraces = [];
    const renderedEdges = [];
    const parallelEdgeMeta = buildParallelEdgeMeta(edges);
    edges.forEach((edge, edgeIndex) => {
        const source = nodes.find(n => n.id === edge.source);
        const target = nodes.find(n => n.id === edge.target);

        if (!source || !target) return;

        const sourcePos = positions.find(p => p.id === edge.source);
        const targetPos = positions.find(p => p.id === edge.target);

        if (!sourcePos || !targetPos) return;

        const predicate = getEdgePredicate(edge.label);
        const edgeColor = edgeColors[predicate] || '#764ba2';
        const lineTraceIndex = edgeTraces.length;
        const edgeMeta = parallelEdgeMeta.get(edgeIndex) || { parallelIndex: 0, parallelCount: 1 };
        const edgePath = buildEdgePath(
            sourcePos,
            targetPos,
            edgeMeta.parallelIndex,
            edgeMeta.parallelCount
        );

        edgeTraces.push({
            x: edgePath.x,
            y: edgePath.y,
            mode: 'lines',
            type: 'scatter',
            line: {
                color: edgeColor,
                width: Math.max(edge.width * 0.8, 3),
                opacity: 0.7
            },
            hoverinfo: 'text',
            hoveron: 'points+fills',
            hoverlabel: {
                bgcolor: edgeColor,
                bordercolor: '#fff',
                font: { color: '#fff', size: 12 }
            },
            hovertext: buildEdgeHoverText(edge, source, target, predicate),
            customdata: edgePath.x.map(() => edgeIndex),
            name: edge.label,
            showlegend: false
        });

        const arrowHead = buildEdgeArrowHead(edgePath.arrowSource, targetPos);
        const arrowTraceIndex = edgeTraces.length;

        edgeTraces.push({
            x: arrowHead.x,
            y: arrowHead.y,
            mode: 'lines',
            type: 'scatter',
            line: {
                color: edgeColor,
                width: 2.4,
                opacity: 0.95
            },
            hoverinfo: 'skip',
            showlegend: false,
            name: edge.label + '_arrow'
        });

        // 添加不可见的中间点用于 hover 检测
        const hoverTraceIndex = edgeTraces.length;

        edgeTraces.push({
            x: [edgePath.hover.x],
            y: [edgePath.hover.y],
            mode: 'markers',
            type: 'scatter',
            marker: {
                size: 28,
                color: 'rgba(102, 126, 234, 0.01)',
                opacity: 0.01
            },
            hoverinfo: 'text',
            hoveron: 'points',
            hoverlabel: {
                bgcolor: edgeColor,
                bordercolor: '#fff',
                font: { color: '#fff', size: 12 }
            },
            hovertext: buildEdgeHoverText(edge, source, target, predicate),
            customdata: [edgeIndex],
            name: edge.label + '_hover',
            showlegend: false
        });

        renderedEdges.push({
            source: edge.source,
            target: edge.target,
            lineTraceIndex,
            hoverTraceIndex,
            arrowTraceIndex,
            parallelIndex: edgeMeta.parallelIndex,
            parallelCount: edgeMeta.parallelCount
        });
    });

    // 合并所有轨迹
    return {
        traces: [...edgeTraces, nodeTrace],
        nodes,
        edges,
        positions,
        renderedEdges,
        nodeTraceIndex: edgeTraces.length,
        queryId
    };
}

function buildEdgeArrowHead(sourcePosition, targetPosition) {
    const dx = targetPosition.x - sourcePosition.x;
    const dy = targetPosition.y - sourcePosition.y;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const unitX = dx / length;
    const unitY = dy / length;
    const perpX = -unitY;
    const perpY = unitX;
    const tipDistance = 0.72;
    const baseDistance = 1.08;
    const halfWidth = 0.18;
    const tip = {
        x: targetPosition.x - unitX * tipDistance,
        y: targetPosition.y - unitY * tipDistance
    };
    const base = {
        x: targetPosition.x - unitX * baseDistance,
        y: targetPosition.y - unitY * baseDistance
    };
    const left = {
        x: base.x + perpX * halfWidth,
        y: base.y + perpY * halfWidth
    };
    const right = {
        x: base.x - perpX * halfWidth,
        y: base.y - perpY * halfWidth
    };

    return {
        x: [left.x, tip.x, right.x],
        y: [left.y, tip.y, right.y]
    };
}

// 安装节点拖拽：拖动节点时同步更新相连边
function installNodeDrag(graphContainer, graphState) {
    if (graphContainer._nodeDragAbort) {
        graphContainer._nodeDragAbort.abort();
    }

    const abortController = new AbortController();
    graphContainer._nodeDragAbort = abortController;
    const listenerOptions = { signal: abortController.signal };
    const captureOptions = { signal: abortController.signal, capture: true };
    const positions = graphState.positions.map(position => ({ ...position }));
    const positionById = new Map(positions.map(position => [position.id, position]));
    let hoveredPointIndex = null;
    let draggedPointIndex = null;

    // 节流相关
    let rafId = null;
    let pendingUpdate = false;

    if (graphContainer._nodeDragPlotlyHandlers && typeof graphContainer.removeListener === 'function') {
        const handlers = graphContainer._nodeDragPlotlyHandlers;
        graphContainer.removeListener('plotly_hover', handlers.hover);
        graphContainer.removeListener('plotly_unhover', handlers.unhover);
    }

    const hoverHandler = eventData => {
        const point = eventData.points && eventData.points[0];
        if (point && point.curveNumber === graphState.nodeTraceIndex) {
            hoveredPointIndex = point.pointIndex;
            graphContainer.style.cursor = 'grab';
        }
    };

    const unhoverHandler = () => {
        if (draggedPointIndex === null) {
            hoveredPointIndex = null;
            graphContainer.style.cursor = '';
        }
    };

    graphContainer._nodeDragPlotlyHandlers = {
        hover: hoverHandler,
        unhover: unhoverHandler
    };
    graphContainer.on('plotly_hover', hoverHandler);
    graphContainer.on('plotly_unhover', unhoverHandler);

    graphContainer.addEventListener('pointerdown', event => {
        if (hoveredPointIndex === null || event.button !== 0) return;

        draggedPointIndex = hoveredPointIndex;
        graphContainer.setPointerCapture(event.pointerId);
        graphContainer.style.cursor = 'grabbing';
        Plotly.relayout(graphContainer, { dragmode: false });
        event.preventDefault();
        event.stopPropagation();
    }, captureOptions);

    graphContainer.addEventListener('pointermove', event => {
        if (draggedPointIndex === null) return;

        const nextPosition = pointerToDataCoordinates(graphContainer, event);
        if (!nextPosition) return;

        const draggedPosition = positions[draggedPointIndex];
        draggedPosition.x = nextPosition.x;
        draggedPosition.y = nextPosition.y;

        // 使用节流：标记需要更新但不立即执行
        if (!pendingUpdate) {
            pendingUpdate = true;
            rafId = requestAnimationFrame(() => {
                pendingUpdate = false;
                if (rafId !== null) {
                    updateDraggedNode();
                    updateConnectedEdges(draggedPosition.id);
                    rafId = null;
                }
            });
        }

        event.preventDefault();
    }, captureOptions);

    graphContainer.addEventListener('pointerup', finishDrag, listenerOptions);
    graphContainer.addEventListener('pointercancel', finishDrag, listenerOptions);

    function finishDrag(event) {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        // 执行最后一次更新确保位置正确
        if (draggedPointIndex !== null) {
            updateDraggedNode();
            updateConnectedEdges(positions[draggedPointIndex].id);
        }

        if (draggedPointIndex === null) return;

        // 保存当前子图的节点坐标，切换后返回时恢复用户拖拽布局。
        const snapshot = {};
        positions.forEach(position => {
            snapshot[position.id] = { x: position.x, y: position.y };
        });
        graphPositionMemory.set(graphState.queryId, snapshot);

        if (graphContainer.hasPointerCapture(event.pointerId)) {
            graphContainer.releasePointerCapture(event.pointerId);
        }
        draggedPointIndex = null;
        pendingUpdate = false;
        graphContainer.style.cursor = hoveredPointIndex === null ? '' : 'grab';
        Plotly.relayout(graphContainer, { dragmode: 'pan' });
    }

    function updateDraggedNode() {
        Plotly.restyle(graphContainer, {
            x: [positions.map(position => position.x)],
            y: [positions.map(position => position.y)]
        }, [graphState.nodeTraceIndex]);
    }

    function updateConnectedEdges(nodeId) {
        // 批量更新：收集所有需要更新的边数据
        const lineXUpdates = [];
        const lineYUpdates = [];
        const hoverXUpdates = [];
        const hoverYUpdates = [];
        const arrowXUpdates = [];
        const arrowYUpdates = [];
        const lineIndices = [];
        const hoverIndices = [];
        const arrowIndices = [];

        graphState.renderedEdges.forEach(edge => {
            if (edge.source !== nodeId && edge.target !== nodeId) return;

            const sourcePosition = positionById.get(edge.source);
            const targetPosition = positionById.get(edge.target);
            if (!sourcePosition || !targetPosition) return;
            const edgePath = buildEdgePath(
                sourcePosition,
                targetPosition,
                edge.parallelIndex,
                edge.parallelCount
            );

            lineIndices.push(edge.lineTraceIndex);
            lineXUpdates.push(edgePath.x);
            lineYUpdates.push(edgePath.y);

            hoverIndices.push(edge.hoverTraceIndex);
            hoverXUpdates.push([edgePath.hover.x]);
            hoverYUpdates.push([edgePath.hover.y]);

            const arrowHead = buildEdgeArrowHead(edgePath.arrowSource, targetPosition);
            arrowIndices.push(edge.arrowTraceIndex);
            arrowXUpdates.push(arrowHead.x);
            arrowYUpdates.push(arrowHead.y);
        });

        // 批量执行更新
        if (lineIndices.length > 0) {
            Plotly.restyle(graphContainer, {
                x: lineXUpdates,
                y: lineYUpdates
            }, lineIndices);

            Plotly.restyle(graphContainer, {
                x: hoverXUpdates,
                y: hoverYUpdates
            }, hoverIndices);

            Plotly.restyle(graphContainer, {
                x: arrowXUpdates,
                y: arrowYUpdates
            }, arrowIndices);
        }
    }
}

function pointerToDataCoordinates(graphContainer, event) {
    const fullLayout = graphContainer._fullLayout;
    if (!fullLayout || !fullLayout._size) return null;

    const bounds = graphContainer.getBoundingClientRect();
    const size = fullLayout._size;
    const plotX = event.clientX - bounds.left - size.l;
    const plotY = event.clientY - bounds.top - size.t;
    const xRange = fullLayout.xaxis.range;
    const yRange = fullLayout.yaxis.range;

    return {
        x: xRange[0] + (plotX / size.w) * (xRange[1] - xRange[0]),
        y: yRange[1] - (plotY / size.h) * (yRange[1] - yRange[0])
    };
}

// 语义模板初始化 + 轻量力导向微调
function calculateForceLayout(nodes, edges) {
    const positions = buildSemanticInitialPositions(nodes, edges);
    const templatePositions = Object.fromEntries(
        Object.entries(positions).map(([id, position]) => [id, { ...position }])
    );

    // 模板已经表达语义方向，力导向只负责轻微拉开重叠节点。
    for (let iter = 0; iter < 36; iter++) {
        const forces = {};

        nodes.forEach(node => {
            forces[node.id] = { x: 0, y: 0 };
        });

        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const nodeA = nodes[i];
                const nodeB = nodes[j];
                const posA = positions[nodeA.id];
                const posB = positions[nodeB.id];
                
                const dx = posB.x - posA.x;
                const dy = posB.y - posA.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;

                const labelPadding = Math.min((nodeA.label.length + nodeB.label.length) * 0.006, 0.28);
                const force = (0.22 + labelPadding) / (dist * dist);
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;

                forces[nodeA.id].x -= fx;
                forces[nodeA.id].y -= fy;
                forces[nodeB.id].x += fx;
                forces[nodeB.id].y += fy;
            }
        }

        edges.forEach(edge => {
            const posA = positions[edge.source];
            const posB = positions[edge.target];

            if (!posA || !posB) return;

            const dx = posB.x - posA.x;
            const dy = posB.y - posA.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
            const targetDistance = getTargetEdgeDistance(edge.label);
            const force = (dist - targetDistance) * 0.012;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            forces[edge.source].x += fx;
            forces[edge.source].y += fy;
            forces[edge.target].x -= fx;
            forces[edge.target].y -= fy;
        });

        nodes.forEach(node => {
            const pos = positions[node.id];
            const force = forces[node.id];
            const anchor = templatePositions[node.id];

            force.x += (anchor.x - pos.x) * 0.045;
            force.y += (anchor.y - pos.y) * 0.045;

            pos.x += force.x * 0.12;
            pos.y += force.y * 0.12;

            pos.x = clamp(pos.x, -5.35, 5.35);
            pos.y = clamp(pos.y, -5.2, 5.2);
        });
    }

    return nodes.map(node => ({
        id: node.id,
        x: positions[node.id].x,
        y: positions[node.id].y
    }));
}

function buildSemanticInitialPositions(nodes, edges) {
    const positions = {};
    const nodeIds = new Set(nodes.map(node => node.id));
    const has = id => nodeIds.has(id);
    const set = (id, x, y) => {
        if (has(id)) positions[id] = { x, y };
    };
    const placeColumn = (ids, x, topY, gap) => {
        ids.filter(has).forEach((id, index) => set(id, x, topY - index * gap));
    };
    const placeGrid = (ids, startX, startY, columns, xGap, yGap) => {
        ids.filter(has).forEach((id, index) => {
            const col = index % columns;
            const row = Math.floor(index / columns);
            set(id, startX + col * xGap, startY - row * yGap);
        });
    };

    if (has('bioleaching')) {
        // Product & Components (left column)
        set('mobile_phone', -4.2, 3.2);
        set('printed_circuit_board', -4.2, 1.6);
        set('cover', -4.2, 0.1);
        set('silver', -1.65, 3.2);
        set('gold', -1.65, 1.6);
        set('copper', -1.65, 0.1);
        // Process center
        set('bioleaching', -0.25, 2.0);
        set('gold_leaching', -0.25, 0.5);
        set('metal_leaching', -0.25, -1.0);
        // Equipment (bottom)
        set('incubator_shaker', -0.25, -2.0);
        set('erlenmeyer_flask', 1.55, -2.0);
        set('orbital_shaker', 1.55, -3.0);
    } else if (has('dissolution')) {
        set('li_battery', -4.5, 0.9);
        set('cathode', -3, 0.45);
        set('licoo2', -1.35, 0.1);
        set('dissolution', 0.55, 0.1);
        set('phosphoric_acid', 0.2, 1.85);
        set('h2o2', -1.05, 1.75);
        set('lithium', 2.35, 0.9);
        set('cobalt', 2.35, -0.85);
        set('li3po4', 4.25, 1.15);
        set('coc2o4', 4.25, -1.1);
        set('mn', 0.5, -2.15);
    } else if (has('leaching') && has('bmim_hso4')) {
        set('wpcb', -4.45, 0.35);
        set('leaching', -1.45, 0.35);
        set('copper', 2.45, 0.2);
        placeColumn(['bso4hpy', 'bso3hpy', 'bmim_hso4', 'bso3hmim', 'mim_hso4', 'bso4hmim'], 0.55, 2.55, 0.86);
        set('hydrogen_peroxide', -1.55, -1.65);
        set('nitric_acid', -0.35, -2.45);
        set('water_bath', -4.1, -1.65);
        set('icp', 4.15, -1.45);
    } else if (has('Product_Nokia_5110_Instance')) {
        set('Product_Nokia_5110_Instance', -4.2, 0.25);
        placeColumn([
            'Component_battery_Class',
            'Component_electronic_parts_Class',
            'Component_Metal_parts__mounts__screws_Class',
            'Component_Plastic_parts__housing_components__cases__enclosures__covers_Class',
            'Component_display_Class'
        ], -2.1, 1.9, 0.95);
        placeGrid([
            'Material_Cu_Class', 'Material_Fe_Class', 'Material_Ni_Class', 'Material_Sn_Class',
            'Material_Ag_Class', 'Material_Au_Class', 'Material_Pb_Class', 'Material_Cr_Class',
            'Material_Zn_Class', 'Material_Co_Class', 'Material_Ti_Class', 'Material_Ca_Class',
            'Material_Mn_Class', 'Material_Al_Class', 'Material_Pd_Class', 'Material_Pt_Class',
            'Material_Mg_Class', 'Material_Mo_Class', 'Material_V_Class', 'Material_Cd_Class',
            'Material_Other_metals_Class'
        ], 0.3, 2.6, 5, 1.08, 0.78);
    } else if (has('sony_t230')) {
        set('sony_t230', -4.15, 0.25);
        placeColumn(['battery', 'electronic_part', 'plastic_parts', 'display', 'metal_part'], -2.25, 2.35, 1.05);
        set('total_weight', -4.25, -2.45);
        set('pc_abs', -0.35, 0.25);
        placeGrid(['cu', 'fe', 'sn', 'ni', 'cr', 'pb', 'ag', 'au', 'al', 'zn', 'mn', 'co', 'ca', 'ti'], 0.2, 2.75, 4, 1.18, 0.82);
    } else if (has('primary_amide')) {
        set('phone', -4, 0.85);
        set('gold', -0.25, 0.25);
        placeColumn(['fe', 'cu', 'sn', 'zn'], -3.35, -0.65, 0.7);
        set('solvent_extraction', 1.55, -0.75);
        set('primary_amide', 2.15, 1.6);
        set('primary_amide_l', 2.15, 0.72);
        set('toluene', 4.05, 1.75);
        set('hcl', 4.05, 0.82);
        set('aucl4', 0.55, -2.05);
        set('mibk', 2.6, -2.35);
        set('dbc', 3.85, -1.7);
    }

    // 通用分层布局：优先按类型从左到右排列，保证 Product -> Component -> Material 可读。
    const degreeMap = new Map(nodes.map(node => [node.id, 0]));
    edges.forEach(edge => {
        degreeMap.set(edge.source, (degreeMap.get(edge.source) || 0) + 1);
        degreeMap.set(edge.target, (degreeMap.get(edge.target) || 0) + 1);
    });

    const rankByType = {
        Product: 0,
        Component: 1,
        Process: 2,
        ProcessAgent: 2,
        Material: 3,
        Observation: 4,
        Equipment: 4,
        Hazard: 4
    };

    const unpositioned = nodes.filter(node => !positions[node.id]);
    const layers = new Map();
    unpositioned.forEach(node => {
        const rank = rankByType[node.type] !== undefined ? rankByType[node.type] : 3;
        if (!layers.has(rank)) {
            layers.set(rank, []);
        }
        layers.get(rank).push(node);
    });

    const activeRanks = Array.from(layers.keys()).sort((a, b) => a - b);
    const rankCount = Math.max(activeRanks.length, 1);

    activeRanks.forEach((rank, rankIndex) => {
        const layerNodes = layers.get(rank);
        layerNodes.sort((a, b) => {
            const degreeDiff = (degreeMap.get(b.id) || 0) - (degreeMap.get(a.id) || 0);
            if (degreeDiff !== 0) return degreeDiff;
            return String(a.label).localeCompare(String(b.label));
        });

        const x = rankCount === 1
            ? 0
            : -4.4 + (rankIndex * (8.8 / (rankCount - 1)));
        const count = layerNodes.length;
        const yGap = count <= 1 ? 0 : Math.min(0.95, 6.8 / (count - 1));
        const topY = count <= 1 ? 0 : ((count - 1) * yGap) / 2;

        layerNodes.forEach((node, index) => {
            positions[node.id] = {
                x,
                y: topY - index * yGap
            };
        });
    });

    return positions;
}

function getTargetEdgeDistance(label) {
    const predicate = label.split(' | ')[0];
    const distances = {
        CONTAINS: 1.75,
        PROCESSED_BY: 2.05,
        TRANSFORMED_TO: 1.85,
        HAS_OBSERVATION: 2.15,
        RELATED_TO: 1.65
    };

    return distances[predicate] || 1.9;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getCurrentPaperTitle() {
    const query = fullQueries.find(item => item.id === currentQuery);
    return query ? (query.source_title || query.title) : '';
}

function updateSourcePaperTooltip() {
    const sourcePaperItem = document.getElementById('stat-papers-item');
    const sourcePaperTooltip = document.getElementById('stat-papers-tooltip');
    if (!sourcePaperItem || !sourcePaperTooltip) return;

    const title = getCurrentPaperTitle();
    sourcePaperTooltip.textContent = title ? `Source paper: ${title}` : 'Select a paper to view its source title';
    sourcePaperItem.setAttribute('aria-label', sourcePaperTooltip.textContent);
}

// 更新统计信息
function updateStats(stats) {
    animateNumber('stat-nodes', stats.nodes);
    animateNumber('stat-edges', stats.edges);
    animateNumber('stat-papers', stats.papers);
    updateSourcePaperTooltip();
}

// 渲染图例
function renderLegend(graphData) {
    const nodeTypeOrder = ['Product', 'Component', 'Process', 'Material'];
    const nodeTypes = [...new Set(graphData.nodes.map(n => n.type))].sort((a, b) => {
        const aIndex = nodeTypeOrder.indexOf(a);
        const bIndex = nodeTypeOrder.indexOf(b);
        const aKnown = aIndex !== -1;
        const bKnown = bIndex !== -1;

        if (aKnown && bKnown) return aIndex - bIndex;
        if (aKnown) return -1;
        if (bKnown) return 1;
        return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
    const edgeTypeOrder = [
        'CONTAINS',
        'PROCESSED_BY',
        'HAS_OUTPUT',
        'HAS_OBSERVATION',
        'HAS_INPUT',
        'HAS_CONTEXT',
        'RELATED_TO',
        'TRANSFORMED_TO'
    ];
    const edgeTypes = [...new Set(graphData.edges.map(e => e.label.split(' | ')[0]))].sort((a, b) => {
        const aIndex = edgeTypeOrder.indexOf(a);
        const bIndex = edgeTypeOrder.indexOf(b);
        const aKnown = aIndex !== -1;
        const bKnown = bIndex !== -1;

        if (aKnown && bKnown) return aIndex - bIndex;
        if (aKnown) return -1;
        if (bKnown) return 1;
        return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });

    const nodeLegend = document.getElementById('legend-nodes');
    const edgeLegend = document.getElementById('legend-edges');

    // 节点类型图例
    nodeLegend.innerHTML = nodeTypes.map(type => {
        const color = nodeColors[type] || '#667eea';
        return `
            <div class="legend-item">
                <div class="legend-color" style="background: ${color}"></div>
                <span>${type}</span>
            </div>
        `;
    }).join('');

    // 边类型图例
    const edgeColors = {
        'CONTAINS': '#667eea',
        'HAS_OUTPUT': '#ed64a6',
        'HAS_OBSERVATION': '#f6ad55',
        'HAS_INPUT': '#f6ad55',
        'HAS_CONTEXT': '#48bb78',
        'PROCESSED_BY': '#764ba2',
        'RELATED_TO': '#48bb78',
        'TRANSFORMED_TO': '#f6ad55'
    };

    edgeLegend.innerHTML = edgeTypes.map(type => {
        const color = edgeColors[type] || '#764ba2';
        return `
            <div class="legend-item">
                <div class="legend-line" style="background: ${color}"></div>
                <span>${type}</span>
            </div>
        `;
    }).join('');
}

// 数字动画
function animateNumber(elementId, target) {
    const element = document.getElementById(elementId);
    let current = 0;
    const increment = Math.ceil(target / 20);
    
    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            element.textContent = target;
            clearInterval(timer);
        } else {
            element.textContent = current;
        }
    }, 30);
}

// 设置事件监听
function setupEventListeners() {
    // 搜索框实时过滤
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderQueryList(searchInput.value);
            renderTitleSuggestions(searchInput.value);
            showTitleSuggestions();
        });

        searchInput.addEventListener('focus', () => {
            renderTitleSuggestions('');
            document.getElementById('title-suggestions')?.classList.add('open');
        });
        searchInput.addEventListener('click', () => {
            renderTitleSuggestions('');
            document.getElementById('title-suggestions')?.classList.add('open');
        });

        searchInput.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                hideTitleSuggestions();
                searchInput.blur();
            }
        });
    }

    const nodeInput = document.getElementById('node-search-input');
    if (nodeInput) {
        nodeInput.addEventListener('input', () => {
            renderNodeSuggestions(nodeInput.value);
            showNodeSuggestions(false);

            if (!nodeInput.value.trim() && currentQuery && currentFullGraphData && currentRootNodeId) {
                currentRootNodeId = null;
                currentViewGraphData = currentFullGraphData;
                renderCurrentGraph();
            }
        });

        nodeInput.addEventListener('focus', () => showNodeSuggestions(true));
        nodeInput.addEventListener('click', () => showNodeSuggestions(true));

        nodeInput.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                hideNodeSuggestions();
                nodeInput.blur();
            }
        });
    }

    document.addEventListener('click', event => {
        const titleSearchBox = document.getElementById('search-input')?.closest('.search-box');
        if (titleSearchBox && !titleSearchBox.contains(event.target)) {
            hideTitleSuggestions();
        }

        const nodeSearchBox = document.getElementById('node-search-input')?.closest('.search-box');
        if (nodeSearchBox && !nodeSearchBox.contains(event.target)) {
            hideNodeSuggestions();
        }
    });

    const suggestions = document.getElementById('title-suggestions');
    if (suggestions) {
        suggestions.addEventListener('mousedown', event => {
            event.preventDefault();
        });
    }

    const nodeSuggestions = document.getElementById('node-suggestions');
    if (nodeSuggestions) {
        nodeSuggestions.addEventListener('mousedown', event => {
            event.preventDefault();
        });
    }

    const materialValueFilter = document.getElementById('hide-material-no-value');
    if (materialValueFilter) {
        hideMaterialNoValueEdges = materialValueFilter.checked;
        materialValueFilter.addEventListener('change', () => {
            hideMaterialNoValueEdges = materialValueFilter.checked;
            renderCurrentGraph();
        });
    }

    // 窗口大小变化时重绘
    window.addEventListener('resize', () => {
        if (currentQuery && currentRenderedGraphData) {
            renderGraph(currentQuery, currentRenderedGraphData);
        }
    });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
