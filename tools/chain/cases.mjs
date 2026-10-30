// v222: 資金を追う事案の一覧(オンチェーン)。t0 = 発生の時刻(UTC)。root = 最初の受取先(流出先)アドレス。
// confirmed = 取引所が公式にハッキングと認めたか(認めていない間は投稿で「ハッキング」と断定しない)。
export const CASES = {
  bybit2025: {
    ja: 'Bybit', en: 'Bybit', chainid: 1, confirmed: true,
    t0: Date.UTC(2025, 1, 21, 14, 16, 11),   // AMLCrypto の時系列: 2025-02-21 14:16:11 UTC
    root: '0x47666fab8bd0ac7003bce3f5c3585383f09486e2',   // Etherscan のラベル "Bybit Exploiter"
  },
  binance2026: {
    ja: 'Binance', en: 'Binance', chainid: 1, confirmed: false,
    t0: Date.UTC(2026, 9, 29, 20, 24, 23),   // 「Binance 14」からの送金(FinanceFeeds)
    root: '0x5227f603c1ee34ce3c06efe6477003bdfccb2f8c',   // Etherscan のラベル "Binance Hot Wallet Exploiter 2"(Etherscan 側の判断)
  },
};
// 追う資産と、追う最小の量(これより小さい送金は「他」にまとめる)
export const ASSETS = {
  ETH: 1, WETH: 1, stETH: 1, wstETH: 1, mETH: 1, cmETH: 1, rETH: 1, cbETH: 1,
  USDT: 10000, USDC: 10000, DAI: 10000, FDUSD: 10000, USDe: 10000,
  WBTC: 0.1, cbBTC: 0.1, tBTC: 0.1,
};
