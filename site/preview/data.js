// Shared content for the three preview templates.

export const me = {
  zh: '翁祺鈞',
  en: 'Chi-Jiun Wong',
  tagline: 'NCU CSIE × Finance',
  intro:
    '中央大學資訊工程學系、輔系財務金融。國科會大專生研究計畫做的是聯邦學習的可驗證差分隱私；課餘寫量化回測、交易與放貸機器人，也做跑在免費額度上的小工具。',
  rule: '每個數字都來自連結的 repo，旁邊寫著它的限制；團隊專案只寫我負責的部分。',
  motto: '這個世界就是一個巨大的草台班子，所以弄假直到成真。',
  links: [
    { label: 'GitHub', href: 'https://github.com/ChiJiun' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/chijiun-wong-471716336/' },
    { label: 'Linktree', href: 'https://linktr.ee/0311gino' },
  ],
};

export const education = [
  { title: '資訊工程學系 學士 · 輔系 財務金融', org: '國立中央大學', date: '2023.09 – 現在' },
];

export const research = {
  title: '聯邦學習的可驗證差分隱私',
  org: '國科會大專生研究計畫 · 國立中央大學',
  points: [
    '用零知識證明（Halo2 / EZKL）證明每個 client 的模型更新都有正確地裁剪並加上雜訊。',
    '合成資料上，逐次更新的 Halo2 證明 150/150 全數通過驗證。',
    '限制：界內攻擊同樣 300/300 通過。證明只保證更新不越界，不保證它是善意的。',
  ],
  link: { label: 'zk-verifiable-dp-fl', href: 'https://github.com/ChiJiun/zk-verifiable-dp-fl' },
};

const gh = (repo) => `https://github.com/ChiJiun/${repo}`;

export const projects = [
  {
    tag: '黑客松', year: '2026', title: '加密市場分析 AI Agent',
    sub: '2026 雲湧智生：臺灣生成式 AI 應用黑客松 · HOYA BIT 命題',
    desc: '輸入幣種與分析題目，Agent 蒐集多源資料、交叉比對訊號，產出每條判斷都能回溯來源的結構化報告。',
    note: '我負責 agent loop、平行預取、問題路由、15 個資料工具與報告 schema。',
    stack: ['Python', 'LLM Agent', 'AWS'], repo: 'aws-hoyabit', href: gh('aws-hoyabit'),
  },
  {
    tag: '量化回測', year: '2018 – 2026', title: '台指期法人強度＋價格趨勢回測',
    sub: '1,968 個交易日、約 8.1 年，一口 TX',
    desc: 'Sharpe 1.367（買進持有 1.147）、最大回撤 12.72%（買進持有 28.64%）。',
    note: '限制：CAGR 11.94%，低於買進持有的 21.27%；持倉天數較少。',
    stack: ['Python', 'Backtest', 'Bootstrap'], repo: 'tx-flow-trend-backtest', href: gh('tx-flow-trend-backtest'),
  },
  {
    tag: '監測服務', year: '', title: 'mvdis-watch',
    sub: '監理站考照報名餘額監測',
    desc: '掃描全台 36 個監理站 × 10 種照類，共 360 組場次的報名餘額。',
    note: '全部跑在一個 Cloudflare Worker 的免費額度上。',
    stack: ['TypeScript', 'Cloudflare Workers'], repo: 'mvdis-watch', href: gh('mvdis-watch'),
  },
  {
    tag: '教學工具', year: '', title: 'StatsDiscordBot',
    sub: '統計作業回饋 Discord 機器人',
    desc: '約 150 位學生使用，用 LLM 對統計作業給回饋。',
    note: '我負責 bot 核心：登入、HTML 解析、LLM 呼叫、儲存與 Drive 同步。',
    stack: ['Python', 'Discord', 'LLM'], repo: 'StatsDiscordBot', href: gh('StatsDiscordBot'),
  },
  {
    tag: '交易機器人', year: '', title: 'bitfinex-lending-bot',
    sub: 'Bitfinex 放貸機器人',
    desc: '依實際成交分層掛單的資金放貸策略。',
    note: '限制：250 小時內從未觸及 FRR。',
    stack: ['Python'], repo: 'bitfinex-lending-bot', href: gh('bitfinex-lending-bot'),
  },
  {
    tag: 'Web3', year: '開發中', title: 'Verified Human Attention Market',
    sub: '可驗證真人注意力的市場與協定',
    desc: '讓廣告主與 AI agent 出資任務、經驗證的真人完成任務，以 USDC 透明結算。',
    note: '已有 monorepo 與 CampaignManager 合約基線，含 Foundry 單元、fuzz 與 invariant 測試。',
    stack: ['TypeScript', 'Solidity', 'World ID', 'x402'], repo: 'verified-human-attention-market', href: gh('verified-human-attention-market'),
  },
  {
    tag: '自動化', year: '', title: 'Python 自動化作品集',
    sub: '把每天、每月重複的手工作業交給程式',
    desc: 'Excel 自動月報、網站資料爬蟲、LINE 預約機器人，三個都能直接下載執行。',
    note: '各附自動化測試與範例輸出。',
    stack: ['Python', 'LINE Bot', 'Excel'], repo: 'automation-portfolio', href: gh('automation-portfolio'),
  },
  {
    tag: '團隊專案', year: '', title: 'NCU AI Guidance',
    sub: '中央大學選課諮詢平台',
    desc: '以知識圖譜、多信號檢索與多代理人 RAG，服務高中生的科系探索與大學生的選課規劃。',
    note: '我負責部署（Firebase、Render）、Google 登入，以及登入使用者的對話紀錄（PostgreSQL）。',
    stack: ['Python', 'TypeScript', 'Firebase'], repo: 'NCU_AI_Guidance', href: gh('NCU_AI_Guidance'),
  },
];

export const talks = [
  {
    title: '衍生性商品專題 · 四份報告', sub: '金融商品與選擇權實證文獻', date: '2026.10',
    items: [
      '金融商品介紹：FCN 固定配息結構型商品',
      'Cremers & Weinbaum (2010)：買賣權平價偏離與股票報酬可預測性',
      'Xing, Zhang & Zhao (2010)：個股選擇權波動度偏斜與未來報酬',
      'Bali & Hovakimian (2009)：波動度價差與預期股票報酬',
    ],
  },
  { title: '期貨交易的資金管理', sub: '部位大小、停損與風險控制', date: '2026.09', items: [] },
  { title: 'L2 Rollup 入門', sub: '以太坊擴容方案', date: '2026.09', items: [] },
];

export const cats = {
  lang: { label: '程式語言', color: '#7dd3fc' },
  ml: { label: 'ML 與密碼學', color: '#c4a5ff' },
  fin: { label: '金融與量化', color: '#fbbf24' },
  infra: { label: '平台與工具', color: '#6ee7a8' },
};

// One skill per physical letter key (template A); also the skill list for B and C.
export const skills = {
  p: { short: 'Py', name: 'Python', cat: 'lang', desc: '主力語言：回測、機器人、研究原型都用它寫。', repo: 'tx-flow-trend-backtest' },
  t: { short: 'TS', name: 'TypeScript', cat: 'lang', desc: 'Cloudflare Worker 監測服務與 Web3 專案的前後端。', repo: 'mvdis-watch' },
  j: { short: 'Jv', name: 'Java', cat: 'lang', desc: '課程專案與 Spring Boot 後端練習。', repo: '' },
  r: { short: 'Rs', name: 'Rust', cat: 'lang', desc: '研究計畫裡的 Halo2 零知識電路。', repo: 'zk-verifiable-dp-fl' },
  s: { short: 'Sol', name: 'Solidity', cat: 'lang', desc: 'CampaignManager 合約，含 fuzz 與 invariant 測試。', repo: 'verified-human-attention-market' },
  f: { short: 'FL', name: 'Federated Learning', cat: 'ml', desc: '國科會大專生研究計畫的主題。', repo: 'zk-verifiable-dp-fl' },
  d: { short: 'DP', name: 'Differential Privacy', cat: 'ml', desc: '證明每次模型更新都有正確裁剪並加噪。', repo: 'zk-verifiable-dp-fl' },
  h: { short: 'H2', name: 'Halo2', cat: 'ml', desc: '合成資料上 150/150 個逐次更新證明通過驗證。', repo: 'zk-verifiable-dp-fl' },
  e: { short: 'EZ', name: 'EZKL', cat: 'ml', desc: '把模型運算轉成零知識電路的工具鏈。', repo: 'zk-verifiable-dp-fl' },
  z: { short: 'ZK', name: '零知識證明', cat: 'ml', desc: '限制也寫在旁邊：界內攻擊 300/300 一樣會通過。', repo: 'zk-verifiable-dp-fl' },
  l: { short: 'LLM', name: 'LLM Agents', cat: 'ml', desc: '黑客松的加密市場分析 Agent：agent loop 與 15 個資料工具。', repo: 'aws-hoyabit' },
  b: { short: 'BT', name: '回測與績效歸因', cat: 'fin', desc: '台指期 8.1 年回測：Sharpe 1.367，但 CAGR 低於買進持有。', repo: 'tx-flow-trend-backtest' },
  o: { short: 'Opt', name: '選擇權實證', cat: 'fin', desc: '衍生性商品專題：三篇選擇權文獻報告。', repo: '' },
  n: { short: 'FCN', name: '結構型商品', cat: 'fin', desc: '衍生性商品專題：FCN 固定配息結構型商品介紹。', repo: '' },
  m: { short: '$M', name: '期貨資金管理', cat: 'fin', desc: '報告：部位大小、停損與風險控制。', repo: '' },
  w: { short: 'CFW', name: 'Cloudflare Workers', cat: 'infra', desc: '360 組監理站場次，全部跑在一個 Worker 的免費額度上。', repo: 'mvdis-watch' },
  a: { short: 'AWS', name: 'AWS', cat: 'infra', desc: '黑客松 Agent 的部署環境。', repo: 'aws-hoyabit' },
  i: { short: 'Fb', name: 'Firebase', cat: 'infra', desc: '選課諮詢平台的前端部署與 Google 登入。', repo: 'NCU_AI_Guidance' },
  q: { short: 'SQL', name: 'PostgreSQL', cat: 'infra', desc: '選課諮詢平台：登入使用者的對話紀錄。', repo: 'NCU_AI_Guidance' },
  g: { short: 'GHA', name: 'GitHub Actions', cat: 'infra', desc: '這個網站的部署，以及每天重建的 GitHub 活動圖。', repo: 'ChiJiun' },
  y: { short: 'Fdy', name: 'Foundry', cat: 'infra', desc: '智慧合約的單元、fuzz 與 invariant 測試。', repo: 'verified-human-attention-market' },
  x: { short: 'x402', name: 'x402', cat: 'infra', desc: '讓 AI agent 也能出資任務的付款協定。', repo: 'verified-human-attention-market' },
  c: { short: 'Bot', name: 'Discord / LINE Bot', cat: 'infra', desc: '統計作業回饋機器人、LINE 預約機器人。', repo: 'StatsDiscordBot' },
};

export const repoUrl = gh;
