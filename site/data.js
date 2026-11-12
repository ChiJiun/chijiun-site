// Site content. Edit this file to change what the page says.

const gh = (repo) => `https://github.com/ChiJiun/${repo}`;
export const repoUrl = gh;

export const me = {
  zh: '翁祺鈞',
  en: 'Chi-Jiun Wong',
  tagline: 'NCU CSIE × Finance',
  intro:
    '中央大學資訊工程學系、輔修財務金融，預計 2027 年畢業。研究做的是聯邦學習裡差分隱私的零知識證明，目前在國泰金控區塊鏈技術發展科實習。興趣在區塊鏈、金融科技與軟體工程。',
  rule: '這裡把「我做的」和「團隊做的」分開寫，每個數字都附上它的規模與限制。',
  motto: '這個世界就是一個巨大的草台班子，所以弄假直到成真。',
  links: [
    { label: 'GitHub', href: 'https://github.com/ChiJiun' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/chijiun-wong-471716336/' },
    { label: 'Linktree', href: 'https://linktr.ee/0311gino' },
  ],
};

// Contact form. The section stays hidden until one of these is filled in.
// accessKey: a Web3Forms access key (the form posts there and the address stays private).
// email: fallback that opens the visitor's mail app instead; this address becomes public.
export const contact = { accessKey: '', email: '' };

export const interests = [
  { title: '可信任與隱私保護機器學習', text: 'Verifiable computation、Zero-Knowledge Proof、Differential Privacy、Federated Learning。' },
  { title: '嚴謹評估與可重現研究', text: '資料洩漏辨識、統計檢定、負向測試，以及可稽核的實驗流程。' },
  { title: 'Blockchain 與 FinTech 系統', text: 'Smart Contract、Digital Asset、evidence traceability，適用金融機構情境的可驗證系統。' },
];

export const research = [
  {
    title: '基於 ZKML 之可驗證差分隱私架構：以聯邦學習為例',
    org: '國科會 115 年度大專學生研究計畫 · 指導教授：張嘉惠 · WIDM Lab',
    date: '2026.02 – 進行中',
    flow: ['Local Training', 'DP Processing', 'Generate Proof', 'Verify Proof', 'Proof-Gated Aggregation'],
    points: [
      '問題：聯邦學習的 client 不上傳原始資料，但 server 沒辦法確認 client 是否真的照規則做了差分隱私的裁剪與加噪。',
      '做法：把 DP update 的 clipping 與 noise 條件轉成零知識證明（EZKL：PyTorch → ONNX；Halo2：Rust），只聚合通過驗證的 update。',
      '結果：合成資料、四參數模型下，150/150 份證明通過驗證且可從磁碟重驗，1,050/1,050 次 replay 與竄改測試全數被拒。',
      '限制：證明的是 DP update 的核心條件，不是完整的訓練流程；正式的 privacy accountant 與雜訊分布的密碼學驗證仍是後續方向。',
      '於中央大學資工系專題成果展（AI 與系統組）發表。',
    ],
    link: { label: 'zk-verifiable-dp-fl', href: gh('zk-verifiable-dp-fl') },
  },
  {
    title: '重新檢驗一份公開匯率預測研究的評估流程',
    org: '自主研究',
    date: '2026.05 – 2026.08',
    points: [
      '原始模型與資料來自學長公開的國科會專案；評估重建與後續實驗是我獨立做的。',
      '找出三個問題：未來資訊洩漏、歐元區重複序列，以及只用單一 30 日測試視窗。',
      '改用 104 個 rolling forecast origins、30 日 embargo、20 種模型變體，並以 Diebold–Mariano 與 Pesaran–Timmermann 檢定。',
      '結果：點位預測沒有模型顯著優於 random walk；加入利率平價特徵後，方向預測達統計顯著（Ridge：PT p < 10⁻⁴）。',
      '既有回測假設下，5 日方向策略扣成本後年化 Sharpe 2.16。',
    ],
    link: { label: 'forecasting-fx-transformer', href: gh('forecasting-fx-transformer') },
  },
];

// Rendered as files in the editor window. Line kinds: h1, h2, meta, li, quote, text, link, blank.
export const experience = [
  {
    name: 'internship.md',
    lines: [
      ['h1', '國泰金融控股｜研發工程實習生'],
      ['meta', '2026.09 – 2027.06 · 進行中'],
      ['meta', '數位數據暨科技發展中心／數位架構發展部／區塊鏈技術發展科'],
      ['blank'],
      ['li', '錄取 2026 國泰金控 TBA 實習計畫。'],
      ['li', '參與 Blockchain／Digital Asset 相關 PoC 與技術實作。'],
      ['blank'],
      ['quote', '實習剛開始，這裡不寫還沒完成的成果。'],
    ],
  },
  {
    name: 'awards.md',
    lines: [
      ['h1', '競賽與獲獎'],
      ['blank'],
      ['h2', 'RWA Hackathon Taiwan 2025'],
      ['meta', '最佳 Self Onchain SDK 整合 第二名 · 2025.10'],
      ['li', '團隊「五告Sui」，專案 OnChain Bank；該獎項第一名從缺。'],
      ['link', 'Hackathon_ChainBank', gh('Hackathon_ChainBank')],
      ['blank'],
      ['h2', '2025 ITSA 全國大專校院程式設計極客挑戰賽'],
      ['meta', '佳作 · 2025'],
      ['li', '網頁程式設計；108 隊報名、12 隊獲獎。'],
      ['blank'],
      ['h2', '2026 雲湧智生：臺灣生成式 AI 應用黑客松'],
      ['meta', '決賽入選 · 2026.08'],
      ['li', 'HOYA BIT 命題，完成兩日決賽與 Live Demo；未獲最終獎項。'],
      ['link', 'aws-hoyabit', gh('aws-hoyabit')],
    ],
  },
  {
    name: 'teaching.md',
    lines: [
      ['h1', '教學與社團'],
      ['blank'],
      ['h2', '講師｜臺中市政府教育局 113 年度高中生人工智慧營隊'],
      ['meta', '2024.06'],
      ['li', '設計生成內容辨識、supervised learning、LLM 與 Prompt Engineering 的互動活動。'],
      ['blank'],
      ['h2', '財務｜NCU Blockchain Research Club'],
      ['li', '處理社團預算與財務紀錄。'],
      ['li', '參與 Web3 技術活動與討論。'],
    ],
  },
  {
    name: 'education.md',
    lines: [
      ['h1', '國立中央大學 資訊工程學系'],
      ['meta', '學士班 · 輔修財務金融學系 · 2023.09 – 預計 2027 畢業'],
      ['blank'],
      ['li', '跨校至國立政治大學修習「區塊鏈技術與應用」。'],
      ['li', '資工：機器學習概論、機率與統計、自然語言處理、類神經網路。'],
      ['li', '財金：投資學、財務資訊管理、財務管理。'],
      ['blank'],
      ['h2', '證照'],
      ['li', 'Google AI Essentials（2024）'],
    ],
  },
];

export const projects = [
  {
    tag: '黑客松 · 決賽入選', year: '2026.08', title: '多源加密市場分析 AI Agent',
    sub: '2026 雲湧智生：臺灣生成式 AI 應用黑客松 · HOYA BIT 命題',
    desc: '針對加密資產問題自主蒐集多源資料、交叉驗證訊號，產出每個 claim 都能回溯來源的結構化報告，並區分 fact → inference → conclusion。',
    note: '我負責 evidence／S3 儲存基礎設施、異常偵測規則、orchestrator 整合、測試與報告驗證。',
    stack: ['Amazon Bedrock', 'Lambda', 'S3', 'Python'], href: gh('aws-hoyabit'),
  },
  {
    tag: '黑客松 · 第二名', year: '2025.10', title: 'OnChain Bank',
    sub: 'RWA Hackathon Taiwan 2025 · 團隊「五告Sui」',
    desc: 'RWA 主題的鏈上銀行 Demo：NTD 代幣、定存與信用卡合約，搭配 Self Onchain SDK 的身份驗證。',
    note: '我負責 NTD 代幣的 ERC-20 合約（帳戶凍結與轉帳限制）、定存與信用卡合約的前端串接，以及 hooks 重構。Self 的 ZK 驗證合約是隊友做的。',
    stack: ['Solidity', 'ERC-20', 'React'], href: gh('Hackathon_ChainBank'),
  },
  {
    tag: '課程服務', year: '', title: 'AI 統計學 FRQ 自動評分系統',
    sub: 'StatsDiscordBot',
    desc: '學生在 Discord 交統計學 Free Response Questions 的作答，LLM 依評分規準檢視並產生回饋。服務對象約 150 位學生，長期運作。',
    note: '我建置並維運：Discord Bot、rubric-guided prompting、SQLite、Google Drive、HTML 報告，部署在 GCP VM／Linux。',
    stack: ['Python', 'Discord', 'LLM', 'GCP'], href: gh('StatsDiscordBot'),
  },
  {
    tag: '課程專案', year: '2025', title: '區塊鏈網路投票系統',
    sub: '國立政治大學「區塊鏈技術與應用」',
    desc: '可在 Ethereum testnet 運作的投票 prototype：Commit 階段只上鏈 hash，Reveal 階段揭露選票與 nonce，交給合約驗證。',
    note: '限制：設計目標是降低開票前選票內容曝光，不宣稱完整的投票者匿名。',
    stack: ['Solidity', 'React', 'ethers.js', 'Wagmi', 'RainbowKit'], href: gh('BlockchainVotingSystem'),
  },
  {
    tag: '團隊專案', year: '2026.04 – 06', title: 'NCU AI Guidance',
    sub: 'AI 課程與研究探索平台 · 五人跨系團隊',
    desc: '結合知識圖譜、多信號檢索與 RAG 的課程與研究探索平台。',
    note: '我負責部署與服務化：Firebase Hosting、Render、Cloudinary、Google 登入、PostgreSQL 聊天紀錄、Qdrant 監控與 CI／Secrets 管理（54 commits）。',
    stack: ['Firebase', 'Render', 'PostgreSQL', 'Qdrant'], href: gh('NCU_AI_Guidance'),
  },
];

export const more = [
  { title: 'Quantum Computing for Vertex Cover', text: 'Qiskit／AerSimulator，以 Grover’s Algorithm 探索 Vertex Cover 問題。' },
  { title: '校園問卷資料視覺化網站', text: 'Flask + Plotly，串接 Google Forms／Sheets API，曾部署於 Azure。' },
  { title: '影像辨識遊戲自動化腳本', text: 'Python 畫面擷取與 image recognition，以 multithreading 協調流程。' },
  { title: 'x86 Assembly 踩地雷 · 小精靈 2.0', text: '早期作品：Irvine32 組合語言與 Java 遊戲。' },
  { title: '台指期法人強度＋價格趨勢回測', text: '1,968 個交易日、一口 TX；Sharpe 1.367，但 CAGR 低於買進持有。', href: gh('tx-flow-trend-backtest') },
  { title: 'mvdis-watch', text: '監理站考照報名餘額監測，跑在一個 Cloudflare Worker 的免費額度上。', href: gh('mvdis-watch') },
  { title: 'Verified Human Attention Market', text: '可驗證真人注意力的市場與協定（開發中）。', href: gh('verified-human-attention-market') },
];

export const cats = {
  lang: { label: '程式語言', color: '#7dd3fc' },
  ml: { label: 'ML 與隱私', color: '#c4a5ff' },
  chain: { label: '區塊鏈', color: '#fbbf24' },
  evalm: { label: '評估方法', color: '#f9a8d4' },
  infra: { label: 'Web 與雲端', color: '#6ee7a8' },
};

// One skill per physical letter key.
export const skills = {
  p: { short: 'Py', name: 'Python', cat: 'lang', desc: '主力語言：研究原型、評分機器人、AI Agent 都用它寫。', repo: 'StatsDiscordBot' },
  r: { short: 'Rs', name: 'Rust', cat: 'lang', desc: '研究計畫裡的 Halo2 證明後端。', repo: 'zk-verifiable-dp-fl' },
  s: { short: 'Sol', name: 'Solidity', cat: 'lang', desc: 'NTD 代幣的 ERC-20 合約、Commit–Reveal 投票合約。', repo: 'BlockchainVotingSystem' },
  j: { short: 'JS', name: 'JavaScript', cat: 'lang', desc: '錢包整合與合約前端串接。', repo: 'Hackathon_ChainBank' },
  q: { short: 'SQL', name: 'SQL', cat: 'lang', desc: 'PostgreSQL 聊天紀錄、SQLite 作答紀錄。', repo: 'NCU_AI_Guidance' },
  t: { short: 'PT', name: 'PyTorch', cat: 'ml', desc: 'DP 檢查模型，經 ONNX 交給 EZKL 產生證明。', repo: 'zk-verifiable-dp-fl' },
  o: { short: 'ONX', name: 'ONNX', cat: 'ml', desc: 'PyTorch → ONNX → 零知識電路的中間格式。', repo: 'zk-verifiable-dp-fl' },
  f: { short: 'FL', name: 'Federated Learning', cat: 'ml', desc: '國科會大專學生研究計畫的情境。', repo: 'zk-verifiable-dp-fl' },
  d: { short: 'DP', name: 'Differential Privacy', cat: 'ml', desc: '把 clipping 與 noise 條件寫成可驗證的 constraints。', repo: 'zk-verifiable-dp-fl' },
  z: { short: 'ZK', name: 'Zero-Knowledge Proof', cat: 'ml', desc: '150/150 份證明通過；規模是合成資料、四參數模型。', repo: 'zk-verifiable-dp-fl' },
  e: { short: 'EZ', name: 'EZKL', cat: 'ml', desc: '把模型運算轉成零知識電路的工具鏈。', repo: 'zk-verifiable-dp-fl' },
  h: { short: 'H2', name: 'Halo2', cat: 'ml', desc: '用 Rust 寫的逐更新證明，可從磁碟重新驗證。', repo: 'zk-verifiable-dp-fl' },
  l: { short: 'LLM', name: 'LLM Agents', cat: 'ml', desc: 'rubric-guided 評分，以及可回溯來源的市場分析 Agent。', repo: 'aws-hoyabit' },
  c: { short: 'SC', name: 'Smart Contract', cat: 'chain', desc: 'Commit–Reveal 投票：開票前只上鏈 hash。', repo: 'BlockchainVotingSystem' },
  k: { short: 'ERC', name: 'ERC-20', cat: 'chain', desc: 'NTD 代幣：帳戶凍結與轉帳限制。', repo: 'Hackathon_ChainBank' },
  w: { short: 'W3', name: 'ethers.js / Wagmi', cat: 'chain', desc: 'RainbowKit 錢包連線與合約互動。', repo: 'BlockchainVotingSystem' },
  b: { short: 'BT', name: 'Rolling-origin 回測', cat: 'evalm', desc: '104 個 forecast origins、30 日 embargo。', repo: 'forecasting-fx-transformer' },
  m: { short: 'DM', name: 'DM / PT 檢定', cat: 'evalm', desc: 'Diebold–Mariano 與 Pesaran–Timmermann：先問有沒有贏過 random walk。', repo: 'forecasting-fx-transformer' },
  n: { short: 'Neg', name: '負向測試', cat: 'evalm', desc: '1,050 次 replay 與竄改測試，全部要被拒絕才算過。', repo: 'zk-verifiable-dp-fl' },
  u: { short: 'UI', name: 'React', cat: 'infra', desc: '投票系統與鏈上銀行的前端，頁面邏輯拆成 hooks。', repo: 'Hackathon_ChainBank' },
  a: { short: 'AWS', name: 'AWS', cat: 'infra', desc: 'Bedrock、Lambda、S3：黑客松 Agent 的執行環境。', repo: 'aws-hoyabit' },
  g: { short: 'GCP', name: 'GCP VM / Linux', cat: 'infra', desc: '評分機器人長期運作的地方。', repo: 'StatsDiscordBot' },
  i: { short: 'Fb', name: 'Firebase / Render', cat: 'infra', desc: '探索平台的部署與 Google 登入。', repo: 'NCU_AI_Guidance' },
  v: { short: 'Vec', name: 'Qdrant', cat: 'infra', desc: '向量資料庫的監控。', repo: 'NCU_AI_Guidance' },
  y: { short: 'CI', name: 'GitHub Actions', cat: 'infra', desc: 'CI 與 Secrets 管理；這個網站也是它部署的。', repo: 'chijiun.github.io' },
};
