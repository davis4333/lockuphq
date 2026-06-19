export type SearchType = "Area" | "Pat" | "Strip" | "Other";
export type StaffRank = "C/O" | "Sgt." | "Lt." | "Captain";
export type TabletValue = "Y" | "N";
export type TabletMode = "Y" | "N" | "Random";

export const SEARCH_TYPES: SearchType[] = ["Area", "Pat", "Strip", "Other"];
export const STAFF_RANKS: StaffRank[] = ["C/O", "Sgt.", "Lt.", "Captain"];
export const TABLET_VALUES: TabletValue[] = ["Y", "N"];
export const TABLET_MODES: TabletMode[] = ["Y", "N", "Random"];

export const ROWS_PER_PAGE = 19;

export interface RawBedRow {
  bedId: string;
  docnum: string;
  inmateName: string;
  sourceRow: number;
}

export interface ParsedBedBook {
  rows: RawBedRow[];
  delimiter: string;
  headerRowIndex: number;
  totalDataRows: number;
}

export interface GroupedInmate {
  name: string;
  dc: string;
  dcValid: boolean;
  rawDocnum: string;
}

export interface GroupedEntry {
  bedId: string;
  inmates: GroupedInmate[];
}

export interface SetupFields {
  location: string;
  dateOfSearch: string; // yyyy-mm-dd (input value)
  startTime: string; // HH:mm (24h, input value)
  searchType: SearchType;
  staffName: string;
  staffRank: StaffRank;
  discrepancies: string;
  tabletMode: TabletMode;
}

export interface ReviewRow {
  id: string;
  include: boolean;
  bedId: string;
  date: string; // formatted MM/DD/YY
  time: string; // formatted e.g. "4:45 P"
  area: string; // Area/Bunk Searched
  type: string; // Type of Search
  inmate: string; // multi-line "LAST, FIRST DC#"
  officer: string; // "[RANK] [NAME]"
  discrepancies: string;
  tablet: string;
}

export interface ValidationFlag {
  field: string;
  message: string;
}
