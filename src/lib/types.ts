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
  /** Millisecond timestamp — refreshed on every content/thought change. */
  updatedAt?: number;
  /** Soft-delete tombstone — presence means the card is deleted. */
  deletedAt?: number;
}
