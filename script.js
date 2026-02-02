// --- CONFIGURACIÓN ---
const AppConfig = {
    // Asegúrate de que esta URL sea la correcta del despliegue de tu Apps Script
    API_URL: 'https://script.google.com/macros/s/AKfycbxAzUVHsXNAVfgN52wYffigQL3lZmKZZ81723-FWBwWU-oc4KDZe1F8RXIZBUk_v2c_2Q/exec',
    TRANSACCION_API_URL: 'https://script.google.com/macros/s/AKfycbxAzUVHsXNAVfgN52wYffigQL3lZmKZZ81723-FWBwWU-oc4KDZe1F8RXIZBUk_v2c_2Q/exec', // Usar URL correcta para Admin
    SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1Ji7Dbx5NLEjC4Sl5xQ20zdecnwjjEm0Lb9l2xIqp7XM/edit?usp=sharing',
    INITIAL_RETRY_DELAY: 1000,
    MAX_RETRY_DELAY: 30000,
    MAX_RETRIES: 5,
    CACHE_DURATION: 300000,
    
    APP_STATUS: 'Stable', 
    APP_VERSION: 'v3.2', // Versión FINAL corregida y completa
    
    IMPUESTO_P2P_TASA: 0.0015,           
    TASA_ITBIS: 0.18,               
    
    PRESTAMO_TASA_BASE: 0.05,       
    PRESTAMO_BONUS_POR_DIA: 0.001,  
    PRESTAMO_MIN_MONTO: 5000,
    PRESTAMO_MAX_MONTO: 150000,
    PRESTAMO_MIN_PLAZO_DIAS: 3,
    PRESTAMO_MAX_PLAZO_DIAS: 21,
    
    DEPOSITO_TASA_BASE: 0.005,       
    DEPOSITO_BONUS_POR_DIA: 0.000075, 
    DEPOSITO_MIN_MONTO: 50000,
    DEPOSITO_MIN_PLAZO_DIAS: 7,
    DEPOSITO_MAX_PLAZO_DIAS: 30,
    
    // Configuración de Donaciones
    DONACION_MIN_APORTE: 100,
};

// --- ESTADO DE LA APLICACIÓN ---
const AppState = {
    datosActuales: null,
    datosAdicionales: { 
        saldoTesoreria: 0,
        prestamosActivos: [],
        depositosActivos: [],
        allStudents: [], 
        allGroups: [],
        allGroupAndStudents: [] 
    },
    actualizacionEnProceso: false,
    retryCount: 0,
    retryDelay: AppConfig.INITIAL_RETRY_DELAY,
    cachedData: null,
    lastCacheTime: null,
    isOffline: false,
    selectedGrupo: null, 
    isSidebarOpen: false, 
    sidebarTimer: null, 
    
    // Variables para Transacción Múltiple
    transaccionSelectedGroups: new Set(),
    transaccionSelectedUsers: new Set(),
    transaccionSelectAll: {},
    
    lastKnownGroupsHash: '',
    
    currentSearch: {
        p2pOrigen: { query: '', selected: null, info: null },
        p2pDestino: { query: '', selected: null, info: null },
        bonoAlumno: { query: '', selected: null, info: null },
        tiendaAlumno: { query: '', selected: null, info: null },
        prestamoAlumno: { query: '', selected: null, info: null }, 
        depositoAlumno: { query: '', selected: null, info: null },
        causaDonante: { query: '', selected: null, info: null }, 
        causaAdminBeneficiario: { query: 'Banco', selected: 'Banco', info: { nombre: 'Banco', grupoNombre: 'Banco' } }, 
    },
    
    bonos: {
        disponibles: [],
        canjeados: [],
        selectedBono: null,
    },

    tienda: {
        items: {},
        isStoreOpen: false,
        storeManualStatus: 'auto',
        nextOpeningDate: null, 
        selectedItem: null,
    },
    
    causas: {
        items: {},
        selectedCausa: null,
    },

    heroSlideIndex: 0,
    heroSlideCount: 8, 
};

// --- AUTENTICACIÓN ---
const AppAuth = {
    verificarClave: function() {
        console.warn("Función AppAuth.verificarClave obsoleta. Usando el nuevo método seguro.");
        AppTransacciones.verificarClaveMaestra();
    }
};

// --- NÚMEROS Y FORMATO ---
const AppFormat = {
    formatNumber: (num) => new Intl.NumberFormat('es-DO', { maximumFractionDigits: 0 }).format(Math.round(num)),
    toLocalISOString: (date) => {
        const pad = (num) => String(num).padStart(2, '0');
        const d = new Date(date);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },
    formatDateSimple: (date) => {
        if (!date) return 'N/A';
        const d = new Date(date);
        const pad = (num) => String(num).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    },
    calculateLoanRate: (days) => Math.min(AppConfig.PRESTAMO_TASA_BASE + (days * AppConfig.PRESTAMO_BONUS_POR_DIA), 1.0),
    calculateDepositRate: (days) => Math.min(AppConfig.DEPOSITO_TASA_BASE + (days * AppConfig.DEPOSITO_BONUS_POR_DIA), 1.0),
    
    // Lógica para detectar el tipo de Socio (Oro, Plata, Bronce)
    getSocioData: (etiqueta) => {
        if (!etiqueta) return null;
        const tag = etiqueta.toUpperCase().trim();
        
        if (tag === 'SOCIO' || tag === 'ORO') {
            return {
                type: 'gold',
                label: 'SOCIO',
                rowClass: 'socio-row-gold',
                badgeClass: 'socio-badge-gold'
            };
        } else if (tag === 'PLATA') {
            return {
                type: 'silver',
                label: 'PLATA',
                rowClass: 'socio-row-silver',
                badgeClass: 'socio-badge-silver'
            };
        } else if (tag === 'BRONCE') {
            return {
                type: 'bronze',
                label: 'BRONCE',
                rowClass: 'socio-row-bronze',
                badgeClass: 'socio-badge-bronze'
            };
        }
        return null;
    }
};

// --- MANEJO DE DATOS ---
const AppData = {
    
    isCacheValid: () => AppState.cachedData && AppState.lastCacheTime && (Date.now() - AppState.lastCacheTime < AppConfig.CACHE_DURATION),

    cargarDatos: async function(isRetry = false) {
        if (AppState.actualizacionEnProceso && !isRetry) return;
        AppState.actualizacionEnProceso = true;

        if (!isRetry) {
            AppState.retryCount = 0;
            AppState.retryDelay = AppConfig.INITIAL_RETRY_DELAY;
        }

        if (!AppState.datosActuales) {
            AppUI.setConnectionStatus('loading', 'Cargando...');
        }

        try {
            if (!navigator.onLine) {
                AppState.isOffline = true;
                AppUI.setConnectionStatus('error', 'Sin conexión, mostrando caché.');
                if (AppData.isCacheValid()) {
                    await AppData.procesarYMostrarDatos(AppState.cachedData);
                } else {
                    throw new Error("Sin conexión y sin datos en caché.");
                }
            } else {
                AppState.isOffline = false;
                
                const url = `${AppConfig.API_URL}?action=getDatosBase&cacheBuster=${new Date().getTime()}`;
                const data = await AppTransacciones.fetchWithExponentialBackoff(url, { method: 'GET', cache: 'no-cache' });
                
                if (!data || data.error || data.success === false) {
                    const errorMessage = data && data.message ? data.message : 'Error interno del servidor.';
                    throw new Error(`Error de API: ${errorMessage}`);
                }
                
                AppData.procesarYMostrarDatos(data);
                AppState.cachedData = data;
                AppState.lastCacheTime = Date.now();
                AppState.retryCount = 0;
                AppUI.setConnectionStatus('ok', 'Conectado');
            }

        } catch (error) {
            console.error("Error al cargar datos:", error.message);
            AppUI.setConnectionStatus('error', `Error: ${error.message}`);
            
            if (AppState.retryCount < AppConfig.MAX_RETRIES) {
                AppState.retryCount++;
                setTimeout(() => AppData.cargarDatos(true), AppState.retryDelay);
                AppState.retryDelay = Math.min(AppState.retryDelay * 2, AppConfig.MAX_RETRY_DELAY);
            } else if (AppData.isCacheValid()) {
                console.warn("Usando caché tras fallo.");
                AppData.procesarYMostrarDatos(AppState.cachedData);
            }
        } finally {
            AppState.actualizacionEnProceso = false;
            AppUI.hideLoading(); 
        }
    },

    detectarCambios: function(nuevosDatos) { },
    
    procesarYMostrarDatos: function(data) {
        AppState.datosAdicionales.saldoTesoreria = data.saldoTesoreria || 0;
        AppState.datosAdicionales.prestamosActivos = data.prestamosActivos || [];
        AppState.datosAdicionales.depositosActivos = data.depositosActivos || [];
        
        AppState.bonos.disponibles = data.bonosDisponibles || []; 
        AppState.tienda.items = data.tiendaStock || {};
        AppState.tienda.storeManualStatus = data.storeManualStatus || 'auto';
        AppState.causas.items = data.causasDisponibles || {};
        AppState.tienda.nextOpeningDate = data.storeNextOpening || null; 
        
        const allGroups = data.gruposData;
        let gruposOrdenados = Object.entries(allGroups).map(([nombre, info]) => ({ nombre, total: info.total || 0, usuarios: info.usuarios || [] }));
        
        const ciclaGroup = gruposOrdenados.find(g => g.nombre === 'Cicla');
        const activeGroups = gruposOrdenados.filter(g => g.nombre !== 'Cicla' && g.nombre !== 'Banco');

        AppState.datosAdicionales.allStudents = activeGroups.flatMap(g => g.usuarios).concat(ciclaGroup ? ciclaGroup.usuarios : []);
        
        activeGroups.forEach(g => g.usuarios.forEach(u => u.grupoNombre = g.nombre));
        if (ciclaGroup) ciclaGroup.usuarios.forEach(u => u.grupoNombre = 'Cicla');
        
        AppState.datosAdicionales.allGroups = gruposOrdenados.map(g => g.nombre).filter(n => n !== 'Banco');
        
        const currentGroupsHash = AppState.datosAdicionales.allGroups.join('|');
        if (currentGroupsHash !== AppState.lastKnownGroupsHash) {
            AppUI.populateAdminGroupCheckboxes('bono-admin-grupos-checkboxes-container', 'bonos');
            AppUI.populateAdminGroupCheckboxes('tienda-admin-grupos-checkboxes-container', 'tienda');
            AppState.lastKnownGroupsHash = currentGroupsHash;
        }

        activeGroups.sort((a, b) => b.total - a.total);
        if (ciclaGroup) activeGroups.push(ciclaGroup);

        AppState.datosActuales = activeGroups; 
        
        AppUI.actualizarSidebar(activeGroups);
        
        if (AppState.selectedGrupo) {
            const grupoActualizado = activeGroups.find(g => g.nombre === AppState.selectedGrupo);
            if (grupoActualizado) {
                AppUI.mostrarDatosGrupo(grupoActualizado); 
            } else {
                AppState.selectedGrupo = null;
                AppUI.mostrarPantallaNeutral(activeGroups);
            }
        } else {
            AppUI.mostrarPantallaNeutral(activeGroups);
        }
        
        AppUI.actualizarSidebarActivo();
        
        const isBonoModalOpen = document.getElementById('bonos-modal').classList.contains('opacity-0') === false;
        const isTiendaModalOpen = document.getElementById('tienda-modal').classList.contains('opacity-0') === false;
        const isDonacionesModalOpen = document.getElementById('donaciones-modal').classList.contains('opacity-0') === false;
        const isTransaccionesCombinadasOpen = document.getElementById('transacciones-combinadas-modal').classList.contains('opacity-0') === false;
        const isAdminModalOpen = document.getElementById('transaccion-modal').classList.contains('opacity-0') === false;

        const isReportVisible = document.getElementById('transacciones-combinadas-report-container')?.classList.contains('hidden') === false ||
                                document.getElementById('bono-report-container')?.classList.contains('hidden') === false ||
                                document.getElementById('tienda-report-container')?.classList.contains('hidden') === false ||
                                document.getElementById('donaciones-report-container')?.classList.contains('hidden') === false || 
                                document.getElementById('transaccion-admin-report-container')?.classList.contains('hidden') === false;
        
        if (isBonoModalOpen && !isReportVisible) AppUI.populateBonoList();
        if (isTiendaModalOpen && !isReportVisible) AppUI.renderTiendaItems();
        if (isDonacionesModalOpen && !isReportVisible) AppUI.renderCausasList();
        
        if (isTransaccionesCombinadasOpen) {
             AppUI.updatePrestamoCalculadora();
             AppUI.updateDepositoCalculadora();
             AppUI.updateP2PCalculoImpuesto();
        }
        
        if (isAdminModalOpen && !isReportVisible) {
            const activeTab = document.querySelector('#transaccion-modal .tab-btn.active-tab');
            const tabId = activeTab ? activeTab.dataset.tab : '';
            if (tabId === 'transaccion') {
                 AppUI.populateGruposTransaccion();
                 AppUI.populateUsuariosTransaccion();
            } else if (tabId === 'bonos_admin') {
                AppUI.populateBonoAdminList();
            } else if (tabId === 'tienda_gestion' || tabId === 'tienda_inventario') {
                AppUI.populateTiendaAdminList();
                AppUI.updateTiendaAdminStatusLabel();
                if (tabId === 'tienda_gestion') {
                    AppUI.populateTiendaAdminDate();
                }
            } else if (tabId === 'causas_admin') { 
                AppUI.populateCausasAdminList();
            }
        }
    }
};

