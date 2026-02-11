import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { Resource } from "sst";
import {
  createAppTable,
  SportOrgEntity,
  type SportOrganization,
} from "@usopc/shared";

function getEntity(): SportOrgEntity {
  const tableName = (Resource as unknown as { AppTable: { name: string } })
    .AppTable.name;
  const table = createAppTable(tableName);
  return new SportOrgEntity(table);
}

export { type SportOrganization };

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
      const entity = getEntity();
      let orgs = await entity.getAll();
      const filters = input ?? { type: "all", status: "active" };

      if (filters.type !== "all") {
        orgs = orgs.filter((o) => o.type === filters.type);
      }
      if (filters.olympicProgram) {
        orgs = orgs.filter((o) => o.olympicProgram === filters.olympicProgram);
      }
      if (filters.status) {
        orgs = orgs.filter((o) => o.status === filters.status);
      }

      return { organizations: orgs };
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const entity = getEntity();
      const org = await entity.getById(input.id);
      return { organization: org ?? null };
    }),

  search: publicProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const entity = getEntity();
      const matches = await entity.search(input.query);
      return { organizations: matches };
    }),
});
