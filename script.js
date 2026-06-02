/**
 * Grocery List PWA - Core Logic (Tailwind & Advanced UX Version)
 */

const { jsPDF } = window.jspdf || {};

// --- Google Drive Cloud Sync ---
const GOOGLE_CLIENT_ID = '387394082449-bgt5627hg91r9neruvdcjtf2o1h1q8el.apps.googleusercontent.com';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.appdata profile email';

let gapiInited = false;
let gisInited = false;
let tokenClient;
let googleAccessToken = null;

let cropperInstance = null;
let currentOcrSelectedPrice = null;
let cameraStream = null;

window.gapiLoaded = () => {
    gapi.load('client', async () => {
        await gapi.client.init({
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        });
        gapiInited = true;
    });
};

window.gisLoaded = () => {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPES,
        callback: async (resp) => {
            if (resp.error !== undefined) {
                showToast('❌ Erro no login');
                throw (resp);
            }
            googleAccessToken = resp.access_token;
            localStorage.setItem('googleLoggedIn', 'true');
            await fetchUserInfo();
        },
    });
    gisInited = true;
};

const fetchUserInfo = async () => {
    try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${googleAccessToken}` }
        });
        const data = await res.json();
        const profile = { name: data.name, avatar: data.picture, email: data.email };
        localStorage.setItem('userProfile', JSON.stringify(profile));
        updateSettingsUI(true, profile);
    } catch (err) {
        console.error('Failed to fetch user info', err);
    }
};

const updateSettingsUI = (isLoggedIn, profile = null) => {
    document.getElementById('authLoginSection').classList.toggle('hidden', isLoggedIn);
    document.getElementById('authLoggedSection').classList.toggle('hidden', !isLoggedIn);
    
    if (isLoggedIn) {
        const data = profile || JSON.parse(localStorage.getItem('userProfile'));
        if (data) {
            document.getElementById('userName').textContent = data.name;
            const avatar = document.getElementById('userAvatar');
            if (data.avatar) {
                avatar.src = data.avatar;
                avatar.classList.remove('hidden');
            }
        }
    }
};

const findBackupFile = async () => {
    const response = await gapi.client.drive.files.list({
        spaces: 'appDataFolder',
        q: "name='comepouco_backup.json'",
        fields: 'files(id)'
    });
    const files = response.result.files;
    return files && files.length > 0 ? files[0].id : null;
};

const backupToDrive = async () => {
    if (!googleAccessToken) return showToast('❌ Faça login primeiro!');
    showToast('⌛ Fazendo backup na nuvem...');
    
    try {
        const fileId = await findBackupFile();
        const backupData = JSON.stringify(state);
        const metadata = {
            name: 'comepouco_backup.json',
            mimeType: 'application/json'
        };
        if (!fileId) metadata.parents = ['appDataFolder'];

        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";

        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            backupData +
            close_delim;

        const url = fileId 
            ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
            : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

        const res = await fetch(url, {
            method: fileId ? 'PATCH' : 'POST',
            headers: {
                'Authorization': `Bearer ${googleAccessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body: multipartRequestBody
        });

        if (res.ok) {
            showToast('✅ Backup concluído!');
        } else {
            const errorData = await res.json();
            console.error('Drive API Error:', errorData);
            throw new Error('Falha no upload');
        }
    } catch (err) {
        console.error(err);
        showToast('❌ Erro no backup');
    }
};

const restoreFromDrive = async () => {
    if (!googleAccessToken) return showToast('❌ Faça login primeiro!');
    showToast('⌛ Restaurando da nuvem...');
    
    try {
        const fileId = await findBackupFile();
        if (!fileId) return showToast('❌ Nenhum backup encontrado');

        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });

        const cloudData = response.result;
        if (cloudData) {
            state = { ...state, ...cloudData };
            saveState();
            renderList();
            updateBudgetDisplay();
            updateCatalogDatalist();
            showToast('✅ Dados restaurados!');
        }
    } catch (err) {
        console.error(err);
        showToast('❌ Erro ao restaurar');
    }
};

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
const ocrCanvas = document.getElementById('ocrCanvas');
const toastEl = document.getElementById('toast');

