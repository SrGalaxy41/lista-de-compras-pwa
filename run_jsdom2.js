const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('script.js', 'utf8');

const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "dangerously" });
try {
    dom.window.eval(`
        window.jspdf = { jsPDF: function(){} };
        window.Tesseract = { createWorker: async () => ({ loadLanguage: async()=>{}, initialize: async()=>{} }) };
        window.Cropper = function() {};
        window.processCroppedImage = function() {};
        window.confirmOcrAdd = function() {};
        
        ${js}
    `);
    console.log('SUCCESS');
} catch (e) {
    console.log('CAUGHT:', e.message);
    console.log(e.stack);
}
