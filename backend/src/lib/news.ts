import Parser from "rss-parser";

const parser = new Parser({
  timeout: 10000,
  headers: { "User-Agent": "VibeTrade/1.0" },
});

const FEEDS: Record<string, string> = {
  markets: "https://www.livemint.com/rss/markets",
  economy: "https://www.livemint.com/rss/economy",
  companies: "https://www.livemint.com/rss/companies",
  finance: "https://www.livemint.com/rss/money",
};

export interface NewsItem {
  title: string;
  summary: string;
  published: string;
  link: string;
}

export async function fetchNews(
  category: keyof typeof FEEDS = "markets",
  limit = 10
): Promise<NewsItem[]> {
  const url = FEEDS[category];
  if (!url) {
    throw new Error(`Unknown category '${category}'. Valid: ${Object.keys(FEEDS).join(", ")}`);
  }

  const feed = await parser.parseURL(url);
  return feed.items.slice(0, limit).map((item) => ({
    title: item.title ?? "",
    summary: item.contentSnippet ?? item.summary ?? item.content ?? "",
    published: item.pubDate ?? item.isoDate ?? "",
    link: item.link ?? "",
  }));
}