// --- Initialization ---
const init = () => {
    if (localStorage.getItem('googleLoggedIn') === 'true') {
        const profile = JSON.parse(localStorage.getItem('userProfile'));
        updateSettingsUI(true, profile);
    }
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

const processCroppedImage = async () => {
    if (!cropperInstance) return;
    
    const canvas = cropperInstance.getCroppedCanvas();
    const base64Image = canvas.toDataURL('image/jpeg');
    
    cropperInstance.destroy();
    cropperInstance = null;
    document.getElementById('cropperOverlay').classList.add('hidden');
    
    const progressOverlay = document.getElementById('ocrProgressOverlay');
    progressOverlay.classList.remove('hidden');
    document.getElementById('ocrProgressBar').style.width = '0%';
    document.getElementById('ocrStatusText').textContent = 'Iniciando leitura...';

    try {
        if (!ocrWorker) await initOCR();
        const { data: { text } } = await ocrWorker.recognize(base64Image);
        progressOverlay.classList.add('hidden');
        parseOCRText(text);
    } catch (err) {
        console.error(err);
        progressOverlay.classList.add('hidden');
        showToast('❌ Erro na leitura');
    }
};

const parseOCRText = (text) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    const priceRegex = /(?:R\$?\s*)?(\d+[,.]\d{2})/g;
    let prices = [];
    let match;
    while ((match = priceRegex.exec(text)) !== null) {
        prices.push(parseFloat(match[1].replace(',', '.')));
    }
    
    const nameCandidate = lines.find(l => !/^\d+[,.]\d{2}$/.test(l) && !priceRegex.test(l)) || 'Produto';
    
    document.getElementById('ocrParsedName').value = nameCandidate.substring(0, 30);
    const optionsEl = document.getElementById('ocrPriceOptions');
    optionsEl.innerHTML = '';
    
    currentOcrSelectedPrice = null;
    const addBtn = document.getElementById('ocrAddBtn');
    addBtn.disabled = true;
    addBtn.classList.add('opacity-50', 'cursor-not-allowed');

    if (prices.length === 0) {
        optionsEl.innerHTML = '<p class="text-xs text-gray-400 col-span-2 text-center">Nenhum preço detectado</p>';
    } else {
        [...new Set(prices)].forEach(price => {
            const btn = document.createElement('button');
            btn.className = 'ocr-price-btn p-3 bg-white border-2 border-gray-100 rounded-xl font-bold text-gray-700 hover:border-primary transition-all';
            btn.textContent = `R$ ${price.toFixed(2)}`;
            btn.onclick = () => {
                currentOcrSelectedPrice = price;
                document.querySelectorAll('.ocr-price-btn').forEach(b => b.classList.remove('border-primary', 'bg-green-50', 'text-primary'));
                btn.classList.add('border-primary', 'bg-green-50', 'text-primary');
                addBtn.disabled = false;
                addBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            };
            optionsEl.appendChild(btn);
        });
    }
    document.getElementById('ocrConfirmModal').classList.remove('hidden');
};

const confirmOcrAdd = () => {
    const name = document.getElementById('ocrParsedName').value.trim();
    if (!name || currentOcrSelectedPrice === null) return;

    document.getElementById('itemName').value = name;
    document.getElementById('itemPrice').value = currentOcrSelectedPrice;

    const foundCat = state.catalog.find(c => c.name.toLowerCase() === name.toLowerCase());
    const category = foundCat ? foundCat.category : 'Geral';
    document.getElementById('itemCategory').value = category;

    addItem(name, category, 1, currentOcrSelectedPrice);

    document.getElementById('ocrConfirmModal').classList.add('hidden');
    document.getElementById('addItemForm').reset();
    showToast('✅ Item adicionado!');
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
    
    // Update Item Count
    const countEl = document.getElementById('itemCount');
    if (countEl) countEl.textContent = state.activeList.length;

    const balance = state.budget - total;
    balanceDisplay.textContent = `Restante: R$ ${balance.toFixed(2)}`;
    balanceDisplay.className = balance >= 0 ? 'text-sm font-medium text-green-600 mt-2' : 'text-sm font-bold text-red-600 mt-2';
    
    const alertEl = document.getElementById('budgetAlert');
    if (alertEl) {
        if (state.budget > 0 && balance < 0) {
            alertEl.classList.remove('hidden');
        } else {
            alertEl.classList.add('hidden');
        }
    }
};

// --- UI Rendering ---

