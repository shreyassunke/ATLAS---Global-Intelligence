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
  if (!file.match(/\.(js|jsx)$/)) return;

  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Revert qualityPriority to qualityTier, etc.
  content = content.replace(/qualityPriority/g, 'qualityTier');
  content = content.replace(/QualityPriority/g, 'QualityTier');
  content = content.replace(/resolvedPriority/g, 'resolvedTier');
  content = content.replace(/QUALITY_PRIORITIES/g, 'QUALITY_TIERS');
  content = content.replace(/detectQualityPriority/g, 'detectQualityTier');
  content = content.replace(/priority: state\.qualityTier/g, 'tier: state.qualityTier');

  // Fix qualityTier: savedQuality?.priority -> qualityTier: savedQuality?.tier
  content = content.replace(/savedQuality\?\.priority/g, 'savedQuality?.tier');

  if (content !== original) {
    fs.writeFileSync(file, content);
    console.log(`Reverted quality stuff in ${file}`);
  }
}

walk('src', processFile);
