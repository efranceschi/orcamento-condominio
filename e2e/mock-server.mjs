/**
 * Mock API server for e2e tests.
 * Simulates the Rust backend HTTP API with in-memory data.
 */
import http from "node:http";

// ── In-memory database ──────────────────────────────────────

let nextId = 1;
const id = () => nextId++;

let scenarios = [];
let categories = [];
let items = [];
let values = [];
let parameters = {
  id: 1,
  total_square_meters: 150000,
  lot_simulation_1: 250,
  lot_simulation_2: 450,
  lot_simulation_3: 800,
  habite_se_discount: 10,
};

function reset() {
  nextId = 1;
  scenarios = [];
  categories = [];
  items = [];
  values = [];
}

function now() {
  return new Date().toISOString();
}

// ── Route handlers ──────────────────────────────────────────

function listScenarios(query) {
  let result = [...scenarios];
  if (query.year) result = result.filter((s) => s.year === Number(query.year));
  if (query.is_baseline !== undefined)
    result = result.filter((s) => s.is_baseline === (query.is_baseline === "true"));
  return result;
}

function getScenario(id) {
  return scenarios.find((s) => s.id === id);
}

function createScenario(body) {
  const s = {
    id: id(),
    name: body.name,
    description: body.description || null,
    year: body.year,
    base_scenario_id: body.base_scenario_id || null,
    is_baseline: body.is_baseline || false,
    is_approved: false,
    is_closed: false,
    general_adjustment: 0,
    risk_margin: 0,
    created_at: now(),
    updated_at: now(),
  };
  scenarios.push(s);
  // Create root categories
  categories.push({
    id: id(), scenario_id: s.id, parent_category_id: null,
    name: "DESPESAS", code: "D", item_type: "expense",
    order: 1, adjustment_percent: null,
    created_at: now(), updated_at: now(),
    subcategories: [], items: [],
  });
  categories.push({
    id: id(), scenario_id: s.id, parent_category_id: null,
    name: "RECEITAS", code: "R", item_type: "revenue",
    order: 2, adjustment_percent: null,
    created_at: now(), updated_at: now(),
    subcategories: [], items: [],
  });
  return s;
}

function updateScenario(sid, body) {
  const s = scenarios.find((s) => s.id === sid);
  if (!s) return null;
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== null && k in s) s[k] = v;
  }
  s.updated_at = now();
  return s;
}

function deleteScenario(sid) {
  scenarios = scenarios.filter((s) => s.id !== sid);
  const catIds = categories.filter((c) => c.scenario_id === sid).map((c) => c.id);
  categories = categories.filter((c) => c.scenario_id !== sid);
  const itemIds = items.filter((i) => catIds.includes(i.category_id)).map((i) => i.id);
  items = items.filter((i) => !catIds.includes(i.category_id));
  values = values.filter((v) => !itemIds.includes(v.item_id));
}

function listCategories(scenarioId) {
  const all = categories.filter((c) => c.scenario_id === scenarioId);
  function buildTree(parentId) {
    return all
      .filter((c) => c.parent_category_id === parentId)
      .map((c) => ({ ...c, subcategories: buildTree(c.id), items: items.filter((i) => i.category_id === c.id) }));
  }
  return buildTree(null);
}

function createCategory(body) {
  const c = {
    id: id(), scenario_id: body.scenario_id,
    parent_category_id: body.parent_category_id || null,
    name: body.name, description: body.description || null,
    code: body.code || null, item_type: body.item_type,
    order: body.order || 0, adjustment_percent: body.adjustment_percent || null,
    created_at: now(), updated_at: now(),
    subcategories: [], items: [],
  };
  categories.push(c);
  return c;
}

function updateCategory(cid, body) {
  const c = categories.find((c) => c.id === cid);
  if (!c) return null;
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && k in c) c[k] = v;
  }
  c.updated_at = now();
  return c;
}

function deleteCategory(cid) {
  const hasChildren = categories.some((c) => c.parent_category_id === cid);
  const hasItems = items.some((i) => i.category_id === cid);
  if (hasChildren) return { error: "Categoria possui subcategorias" };
  if (hasItems) return { error: "Categoria possui itens" };
  categories = categories.filter((c) => c.id !== cid);
  return null;
}

function listItems(categoryId) {
  return items
    .filter((i) => i.category_id === categoryId)
    .map((i) => ({
      ...i,
      values: values.filter((v) => v.item_id === i.id).map((v) => ({
        ...v,
        estimated: v.estimated_fixed || v.budgeted * 1.1,
        variance: v.realized != null ? v.realized - v.budgeted : null,
        variance_percent: v.realized != null && v.budgeted > 0 ? ((v.realized - v.budgeted) / v.budgeted) * 100 : null,
        used_percent: v.realized != null && v.budgeted > 0 ? (v.realized / v.budgeted) * 100 : null,
      })),
      effective_adjustment_percent: i.adjustment_percent || 0,
    }));
}

