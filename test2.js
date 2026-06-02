const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('script.js', 'utf8');

const regexHtml = /id=['"]([^'"]+)['"]/g;
const idsInHtml = new Set();
let matchHtml;
while ((matchHtml = regexHtml.exec(html)) !== null) {
    idsInHtml.add(matchHtml[1]);
}

const regexJs = /getElementById\(['"]([^'"]+)['"]\)/g;
const idsInJs = new Set();
let matchJs;
while ((matchJs = regexJs.exec(js)) !== null) {
    idsInJs.add(matchJs[1]);
}

const missing = [...idsInJs].filter(id => !idsInHtml.has(id));
console.log('Missing IDs:', missing);

const jsOnclickRegex = /\.onclick/g;
// Find lines with onclick in setupEventListeners
const lines = js.split('\n');
let insideSetup = false;
for(let i=0; i<lines.length; i++) {
   if (lines[i].includes('const setupEventListeners = () => {')) insideSetup = true;
   if (insideSetup && lines[i].includes('};')) insideSetup = false; // rough
   if (insideSetup && lines[i].includes('.onclick')) {
       console.log(`Line ${i+1}: ${lines[i].trim()}`);
   }
}
