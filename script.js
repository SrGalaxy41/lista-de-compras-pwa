/**
 * Grocery List PWA - Core Logic (Tailwind & Advanced UX Version)
 */

const { jsPDF } = window.jspdf || {};

// --- Catalog Seed ---
const CATALOG_SEED = [
    { name: 'Arroz 5kg', category: 'Alimentação', price: 25.50 },
    { name: 'Feijão Preto 1kg', category: 'Alimentação', price: 8.90 },
    { name: 'Açúcar Refinado 1kg', category: 'Alimentação', price: 4.50 },
    { name: 'Café Torrado 500g', category: 'Alimentação', price: 18.00 },
    { name: 'Leite Integral 1L', category: 'Laticínios', price: 5.20 },
    { name: 'Manteiga 200g', category: 'Laticínios', price: 12.00 },
    { name: 'Pão de Forma', category: 'Padaria', price: 7.50 },
    { name: 'Ovos Brancos 12un', category: 'Proteína', price: 10.00 },
    { name: 'Frango Inteiro kg', category: 'Proteína', price: 15.00 },
    { name: 'Detergente 500ml', category: 'Limpeza', price: 2.50 },
    { name: 'Sabão em Pó 1kg', category: 'Limpeza', price: 14.00 },
    { name: 'Papel Higiênico 12un', category: 'Higiene', price: 16.00 },
    { name: 'Creme Dental', category: 'Higiene', price: 4.00 },
    { name: 'Óleo de Soja 900ml', category: 'Alimentação', price: 7.80 },
    { name: 'Macarrão Espaguete', category: 'Alimentação', price: 4.20 }
];

// --- State Management ---
let state = {
    activeList: JSON.parse(localStorage.getItem('activeList')) || [],
    catalog: JSON.parse(localStorage.getItem('catalog')) || CATALOG_SEED,
    history: JSON.parse(localStorage.getItem('history')) || [],
    templates: JSON.parse(localStorage.getItem('templates')) || [],
    budget: parseFloat(localStorage.getItem('budget')) || 0,
    filter: ''
};

const saveState = () => {
    localStorage.setItem('activeList', JSON.stringify(state.activeList));
    localStorage.setItem('catalog', JSON.stringify(state.catalog));
    localStorage.setItem('history', JSON.stringify(state.history));
    localStorage.setItem('templates', JSON.stringify(state.templates));
    localStorage.setItem('budget', state.budget.toString());
};

// --- DOM Elements ---
const activeListEl = document.getElementById('activeList');
const budgetInput = document.getElementById('budgetInput');
const totalDisplay = document.getElementById('totalDisplay');
const balanceDisplay = document.getElementById('remainingBalance');
const addItemForm = document.getElementById('addItemForm');
const datalist = document.getElementById('catalogList');
const searchInput = document.getElementById('searchInput');
const scanInput = document.getElementById('scanInput');
const ocrCanvas = document.getElementById('ocrCanvas');
const toastEl = document.getElementById('toast');

// --- Initialization ---
const init = () => {
    renderList();
    updateBudgetDisplay();
    updateCatalogDatalist();
    setupEventListeners();
    initOCR();
};

let ocrWorker = null;
const initOCR = async () => {
    try {
        ocrWorker = await Tesseract.createWorker('por');
    } catch (e) { console.error('OCR Init fail', e); }
};

const showToast = (message) => {
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    toastEl.classList.add('opacity-100');
    setTimeout(() => {
        toastEl.classList.add('hidden');
        toastEl.classList.remove('opacity-100');
    }, 3000);
};

const haptic = () => { if (navigator.vibrate) navigator.vibrate(50); };

const updateCatalogDatalist = () => {
    datalist.innerHTML = state.catalog.map(item => `<option value="${item.name}">`).join('');
};

// --- Logic ---

const preprocessImage = (img) => {
    const ctx = ocrCanvas.getContext('2d');
    ocrCanvas.width = img.width;
    ocrCanvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, ocrCanvas.width, ocrCanvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const val = avg > 128 ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = val;
    }
    ctx.putImageData(imageData, 0, 0);
    return ocrCanvas.toDataURL();
};

const handleScan = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    showToast('⌛ Lendo etiqueta...');
    try {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await new Promise(r => img.onload = r);
        const processed = preprocessImage(img);
        if (!ocrWorker) await initOCR();
        const { data: { text } } = await ocrWorker.recognize(processed);
        
        const priceRegex = /(?:R\$?\s*)?(\d+,\d{2})/i;
        const priceMatch = text.match(priceRegex);
        const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : 0;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
        const name = lines.find(l => !priceRegex.test(l)) || '';

        document.getElementById('itemName').value = name.substring(0, 30);
        document.getElementById('itemPrice').value = price || '';
        haptic();
        showToast('✅ Capturado!');
    } catch (err) { showToast('❌ Erro no Scanner'); }
    e.target.value = '';
};

