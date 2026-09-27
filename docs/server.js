const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');


const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 在 server.js 頂部確保 body-parser 容量足夠承載圖片與短影音 Base64
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 靜態檔案託管 (提供 public 目錄下的前端頁面)
app.use(express.static(path.join(__dirname, 'public')));

// =========================================================================
// 1. 設定 SQLite 執行資料夾與資料庫路徑：D:\DB\sqlite\temple.db
// =========================================================================
// 使用 path.join 或雙反斜線避免 Windows 轉義字元報錯
const dbDir = path.normalize('DB/sqlite');
const dbPath = path.join(dbDir, 'temple.db');

// 防呆機制：若 D:\DB\sqlite 資料夾尚未建立，自動建立目錄
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`[系統提示] 已自動建立資料庫目錄：${dbDir}`);
}

// 開啟指定目錄下的 SQLite 資料庫檔案
const db = new Database(dbPath);

// 啟用 WAL 模式 (提升讀寫效能) 與啟用外鍵約束
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log(`[系統提示] SQLite 資料庫已成功連接至：${dbPath}`);

// =========================================================================
// 2. 初始化資料表結構 (DDL)
// =========================================================================
db.exec(`
  -- 家戶與戶長主表
  CREATE TABLE IF NOT EXISTS family_household (
    family_code TEXT PRIMARY KEY,
    head_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 信眾家眷人員明細表
  CREATE TABLE IF NOT EXISTS believer_member (
    member_id TEXT PRIMARY KEY,
    family_code TEXT NOT NULL,
    name TEXT NOT NULL,
    relationship TEXT NOT NULL DEFAULT '戶長',
    phone TEXT,
    birthdate TEXT,
    zodiac TEXT,
    id_number TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_code) REFERENCES family_household(family_code) ON DELETE CASCADE
  );

  -- 實體光明燈/太歲燈位表
  CREATE TABLE IF NOT EXISTS lantern_seat (
    seat_code TEXT PRIMARY KEY,
    hall_name TEXT NOT NULL DEFAULT '五公祖師巖',
    seat_label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'AVAILABLE',
    assigned_believer_name TEXT,
    assigned_phone TEXT,
    fee REAL NOT NULL DEFAULT 600.0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 年度法會與活動主檔
  CREATE TABLE IF NOT EXISTS annual_event (
    event_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    hall TEXT NOT NULL DEFAULT '五公祖師巖',
    solar_date TEXT NOT NULL,
    lunar_date TEXT NOT NULL,
    fee REAL NOT NULL DEFAULT 1000.0,
    max_quota INTEGER NOT NULL DEFAULT 300,
    current_quota INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'OPEN',
    description TEXT,
    gallery_json TEXT DEFAULT '[]',
    feedbacks_json TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

-- 完整的建立資料表結構參考：
-- 1. 法會活動主檔表
CREATE TABLE IF NOT EXISTS temple_events (
    id           TEXT PRIMARY KEY,              -- 活動代碼 (如 EVT-2026-001)
    name         TEXT NOT NULL,                 -- 活動名稱
    hall         TEXT DEFAULT '祖師殿',         -- 承辦殿堂
    solar_date   TEXT NOT NULL,                 -- 國曆日期 (YYYY-MM-DD)
    lunar_date   TEXT,                          -- 農曆對照 (如 八月廿一日)
    fee          INTEGER DEFAULT 1200,          -- 每席緣金
    max_quota    INTEGER DEFAULT 300,           -- 席次上限
    status       TEXT DEFAULT 'OPEN',           -- OPEN, PREPARING, COMPLETED
    description  TEXT,                          -- 活動內容說明
    feedbacks    TEXT DEFAULT '[]',             -- JSON 格式存放心得評價與影音
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 信眾法會登記清冊 (含會計收費核銷機制)
CREATE TABLE IF NOT EXISTS event_roster (
    reg_id       TEXT PRIMARY KEY,              -- 流水號 (如 REG-202609-0001)
    event_id     TEXT NOT NULL,                 -- 對應活動代碼
    name         TEXT NOT NULL,                 -- 報名善信
    phone        TEXT NOT NULL,                 -- 聯絡電話
    category     TEXT DEFAULT '闔家祈安消災',   -- 祈福/拔薦類別
    target_name  TEXT,                          -- 疏文上表抬頭
    seats        INTEGER DEFAULT 1,             -- 登記席次
    amount       INTEGER DEFAULT 0,             -- 應繳總額
    offering     TEXT DEFAULT 'DONATE_CHARITY', -- 供品處置: DONATE_CHARITY(代捐), TAKE_AWAY(領回)
    pay_status   TEXT DEFAULT 'PENDING',        -- 收費狀態: PENDING(待核銷), PAID(已入帳)
    receipt_no   TEXT,                          -- 會計收據編號
    verified_by  TEXT,                          -- 核定會計人員姓名
    verified_at  DATETIME,                      -- 核定時間
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(event_id) REFERENCES temple_events(id)
);

  -- 法會信眾報名明細表
  CREATE TABLE IF NOT EXISTS event_registrations (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id       TEXT NOT NULL,                       -- 法會科儀代碼 (如 EVT-2026-CHAO-DU)
    event_name     TEXT NOT NULL,                       -- 法會名稱 (如 丙午年秋季超拔拔薦大法會)
    item_type      TEXT NOT NULL,                       -- 報名項目 (超拔九玄七祖、消災延壽等)
    applicant_name TEXT NOT NULL,                       -- 報名大名 (戶長/善信)
    phone          TEXT NOT NULL,                       -- 聯絡電話
    family_members TEXT,                                -- 同行/安奉眷屬名冊 (JSON 或字串)
    address        TEXT,                                -- 祈福消災疏文祈奏地址
    total_fee      INTEGER DEFAULT 0,                   -- 應繳功德緣金
    pay_status     TEXT DEFAULT 'PENDING',              -- 繳費狀態: PENDING(待核定), PAID(已核銷入帳), CANCELLED(已取消)
    verified_by    TEXT,                                -- 核定之會計執事人員姓名
    verified_at    DATETIME,                            -- 會計核定時間
    receipt_no     TEXT,                                -- 會計核銷時開立之收據字軌編號
    memo           TEXT,                                -- 備註說明
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP   -- 善信登記時間
);

  -- 公庫收支日記帳 (香油收入與費用支出)
  CREATE TABLE IF NOT EXISTS accounting_ledger (
    record_no TEXT PRIMARY KEY,
    entry_type TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    party_name TEXT NOT NULL,
    phone TEXT,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'CASH',
    tax_deductible INTEGER NOT NULL DEFAULT 0,
    id_number TEXT,
    invoice_no TEXT,
    handler TEXT,
    memo TEXT,
    entry_date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
// --- 1. DDL: 在 db.exec 內加入公益派發紀錄表 ---
db.exec(`
  CREATE TABLE IF NOT EXISTS charity_distribution (
    dist_id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    organization_name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    items_summary TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    dist_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DELIVERED',
    receiver_signature TEXT,
    handler TEXT,
    memo TEXT,
    photo_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES annual_event(event_id)
  );
`);

// =========================================================================
// 1. DDL: 增加系統帳號與權限角色表 (sys_user)
// =========================================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS sys_user (
    user_id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    real_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'VOLUNTEER', -- ADMIN, ACCOUNTANT, RITUAL, VOLUNTEER
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);


// 初始化各角色的預設測試帳號 (帳密相同)
const userCount = db.prepare('SELECT COUNT(*) as count FROM sys_user').get().count;
if (userCount === 0) {
    const insertUser = db.prepare(`
    INSERT INTO sys_user (user_id, username, password, real_name, role)
    VALUES (?, ?, ?, ?, ?)
  `);
    const initUsers = db.transaction(() => {
        insertUser.run('U001', 'admin', 'admin123', '主任委員 (陳大德)', 'ADMIN');
        insertUser.run('U002', 'accountant', 'acc123', '會計組長 (林師姐)', 'ACCOUNTANT');
        insertUser.run('U003', 'ritual', 'rit123', '科儀法師 (張道長)', 'RITUAL');
        insertUser.run('U004', 'volunteer', 'vol123', '服務志工 (黃師兄)', 'VOLUNTEER');
    });
    initUsers();
    console.log('[系統提示] 已初始化 4 組不同角色權限之登入帳號。');
}

// 1. DDL: 建立公告欄資料表
db.exec(`
  CREATE TABLE IF NOT EXISTS temple_announcement (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '一般通告', -- 法會通知, 宮務行政, 志工當值, 慈善徵信
    content TEXT NOT NULL,
    is_pinned INTEGER DEFAULT 0, -- 1: 置頂, 0: 一般
    publisher TEXT NOT NULL,
    publish_date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  -- 廟宇執事人員表
  CREATE TABLE IF NOT EXISTS temple_staff (
    staff_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    department TEXT NOT NULL, -- 管理委員會, 總務組, 祭典科儀組, 會計組, 義工志工隊
    title TEXT NOT NULL,      -- 主任委員, 常務監事, 總幹事, 法師, 組長, 志工
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 點燈類別設定表
  CREATE TABLE IF NOT EXISTS lantern_config (
    type_code TEXT PRIMARY KEY, -- 如 T (太歲), L (光明), W (文昌), C (財神)
    type_name TEXT NOT NULL,
    hall_name TEXT NOT NULL,
    default_fee REAL NOT NULL DEFAULT 600.0,
    total_capacity INTEGER NOT NULL DEFAULT 32,
    is_enabled INTEGER DEFAULT 1
  );
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS finance_records (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        tx_no        TEXT UNIQUE,                          -- 傳票/單據字軌 (如 TX-202609-001)
        tx_type      TEXT NOT NULL,                        -- 類型: 'INCOME'(入帳/收入), 'EXPENSE'(支出)
        category     TEXT NOT NULL,                        -- 會計科目 (點燈功德金、法會緣金、油香、修繕支出等)
        amount       INTEGER NOT NULL,                     -- 金額
        payment_method TEXT DEFAULT 'CASH',                -- 支付方式: CASH, TRANSFER, LINEPAY
        source_module  TEXT,                               -- 來源模組: LANTERN, EVENT, CHARITY, MANUAL
        source_ref_id  TEXT,                               -- 關聯編號 (如點燈編號、法會收據編號)
        payer_name   TEXT,                                 -- 繳款信眾 / 經辦人
        receipt_no   TEXT,                                 -- 開立收據字軌
        handled_by   TEXT,                                 -- 經手之會計出納姓名
        memo         TEXT,                                 -- 摘要說明
        tx_date      DATE DEFAULT (date('now', 'localtime')),
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);
// 確保公庫財務收支日記帳表存在
db.exec(`
  CREATE TABLE IF NOT EXISTS finance_ledger (
    record_no TEXT PRIMARY KEY,
    entry_date TEXT NOT NULL,
    entry_type TEXT NOT NULL, -- 'INCOME' 或 'EXPENSE'
    category TEXT NOT NULL,   -- 例如：光明太歲燈緣金, 隨喜香油錢, 金紙香品採購等
    amount REAL NOT NULL DEFAULT 0.0,
    party_name TEXT,          -- 捐獻善信或受款廠商
    phone TEXT,
    title TEXT NOT NULL,      -- 事由摘要
    memo TEXT,                -- 備註（如燈位編號明細）
    payment_method TEXT DEFAULT 'CASH',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// 2. 初始化預設公告
const annCount = db.prepare('SELECT COUNT(*) as count FROM temple_announcement').get().count;
if (annCount === 0) {
    const insertAnn = db.prepare(`
    INSERT INTO temple_announcement (id, title, category, content, is_pinned, publisher, publish_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
    insertAnn.run(
        'ANN-001',
        '五公祖師聖誕祈安植福大法會 籌備事項公告',
        '法會通知',
        '本巖謹訂於農曆八月廿一日啟建聖誕祝壽大法會，即日起各項普品與文疏受理登記，請各執事人員加強宣導並引導善信依序登記。',
        1,
        '主任委員 (陳大德)',
        '2026-09-01'
    );
    insertAnn.run(
        'ANN-002',
        '週末臨櫃服務志工輪值表已更新',
        '志工當值',
        '本週末點燈與添油香信眾眾多，請當值志工提前 15 分鐘至大殿完成系統交班與收據印表機紙卷確認。',
        0,
        '總務組',
        '2026-09-08'
    );
}
// 初始化點燈設定預設值
const configCount = db.prepare('SELECT COUNT(*) as count FROM lantern_config').get().count;
if (configCount === 0) {
    const insertConfig = db.prepare(`
    INSERT INTO lantern_config (type_code, type_name, hall_name, default_fee, total_capacity, is_enabled)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
    insertConfig.run('T', '太歲星君燈', '凌霄寶殿', 600.0, 32, 1);
    insertConfig.run('L', '本命元辰光明燈', '凌霄寶殿', 600.0, 32, 1);
    //insertConfig.run('W', '文昌帝君智慧燈', '文昌殿', 600.0, 32, 1);
    //insertConfig.run('C', '五路財神招財燈', '財神殿', 800.0, 32, 1);
}

// 初始化預設廟務人員
const staffCount = db.prepare('SELECT COUNT(*) as count FROM temple_staff').get().count;
if (staffCount === 0) {
    const insertStaff = db.prepare(`
    INSERT INTO temple_staff (staff_id, name, department, title, phone, memo)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
    insertStaff.run('STF-001', '陳大德', '管理委員會', '主任委員', '0912-345678', '主持廟務行政');
    insertStaff.run('STF-002', '林師姐', '會計組', '會計組長', '0922-111222', '公帳與香油收支審核');
    insertStaff.run('STF-003', '張道長', '祭典科儀組', '科儀法師', '0933-333444', '法事上表與祈福科儀');
    insertStaff.run('STF-004', '黃師兄', '義工志工隊', '服務志工', '0955-666777', '臨櫃值班與信眾導引');
}

// =========================================================================
// 1. DDL: 點燈座位加入年度欄位 (lantern_year)
// =========================================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS lantern_seat (
    seat_code TEXT NOT NULL,
    lantern_year INTEGER NOT NULL DEFAULT 2026,
    hall_name TEXT NOT NULL,
    seat_label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE, LOCKED, OCCUPIED
    assigned_believer_name TEXT,
    phone TEXT,
    fee REAL NOT NULL DEFAULT 600.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (seat_code, lantern_year)
  );
`);

try {
    // 檢查既有資料表的欄位定義
    const tableInfo = db.prepare("PRAGMA table_info(lantern_seat)").all();
    const hasYearCol = tableInfo.some(col => col.name === 'lantern_year');

    if (!hasYearCol) {
        // 若無年度欄位，重建資料表並移轉
        db.exec(`
      ALTER TABLE lantern_seat RENAME TO lantern_seat_old;
      CREATE TABLE lantern_seat (
        seat_code TEXT NOT NULL,
        lantern_year INTEGER NOT NULL DEFAULT 2026,
        hall_name TEXT NOT NULL,
        seat_label TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'AVAILABLE',
        assigned_believer_name TEXT,
        phone TEXT,
        fee REAL NOT NULL DEFAULT 600.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (seat_code, lantern_year)
      );
      INSERT OR IGNORE INTO lantern_seat (seat_code, lantern_year, hall_name, seat_label, status, assigned_believer_name, phone, fee)
      SELECT seat_code, 2026, hall_name, seat_label, status, assigned_believer_name, phone, fee FROM lantern_seat_old;
      DROP TABLE lantern_seat_old;
    `);
    }
} catch (e) {
    // 容錯防呆
}

// 確保舊資料表如果存在，也能擴充 lantern_year 欄位（防報錯）
try {
    db.exec(`ALTER TABLE lantern_seat ADD COLUMN lantern_year INTEGER DEFAULT 2026;`);
} catch (e) { }

// 自動檢查並為 lantern_seat 補足 phone 與 lantern_year 欄位（避免升級時舊資料表欄位缺失）
try {
    db.exec(`ALTER TABLE lantern_seat ADD COLUMN phone TEXT;`);
} catch (e) {
    // 若欄位已存在會跳過，不影響運行
}

try {
    db.exec(`ALTER TABLE lantern_seat ADD COLUMN lantern_year INTEGER DEFAULT 2026;`);
} catch (e) {
    // 若欄位已存在會跳過
}

// =========================================================================
// 1. DDL: 廟宇沿革與大事記資料表
// =========================================================================
db.exec(`
  -- 廟宇基本歷史與宗旨
  CREATE TABLE IF NOT EXISTS temple_history (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subtitle TEXT,
    summary_html TEXT NOT NULL,
    deities_html TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 歷史大事記時光軸
  CREATE TABLE IF NOT EXISTS temple_timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dynasty_era TEXT NOT NULL, -- 如：清道光年間 / 民國六十八年
    solar_year TEXT NOT NULL,   -- 如：1845 / 1979
    event_title TEXT NOT NULL,
    event_content TEXT NOT NULL,
    icon_tag TEXT DEFAULT '🏛️',
    sort_order INTEGER DEFAULT 0
  );
`);

db.exec(`
--1. 系統通用參數設定表(存儲廟宇聯絡資訊及未來擴充參數)
CREATE TABLE IF NOT EXISTS system_settings(
    setting_key   TEXT PRIMARY KEY, --參數鍵名(如 contact_info)
    setting_value TEXT NOT NULL, --參數內容(JSON 格式文字)
    category      TEXT DEFAULT 'GENERAL', --分類代碼(CONTACT, SYSTEM)
    description   TEXT, --備註說明
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP, --最後修改時間
    updated_by    TEXT DEFAULT 'ADMIN'               -- 操作人員
);

--3. 信眾線上諮詢與留言紀錄表(選用)
CREATE TABLE IF NOT EXISTS guest_inquiries(
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL, --善信大名
    phone       TEXT NOT NULL, --聯絡電話
    email       TEXT, --電子信箱
    category    TEXT DEFAULT '一般諮詢', --事項類別
    message     TEXT NOT NULL, --諮詢內容
    status      TEXT DEFAULT 'PENDING', --處理狀態(PENDING 待處理, REPLIED 已回覆)
    reply_note  TEXT, --執事備忘錄
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

// 初始化預設沿革
const historyExists = db.prepare('SELECT COUNT(*) as count FROM temple_history').get().count;
if (historyExists === 0) {
    db.prepare(`
    INSERT INTO temple_history (id, title, subtitle, summary_html, deities_html)
    VALUES (?, ?, ?, ?, ?)
  `).run(
        'MAIN',
        '五公祖師巖 ‧ 百年香火溯源',
        '代代相傳護蒼生 ‧ 慈悲濟世化萬方',
        `本巖肇建於清道光年間，草創之初由先民自福建泉州迎奉五公菩薩香火渡海來台，披荊斬棘，開拓荒蕪。五公菩薩神威顯赫，護佑地方免於瘴癘疾厄，信徒日增。光緒年間鄉民感念神恩，鳩工庀材起建巖宇，名曰「五公祖師巖」。\n歷經百餘載歲月洗禮，廟殿多次重修，既承襲閩南古建築之飛簷木雕美學，亦秉持菩薩濟世宏願，常年推動濟貧救困、發放平安米與文昌祈福，為地方信仰精神樞紐。`,
        `五公祖師又稱五公菩薩，分別為【誌公、朗公、康公、寶公、化公】五位佛道尊神。相傳五公尊神發大悲願，專度世間劫難、療癒疾苦，逢天災疫病則顯化化身施方濟民；護佑闔家平安、消災改厄、延年益壽，尊威廣被。`
    );

  //  // 初始化大事記
  //  const insertTl = db.prepare(`
  //  INSERT INTO temple_timeline (dynasty_era, solar_year, event_title, event_content, icon_tag, sort_order)
  //  VALUES (?, ?, ?, ?, ?, ?)
  //`);
  //  insertTl.run('清道光二十五年', '1845', '先民渡台 ‧ 香火草創', '先民由原鄉迎奉五公祖師神尊金身跨黑水溝安抵本庄，草建竹茅小廬晨昏奉祀。', '⛵', 1);
  //  insertTl.run('清光緒十年', '1884', '顯化退瘟 ‧ 鳩資建廟', '境內突逢厲疫，祖師托夢賜藥草符水除厄，地方士紳感佩神德，集資擇定靈穴啟建大殿。', '🌿', 2);
  //  insertTl.run('民國六十八年', '1979', '殿宇重光 ‧ 凌霄起建', '香火鼎盛舊殿不敷容納，全庄動員擴建三川殿與凌霄寶殿，雕樑畫棟，煥然一新。', '🏛️', 3);
  //  insertTl.run('民國一一三年', '2024', '慈悲濟世 ‧ 慈善功德', '正式立案慈善愛心功德會，法會代捐白米全數轉贈育幼社福單位，深耕社會善念。', '🌾', 4);
  //  insertTl.run('民國一一五年', '2026', '智慧殿堂 ‧ 宮務數位化', '全面啟用智慧定址神位排位、即時公庫收支記帳與信眾數位服務，翻開現代化宮廟新猷。', '💻', 5);
}

// =========================================================================
// 3. 業務 API (信眾、點燈、法會、收支)
// =========================================================================

// 信眾與家戶清單
app.get('/api/households', (req, res) => {
    try {
        const households = db.prepare('SELECT * FROM family_household ORDER BY created_at DESC').all();
        const members = db.prepare('SELECT * FROM believer_member ORDER BY created_at ASC').all();

        const data = households.map(h => ({
            familyCode: h.family_code,
            name: h.head_name,
            phone: h.phone,
            address: h.address,
            members: members
                .filter(m => m.family_code === h.family_code)
                .map(m => ({
                    id: m.member_id,
                    name: m.name,
                    relationship: m.relationship,
                    phone: m.phone,
                    birthdate: m.birthdate,
                    zodiac: m.zodiac,
                    idNumber: m.id_number
                }))
        }));
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 增列同戶眷屬成員
app.post('/api/members', (req, res) => {
    try {
        const { familyCode, name, relationship, phone, birthdate, zodiac, idNumber } = req.body;
        if (!familyCode || !name) {
            return res.status(400).json({ success: false, message: '家戶代號與姓名為必填' });
        }

        const memberId = `M${Date.now().toString().slice(-6)}`;
        db.prepare(`
      INSERT INTO believer_member (member_id, family_code, name, relationship, phone, birthdate, zodiac, id_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(memberId, familyCode, name, relationship || '家眷', phone || null, birthdate || null, zodiac || null, idNumber || null);

        res.json({ success: true, message: '眷屬增列成功', memberId });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 新增家戶
app.post('/api/households', (req, res) => {
    const { familyCode, name, phone, address, birthdate, zodiac, idNumber } = req.body;
    const createTx = db.transaction(() => {
        db.prepare(`
      INSERT INTO family_household (family_code, head_name, phone, address)
      VALUES (?, ?, ?, ?)
    `).run(familyCode, name, phone, address);

        const memberId = `M${Date.now().toString().slice(-6)}`;
        db.prepare(`
      INSERT INTO believer_member (member_id, family_code, name, relationship, phone, birthdate, zodiac, id_number)
      VALUES (?, ?, ?, '戶長', ?, ?, ?, ?)
    `).run(memberId, familyCode, name, phone, birthdate || null, zodiac || null, idNumber || null);
    });

    try {
        createTx();
        res.json({ success: true, message: '家戶建立成功' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 燈位列表
// --- 檢查並初始化太歲燈與光明燈種子資料 ---
const lanternCount = db.prepare('SELECT COUNT(*) as count FROM lantern_seat').get().count;
if (lanternCount === 0) {
    const insertSeat = db.prepare(`
    INSERT INTO lantern_seat (seat_code, hall_name, seat_label, status, assigned_believer_name, fee)
    VALUES (?, ?, ?, ?, ?, 600.0)
  `);
    const initSeats = db.transaction(() => {
        // 1. 初始化 32 盞太歲燈 (T-001 ~ T-032)
        for (let i = 1; i <= 100; i++) {
            const num = i.toString().padStart(3, '0');
            //const isOccupied = (i === 3 || i === 7);
            //const name = i === 3 ? '林大寶' : (i === 7 ? '陳小美' : null);
            insertSeat.run(`T-${num}`, '五公祖師巖', `太歲${num}`, isOccupied ? 'OCCUPIED' : 'AVAILABLE', name);
        }
        // 2. 初始化 32 盞光明燈 (L-001 ~ L-032)
        for (let i = 1; i <= 100; i++) {
            const num = i.toString().padStart(3, '0');
            //const isOccupied = (i === 2 || i === 5);
            //const name = i === 2 ? '張素珍' : (i === 5 ? '王嘉明' : null);
            insertSeat.run(`L-${num}`, '五公祖師巖', `光明${num}`, isOccupied ? 'OCCUPIED' : 'AVAILABLE', name);
        }
    });
    initSeats();
    console.log('[系統提示] 已自動建立太歲燈與光明燈初始燈位。');
}


// --- 燈位 API：確保回傳安奉信眾姓名 ---
// =========================================================================
// 2. 嚴格依年度讀取燈位 API (若該年度不存在則純淨初始化)
// =========================================================================
app.get('/api/lanterns', (req, res) => {
    try {
        const year = Number(req.query.year) || new Date().getFullYear();

        // 1. 檢查該年度在資料庫中是否已有任何燈位紀錄
        const existRow = db.prepare('SELECT COUNT(*) as cnt FROM lantern_seat WHERE lantern_year = ?').get(year);

        // 2. 若該年度完全無紀錄，動態根據啟用的 lantern_config 初始化該年度全新「空燈位」
        if (!existRow || existRow.cnt === 0) {
            const configs = db.prepare('SELECT * FROM lantern_config WHERE is_enabled = 1').all();
            const insertSeat = db.prepare(`
        INSERT INTO lantern_seat (seat_code, lantern_year, hall_name, seat_label, status, assigned_believer_name, phone, fee)
        VALUES (?, ?, ?, ?, 'AVAILABLE', NULL, NULL, ?)
      `);

            const initTx = db.transaction(() => {
                for (const cfg of configs) {
                    for (let i = 1; i <= cfg.total_capacity; i++) {
                        const num = i.toString().padStart(3, '0');
                        insertSeat.run(
                            `${cfg.type_code}-${num}`,
                            year,
                            cfg.hall_name,
                            `${cfg.type_name.slice(0, 2)}${num}`,
                            cfg.default_fee
                        );
                    }
                }
            });
            initTx();
        }

        // 3. 取得【該特定年度】的所有燈位，明確排除其他年份的干擾
        const seats = db.prepare(`
      SELECT seat_code, lantern_year, hall_name, seat_label, status, assigned_believer_name, phone, fee
      FROM lantern_seat
      WHERE lantern_year = ?
      ORDER BY seat_code ASC
    `).all(year);

        res.json({ success: true, year, data: seats });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 取得指定年度的所有燈位（若該年度燈位尚未產生，自動根據 lantern_config 複製產生）
app.get('/api/lanterns', (req, res) => {
    try {
        const year = Number(req.query.year) || new Date().getFullYear();

        // 檢查該年度是否已有燈位
        let count = db.prepare('SELECT COUNT(*) as cnt FROM lantern_seat WHERE lantern_year = ?').get(year).cnt;

        // 若該年度尚無資料，自動依據啟用的 lantern_config 建立該年度空燈牆
        if (count === 0) {
            const configs = db.prepare('SELECT * FROM lantern_config WHERE is_enabled = 1').all();
            const insertSeat = db.prepare(`
        INSERT OR IGNORE INTO lantern_seat (seat_code, lantern_year, hall_name, seat_label, status, fee)
        VALUES (?, ?, ?, ?, 'AVAILABLE', ?)
      `);

            const initTx = db.transaction(() => {
                for (const cfg of configs) {
                    for (let i = 1; i <= cfg.total_capacity; i++) {
                        const num = i.toString().padStart(3, '0');
                        insertSeat.run(`${cfg.type_code}-${num}`, year, cfg.hall_name, `${cfg.type_name.slice(0, 2)}${num}`, cfg.default_fee);
                    }
                }
            });
            initTx();
        }

        const seats = db.prepare(`
      SELECT seat_code, lantern_year, hall_name, seat_label, status, assigned_believer_name, phone, fee
      FROM lantern_seat
      WHERE lantern_year = ?
      ORDER BY seat_code ASC
    `).all(year);

        res.json({ success: true, year, data: seats });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =========================================================================
// 3. 依年度統計各類別狀態 API
// =========================================================================
app.get('/api/lanterns/categories-summary', (req, res) => {
    try {
        const year = Number(req.query.year) || new Date().getFullYear();

        const stats = db.prepare(`
      SELECT 
        c.type_code,
        c.type_name,
        c.hall_name,
        c.default_fee,
        c.total_capacity,
        c.is_enabled,
        COUNT(s.seat_code) AS actual_seats,
        TOTAL(CASE WHEN s.status = 'OCCUPIED' THEN 1 ELSE 0 END) AS occupied_seats
      FROM lantern_config c
      LEFT JOIN lantern_seat s 
        ON s.seat_code LIKE c.type_code || '-%' AND s.lantern_year = ?
      WHERE c.is_enabled = 1
      GROUP BY c.type_code
      ORDER BY c.type_code ASC
    `).all(year);

        res.json({ success: true, year, data: stats });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =========================================================================
// 3. 點燈結帳下單 (支援指定年度寫入與交易鎖定)
// =========================================================================
app.post('/api/lanterns/order', (req, res) => {
    const { seatCodes, believerName, phone, year } = req.body;
    const targetYear = Number(year) || new Date().getFullYear();

    if (!seatCodes || !seatCodes.length || !believerName) {
        return res.status(400).json({ success: false, message: '請指定燈位與安奉善信姓名' });
    }

    const orderTx = db.transaction(() => {
        // 檢查該年度該燈位是否已被佔用
        const checkStmt = db.prepare(`
      SELECT seat_code FROM lantern_seat 
      WHERE lantern_year = ? AND seat_code = ? AND status = 'OCCUPIED'
    `);

        for (const code of seatCodes) {
            const occupied = checkStmt.get(targetYear, code);
            if (occupied) {
                throw new Error(`燈位【${code}】在 ${targetYear} 年度已被安奉！`);
            }
        }

        // 嚴格依照 lantern_year 更新
        const updateStmt = db.prepare(`
      UPDATE lantern_seat 
      SET status = 'OCCUPIED', assigned_believer_name = ?, phone = ?
      WHERE lantern_year = ? AND seat_code = ?
    `);

        for (const code of seatCodes) {
            updateStmt.run(believerName, phone || '', targetYear, code);
        }

        // 寫入公庫日記帳
        const totalAmount = seatCodes.length * 600;
        const recordNo = `REC-${targetYear}-${Date.now().toString().slice(-4)}`;
        const today = new Date().toISOString().split('T')[0];

        db.prepare(`
      INSERT INTO finance_ledger (record_no, entry_date, entry_type, category, amount, party_name, phone, title, memo)
      VALUES (?, ?, 'INCOME', '光明太歲燈緣金', ?, ?, ?, ?, ?)
    `).run(
            recordNo,
            today,
            totalAmount,
            believerName,
            phone || '',
            `辦理 ${targetYear} 年度點燈安奉共 ${seatCodes.length} 盞`,
            `燈位: ${seatCodes.join(', ')}`
        );

        return recordNo;
    });

    try {
        const recordNo = orderTx();
        res.json({ success: true, message: '安奉登記成功', recordNo });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// 1. 取得法會清單（包含已報名份數統計）
// 1. 取得活動列表（統計已報名席次）
app.get('/api/events', (req, res) => {
    try {
        const sql = `
            SELECT 
                e.*,
                COALESCE(SUM(r.seats), 0) as currentQuota
            FROM temple_events e
            LEFT JOIN event_roster r ON e.id = r.event_id AND r.pay_status != 'CANCELLED'
            GROUP BY e.id
            ORDER BY e.solar_date DESC
        `;
        const rows = db.prepare(sql).all();
        const data = rows.map(r => ({
            id: r.id,
            name: r.name,
            hall: r.hall,
            solarDate: r.solar_date,
            lunarDate: r.lunar_date,
            fee: Number(r.fee),
            maxQuota: Number(r.max_quota),
            currentQuota: Number(r.currentQuota),
            status: r.status,
            description: r.description,
            feedbacks: r.feedbacks ? JSON.parse(r.feedbacks) : []
        }));
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, message: '載入活動失敗' });
    }
});

// 2. 建立新活動（權限嚴格限制：ADMIN, RITUAL）
app.post('/api/events', (req, res) => {
    try {
        const { id, name, hall, solarDate, lunarDate, fee, maxQuota, status, description, role } = req.body;
        if (!['ADMIN', 'RITUAL'].includes(role)) {
            return res.status(403).json({ success: false, message: '權限不足！僅限主委與法會科儀組長可規劃新活動。' });
        }
        const stmt = db.prepare(`
            INSERT INTO temple_events (id, name, hall, solar_date, lunar_date, fee, max_quota, status, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(id, name, hall, solarDate, lunarDate, Number(fee), Number(maxQuota), status, description);
        res.json({ success: true, message: '活動發布成功' });
    } catch (e) {
        res.status(500).json({ success: false, message: '建立活動失敗: ' + e.message });
    }
});

// 3. 信眾報名登記（所有角色皆可登記，固定寫入 PENDING）
app.post('/api/events/register', (req, res) => {
    try {
        const { eventId, applicantName, contactPhone, category, targetName, seats, offering } = req.body;

        // 檢查活動是否存在與席次額度
        const evt = db.prepare("SELECT * FROM temple_events WHERE id = ?").get(eventId);
        if (!evt) return res.status(404).json({ success: false, message: '找不到該活動' });

        const quotaRow = db.prepare("SELECT COALESCE(SUM(seats), 0) as used FROM event_roster WHERE event_id = ?").get(eventId);
        if (quotaRow.used + Number(seats) > evt.max_quota) {
            return res.status(400).json({ success: false, message: '登記席次超過本次法會上限！' });
        }

        const regId = `REG-${Date.now().toString().slice(-6)}`;
        const totalAmount = Number(evt.fee) * Number(seats);

        const stmt = db.prepare(`
            INSERT INTO event_roster (reg_id, event_id, name, phone, category, target_name, seats, amount, offering, pay_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `);
        stmt.run(regId, eventId, applicantName, contactPhone, category, targetName, Number(seats), totalAmount, offering);

        res.json({ success: true, message: '報名登記成功！請靜候會計核銷入帳。', regId });
    } catch (e) {
        res.status(500).json({ success: false, message: '報名登記失敗' });
    }
});

app.get('/api/events/:eventId/roster', (req, res) => {
    const { eventId } = req.params;
    console.log(`[Roster API] 正在查詢活動代碼: "${eventId}" 的名冊...`);

    try {
        // 使用 COALESCE 避免欄位為 NULL，並對齊前端欄位名稱
        const sql = `
            SELECT 
                reg_id AS regId,
                event_id AS eventId,
                COALESCE(name, '') AS name,
                COALESCE(phone, '') AS phone,
                COALESCE(category, '闔家祈安消災') AS category,
                COALESCE(target_name, '') AS targetName,
                COALESCE(seats, 1) AS seats,
                COALESCE(amount, 0) AS amount,
                COALESCE(offering, 'DONATE_CHARITY') AS offering,
                COALESCE(pay_status, 'PENDING') AS pay_status,
                COALESCE(receipt_no, '') AS receipt_no
            FROM event_roster 
            WHERE event_id = ?
            ORDER BY created_at DESC
        `;

        const stmt = db.prepare(sql);
        const rows = stmt.all(eventId);

        console.log(`[Roster API] 查詢成功，找到 ${rows.length} 筆資料`);
        res.json({ success: true, data: rows });
    } catch (err) {
        // 關鍵：將實際報錯印出到 Node.js 終端機
        console.error('[Roster API 500 錯誤詳情]:', err.message);
        res.status(500).json({
            success: false,
            message: '資料庫讀取失敗',
            error: err.message
        });
    }
});
// 4. 會計收費核銷（權限嚴格限制：ACCOUNTANT, ADMIN）
app.patch('/api/events/roster/:regId/verify-pay', (req, res) => {
    try {
        const { role, verifiedBy } = req.body;
        if (!['ACCOUNTANT', 'ADMIN'].includes(role)) {
            return res.status(403).json({ success: false, message: '權限不足！收費核定僅限會計出納人員操作。' });
        }

        const receiptNo = `REC-${Date.now().toString().slice(-6)}`;
        const stmt = db.prepare(`
            UPDATE event_roster 
            SET pay_status = 'PAID',
                receipt_no = ?,
                verified_by = ?,
                verified_at = CURRENT_TIMESTAMP
            WHERE reg_id = ? AND pay_status = 'PENDING'
        `);
        const result = stmt.run(receiptNo, verifiedBy || '會計組', req.params.regId);

        if (result.changes === 0) {
            return res.status(400).json({ success: false, message: '該紀錄已收費核銷或查無此筆資料' });
        }
        res.json({ success: true, message: `收費核定成功！開立收據：${receiptNo}` });
    } catch (e) {
        res.status(500).json({ success: false, message: '核定失敗' });
    }
});


// 1. 取得活動列表（統計已報名席次）
app.get('/api/events', (req, res) => {
    try {
        const sql = `
            SELECT 
                e.*,
                COALESCE(SUM(r.seats), 0) as currentQuota
            FROM temple_events e
            LEFT JOIN event_roster r ON e.id = r.event_id AND r.pay_status != 'CANCELLED'
            GROUP BY e.id
            ORDER BY e.solar_date DESC
        `;
        const rows = db.prepare(sql).all();
        const data = rows.map(r => ({
            id: r.id,
            name: r.name,
            hall: r.hall,
            solarDate: r.solar_date,
            lunarDate: r.lunar_date,
            fee: Number(r.fee),
            maxQuota: Number(r.max_quota),
            currentQuota: Number(r.currentQuota),
            status: r.status,
            description: r.description,
            feedbacks: r.feedbacks ? JSON.parse(r.feedbacks) : []
        }));
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, message: '載入活動失敗' });
    }
});

// 2. 建立新活動（權限嚴格限制：ADMIN, RITUAL）
app.post('/api/events', (req, res) => {
    try {
        const { id, name, hall, solarDate, lunarDate, fee, maxQuota, status, description, role } = req.body;
        if (!['ADMIN', 'RITUAL'].includes(role)) {
            return res.status(403).json({ success: false, message: '權限不足！僅限主委與法會科儀組長可規劃新活動。' });
        }
        const stmt = db.prepare(`
            INSERT INTO temple_events (id, name, hall, solar_date, lunar_date, fee, max_quota, status, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(id, name, hall, solarDate, lunarDate, Number(fee), Number(maxQuota), status, description);
        res.json({ success: true, message: '活動發布成功' });
    } catch (e) {
        res.status(500).json({ success: false, message: '建立活動失敗: ' + e.message });
    }
});

// 3. 信眾報名登記（所有角色皆可登記，固定寫入 PENDING）
app.post('/api/events/register', (req, res) => {
    try {
        const { eventId, applicantName, contactPhone, category, targetName, seats, offering } = req.body;

        // 檢查活動是否存在與席次額度
        const evt = db.prepare("SELECT * FROM temple_events WHERE id = ?").get(eventId);
        if (!evt) return res.status(404).json({ success: false, message: '找不到該活動' });

        const quotaRow = db.prepare("SELECT COALESCE(SUM(seats), 0) as used FROM event_roster WHERE event_id = ?").get(eventId);
        if (quotaRow.used + Number(seats) > evt.max_quota) {
            return res.status(400).json({ success: false, message: '登記席次超過本次法會上限！' });
        }

        const regId = `REG-${Date.now().toString().slice(-6)}`;
        const totalAmount = Number(evt.fee) * Number(seats);

        const stmt = db.prepare(`
            INSERT INTO event_roster (reg_id, event_id, name, phone, category, target_name, seats, amount, offering, pay_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
        `);
        stmt.run(regId, eventId, applicantName, contactPhone, category, targetName, Number(seats), totalAmount, offering);

        res.json({ success: true, message: '報名登記成功！請靜候會計核銷入帳。', regId });
    } catch (e) {
        res.status(500).json({ success: false, message: '報名登記失敗' });
    }
});

// 取得指定活動之參加人員名冊 (公開供信眾查閱或管理者審核)
app.get('/api/events/:eventId/roster', (req, res) => {
    try {
        const { eventId } = req.params;

        // 使用 AS 將資料庫的底線欄位對齊前端的駝峰命名
        const sql = `
            SELECT 
                reg_id AS regId,
                event_id AS eventId,
                name,
                phone,
                category,
                target_name AS targetName,
                seats,
                amount,
                offering,
                pay_status,
                receipt_no,
                verified_by,
                created_at
            FROM event_roster 
            WHERE event_id = ?
            ORDER BY created_at DESC
        `;

        const stmt = db.prepare(sql);
        const rows = stmt.all(eventId);

        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('讀取名冊失敗:', err);
        res.status(500).json({ success: false, message: '伺服器讀取名冊異常' });
    }
});


// 4. 會計收費核銷（權限嚴格限制：ACCOUNTANT, ADMIN）
app.patch('/api/events/roster/:regId/verify-pay', (req, res) => {
    try {
        const { role, verifiedBy } = req.body;
        if (!['ACCOUNTANT', 'ADMIN'].includes(role)) {
            return res.status(403).json({ success: false, message: '權限不足！收費核定僅限會計出納人員操作。' });
        }

        const receiptNo = `REC-${Date.now().toString().slice(-6)}`;
        const stmt = db.prepare(`
            UPDATE event_roster 
            SET pay_status = 'PAID',
                receipt_no = ?,
                verified_by = ?,
                verified_at = CURRENT_TIMESTAMP
            WHERE reg_id = ? AND pay_status = 'PENDING'
        `);
        const result = stmt.run(receiptNo, verifiedBy || '會計組', req.params.regId);

        if (result.changes === 0) {
            return res.status(400).json({ success: false, message: '該紀錄已收費核銷或查無此筆資料' });
        }
        res.json({ success: true, message: `收費核定成功！開立收據：${receiptNo}` });
    } catch (e) {
        res.status(500).json({ success: false, message: '核定失敗' });
    }
});

// =========================================================================
// API 2: 取得報名清單 (訪客僅查自己登記或執事查閱全部)
// =========================================================================
app.get('/api/events/registrations', (req, res) => {
    try {
        const { phone } = req.query; // 訪客可透過電話查詢自己的登記
        let stmt;
        if (phone) {
            stmt = db.prepare("SELECT * FROM event_registrations WHERE phone = ? ORDER BY created_at DESC");
            const rows = stmt.all(phone);
            return res.json({ success: true, data: rows });
        } else {
            // 管理端查閱全體
            stmt = db.prepare("SELECT * FROM event_registrations ORDER BY created_at DESC");
            const rows = stmt.all();
            return res.json({ success: true, data: rows });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: '讀取登記失敗' });
    }
});

// =========================================================================
// API 3: 會計核銷繳費入帳 (嚴格限定 ACCOUNTANT / ADMIN)
// =========================================================================
app.patch('/api/events/registrations/:id/verify-pay', (req, res) => {
    try {
        const regId = req.params.id;
        const { verified_by, role, receipt_no } = req.body;

        // 權限檢查：只有會計與管理員能核准
        if (role !== 'ACCOUNTANT' && role !== 'ADMIN') {
            return res.status(403).json({ success: false, message: '權限不足！繳費核定僅限會計執事（ACCOUNTANT）執行。' });
        }

        const stmt = db.prepare(`
            UPDATE event_registrations 
            SET pay_status = 'PAID',
                verified_by = ?,
                verified_at = CURRENT_TIMESTAMP,
                receipt_no = ?
            WHERE id = ? AND pay_status = 'PENDING'
        `);

        const info = stmt.run(
            verified_by || '會計執事',
            receipt_no || `REC-${Date.now().toString().slice(-6)}`,
            regId
        );

        if (info.changes === 0) {
            return res.status(400).json({ success: false, message: '該筆紀錄可能已核准或不存在。' });
        }

        res.json({ success: true, message: `登記編號 #${regId} 繳費核銷成功！收據字軌已開立。` });
    } catch (err) {
        console.error('會計核銷失敗:', err);
        res.status(500).json({ success: false, message: '伺服器核銷異常' });
    }
});

// 公庫收支日記帳
app.get('/api/ledger', (req, res) => {
    try {
        const records = db.prepare('SELECT * FROM accounting_ledger ORDER BY entry_date DESC, created_at DESC').all();
        res.json({ success: true, data: records });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 開立功德款入帳 API
app.post('/api/finance/income', (req, res) => {
    try {
        console.log('[Finance Income] 收到開立功德款請求:', req.body);

        const {
            payerName,       // 繳款信眾大名
            category,        // 功德項目 (點燈功德金、隨喜油香、法會科儀、建廟基金等)
            amount,          // 功德金額
            paymentMethod,   // 支付方式 (CASH, TRANSFER, LINEPAY)
            memo,            // 備註 / 祈福事由
            handledBy,       // 經手會計執事姓名
            txDate           // 入帳日期 (YYYY-MM-DD)
        } = req.body;

        // 必填欄位驗證
        if (!payerName || !amount || Number(amount) <= 0) {
            return res.status(400).json({
                success: false,
                message: '請填寫信眾姓名與正確的功德金額！'
            });
        }

        // 自動生成單據字軌與收據編號
        const timestamp = Date.now().toString();
        const txNo = `TX-${timestamp.slice(-8)}`;
        const receiptNo = `REC-${timestamp.slice(-6)}`;
        const finalDate = txDate || new Date().toISOString().slice(0, 10);

        // 寫入 finance_records 資料表
        const stmt = db.prepare(`
            INSERT INTO finance_records (
                tx_no,
                tx_type,
                category,
                amount,
                payment_method,
                source_module,
                payer_name,
                receipt_no,
                handled_by,
                memo,
                tx_date,
                created_at
            ) VALUES (
                ?, 'INCOME', ?, ?, ?, 'MANUAL', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
            )
        `);

        const result = stmt.run(
            txNo,
            category || '隨喜油香功德金',
            Number(amount),
            paymentMethod || 'CASH',
            payerName,
            receiptNo,
            handledBy || '會計組',
            memo || '',
            finalDate
        );

        console.log(`[Finance Income] 成功寫入 DB，資料列 ID: ${result.lastInsertRowid}，單號: ${txNo}`);

        res.json({
            success: true,
            message: `功德款開立成功！收據字軌：${receiptNo}`,
            data: {
                id: result.lastInsertRowid,
                txNo,
                receiptNo
            }
        });
    } catch (err) {
        console.error('[Finance Income 錯誤]:', err.message);
        res.status(500).json({
            success: false,
            message: '開立失敗，資料庫寫入異常: ' + err.message
        });
    }
});

// =========================================================================
// 登記廟務支出 API (限 ACCOUNTANT / ADMIN)
// =========================================================================
app.post('/api/finance/expense', (req, res) => {
    try {
        console.log('[後端收到廟務支出登記]:', req.body);

        const {
            payeeName,       // 受款人 / 請款廠商 / 經手執事
            category,        // 支出科目 (如 水電瓦斯、祭祀科儀香品金紙、修繕維護)
            amount,          // 支出金額
            paymentMethod,   // 支付方式 (CASH, TRANSFER)
            memo,            // 摘要說明
            txDate,          // 出納日期 (YYYY-MM-DD)
            handledBy        // 經手會計
        } = req.body;

        // 參數檢查
        if (!payeeName || !amount || Number(amount) <= 0) {
            return res.status(400).json({
                success: false,
                message: '請完整填寫受款廠商/經手人，以及大於 0 的支出金額！'
            });
        }

        // 自動生成支出傳票單號 (EXP-時間戳後8碼)
        const timestamp = Date.now().toString();
        const txNo = `EXP-${timestamp.slice(-8)}`;
        const finalDate = txDate || new Date().toISOString().slice(0, 10);

        // 寫入 finance_records (tx_type 固定為 EXPENSE)
        const stmt = db.prepare(`
            INSERT INTO finance_records (
                tx_no,
                tx_type,
                category,
                amount,
                payment_method,
                source_module,
                payer_name,
                handled_by,
                memo,
                tx_date,
                created_at
            ) VALUES (
                ?, 'EXPENSE', ?, ?, ?, 'MANUAL', ?, ?, ?, ?, CURRENT_TIMESTAMP
            )
        `);

        const result = stmt.run(
            txNo,
            category || '常態公務支出',
            Number(amount),
            paymentMethod || 'CASH',
            payeeName.trim(),
            handledBy || '會計組',
            memo ? memo.trim() : '',
            finalDate
        );

        console.log(`[後端] 支出成功寫入 DB，資料 ID: ${result.lastInsertRowid}，傳票: ${txNo}`);

        res.json({
            success: true,
            message: `廟務支出登錄成功！傳票編號：${txNo}`,
            data: {
                id: result.lastInsertRowid,
                txNo
            }
        });
    } catch (err) {
        console.error('[Finance Expense 錯誤]:', err.message);
        res.status(500).json({
            success: false,
            message: '資料庫寫入支出失敗: ' + err.message
        });
    }
});

// =========================================================================
// 取得財務日記帳收支清冊與總計統計 (支援條件動態篩選)
// =========================================================================
app.get('/api/finance/records', (req, res) => {
    try {
        const { txType, category, startDate, endDate } = req.query;

        let conditions = ["1=1"];
        let params = [];

        // 1. 收支類型篩選 (ALL, INCOME, EXPENSE)
        if (txType && txType !== 'ALL') {
            conditions.push("tx_type = ?");
            params.push(txType);
        }

        // 2. 會計科目篩選
        if (category && category !== 'ALL') {
            conditions.push("category = ?");
            params.push(category);
        }

        // 3. 日期起訖區間篩選 (格式 YYYY-MM-DD)
        if (startDate) {
            conditions.push("tx_date >= ?");
            params.push(startDate);
        }
        if (endDate) {
            conditions.push("tx_date <= ?");
            params.push(endDate);
        }

        const whereSql = conditions.join(" AND ");

        // 查詢明細列表 (使用 AS 將資料庫欄位轉換為前端 Vue 駝峰屬性)
        const sql = `
            SELECT 
                id,
                COALESCE(tx_no, '') AS txNo,
                COALESCE(tx_type, 'INCOME') AS txType,
                COALESCE(category, '未分類') AS category,
                COALESCE(amount, 0) AS amount,
                COALESCE(payment_method, 'CASH') AS paymentMethod,
                COALESCE(source_module, 'MANUAL') AS sourceModule,
                COALESCE(payer_name, '無名氏') AS payerName,
                COALESCE(receipt_no, '') AS receiptNo,
                COALESCE(handled_by, '會計組') AS handledBy,
                COALESCE(memo, '') AS memo,
                COALESCE(tx_date, date('now', 'localtime')) AS txDate,
                created_at AS createdAt
            FROM finance_records
            WHERE ${whereSql}
            ORDER BY tx_date DESC, id DESC
        `;

        const records = db.prepare(sql).all(...params);

        // 查詢統計加總 (總入帳、總支出)
        const summarySql = `
            SELECT 
                COALESCE(SUM(CASE WHEN tx_type = 'INCOME' THEN amount ELSE 0 END), 0) AS totalIncome,
                COALESCE(SUM(CASE WHEN tx_type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS totalExpense
            FROM finance_records
            WHERE ${whereSql}
        `;

        const summaryRow = db.prepare(summarySql).get(...params);
        const totalIncome = Number(summaryRow.totalIncome) || 0;
        const totalExpense = Number(summaryRow.totalExpense) || 0;

        res.json({
            success: true,
            data: records,
            summary: {
                totalIncome: totalIncome,
                totalExpense: totalExpense,
                balance: totalIncome - totalExpense
            }
        });
    } catch (err) {
        console.error('[Finance Records API 錯誤]:', err.message);
        res.status(500).json({
            success: false,
            message: '讀取財務資料庫失敗: ' + err.message
        });
    }
});
//// 香油收入開單
//app.post('/api/ledger/income', (req, res) => {
//    try {
//        const { donorName, phone, category, paymentMethod, amount, taxDeductible, idNumber, memo } = req.body;
//        const recordNo = `RCP-${Date.now().toString().slice(-8)}`;
//        const todayStr = new Date().toISOString().split('T')[0];

//        db.prepare(`
//      INSERT INTO accounting_ledger 
//      (record_no, entry_type, category, title, party_name, phone, amount, payment_method, tax_deductible, id_number, memo, entry_date)
//      VALUES (?, 'INCOME', ?, '善信隨喜香油入帳', ?, ?, ?, ?, ?, ?, ?, ?)
//    `).run(recordNo, category, donorName, phone, amount, paymentMethod, taxDeductible ? 1 : 0, idNumber || null, memo || null, todayStr);

//        res.json({ success: true, message: '香油收據開立成功', recordNo });
//    } catch (err) {
//        res.status(500).json({ success: false, message: err.message });
//    }
//});

// 各項費用支出核銷
//app.post('/api/ledger/expense', (req, res) => {
//    try {
//        const { category, title, amount, payee, paymentMethod, invoiceNo, handler, memo } = req.body;
//        const recordNo = `VOU-${Date.now().toString().slice(-8)}`;
//        const todayStr = new Date().toISOString().split('T')[0];

//        db.prepare(`
//      INSERT INTO accounting_ledger 
//      (record_no, entry_type, category, title, party_name, amount, payment_method, invoice_no, handler, memo, entry_date)
//      VALUES (?, 'EXPENSE', ?, ?, ?, ?, ?, ?, ?, ?, ?)
//    `).run(recordNo, category, title, payee || '臨櫃支出', amount, paymentMethod, invoiceNo || null, handler, memo || null, todayStr);

//        res.json({ success: true, message: '支出傳票開立成功', recordNo });
//    } catch (err) {
//        res.status(500).json({ success: false, message: err.message });
//    }
//});

// -------------------------------------------------------------
// 1. 查詢特定法會活動的 Feedback 歷史回饋清單
// -------------------------------------------------------------
app.get('/api/events/:id/feedbacks', (req, res) => {
    try {
        const { id } = req.params;
        const row = db.prepare("SELECT feedbacks_json FROM annual_event WHERE event_id = ?").get(id);
        console.error('event id:', id);
        if (!row) {
            return res.status(404).json({ success: false, message: '查無該活動紀錄' });
        }
        console.error(res.feedbacks_json);
        let list = [];
        try {
            list = row.feedbacks_json ? JSON.parse(row.feedbacks_json) : [];
        } catch (e) {
            list = [];
        }

        res.json({ success: true, data: list });
    } catch (err) {
        console.error('讀取法會回饋失敗:', err);
        res.status(500).json({ success: false, message: '伺服器讀取回饋異常' });
    }
});
// 儲存信眾對活動的回饋 (包含 YouTube 影音與照片)
app.post('/api/events/feedback', (req, res) => {
    try {
        const { eventId, author, rating, comment, youtubeUrl, youtubeId, mediaUrl } = req.body;

        if (!eventId || !author || !comment) {
            return res.status(400).json({ success: false, message: '請填寫完整姓名與回饋內容' });
        }

        const evt = db.prepare('SELECT feedbacks_json FROM annual_event WHERE event_id = ?').get(eventId);
        if (!evt) return res.status(404).json({ success: false, message: '查無此活動' });

        const feedbacks = JSON.parse(evt.feedbacks_json || '[]');
        const todayStr = new Date().toISOString().split('T')[0];

        // 完整寫入所有影音與圖片欄位
        feedbacks.unshift({
            author,
            rating: Number(rating) || 5,
            date: todayStr,
            comment,
            youtubeUrl: youtubeUrl || '',
            youtubeId: youtubeId || '',
            mediaUrl: mediaUrl || ''
        });

        db.prepare('UPDATE annual_event SET feedbacks_json = ? WHERE event_id = ?')
            .run(JSON.stringify(feedbacks), eventId);

        res.json({ success: true, message: '回饋登錄成功' });
    } catch (err) {
        console.error('儲存回饋失敗：', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// 查詢指定活動的已報名信眾名冊
app.get('/api/events/:id/roster', (req, res) => {
    try {
        const eventId = req.params.id;
        const roster = db.prepare(`
      SELECT reg_id, event_id, applicant_name, contact_phone, category, target_name, seats, amount, offering, created_at
      FROM event_registration 
      WHERE event_id = ? 
      ORDER BY created_at DESC
    `).all(eventId);

        const result = roster.map(r => ({
            regId: r.reg_id,
            eventId: r.event_id,
            name: r.applicant_name,
            phone: r.contact_phone,
            category: r.category,
            targetName: r.target_name,
            seats: r.seats,
            amount: r.amount,
            offering: r.offering,
            createdAt: r.created_at
        }));

        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 取消法會報名並退回席次名額
app.delete('/api/events/register/:regId', (req, res) => {
    const { regId } = req.params;
    const cancelTx = db.transaction(() => {
        const reg = db.prepare('SELECT event_id, seats FROM event_registration WHERE reg_id = ?').get(regId);
        if (!reg) throw new Error('查無此筆報名紀錄');

        db.prepare('DELETE FROM event_registration WHERE reg_id = ?').run(regId);
        db.prepare('UPDATE annual_event SET current_quota = MAX(0, current_quota - ?) WHERE event_id = ?')
            .run(reg.seats, reg.event_id);
    });

    try {
        cancelTx();
        res.json({ success: true, message: '已取消該筆報名登記並釋回席次' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// --- 2. API: 取得各活動待派發物資與信眾清單統計 ---

app.get('/api/charity/summary', (req, res) => {
    try {
        // 1. 從 temple_events 與 event_roster 統計各法會信眾登記代捐的總份數 (offering = 'DONATE_CHARITY')
        const eventSummaries = db.prepare(`
            SELECT 
                e.id AS event_id, 
                e.name AS event_name, 
                e.solar_date,
                COALESCE(SUM(r.seats), 0) AS total_donated_seats
            FROM temple_events e
            LEFT JOIN event_roster r 
                ON e.id = r.event_id AND r.offering = 'DONATE_CHARITY' AND r.pay_status != 'CANCELLED'
            GROUP BY e.id
            ORDER BY e.solar_date DESC
        `).all();

        // 2. 從 charity_distribution 統計已轉贈派發的總份數
        let distributedMap = {};
        try {
            const distRows = db.prepare(`
                SELECT event_id, COALESCE(SUM(quantity), 0) AS distributed_total
                FROM charity_distribution
                GROUP BY event_id
            `).all();

            distRows.forEach(row => {
                distributedMap[row.event_id] = Number(row.distributed_total) || 0;
            });
        } catch (e) {
            console.warn('[Charity Summary] charity_distribution 查無派發紀錄');
        }

        // 3. 計算各活動在庫剩餘量
        const result = eventSummaries.map(evt => {
            const total = Number(evt.total_donated_seats || 0);
            const delivered = Number(distributedMap[evt.event_id] || 0);
            return {
                eventId: evt.event_id,
                eventName: evt.event_name,
                solarDate: evt.solar_date,
                totalDonated: total,
                totalDistributed: delivered,
                remainingStock: Math.max(0, total - delivered)
            };
        });

        res.json({ success: true, data: result });
    } catch (err) {
        console.error('[Charity Summary API 錯誤]:', err.message);
        res.status(500).json({ success: false, message: '讀取物資統計失敗: ' + err.message });
    }
});

// 取得特定法會的信眾捐贈人清單
app.get('/api/charity/donors/:eventId', (req, res) => {
    try {
        const donors = db.prepare(`
      SELECT reg_id, applicant_name, contact_phone, target_name, seats, created_at
      FROM event_registration
      WHERE event_id = ? AND offering = 'DONATE_CHARITY'
      ORDER BY created_at DESC
    `).all(req.params.eventId);

        res.json({ success: true, data: donors });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 取得轉贈發放履歷清單
app.get('/api/charity/distributions', (req, res) => {
    try {
        const records = db.prepare(`
      SELECT d.*, e.name AS event_name
      FROM charity_distribution d
      LEFT JOIN annual_event e ON d.event_id = e.event_id
      ORDER BY d.dist_date DESC, d.created_at DESC
    `).all();

        res.json({ success: true, data: records });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 新增物資轉贈受贈團體紀錄
app.post('/api/charity/distribute', (req, res) => {
    try {
        const { eventId, organizationName, contactPerson, phone, itemsSummary, quantity, distDate, handler, memo, photoUrl } = req.body;
        if (!eventId || !organizationName || !quantity || Number(quantity) <= 0) {
            return res.status(400).json({ success: false, message: '請指定法會、受贈機構與正確份數' });
        }

        const distId = `DIS-${Date.now().toString().slice(-8)}`;
        const today = distDate || new Date().toISOString().split('T')[0];

        db.prepare(`
      INSERT INTO charity_distribution 
      (dist_id, event_id, organization_name, contact_person, phone, items_summary, quantity, dist_date, handler, memo, photo_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
            distId,
            eventId,
            organizationName,
            contactPerson || '',
            phone || '',
            itemsSummary || '愛心白米平安物資',
            Number(quantity),
            today,
            handler || '總務慈善組',
            memo || '',
            photoUrl || ''
        );

        res.json({ success: true, message: '轉贈登記成功', distId });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 修改受贈派發記錄
app.put('/api/charity/distribute/:distId', (req, res) => {
    try {
        const { distId } = req.params;
        const { organizationName, contactPerson, phone, itemsSummary, quantity, distDate, handler, memo, photoUrl } = req.body;

        if (!organizationName || !quantity || Number(quantity) <= 0) {
            return res.status(400).json({ success: false, message: '請提供受贈單位與正確份數' });
        }

        const target = db.prepare('SELECT dist_id FROM charity_distribution WHERE dist_id = ?').get(distId);
        if (!target) {
            return res.status(404).json({ success: false, message: '查無此派送記錄' });
        }

        db.prepare(`
      UPDATE charity_distribution 
      SET organization_name = ?,
          contact_person = ?,
          phone = ?,
          items_summary = ?,
          quantity = ?,
          dist_date = ?,
          handler = ?,
          memo = ?,
          photo_url = COALESCE(?, photo_url)
      WHERE dist_id = ?
    `).run(
            organizationName,
            contactPerson || '',
            phone || '',
            itemsSummary || '愛心白米平安物資',
            Number(quantity),
            distDate,
            handler || '總務慈善組',
            memo || '',
            photoUrl !== undefined ? photoUrl : null,
            distId
        );

        res.json({ success: true, message: '派發記錄已成功更新！' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
// 帳密登入
app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: '請輸入帳號與密碼' });
        }

        const user = db.prepare(`
      SELECT user_id, username, password, real_name, role, status 
      FROM sys_user 
      WHERE username = ?
    `).get(username);

        if (!user || user.password !== password) {
            return res.status(401).json({ success: false, message: '帳號或密碼錯誤' });
        }

        if (user.status !== 'ACTIVE') {
            return res.status(403).json({ success: false, message: '帳號已停用' });
        }

        const token = `TPL-TOKEN-${user.user_id}-${Date.now()}`;

        // 確保同時相容駝峰 (realName) 與底線 (real_name)
        res.json({
            success: true,
            message: '登入成功',
            token,
            user: {
                userId: user.user_id,
                username: user.username,
                realName: user.real_name,
                real_name: user.real_name,
                role: user.role
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 3. API: 讀取所有公告 (置頂優先，依發布日期降序)
app.get('/api/announcements', (req, res) => {
    try {
        const list = db.prepare(`
      SELECT * FROM temple_announcement 
      ORDER BY is_pinned DESC, publish_date DESC, created_at DESC
    `).all();
        res.json({ success: true, data: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 4. API: 新增公告
app.post('/api/announcements', (req, res) => {
    try {
        const { title, category, content, isPinned, publisher } = req.body;
        if (!title || !content) {
            return res.status(400).json({ success: false, message: '請填寫公告標題與內容' });
        }
        const id = `ANN-${Date.now().toString().slice(-6)}`;
        const today = new Date().toISOString().split('T')[0];

        db.prepare(`
      INSERT INTO temple_announcement (id, title, category, content, is_pinned, publisher, publish_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, category || '一般通告', content, isPinned ? 1 : 0, publisher || '執事會', today);

        res.json({ success: true, message: '公告發布成功', id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 5. API: 刪除公告
app.delete('/api/announcements/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM temple_announcement WHERE id = ?').run(req.params.id);
        res.json({ success: true, message: '公告已刪除' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// =========================================================================
// 2. 系統設定 API 路由
// =========================================================================

// --- [A] 點燈類別與燈位數量維護 ---
app.get('/api/settings/lantern-configs', (req, res) => {
    try {
        const list = db.prepare(`
      SELECT 
        c.*, 
        (SELECT COUNT(*) FROM lantern_seat s WHERE s.seat_code LIKE c.type_code || '-%') as actual_seats,
        (SELECT COUNT(*) FROM lantern_seat s WHERE s.seat_code LIKE c.type_code || '-%' AND s.status = 'OCCUPIED') as occupied_seats
      FROM lantern_config c
    `).all();
        res.json({ success: true, data: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/settings/lantern-configs', (req, res) => {
    try {
        const { typeCode, typeName, hallName, defaultFee, totalCapacity, isEnabled } = req.body;
        if (!typeCode || !typeName || !totalCapacity) {
            return res.status(400).json({ success: false, message: '類別代碼、名稱與數量為必填' });
        }

        const code = typeCode.toUpperCase().trim();
        const capacity = Number(totalCapacity);
        const fee = Number(defaultFee) || 600;

        const tx = db.transaction(() => {
            // 1. 寫入或更新設定檔
            db.prepare(`
        INSERT INTO lantern_config (type_code, type_name, hall_name, default_fee, total_capacity, is_enabled)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(type_code) DO UPDATE SET
          type_name = excluded.type_name,
          hall_name = excluded.hall_name,
          default_fee = excluded.default_fee,
          total_capacity = excluded.total_capacity,
          is_enabled = excluded.is_enabled
      `).run(code, typeName, hallName || '凌霄寶殿', fee, capacity, isEnabled ? 1 : 0);

            // 2. 動態檢查並補足燈位資料表中的燈位數量
            const currentCount = db.prepare(`SELECT COUNT(*) as count FROM lantern_seat WHERE seat_code LIKE ?`).get(`${code}-%`).count;
            if (capacity > currentCount) {
                const insertSeat = db.prepare(`
          INSERT OR IGNORE INTO lantern_seat (seat_code, hall_name, seat_label, status, fee)
          VALUES (?, ?, ?, 'AVAILABLE', ?)
        `);
                for (let i = currentCount + 1; i <= capacity; i++) {
                    const num = i.toString().padStart(3, '0');
                    insertSeat.run(`${code}-${num}`, hallName || '凌霄寶殿', `${typeName.slice(0, 2)}${num}`, fee);
                }
            }
        });

        tx();
        res.json({ success: true, message: '點燈規格與燈位矩陣更新成功' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- [B] 廟宇人員與執事角色維護 ---
app.get('/api/settings/staff', (req, res) => {
    try {
        const list = db.prepare('SELECT * FROM temple_staff ORDER BY created_at ASC').all();
        res.json({ success: true, data: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/settings/staff', (req, res) => {
    try {
        const { name, department, title, phone, memo } = req.body;
        if (!name || !department || !title) {
            return res.status(400).json({ success: false, message: '請填寫人員大名、組別與職稱' });
        }
        const staffId = `STF-${Date.now().toString().slice(-4)}`;
        db.prepare(`
      INSERT INTO temple_staff (staff_id, name, department, title, phone, memo)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(staffId, name, department, title, phone || '', memo || '');
        res.json({ success: true, message: '廟務人員新增成功', staffId });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/settings/staff/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM temple_staff WHERE staff_id = ?').run(req.params.id);
        res.json({ success: true, message: '人員資料已移除' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- [C] 系統帳號與權限角色表維護 (sys_user) ---
app.get('/api/settings/users', (req, res) => {
    try {
        const users = db.prepare(`
      SELECT user_id, username, real_name, role, status, created_at 
      FROM sys_user 
      ORDER BY created_at ASC
    `).all();
        res.json({ success: true, data: users });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/settings/users', (req, res) => {
    try {
        const { username, password, realName, role } = req.body;
        if (!username || !password || !realName || !role) {
            return res.status(400).json({ success: false, message: '帳號、密碼、姓名與身分權限為必填' });
        }

        const userId = `U${Date.now().toString().slice(-4)}`;
        db.prepare(`
      INSERT INTO sys_user (user_id, username, password, real_name, role, status)
      VALUES (?, ?, ?, ?, ?, 'ACTIVE')
    `).run(userId, username.trim(), password, realName.trim(), role);

        res.json({ success: true, message: '系統使用者帳號建立成功' });
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ success: false, message: '此使用者帳號已被使用，請更換' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

// 變更帳號狀態 (啟用/停用) 或 重設密碼
app.patch('/api/settings/users/:userId', (req, res) => {
    try {
        const { status, password, role } = req.body;
        const { userId } = req.params;

        if (status) {
            db.prepare('UPDATE sys_user SET status = ? WHERE user_id = ?').run(status, userId);
        }
        if (password) {
            db.prepare('UPDATE sys_user SET password = ? WHERE user_id = ?').run(password, userId);
        }
        if (role) {
            db.prepare('UPDATE sys_user SET role = ? WHERE user_id = ?').run(role, userId);
        }

        res.json({ success: true, message: '帳號資訊已成功更新' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 取得特定年度各點燈類別的安奉統計狀況
app.get('/api/lanterns/categories-summary', (req, res) => {
    try {
        const year = Number(req.query.year) || new Date().getFullYear();

        // 依指定年度統計各類別的總燈位數與已安奉數
        const stats = db.prepare(`
      SELECT 
        c.type_code,
        c.type_name,
        c.hall_name,
        c.default_fee,
        c.total_capacity,
        c.is_enabled,
        COUNT(s.seat_code) AS actual_seats,
        TOTAL(CASE WHEN s.status = 'OCCUPIED' THEN 1 ELSE 0 END) AS occupied_seats
      FROM lantern_config c
      LEFT JOIN lantern_seat s 
        ON s.seat_code LIKE c.type_code || '-%' AND s.lantern_year = ?
      WHERE c.is_enabled = 1
      GROUP BY c.type_code
      ORDER BY c.type_code ASC
    `).all(year);

        res.json({ success: true, year, data: stats });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 自動修復 lantern_seat 表結構：升級為 (seat_code, lantern_year) 複合主鍵
try {
    const tableInfo = db.prepare("PRAGMA table_info(lantern_seat)").all();
    // 檢查是否有設 lantern_year 為主鍵的一部分 (pk > 0)
    const yearPk = tableInfo.find(col => col.name === 'lantern_year' && col.pk > 0);

    if (!yearPk) {
        console.log('[資料庫維護] 偵測到 lantern_seat 尚未設定年度複合主鍵，正在進行自動升級遷移...');
        db.exec(`
      -- 1. 建立新結構暫存表
      CREATE TABLE IF NOT EXISTS lantern_seat_new (
        seat_code TEXT NOT NULL,
        lantern_year INTEGER NOT NULL DEFAULT 2026,
        hall_name TEXT NOT NULL,
        seat_label TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'AVAILABLE',
        assigned_believer_name TEXT,
        phone TEXT,
        fee REAL NOT NULL DEFAULT 600.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (seat_code, lantern_year)
      );

      -- 2. 搬移既有資料（若舊資料無 lantern_year 則預設補 2026）
      INSERT OR IGNORE INTO lantern_seat_new 
        (seat_code, lantern_year, hall_name, seat_label, status, assigned_believer_name, phone, fee)
      SELECT 
        seat_code, 
        COALESCE(lantern_year, 2026), 
        hall_name, 
        seat_label, 
        status, 
        assigned_believer_name, 
        phone, 
        fee 
      FROM lantern_seat;

      -- 3. 替換舊表
      DROP TABLE lantern_seat;
      ALTER TABLE lantern_seat_new RENAME TO lantern_seat;
    `);
        console.log('[資料庫維護] lantern_seat 複合主鍵升級完成！');
    }
} catch (err) {
    console.error('[資料庫維護] 遷移升級失敗：', err.message);
}
// 一鍵依指定年度，為所有啟用的點燈類別建立完整燈位資料
app.post('/api/settings/lantern-configs/generate-year', (req, res) => {
    try {
        const { year, overwrite } = req.body;
        const targetYear = parseInt(year, 10);

        if (!targetYear || targetYear < 2000 || targetYear > 2100) {
            return res.status(400).json({ success: false, message: '請提供有效的民國/西元年度' });
        }

        // 1. 確保 lantern_seat 包含 lantern_year 且為正確結構
        try {
            db.exec(`ALTER TABLE lantern_seat ADD COLUMN lantern_year INTEGER DEFAULT 2026;`);
        } catch (e) { }

        // 2. 取得所有啟用的點燈類別規格
        const activeConfigs = db.prepare('SELECT * FROM lantern_config WHERE is_enabled = 1').all();
        if (!activeConfigs || activeConfigs.length === 0) {
            return res.status(400).json({ success: false, message: '目前無任何啟用的點燈類別規格，請先建立或啟用規格！' });
        }

        // 3. 檢查該年度既有燈位數
        const existCount = db.prepare('SELECT COUNT(*) as cnt FROM lantern_seat WHERE lantern_year = ?').get(targetYear).cnt;
        if (existCount > 0 && !overwrite) {
            return res.status(409).json({
                success: false,
                alreadyExists: true,
                message: `${targetYear} 年度目前已有 ${existCount} 筆燈位紀錄。若要補齊缺漏或重新重置，請點選確認進行補齊。`
            });
        }

        let generatedTotal = 0;

        // 4. 使用交易批量插入
        const batchTx = db.transaction(() => {
            // 預備檢查與插入語法
            const checkExist = db.prepare(`
        SELECT COUNT(*) as cnt FROM lantern_seat 
        WHERE seat_code = ? AND lantern_year = ?
      `);

            const insertSeat = db.prepare(`
        INSERT INTO lantern_seat 
        (seat_code, lantern_year, hall_name, seat_label, status, fee)
        VALUES (?, ?, ?, ?, 'AVAILABLE', ?)
      `);

            for (const cfg of activeConfigs) {
                const capacity = Number(cfg.total_capacity) || 32;
                const fee = Number(cfg.default_fee) || 600;

                for (let i = 1; i <= capacity; i++) {
                    const num = i.toString().padStart(3, '0');
                    const seatCode = `${cfg.type_code}-${num}`;
                    const seatLabel = `${cfg.type_name.slice(0, 2)}${num}`;

                    // 先檢查該年度是否存在此代碼
                    const exists = checkExist.get(seatCode, targetYear).cnt > 0;
                    if (!exists) {
                        insertSeat.run(seatCode, targetYear, cfg.hall_name, seatLabel, fee);
                        generatedTotal++;
                    }
                }
            }
        });

        batchTx();

        console.log(`[點燈年度初始化] 已為 ${targetYear} 年度成功產生/補齊 ${generatedTotal} 盞燈位。`);

        res.json({
            success: true,
            message: `【${targetYear} 年度】燈位矩陣建立完成！共新增/補齊 ${generatedTotal} 盞燈位。`,
            generatedTotal
        });
    } catch (err) {
        console.error('批次產生燈位失敗：', err);
        res.status(500).json({ success: false, message: `建立失敗：${err.message}` });
    }
});

// =========================================================================
// 2. 廟宇沿革 API 路由
// =========================================================================

// 取得沿革總體資訊 (包含基本文案與時光軸)
app.get('/api/history', (req, res) => {
    try {
        const main = db.prepare('SELECT * FROM temple_history WHERE id = ?').get('MAIN') || {};
        const timeline = db.prepare('SELECT * FROM temple_timeline ORDER BY sort_order ASC, solar_year ASC').all();
        res.json({ success: true, data: { ...main, timeline } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 維護沿革主內文 (後台)
app.post('/api/history/main', (req, res) => {
    try {
        const { title, subtitle, summaryHtml, deitiesHtml } = req.body;
        db.prepare(`
      INSERT INTO temple_history (id, title, subtitle, summary_html, deities_html, updated_at)
      VALUES ('MAIN', ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        subtitle = excluded.subtitle,
        summary_html = excluded.summary_html,
        deities_html = excluded.deities_html,
        updated_at = CURRENT_TIMESTAMP
    `).run(title, subtitle, summaryHtml, deitiesHtml);

        res.json({ success: true, message: '廟宇沿革主文更新成功！' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 新增/修改大事記里程碑
app.post('/api/history/timeline', (req, res) => {
    try {
        const { id, dynastyEra, solarYear, eventTitle, eventContent, iconTag, sortOrder } = req.body;
        if (!eventTitle || !solarYear) {
            return res.status(400).json({ success: false, message: '請填寫年份與事蹟標題' });
        }

        if (id) {
            db.prepare(`
        UPDATE temple_timeline 
        SET dynasty_era = ?, solar_year = ?, event_title = ?, event_content = ?, icon_tag = ?, sort_order = ?
        WHERE id = ?
      `).run(dynastyEra || '', solarYear, eventTitle, eventContent || '', iconTag || '🏛️', Number(sortOrder) || 0, id);
        } else {
            db.prepare(`
        INSERT INTO temple_timeline (dynasty_era, solar_year, event_title, event_content, icon_tag, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(dynastyEra || '', solarYear, eventTitle, eventContent || '', iconTag || '🏛️', Number(sortOrder) || 0);
        }

        res.json({ success: true, message: '歷史大事記儲存成功！' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 刪除大事記
app.delete('/api/history/timeline/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM temple_timeline WHERE id = ?').run(req.params.id);
        res.json({ success: true, message: '里程碑已刪除' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});



// -------------------------------------------------------------
// API 1: 取得廟宇聯絡資訊 (開放所有信眾、訪客與執事讀取)
// -------------------------------------------------------------
// 取得廟宇聯絡資訊 API
app.get('/api/settings/contact', (req, res) => {
    try {
        const stmt = db.prepare("SELECT setting_value FROM system_settings WHERE setting_key = ?");
        const row = stmt.get('contact_info');

        if (!row || !row.setting_value) {
            return res.json({ success: true, data: null });
        }

        // 關鍵：若在 SQLite 存的是字串，此處務必 parse 成物件
        let parsedData = {};
        try {
            parsedData = typeof row.setting_value === 'string'
                ? JSON.parse(row.setting_value)
                : row.setting_value;
        } catch (e) {
            console.error('JSON 解析失敗:', e);
            parsedData = null;
        }

        res.json({ success: true, data: parsedData });
    } catch (err) {
        console.error('SQLite 讀取錯誤:', err);
        res.status(500).json({ success: false, message: '資料庫讀取異常' });
    }
});


// -------------------------------------------------------------
// API 2: 更新廟宇聯絡資訊 (限 ADMIN 權限)
// -------------------------------------------------------------
app.post('/api/settings/contact', (req, res) => {
    try {
        const contactData = req.body;
        const jsonString = JSON.stringify(contactData);

        // 使用 SQLite 的 INSERT OR REPLACE 達成 Upsert (更新或插入)
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO system_settings (setting_key, setting_value, category, description, updated_at)
            VALUES (?, ?, 'CONTACT', '廟宇公開聯絡資訊與參香指引', CURRENT_TIMESTAMP)
        `);

        stmt.run('contact_info', jsonString);

        res.json({ success: true, message: '廟宇聯絡資訊已成功寫入 SQLite！' });
    } catch (err) {
        console.error('寫入 SQLite 聯絡資訊失敗:', err);
        res.status(500).json({ success: false, message: '資料庫儲存失敗' });
    }
});

// -------------------------------------------------------------
// API 3: 善信線上留言存檔 (接收 contact.html 表單提交)
// -------------------------------------------------------------
app.post('/api/inquiries', (req, res) => {
    try {
        const { name, phone, email, category, message } = req.body;
        if (!name || !phone || !message) {
            return res.status(400).json({ success: false, message: '請完整填寫必填欄位' });
        }

        const stmt = db.prepare(`
            INSERT INTO guest_inquiries (name, phone, email, category, message)
            VALUES (?, ?, ?, ?, ?)
        `);

        stmt.run(name, phone, email || '', category || '一般諮詢', message);

        res.json({ success: true, message: '諮詢表單已成功送出' });
    } catch (err) {
        console.error('寫入善信留言失敗:', err);
        res.status(500).json({ success: false, message: '伺服器處理失敗' });
    }
});

// 取得五公聖紀與相簿資料（公開/後台共用）
app.get('/api/settings/deities', (req, res) => {
    try {
        const stmt = db.prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'deities_info'");
        const row = stmt.get();
        if (row && row.setting_value) {
            //console.log('[系統提示] Get Deities_info data。');
            const data = JSON.parse(row.setting_value);
            //console.log(row.setting_value);
            return res.json({ success: true, data });
        }
        res.json({ success: true, data: [] });
    } catch (err) {
        console.error('讀取神明聖紀失敗:', err);
        res.status(500).json({ success: false, message: '資料庫讀取異常' });
    }
});

// 更新五公聖紀與相簿資料（限 ADMIN 權限）
app.post('/api/settings/deities', (req, res) => {
    try {
        const deitiesData = req.body; // 陣列結構
        const jsonString = JSON.stringify(deitiesData);

        const stmt = db.prepare(`
            INSERT OR REPLACE INTO system_settings (setting_key, setting_value, category, description, updated_at)
            VALUES ('deities_info', ?, 'HISTORY', '五公祖師聖紀與照片資料庫', CURRENT_TIMESTAMP)
        `);
        stmt.run(jsonString);

        res.json({ success: true, message: '五尊神明聖紀與相片資料已成功儲存！' });
    } catch (err) {
        console.error('儲存神明聖紀失敗:', err);
        res.status(500).json({ success: false, message: '資料庫寫入失敗' });
    }
});

//1. 取得善語錄清單
app.get('/api/settings/quotes', (req, res) => {
    try {
        const stmt = db.prepare("SELECT setting_value FROM system_settings WHERE setting_key = ?");
        const row = stmt.get('wisdom_quotes');

        if (row && row.setting_value) {
            let data = [];
            try {
                data = typeof row.setting_value === 'string'
                    ? JSON.parse(row.setting_value)
                    : row.setting_value;
            } catch (e) {
                console.error('JSON 解析 quotes 失敗:', e);
                data = [];
            }
            return res.json({ success: true, data });
        }
        res.json({ success: true, data: [] });
    } catch (err) {
        console.error('讀取 quotes 失敗:', err);
        res.status(500).json({ success: false, message: '資料庫讀取異常' });
    }
});

// 2. 儲存善語錄清單 (關鍵寫入)
app.post('/api/settings/quotes', (req, res) => {
    try {
        const quotesData = req.body; // 前端傳過來的陣列

        if (!quotesData) {
            return res.status(400).json({ success: false, message: '請求內容不能為空' });
        }

        const jsonString = JSON.stringify(quotesData);

        // 使用 SQLite 的 INSERT OR REPLACE 達成 Upsert
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO system_settings (setting_key, setting_value, category, description, updated_at)
            VALUES (?, ?, 'CULTURE', '五公祖師善語錄清冊', CURRENT_TIMESTAMP)
        `);
        stmt.run('wisdom_quotes', jsonString);

        console.log('善語錄已成功寫入 SQLite system_settings 表！');
        res.json({ success: true, message: '善語錄內容已成功儲存！' });
    } catch (err) {
        console.error('儲存 quotes 失敗:', err);
        res.status(500).json({ success: false, message: '資料庫寫入失敗: ' + err.message });
    }
});

// =========================================================================
// 信眾快速查詢 API (對應 believer_member 與 family_household)
// =========================================================================
app.get('/api/believers/search', (req, res) => {
    try {
        const keyword = (req.query.q || '').trim();
        console.log('[信眾查詢 API] 收到關鍵字:', keyword);

        if (!keyword) {
            return res.json({ success: true, data: [] });
        }

        const param = `%${keyword}%`;

        // 連繫 believer_member 與 family_household
        // 支援透過：信眾姓名(name)、電話(phone)、身分證字號(id_number) 搜尋
        const sql = `
            SELECT 
                bm.member_id AS id,
                bm.name,
                COALESCE(bm.phone, '') AS phone,
                bm.relationship,
                bm.zodiac,
                bm.family_code AS familyCode,
                COALESCE(fh.address, '') AS address
            FROM believer_member bm
            LEFT JOIN family_household fh ON bm.family_code = fh.family_code
            WHERE bm.name LIKE ? OR bm.phone LIKE ? OR bm.id_number LIKE ?
            ORDER BY bm.created_at DESC
            LIMIT 10
        `;

        const believers = db.prepare(sql).all(param, param, param);
        console.log(`[信眾查詢 API] 查詢成功，共回傳 ${believers.length} 筆`);

        res.json({
            success: true,
            data: believers
        });

    } catch (err) {
        console.error('❌ [信眾查詢 SQL Error]:', err.message);
        res.status(500).json({
            success: false,
            message: '資料庫查詢失敗: ' + err.message
        });
    }
});

// 1. 建立並指定儲存目錄：執行目錄下的 images/Kind
const uploadKindDir = path.join(__dirname,'public', 'images', 'Kind');
if (!fs.existsSync(uploadKindDir)) {
    fs.mkdirSync(uploadKindDir, { recursive: true });
    console.log(`[系統提示] 已建立善語錄媒體目錄：${uploadKindDir}`);
}

// 2. 開放 images 目錄的靜態存取，讓前端可以直接透過 /images/... 讀取檔案
app.use('/public/images', express.static(path.join(__dirname, 'public/images')));


// 3. 原生上傳路由
app.post('/api/upload/kind-media', (req, res) => {
    try {
        const { fileName, fileBase64 } = req.body;
        if (!fileName || !fileBase64) {
            return res.status(400).json({ success: false, message: '未接收到檔案內容' });
        }

        // 解析副檔名與生成安全檔名
        const ext = path.extname(fileName).toLowerCase() || '.jpg';
        const uniqueName = `KIND-${Date.now()}-${Math.round(Math.random() * 1E4)}${ext}`;
        const targetPath = path.join(uploadKindDir, uniqueName);

        // 去除 Base64 前綴 (例如: "data:image/jpeg;base64," 或 "data:video/mp4;base64,")
        const base64Data = fileBase64.replace(/^data:.*?;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        // 寫入實體檔案到 images/Kind/
        fs.writeFileSync(targetPath, buffer);

        console.log(`[善語錄媒體上傳] 檔案已成功儲存：${targetPath}`);

        res.json({
            success: true,
            message: '媒體檔案上傳成功',
            fileUrl: `/public/images/Kind/${uniqueName}`
        });
    } catch (err) {
        console.error('[善語錄上傳錯誤]:', err.message);
        res.status(500).json({ success: false, message: '儲存失敗: ' + err.message });
    }
});

// -------------------------------------------------------------
// API 4: 取得信眾線上諮詢清單 (支援狀態與關鍵字篩選)
// -------------------------------------------------------------
app.get('/api/inquiries', (req, res) => {
    try {
        const { status, keyword } = req.query;
        let conditions = ["1=1"];
        let params = [];

        if (status && status !== 'ALL') {
            conditions.push("status = ?");
            params.push(status);
        }

        if (keyword && keyword.trim()) {
            conditions.push("(name LIKE ? OR phone LIKE ? OR message LIKE ?)");
            const kw = `%${keyword.trim()}%`;
            params.push(kw, kw, kw);
        }

        const sql = `
            SELECT 
                id,
                name,
                phone,
                COALESCE(email, '') AS email,
                category,
                message,
                status,
                COALESCE(reply_note, '') AS reply_note,
                created_at
            FROM guest_inquiries
            WHERE ${conditions.join(" AND ")}
            ORDER BY CASE WHEN status = 'PENDING' THEN 0 ELSE 1 END, created_at DESC
        `;

        const list = db.prepare(sql).all(...params);
        res.json({ success: true, data: list });
    } catch (err) {
        console.error('讀取諮詢清單失敗:', err);
        res.status(500).json({ success: false, message: '伺服器讀取異常' });
    }
});

// -------------------------------------------------------------
// API 5: 執事回覆與更新諮詢處理狀態
// -------------------------------------------------------------
app.patch('/api/inquiries/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { status, replyNote } = req.body;

        const stmt = db.prepare(`
            UPDATE guest_inquiries
            SET status = COALESCE(?, status),
                reply_note = COALESCE(?, reply_note)
            WHERE id = ?
        `);

        const result = stmt.run(status, replyNote, id);

        if (result.changes === 0) {
            return res.status(404).json({ success: false, message: '查無該筆諮詢紀錄' });
        }

        res.json({ success: true, message: '諮詢紀錄已成功更新！' });
    } catch (err) {
        console.error('更新諮詢狀態失敗:', err);
        res.status(500).json({ success: false, message: '伺服器更新失敗' });
    }
});

// =========================================================================
// 信眾端：依電話查詢個人諮詢與回覆進度 (公開端點)
// =========================================================================
app.get('/api/inquiries/my', (req, res) => {
    try {
        const phone = (req.query.phone || '').trim();
        if (!phone) {
            return res.status(400).json({ success: false, message: '請提供聯絡電話以供查詢' });
        }

        const sql = `
            SELECT 
                id,
                name,
                category,
                message,
                status,
                COALESCE(reply_note, '') AS reply_note,
                created_at
            FROM guest_inquiries
            WHERE phone = ?
            ORDER BY created_at DESC
        `;

        const rows = db.prepare(sql).all(phone);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('[Inquiries My API 錯誤]:', err.message);
        res.status(500).json({ success: false, message: '伺服器讀取留言失敗: ' + err.message });
    }
});
// 啟動伺服器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`五公祖師巖伺服器啟動於：http://localhost:${PORT}`);
    console.log(`資料庫檔案實體路徑：${dbPath}`);
    console.log(`=================================================`);
});
