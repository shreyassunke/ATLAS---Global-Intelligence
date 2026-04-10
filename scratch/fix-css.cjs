const fs = require('fs');

let content = fs.readFileSync('src/index.css', 'utf8');

content = content.replace(/priority-latent/g, 'priority-p3');
content = content.replace(/priority-active/g, 'priority-p2');
content = content.replace(/priority-critical/g, 'priority-p1');

fs.writeFileSync('src/index.css', content);
console.log('Fixed CSS priority mappings');