// --- MANEJO DE LA INTERFAZ (UI) ---
const AppUI = {
    
    init: function() {
        document.getElementById('gestion-btn').addEventListener('click', () => AppUI.showModal('gestion-modal'));
        document.getElementById('modal-submit').addEventListener('click', AppTransacciones.verificarClaveMaestra); 
        
        document.getElementById('transacciones-btn').addEventListener('click', () => AppUI.showTransaccionesCombinadasModal('p2p_transfer'));
        document.getElementById('transacciones-combinadas-modal-close').addEventListener('click', () => AppUI.hideModal('transacciones-combinadas-modal'));

        document.querySelectorAll('#transacciones-combinadas-modal .tab-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                AppUI.changeTransaccionesCombinadasTab(e.target.dataset.tab);
            });
        });
        
        const donacionesBtn = document.getElementById('donaciones-btn');
        if (donacionesBtn) {
            donacionesBtn.addEventListener('click', () => AppUI.showDonacionesModal());
        }
        document.getElementById('donaciones-modal-close').addEventListener('click', () => AppUI.hideModal('donaciones-modal'));
        document.getElementById('donaciones-step-back-btn').addEventListener('click', AppUI.showDonacionesStep1);
        document.getElementById('donaciones-submit-step2-btn').addEventListener('click', AppTransacciones.confirmarAporte);
        
        document.getElementById('hero-slide-0-next')?.addEventListener('click', () => AppUI.goToHeroSlide(1));

        document.querySelectorAll('.slide-next-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const nextIndex = parseInt(e.target.dataset.nextIndex, 10);
                if (!isNaN(nextIndex)) AppUI.goToHeroSlide(nextIndex);
            });
        });
        document.querySelectorAll('.slide-prev-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const prevIndex = parseInt(e.target.dataset.prevIndex, 10);
                if (!isNaN(prevIndex)) AppUI.goToHeroSlide(prevIndex);
            });
        });
        
        AppUI.setupFlexibleInputListeners('prestamo');
        AppUI.setupFlexibleInputListeners('deposito');
        document.getElementById('prestamo-submit-btn').addEventListener('click', AppTransacciones.solicitarPrestamoFlexible);
        document.getElementById('deposito-submit-btn').addEventListener('click', AppTransacciones.crearDepositoFlexible);

        document.getElementById('modal-cancel').addEventListener('click', () => AppUI.hideModal('gestion-modal'));
        document.getElementById('transaccion-modal-close-btn').addEventListener('click', () => AppUI.hideModal('transaccion-modal'));
        
        const bonosBtn = document.getElementById('bonos-btn');
        if (bonosBtn) {
            bonosBtn.addEventListener('click', () => AppUI.showBonoModal());
        }
        
        document.getElementById('bonos-modal-close').addEventListener('click', () => AppUI.hideModal('bonos-modal'));
        
        const tiendaBtn = document.getElementById('tienda-btn');
        if (tiendaBtn) {
            tiendaBtn.addEventListener('click', () => AppUI.showTiendaModal());
        }
        
        document.getElementById('tienda-modal-close').addEventListener('click', () => AppUI.hideModal('tienda-modal'));
        
        document.getElementById('p2p-submit-btn').addEventListener('click', AppTransacciones.realizarTransferenciaP2P);
        document.getElementById('p2p-cantidad').addEventListener('input', AppUI.updateP2PCalculoImpuesto);

        document.getElementById('gestion-modal').addEventListener('click', (e) => { if (e.target.id === 'gestion-modal') AppUI.hideModal('gestion-modal'); });
        document.getElementById('student-modal').addEventListener('click', (e) => { if (e.target.id === 'student-modal') AppUI.hideModal('student-modal'); });
        document.getElementById('transaccion-modal').addEventListener('click', (e) => { if (e.target.id === 'transaccion-modal') AppUI.hideModal('transaccion-modal'); });
        document.getElementById('bonos-modal').addEventListener('click', (e) => { if (e.target.id === 'bonos-modal') AppUI.hideModal('bonos-modal'); });
        document.getElementById('tienda-modal').addEventListener('click', (e) => { if (e.target.id === 'tienda-modal') AppUI.hideModal('tienda-modal'); });
        document.getElementById('donaciones-modal').addEventListener('click', (e) => { if (e.target.id === 'donaciones-modal') AppUI.hideModal('donaciones-modal'); }); 
        document.getElementById('transacciones-combinadas-modal').addEventListener('click', (e) => { if (e.target.id === 'transacciones-combinadas-modal') AppUI.hideModal('transacciones-combinadas-modal'); });
        document.getElementById('terminos-modal').addEventListener('click', (e) => { if (e.target.id === 'terminos-modal') AppUI.hideModal('terminos-modal'); });
        
        document.getElementById('terminos-btn').addEventListener('click', () => AppUI.showLegalModal('terminos'));
        document.getElementById('privacidad-btn').addEventListener('click', () => AppUI.showLegalModal('privacidad'));

        document.getElementById('bono-step-back-btn').addEventListener('click', AppUI.showBonoStep1);
        document.getElementById('bono-submit-step2-btn').addEventListener('click', AppTransacciones.confirmarCanje);
        document.getElementById('tienda-step-back-btn').addEventListener('click', AppUI.showTiendaStep1);
        document.getElementById('tienda-submit-step2-btn').addEventListener('click', AppTransacciones.confirmarCompra);
        document.getElementById('transaccion-submit-btn').addEventListener('click', AppTransacciones.realizarTransaccionMultiple);
        document.getElementById('bono-admin-form').addEventListener('submit', (e) => { e.preventDefault(); AppTransacciones.crearActualizarBono(); });
        document.getElementById('bono-admin-clear-btn').addEventListener('click', AppUI.clearBonoAdminForm);
        document.getElementById('tienda-admin-form').addEventListener('submit', (e) => { e.preventDefault(); AppTransacciones.crearActualizarItem(); });
        document.getElementById('tienda-admin-clear-btn').addEventListener('click', AppUI.clearTiendaAdminForm);
        
        document.getElementById('causa-admin-form').addEventListener('submit', (e) => { e.preventDefault(); AppTransacciones.crearActualizarCausa(); });
        document.getElementById('causa-admin-clear-btn').addEventListener('click', AppUI.clearCausaAdminForm);

        document.getElementById('tienda-admin-save-date-btn').addEventListener('click', AppTransacciones.guardarFechaApertura);
        document.getElementById('tienda-admin-clear-date-btn').addEventListener('click', AppTransacciones.borrarFechaApertura);

        document.getElementById('db-link-btn').href = AppConfig.SPREADSHEET_URL;
        document.getElementById('toggle-sidebar-btn').addEventListener('click', AppUI.toggleSidebar);
        
        const sidebar = document.getElementById('sidebar');
        sidebar.addEventListener('mouseenter', () => { if (AppState.sidebarTimer) clearTimeout(AppState.sidebarTimer); });
        sidebar.addEventListener('mouseleave', () => AppUI.resetSidebarTimer());
        
        document.querySelectorAll('#transaccion-modal .tab-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                AppUI.changeAdminTab(e.target.dataset.tab);
            });
        });

        AppUI.setupSearchInput('p2p-search-origen', 'p2p-origen-results', 'p2pOrigen', AppUI.selectP2PStudent);
        AppUI.setupSearchInput('p2p-search-destino', 'p2p-destino-results', 'p2pDestino', AppUI.selectP2PStudent);
        AppUI.setupSearchInput('bono-search-alumno-step2', 'bono-origen-results-step2', 'bonoAlumno', AppUI.selectBonoStudent);
        AppUI.setupSearchInput('tienda-search-alumno-step2', 'tienda-origen-results-step2', 'tiendaAlumno', AppUI.selectTiendaStudent);
        AppUI.setupSearchInput('prestamo-search-alumno', 'prestamo-origen-results', 'prestamoAlumno', AppUI.selectFlexibleStudent);
        document.getElementById('deposito-search-alumno')?.addEventListener('input', AppUI.updateDepositoCalculadora);
        AppUI.setupSearchInput('deposito-search-alumno', 'deposito-origen-results', 'depositoAlumno', AppUI.selectFlexibleStudent);
        AppUI.setupSearchInput('causa-search-alumno-step2', 'causa-origen-results-step2', 'causaDonante', AppUI.selectDonacionesStudent);
        AppUI.setupSearchInput('causa-admin-beneficiario-search', 'causa-admin-beneficiario-results', 'causaAdminBeneficiario', AppUI.selectAdminBeneficiario);

        AppUI.mostrarVersionApp();
        
        document.getElementById('sidebar-overlay').addEventListener('click', AppUI.toggleSidebar);
        document.getElementById('close-sidebar-btn').addEventListener('click', AppUI.toggleSidebar);
        
        AppData.cargarDatos(false);
        setInterval(() => AppData.cargarDatos(false), 30000); 
        AppUI.updateCountdown();
        setInterval(AppUI.updateCountdown, 1000);
    },
    
    hideLoading: function() {
        const loadingOverlay = document.getElementById('loading-overlay');
        const appContainer = document.getElementById('app-container');

        if (loadingOverlay.classList.contains('opacity-0')) {
             appContainer.classList.remove('hidden', 'opacity-0');
             return;
        }

        loadingOverlay.classList.add('opacity-0');
        appContainer.classList.remove('hidden');
        setTimeout(() => {
            appContainer.classList.remove('opacity-0');
        }, 10); 

        setTimeout(() => {
            loadingOverlay.style.display = 'none';
            loadingOverlay.classList.add('pointer-events-none');
        }, 500); 
    },

    showStudentModal: function(nombreGrupo, nombreUsuario, rank) {
        const student = AppState.datosAdicionales.allStudents.find(u => u.nombre === nombreUsuario);
        
        if (!student) return;

        const modalContent = document.getElementById('student-modal-content');
        const totalPinceles = student.pinceles || 0;
        
        const prestamoActivo = AppState.datosAdicionales.prestamosActivos.find(p => p.alumno === student.nombre);
        const depositoActivo = AppState.datosAdicionales.depositosActivos.find(d => d.alumno === student.nombre);

        const totalInvertido = AppState.datosAdicionales.depositosActivos
            .filter(deposito => (deposito.alumno || '').trim() === (student.nombre || '').trim() && deposito.estado.startsWith('Activo'))
            .reduce((sum, deposito) => sum + (Number(deposito.monto) || 0), 0);

        const isSolvente = totalPinceles >= 0;
        const estadoCuentaBadge = isSolvente 
            ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">Solvente</span>`
            : `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-600 border border-red-100">Sobregirado</span>`;

        let productsHtml = '';
        if (prestamoActivo) {
             productsHtml += `
                <div class="flex items-center p-2 mb-2 bg-amber-50 border-l-4 border-amber-700 shadow-sm border-t border-r border-b border-amber-100 rounded-r">
                    <div class="pl-2">
                        <p class="text-xs font-bold text-amber-900">Préstamo Activo</p>
                        <p class="text-[10px] text-amber-700">Pago pendiente</p>
                    </div>
                </div>`;
        }
        if (depositoActivo) {
            const vencimiento = new Date(depositoActivo.vencimiento);
            const fechaString = AppFormat.formatDateSimple(vencimiento);
            productsHtml += `
                <div class="flex items-center p-2 mb-2 bg-yellow-50 border-l-4 border-yellow-400 shadow-sm border-t border-r border-b border-yellow-100 rounded-r">
                    <div class="pl-2">
                        <p class="text-xs font-bold text-yellow-800">Inversión Activa</p>
                        <p class="text-[10px] text-yellow-600">Vence: ${fechaString}</p>
                    </div>
                </div>`;
        }

        modalContent.innerHTML = `
            <div class="personal-student-card bg-white w-full overflow-hidden relative">
                <button onclick="AppUI.hideModal('student-modal')" class="absolute top-4 right-4 text-slate-300 hover:text-slate-600 transition-colors z-10">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                
                <div class="p-6">
                    <div class="mb-6 pt-2">
                        <h2 class="text-xl font-bold text-slate-900 truncate leading-tight">${student.nombre}</h2>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-xs font-medium text-slate-500 truncate">${student.grupoNombre}</span>
                            ${estadoCuentaBadge}
                        </div>
                    </div>

                    <div class="mb-6">
                        <p class="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Saldo Disponible</p>
                        <p class="text-4xl font-black text-slate-800 tracking-tight font-tabular-nums">${AppFormat.formatNumber(totalPinceles)} ℙ</p>
                    </div>

                    <div class="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 mb-2">
                        <div>
                            <p class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Inversiones</p>
                            <p class="text-base font-bold text-slate-700 font-tabular-nums mt-0.5">${AppFormat.formatNumber(totalInvertido)} ℙ</p>
                        </div>
                        <div>
                            <p class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Ranking Global</p>
                            <p class="text-base font-bold text-slate-700 font-tabular-nums mt-0.5">#${rank}</p>
                        </div>
                    </div>
                    
                    ${productsHtml ? `<div class="mt-4 pt-2 space-y-2 border-t border-slate-100">${productsHtml}</div>` : ''}
                </div>
                
                <div class="bg-slate-50 px-6 py-2 border-t border-slate-100 flex justify-between items-center">
                     <span class="text-[10px] font-semibold text-slate-400 tracking-wider">BPD ID CARD</span>
                     <span class="w-2 h-2 rounded-full bg-slate-300"></span>
                </div>
            </div>
        `;
        AppUI.showModal('student-modal');
    },
    
    showSuccessSummary: function(modalId, reportData, reportType) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        let formContainerId, reportContainerId;

        if (modalId === 'bonos-modal') {
            formContainerId = 'bono-main-step-container';
            reportContainerId = 'bono-report-container';
        } else if (modalId === 'tienda-modal') {
             formContainerId = 'tienda-main-step-container';
             reportContainerId = 'tienda-report-container';
        } else if (modalId === 'donaciones-modal') { 
            formContainerId = 'donaciones-main-step-container';
            reportContainerId = 'donaciones-report-container';
        } else if (modalId === 'transacciones-combinadas-modal') {
            formContainerId = 'transacciones-combinadas-step-container';
            reportContainerId = 'transacciones-combinadas-report-container';
        } else if (modalId === 'transaccion-modal') {
            formContainerId = 'transaccion-admin-step-container';
            reportContainerId = 'transaccion-admin-report-container';
        } else {
            formContainerId = modalId.replace('-modal', '-main-step-container');
            reportContainerId = modalId.replace('-modal', '-report-container');
        }

        const formContainer = document.getElementById(formContainerId);
        const reportContainer = document.getElementById(reportContainerId);
        
        if (!formContainer || !reportContainer) {
            console.error(`Contenedores no encontrados para ${modalId}: form=${formContainerId}, report=${reportContainerId}`);
            AppUI.hideModal(modalId);
            return;
        }

        formContainer.classList.add('hidden');
        reportContainer.classList.remove('hidden');

        let title, detailsHtml = '';

        const formatCompactStat = (label, value, extraClass = '') => `
            <div class="bg-slate-50 p-2 rounded border border-slate-100 text-center ${extraClass}">
                <p class="text-[10px] uppercase font-bold text-slate-400 tracking-wide">${label}</p>
                <p class="text-sm font-bold text-slate-800 truncate">${value}</p>
            </div>
        `;

        switch (reportType) {
            case 'p2p':
                title = 'Transferencia Exitosa';
                const totalDebitado = reportData.cantidad_enviada + reportData.impuesto_cobrado;
                detailsHtml = `
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                        ${formatCompactStat('Remitente', reportData.remitente)}
                        ${formatCompactStat('Destinatario', reportData.destino)}
                        ${formatCompactStat('Monto Neto', `${AppFormat.formatNumber(reportData.cantidad_enviada)} ℙ`)}
                        ${formatCompactStat('Comisión', `${AppFormat.formatNumber(reportData.impuesto_cobrado)} ℙ`, 'text-red-600')}
                    </div>
                    <div class="bg-amber-50 p-3 rounded-lg text-center border border-amber-200">
                        <p class="text-xs text-amber-700 font-semibold uppercase">Total Debitado</p>
                        <p class="text-xl font-extrabold text-amber-700">${AppFormat.formatNumber(totalDebitado)} ℙ</p>
                    </div>
                `;
                break;
            case 'prestamo':
                 title = 'Préstamo Aprobado';
                 const interesTotalP = reportData.total_a_pagar - reportData.monto_solicitado;
                 detailsHtml = `
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                        ${formatCompactStat('Monto', `${AppFormat.formatNumber(reportData.monto_solicitado)} ℙ`)}
                        ${formatCompactStat('Plazo', `${reportData.plazo_dias} Días`)}
                        ${formatCompactStat('Interés', `${AppFormat.formatNumber(interesTotalP)} ℙ`)}
                        ${formatCompactStat('Cuota Diaria', `${AppFormat.formatNumber(reportData.cuota_diaria)} ℙ`)}
                    </div>
                    <div class="bg-amber-50 p-3 rounded-lg text-center border border-amber-200">
                        <p class="text-xs text-amber-700 font-semibold uppercase">Total a Pagar</p>
                        <p class="text-xl font-extrabold text-amber-700">${AppFormat.formatNumber(reportData.total_a_pagar)} ℙ</p>
                    </div>
                `;
                break;
            case 'deposito':
                 title = 'Inversión Creada';
                 const gananciaNeta = reportData.ganancia_neta;
                 detailsHtml = `
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                        ${formatCompactStat('Inversión', `${AppFormat.formatNumber(reportData.monto_depositado)} ℙ`)}
                        ${formatCompactStat('Plazo', `${reportData.plazo_dias} Días`)}
                        ${formatCompactStat('Tasa', `${reportData.tasa_final}%`)}
                        ${formatCompactStat('Ganancia', `${AppFormat.formatNumber(gananciaNeta)} ℙ`)}
                    </div>
                    <div class="bg-amber-50 p-3 rounded-lg text-center border border-amber-200">
                        <p class="text-xs text-amber-700 font-semibold uppercase">Retorno Total</p>
                        <p class="text-xl font-extrabold text-amber-700">${AppFormat.formatNumber(reportData.total_a_recibir)} ℙ</p>
                    </div>
                `;
                break;
            case 'bono':
                title = 'Bono Canjeado';
                detailsHtml = `
                    <div class="grid grid-cols-2 gap-2 mb-4">
                        ${formatCompactStat('Bono', reportData.bono_clave)}
                        ${formatCompactStat('Valor', `${AppFormat.formatNumber(reportData.recompensa)} ℙ`)}
                    </div>
                    <div class="bg-amber-50 p-3 rounded-lg text-center border border-amber-200">
                        <p class="text-xs text-amber-700 font-semibold uppercase">Saldo Actual</p>
                        <p class="text-xl font-extrabold text-amber-700">${AppFormat.formatNumber(reportData.saldo_final)} ℙ</p>
                    </div>
                `;
                break;
            case 'tienda':
                title = 'Compra Exitosa';
                detailsHtml = `
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                        ${formatCompactStat('Artículo', reportData.item_nombre, 'col-span-2 md:col-span-1')}
                        ${formatCompactStat('Precio Base', `${AppFormat.formatNumber(reportData.costo_base)} ℙ`)}
                        ${formatCompactStat('ITBIS', `${AppFormat.formatNumber(reportData.itbis)} ℙ`)}
                    </div>
                    <div class="bg-amber-50 p-3 rounded-lg text-center border border-amber-200">
                        <p class="text-xs text-amber-700 font-semibold uppercase">Total Pagado</p>
                        <p class="text-xl font-extrabold text-amber-700">${AppFormat.formatNumber(reportData.costo_total)} ℙ</p>
                    </div>
                `;
                break;
            case 'donacion': 
                title = 'Aporte Realizado';
                const metaAlcanzada = reportData.estado_causa === 'Completada';
                const estadoClase = metaAlcanzada ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700';

                detailsHtml = `
                    <div class="grid grid-cols-2 gap-2 mb-4">
                        ${formatCompactStat('Causa', reportData.causa_id)}
                        ${formatCompactStat('Donado', `${AppFormat.formatNumber(reportData.monto_donado)} ℙ`)}
                    </div>
                    <div class="bg-amber-50 p-3 rounded-lg text-center border border-amber-200">
                        <p class="text-xs text-amber-700 font-semibold uppercase">Recaudado Acumulado</p>
                        <p class="text-xl font-extrabold text-amber-700 mb-1">${AppFormat.formatNumber(reportData.monto_recaudado)} ℙ</p>
                        <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${estadoClase}">
                           Causa: ${reportData.estado_causa}
                        </span>
                    </div>
                    ${metaAlcanzada ? 
                        `<p class="mt-3 text-sm font-semibold text-center text-green-700">¡META ALCANZADA! Los fondos serán transferidos al beneficiario.</p>` : ''
                    }
                `;
                break;
            case 'admin_multi':
                title = 'Transacción Múltiple';
                const cantidadPorUser = reportData.cantidad_por_usuario;
                const esDeposito = cantidadPorUser > 0;
                
                detailsHtml = `
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                        ${formatCompactStat('Usuarios', reportData.totalUsuariosAfectados)}
                        ${formatCompactStat('Monto/User', `${AppFormat.formatNumber(Math.abs(cantidadPorUser))} ℙ`)}
                        ${formatCompactStat('Exitosos', reportData.exitos.length, 'text-green-600')}
                        ${formatCompactStat('Fallidos', reportData.errores.length, reportData.errores.length > 0 ? 'text-red-600' : '')}
                    </div>
                    <div class="bg-amber-50 p-3 rounded-lg text-center border border-amber-200">
                        <p class="text-xs text-amber-700 font-semibold uppercase">${esDeposito ? 'Costo Total Tesorería' : 'Ingreso Total Tesorería'}</p>
                        <p class="text-xl font-extrabold text-amber-700">${AppFormat.formatNumber(esDeposito ? reportData.costoTotalBruto : reportData.ingresoTotal)} ℙ</p>
                    </div>
                `;
                break;

            default:
                title = 'Proceso Completado';
                detailsHtml = `<p class="text-center text-slate-600">Operación exitosa.</p>`;
        }
        
        const confirmBtnId = `report-confirm-btn-${modalId}`;

        reportContainer.innerHTML = `
            <div class="confirmation-report-card w-full max-w-2xl mx-auto">
                <div class="text-center mb-4">
                    <div class="inline-flex items-center justify-center p-2 bg-amber-100 rounded-full mb-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6 text-amber-600">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                    </div>
                    <h2 class="text-xl font-bold text-slate-800">${title}</h2>
                </div>
                
                <div class="mb-4">
                    ${detailsHtml}
                </div>

                <div class="flex justify-center mt-2">
                    <button id="${confirmBtnId}" class="px-6 py-2 bg-white border border-amber-600 text-amber-600 text-sm font-medium rounded-lg hover:bg-amber-50 transition-colors shadow-sm">
                        Cerrar Recibo
                    </button>
                </div>
            </div>
        `;
        
        const confirmBtn = document.getElementById(confirmBtnId);
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                 reportContainer.classList.add('hidden');
                 formContainer.classList.remove('hidden');
                 AppUI.hideModal(modalId);
                 
                 if (modalId === 'transacciones-combinadas-modal') {
                     const activeTab = document.querySelector('#transacciones-combinadas-modal .tab-btn.active-tab');
                     if (activeTab) AppUI.changeTransaccionesCombinadasTab(activeTab.dataset.tab);
                 } else if (modalId === 'transaccion-modal') {
                     const activeTab = document.querySelector('#transaccion-modal .tab-btn.active-tab');
                     if (activeTab) AppUI.changeAdminTab(activeTab.dataset.tab);
                 }
            });
        }
    },
    
    showTransaccionesCombinadasModal: function(initialTab = 'p2p_transfer') {
        if (!AppState.datosActuales) return;
        
        document.getElementById('transacciones-combinadas-report-container').classList.add('hidden');
        document.getElementById('transacciones-combinadas-step-container').classList.remove('hidden');

        AppUI.changeTransaccionesCombinadasTab(initialTab);
        AppUI.showModal('transacciones-combinadas-modal');
    },
    
    changeTransaccionesCombinadasTab: function(tabId) {
        document.querySelectorAll('#transacciones-combinadas-modal .tab-btn').forEach(btn => {
            btn.classList.remove('active-tab', 'border-amber-600', 'text-amber-600');
            btn.classList.add('border-transparent', 'text-slate-700', 'hover:bg-slate-100');
        });

        document.querySelectorAll('#transacciones-combinadas-modal .tab-content').forEach(content => {
            content.classList.add('hidden');
        });

        document.querySelector(`#transacciones-combinadas-modal [data-tab="${tabId}"]`).classList.add('active-tab', 'border-amber-600', 'text-amber-600');
        document.querySelector(`#transacciones-combinadas-modal [data-tab="${tabId}"]`).classList.remove('border-transparent', 'text-slate-700', 'hover:bg-slate-100');
        document.getElementById(`tab-${tabId}`).classList.remove('hidden');

        if (tabId === 'p2p_transfer') {
            AppUI.resetSearchInput('p2pOrigen');
            AppUI.resetSearchInput('p2pDestino');
            document.getElementById('p2p-clave').value = "";
            document.getElementById('p2p-cantidad').value = "";
            AppUI.updateP2PCalculoImpuesto();
            
            document.getElementById('p2p-clave').classList.remove('shake');
            document.getElementById('p2p-clave').focus();
        } else if (tabId === 'prestamo_flex') {
            AppUI.resetFlexibleForm('prestamo');
            AppUI.updatePrestamoCalculadora();
        } else if (tabId === 'deposito_flex') {
            AppUI.resetFlexibleForm('deposito');
            AppUI.updateDepositoCalculadora();
        }
        
        document.getElementById('transacciones-combinadas-status-msg').textContent = "";
        document.getElementById('transacciones-combinadas-report-container').classList.add('hidden');
        document.getElementById('transacciones-combinadas-step-container').classList.remove('hidden');
    },

    setupFlexibleInputListeners: function(type) {
        const montoInput = document.getElementById(`${type}-monto-input`);
        const plazoInput = document.getElementById(`${type}-plazo-input`);
        const updateFunc = type === 'prestamo' ? AppUI.updatePrestamoCalculadora : AppUI.updateDepositoCalculadora;

        if (montoInput) montoInput.addEventListener('input', updateFunc);
        if (plazoInput) plazoInput.addEventListener('input', updateFunc);
    },
    
    updatePrestamoCalculadora: function() {
        const montoInput = document.getElementById('prestamo-monto-input');
        const plazoInput = document.getElementById('prestamo-plazo-input');
        const plazoDisplay = document.getElementById('prestamo-plazo-display');
        const tasaDisplay = document.getElementById('prestamo-tasa-display');
        const totalPagarDisplay = document.getElementById('prestamo-total-pagar-display');
        const cuotaDiariaDisplay = document.getElementById('prestamo-cuota-diaria-display');
        const btn = document.getElementById('prestamo-submit-btn');
        
        if (!montoInput || !plazoInput) return;

        AppUI.updateSliderFill(montoInput);
        AppUI.updateSliderFill(plazoInput);

        const monto = parseInt(montoInput.value) || 0;
        const plazo = parseInt(plazoInput.value) || 0;
        const student = AppState.currentSearch.prestamoAlumno.info;
        
        plazoDisplay.textContent = `${plazo} Días`;
        
        const minMonto = AppConfig.PRESTAMO_MIN_MONTO;
        const maxMonto = AppConfig.PRESTAMO_MAX_MONTO;
        
        if (monto < minMonto || monto > maxMonto || plazo < AppConfig.PRESTAMO_MIN_PLAZO_DIAS || plazo > AppConfig.PRESTAMO_MAX_PLAZO_DIAS) {
            tasaDisplay.textContent = '-';
            totalPagarDisplay.textContent = 'Monto/Plazo Inválido';
            cuotaDiariaDisplay.textContent = '-';
            document.getElementById('prestamo-elegibilidad-msg').textContent = `Monto entre ${AppFormat.formatNumber(minMonto)} ℙ y ${AppFormat.formatNumber(maxMonto)} ℙ.`;
            btn.disabled = true;
            return;
        }

        const tasaDecimal = AppFormat.calculateLoanRate(plazo);
        const interesTotal = monto * tasaDecimal;
        const totalAPagar = Math.ceil(monto + interesTotal);
        const cuotaDiaria = Math.ceil(totalAPagar / plazo);
        
        tasaDisplay.textContent = `${(tasaDecimal * 100).toFixed(2)}%`; 
        totalPagarDisplay.textContent = `${AppFormat.formatNumber(totalAPagar)} ℙ`;
        cuotaDiariaDisplay.textContent = `${AppFormat.formatNumber(cuotaDiaria)} ℙ`;
        document.getElementById('prestamo-elegibilidad-msg').textContent = 'Defina los parámetros para evaluar elegibilidad.';
        
        if (!student) {
            AppTransacciones.setEligibilityState(btn, document.getElementById('prestamo-elegibilidad-msg'), false, 'Busque su nombre para validar elegibilidad.', true);
            return;
        }
        
        const elegibilidad = AppTransacciones.checkLoanEligibility(student, monto);
        AppTransacciones.setEligibilityState(btn, document.getElementById('prestamo-elegibilidad-msg'), elegibilidad.isEligible, elegibilidad.message);
    },

    updateDepositoCalculadora: function() {
        const montoInput = document.getElementById('deposito-monto-input');
        const plazoInput = document.getElementById('deposito-plazo-input');
        const plazoDisplay = document.getElementById('deposito-plazo-display');
        const tasaDisplay = document.getElementById('deposito-tasa-display');
        const gananciaDisplay = document.getElementById('deposito-ganancia-display');
        const totalRecibirDisplay = document.getElementById('deposito-total-recibir-display');
        const btn = document.getElementById('deposito-submit-btn');
        
        if (!montoInput || !plazoInput) return;

        AppUI.updateSliderFill(montoInput);
        AppUI.updateSliderFill(plazoInput);
        
        const monto = parseInt(montoInput.value) || 0;
        const plazo = parseInt(plazoInput.value) || 0;
        const student = AppState.currentSearch.depositoAlumno.info;
        
        plazoDisplay.textContent = `${plazo} Días`;
        
        const minMonto = AppConfig.DEPOSITO_MIN_MONTO;

        if (monto < minMonto || plazo < AppConfig.DEPOSITO_MIN_PLAZO_DIAS || plazo > AppConfig.DEPOSITO_MAX_PLAZO_DIAS) {
            tasaDisplay.textContent = '-';
            gananciaDisplay.textContent = 'Monto/Plazo Inválido';
            totalRecibirDisplay.textContent = '0 ℙ';
            document.getElementById('deposito-elegibilidad-msg').textContent = `Monto mínimo: ${AppFormat.formatNumber(minMonto)} ℙ. Plazo: 7-30 días.`;
            btn.disabled = true;
            return;
        }

        const tasaDecimal = AppFormat.calculateDepositRate(plazo);
        const interesBruto = monto * tasaDecimal;
        const totalARecibir = Math.ceil(monto + interesBruto);
        
        tasaDisplay.textContent = `${(tasaDecimal * 100).toFixed(3)}%`; 
        gananciaDisplay.textContent = `${AppFormat.formatNumber(Math.ceil(interesBruto))} ℙ`;
        totalRecibirDisplay.textContent = `${AppFormat.formatNumber(totalARecibir)} ℙ`;
        document.getElementById('deposito-elegibilidad-msg').textContent = 'Defina los parámetros para evaluar elegibilidad.';

        if (!student) {
            AppTransacciones.setEligibilityState(btn, document.getElementById('deposito-elegibilidad-msg'), false, 'Busque su nombre para validar elegibilidad.', true);
            return;
        }

        const elegibilidad = AppTransacciones.checkDepositEligibility(student, monto);
        AppTransacciones.setEligibilityState(btn, document.getElementById('deposito-elegibilidad-msg'), elegibilidad.isEligible, elegibilidad.message);
    },
    
    selectFlexibleStudent: function(student) {
        const modal = document.getElementById('transacciones-combinadas-modal');
        if (modal.classList.contains('opacity-0') === false) {
             const activeTab = document.querySelector('#transacciones-combinadas-modal .tab-btn.active-tab');
             const tabId = activeTab ? activeTab.dataset.tab : '';
             
             if (tabId === 'prestamo_flex') {
                  AppUI.updatePrestamoCalculadora();
             } else if (tabId === 'deposito_flex') {
                  AppUI.updateDepositoCalculadora();
             }
        }
    },
    
    showLoading: function() {
        document.getElementById('loading-overlay').classList.remove('opacity-0', 'pointer-events-none');
    },

    mostrarVersionApp: function() {
        const versionContainer = document.getElementById('app-version-container');
        versionContainer.classList.add('text-slate-400'); 
        versionContainer.innerHTML = `Estado: ${AppConfig.APP_STATUS} | ${AppConfig.APP_VERSION}`;
    },

    showModal: function(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.querySelector('[class*="transform"]').classList.remove('scale-95');
        
        if (modalId === 'transaccion-modal' || modalId === 'transacciones-combinadas-modal' || modalId === 'donaciones-modal' || modalId === 'bonos-modal' || modalId === 'tienda-modal') {
             if (AppState.isSidebarOpen) {
                 AppUI.toggleSidebar();
             }
        }
        
        if (modalId === 'gestion-modal') {
             document.getElementById('clave-input').classList.remove('shake');
        }
    },

    hideModal: function(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.add('opacity-0', 'pointer-events-none');
        modal.querySelector('[class*="transform"]').classList.add('scale-95');

        if (modalId === 'transaccion-modal') {
            document.getElementById('transaccion-admin-report-container').classList.add('hidden');
            document.getElementById('transaccion-admin-step-container').classList.remove('hidden');
            
            document.getElementById('transaccion-lista-grupos-container').innerHTML = '';
            document.getElementById('transaccion-lista-usuarios-container').innerHTML = '';
            document.getElementById('transaccion-cantidad-input').value = "";
            document.getElementById('transaccion-calculo-impuesto').textContent = ""; 
            AppState.transaccionSelectAll = {}; 
            
            AppState.transaccionSelectedGroups.clear();
            AppState.transaccionSelectedUsers.clear();
            
            AppTransacciones.setLoadingState(document.getElementById('transaccion-submit-btn'), document.getElementById('transaccion-btn-text'), false, 'Realizar Transacción');
            AppUI.clearBonoAdminForm();
            document.getElementById('bono-admin-status-msg').textContent = "";
            AppUI.clearTiendaAdminForm();
            document.getElementById('tienda-admin-status-msg').textContent = "";
            AppUI.clearCausaAdminForm();
            document.getElementById('causa-admin-status-msg').textContent = "";
            document.getElementById('tienda-date-status-msg').textContent = "";
        }
        
        if (modalId === 'transacciones-combinadas-modal') {
            document.getElementById('transacciones-combinadas-report-container').classList.add('hidden');
            document.getElementById('transacciones-combinadas-step-container').classList.remove('hidden');
            
            AppUI.resetSearchInput('p2pOrigen');
            AppUI.resetSearchInput('p2pDestino');
            document.getElementById('p2p-clave').value = "";
            document.getElementById('p2p-cantidad').value = "";
            document.getElementById('p2p-calculo-impuesto').textContent = "";
            
            document.getElementById('p2p-clave').classList.remove('shake'); 
            
            AppTransacciones.setLoadingState(document.getElementById('p2p-submit-btn'), document.getElementById('p2p-btn-text'), false, 'Realizar Transferencia');
            
            AppUI.resetFlexibleForm('prestamo');
            AppUI.resetFlexibleForm('deposito');
            document.getElementById('transacciones-combinadas-status-msg').textContent = "";
        }
        
        if (modalId === 'bonos-modal') {
            document.getElementById('bono-report-container').classList.add('hidden');
            document.getElementById('bono-main-step-container').classList.remove('hidden');
            AppUI.showBonoStep1();
        }

        if (modalId === 'tienda-modal') {
            document.getElementById('tienda-report-container').classList.add('hidden');
            document.getElementById('tienda-main-step-container').classList.remove('hidden');
            AppUI.showTiendaStep1();
        }
        
        if (modalId === 'donaciones-modal') { 
            document.getElementById('donaciones-report-container').classList.add('hidden');
            document.getElementById('donaciones-main-step-container').classList.remove('hidden');
            AppUI.showDonacionesStep1();
        }
        
        if (modalId === 'gestion-modal') {
             document.getElementById('clave-input').value = "";
             document.getElementById('clave-input').classList.remove('shake', 'border-red-500');
        }
        
        if (modalId === 'terminos-modal') {
             document.getElementById('terminos-modal-content').innerHTML = '<p class="text-center text-sm text-slate-500">Cargando el contrato de uso...</p>';
             document.getElementById('terminos-modal-title').textContent = 'Términos y Condiciones';
        }
    },
    
    resetFlexibleForm: function(type) {
        AppUI.resetSearchInput(`${type}Alumno`);
        document.getElementById(`${type}-clave-p2p`).value = "";
        
        document.getElementById(`${type}-clave-p2p`).classList.remove('shake');

        const montoInput = document.getElementById(`${type}-monto-input`);
        const plazoInput = document.getElementById(`${type}-plazo-input`);
        
        if (montoInput) montoInput.value = type === 'prestamo' ? AppConfig.PRESTAMO_MIN_MONTO : AppConfig.DEPOSITO_MIN_MONTO;
        if (plazoInput) plazoInput.value = type === 'prestamo' ? AppConfig.PRESTAMO_MIN_PLAZO_DIAS : AppConfig.DEPOSITO_MIN_PLAZO_DIAS;

        document.getElementById(`${type}-status-msg`).textContent = "";
        
        const updateFunc = type === 'prestamo' ? AppUI.updatePrestamoCalculadora : AppUI.updateDepositoCalculadora;
        updateFunc(); 

        document.getElementById(`${type}-submit-btn`).disabled = true;
    },

    changeAdminTab: function(tabId) {
        document.querySelectorAll('#transaccion-modal .tab-btn').forEach(btn => {
            btn.classList.remove('active-tab', 'border-amber-600', 'text-amber-600');
            btn.classList.add('border-transparent', 'text-slate-700', 'hover:bg-slate-100');
        });

        document.querySelectorAll('#transaccion-modal .tab-content').forEach(content => {
            content.classList.add('hidden');
        });

        document.querySelector(`#transaccion-modal [data-tab="${tabId}"]`).classList.add('active-tab', 'border-amber-600', 'text-amber-600');
        document.querySelector(`#transaccion-modal [data-tab="${tabId}"]`).classList.remove('border-transparent', 'text-slate-700', 'hover:bg-slate-100');
        document.getElementById(`tab-${tabId}`).classList.remove('hidden');
        
        document.getElementById('transaccion-admin-report-container').classList.add('hidden');
        document.getElementById('transaccion-admin-step-container').classList.remove('hidden');
        
        if (tabId === 'transaccion') {
            if (AppState.datosActuales) {
                AppUI.populateGruposTransaccion();
                AppUI.populateUsuariosTransaccion();
            } else {
                document.getElementById('transaccion-lista-grupos-container').innerHTML = '<span class="text-sm text-slate-500 p-2">Cargando datos base...</span>';
                document.getElementById('transaccion-lista-usuarios-container').innerHTML = '<span class="text-sm text-slate-500 p-2">Espere...</span>';
            }
        } else if (tabId === 'bonos_admin') { 
            if (AppState.lastKnownGroupsHash === '') {
                AppUI.populateAdminGroupCheckboxes('bono-admin-grupos-checkboxes-container', 'bonos');
            }
            AppUI.populateBonoAdminList();
            AppUI.clearBonoAdminForm(); 
        } else if (tabId === 'tienda_gestion') { 
            if (AppState.lastKnownGroupsHash === '') {
                AppUI.populateAdminGroupCheckboxes('tienda-admin-grupos-checkboxes-container', 'tienda');
            }
            AppUI.updateTiendaAdminStatusLabel();
            AppUI.clearTiendaAdminForm();
            AppUI.populateTiendaAdminDate(); 
        } else if (tabId === 'tienda_inventario') { 
            AppUI.populateTiendaAdminList();
        } else if (tabId === 'causas_admin') { 
            AppUI.populateCausasAdminList();
            AppUI.clearCausaAdminForm();
        }
        
        document.getElementById('transaccion-status-msg').textContent = "";
    },

    setupSearchInput: function(inputId, resultsId, stateKey, onSelectCallback) {
        const input = document.getElementById(inputId);
        const results = document.getElementById(resultsId);

        if (!input) return;

        input.dataset.resultsId = resultsId; 
        
        input.addEventListener('input', (e) => {
            const query = e.target.value;
            AppState.currentSearch[stateKey].query = query;
            AppState.currentSearch[stateKey].selected = null; 
            AppState.currentSearch[stateKey].info = null;
            
            if (stateKey === 'causaAdminBeneficiario' && query === '') {
                 AppState.currentSearch.causaAdminBeneficiario.query = '';
                 AppState.currentSearch.causaAdminBeneficiario.selected = null;
                 AppState.currentSearch.causaAdminBeneficiario.info = null;
                 onSelectCallback(null);
                 if (results) results.classList.add('hidden');
                 return;
            }
            
            if (query === '') {
                onSelectCallback(null);
            }
            
            if (results) {
                 AppUI.handleStudentSearch(query, inputId, resultsId, stateKey, onSelectCallback);
            }
            
            input.classList.remove('shake');
        });
        
        if (results) {
            document.addEventListener('click', (e) => {
                if (!input.contains(e.target) && !results.contains(e.target)) {
                    results.classList.add('hidden');
                }
            });
            
            input.addEventListener('focus', () => {
                 if (input.value) {
                     AppUI.handleStudentSearch(input.value, inputId, resultsId, stateKey, onSelectCallback);
                 }
                 input.classList.remove('shake');
            });
        }
    },
    
    handleStudentSearch: function(query, inputId, resultsId, stateKey, onSelectCallback) {
        const resultsContainer = document.getElementById(resultsId);
        
        if (!resultsContainer || query.length < 1) {
            if (resultsContainer) resultsContainer.classList.add('hidden');
            return;
        }

        const lowerQuery = query.toLowerCase();
        let searchTargets = [];

        if (stateKey === 'causaAdminBeneficiario') {
            searchTargets.push({
                nombre: 'Banco',
                display: 'Banco (Tesorería)',
                type: 'Banco',
            });
            
            AppState.datosAdicionales.allStudents.forEach(s => {
                searchTargets.push({
                    nombre: s.nombre,
                    display: `${s.nombre} (Alumno: ${s.grupoNombre})`,
                    type: 'Alumno',
                });
            });
            
            AppState.datosAdicionales.allGroups.filter(n => n !== 'Cicla' && n !== 'Banco').forEach(g => {
                searchTargets.push({
                    nombre: `GRUPO: ${g}`,
                    display: `GRUPO: ${g}`,
                    type: 'Grupo',
                });
            });

            const filteredTargets = searchTargets
                .filter(t => t.display.toLowerCase().includes(lowerQuery))
                .sort((a, b) => a.display.localeCompare(b.display))
                .slice(0, 10);

            resultsContainer.innerHTML = '';
            if (filteredTargets.length === 0) {
                 resultsContainer.innerHTML = `<div class="p-2 text-sm text-slate-500">No se encontraron coincidencias.</div>`;
            } else {
                 filteredTargets.forEach(target => {
                     const div = document.createElement('div');
                     div.className = 'p-2 hover:bg-slate-100 cursor-pointer text-sm text-slate-900';
                     div.textContent = target.display;
                     div.onclick = () => {
                         const input = document.getElementById(inputId);
                         input.value = target.nombre;
                         AppState.currentSearch[stateKey].query = target.nombre;
                         AppState.currentSearch[stateKey].selected = target.nombre;
                         AppState.currentSearch[stateKey].info = target;
                         resultsContainer.classList.add('hidden');
                         onSelectCallback(target);
                         input.classList.remove('shake');
                     };
                     resultsContainer.appendChild(div);
                 });
            }
            resultsContainer.classList.remove('hidden');
            return;

        } else {
             let studentList = AppState.datosAdicionales.allStudents;
            
             const ciclaAllowed = ['p2pDestino', 'prestamoAlumno', 'depositoAlumno', 'bonoAlumno', 'tiendaAlumno', 'causaDonante']; 
             if (!ciclaAllowed.includes(stateKey)) {
                 studentList = studentList.filter(s => s.grupoNombre !== 'Cicla');
             }
            
             const filteredStudents = studentList
                 .filter(s => s.nombre.toLowerCase().includes(lowerQuery))
                 .sort((a, b) => a.nombre.localeCompare(b.nombre))
                 .slice(0, 10);

             resultsContainer.innerHTML = '';
             if (filteredStudents.length === 0) {
                 resultsContainer.innerHTML = `<div class="p-2 text-sm text-slate-500">No se encontraron alumnos.</div>`;
             } else {
                 filteredStudents.forEach(student => {
                     const div = document.createElement('div');
                     
                     const socioData = AppFormat.getSocioData(student.etiqueta);
                     
                     let extraHtml = '';
                     let divClass = 'p-2 hover:bg-slate-100 cursor-pointer text-sm text-slate-900';
                     
                     if (socioData) {
                         divClass += ` ${socioData.rowClass}`;
                         extraHtml = ` <span class="${socioData.badgeClass}" style="font-size: 0.6em;">${socioData.label}</span>`;
                     }
                     div.className = divClass;

                     div.innerHTML = `${student.nombre} <span class="text-slate-500">(${student.grupoNombre})</span>${extraHtml}`;
                     
                     div.onclick = () => {
                         const input = document.getElementById(inputId);
                         input.value = student.nombre;
                         AppState.currentSearch[stateKey].query = student.nombre;
                         AppState.currentSearch[stateKey].selected = student.nombre;
                         AppState.currentSearch[stateKey].info = student;
                         resultsContainer.classList.add('hidden');
                         onSelectCallback(student);
                         
                         input.classList.remove('shake');
                     };
                     resultsContainer.appendChild(div);
                 });
             }
             resultsContainer.classList.remove('hidden');
        }
    },

    resetSearchInput: function(stateKey) {
        let inputIds = [];
        
        if (stateKey === 'prestamoAlumno' || stateKey === 'depositoAlumno') {
             inputIds.push(`${stateKey.replace('Alumno', '-search-alumno')}`);
        } else if (stateKey.includes('p2p')) {
             inputIds.push(`${stateKey.replace('p2p', 'p2p-search-')}`);
        } else if (stateKey === 'bonoAlumno') {
             inputIds.push('bono-search-alumno-step2');
        } else if (stateKey === 'tiendaAlumno') {
             inputIds.push('tienda-search-alumno-step2');
        } else if (stateKey === 'causaDonante') { 
             inputIds.push('causa-search-alumno-step2');
        } else if (stateKey === 'causaAdminBeneficiario') { 
             inputIds.push('causa-admin-beneficiario-search');
             AppState.currentSearch[stateKey].selected = 'Banco';
             AppState.currentSearch[stateKey].info = { nombre: 'Banco', grupoNombre: 'Banco' };
             
             const input = document.getElementById(inputIds[0]);
             if(input) input.value = 'Banco'; 
        } else {
            return;
        }
        
        if (stateKey !== 'causaAdminBeneficiario') {
             inputIds.forEach(inputId => {
                 const input = document.getElementById(inputId);
                 if (input) {
                     input.value = "";
                     input.classList.remove('shake');
                     const resultsId = input.dataset.resultsId;
                     const results = document.getElementById(resultsId || `${inputId}-results`);
                     if (results) results.classList.add('hidden');
                 }
             });
             
             AppState.currentSearch[stateKey].query = "";
             AppState.currentSearch[stateKey].selected = null;
             AppState.currentSearch[stateKey].info = null;
        }
        
        if (stateKey === 'tiendaAlumno') {
            AppUI.updateTiendaButtonStates();
        }
    },
    
    selectP2PStudent: function(student) { },
    
    selectBonoStudent: function(student) { },

    selectTiendaStudent: function(student) {
        AppUI.updateTiendaButtonStates();
    },
    
    selectDonacionesStudent: function(student) { }, 

    selectAdminBeneficiario: function(selection) {
        if (!selection) {
        }
    },

    populateAdminGroupCheckboxes: function(containerId, entityType) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const allGroups = AppState.datosAdicionales.allGroups || [];
        
        if (allGroups.length === 0) {
            container.innerHTML = `<p class="text-xs text-slate-500">No hay grupos cargados.</p>`;
            return;
        }

        const currentSelection = AppUI.getAdminGroupCheckboxSelection(containerId);

        container.innerHTML = '';

        allGroups.forEach(grupoNombre => {
            const safeName = grupoNombre.replace(/\s/g, '-');
            const checkboxId = `${entityType}-group-cb-${safeName}`;
            
            const div = document.createElement('div');
            div.className = "flex items-center space-x-2"; 
            
            const input = document.createElement('input');
            input.type = "checkbox";
            input.id = checkboxId;
            input.value = grupoNombre;
            input.className = "h-4 w-4 text-amber-600 border-slate-300 rounded focus:ring-amber-600 bg-white group-admin-checkbox";
            
            if (currentSelection.includes(grupoNombre)) {
                 input.checked = true;
            }

            const label = document.createElement('label');
            label.htmlFor = checkboxId;
            label.textContent = grupoNombre;
            label.className = "ml-2 block text-sm text-slate-900 cursor-pointer flex-1";

            div.appendChild(input);
            div.appendChild(label);
            container.appendChild(div);
        });
    },
    
    getAdminGroupCheckboxSelection: function(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return [];
        
        return Array.from(container.querySelectorAll('.group-admin-checkbox:checked')).map(cb => cb.value);
    },

    selectAdminGroupCheckboxes: function(containerId, allowedGroupsString) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.querySelectorAll('.group-admin-checkbox').forEach(cb => {
            cb.checked = false;
        });

        if (!allowedGroupsString) return;

        const allowedGroups = allowedGroupsString.split(',').map(g => g.trim());

        allowedGroups.forEach(groupName => {
            const safeName = groupName.replace(/\s/g, '-');
            const checkboxId = `${containerId.split('-')[0]}-group-cb-${safeName}`;
            const checkbox = document.getElementById(checkboxId);
            if (checkbox) {
                checkbox.checked = true;
            }
        });
    },

    updateP2PCalculoImpuesto: function() {
        const cantidadInput = document.getElementById('p2p-cantidad');
        const calculoMsg = document.getElementById('p2p-calculo-impuesto');
        const cantidad = parseInt(cantidadInput.value, 10);
        
        cantidadInput.classList.remove('shake');

        if (isNaN(cantidad) || cantidad <= 0) {
            calculoMsg.textContent = "";
            return;
        }

        const impuesto = Math.ceil(cantidad * AppConfig.IMPUESTO_P2P_TASA);
        const total = cantidad + impuesto;
        
        calculoMsg.innerHTML = `<span class="color-dorado-main">Impuesto (${AppConfig.IMPUESTO_P2P_TASA * 100}%): ${AppFormat.formatNumber(impuesto)} ℙ | Total a debitar: ${AppFormat.formatNumber(total)} ℙ</span>`;
    },

    showBonoModal: function() {
        AppUI.showBonoStep1();
        AppUI.showModal('bonos-modal');
        AppUI.populateBonoList(); 

        document.getElementById('bono-report-container').classList.add('hidden');
        document.getElementById('bono-main-step-container').classList.remove('hidden');
    },

    showBonoStep1: function() {
        document.getElementById('bono-step-form-container').classList.add('hidden');
        document.getElementById('bono-step-list-container').classList.remove('hidden');
        AppState.bonos.selectedBono = null;
        document.getElementById('bono-status-msg').textContent = "";
        document.getElementById('bono-step2-status-msg').textContent = "";
        document.getElementById('bono-clave-p2p-step2').value = "";
        
        document.getElementById('bono-clave-p2p-step2').classList.remove('shake');
        
        AppUI.resetSearchInput('bonoAlumno');
        AppTransacciones.setLoadingState(document.getElementById('bono-submit-step2-btn'), document.getElementById('bono-btn-text-step2'), false, 'Confirmar Canje');
    },

    showBonoStep2: function(bonoClave) {
        const bono = AppState.bonos.disponibles.find(b => b.clave === bonoClave);
        if (!bono) return;

        AppState.bonos.selectedBono = bonoClave;
        document.getElementById('bono-step-list-container').classList.add('hidden');
        document.getElementById('bono-step-form-container').classList.remove('hidden');

        document.getElementById('bono-item-name-display').textContent = bono.nombre;
        document.getElementById('bono-item-reward-display').textContent = `Recompensa: ${AppFormat.formatNumber(bono.recompensa)} ℙ`;
        document.getElementById('bono-clave-input-step2').value = bonoClave;
        document.getElementById('bono-step2-status-msg').textContent = "";
        
        document.getElementById('bono-search-alumno-step2').value = AppState.currentSearch.bonoAlumno.info?.nombre || '';
        
        document.getElementById('bono-clave-p2p-step2').focus();
    },

    populateBonoList: function() {
        if (!AppState.datosActuales || AppState.bonos.disponibles === null) {
             const container = document.getElementById('bonos-lista-disponible');
             if(container) container.innerHTML = `<p class="text-sm text-slate-500 text-center col-span-4">Cargando bonos...</p>`;
             return;
        }

        if (document.getElementById('bonos-modal').classList.contains('opacity-0')) return;
        
        const container = document.getElementById('bonos-lista-disponible');
        const bonos = AppState.bonos.disponibles;
        
        const student = AppState.currentSearch.bonoAlumno.info || { grupoNombre: AppState.selectedGrupo };
        const studentGroup = student.grupoNombre;
        const now = Date.now();

        const bonosActivos = bonos.filter(bono => {
            if (bono.usos_actuales >= bono.usos_totales) return false;
            if (bono.expiracion_fecha && new Date(bono.expiracion_fecha).getTime() < now) return false;

            const allowedGroups = (bono.grupos_permitidos || '').split(',').map(g => g.trim()).filter(g => g.length > 0);
            const hasRestrictions = allowedGroups.length > 0;
            
            if (hasRestrictions && studentGroup) {
                if (!allowedGroups.includes(studentGroup)) {
                    return false;
                }
            }
            return true;
        });


        if (bonosActivos.length === 0) {
            container.innerHTML = `<p class="text-sm text-slate-500 text-center col-span-4">No hay bonos disponibles en este momento.</p>`;
            return;
        }
        
        container.innerHTML = bonosActivos.map(bono => {
            const recompensa = AppFormat.formatNumber(bono.recompensa);
            const usosRestantes = bono.usos_totales === 9999 ? 'Ilimitado' : (bono.usos_totales - bono.usos_actuales);
            
            const isCanjeado = AppState.bonos.canjeados.includes(bono.clave);
            const cardClass = isCanjeado ? 'bg-slate-50 shadow-inner border-slate-200 opacity-60' : 'bg-white shadow-md border-amber-200 hover:shadow-lg transition-all';
            
            const badge = isCanjeado ? 
                `<span class="text-xs font-bold bg-slate-200 text-slate-700 rounded-full px-2 py-0.5">CANJEADO</span>` :
                `<span class="text-xs font-bold bg-green-100 text-green-700 rounded-full px-2 py-0.5">ACTIVO</span>`;

            const claveEscapada = escapeHTML(bono.clave);

            return `
                <div class="rounded-xl shadow-sm p-3 border compact-card ${cardClass}">
                    <div class="flex justify-between items-center mb-2"> 
                        <span class="text-xs font-medium text-slate-500 truncate">${bono.clave}</span>
                        ${badge}
                    </div>
                    <p class="text-sm font-bold text-slate-900 truncate mb-1 title-text">${bono.nombre}</p>
                    
                    <div class="flex justify-between items-baseline mt-2">
                        <span class="text-xs text-slate-500 small-text">Usos restantes: ${usosRestantes}</span>
                        <div class="flex items-center space-x-2">
                            <span class="text-xl font-extrabold color-dorado-main price-text">${recompensa} ℙ</span>
                            <button 
                                    data-bono-clave="${bono.clave}"
                                    onclick="AppTransacciones.iniciarCanje('${claveEscapada}')" 
                                    ${isCanjeado ? 'disabled' : ''}
                                    class="bono-buy-btn px-3 py-1 text-xs font-medium rounded-lg bg-white border border-amber-600 text-amber-600 hover:bg-amber-50 shadow-sm transition-colors buy-btn">Canjear</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    populateBonoAdminList: function() {
        const tbody = document.getElementById('bonos-admin-lista');
        const bonos = AppState.bonos.disponibles || []; 

        if (bonos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No hay bonos configurados.</td></tr>`;
            return;
        }

        let html = '';
        const bonosOrdenados = [...bonos].sort((a, b) => a.clave.localeCompare(b.clave));

        bonosOrdenados.forEach(bono => {
            const recompensa = AppFormat.formatNumber(bono.recompensa);
            const usos = `${bono.usos_actuales} / ${bono.usos_totales}`;
            const isAgotado = bono.usos_actuales >= bono.usos_totales;
            const rowClass = isAgotado ? 'opacity-60 bg-slate-50' : 'hover:bg-slate-100';
            
            const claveEscapada = escapeHTML(bono.clave);

            html += `
                <tr class="${rowClass}">
                    <td class="px-4 py-2 text-sm font-semibold text-slate-800">${bono.clave}</td>
                    <td class="px-4 py-2 text-sm text-slate-700">${bono.nombre}</td>
                    <td class="px-4 py-2 text-sm text-slate-800 text-right">${recompensa} ℙ</td>
                    <td class="px-4 py-2 text-sm text-slate-700 text-right">${usos}</td>
                    <td class="px-4 py-2 text-right text-sm">
                        <button onclick="AppUI.handleEditBono('${claveEscapada}')" class="font-medium text-amber-600 hover:text-amber-800 edit-bono-btn">Editar</button>
                        <button onclick="AppTransacciones.eliminarBono('${claveEscapada}')" class="ml-2 font-medium text-slate-600 hover:text-slate-800 delete-bono-btn">Eliminar</button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    },
    
    handleEditBono: function(clave) {
        const bono = AppState.bonos.disponibles.find(b => b.clave === clave);
        if (!bono) return;
        
        document.getElementById('bono-admin-clave-input').value = bono.clave;
        document.getElementById('bono-admin-nombre-input').value = bono.nombre;
        document.getElementById('bono-admin-recompensa-input').value = bono.recompensa;
        document.getElementById('bono-admin-usos-input').value = bono.usos_totales;
        
        const expiracionInput = document.getElementById('bono-admin-expiracion-input');
        if (bono.expiracion_fecha) {
            const expiryTime = new Date(bono.expiracion_fecha).getTime();
            const now = Date.now();
            const hoursRemaining = Math.ceil((expiryTime - now) / (1000 * 60 * 60));
            expiracionInput.value = hoursRemaining > 1 ? hoursRemaining : 24; 
        } else {
            expiracionInput.value = '';
        }
        
        AppUI.selectAdminGroupCheckboxes('bono-admin-grupos-checkboxes-container', bono.grupos_permitidos);
        
        document.getElementById('bono-admin-clave-input').disabled = true;
        document.getElementById('bono-admin-clave-input').classList.add('disabled:bg-slate-100', 'disabled:opacity-70');
        document.getElementById('bono-admin-submit-btn').textContent = 'Guardar Cambios';

        document.getElementById('bono-admin-form-container').scrollIntoView({ behavior: 'smooth' });
    },
    
    clearBonoAdminForm: function() {
        document.getElementById('bono-admin-form').reset();
        document.getElementById('bono-admin-clave-input').disabled = false;
        document.getElementById('bono-admin-submit-btn').textContent = 'Crear / Actualizar Bono';
        document.getElementById('bono-admin-status-msg').textContent = "";
        
        document.getElementById('bono-admin-clave-input').classList.remove('disabled:bg-slate-100', 'disabled:opacity-70');
        AppUI.selectAdminGroupCheckboxes('bono-admin-grupos-checkboxes-container', '');
    },
    
    showTiendaModal: function() {
        AppUI.showModal('tienda-modal'); 
        AppUI.showTiendaStep1();
        AppUI.renderTiendaItems(); 

        document.getElementById('tienda-report-container').classList.add('hidden');
        document.getElementById('tienda-main-step-container').classList.remove('hidden');

        AppUI.updateTiendaAdminStatusLabel();
    },

    showTiendaStep1: function() {
        document.getElementById('tienda-step-form-container').classList.add('hidden');
        document.getElementById('tienda-step-list-container').classList.remove('hidden');
        AppState.tienda.selectedItem = null;
        document.getElementById('tienda-status-msg').textContent = "";
        document.getElementById('tienda-step2-status-msg').textContent = "";
        document.getElementById('tienda-clave-p2p-step2').value = "";
        
        document.getElementById('tienda-clave-p2p-step2').classList.remove('shake');
        
        document.getElementById('tienda-search-alumno-step2').value = AppState.currentSearch.tiendaAlumno.info?.nombre || '';
        AppTransacciones.setLoadingState(document.getElementById('tienda-submit-step2-btn'), document.getElementById('tienda-btn-text-step2'), false, 'Confirmar Compra');
        
        AppUI.updateTiendaButtonStates();
    },

    showTiendaStep2: function(itemId) {
        const item = AppState.tienda.items[itemId];
        if (!item) return;

        AppState.tienda.selectedItem = itemId;
        document.getElementById('tienda-step-list-container').classList.add('hidden');
        document.getElementById('tienda-step-form-container').classList.remove('hidden');

        const costoFinal = Math.round(item.PrecioBase * (1 + AppConfig.TASA_ITBIS));
        const costoItbis = costoFinal - item.PrecioBase;

        document.getElementById('tienda-item-name-display').textContent = item.Nombre;
        document.getElementById('tienda-item-price-display').textContent = `Precio Base: ${AppFormat.formatNumber(item.PrecioBase)} ℙ`;
        document.getElementById('tienda-item-cost-display').innerHTML = `
            Costo Final (incl. ${AppConfig.TASA_ITBIS * 100}% ITBIS): 
            <span class="font-bold text-slate-800">${AppFormat.formatNumber(costoFinal)} ℙ</span>
            <span class="text-xs text-slate-500 block">(ITBIS: ${AppFormat.formatNumber(costoItbis)} ℙ)</span>
        `;
        document.getElementById('tienda-step2-status-msg').textContent = "";
        
        document.getElementById('tienda-search-alumno-step2').value = AppState.currentSearch.tiendaAlumno.info?.nombre || '';

        document.getElementById('tienda-clave-p2p-step2').focus();
    },

    renderTiendaItems: function() {
        if (!AppState.datosActuales || !AppState.tienda.items || Object.keys(AppState.tienda.items).length === 0) {
             const container = document.getElementById('tienda-items-container');
             if(container) container.innerHTML = `<p class="text-sm text-slate-500 text-center col-span-4">No hay artículos cargados en el inventario.</p>`;
             return;
        }

        if (document.getElementById('tienda-modal').classList.contains('opacity-0')) return;

        const container = document.getElementById('tienda-items-container');
        const items = AppState.tienda.items;
        
        const student = AppState.currentSearch.tiendaAlumno.info || { grupoNombre: AppState.selectedGrupo };
        const studentGroup = student.grupoNombre;
        const now = Date.now();

        const itemKeys = Object.keys(items);
        
        const itemsActivos = itemKeys.filter(itemId => {
            const item = items[itemId];
            if (item.Stock <= 0 && item.ItemID !== 'filantropo') return false;
            if (item.ExpiracionFecha && new Date(item.ExpiracionFecha).getTime() < now) return false;

            const allowedGroups = (item.GruposPermitidos || '').split(',').map(g => g.trim()).filter(g => g.length > 0);
            const hasRestrictions = allowedGroups.length > 0;
            
            if (hasRestrictions && studentGroup) {
                if (!allowedGroups.includes(studentGroup)) {
                    return false;
                }
            }
            return true;
        });


        if (itemsActivos.length === 0) {
            container.innerHTML = `<p class="text-sm text-slate-500 text-center col-span-4">No hay artículos disponibles para ti en este momento.</p>`;
            return;
        }

        let html = '';
        itemsActivos.sort((a,b) => items[a].PrecioBase - items[b].PrecioBase).forEach(itemId => {
            const item = items[itemId];
            const costoFinal = Math.round(item.PrecioBase * (1 + AppConfig.TASA_ITBIS));
            
            const itemIdEscapado = escapeHTML(item.ItemID);

            const cardClass = 'bg-white shadow-md border-amber-200 hover:shadow-lg transition-all';
            const stockText = item.Stock === 9999 ? 'Ilimitado' : `Stock: ${item.Stock}`;

            html += `
                <div class="rounded-xl shadow-sm p-3 border compact-card ${cardClass}">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-xs font-medium text-slate-500 truncate small-text">${item.Tipo} | ${stockText}</span>
                        <span class="text-xs font-bold bg-green-100 text-green-700 rounded-full px-2 py-0.5">ACTIVO</span>
                    </div>
                    <p class="text-sm font-bold text-slate-900 truncate title-text mb-1">
                        <span class="tooltip-container">
                            ${item.Nombre}
                            <div class="tooltip-text hidden md:block w-48">${item.Descripcion}</div>
                        </span>
                    </p>
                    
                    <div class="flex justify-between items-baseline mt-2">
                        <span class="text-xs text-slate-500 small-text">Base: ${AppFormat.formatNumber(item.PrecioBase)} ℙ (+ITBIS)</span>
                        
                        <div class="flex items-center space-x-2">
                            <span class="text-xl font-extrabold color-dorado-main price-text">${AppFormat.formatNumber(costoFinal)} ℙ</span>
                            
                            <button id="buy-btn-${itemId}" 
                                    data-item-id="${itemId}"
                                    onclick="AppTransacciones.iniciarCompra('${itemIdEscapado}')"
                                    class="tienda-buy-btn px-3 py-1 text-xs font-medium rounded-lg bg-white border border-amber-600 text-amber-600 hover:bg-amber-50 transition-colors shadow-sm buy-btn">
                                <span class="btn-text">Comprar</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        AppUI.updateTiendaButtonStates();
    },

    updateTiendaButtonStates: function() {
         const student = AppState.currentSearch.tiendaAlumno.info;
         const buttons = document.querySelectorAll('.tienda-buy-btn');

         buttons.forEach(btn => {
             const itemId = btn.dataset.itemId;
             const item = AppState.tienda.items[itemId];
             if (!item) return;
             
             if (!AppState.tienda.isStoreOpen) {
                 btn.disabled = true;
                 btn.classList.add('bg-slate-100', 'text-slate-500', 'border-slate-300', 'cursor-not-allowed');
                 btn.classList.remove('bg-white', 'text-amber-600', 'border-amber-600', 'hover:bg-amber-50');
                 return;
             }

             if (student) {
                  const costoFinal = Math.round(item.PrecioBase * (1 + AppConfig.TASA_ITBIS));
                  if (student.pinceles < costoFinal) {
                       btn.disabled = true;
                       btn.classList.add('opacity-50', 'cursor-not-allowed');
                       btn.title = "Saldo insuficiente";
                  } else {
                       btn.disabled = false;
                       btn.classList.remove('opacity-50', 'cursor-not-allowed');
                       btn.title = "";
                  }
             } else {
                  btn.disabled = false;
                  btn.classList.remove('opacity-50', 'cursor-not-allowed');
             }
         });
    },

    updateTiendaAdminStatusLabel: function() {
        const label = document.getElementById('tienda-admin-status-label');
        const container = label ? label.closest('div') : null;
        if (!label || !container) return;
        
        const status = AppState.tienda.storeManualStatus;
        
        label.classList.remove('text-amber-600', 'text-green-600', 'text-red-600', 'text-slate-600', 'text-slate-800');
        container.classList.remove('bg-amber-100', 'bg-slate-200');
        
        container.classList.add('bg-slate-50');

        if (status === 'auto') {
            label.textContent = "Automático (por Temporizador)";
            label.classList.add('text-amber-600');
        } else if (status === 'open') {
            label.textContent = "Forzado Abierto";
            label.classList.add('text-slate-800');
            container.classList.add('bg-amber-100');
        } else if (status === 'closed') {
            label.textContent = "Forzado Cerrado";
            label.classList.add('text-slate-800');
            container.classList.add('bg-slate-200');
        } else {
            label.textContent = "Desconocido";
            label.classList.add('text-slate-600');
        }
    },
    
    populateTiendaAdminDate: function() {
        const dateInput = document.getElementById('tienda-admin-date-input');
        if (!dateInput) return;
        
        if (AppState.tienda.nextOpeningDate) {
            const d = new Date(AppState.tienda.nextOpeningDate);
            if (!isNaN(d.getTime())) {
                const pad = (n) => n.toString().padStart(2, '0');
                const localISO = d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
                dateInput.value = localISO;
            } else {
                dateInput.value = '';
            }
        } else {
            dateInput.value = '';
        }
    },

    handleDeleteConfirmation: function(itemId) {
        const row = document.getElementById(`tienda-item-row-${itemId}`);
        if (!row) return;

        const actionCell = row.cells[4];
        
        const itemIdEscapado = escapeHTML(itemId);

        actionCell.innerHTML = `
            <button onclick="AppTransacciones.eliminarItem('${itemIdEscapado}')" class="font-medium text-amber-600 hover:text-amber-800 confirm-delete-btn">Confirmar</button>
            <button onclick="AppUI.cancelDeleteConfirmation('${itemIdEscapado}')" class="ml-2 font-medium text-slate-600 hover:text-slate-800">Cancelar</button>
        `;
    },

    cancelDeleteConfirmation: function(itemId) {
        const item = AppState.tienda.items[itemId];
        if (!item) return;

        const row = document.getElementById(`tienda-item-row-${itemId}`);
        if (!row) return;

        const actionCell = row.cells[4];
        
        const itemIdEscapado = escapeHTML(item.ItemID); 

        actionCell.innerHTML = `
            <button onclick="AppUI.handleEditItem('${itemIdEscapado}')" class="font-medium text-amber-600 hover:text-amber-800 edit-item-btn">Editar</button>
            <button onclick="AppUI.handleDeleteConfirmation('${itemIdEscapado}')" class="ml-2 font-medium text-slate-600 hover:text-slate-800 delete-item-btn">Eliminar</button>
        `;
    },

    populateTiendaAdminList: function() {
        const tbody = document.getElementById('tienda-admin-lista');
        const items = AppState.tienda.items || {};
        const itemKeys = Object.keys(items);

        if (itemKeys.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No hay artículos configurados.</td></tr>`;
            return;
        }

        let html = '';
        const itemsOrdenados = itemKeys.sort((a,b) => a.localeCompare(b));

        itemsOrdenados.forEach(itemId => {
            const item = items[itemId];
            const precio = AppFormat.formatNumber(item.PrecioBase);
            const stock = item.Stock;
            const rowClass = (stock <= 0 && item.ItemID !== 'filantropo') ? 'opacity-60 bg-slate-50' : 'hover:bg-slate-100';
            
            const itemIdEscapado = escapeHTML(item.ItemID);

            html += `
                <tr id="tienda-item-row-${itemIdEscapado}" class="${rowClass}">
                    <td class="px-4 py-2 text-sm font-semibold text-slate-800">${item.ItemID}</td>
                    <td class="px-4 py-2 text-sm text-slate-700 truncate" title="${item.Nombre}">${item.Nombre}</td>
                    <td class="px-4 py-2 text-sm text-slate-800 text-right">${precio} ℙ</td>
                    <td class="px-4 py-2 text-sm text-slate-700 text-right">${stock}</td>
                    <td class="px-4 py-2 text-right text-sm">
                        <button onclick="AppUI.handleEditItem('${itemIdEscapado}')" class="font-medium text-amber-600 hover:text-amber-800 edit-item-btn">Editar</button>
                        <button onclick="AppUI.handleDeleteConfirmation('${itemIdEscapado}')" class="ml-2 font-medium text-slate-600 hover:text-slate-800 delete-item-btn">Eliminar</button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    },
    
    handleEditItem: function(itemId) {
        const item = AppState.tienda.items[itemId];
        if (!item) return;

        document.getElementById('tienda-admin-itemid-input').value = item.ItemID;
        document.getElementById('tienda-admin-nombre-input').value = item.Nombre;
        document.getElementById('tienda-admin-desc-input').value = item.Descripcion;
        document.getElementById('tienda-admin-tipo-input').value = item.Tipo;
        document.getElementById('tienda-admin-precio-input').value = item.PrecioBase;
        document.getElementById('tienda-admin-stock-input').value = item.Stock;
        
        const expiracionInput = document.getElementById('tienda-admin-expiracion-input');
        if (item.ExpiracionFecha) {
            const expiryTime = new Date(item.ExpiracionFecha).getTime();
            const now = Date.now();
            const hoursRemaining = Math.ceil((expiryTime - now) / (1000 * 60 * 60));
            expiracionInput.value = hoursRemaining > 1 ? hoursRemaining : 48; 
        } else {
            expiracionInput.value = '';
        }
        
        AppUI.selectAdminGroupCheckboxes('tienda-admin-grupos-checkboxes-container', item.GruposPermitidos);

        document.getElementById('tienda-admin-itemid-input').disabled = true;
        document.getElementById('tienda-admin-submit-btn').textContent = 'Guardar Cambios';
        
        document.getElementById('tienda-admin-itemid-input').classList.add('disabled:bg-slate-100', 'disabled:opacity-70');

        document.getElementById('tienda-admin-form-container').scrollIntoView({ behavior: 'smooth' });
    },
    
    clearTiendaAdminForm: function() {
        document.getElementById('tienda-admin-form').reset();
        document.getElementById('tienda-admin-itemid-input').disabled = false;
        document.getElementById('tienda-admin-submit-btn').textContent = 'Crear / Actualizar';
        document.getElementById('tienda-admin-status-msg').textContent = "";
        
        document.getElementById('tienda-admin-itemid-input').classList.remove('disabled:bg-slate-100', 'disabled:opacity-70');
        AppUI.selectAdminGroupCheckboxes('tienda-admin-grupos-checkboxes-container', '');
    },
    
    populateCausasAdminList: function() {
        const tbody = document.getElementById('causas-admin-lista');
        const causas = AppState.causas.items ? Object.values(AppState.causas.items) : []; 

        if (causas.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-500">No hay causas configuradas.</td></tr>`;
            return;
        }

        let html = '';
        const causasOrdenados = [...causas].sort((a, b) => b.meta_total - a.meta_total);

        causasOrdenados.forEach(causa => {
            const recaudado = AppFormat.formatNumber(causa.monto_recaudado);
            const meta = AppFormat.formatNumber(causa.meta_total);
            const estado = causa.estado;

            let badgeClass = 'text-slate-600 bg-slate-100';
            if (estado === 'Activa') badgeClass = 'text-amber-600 bg-amber-50';
            if (estado === 'Completada') badgeClass = 'text-green-600 bg-green-50';
            if (estado === 'Cancelada') badgeClass = 'text-red-600 bg-red-50';

            const rowClass = (estado !== 'Activa') ? 'opacity-70 bg-slate-50' : 'hover:bg-slate-100';
            
            const idEscapado = escapeHTML(causa.id_causa);

            html += `
                <tr class="${rowClass}">
                    <td class="px-4 py-2 text-sm font-semibold text-slate-800">${causa.id_causa}</td>
                    <td class="px-4 py-2 text-sm text-slate-700">${causa.titulo}</td>
                    <td class="px-4 py-2 text-sm text-slate-800 text-right">${meta} ℙ</td>
                    <td class="px-4 py-2 text-sm text-slate-700 text-right">${recaudado} ℙ</td>
                    <td class="px-4 py-2 text-right text-sm">
                        <span class="inline-block px-2 py-1 text-xs rounded-full ${badgeClass}">${estado}</span>
                    </td>
                    <td class="px-4 py-2 text-right text-sm">
                        <button onclick="AppUI.handleEditCausa('${idEscapado}')" class="font-medium text-amber-600 hover:text-amber-800 edit-causa-btn">Editar</button>
                        <button onclick="AppTransacciones.eliminarCausa('${idEscapado}')" class="ml-2 font-medium text-slate-600 hover:text-slate-800 delete-causa-btn">Eliminar</button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    },

    handleEditCausa: function(idCausa) {
        const causa = AppState.causas.items[idCausa];
        if (!causa) return;

        document.getElementById('causa-admin-id-input').value = causa.id_causa;
        document.getElementById('causa-admin-titulo-input').value = causa.titulo;
        document.getElementById('causa-admin-meta-input').value = causa.meta_total;
        document.getElementById('causa-admin-estado-input').value = causa.estado;
        
        const beneficiaryInput = document.getElementById('causa-admin-beneficiario-search');
        
        beneficiaryInput.value = causa.beneficiario;
        
        AppState.currentSearch.causaAdminBeneficiario.query = causa.beneficiario;
        AppState.currentSearch.causaAdminBeneficiario.selected = causa.beneficiario;
        AppState.currentSearch.causaAdminBeneficiario.info = { 
            nombre: causa.beneficiario, 
            grupoNombre: causa.beneficiario.startsWith('GRUPO:') ? causa.beneficiario.substring(7).trim() : 'N/A' 
        };
        

        document.getElementById('causa-admin-id-input').disabled = true;
        document.getElementById('causa-admin-id-input').classList.add('disabled:bg-slate-100', 'disabled:opacity-70');
        document.getElementById('causa-admin-submit-btn').textContent = 'Guardar Cambios';

        document.getElementById('causas-admin-form-container').scrollIntoView({ behavior: 'smooth' });
    },
    
    clearCausaAdminForm: function() {
        document.getElementById('causa-admin-form').reset();
        document.getElementById('causa-admin-id-input').disabled = false;
        document.getElementById('causa-admin-submit-btn').textContent = 'Crear / Actualizar Causa';
        document.getElementById('causa-admin-status-msg').textContent = "";
        
        document.getElementById('causa-admin-id-input').classList.remove('disabled:bg-slate-100', 'disabled:opacity-70');
        
        AppUI.resetSearchInput('causaAdminBeneficiario'); 
        const input = document.getElementById('causa-admin-beneficiario-search');
        if(input) input.value = 'Banco';
    },
    
    showDonacionesModal: function() {
        AppUI.showDonacionesStep1();
        AppUI.showModal('donaciones-modal');
        AppUI.renderCausasList(); 
    },

    showDonacionesStep1: function() {
        document.getElementById('donaciones-step-form-container').classList.add('hidden');
        document.getElementById('donaciones-step-list-container').classList.remove('hidden');
        AppState.causas.selectedCausa = null;
        document.getElementById('donaciones-status-msg').textContent = "";
        document.getElementById('causa-step2-status-msg').textContent = "";
        document.getElementById('causa-clave-p2p-step2').value = "";
        document.getElementById('causa-monto-aporte').value = "";
        
        document.getElementById('causa-clave-p2p-step2').classList.remove('shake');
        
        AppUI.resetSearchInput('causaDonante');
        AppTransacciones.setLoadingState(document.getElementById('donaciones-submit-step2-btn'), document.getElementById('donaciones-btn-text-step2'), false, 'Confirmar Aporte');
    },

    showDonacionesStep2: function(idCausa) {
        const causa = AppState.causas.items[idCausa];
        if (!causa) return;
        if (causa.estado !== 'Activa') {
             AppTransacciones.setError(document.getElementById('donaciones-status-msg'), `La causa "${causa.titulo}" ya está ${causa.estado.toLowerCase()} y no acepta más donaciones.`);
             return;
        }

        AppState.causas.selectedCausa = idCausa;
        document.getElementById('donaciones-step-list-container').classList.add('hidden');
        document.getElementById('donaciones-step-form-container').classList.remove('hidden');
        
        const faltante = Math.max(0, causa.meta_total - causa.monto_recaudado);

        document.getElementById('causa-form-title').textContent = `Aportar a: ${causa.titulo}`;
        document.getElementById('causa-meta-display').textContent = `${AppFormat.formatNumber(causa.meta_total)} ℙ`;
        document.getElementById('causa-recaudado-display').textContent = `${AppFormat.formatNumber(causa.monto_recaudado)} ℙ`;
        document.getElementById('causa-faltante-display').textContent = `${AppFormat.formatNumber(faltante)} ℙ`;
        document.getElementById('causa-id-input-step2').value = idCausa;
        
        document.getElementById('causa-monto-aporte').focus();
        document.getElementById('causa-step2-status-msg').textContent = "";
        
        document.getElementById('causa-search-alumno-step2').value = AppState.currentSearch.causaDonante.info?.nombre || '';
    },
    
    renderCausasList: function() {
        if (!AppState.datosActuales || !AppState.causas.items || Object.keys(AppState.causas.items).length === 0) {
             const container = document.getElementById('causas-lista-disponible');
             if(container) container.innerHTML = `<p class="text-sm text-slate-500 text-center col-span-4">No hay causas activas en este momento.</p>`;
             return;
        }

        if (document.getElementById('donaciones-modal').classList.contains('opacity-0')) return;

        const container = document.getElementById('causas-lista-disponible');
        const causas = Object.values(AppState.causas.items);
        
        const causasActivas = causas.filter(c => c.estado === 'Activa' || c.estado === 'Completada'); 

        if (causasActivas.length === 0) {
            container.innerHTML = `<p class="text-sm text-slate-500 text-center col-span-4">No hay causas activas en este momento.</p>`;
            return;
        }

        let html = '';
        causasActivas.sort((a,b) => b.meta_total - a.meta_total).forEach(causa => {
            const recaudado = causa.monto_recaudado;
            const meta = causa.meta_total;
            const porcentaje = Math.min(100, (recaudado / meta) * 100).toFixed(0);
            const faltante = Math.max(0, meta - recaudado);
            const isDisabled = causa.estado !== 'Activa';
            
            const idEscapado = escapeHTML(causa.id_causa);
            const beneficiario = causa.beneficiario.startsWith('GRUPO: ') ? causa.beneficiario.substring(7).trim() : causa.beneficiario;

            const cardClass = isDisabled ? 'opacity-70 bg-slate-50 shadow-inner' : 'bg-white shadow-lg hover:shadow-xl';
            const btnClass = isDisabled ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-white border border-amber-600 text-amber-600 hover:bg-amber-50';
            const btnText = causa.estado === 'Completada' ? 'Meta Alcanzada' : (causa.estado === 'Cancelada' ? 'Cancelada' : 'Aportar Ahora');


            html += `
                <div class="rounded-xl shadow-sm p-3 border border-amber-200 ${cardClass} compact-card">
                    <div class="flex justify-between items-start mb-2">
                        <h4 class="text-sm font-bold text-slate-800 truncate" title="${causa.titulo}">${causa.titulo}</h4>
                        <span class="text-xs font-semibold px-1 py-0.5 rounded-full bg-slate-100 text-slate-600">
                           A ${beneficiario}
                        </span>
                    </div>
                    
                    <div class="space-y-1 mb-2 mt-4">
                        <div class="w-full bg-slate-200 rounded-full h-1.5">
                            <div class="bg-amber-600 h-1.5 rounded-full progress-bar-fill" style="width: ${porcentaje}%"></div>
                        </div>
                        <div class="flex justify-between text-[10px] font-medium">
                            <span class="color-dorado-main">${AppFormat.formatNumber(recaudado)} ℙ</span>
                            <span class="text-slate-500">${AppFormat.formatNumber(meta)} ℙ</span>
                        </div>
                        <div class="text-right text-[10px] font-medium text-slate-500">
                           ${porcentaje}% completado (${AppFormat.formatNumber(faltante)} ℙ faltantes)
                        </div>
                    </div>

                    <div class="flex justify-end">
                        <button 
                            onclick="AppUI.showDonacionesStep2('${idEscapado}')" 
                            ${isDisabled ? 'disabled' : ''}
                            class="px-3 py-1 text-xs font-medium rounded-lg shadow-sm transition-colors ${btnClass}">
                            ${btnText}
                        </button>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    },

    showTransaccionModal: function(tab) {
        if (!AppState.datosActuales) {
            return;
        }
        
        AppUI.changeAdminTab(tab); 
        
        AppUI.showModal('transaccion-modal');
    },

    populateGruposTransaccion: function() {
        const grupoContainer = document.getElementById('transaccion-lista-grupos-container');
        
        const currentSelectedGroups = Array.from(grupoContainer.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.value);
        AppState.transaccionSelectedGroups = new Set(currentSelectedGroups);
        
        grupoContainer.innerHTML = ''; 

        const gruposActivos = AppState.datosActuales.filter(g => g.nombre !== 'Banco');

        gruposActivos.forEach(grupo => {
            if (grupo.usuarios.length === 0) return;

            const div = document.createElement('div');
            div.className = "flex items-center p-1 rounded hover:bg-slate-200";
            
            const input = document.createElement('input');
            input.type = "checkbox";
            input.id = `group-cb-${grupo.nombre}`;
            input.value = grupo.nombre;
            input.className = "h-4 w-4 text-amber-600 border-slate-300 rounded focus:ring-amber-600 bg-white group-checkbox";
            input.addEventListener('change', AppUI.populateUsuariosTransaccion);
            
            if (AppState.transaccionSelectedGroups.has(grupo.nombre)) {
                input.checked = true;
            }

            const label = document.createElement('label');
            label.htmlFor = input.id;
            label.textContent = `${grupo.nombre} (${AppFormat.formatNumber(grupo.total)} ℙ)`;
            label.className = "ml-2 block text-sm text-slate-900 cursor-pointer flex-1";

            div.appendChild(input);
            div.appendChild(label);
            grupoContainer.appendChild(div);
        });

        AppUI.populateUsuariosTransaccion();
        
        document.getElementById('tesoreria-saldo-transaccion').textContent = `(Fondos disponibles: ${AppFormat.formatNumber(AppState.datosAdicionales.saldoTesoreria)} ℙ)`;
    },

    populateUsuariosTransaccion: function() {
        const checkedGroups = document.querySelectorAll('#transaccion-lista-grupos-container input[type="checkbox"]:checked');
        const selectedGroupNames = Array.from(checkedGroups).map(cb => cb.value);
        
        const listaContainer = document.getElementById('transaccion-lista-usuarios-container');
        
        const currentSelectedUsers = Array.from(listaContainer.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.value);
        AppState.transaccionSelectedUsers = new Set(currentSelectedUsers);

        listaContainer.innerHTML = ''; 

        if (selectedGroupNames.length === 0) {
            listaContainer.innerHTML = '<span class="text-sm text-slate-500 p-2">Seleccione un grupo...</span>';
            AppState.transaccionSelectedUsers.clear();
            AppState.transaccionSelectAll = {};
            return;
        }
        
        const allGroups = AppState.datosActuales;

        selectedGroupNames.forEach(grupoNombre => {
            const grupo = allGroups.find(g => g.nombre === grupoNombre);

            if (grupo && grupo.usuarios && grupo.usuarios.length > 0) {
                const headerDiv = document.createElement('div');
                headerDiv.className = "flex justify-between items-center bg-slate-200 p-2 mt-2 sticky top-0 border-b border-slate-300"; 
                headerDiv.innerHTML = `<span class="text-sm font-semibold text-slate-700">${grupo.nombre}</span>`;
                
                const btnSelectAll = document.createElement('button');
                btnSelectAll.textContent = AppState.transaccionSelectAll[grupo.nombre] ? "Ninguno" : "Todos";
                btnSelectAll.dataset.grupo = grupo.nombre; 
                btnSelectAll.className = "text-xs font-medium text-amber-600 hover:text-amber-800 select-all-users-btn";
                
                btnSelectAll.addEventListener('click', AppUI.toggleSelectAllUsuarios);
                
                headerDiv.appendChild(btnSelectAll);
                listaContainer.appendChild(headerDiv);

                const usuariosOrdenados = [...grupo.usuarios].sort((a, b) => a.nombre.localeCompare(b.nombre));

                usuariosOrdenados.forEach(usuario => {
                    const div = document.createElement('div');
                    div.className = "flex items-center p-1 rounded hover:bg-slate-200 ml-2"; 
                    
                    const input = document.createElement('input');
                    input.type = "checkbox";
                    input.id = `user-cb-${grupo.nombre}-${usuario.nombre.replace(/\s/g, '-')}`; 
                    input.value = usuario.nombre;
                    input.dataset.grupo = grupo.nombre; 
                    input.className = "h-4 w-4 text-amber-600 border-slate-300 rounded focus:ring-amber-600 bg-white user-checkbox";
                    input.dataset.checkboxGrupo = grupo.nombre; 
                    
                    if (AppState.transaccionSelectedUsers.has(usuario.nombre)) {
                        input.checked = true;
                    }

                    input.addEventListener('change', (e) => {
                         if (e.target.checked) {
                             AppState.transaccionSelectedUsers.add(usuario.nombre);
                         } else {
                             AppState.transaccionSelectedUsers.delete(usuario.nombre);
                             AppState.transaccionSelectAll[grupo.nombre] = false;
                             const selectAllBtn = listaContainer.querySelector(`.select-all-users-btn[data-grupo="${grupo.nombre}"]`);
                             if (selectAllBtn) selectAllBtn.textContent = "Todos";
                         }
                    });

                    const label = document.createElement('label');
                    label.htmlFor = input.id;
                    label.textContent = usuario.nombre;
                    label.className = "ml-2 block text-sm text-slate-900 cursor-pointer flex-1";

                    div.appendChild(input);
                    div.appendChild(label);
                    listaContainer.appendChild(div);
                });
            }
        });
        
        if (listaContainer.innerHTML === '') {
             listaContainer.innerHTML = '<span class="text-sm text-slate-500 p-2">Los grupos seleccionados no tienen usuarios.</span>';
        }
    },
    
    toggleSelectAllUsuarios: function(event) {
        event.preventDefault();
        const btn = event.target;
        const grupoNombre = btn.dataset.grupo;
        if (!grupoNombre) return;

        AppState.transaccionSelectAll[grupoNombre] = !AppState.transaccionSelectAll[grupoNombre];
        const isChecked = AppState.transaccionSelectAll[grupoNombre];

        const checkboxes = document.querySelectorAll(`#transaccion-lista-usuarios-container input[data-checkbox-grupo="${grupoNombre}"]`);
        
        const grupoData = AppState.datosActuales.find(g => g.nombre === grupoNombre);

        checkboxes.forEach(cb => {
            cb.checked = isChecked;
        });

        if (grupoData && grupoData.usuarios) {
            grupoData.usuarios.forEach(usuario => {
                if (isChecked) {
                    AppState.transaccionSelectedUsers.add(usuario.nombre);
                } else {
                    AppState.transaccionSelectedUsers.delete(usuario.nombre);
                }
            });
        }
        
        btn.textContent = isChecked ? "Ninguno" : "Todos";
    },

    setConnectionStatus: function(status, title) {
        const dot = document.getElementById('status-dot');
        const indicator = document.getElementById('status-indicator');
        if (!dot) return;
        
        if (indicator.title === title) return;

        indicator.title = title;

        dot.classList.remove('bg-amber-600', 'animate-pulse', 'bg-slate-300', 'bg-slate-500', 'bg-amber-500');
        dot.className = 'w-3 h-3 rounded-full'; 

        if (status === 'ok') {
            dot.classList.add('bg-amber-600'); 
        } else if (status === 'loading') {
            dot.classList.add('bg-amber-500', 'animate-pulse');
        } else if (status === 'error') {
            dot.classList.add('bg-slate-500'); 
        } else {
            dot.classList.add('bg-slate-300');
        }
    },

    hideSidebar: function() {
        if (AppState.isSidebarOpen) {
            AppUI.toggleSidebar();
        }
    },

    toggleSidebar: function() {
        const sidebar = document.getElementById('sidebar');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        
        AppState.isSidebarOpen = !AppState.isSidebarOpen; 

        if (AppState.isSidebarOpen) {
            sidebar.classList.remove('-translate-x-full');
            if (window.innerWidth < 1024) { 
                 sidebarOverlay.classList.remove('hidden', 'opacity-0');
                 sidebarOverlay.classList.add('opacity-100');
            }
        } else {
            sidebar.classList.add('-translate-x-full');
            
            sidebarOverlay.classList.remove('opacity-100');
            sidebarOverlay.classList.add('opacity-0');
            setTimeout(() => {
                 sidebarOverlay.classList.add('hidden');
            }, 300); 
        }
        
        AppUI.resetSidebarTimer();
    },


    resetSidebarTimer: function() {
        if (AppState.sidebarTimer) {
            clearTimeout(AppState.sidebarTimer);
        }
        
        if (AppState.isSidebarOpen && window.innerWidth >= 1024) {
            AppState.sidebarTimer = setTimeout(() => {
                if (AppState.isSidebarOpen) {
                    AppUI.toggleSidebar();
                }
            }, 10000);
        }
    },

    actualizarSidebar: function(grupos) {
        const navContainer = document.getElementById('sidebar-nav');
        if (!navContainer) return;

        const gruposFiltrados = grupos.filter(g => g.nombre !== 'Cicla' && g.nombre !== 'Banco');
        const ciclaGroup = grupos.find(g => g.nombre === 'Cicla');

        let html = '';

        html += `
            <a href="#" id="home-nav-btn" data-grupo-nombre="" class="flex items-center p-3 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 sidebar-nav-item transition-colors mb-2">
                Inicio
            </a>
            <div class="text-xs font-semibold text-slate-500 uppercase px-3 py-2 border-t border-slate-200">Grupos Activos</div>
        `;
        
        gruposFiltrados.forEach(grupo => {
            const totalF = AppFormat.formatNumber(grupo.total);
            const isActive = AppState.selectedGrupo === grupo.nombre;
            const classActive = isActive ? 'bg-amber-50 text-amber-600 font-bold' : 'text-slate-700 hover:bg-slate-100';

            html += `
                <a href="#" data-grupo-nombre="${grupo.nombre}" class="flex items-center justify-between p-3 rounded-lg text-sm sidebar-nav-item ${classActive} transition-colors">
                    <span class="truncate">${grupo.nombre}</span>
                    <span class="text-xs font-semibold">${totalF} ℙ</span>
                </a>
            `;
        });
        
        if (ciclaGroup) {
             const totalF = AppFormat.formatNumber(ciclaGroup.total);
             const isActive = AppState.selectedGrupo === ciclaGroup.nombre;
             const classActive = isActive ? 'bg-amber-50 text-amber-600 font-bold' : 'text-slate-700 hover:bg-slate-100';
             
             html += `
                <div class="text-xs font-semibold text-slate-500 uppercase px-3 py-2 border-t border-slate-200 mt-4">Otros Grupos</div>
                <a href="#" data-grupo-nombre="${ciclaGroup.nombre}" class="flex items-center justify-between p-3 rounded-lg text-sm sidebar-nav-item ${classActive} transition-colors">
                    <span class="truncate">${ciclaGroup.nombre}</span>
                    <span class="text-xs font-semibold">${totalF} ℙ</span>
                </a>
            `;
        }

        navContainer.innerHTML = html;
        
        document.querySelectorAll('.sidebar-nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const grupoNombre = e.currentTarget.dataset.grupoNombre;
                
                AppState.selectedGrupo = grupoNombre; 
                
                if (grupoNombre === '') {
                    AppUI.mostrarPantallaNeutral(grupos);
                } else {
                    const selectedGrupoData = grupos.find(g => g.nombre === grupoNombre);
                    if (selectedGrupoData) {
                        AppUI.mostrarDatosGrupo(selectedGrupoData);
                    }
                }
                
                AppUI.hideSidebar(); 
                AppUI.actualizarSidebarActivo();
            });
        });
    },

    actualizarSidebarActivo: function() {
         document.querySelectorAll('.sidebar-nav-item').forEach(item => {
             const grupoNombre = item.dataset.grupoNombre;
             item.classList.remove('bg-amber-50', 'text-amber-600', 'font-bold');
             item.classList.add('text-slate-700', 'hover:bg-slate-100');
             
             if (grupoNombre === AppState.selectedGrupo) {
                 item.classList.add('bg-amber-50', 'text-amber-600', 'font-bold');
                 item.classList.remove('text-slate-700', 'hover:bg-slate-100');
             } else if (AppState.selectedGrupo === null && grupoNombre === '') {
                 item.classList.add('bg-amber-50', 'text-amber-600', 'font-bold');
                 item.classList.remove('text-slate-700', 'hover:bg-slate-100');
             }
         });
    },
    
    goToHeroSlide: function(index) {
        if (index < 0 || index >= AppState.heroSlideCount) {
             index = Math.max(0, Math.min(index, AppState.heroSlideCount - 1));
             if (index === 6) index = 0; 
             if (index === 0 && AppState.heroSlideIndex === 6) index = 0;
        }
        
        AppState.heroSlideIndex = index;
        const track = document.getElementById('hero-carousel');
        const offset = -index * 100;
        
        if (track) {
            track.style.transform = `translateX(${offset}%)`;
        }
    },
    
    mostrarPantallaNeutral: function(grupos) {
        document.getElementById('main-header-title').textContent = "Bienvenido al Banco del Pincel Dorado";
        
        document.getElementById('page-subtitle').innerHTML = ''; 
        document.getElementById('page-subtitle').classList.add('hidden');

        document.getElementById('table-container').innerHTML = '';
        document.getElementById('table-container').classList.add('hidden');

        const homeStatsContainer = document.getElementById('home-stats-container');
        const bovedaContainer = document.getElementById('boveda-card-container');
        const tesoreriaContainer = document.getElementById('tesoreria-card-container');
        const top3Grid = document.getElementById('top-3-grid');
        
        let bovedaHtml = '';
        let tesoreriaHtml = ''; 
        let top3Html = '';

        const allStudents = AppState.datosAdicionales.allStudents;
        
        const totalGeneral = allStudents
            .filter(s => s.pinceles > 0)
            .reduce((sum, user) => sum + user.pinceles, 0);
        
        const tesoreriaSaldo = AppState.datosAdicionales.saldoTesoreria;
        
        bovedaHtml = `
            <div class="bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl shadow-xl p-4 h-full flex flex-col justify-between text-white">
                <div>
                    <div class="flex items-center justify-between">
                        <span class="text-sm font-medium opacity-80 truncate">Total en Cuentas</span>
                        <span class="text-xs font-bold bg-white/20 text-white rounded-full px-2 py-0.5 w-20 text-center flex-shrink-0">BÓVEDA</span>
                    </div>
                    <div class="flex justify-between items-baseline mt-3">
                        <p class="text-lg font-semibold truncate">Pinceles Totales</p>
                        <p class="text-3xl font-bold">${AppFormat.formatNumber(totalGeneral)} ℙ</p>
                    </div>
                </div>
            </div>
        `;
        
        tesoreriaHtml = `
            <div class="bg-gradient-to-l from-amber-500 to-amber-600 rounded-xl shadow-xl p-4 h-full flex flex-col justify-between text-white">
                <div>
                    <div class="flex items-center justify-between">
                        <span class="text-sm font-medium opacity-80 truncate">Capital Operativo</span>
                        <span class="text-xs font-bold bg-white/20 text-white rounded-full px-2 py-0.5 w-20 text-center flex-shrink-0">TESORERÍA</span>
                    </div>
                    <div class="flex justify-between items-baseline mt-3">
                        <p class="text-lg font-semibold truncate">Fondo del Banco</p>
                        <p class="text-3xl font-bold">${AppFormat.formatNumber(tesoreriaSaldo)} ℙ</p>
                    </div>
                </div>
            </div>
        `;
        
        const depositosActivos = AppState.datosAdicionales.depositosActivos;
        
        const studentsWithCapital = allStudents.map(student => {
            const totalInvertidoDepositos = depositosActivos
                .filter(deposito => (deposito.alumno || '').trim() === (student.nombre || '').trim() && deposito.estado.startsWith('Activo'))
                .reduce((sum, deposito) => sum + (Number(deposito.monto) || 0), 0);
            
            const capitalTotal = student.pinceles + totalInvertidoDepositos;

            return {
                ...student, 
                totalInvertidoDepositos: totalInvertidoDepositos,
                capitalTotal: capitalTotal
            };
        });

        const topN = studentsWithCapital.sort((a, b) => b.capitalTotal - a.capitalTotal).slice(0, 3);

        if (topN.length > 0) {
            top3Html = topN.map((student, index) => {
                let cardClass = 'bg-white border border-slate-200 rounded-xl shadow-lg shadow-dorado-soft/10'; 
                let rankText = 'color-dorado-main';
                
                const grupoNombre = student.grupoNombre || 'N/A';
                
                const pincelesLiquidosF = AppFormat.formatNumber(student.pinceles);
                const totalInvertidoF = AppFormat.formatNumber(student.totalInvertidoDepositos);

                return `
                    <div class="${cardClass} p-3 h-full flex flex-col justify-between transition-all hover:shadow-xl">
                        <div>
                            <div class="flex items-center justify-between mb-1">
                                <span class="text-sm font-medium text-slate-500 truncate">${grupoNombre}</span>
                                <span class="text-lg font-extrabold ${rankText}">${index + 1}º</span>
                            </div>
                            <p class="text-base font-semibold text-slate-900 truncate">${student.nombre}</p>
                        </div>
                        
                        <div class="text-right mt-2">
                            <div class="tooltip-container relative inline-block">
                                <p class="text-xl font-bold ${rankText}">
                                    ${AppFormat.formatNumber(student.capitalTotal)} ℙ
                                </p>
                                <div class="tooltip-text hidden md:block w-48">
                                    <span class="font-bold">Capital Total</span>
                                    <div class="flex justify-between mt-1 text-xs"><span>Capital Líquido:</span> <span>${pincelesLiquidosF} ℙ</span></div>
                                    <div class="flex justify-between text-xs"><span>Capital Invertido:</span> <span>${totalInvertidoF} ℙ</span></div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        for (let i = topN.length; i < 3; i++) {
            top3Html += `
                <div class="bg-white rounded-xl shadow-lg border border-slate-200 p-4 h-full flex flex-col items-center justify-center opacity-50">
                    <span class="text-slate-400 font-semibold">Vacante</span>
                </div>
            `;
        }
        
        if (bovedaContainer) bovedaContainer.innerHTML = bovedaHtml;
        if (tesoreriaContainer) tesoreriaContainer.innerHTML = tesoreriaHtml;
        if (top3Grid) top3Grid.innerHTML = top3Html;
        
        homeStatsContainer.classList.remove('hidden');
    },

    mostrarDatosGrupo: function(grupo) {
        document.getElementById('home-stats-container').classList.add('hidden');
        document.getElementById('table-container').classList.remove('hidden');
        
        document.getElementById('main-header-title').textContent = grupo.nombre;
        
        const subtitle = document.getElementById('page-subtitle');
        subtitle.classList.remove('hidden');
        subtitle.innerHTML = `Total del Grupo: <span class="font-bold color-dorado-main">${AppFormat.formatNumber(grupo.total)} ℙ</span>`;

        const usuarios = [...grupo.usuarios].sort((a, b) => b.pinceles - a.pinceles);

        let html = `
            <div class="bg-white shadow-xl rounded-xl overflow-hidden border border-slate-200">
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead class="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">#</th>
                                <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Estudiante</th>
                                <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Saldo</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
        `;

        usuarios.forEach((usuario, index) => {
            const rank = index + 1;
            let rowClass = "hover:bg-slate-50 transition-colors cursor-pointer group"; 
            let rankClass = "bg-slate-100 text-slate-600";
            
            if (rank === 1) rankClass = "bg-amber-100 text-amber-700";
            if (rank === 2) rankClass = "bg-slate-200 text-slate-700";
            if (rank === 3) rankClass = "bg-orange-100 text-orange-700";
            
            const socioData = AppFormat.getSocioData(usuario.etiqueta);
            let badgeHtml = '';
            
            if (socioData) {
                rowClass += ` ${socioData.rowClass}`; 
                badgeHtml = `<span class="${socioData.badgeClass} ml-2">${socioData.label}</span>`;
            }

            const nombreEscapado = escapeHTML(usuario.nombre);
            const grupoEscapado = escapeHTML(grupo.nombre);

            html += `
                <tr class="${rowClass}" onclick="AppUI.showStudentModal('${grupoEscapado}', '${nombreEscapado}', ${rank})">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${rankClass}">${rank}</span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm font-semibold text-slate-800 group-hover:color-dorado-main transition-colors flex items-center">
                            ${usuario.nombre}
                            ${badgeHtml}
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right">
                        <span class="text-base font-bold text-slate-900 font-tabular-nums">${AppFormat.formatNumber(usuario.pinceles)} ℙ</span>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table></div></div>`;
        document.getElementById('table-container').innerHTML = html;
    },

    updateCountdown: function() {
        const now = new Date();
        const nextUpdate = new Date();
        nextUpdate.setMinutes(Math.ceil(now.getMinutes() / 1) * 1, 0, 0); 
        
        if (nextUpdate <= now) {
            nextUpdate.setMinutes(nextUpdate.getMinutes() + 1);
        }

        const diff = nextUpdate - now;
        const seconds = Math.floor(diff / 1000);
        
        const countdownEl = document.getElementById('countdown');
        if (countdownEl) {
             countdownEl.textContent = `Actualización en: ${seconds}s`;
        }
    },
    
    showLegalModal: function(type) {
        AppUI.showModal('terminos-modal');
        const content = document.getElementById('terminos-modal-content');
        const title = document.getElementById('terminos-modal-title');
        
        if (type === 'terminos') {
            title.textContent = 'Términos y Condiciones';
            content.innerHTML = `
                <div class="prose prose-sm prose-slate max-w-none">
                    <p><strong>1. Uso del Sistema:</strong> El Banco del Pincel Dorado es una herramienta educativa. Los "Pinceles" (ℙ) no tienen valor monetario real.</p>
                    <p><strong>2. Préstamos:</strong> Al solicitar un préstamo, te comprometes a pagarlo en el plazo establecido. El incumplimiento afectará tu historial y futuras solicitudes.</p>
                    <p><strong>3. Transferencias P2P:</strong> Las transferencias entre estudiantes son finales. Verifica el destinatario antes de enviar. Existe un impuesto del 0.15%.</p>
                    <p><strong>4. Tienda:</strong> Los artículos comprados en la tienda se descuentan inmediatamente de tu saldo.</p>
                    <p><strong>5. Socios:</strong> Las membresías de socio (Oro, Plata, Bronce) otorgan beneficios pasivos diarios.</p>
                </div>
            `;
        } else {
            title.textContent = 'Política de Privacidad';
            content.innerHTML = `
                <div class="prose prose-sm prose-slate max-w-none">
                    <p><strong>1. Datos Recopilados:</strong> Solo se utiliza tu nombre y grupo para el funcionamiento del juego.</p>
                    <p><strong>2. Visibilidad:</strong> Tu saldo y ranking son públicos dentro de tu grupo.</p>
                    <p><strong>3. Uso de Datos:</strong> La información se utiliza exclusivamente para fines educativos y de gestión del sistema bancario escolar.</p>
                </div>
            `;
        }
    },
    
    updateSliderFill: function(input) {
        if (!input) return;
        const min = input.min || 0;
        const max = input.max || 100;
        const val = input.value;
        const percentage = ((val - min) / (max - min)) * 100;
        input.style.background = `linear-gradient(to right, #d97706 ${percentage}%, #cbd5e1 ${percentage}%)`;
    }
};

// --- LOGICA DE TRANSACCIONES ---
const AppTransacciones = {

    fetchWithExponentialBackoff: async function(url, options = {}, retries = 3, backoff = 1000) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                if (response.status === 429) throw new Error("Demasiadas peticiones (429)");
                throw new Error(`Error HTTP: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, backoff));
                return AppTransacciones.fetchWithExponentialBackoff(url, options, retries - 1, backoff * 2);
            }
            throw error;
        }
    },

    verificarClaveMaestra: async function() {
        const claveInput = document.getElementById('clave-input');
        const clave = claveInput.value.trim();
        const btn = document.getElementById('modal-submit');
        const btnText = document.getElementById('modal-submit-text');

        if (!clave) {
            claveInput.classList.add('shake', 'border-red-500');
            setTimeout(() => claveInput.classList.remove('shake'), 500);
            return;
        }

        AppTransacciones.setLoadingState(btn, btnText, true);

        try {
            const response = await fetch(AppConfig.TRANSACCION_API_URL, {
                method: 'POST',
                body: JSON.stringify({ accion: 'admin_verificar_clave', clave: clave })
            });
            const data = await response.json();

            if (data.success) {
                AppUI.hideModal('gestion-modal');
                AppUI.showTransaccionModal('transaccion'); 
            } else {
                claveInput.classList.add('shake', 'border-red-500');
                setTimeout(() => claveInput.classList.remove('shake'), 500);
                alert("Clave Incorrecta");
            }
        } catch (error) {
            alert("Error de conexión: " + error.message);
        } finally {
            AppTransacciones.setLoadingState(btn, btnText, false, 'Acceder');
        }
    },

    realizarTransferenciaP2P: async function() {
        const origen = AppState.currentSearch.p2pOrigen.info;
        const destino = AppState.currentSearch.p2pDestino.info;
        const cantidad = document.getElementById('p2p-cantidad').value;
        const clave = document.getElementById('p2p-clave').value;
        
        const statusMsg = document.getElementById('transacciones-combinadas-status-msg');
        const btn = document.getElementById('p2p-submit-btn');
        const btnText = document.getElementById('p2p-btn-text');

        if (!origen || !destino || !cantidad || !clave) {
            AppTransacciones.setError(statusMsg, 'Complete todos los campos.');
            return;
        }

        AppTransacciones.setLoadingState(btn, btnText, true);

        try {
            const response = await fetch(AppConfig.API_URL, {
                method: 'POST',
                body: JSON.stringify({
                    accion: 'transferir_p2p',
                    nombre_origen: origen.nombre,
                    clave_p2p_origen: clave,
                    nombre_destino: destino.nombre,
                    cantidad: Number(cantidad)
                })
            });
            const data = await response.json();

            if (data.success) {
                AppUI.showSuccessSummary('transacciones-combinadas-modal', data, 'p2p');
                AppData.cargarDatos(false);
            } else {
                AppTransacciones.setError(statusMsg, data.message || 'Error en la transferencia.');
            }
        } catch (error) {
            AppTransacciones.setError(statusMsg, 'Error de conexión.');
        } finally {
            AppTransacciones.setLoadingState(btn, btnText, false, 'Realizar Transferencia');
        }
    },

    solicitarPrestamoFlexible: async function() {
        const student = AppState.currentSearch.prestamoAlumno.info;
        const monto = document.getElementById('prestamo-monto-input').value;
        const plazo = document.getElementById('prestamo-plazo-input').value;
        const clave = document.getElementById('prestamo-clave-p2p').value;
        
        const statusMsg = document.getElementById('prestamo-status-msg');
        const btn = document.getElementById('prestamo-submit-btn');

        if (!student || !clave) {
            AppTransacciones.setError(statusMsg, 'Identifíquese y ponga su clave.');
            return;
        }

        btn.disabled = true;
        btn.textContent = "Procesando...";

        try {
            const response = await fetch(AppConfig.API_URL, {
                method: 'POST',
                body: JSON.stringify({
                    accion: 'solicitar_prestamo_flexible',
                    alumnoNombre: student.nombre,
                    claveP2P: clave,
                    montoSolicitado: Number(monto),
                    plazoSolicitado: Number(plazo)
                })
            });
            const data = await response.json();

            if (data.success) {
                 AppUI.showSuccessSummary('transacciones-combinadas-modal', data, 'prestamo');
                 AppData.cargarDatos(false);
            } else {
                 AppTransacciones.setError(statusMsg, data.message);
                 btn.disabled = false; 
                 btn.textContent = "Solicitar Préstamo";
            }
        } catch (error) {
            AppTransacciones.setError(statusMsg, 'Error de red.');
            btn.disabled = false;
            btn.textContent = "Solicitar Préstamo";
        }
    },

    crearDepositoFlexible: async function() {
        const student = AppState.currentSearch.depositoAlumno.info;
        const monto = document.getElementById('deposito-monto-input').value;
        const plazo = document.getElementById('deposito-plazo-input').value;
        const clave = document.getElementById('deposito-clave-p2p').value;
        
        const statusMsg = document.getElementById('deposito-status-msg');
        const btn = document.getElementById('deposito-submit-btn');

        if (!student || !clave) {
            AppTransacciones.setError(statusMsg, 'Identifíquese y ponga su clave.');
            return;
        }

        btn.disabled = true;
        btn.textContent = "Procesando...";

        try {
            const response = await fetch(AppConfig.API_URL, {
                method: 'POST',
                body: JSON.stringify({
                    accion: 'crear_deposito_flexible',
                    alumnoNombre: student.nombre,
                    claveP2P: clave,
                    montoADepositar: Number(monto),
                    plazoEnDias: Number(plazo)
                })
            });
            const data = await response.json();

            if (data.success) {
                AppUI.showSuccessSummary('transacciones-combinadas-modal', data, 'deposito');
                AppData.cargarDatos(false);
            } else {
                AppTransacciones.setError(statusMsg, data.message);
                btn.disabled = false;
                btn.textContent = "Crear Inversión";
            }
        } catch (error) {
            AppTransacciones.setError(statusMsg, 'Error de red.');
            btn.disabled = false;
            btn.textContent = "Crear Inversión";
        }
    },

    iniciarCanje: function(bonoClave) {
        if (!AppState.datosActuales) return;
        AppUI.showBonoStep2(bonoClave);
    },

    confirmarCanje: async function() {
        const bonoClave = AppState.bonos.selectedBono;
        const alumno = AppState.currentSearch.bonoAlumno.info;
        const claveP2P = document.getElementById('bono-clave-p2p-step2').value;
        
        const statusMsg = document.getElementById('bono-step2-status-msg');
        const btn = document.getElementById('bono-submit-step2-btn');
        const btnText = document.getElementById('bono-btn-text-step2');

        if (!alumno || !claveP2P) {
            AppTransacciones.setError(statusMsg, 'Seleccione su nombre y ponga su clave.');
            return;
        }

        AppTransacciones.setLoadingState(btn, btnText, true);

        try {
            const response = await fetch(AppConfig.API_URL, {
                method: 'POST',
                body: JSON.stringify({
                    accion: 'canjear_bono',
                    alumnoNombre: alumno.nombre,
                    claveP2P: claveP2P,
                    claveBono: bonoClave
                })
            });
            const data = await response.json();

            if (data.success) {
                AppState.bonos.canjeados.push(bonoClave);
                AppUI.showSuccessSummary('bonos-modal', data, 'bono');
                AppData.cargarDatos(false);
            } else {
                AppTransacciones.setError(statusMsg, data.message);
            }
        } catch (error) {
            AppTransacciones.setError(statusMsg, 'Error de red.');
        } finally {
            AppTransacciones.setLoadingState(btn, btnText, false, 'Confirmar Canje');
        }
    },

    iniciarCompra: function(itemId) {
        if (!AppState.datosActuales) return;
        AppUI.showTiendaStep2(itemId);
    },

    confirmarCompra: async function() {
        const itemId = AppState.tienda.selectedItem;
        const alumno = AppState.currentSearch.tiendaAlumno.info;
        const claveP2P = document.getElementById('tienda-clave-p2p-step2').value;
        
        const statusMsg = document.getElementById('tienda-step2-status-msg');
        const btn = document.getElementById('tienda-submit-step2-btn');
        const btnText = document.getElementById('tienda-btn-text-step2');

        if (!alumno || !claveP2P) {
            AppTransacciones.setError(statusMsg, 'Identifíquese y ponga su clave.');
            return;
        }

        AppTransacciones.setLoadingState(btn, btnText, true);

        try {
            const response = await fetch(AppConfig.API_URL, {
                method: 'POST',
                body: JSON.stringify({
                    accion: 'comprar_item_tienda',
                    alumnoNombre: alumno.nombre,
                    claveP2P: claveP2P,
                    itemId: itemId
                })
            });
            const data = await response.json();

            if (data.success) {
                AppUI.showSuccessSummary('tienda-modal', data, 'tienda');
                AppData.cargarDatos(false);
            } else {
                AppTransacciones.setError(statusMsg, data.message);
            }
        } catch (error) {
            AppTransacciones.setError(statusMsg, 'Error de red.');
        } finally {
            AppTransacciones.setLoadingState(btn, btnText, false, 'Confirmar Compra');
        }
    },

    realizarTransaccionMultiple: async function() {
        const usuarios = Array.from(AppState.transaccionSelectedUsers);
        const cantidad = document.getElementById('transaccion-cantidad-input').value;
        
        const statusMsg = document.getElementById('transaccion-status-msg');
        const btn = document.getElementById('transaccion-submit-btn');
        const btnText = document.getElementById('transaccion-btn-text');

        if (usuarios.length === 0 || !cantidad) {
            AppTransacciones.setError(statusMsg, 'Seleccione usuarios y monto.');
            return;
        }

        // Construir array de transacciones agrupadas (simplificación)
        const transacciones = [{ nombres: usuarios }];

        AppTransacciones.setLoadingState(btn, btnText, true);

        try {
            const response = await fetch(AppConfig.TRANSACCION_API_URL, {
                method: 'POST',
                body: JSON.stringify({
                    accion: 'transaccion_multiple',
                    transacciones: transacciones,
                    cantidad: Number(cantidad)
                })
            });
            const data = await response.json();

            if (data.success) {
                 AppUI.showSuccessSummary('transaccion-modal', data.detalles, 'admin_multi');
                 AppData.cargarDatos(false);
            } else {
                 AppTransacciones.setError(statusMsg, data.message);
            }
        } catch (error) {
             AppTransacciones.setError(statusMsg, 'Error de red.');
        } finally {
             AppTransacciones.setLoadingState(btn, btnText, false, 'Realizar Transacción');
        }
    },
    
    // --- GESTIÓN DE BONOS (ADMIN) ---
    crearActualizarBono: async function() {
        const clave = document.getElementById('bono-admin-clave-input').value.trim().toUpperCase();
        const nombre = document.getElementById('bono-admin-nombre-input').value.trim();
        const recompensa = document.getElementById('bono-admin-recompensa-input').value;
        const usos = document.getElementById('bono-admin-usos-input').value;
        const expiracionHoras = document.getElementById('bono-admin-expiracion-input').value;
        
        const gruposPermitidos = AppUI.getAdminGroupCheckboxSelection('bono-admin-grupos-checkboxes-container');
        
        const statusMsg = document.getElementById('bono-admin-status-msg');
        const btn = document.getElementById('bono-admin-submit-btn');

        if (!clave || !nombre || !recompensa || !usos) {
            statusMsg.textContent = "Complete los campos obligatorios.";
            return;
        }

        let expiracionFecha = "";
        if (expiracionHoras) {
            const d = new Date();
            d.setTime(d.getTime() + (Number(expiracionHoras) * 60 * 60 * 1000));
            expiracionFecha = AppFormat.toLocalISOString(d); 
        }

        btn.disabled = true;
        btn.textContent = "Guardando...";

        try {
            const response = await fetch(AppConfig.TRANSACCION_API_URL, {
                method: 'POST',
                body: JSON.stringify({
                    accion: 'admin_crear_bono',
                    bono: {
                        clave: clave,
                        nombre: nombre,
                        recompensa: Number(recompensa),
                        usos_totales: Number(usos),
                        grupos_permitidos: gruposPermitidos.join(', '),
                        expiracion_fecha: expiracionFecha
                    }
                })
            });
            const data = await response.json();

            if (data.success) {
                statusMsg.textContent = "Bono guardado.";
                statusMsg.className = "text-sm font-semibold text-green-600 mt-2";
                AppData.cargarDatos(false);
                AppUI.clearBonoAdminForm();
            } else {
                statusMsg.textContent = data.message;
                statusMsg.className = "text-sm font-semibold text-red-600 mt-2";
            }
        } catch (e) {
            statusMsg.textContent = "Error de red.";
            statusMsg.className = "text-sm font-semibold text-red-600 mt-2";
        } finally {
            btn.disabled = false;
        }
    },
    
    eliminarBono: async function(clave) {
        if (!confirm(`¿Eliminar bono "${clave}"?`)) return;
        
        try {
            const response = await fetch(AppConfig.TRANSACCION_API_URL, {
                method: 'POST',
                body: JSON.stringify({ accion: 'admin_eliminar_bono', claveBono: clave })
            });
            const data = await response.json();
            if (data.success) {
                AppData.cargarDatos(false);
            } else {
                alert("Error: " + data.message);
            }
        } catch (e) { alert("Error de red."); }
    },
    
    // --- GESTIÓN DE TIENDA (ADMIN) ---
    crearActualizarItem: async function() {
        const itemId = document.getElementById('tienda-admin-itemid-input').value.trim();
        const nombre = document.getElementById('tienda-admin-nombre-input').value.trim();
        const desc = document.getElementById('tienda-admin-desc-input').value.trim();
        const tipo = document.getElementById('tienda-admin-tipo-input').value.trim();
        const precio = document.getElementById('tienda-admin-precio-input').value;
        const stock = document.getElementById('tienda-admin-stock-input').value;
        const expiracionHoras = document.getElementById('tienda-admin-expiracion-input').value;
        
        const gruposPermitidos = AppUI.getAdminGroupCheckboxSelection('tienda-admin-grupos-checkboxes-container');
        
        const statusMsg = document.getElementById('tienda-admin-status-msg');
        const btn = document.getElementById('tienda-admin-submit-btn');

        if (!itemId || !nombre || !precio || !stock) {
            statusMsg.textContent = "Complete los campos obligatorios.";
            return;
        }

        let expiracionFecha = "";
        if (expiracionHoras) {
            const d = new Date();
            d.setTime(d.getTime() + (Number(expiracionHoras) * 60 * 60 * 1000));
            expiracionFecha = AppFormat.toLocalISOString(d);
        }

        btn.disabled = true;
        btn.textContent = "Guardando...";

        try {
            const response = await fetch(AppConfig.TRANSACCION_API_URL, {
                method: 'POST',
                body: JSON.stringify({
                    accion: 'admin_crear_item_tienda',
                    item: {
                        ItemID: itemId,
                        Nombre: nombre,
                        Descripcion: desc,
                        Tipo: tipo,
                        PrecioBase: Number(precio),
                        Stock: Number(stock),
                        GruposPermitidos: gruposPermitidos.join(', '),
                        ExpiracionFecha: expiracionFecha
                    }
                })
            });
            const data = await response.json();

            if (data.success) {
                statusMsg.textContent = "Artículo guardado.";
                statusMsg.className = "text-sm font-semibold text-green-600 mt-2";
                AppData.cargarDatos(false);
                AppUI.clearTiendaAdminForm();
            } else {
                statusMsg.textContent = data.message;
                statusMsg.className = "text-sm font-semibold text-red-600 mt-2";
            }
        } catch (e) {
            statusMsg.textContent = "Error de red.";
        } finally {
            btn.disabled = false;
        }
    },
    
    eliminarItem: async function(itemId) {
        try {
            const response = await fetch(AppConfig.TRANSACCION_API_URL, {
                method: 'POST',
                body: JSON.stringify({ accion: 'admin_eliminar_item_tienda', itemId: itemId })
            });
            const data = await response.json();
            if (data.success) {
                AppData.cargarDatos(false);
            } else {
                alert("Error: " + data.message);
            }
        } catch (e) { alert("Error de red."); }
    },
    
    guardarFechaApertura: async function() {
        const dateInput = document.getElementById('tienda-admin-date-input');
        const msg = document.getElementById('tienda-date-status-msg');
        const val = dateInput.value;
        
        if (!val) {
            msg.textContent = "Selecciona una fecha.";
            return;
        }
        
        // Guardar como ISO string completo
        const d = new Date(val);
        const isoStr = AppFormat.toLocalISOString(d); // Usa tu helper para formatear seguro

        try {
            const response = await fetch(AppConfig.TRANSACCION_API_URL, {
                method: 'POST',
                body: JSON.stringify({
                    accion: 'admin_set_store_date',
                    date: isoStr
                })
            });
            const data = await response.json();
            if(data.success) {
                msg.textContent = "Fecha guardada.";
                msg.className = "text-xs font-semibold text-green-600";
                AppData.cargarDatos(false); // Refrescar para ver cambios
            } else {
                msg.textContent = "Error al guardar.";
                 msg.className = "text-xs font-semibold text-red-600";
            }
        } catch(e) { console.error(e); }
    },

    borrarFechaApertura: async function() {
        const msg = document.getElementById('tienda-date-status-msg');
        try {
            const response = await fetch(AppConfig.TRANSACCION_API_URL, {
                method: 'POST',
                body: JSON.stringify({
                    accion: 'admin_set_store_date',
                    date: '' // Vacío para borrar
                })
            });
             const data = await response.json();
            if(data.success) {
                document.getElementById('tienda-admin-date-input').value = '';
                msg.textContent = "Programación borrada.";
                msg.className = "text-xs font-semibold text-slate-600";
                AppData.cargarDatos(false);
            }
        } catch(e) { console.error(e); }
    },
    
    // --- GESTIÓN DE CAUSAS (ADMIN) ---
    crearActualizarCausa: async function() {
        const idCausa = document.getElementById('causa-admin-id-input').value.trim().toUpperCase();
        const titulo = document.getElementById('causa-admin-titulo-input').value.trim();
        const meta = document.getElementById('causa-admin-meta-input').value;
        const estado = document.getElementById('causa-admin-estado-input').value;
        
        // Obtener el beneficiario del estado de búsqueda (para asegurar precisión)
        const beneficiarioInfo = AppState.currentSearch.causaAdminBeneficiario.info;
        let beneficiario = 'Banco'; 

        if (beneficiarioInfo) {
            beneficiario = beneficiarioInfo.nombre; // Puede ser 'Banco', 'Nombre Alumno' o 'GRUPO: X'
        } else {
            // Fallback si el usuario escribió algo manualmente que coincide exactamente
            const rawVal = document.getElementById('causa-admin-beneficiario-search').value.trim();
            if (rawVal) beneficiario = rawVal;
        }

        const statusMsg = document.getElementById('causa-admin-status-msg');
        const btn = document.getElementById('causa-admin-submit-btn');

        if (!idCausa || !titulo || !meta || Number(meta) <= 0 || !beneficiario) {
            statusMsg.textContent = "Complete campos obligatorios y meta válida.";
            statusMsg.className = "text-sm font-semibold text-red-600 mt-2";
            return;
        }

        btn.disabled = true;
        btn.textContent = "Guardando...";

        try {
            const response = await fetch(AppConfig.TRANSACCION_API_URL, {
                method: 'POST',
                body: JSON.stringify({
                    accion: 'admin_crear_causa',
                    causa: {
                        id_causa: idCausa,
                        titulo: titulo,
                        meta_total: Number(meta),
                        beneficiario: beneficiario,
                        estado: estado
                    }
                })
            });
            const data = await response.json();

            if (data.success) {
                statusMsg.textContent = "Causa guardada.";
                statusMsg.className = "text-sm font-semibold text-green-600 mt-2";
                AppData.cargarDatos(false);
                AppUI.clearCausaAdminForm();
            } else {
                statusMsg.textContent = data.message;
                statusMsg.className = "text-sm font-semibold text-red-600 mt-2";
            }
        } catch (e) {
            statusMsg.textContent = "Error de red.";
        } finally {
            btn.disabled = false;
            btn.textContent = document.getElementById('causa-admin-id-input').disabled ? "Guardar Cambios" : "Crear / Actualizar Causa";
        }
    },

    eliminarCausa: async function(idCausa) {
        if (!confirm(`¿Eliminar la causa "${idCausa}" y su historial?`)) return;
        
        try {
            const response = await fetch(AppConfig.TRANSACCION_API_URL, {
                method: 'POST',
                body: JSON.stringify({ accion: 'admin_eliminar_causa', idCausa: idCausa })
            });
            const data = await response.json();
            if (data.success) {
                AppData.cargarDatos(false);
            } else {
                alert("Error: " + data.message);
            }
        } catch (e) { alert("Error de red."); }
    },

    // --- TRANSACCIÓN DE APORTE (DONACIÓN) ---
    confirmarAporte: async function() {
        const idCausa = AppState.causas.selectedCausa;
        const donante = AppState.currentSearch.causaDonante.info;
        const claveP2P = document.getElementById('causa-clave-p2p-step2').value;
        const monto = document.getElementById('causa-monto-aporte').value;
        
        const statusMsg = document.getElementById('causa-step2-status-msg');
        const btn = document.getElementById('donaciones-submit-step2-btn');
        const btnText = document.getElementById('donaciones-btn-text-step2');

        if (!donante || !claveP2P || !monto || Number(monto) < AppConfig.DONACION_MIN_APORTE) {
            AppTransacciones.setError(statusMsg, `Complete datos. Mínimo: ${AppConfig.DONACION_MIN_APORTE} ℙ.`);
            return;
        }

        AppTransacciones.setLoadingState(btn, btnText, true);

        try {
            const response = await fetch(AppConfig.API_URL, {
                method: 'POST',
                body: JSON.stringify({
                    accion: 'aportar_a_causa',
                    alumnoNombre: donante.nombre,
                    claveP2P: claveP2P,
                    idCausa: idCausa,
                    montoAporte: Number(monto)
                })
            });
            const data = await response.json();

            if (data.success) {
                AppUI.showSuccessSummary('donaciones-modal', { ...data, causa_id: idCausa }, 'donacion');
                AppData.cargarDatos(false);
            } else {
                AppTransacciones.setError(statusMsg, data.message);
            }
        } catch (error) {
            AppTransacciones.setError(statusMsg, 'Error de red.');
        } finally {
            AppTransacciones.setLoadingState(btn, btnText, false, 'Confirmar Aporte');
        }
    },

    // --- HELPERS LÓGICOS ---

    checkLoanEligibility: function(student, amount) {
        if (student.pinceles < 0) return { isEligible: false, message: "No puedes solicitar préstamos con saldo negativo." };
        
        const hasActiveLoan = AppState.datosAdicionales.prestamosActivos.some(p => p.alumno === student.nombre && (p.estado === 'Activo' || p.estado.startsWith('Vencido')));
        if (hasActiveLoan) return { isEligible: false, message: "Ya tienes un préstamo activo." };

        const capacidadEndeudamiento = student.pinceles * 0.50;
        if (amount > capacidadEndeudamiento) {
             return { isEligible: false, message: `El monto excede tu capacidad (Máx: ${AppFormat.formatNumber(capacidadEndeudamiento)} ℙ).` };
        }
        
        if (amount > AppState.datosAdicionales.saldoTesoreria) {
             return { isEligible: false, message: "El banco no tiene fondos suficientes por ahora." };
        }

        return { isEligible: true, message: "Eres elegible para este préstamo." };
    },

    checkDepositEligibility: function(student, amount) {
        if (student.pinceles < amount) return { isEligible: false, message: "Fondos insuficientes para esta inversión." };

        const hasActiveLoan = AppState.datosAdicionales.prestamosActivos.some(p => p.alumno === student.nombre && (p.estado === 'Activo' || p.estado.startsWith('Vencido')));
        if (hasActiveLoan) return { isEligible: false, message: "No puedes invertir si tienes deudas pendientes." };

        return { isEligible: true, message: "Inversión válida." };
    },

    setEligibilityState: function(btn, msgElement, isEligible, message, isNeutral = false) {
        msgElement.textContent = message;
        if (isNeutral) {
            msgElement.className = "text-xs font-medium text-slate-500 mt-1";
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
        } else if (isEligible) {
            msgElement.className = "text-xs font-bold text-green-600 mt-1";
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            msgElement.className = "text-xs font-bold text-red-600 mt-1";
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    },

    setError: function(element, message) {
        element.textContent = message;
        element.classList.add('text-red-600', 'font-bold');
    },

    setLoadingState: function(btn, btnText, isLoading, defaultText = '') {
        var svgIcon = btn.querySelector('svg');
        
        if (isLoading) {
            btn.disabled = true;
            btnText.textContent = "Procesando...";
            if (svgIcon) svgIcon.classList.add('hidden');
        } else {
            btn.disabled = false;
            btnText.textContent = defaultText;
            if (svgIcon) svgIcon.classList.remove('hidden');
        }
    }
};

// Utilidad global
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag]));
}

// INICIALIZACIÓN
window.AppUI = AppUI;
window.AppTransacciones = AppTransacciones;
window.AppState = AppState;

window.AppUI.showStudentModal = AppUI.showStudentModal;
window.AppUI.hideModal = AppUI.hideModal;
window.AppUI.showDonacionesStep2 = AppUI.showDonacionesStep2;
window.AppUI.handleEditCausa = AppUI.handleEditCausa;
window.AppTransacciones.eliminarCausa = AppTransacciones.eliminarCausa;

window.onload = function() {
    AppUI.init();
    
    const setupSliderFill = () => {
        const inputs = document.querySelectorAll('input[type="range"]');
        inputs.forEach(input => {
            const update = () => AppUI.updateSliderFill(input);
            update();
            input.addEventListener('input', update);
        });
    };
    
    AppUI.goToHeroSlide(0); 

    setTimeout(() => {
        setupSliderFill();
        
        document.getElementById('transacciones-combinadas-modal').addEventListener('click', (e) => {
             if (e.target.classList.contains('tab-btn') && e.target.closest('#transacciones-combinadas-modal')) {                 AppUI.changeTransaccionesCombinadasTab(e.target.dataset.tab);
             }
             if (e.target.id === 'transacciones-combinadas-modal') {
                 AppUI.hideModal('transacciones-combinadas-modal');
             }
        });

        document.getElementById('transacciones-combinadas-modal').addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-btn')) {
                 setTimeout(setupSliderFill, 10);
            }
        });
        
    }, 500); 
    
    document.querySelectorAll('.loading-shimmer-text, .loading-dot').forEach(el => {
        el.style.animationPlayState = 'running';
    });
};
