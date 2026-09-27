// public/js/common.js

const API_BASE = '/api';

// 訪客白名單頁面
const GUEST_ALLOWED_PAGES = ['index.html', 'history.html', 'lantern.html', 'events.html', 'login.html', 'manual.html', 'contact.html','quotes.html'];

// 登入後各角色權限表
const ROLE_PERMISSIONS = {
    GUEST: ['index.html', 'history.html', 'lantern.html', 'events.html', 'manual.html', 'contact.html','quotes.html'],
    VOLUNTEER: ['index.html', 'history.html', 'events.html', 'lantern.html', 'charity.html', 'manual.html', 'contact.html', 'quotes.html', 'inquiries.html'],
    RITUAL: ['index.html', 'history.html', 'events.html', 'charity.html', 'manual.html', 'contact.html', 'quotes.html', 'inquiries.html'],
    ACCOUNTANT: ['index.html', 'history.html', 'events.html', 'finance.html', 'charity.html', 'manual.html', 'contact.html', 'quotes.html', 'inquiries.html'],
    ADMIN: ['index.html', 'history.html', 'events.html', 'lantern.html', 'finance.html', 'crm.html', 'charity.html', 'settings.html', 'manual.html', 'contact.html', 'quotes.html', 'inquiries.html']
};

const ROLE_NAMES = {
    GUEST: '訪客善信',
    ADMIN: '主委 / 系統管理員',
    ACCOUNTANT: '會計出納執事',
    RITUAL: '法會科儀組長',
    VOLUNTEER: '臨櫃服務志工'
};

// 容錯取得當前登入者；若未登入則傳回預設 GUEST 物件
function getCurrentUser() {
    const userStr = localStorage.getItem('temple_user');
    const token = localStorage.getItem('temple_token');

    if (!token || !userStr) {
        return {
            userId: null,
            username: 'guest',
            realName: '訪客大德',
            role: 'GUEST'
        };
    }

    try {
        const user = JSON.parse(userStr);
        if (user && !user.realName && user.real_name) {
            user.realName = user.real_name;
        }
        return user || { role: 'GUEST' };
    } catch (e) {
        return { role: 'GUEST' };
    }
}

// 登出清理
function executeLogout() {
    localStorage.removeItem('temple_token');
    localStorage.removeItem('temple_user');
    window.location.replace('login.html');
}

// =========================================================================
// 核心身分守衛：未登入者僅允許停留在 index.html 與 history.html
// =========================================================================
function enforceAuthenticationGuard() {
    const path = window.location.pathname;
    let currentPage = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    if (currentPage === '') currentPage = 'index.html';

    const user = getCurrentUser();

    // 若尚未登入（GUEST 訪客）
    if (user.role === 'GUEST') {
        // 檢查是否在白名單中
        if (!GUEST_ALLOWED_PAGES.includes(currentPage)) {
            // 試圖直接開啟受保護頁面（如 finance.html, lantern.html 等），強制導向登入頁
            window.location.replace('login.html');
            return;
        }
    } else {
        // 已登入使用者造訪 login.html 時自動回到首頁大廳
        if (currentPage === 'login.html') {
            window.location.replace('index.html');
            return;
        }

        // 檢查登入者的專屬頁面權限
        const allowed = ROLE_PERMISSIONS[user.role] || [];
        if (!allowed.includes(currentPage)) {
            alert(`【權限不足】您的身分為「${ROLE_NAMES[user.role] || user.role}」，無法存取此模組！`);
            window.location.replace('index.html');
        }
    }
}

// 優先執行守衛攔截
enforceAuthenticationGuard();

