import {
  RSI,
  MACD,
  BollingerBands,
  SMA,
  EMA,
  ATR,
} from "technicalindicators";

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorResult extends Candle {
  sma_20?: number;
  ema_12?: number;
  ema_26?: number;
  rsi_14?: number;
  macd_line?: number;
  macd_signal?: number;
  macd_histogram?: number;
  bb_upper?: number;
  bb_middle?: number;
  bb_lower?: number;
  atr_14?: number;
  vwap?: number;
}

function computeVWAP(candles: Candle[]): number[] {
  // Daily rolling VWAP: cumulative (typical_price * volume) / cumulative volume
  const result: number[] = new Array(candles.length).fill(NaN);
  let cumPV = 0;
  let cumVol = 0;
  for (let i = 0; i < candles.length; i++) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumPV += tp * candles[i].volume;
    cumVol += candles[i].volume;
    result[i] = cumVol > 0 ? cumPV / cumVol : NaN;
  }
  return result;
}

export function computeIndicators(candles: Candle[]): IndicatorResult[] {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const n = candles.length;

  // SMA 20
  const smaValues = SMA.calculate({ period: 20, values: closes });
  const smaOffset = n - smaValues.length;

  // EMA 12 and 26
  const ema12Values = EMA.calculate({ period: 12, values: closes });
  const ema12Offset = n - ema12Values.length;

  const ema26Values = EMA.calculate({ period: 26, values: closes });
  const ema26Offset = n - ema26Values.length;

  // RSI 14
  const rsiValues = RSI.calculate({ period: 14, values: closes });
  const rsiOffset = n - rsiValues.length;

  // MACD (12, 26, 9)
  const macdValues = MACD.calculate({
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    values: closes,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const macdOffset = n - macdValues.length;

  // Bollinger Bands (20, 2)
  const bbValues = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
  const bbOffset = n - bbValues.length;

  // ATR 14
  const atrValues = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
  const atrOffset = n - atrValues.length;

  // VWAP
  const vwapValues = computeVWAP(candles);

  const results: IndicatorResult[] = candles.map((candle, i) => {
    const result: IndicatorResult = { ...candle };

    const smaIdx = i - smaOffset;
    if (smaIdx >= 0 && smaIdx < smaValues.length) result.sma_20 = +smaValues[smaIdx].toFixed(4);

    const ema12Idx = i - ema12Offset;
    if (ema12Idx >= 0 && ema12Idx < ema12Values.length) result.ema_12 = +ema12Values[ema12Idx].toFixed(4);

    const ema26Idx = i - ema26Offset;
    if (ema26Idx >= 0 && ema26Idx < ema26Values.length) result.ema_26 = +ema26Values[ema26Idx].toFixed(4);

    const rsiIdx = i - rsiOffset;
    if (rsiIdx >= 0 && rsiIdx < rsiValues.length) result.rsi_14 = +rsiValues[rsiIdx].toFixed(2);

    const macdIdx = i - macdOffset;
    if (macdIdx >= 0 && macdIdx < macdValues.length) {
      const m = macdValues[macdIdx];
      result.macd_line = m.MACD !== undefined ? +m.MACD.toFixed(4) : undefined;
      result.macd_signal = m.signal !== undefined ? +m.signal.toFixed(4) : undefined;
      result.macd_histogram = m.histogram !== undefined ? +m.histogram.toFixed(4) : undefined;
    }

    const bbIdx = i - bbOffset;
    if (bbIdx >= 0 && bbIdx < bbValues.length) {
      result.bb_upper = +bbValues[bbIdx].upper.toFixed(4);
      result.bb_middle = +bbValues[bbIdx].middle.toFixed(4);
      result.bb_lower = +bbValues[bbIdx].lower.toFixed(4);
    }

    const atrIdx = i - atrOffset;
    if (atrIdx >= 0 && atrIdx < atrValues.length) result.atr_14 = +atrValues[atrIdx].toFixed(4);

    if (!isNaN(vwapValues[i])) result.vwap = +vwapValues[i].toFixed(4);

    return result;
  });

  // Return last 50 candles
  return results.slice(-50);
}
