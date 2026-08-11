import type { PDFFont } from "pdf-lib";
import {
  HousingLogDocumentOverflowError,
  type EventLine,
  type EventPage,
  type HousingLogDocumentRecord,
} from "./types.ts";

export const MIN_FORM_FONT_SIZE = 5.5;
export const FORM_FONT_SIZES = [8, 7.5, 7, 6.5, 6, MIN_FORM_FONT_SIZE] as const;
export const EVENT_FONT_SIZE = 7;

export function fitSingleLine(
  font: Pick<PDFFont, "widthOfTextAtSize">,
  key: string,
  value: string,
  availableWidth: number,
): number {
  for (const size of FORM_FONT_SIZES) {
    if (font.widthOfTextAtSize(value, size) <= availableWidth) return size;
  }
  throw new HousingLogDocumentOverflowError({
    key,
    value,
    minimumFontSize: MIN_FORM_FONT_SIZE,
    availableWidth,
  });
}

function breakLongToken(
  token: string,
  width: number,
  font: Pick<PDFFont, "widthOfTextAtSize">,
  size: number,
): string[] {
  const pieces: string[] = [];
  let piece = "";
  for (const character of token) {
    const candidate = piece + character;
    if (piece && font.widthOfTextAtSize(candidate, size) > width) {
      pieces.push(piece);
      piece = character;
    } else {
      piece = candidate;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}

export function wrapTextWithoutTruncation(
  text: string,
  width: number,
  font: Pick<PDFFont, "widthOfTextAtSize">,
  size = EVENT_FONT_SIZE,
): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [""];
  const tokens = normalized
    .split(" ")
    .flatMap((token) =>
      font.widthOfTextAtSize(token, size) <= width
        ? [token]
        : breakLongToken(token, width, font, size),
    );
  const lines: string[] = [];
  let line = "";
  for (const token of tokens) {
    const candidate = line ? `${line} ${token}` : token;
    if (line && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(line);
      line = token;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

type EventArea = {
  kind: "official" | "continuation";
  pageIndex: number;
  capacity: number;
};

const OFFICIAL_EVENT_AREAS: EventArea[] = [
  { kind: "official", pageIndex: 1, capacity: 5 },
  { kind: "official", pageIndex: 2, capacity: 42 },
];
export const CONTINUATION_EVENT_CAPACITY = 42;

export function paginateEvents(
  record: Pick<HousingLogDocumentRecord, "events">,
  font: Pick<PDFFont, "widthOfTextAtSize">,
  activityWidth = 432,
): EventPage[] {
  const eventLines = record.events.map((event) => {
    const activityLines = wrapTextWithoutTruncation(
      event.activity,
      activityWidth,
      font,
    );
    return activityLines.map<EventLine>((activity, index) => ({
      eventId: event.id,
      time: index === 0 ? event.time : "",
      activity,
      initials: index === 0 ? event.initials : "",
      continuation: index > 0,
    }));
  });

  const areas = [...OFFICIAL_EVENT_AREAS];
  const pages: EventPage[] = [];
  let areaIndex = 0;
  for (const lines of eventLines) {
    let lineIndex = 0;
    while (lineIndex < lines.length) {
      if (!areas[areaIndex]) {
        areas.push({
          kind: "continuation",
          pageIndex: areaIndex + 1,
          capacity: CONTINUATION_EVENT_CAPACITY,
        });
      }
      const area = areas[areaIndex]!;
      let page = pages.find(
        (candidate) => candidate.pageIndex === area.pageIndex,
      );
      if (!page) {
        page = { kind: area.kind, pageIndex: area.pageIndex, lines: [] };
        pages.push(page);
      }
      const available = area.capacity - page.lines.length;
      if (available === 0) {
        areaIndex += 1;
        continue;
      }
      const take = Math.min(available, lines.length - lineIndex);
      const chunk = lines.slice(lineIndex, lineIndex + take).map((line, index) =>
        lineIndex > 0 && index === 0
          ? { ...line, activity: `(continued) ${line.activity}`, continuation: true }
          : line,
      );
      page.lines.push(...chunk);
      lineIndex += take;
      if (lineIndex < lines.length || page.lines.length === area.capacity)
        areaIndex += 1;
    }
  }
  return pages.sort((a, b) => a.pageIndex - b.pageIndex);
}
