export interface CitationSource {
  url: string;
  title: string;
  heading?: string;
  siteName?: string;
  author?: string;
  publishedAt?: string;
  favicon?: string;
}

export interface Card {
  id: string;
  content: string;
  thought?: string;
  source: CitationSource;
  createdAt: number;
}
