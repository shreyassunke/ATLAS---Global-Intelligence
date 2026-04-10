const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if(isDirectory) walk(dirPath, callback);
    else callback(path.join(dir, f));
  });
}

function processFile(file) {
  if (!file.match(/\.(js|jsx|css)$/)) return;
  if (file.includes('eventSchema.js')) return; // handled manually
  if (file.includes('earthquakeService.js')) return; // handled
  if (file.includes('firmsService.js')) return; // handled
  if (file.includes('seismic.js')) return; // handled
  if (file.includes('globeLayers.js')) return; // handled
  if (file.includes('DimensionFilters.jsx')) return; // handled
  if (file.includes('usePreferencesSync.js')) return; // handled

  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Replacements
  content = content.replace(/activeDomains/g, 'activeDimensions');
  content = content.replace(/toggleDomain/g, 'toggleDimension');
  content = content.replace(/domain/g, 'dimension');
  content = content.replace(/Domain/g, 'Dimension');
  content = content.replace(/DOMAINS/g, 'DIMENSIONS');
  
  content = content.replace(/tierCounts/g, 'priorityCounts');
  content = content.replace(/TIER_COLORS/g, 'DIMENSION_COLORS'); 
  content = content.replace(/TIER_SHAPES/g, 'SHAPES');
  content = content.replace(/TIERS/g, 'PRIORITIES');
  
  // Replace tier with priority but ONLY if it's not qualityTier
  // Regex to match "tier", "Tier" unless preceded by "quality"
  content = content.replace(/(?<!quality)(tier)/g, 'priority');
  content = content.replace(/(?<!quality)(Tier)/g, 'Priority');

  if (file.includes('EventPanel.jsx')) {
    content = content.replace(/const DIMENSION_LABELS = \{[\s\S]*?\}/, '');
    content = content.replace(/DIMENSION_LABELS\[selectedEvent\.dimension\]\?\.icon/g, 'DIMENSION_ICONS[selectedEvent.dimension]');
    content = content.replace(/DIMENSION_LABELS\[selectedEvent\.dimension\]\?\.label \|\| selectedEvent\.dimension/g, 'DIMENSION_LABELS[selectedEvent.dimension]');
    content = content.replace(/import \{ DIMENSION_COLORS, DIMENSIONS \}/, 'import { DIMENSION_COLORS, DIMENSIONS, DIMENSION_LABELS, DIMENSION_ICONS, PRIORITIES, PRIORITY_LABELS }');
  }

  if (content !== original) {
    fs.writeFileSync(file, content);
    console.log(`Updated ${file}`);
  }
}

walk('src', processFile);
