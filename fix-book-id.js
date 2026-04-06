const fs = require('fs');
const file = 'apps/bookgeek/web/src/App.jsx';
let content = fs.readFileSync(file, 'utf8');

// Replace all book._id, candidate._id, selectedBook._id, rec._id, primary._id, secondary._id with explicit fallback
content = content.replace(/(\b\w+)\._id/g, '($1.id || $1._id)');

fs.writeFileSync(file, content);
console.log('Fixed IDs in App.jsx');