// 農曆歲次字串
function getTodayChineseDateString() {
    const now = new Date();
    const tianGan = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
    const diZhi = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    const year = now.getFullYear();
    const suiCi = `${tianGan[(year - 4) % 10]}${diZhi[(year - 4) % 12]}年`;

    let lunarMonth = '';
    let lunarDay = '';

    try {
        const formatter = new Intl.DateTimeFormat('zh-TW-u-ca-chinese', { month: 'numeric', day: 'numeric' });
        const parts = formatter.formatToParts(now);
        const mPart = parts.find(p => p.type === 'month');
        const dPart = parts.find(p => p.type === 'day');
        const mNum = parseInt(mPart.value, 10);
        const dNum = parseInt(dPart.value, 10);

        const monthNames = ['', '正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '臘'];
        const dayDigits = ['日', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

        lunarMonth = monthNames[mNum] ? `${monthNames[mNum]}月` : `${mNum}月`;
        if (dNum === 10) lunarDay = '初十';
        else if (dNum === 20) lunarDay = '二十';
        else if (dNum === 30) lunarDay = '三十';
        else {
            const ten = Math.floor(dNum / 10);
            const unit = dNum % 10;
            if (ten === 0) lunarDay = `初${dayDigits[unit]}`;
            else if (ten === 1) lunarDay = `十${dayDigits[unit]}`;
            else if (ten === 2) lunarDay = `廿${dayDigits[unit]}`;
        }
    } catch (e) {
        return '歲次丙午年 ‧ 今日吉日';
    }

    return `歲次${suiCi} ‧ 今日吉日：農曆${lunarMonth}${lunarDay}`;
}

// 渲染自適應全域導航列 (支援手機漢堡選單)
function renderGlobalNav() {
    const path = window.location.pathname;
    let currentPage = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    if (currentPage === '') currentPage = 'index.html';
    if (currentPage === 'login.html') return;

    if (document.getElementById('global-system-nav')) return;

    const user = getCurrentUser();
    const isGuest = user.role === 'GUEST';
    const todayLunarText = getTodayChineseDateString();

    const allNavItems = [
        { page: 'index.html', icon: '⛩️', label: '首頁大廳' },
        { page: 'history.html', icon: '📜', label: '廟宇沿革' },
        { page: 'quotes.html', icon: '🪷', label: '智慧善語錄' },
        { page: 'events.html', icon: '📅', label: '法會活動' },
        { page: 'lantern.html', icon: '🏮', label: '點燈排位' },
        { page: 'charity.html', icon: '🌾', label: '物資捐贈' },
        { page: 'finance.html', icon: '🪙', label: '財務收支' },
        { page: 'crm.html', icon: '👤', label: '信眾家戶' },
        { page: 'settings.html', icon: '⚙️', label: '系統參數' },
        { page: 'contact.html', icon: '📞', label: '聯絡資訊' },
        { page: 'inquiries.html', icon: '💬', label: '留言管理' },
        { page: 'manual.html', icon: '📑', label: '操作手冊' }
    ];

    const allowedPages = ROLE_PERMISSIONS[user.role] || GUEST_ALLOWED_PAGES;
    const visibleNavs = allNavItems.filter(item => allowedPages.includes(item.page));

    const navContainer = document.createElement('header');
    navContainer.id = 'global-system-nav';
    navContainer.className = 'bg-amber-950 text-amber-50 shadow-md sticky top-0 z-50';

    navContainer.innerHTML = `
    <div class="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
        
        <!-- 左側：廟名與歲次 (自適應縮排) -->
        <div class="flex items-center gap-3 shrink-0">
            <div>
                <a href="index.html" class="font-black tracking-widest text-sm flex items-center gap-1.5 text-amber-300 hover:text-amber-200">
                    <span>⛩️</span>
                    <span class="whitespace-nowrap">五公祖師巖</span>
                </a>
                <p class="text-[10px] sm:text-[11px] text-amber-300/80 font-mono hidden sm:block">
                    ${todayLunarText}
                </p>
            </div>
        </div>

        <!-- 中間：桌面端橫向滾動選單 (平板/電腦顯示，絕不換行破版) -->
        <nav class="hidden lg:flex items-center gap-1 overflow-x-auto  py-1 max-w-[62%]">
            ${visibleNavs.map(item => `
                <a href="${item.page}" 
                   class="px-2.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 whitespace-nowrap shrink-0 ${currentPage === item.page ? 'bg-amber-800 text-white shadow' : 'text-amber-200/80 hover:bg-amber-900 hover:text-white'}">
                    <span>${item.icon}</span>
                    <span>${item.label}</span>
                </a>
            `).join('')}
        </nav>

        <!-- 右側：身分標籤、登入登出與手機漢堡按鈕 -->
        <div class="flex items-center gap-2 shrink-0">
            <!-- 桌面端身分資訊 -->
            <div class="hidden sm:flex items-center gap-2">
                ${isGuest ? `
                    <a href="login.html" class="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold transition-all shadow flex items-center gap-1 text-[11px]">
                        <span>🔑</span> 執事登入
                    </a>
                ` : `
                    <span class="bg-amber-900/80 border border-amber-800 px-2 py-0.5 rounded text-[11px] text-amber-200 truncate max-w-[130px]">
                        👤 ${user.realName || user.username}
                    </span>
                    <button onclick="executeLogout()" class="px-2 py-1 bg-red-900/80 hover:bg-red-800 text-white rounded font-bold text-[11px]">
                        登出
                    </button>
                `}
            </div>

            <!-- 手機端專用漢堡選單開關按鈕 (lg 以下顯示) -->
            <button id="mobile-menu-btn" 
                    type="button" 
                    aria-label="開啟選單"
                    class="lg:hidden p-1.5 rounded-lg bg-amber-900 text-amber-200 hover:text-white border border-amber-800 focus:outline-none flex items-center justify-center text-lg">
                ☰
            </button>
        </div>
    </div>

    <!-- 手機端摺疊下拉清單 (預設隱藏 hidden) -->
    <div id="mobile-nav-drawer" class="hidden lg:hidden bg-amber-950/98 border-t border-amber-900 px-4 py-3 space-y-3 shadow-2xl backdrop-blur-md">
        <!-- 手機端歲次與登入狀態 -->
        <div class="flex justify-between items-center pb-2 border-b border-amber-900 text-[11px] text-amber-300">
            <span>${todayLunarText}</span>
            <span>${isGuest ? '訪客身分' : (user.realName || user.username)}</span>
        </div>

        <!-- 手機功能項目：九宮格 / 雙欄排版，方便大拇指點擊 -->
        <div class="grid grid-cols-2 gap-2 text-xs">
            ${visibleNavs.map(item => `
                <a href="${item.page}" 
                   class="p-2.5 rounded-xl font-bold transition-all flex items-center gap-2 border ${currentPage === item.page ? 'bg-amber-800 text-white border-amber-600 shadow' : 'bg-amber-900/50 text-amber-200 border-amber-800/60 hover:bg-amber-800/60'}">
                    <span class="text-base">${item.icon}</span>
                    <span>${item.label}</span>
                </a>
            `).join('')}
        </div>

        <!-- 手機端登入 / 登出操作區 -->
        <div class="pt-2 border-t border-amber-900">
            ${isGuest ? `
                <a href="login.html" class="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 shadow">
                    <span>🔑</span> 執事登入
                </a>
            ` : `
                <button onclick="executeLogout()" class="w-full py-2 bg-red-900/80 hover:bg-red-800 text-white rounded-xl font-bold flex items-center justify-center gap-1.5">
                    <span>🚪</span> 登出系統
                </button>
            `}
        </div>
    </div>
    `;

    document.body.prepend(navContainer);

    // 綁定漢堡選單切換事件
    const menuBtn = document.getElementById('mobile-menu-btn');
    const drawer = document.getElementById('mobile-nav-drawer');
    if (menuBtn && drawer) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            drawer.classList.toggle('hidden');
            menuBtn.innerHTML = drawer.classList.contains('hidden') ? '☰' : '✕';
        });

        // 點擊選單外自動收合
        document.addEventListener('click', (e) => {
            if (!navContainer.contains(e.target) && !drawer.classList.contains('hidden')) {
                drawer.classList.add('hidden');
                menuBtn.innerHTML = '☰';
            }
        });
    }
}

