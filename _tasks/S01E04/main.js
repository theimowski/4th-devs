const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'declaration.md');
fs.writeFileSync(filePath, 'Hello World');

console.log('File declaration.md has been created.');