const upsertCatalog = (item) => {
    const index = state.catalog.findIndex(c => c.name.toLowerCase() === item.name.toLowerCase());
    if (index > -1) state.catalog[index] = { ...state.catalog[index], ...item };
    else state.catalog.push(item);
    updateCatalogDatalist();
};

const addItem = (name, category, qty, price) => {
    const newItem = {
        id: Date.now(),
        name,
        category: category || 'Geral',
        qty: parseFloat(qty) || 1,
        price: parseFloat(price) || 0,
        checked: false
    };
    state.activeList.push(newItem);
    upsertCatalog({ name, category, price: newItem.price });
    saveState();
    renderList();
    haptic();
};

const updateItem = (id, updates) => {
    const index = state.activeList.findIndex(i => i.id === id);
    if (index > -1) {
        state.activeList[index] = { ...state.activeList[index], ...updates };
        saveState();
        renderList();
    }
};

const removeItem = (id) => {
    state.activeList = state.activeList.filter(i => i.id !== id);
    saveState();
    renderList();
    haptic();
};

const updateBudgetDisplay = () => {
    const total = state.activeList.reduce((acc, i) => acc + (i.qty * i.price), 0);
    totalDisplay.textContent = total.toFixed(2);
    const balance = state.budget - total;
    balanceDisplay.textContent = `Restante: R$ ${balance.toFixed(2)}`;
    balanceDisplay.className = balance >= 0 ? 'text-green-200' : 'text-red-300 font-bold';
};

// --- UI Rendering ---

