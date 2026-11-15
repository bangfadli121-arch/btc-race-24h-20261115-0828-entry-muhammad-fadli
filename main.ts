import { runBars } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

const closes: bigint[] = [];
let ema8: bigint | null = null;
let ema21: bigint | null = null;
let pending: 'buy' | 'sell' | null = null;
let wasLong = false;
let peak = 0n;
let entryClose = 0n;
let entryBar = -1;
let lastExitBar = -1_000_000;

await runBars({
  onBatch(state, batch) {
    const position = state.positions.get(SYMBOL);
    const isLong = position !== undefined;
    if (wasLong && !isLong) lastExitBar = batch.seq;

    const bar = batch.bars.find((candidate) => candidate.symbol === SYMBOL);
    if (bar === undefined) {
      wasLong = isLong;
      return [];
    }

    const close = BigInt(bar.c);
    closes.push(close);
    ema8 = ema8 === null ? close : (2n * close + 7n * ema8) / 9n;
    ema21 = ema21 === null ? close : (2n * close + 20n * ema21) / 22n;

    if (pending !== null) pending = null;

    if (isLong && !wasLong) {
      entryClose = close;
      entryBar = batch.seq;
      peak = close;
    }
    if (isLong && close > peak) peak = close;

    if (!state.warmingUp && batch.seq < 1439) {
      if (isLong) {
        const fade = ema8 !== null && close < ema8 && close * 1000n < peak * 995n;
        const shouldExit = close * 1000n <= peak * 985n
          || close * 1000n <= entryClose * 985n
          || close * 100n >= entryClose * 103n
          || batch.seq - entryBar >= 360
          || fade;
        if (shouldExit && pending === null) {
          pending = 'sell';
          wasLong = true;
          return [{ side: 'sell', symbol: SYMBOL, qty: position.qty, max_slippage_bps: 150 }];
        }
      } else if (pending === null && closes.length >= 240 && batch.seq - lastExitBar >= 60
        && ema8 !== null && ema21 !== null && close > ema21 && ema8 > ema21) {
        const oldClose = closes[closes.length - 31];
        if (oldClose !== undefined && close * 1000n >= oldClose * 1010n && state.cash > 0n) {
          pending = 'buy';
          wasLong = false;
          return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: 150 }];
        }
      }
    }

    wasLong = isLong;
    return [];
  },
});
