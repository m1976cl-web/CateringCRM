import type { QuoteItem, QuoteStatus } from "../shared/types";

export type PublicQuoteView = {
  id: number;
  quoteNumber: string | null;
  quoteDate: string;
  items: QuoteItem[];
  total: number;
  notes: string | null;
  status: QuoteStatus;
  version: number;
  eventTitle: string;
  eventDate: string;
  location: string | null;
  attendees: number;
  clientName: string;
  clientCompany: string | null;
};

export function publicQuoteUrl(token: string): string {
  const path = window.location.pathname.replace(/\/index\.html$/i, "/");
  return `${window.location.origin}${path}${window.location.search}#/p/${encodeURIComponent(token)}`;
}
