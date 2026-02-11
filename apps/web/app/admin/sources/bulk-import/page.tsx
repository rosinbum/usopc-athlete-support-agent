import { BulkImportWizard } from "./BulkImportWizard.js";

export default function BulkImportPage() {
  return (
    <>
      <h1 className="text-2xl font-bold mb-6">Bulk Import Sources</h1>
      <BulkImportWizard />
    </>
  );
}