function createItem(body) {
  const i = {
    id: id(), category_id: body.category_id, name: body.name,
    description: body.description || null, unit: body.unit || null,
    order: body.order || 0, adjustment_percent: body.adjustment_percent || null,
    repeats_next_budget: body.repeats_next_budget || false,
    is_optional: body.is_optional || false,
    observations: body.observations || null,
    values: [], effective_adjustment_percent: null,
  };
  items.push(i);
  if (body.budgeted !== undefined) {
    const v = {
      id: id(), item_id: i.id,
      budgeted: body.budgeted || 0, realized: body.realized || null,
      adjusted: body.adjusted || null, estimated_fixed: null,
      adjustment_percent: null, custom_adjustment: null, notes: null,
      created_at: now(), updated_at: now(),
    };
    values.push(v);
  }
  return i;
}

function updateItem(iid, body) {
  const i = items.find((i) => i.id === iid);
  if (!i) return null;
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && k in i) i[k] = v;
  }
  return i;
}

function deleteItem(iid) {
  items = items.filter((i) => i.id !== iid);
  values = values.filter((v) => v.item_id !== iid);
}

function createValue(body) {
  const v = {
    id: id(), item_id: body.item_id,
    budgeted: body.budgeted || 0, realized: body.realized || null,
    adjusted: body.adjusted || null, estimated_fixed: body.estimated_fixed || null,
    adjustment_percent: body.adjustment_percent || null,
    custom_adjustment: body.custom_adjustment || null,
    notes: body.notes || null,
    created_at: now(), updated_at: now(),
  };
  values.push(v);
  return v;
}

function updateValue(vid, body) {
  const v = values.find((v) => v.id === vid);
  if (!v) return null;
  for (const [k, val] of Object.entries(body)) {
    if (val !== undefined && k in v) v[k] = val;
  }
  v.updated_at = now();
  return v;
}

function getScenarioSummary(scenarioId) {
  const s = scenarios.find((s) => s.id === scenarioId);
  if (!s) return null;
  const cats = listCategories(scenarioId);

  function sumCat(cat) {
    let b = 0, r = 0, e = 0;
    const catItems = items.filter((i) => i.category_id === cat.id);
    for (const item of catItems) {
      const vals = values.filter((v) => v.item_id === item.id);
      for (const v of vals) {
        b += v.budgeted || 0;
        r += v.realized || 0;
        e += v.estimated_fixed || v.budgeted * 1.1;
      }
    }
    const subs = (cat.subcategories || []).map(sumCat);
    for (const sub of subs) { b += sub.total_budgeted; r += sub.total_realized; e += sub.total_estimated; }
    return {
      category_id: cat.id, name: cat.name, code: cat.code, item_type: cat.item_type,
      total_budgeted: b, total_realized: r, total_estimated: e,
      variance: r - b, variance_percent: b > 0 ? ((r - b) / b) * 100 : 0,
      subcategories: subs,
    };
  }

  const catSummaries = cats.map(sumCat);
  const exp = catSummaries.filter((c) => c.item_type === "expense");
  const rev = catSummaries.filter((c) => c.item_type === "revenue");
  const sumArr = (arr, key) => arr.reduce((a, c) => a + c[key], 0);

  return {
    scenario_id: s.id, scenario_name: s.name, year: s.year,
    total_expenses_budgeted: sumArr(exp, "total_budgeted"),
    total_expenses_realized: sumArr(exp, "total_realized"),
    total_expenses_estimated: sumArr(exp, "total_estimated"),
    total_revenues_budgeted: sumArr(rev, "total_budgeted"),
    total_revenues_realized: sumArr(rev, "total_realized"),
    total_revenues_estimated: sumArr(rev, "total_estimated"),
    balance_budgeted: sumArr(rev, "total_budgeted") - sumArr(exp, "total_budgeted"),
    balance_realized: sumArr(rev, "total_realized") - sumArr(exp, "total_realized"),
    balance_estimated: sumArr(rev, "total_estimated") - sumArr(exp, "total_estimated"),
    categories: catSummaries,
  };
}

function getDbStats() {
  return {
    scenarios: scenarios.length,
    categories: categories.length,
    items: items.length,
    values: values.length,
    total_records: scenarios.length + categories.length + items.length + values.length,
    size_bytes: 4096,
    size_mb: 0.004,
  };
}

