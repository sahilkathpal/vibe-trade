import yahooFinance from "yahoo-finance2";

export interface Fundamentals {
  symbol: string;
  pe_ratio?: number;
  forward_pe?: number;
  eps?: number;
  revenue_growth?: number;
  profit_margins?: number;
  roe?: number;
  debt_to_equity?: number;
  market_cap?: number;
  sector?: string;
  industry?: string;
  fifty_two_week_high?: number;
  fifty_two_week_low?: number;
  avg_volume?: number;
}

async function safe<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

export async function getFundamentals(symbol: string): Promise<Fundamentals> {
  // NSE symbols use .NS suffix on Yahoo Finance
  const yahooSymbol = symbol.toUpperCase().endsWith(".NS")
    ? symbol.toUpperCase()
    : `${symbol.toUpperCase()}.NS`;

  const [quoteSummary, quote] = await Promise.all([
    safe(
      yahooFinance.quoteSummary(yahooSymbol, {
        modules: ["defaultKeyStatistics", "financialData", "assetProfile", "summaryDetail"],
      })
    ),
    safe(yahooFinance.quote(yahooSymbol)),
  ]);

  const qs = quoteSummary as any;
  const keyStats = qs?.defaultKeyStatistics;
  const financialData = qs?.financialData;
  const assetProfile = qs?.assetProfile;
  const summaryDetail = qs?.summaryDetail;

  return {
    symbol: symbol.toUpperCase(),
    pe_ratio: summaryDetail?.trailingPE ?? (quote as any)?.trailingPE ?? undefined,
    forward_pe: summaryDetail?.forwardPE ?? (quote as any)?.forwardPE ?? undefined,
    eps: keyStats?.trailingEps ?? undefined,
    revenue_growth: financialData?.revenueGrowth ?? undefined,
    profit_margins: financialData?.profitMargins ?? undefined,
    roe: financialData?.returnOnEquity ?? undefined,
    debt_to_equity: financialData?.debtToEquity ?? undefined,
    market_cap: (quote as any)?.marketCap ?? summaryDetail?.marketCap ?? undefined,
    sector: (assetProfile as any)?.sector ?? undefined,
    industry: (assetProfile as any)?.industry ?? undefined,
    fifty_two_week_high: (quote as any)?.fiftyTwoWeekHigh ?? summaryDetail?.fiftyTwoWeekHigh ?? undefined,
    fifty_two_week_low: (quote as any)?.fiftyTwoWeekLow ?? summaryDetail?.fiftyTwoWeekLow ?? undefined,
    avg_volume: (quote as any)?.averageDailyVolume3Month ?? summaryDetail?.averageVolume ?? undefined,
  };
}