const renderList = () => {
    const filtered = state.activeList.filter(i => 
        i.name.toLowerCase().includes(state.filter.toLowerCase()) ||
        i.category.toLowerCase().includes(state.filter.toLowerCase())
    );

    if (filtered.length === 0) {
        activeListEl.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-gray-400 space-y-4">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                <p class="text-lg">Sua lista está vazia.</p>
                <p class="text-sm">Adicione o primeiro item acima.</p>
            </div>`;
        updateBudgetDisplay();
        return;
    }

    activeListEl.innerHTML = filtered.map(item => `
        <div class="swipe-container bg-danger rounded-xl shadow-sm group" data-id="${item.id}">
            <div class="swipe-content bg-white p-4 flex items-center gap-4 relative z-10" 
                 ontouchstart="handleSwipeStart(event)" ontouchmove="handleSwipeMove(event)" ontouchend="handleSwipeEnd(event)">
                
                <input type="checkbox" class="check-item w-6 h-6 rounded border-gray-300 text-primary focus:ring-primary" 
                    ${item.checked ? 'checked' : ''}>
                
                <div class="flex-grow min-w-0">
                    <h3 class="font-bold truncate text-gray-800 ${item.checked ? 'item-checked' : ''}" 
                        contenteditable="true" data-field="name">${item.name}</h3>
                    <div class="flex gap-2 text-xs text-gray-400">
                        <span contenteditable="true" data-field="category">${item.category}</span> • 
                        <span>Qtd: </span><span contenteditable="true" data-field="qty" class="font-bold text-gray-600">${item.qty}</span>
                    </div>
                </div>

                <div class="text-right shrink-0">
                    <div class="font-bold text-primary">R$ ${(item.qty * item.price).toFixed(2)}</div>
                    <div class="text-[10px] text-gray-400" contenteditable="true" data-field="price">un: R$ ${item.price.toFixed(2)}</div>
                </div>
            </div>
            <button class="absolute inset-y-0 right-0 w-20 bg-danger text-white flex items-center justify-center font-bold" onclick="removeItem(${item.id})">
                Excluir
            </button>
        </div>
    `).join('');
    updateBudgetDisplay();
};

// --- Gestures ---
let touchStartX = 0;
let currentSwipeId = null;

window.handleSwipeStart = (e) => {
    touchStartX = e.touches[0].clientX;
    currentSwipeId = e.currentTarget.closest('.swipe-container').dataset.id;
};

window.handleSwipeMove = (e) => {
    const touchX = e.touches[0].clientX;
    const diff = touchX - touchStartX;
    if (diff < 0) {
        const offset = Math.max(diff, -80);
        e.currentTarget.style.transform = `translateX(${offset}px)`;
    }
};

window.handleSwipeEnd = (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchEndX - touchStartX;
    if (diff < -40) {
        e.currentTarget.style.transform = `translateX(-80px)`;
    } else {
        e.currentTarget.style.transform = `translateX(0px)`;
    }
};

// --- Event Listeners ---
const setupEventListeners = () => {
    searchInput.oninput = (e) => { state.filter = e.target.value; renderList(); };
    scanInput.onchange = handleScan;

    budgetInput.value = state.budget.toFixed(2);
    budgetInput.onchange = (e) => { 
        state.budget = parseFloat(e.target.value) || 0; 
        saveState(); 
        updateBudgetDisplay(); 
    };

    const nameIn = document.getElementById('itemName');
    const catIn = document.getElementById('itemCategory');
    const qtyIn = document.getElementById('itemQty');
    const priceIn = document.getElementById('itemPrice');

    nameIn.onchange = (e) => {
        const found = state.catalog.find(c => c.name.toLowerCase() === e.target.value.toLowerCase());
        if (found) { catIn.value = found.category; priceIn.value = found.price; }
    };

    document.getElementById('plusQty').onclick = () => qtyIn.value = parseInt(qtyIn.value) + 1;
    document.getElementById('minusQty').onclick = () => { if (qtyIn.value > 1) qtyIn.value = parseInt(qtyIn.value) - 1; };

    addItemForm.onsubmit = (e) => {
        e.preventDefault();
        addItem(nameIn.value, catIn.value, qtyIn.value, priceIn.value);
        addItemForm.reset(); qtyIn.value = 1; nameIn.focus();
    };

    activeListEl.onclick = (e) => {
        const chip = e.target.closest('.swipe-container');
        if (!chip) return;
        const id = parseInt(chip.dataset.id);
        if (e.target.classList.contains('check-item')) {
            updateItem(id, { checked: e.target.checked });
            haptic();
        }
    };

    activeListEl.addEventListener('blur', (e) => {
        if (e.target.hasAttribute('contenteditable')) {
            const id = parseInt(e.target.closest('.swipe-container').dataset.id);
            const field = e.target.dataset.field;
            let val = e.target.innerText.replace('un: R$ ', '').trim();
            const updates = {};
            updates[field] = (field === 'qty' || field === 'price') ? parseFloat(val) : val;
            updateItem(id, updates);
        }
    }, true);

    // Nav
    document.getElementById('loadTemplateBtn').onclick = () => showModal('Modelos', 'templates');
    document.getElementById('historyBtn').onclick = () => showModal('Histórico', 'history');
    document.getElementById('showListBtn').onclick = () => { 
        document.getElementById('modalOverlay').classList.add('hidden');
        renderList();
    };
    
    document.getElementById('sharePdfBtn').onclick = generatePDF;
    document.getElementById('closeModal').onclick = () => document.getElementById('modalOverlay').classList.add('hidden');
};

const generatePDF = async () => {
    if (state.activeList.length === 0) return showToast('Lista vazia!');
    const doc = new jsPDF();
    doc.setFontSize(20); doc.text('Lista de Compras', 20, 20);
    let y = 40;
    state.activeList.forEach(i => {
        doc.text(`${i.checked ? '[X]' : '[ ]'} ${i.name} - ${i.qty}x R$ ${i.price.toFixed(2)}`, 20, y);
        y += 10;
    });
    const blob = doc.output('blob');
    const file = new File([blob], 'lista.pdf', { type: 'application/pdf' });
    if (navigator.share) await navigator.share({ files: [file], title: 'Minha Lista' });
    else doc.save('lista.pdf');
};

const showModal = (title, type) => {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    document.getElementById('modalTitle').textContent = title;
    let html = '';
    if (type === 'templates') {
        html = state.templates.map((t, i) => `
            <div class="flex justify-between items-center p-4 border-b">
                <span class="font-medium">${t.name}</span>
                <div class="flex gap-2">
                    <button onclick="loadTemplate(${i})" class="text-primary font-bold">Abrir</button>
                    <button onclick="deleteTemplate(${i})" class="text-danger">✕</button>
                </div>
            </div>`).join('') || '<p class="text-center py-10 text-gray-400">Nenhum modelo salvo.</p>';
    } else {
        html = state.history.map((h, i) => `
            <div class="flex justify-between items-center p-4 border-b text-sm">
                <div><div class="font-bold">${h.date}</div><div>R$ ${h.total.toFixed(2)}</div></div>
                <button onclick="restoreHistory(${i})" class="text-primary font-bold">Restaurar</button>
            </div>`).join('') || '<p class="text-center py-10 text-gray-400">Sem histórico.</p>';
    }
    content.innerHTML = html;
    modal.classList.remove('hidden');
};

window.loadTemplate = (i) => {
    state.activeList = [...state.activeList, ...JSON.parse(JSON.stringify(state.templates[i].items))];
    saveState(); renderList(); document.getElementById('modalOverlay').classList.add('hidden');
};
window.deleteTemplate = (i) => { state.templates.splice(i,1); saveState(); showModal('Modelos', 'templates'); };
window.restoreHistory = (i) => {
    state.activeList = JSON.parse(JSON.stringify(state.history[i].items));
    saveState(); renderList(); document.getElementById('modalOverlay').classList.add('hidden');
};

init();