import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

function loadSportOrgs(): any[] {
  const possiblePaths = [
    join(process.cwd(), "data", "sport-organizations.json"),
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../data/sport-organizations.json",
    ),
  ];

  for (const p of possiblePaths) {
    try {
      return JSON.parse(readFileSync(p, "utf-8"));
    } catch {
      continue;
    }
  }
  return [];
}

export const ngbsRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          type: z.enum(["ngb", "usopc_managed", "all"]).default("all"),
          olympicProgram: z
            .enum(["summer", "winter", "pan_american"])
            .optional(),
          status: z.enum(["active", "decertified"]).default("active"),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      let orgs = loadSportOrgs();
      const filters = input ?? { type: "all", status: "active" };

      if (filters.type !== "all") {
        orgs = orgs.filter((o: any) => o.type === filters.type);
      }
      if (filters.olympicProgram) {
        orgs = orgs.filter(
          (o: any) => o.olympicProgram === filters.olympicProgram,
        );
      }
      if (filters.status) {
        orgs = orgs.filter((o: any) => o.status === filters.status);
      }

      return { organizations: orgs };
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const orgs = loadSportOrgs();
      const org = orgs.find((o: any) => o.id === input.id);
      return { organization: org ?? null };
    }),

  search: publicProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const orgs = loadSportOrgs();
      const q = input.query.toLowerCase();
      const matches = orgs.filter(
        (o: any) =>
          o.officialName.toLowerCase().includes(q) ||
          o.abbreviation?.toLowerCase().includes(q) ||
          o.sports.some((s: string) => s.toLowerCase().includes(q)) ||
          o.aliases.some((a: string) => a.toLowerCase().includes(q)),
      );
      return { organizations: matches };
    }),
});
