import {
  createAppTable,
  getResource,
  DiscoveredSourceEntity,
} from "@usopc/shared";

/**
 * Factory to create a DiscoveredSourceEntity using the SST-linked table name.
 */
export function createDiscoveredSourceEntity(): DiscoveredSourceEntity {
  const tableName = getResource("AppTable").name;
  const table = createAppTable(tableName);
  return new DiscoveredSourceEntity(table);
}