//// 渲染自適應導航列
//function renderGlobalNav() {
//    const path = window.location.pathname;
//    let currentPage = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
//    if (currentPage === '') currentPage = 'index.html';
//    if (currentPage === 'login.html') return;

//    if (document.getElementById('global-system-nav')) return;

//    const user = getCurrentUser();
//    const isGuest = user.role === 'GUEST';
//    const todayLunarText = getTodayChineseDateString();

//    const navContainer = document.createElement('div');
//    navContainer.id = 'global-system-nav';
//    navContainer.className = 'bg-amber-950 text-amber-50 shadow-md sticky top-0 z-40';

//    const allNavItems = [
//        { page: 'index.html', icon: '⛩️', label: '首頁大廳' },
//        { page: 'history.html', icon: '📜', label: '廟宇沿革' },
//        { page: 'events.html', icon: '📅', label: '法會活動' },
//        { page: 'lantern.html', icon: '🏮', label: '點燈排位' },
//        { page: 'charity.html', icon: '🌾', label: '物資捐贈' },
//        { page: 'finance.html', icon: '🪙', label: '財務收支' },
//        { page: 'crm.html', icon: '👤', label: '信眾家戶' },
//        { page: 'settings.html', icon: '⚙️', label: '系統參數' },
//        { page: 'contact.html', icon: '📞', label: '廟宇聯絡資訊' },
//        { page: 'manual.html', icon: '📑', label: '系統操作手冊' },
//        { page: 'inquiries.html', icon: '💬', label: '信眾諮詢留言管理' }
    
