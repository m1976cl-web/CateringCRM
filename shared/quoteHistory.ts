import type { QuoteStatus } from "./types";

export type PublicQuoteRevision = {
  version: number;
  quoteDate: string;
  total: number;
  status: QuoteStatus;
};

export function isQuoteSuperseded(version: number, versions: number[]): boolean {
  return versions.some((other) => other > version);
}
