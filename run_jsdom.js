const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('script.js', 'utf8');

const modifiedJs = js.replace(/document\.getElementById\(['"]([^'"]+)['"]\)\.onclick/g, (match, id) => {
    return `(function(){ const el = document.getElementById('${id}'); if(!el) console.log('NULL ID FOUND: ${id}'); return el; })().onclick`;
});

const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "dangerously" });

try {
    dom.window.eval(`
        window.jspdf = { jsPDF: function(){} };
        window.Tesseract = { createWorker: async () => ({ loadLanguage: async()=>{}, initialize: async()=>{} }) };
        window.Cropper = function() {};
        
        ${modifiedJs}
    `);
} catch (e) {
    console.error("ERROR CAUGHT:");
    console.error(e.message);
}
