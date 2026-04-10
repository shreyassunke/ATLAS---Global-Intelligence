const fs = require('fs');

function refactorFetchManager() {
  const file = 'src/workers/fetchManager.worker.js';
  let content = fs.readFileSync(file, 'utf8');

  // Replace constants
  content = content.replace(
    /const TIER_COLORS = \{ latent: '#1a90ff', active: '#ffaa00', critical: '#ff2222' \}/g,
    `const DIMENSION_COLORS = { safety: '#E24B4A', governance: '#7F77DD', economy: '#EF9F27', people: '#1D9E75', environment: '#888780', narrative: '#378ADD' }`
  );
  content = content.replace(/const TIER_SHAPES = \{[^\}]+\}\s*\n/g, '');

  content = content.replace(/function makeEvent\(fields\) \{/g, `function makeEvent(fields) {\n  const priority = fields.priority || fields.tier || 'p3'\n`);
  content = content.replace(/const tier = fields\.tier \|\| 'latent'/g, '');

  // makeEvent object creation
  content = content.replace(/tier\,/g, 'priority,\n    tier: priority, // legacy compat\n');
  content = content.replace(/shape: TIER_SHAPES\[tier\],/g, '');
  content = content.replace(/domain: fields\.domain \|\| 'signals',/g, 'dimension: fields.dimension || \'narrative\',');
  content = content.replace(/icon: fields\.domain \|\| 'signals',/g, 'icon: fields.dimension || \'narrative\',');
  content = content.replace(/color: TIER_COLORS\[tier\],/g, 'color: DIMENSION_COLORS[fields.dimension || \'narrative\'],');

  // Replace tier string literals to p1/p2/p3 in normalizers
  // We'll replace all domain: 'x' -> dimension: 'y'
  const replacements = {
    "domain: 'natural'": "dimension: 'environment'",
    "domain: 'signals'": "dimension: 'narrative'",
    "domain: 'economic'": "dimension: 'economy'",
    "domain: 'cyber'": "dimension: 'safety'",
    "domain: 'conflict'": "dimension: 'safety'",
    "domain: 'humanitarian'": "dimension: 'people'",
    "domain: 'hazard'": "dimension: 'environment'"
  };

  for (const [oldVal, newVal] of Object.entries(replacements)) {
    content = content.split(oldVal).join(newVal);
  }

  // Replace tier string updates (tier = 'latent' -> priority = 'p3', etc)
  // Let's just blindly map the ones setting tier in makeEvent objects:
  content = content.replace(/tier: 'latent'/g, "priority: 'p3'");
  content = content.replace(/tier: 'active'/g, "priority: 'p2'");
  content = content.replace(/tier: 'critical'/g, "priority: 'p1'");

  content = content.replace(/let tier = 'latent'/g, "let priority = 'p3'");
  content = content.replace(/let tier = 'active'/g, "let priority = 'p2'");
  content = content.replace(/tier = 'critical'/g, "priority = 'p1'");
  content = content.replace(/tier = 'active'/g, "priority = 'p2'");
  content = content.replace(/tier = 'latent'/g, "priority = 'p3'");

  fs.writeFileSync(file, content);
}

function refactorEventBus() {
  const file = 'src/workers/eventBus.worker.js';
  let content = fs.readFileSync(file, 'utf8');

  // rename tierCounts to priorityCounts, though maybe not if the refactor spec specifies it.
  content = content.replace(/tierCounts:/g, "priorityCounts:");
  content = content.replace(/latent: 0, active: 0, critical: 0/g, "p3: 0, p2: 0, p1: 0");
  content = content.replace(/tierCounts\[event\.tier\]\+\+/g, "// Backwards compat loop for tierCounts replaced\n      if(event.priority) stats.priorityCounts[event.priority]++");
  content = content.replace(/tierCounts\[ev\.tier\]/g, "priorityCounts[ev.priority]");
  content = content.replace(/activeDomains\.has/g, "activeDimensions.has");
  content = content.replace(/ev\.domain/g, "ev.dimension");

  fs.writeFileSync(file, content);
}

function refactorAtlasStore() {
  const file = 'src/store/atlasStore.js';
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');

  content = content.replace(/activeDomains: new Set\(\['conflict', 'cyber', 'natural', 'humanitarian', 'economic', 'signals', 'hazard'\]\),/g, "activeDimensions: new Set(['safety', 'governance', 'economy', 'people', 'environment', 'narrative']),");
  content = content.replace(/tierCounts: \{ latent: 0, active: 0, critical: 0 \}/g, "priorityCounts: { p1: 0, p2: 0, p3: 0 }");
  content = content.replace(/severityFloor: 1,/g, "priorityFilter: 'p1',\n  timeFilter: 'live',");

  content = content.replace(/toggleDomain:/g, "toggleDimension:");
  content = content.replace(/activeDomains = new Set\(get\(\)\.activeDomains\)/g, "activeDimensions = new Set(get().activeDimensions)");
  content = content.replace(/activeDomains\.has\(id\)/g, "activeDimensions.has(id)");
  content = content.replace(/activeDomains\.delete\(id\)/g, "activeDimensions.delete(id)");
  content = content.replace(/activeDomains\.add\(id\)/g, "activeDimensions.add(id)");
  content = content.replace(/activeDomains/g, "activeDimensions");

  content = content.replace(/tierCounts:/g, "priorityCounts:");

  fs.writeFileSync(file, content);
}

refactorFetchManager();
refactorEventBus();
refactorAtlasStore();