//    ];

//    // 依照身分篩選允許顯示的選單
//    const allowedPages = ROLE_PERMISSIONS[user.role] || ['index.html', 'history.html', 'events.html', 'contact.html', 'charity.html','lantern.html'];
//    const visibleNavs = allNavItems.filter(item => allowedPages.includes(item.page));

//    navContainer.innerHTML = `
//    <div class="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap justify-between items-center gap-3 text-xs">
//      <div class="flex items-center gap-6">
//        <div>
//          <span class="font-black tracking-widest text-sm flex items-center gap-1.5 text-amber-300">
//            <span>⛩️</span> 五公祖師巖 ‧ 宮務管理系統
//          </span>
//          <p class="text-[11px] text-amber-300/80 font-mono mt-0.5">
//            ${todayLunarText}
//          </p>
//        </div>

//        <div class="flex items-center gap-1">
//          ${visibleNavs.map(item => `
//            <a href="${item.page}" 
//               class="px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 ${currentPage === item.page ? 'bg-amber-800 text-white shadow' : 'text-amber-200/80 hover:bg-amber-900 hover:text-white'
//        }">
//              <span>${item.icon}</span> ${item.label}
//            </a>
//          `).join('')}
//        </div>
//      </div>

//      <div class="flex items-center gap-3">
//        ${isGuest ? `
//          <span class="bg-amber-900/40 border border-amber-800/80 px-2.5 py-1 rounded text-amber-200">
//            👤 訪客信眾（未登入）
//          </span>
//          <a href="login.html" class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded font-bold transition-all shadow flex items-center gap-1">
//            <span>🔑</span> 執事登入
//          </a>
//        ` : `
//          <span class="bg-amber-900/80 border border-amber-800 px-2.5 py-1 rounded text-amber-200">
//            👤 ${user.realName || user.username}（<b class="text-amber-400">${ROLE_NAMES[user.role] || user.role}</b>）
//          </span>
//          <button onclick="executeLogout()" class="px-2.5 py-1 bg-red-900/80 hover:bg-red-800 text-white rounded font-bold transition-all">
//            🚪 登出
//          </button>
//        `}
//      </div>
//    </div>
//  `;

//    document.body.prepend(navContainer);
//}

// =========================================================================
// 全域美化滾動條 (自適應 Webkit、Firefox、古典廟宇雅致風)
// =========================================================================
(function injectCustomScrollbar() {
    const style = document.createElement('style');
    style.id = 'temple-custom-scrollbar';
    style.textContent = `
        /* 1. 現代標準 Firefox 支援 */
        * {
            scrollbar-width: thin;
            scrollbar-color: #b45309 rgba(254, 243, 199, 0.3);
        }

        /* 2. Chrome, Safari, Edge, Webkit 核心瀏覽器美化 */
        ::-webkit-scrollbar {
            width: 6px;              /* 垂直滾動條寬度：纖細精緻 */
            height: 6px;             /* 水平滾動條高度 */
        }

        /* 滾動條軌道底色 (極淡柔和暖杏色) */
        ::-webkit-scrollbar-track {
            background: rgba(254, 243, 199, 0.25);
            border-radius: 9999px;
        }

        /* 滾動滑塊主體 (古樸典雅琥珀色) */
        ::-webkit-scrollbar-thumb {
            background: #d97706;
            border-radius: 9999px;
            border: 1px solid rgba(255, 255, 255, 0.4);
            transition: background-color 0.2s ease;
        }

        /* 滑鼠懸停滑塊時加深 (沉穩琥珀褐) */
        ::-webkit-scrollbar-thumb:hover {
            background: #92400e;
        }

        /* 點選拖曳時 */
        ::-webkit-scrollbar-thumb:active {
            background: #78350f;
        }

        /* 滾動條邊角 (轉折交界處透明處理) */
        ::-webkit-scrollbar-corner {
            background: transparent;
        }

        /* 隱藏滾動條輔助類別 (用於特定橫向選單，如頂部導航列) */
        .no-scrollbar::-webkit-scrollbar {
            display: none;
        }
        .no-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
    `;
    document.head.appendChild(style);
})();

window.addEventListener('DOMContentLoaded', () => {
    document.body.style.backgroundColor = '#FFFDF7';
    renderGlobalNav();
});