const renderList = () => {
    const filtered = state.activeList.filter(i => 
        i.name.toLowerCase().includes(state.filter.toLowerCase()) ||
        i.category.toLowerCase().includes(state.filter.toLowerCase())
    );

    if (filtered.length === 0) {
        activeListEl.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 text-gray-400 space-y-3">
                <div class="bg-gray-50 p-4 rounded-full border border-gray-100">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                </div>
                <p class="text-sm font-medium text-gray-500">Sua lista está vazia</p>
            </div>`;
        updateBudgetDisplay();
        return;
    }

    activeListEl.innerHTML = filtered.map(item => `
        <div class="bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-3 shadow-sm transition-opacity ${item.checked ? 'opacity-60 bg-gray-50' : ''}" data-id="${item.id}">
            
            <!-- Checkbox -->
            <input type="checkbox" class="check-item w-6 h-6 rounded-md border-gray-300 text-primary focus:ring-primary transition-colors shrink-0 cursor-pointer" 
                ${item.checked ? 'checked' : ''}>
            
            <!-- Center Details -->
            <div class="flex-grow min-w-0">
                <h3 class="font-bold truncate text-gray-800 text-base ${item.checked ? 'item-checked text-gray-500' : ''}" 
                    contenteditable="true" data-field="name">${item.name}</h3>
                
                <div class="flex flex-wrap items-center gap-2 mt-1.5">
                    <!-- Inline Qty -->
                    <div class="flex items-center bg-gray-100 rounded border border-gray-200 overflow-hidden h-6">
                        <button class="qty-btn px-2 text-gray-500 hover:bg-gray-200 font-bold" data-action="decrease">-</button>
                        <span class="px-2 text-xs font-bold text-gray-700 w-6 text-center">${item.qty}</span>
                        <button class="qty-btn px-2 text-gray-500 hover:bg-gray-200 font-bold" data-action="increase">+</button>
                    </div>
                    
                    <span class="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[10px] font-medium border border-gray-200" contenteditable="true" data-field="price">R$ ${item.price.toFixed(2)}</span>
                    <span class="bg-green-50 text-green-700 px-1.5 py-0.5 rounded text-[10px] font-medium border border-green-100" contenteditable="true" data-field="category">${item.category}</span>
                </div>
            </div>

            <!-- Right Actions -->
            <div class="shrink-0 flex flex-col items-end gap-2">
                <div class="font-bold text-gray-800 text-sm">R$ ${(item.qty * item.price).toFixed(2)}</div>
                <button class="delete-btn text-gray-400 hover:text-red-500 transition-colors p-1" aria-label="Excluir item">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
                </button>
            </div>
        </div>
    `).join('');
    updateBudgetDisplay();
};

// --- Event Listeners ---
const setupEventListeners = () => {
    searchInput.oninput = (e) => { state.filter = e.target.value; renderList(); };

    // Camera WebRTC logic
    const startScanBtn = document.getElementById('startScanBtn');
    const cameraModal = document.getElementById('cameraModal');
    const videoFeed = document.getElementById('videoFeed');
    const capturePhotoBtn = document.getElementById('capturePhotoBtn');
    const cancelCameraBtn = document.getElementById('cancelCameraBtn');

    const stopCamera = () => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        cameraModal.classList.add('hidden');
    };

    startScanBtn.onclick = async () => {
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: "environment", width: { ideal: 1280 } } 
            });
            videoFeed.srcObject = cameraStream;
            cameraModal.classList.remove('hidden');
        } catch (err) {
            console.error('Camera Error:', err);
            showToast('❌ Erro ao acessar câmera');
        }
    };

    cancelCameraBtn.onclick = stopCamera;

    capturePhotoBtn.onclick = () => {
        const canvas = document.createElement('canvas');
        canvas.width = videoFeed.videoWidth;
        canvas.height = videoFeed.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoFeed, 0, 0);
        
        const dataURL = canvas.toDataURL('image/jpeg', 0.8);
        stopCamera();

        // Open Cropper with captured photo
        const cropperImage = document.getElementById('cropperImage');
        cropperImage.src = dataURL;
        document.getElementById('cropperOverlay').classList.remove('hidden');

        if (cropperInstance) cropperInstance.destroy();
        cropperInstance = new Cropper(cropperImage, {
            viewMode: 1,
            autoCropArea: 0.8,
            responsive: true,
            restore: false,
        });
    };

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
        const chip = e.target.closest('[data-id]');
        if (!chip) return;
        const id = parseInt(chip.dataset.id);
        const item = state.activeList.find(i => i.id === id);

        if (e.target.classList.contains('check-item')) {
            updateItem(id, { checked: e.target.checked });
            haptic();
        } else if (e.target.closest('.delete-btn')) {
            removeItem(id);
        } else if (e.target.closest('.qty-btn')) {
            const action = e.target.dataset.action;
            let newQty = item.qty;
            if (action === 'increase') newQty++;
            else if (action === 'decrease' && newQty > 1) newQty--;
            if (newQty !== item.qty) updateItem(id, { qty: newQty });
        }
    };

    activeListEl.addEventListener('blur', (e) => {
        if (e.target.hasAttribute('contenteditable')) {
            const id = parseInt(e.target.closest('[data-id]').dataset.id);
            const field = e.target.dataset.field;
            let val = e.target.innerText.replace('R$ ', '').trim();
            const updates = {};
            updates[field] = (field === 'price') ? parseFloat(val) || 0 : val;
            updateItem(id, updates);
        }
    }, true);

    // OCR Buttons
    document.getElementById('cancelCropBtn').onclick = () => {
        document.getElementById('cropperOverlay').classList.add('hidden');
        if (cropperInstance) cropperInstance.destroy();
    };
    document.getElementById('confirmCropBtn').onclick = processCroppedImage;
    
    document.getElementById('closeOcrModalBtn').onclick = () => {
        document.getElementById('ocrConfirmModal').classList.add('hidden');
    };
    document.getElementById('ocrAddBtn').onclick = confirmOcrAdd;

    // Navigation (Bottom Bar & Card Actions)
    const showList = () => {
        document.getElementById('modalOverlay').classList.add('hidden');
        document.getElementById('settingsModalOverlay').classList.add('hidden');
        window.scrollTo({ top: document.getElementById('listSection').offsetTop - 20, behavior: 'smooth' });
    };

    document.getElementById('showListBtn').onclick = showList;
    document.getElementById('loadTemplateBtn').onclick = () => showModal('Modelos', 'templates');
    document.getElementById('historyBtn').onclick = () => showModal('Histórico', 'history');
    document.getElementById('sharePdfBtn').onclick = generatePDF;
    
    const clearList = () => {
        if (confirm('Tem certeza que deseja limpar a lista atual?')) {
            state.activeList = [];
            saveState();
            renderList();
        }
    };
    document.getElementById('clearListBtn').onclick = clearList;

    const clearBudgetBtn = document.getElementById('clearBudgetBtn');
    if (clearBudgetBtn) {
        clearBudgetBtn.onclick = () => {
            budgetInput.value = '0.00';
            state.budget = 0;
            saveState();
            updateBudgetDisplay();
        };
    }

    document.getElementById('closeModal').onclick = () => document.getElementById('modalOverlay').classList.add('hidden');

    // Settings & Cloud Sync
    document.getElementById('settingsBtn').onclick = () => document.getElementById('settingsModalOverlay').classList.remove('hidden');
    document.getElementById('closeSettingsModal').onclick = () => document.getElementById('settingsModalOverlay').classList.add('hidden');
    
    document.getElementById('googleLoginBtn').onclick = () => {
        if (googleAccessToken) { updateSettingsUI(true); return; }
        tokenClient.requestAccessToken({prompt: 'consent'});
    };
    document.getElementById('googleLogoutBtn').onclick = () => {
        if (googleAccessToken) {
            google.accounts.oauth2.revoke(googleAccessToken, () => {
                googleAccessToken = null;
                localStorage.removeItem('googleLoggedIn');
                localStorage.removeItem('userProfile');
                updateSettingsUI(false);
                document.getElementById('userAvatar').classList.add('hidden');
            });
        } else {
            localStorage.removeItem('googleLoggedIn');
            localStorage.removeItem('userProfile');
            updateSettingsUI(false);
        }
    };
    document.getElementById('backupBtn').onclick = async () => {
        await backupToDrive();
        state.lastSync = new Date().toLocaleString();
        saveState();
        updateSettingsUI(true);
    };
    document.getElementById('restoreBtn').onclick = restoreFromDrive;
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
