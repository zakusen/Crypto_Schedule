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
// v225: 追うトークン = 本物の契約アドレスで見分ける(名前だけ同じ偽トークン・スパムを除く)。Ethereum メインネット。[記号, 追う最小の量]
export const TOKENS = {
  '0xdac17f958d2ee523a2206206994597c13d831ec7': ['USDT', 10000],
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': ['USDC', 10000],
  '0x6b175474e89094c44da98b954eedeac495271d0f': ['DAI', 10000],
  '0xc5f0f7b66764f6ec8c8dff7ba683102295e16409': ['FDUSD', 10000],
  '0x4c9edd5852cd905f086c759e8383e09bff1e68b3': ['USDe', 10000],
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': ['WETH', 5],
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': ['stETH', 5],
  '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0': ['wstETH', 5],
  '0xd5f7838f5c461feff7fe49ea5ebaf7728bb0adfa': ['mETH', 5],
  '0xe6829d9a7ee3040e1276fa75293bde931859e8fa': ['cmETH', 5],
  '0xae78736cd615f374d3085123a210448e74fc6393': ['rETH', 5],
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': ['WBTC', 0.2],
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': ['cbBTC', 0.2],
};
export const ETH_MIN = 5;          // これより小さい ETH の送金は「ガス代の補充」として数えるだけ(追わない)
export const GAS_MAX = 5;          // 0.01〜5 ETH = ガス代の補充とみなす目安
