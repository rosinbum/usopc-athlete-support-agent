import { Resource } from "sst";
import { createAppTable, SourceConfigEntity } from "@usopc/shared";

/**
 * Factory to create a SourceConfigEntity using the SST-linked table name.
 */
export function createSourceConfigEntity(): SourceConfigEntity {
  const tableName = (Resource as unknown as { AppTable: { name: string } })
    .AppTable.name;
  const table = createAppTable(tableName);
  return new SourceConfigEntity(table);
}
