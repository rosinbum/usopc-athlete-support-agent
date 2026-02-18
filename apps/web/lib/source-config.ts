import { createAppTable, getResource, SourceConfigEntity } from "@usopc/shared";

/**
 * Factory to create a SourceConfigEntity using the SST-linked table name.
 */
export function createSourceConfigEntity(): SourceConfigEntity {
  const tableName = getResource("AppTable").name;
  const table = createAppTable(tableName);
  return new SourceConfigEntity(table);
}
