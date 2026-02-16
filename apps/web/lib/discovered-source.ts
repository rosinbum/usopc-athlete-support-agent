import { Resource } from "sst";
import { createAppTable, DiscoveredSourceEntity } from "@usopc/shared";

/**
 * Factory to create a DiscoveredSourceEntity using the SST-linked table name.
 */
export function createDiscoveredSourceEntity(): DiscoveredSourceEntity {
  const tableName = (Resource as unknown as { AppTable: { name: string } })
    .AppTable.name;
  const table = createAppTable(tableName);
  return new DiscoveredSourceEntity(table);
}