function exportData() {
  return JSON.stringify({ version: "1.0", exported_at: now(), scenarios, parameters });
}

// ── HTTP Server ─────────────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
  });
}

function parseQuery(url) {
  const q = {};
  const idx = url.indexOf("?");
  if (idx >= 0) {
    new URLSearchParams(url.slice(idx)).forEach((v, k) => (q[k] = v));
  }
  return q;
}

const server = http.createServer(async (req, res) => {
  const url = req.url;
  const method = req.method;
  const query = parseQuery(url);
  const path = url.split("?")[0];

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const json = (data, status = 200) => { res.writeHead(status); res.end(JSON.stringify(data)); };
  const noContent = () => { res.writeHead(204); res.end(); };

  // Reset endpoint for tests
  if (path === "/api/__reset" && method === "POST") { reset(); return json({ ok: true }); }

  // Scenarios
  if (path === "/api/scenarios" && method === "GET") return json(listScenarios(query));
  if (path === "/api/scenarios" && method === "POST") { const b = await parseBody(req); return json(createScenario(b), 201); }
  const scenarioMatch = path.match(/^\/api\/scenarios\/(\d+)$/);
  if (scenarioMatch) {
    const sid = Number(scenarioMatch[1]);
    if (method === "GET") { const s = getScenario(sid); return s ? json(s) : json({ error: "Not found" }, 404); }
    if (method === "PUT") { const b = await parseBody(req); const s = updateScenario(sid, b); return s ? json(s) : json({ error: "Not found" }, 404); }
    if (method === "DELETE") { deleteScenario(sid); return noContent(); }
  }

  // Categories
  const catListMatch = path.match(/^\/api\/categories\/(\d+)$/);
  if (catListMatch && method === "GET") return json(listCategories(Number(catListMatch[1])));
  if (path === "/api/categories" && method === "POST") { const b = await parseBody(req); return json(createCategory(b), 201); }
  const catMatch = path.match(/^\/api\/categories\/(\d+)$/) && method !== "GET";
  if (catMatch) {
    const cid = Number(path.match(/^\/api\/categories\/(\d+)$/)[1]);
    if (method === "PUT") { const b = await parseBody(req); return json(updateCategory(cid, b)); }
    if (method === "DELETE") { const err = deleteCategory(cid); return err ? json(err, 409) : noContent(); }
  }
  const catItemMatch = path.match(/^\/api\/categories\/item\/(\d+)$/);
  if (catItemMatch && method === "GET") {
    const c = categories.find((c) => c.id === Number(catItemMatch[1]));
    return c ? json(c) : json({ error: "Not found" }, 404);
  }

  // Items
  const itemListMatch = path.match(/^\/api\/items\/by-category\/(\d+)$/);
  if (itemListMatch && method === "GET") return json(listItems(Number(itemListMatch[1])));
  if (path === "/api/items" && method === "POST") { const b = await parseBody(req); return json(createItem(b), 201); }
  const itemMatch = path.match(/^\/api\/items\/(\d+)$/);
  if (itemMatch) {
    const iid = Number(itemMatch[1]);
    if (method === "GET") { const i = items.find((i) => i.id === iid); return i ? json(i) : json({ error: "Not found" }, 404); }
    if (method === "PUT") { const b = await parseBody(req); return json(updateItem(iid, b)); }
    if (method === "DELETE") { deleteItem(iid); return noContent(); }
  }

  // Values
  if (path === "/api/values" && method === "POST") { const b = await parseBody(req); return json(createValue(b), 201); }
  const valMatch = path.match(/^\/api\/values\/(\d+)$/);
  if (valMatch && method === "PUT") { const b = await parseBody(req); return json(updateValue(Number(valMatch[1]), b)); }

  // Parameters
  if (path === "/api/parameters" && method === "GET") return json(parameters);
  if (path === "/api/parameters" && method === "PUT") {
    const b = await parseBody(req);
    Object.assign(parameters, b);
    return json(parameters);
  }

  // Analysis
  const summaryMatch = path.match(/^\/api\/analysis\/summary\/(\d+)$/);
  if (summaryMatch && method === "GET") {
    const s = getScenarioSummary(Number(summaryMatch[1]));
    return s ? json(s) : json({ error: "Not found" }, 404);
  }

  // Backup
  if (path === "/api/backup/stats" && method === "GET") return json(getDbStats());
  if (path === "/api/backup/export" && method === "GET") return json(JSON.parse(exportData()));

  // Not found
  json({ error: `Route not found: ${method} ${path}` }, 404);
});

server.listen(3333, () => {
  console.log("Mock API server running on http://localhost:3333");
});
