export type OlympicProgram = "summer" | "winter" | "pan_american";
export type OrgStatus = "active" | "decertified";
export type OrgType = "ngb" | "usopc_managed";

export interface SportOrganization {
  id: string;
  type: OrgType;
  officialName: string;
  abbreviation?: string;
  sports: string[];
  olympicProgram: OlympicProgram | null;
  paralympicManaged: boolean;
  websiteUrl: string;
  bylawsUrl?: string;
  selectionProceduresUrl?: string;
  internationalFederation?: string;
  aliases: string[];
  keywords: string[];
  status: OrgStatus;
  effectiveDate: string;
}
