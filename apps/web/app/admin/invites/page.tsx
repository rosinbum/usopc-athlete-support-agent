import { InvitesAdminClient } from "./InvitesAdminClient.js";

export default function AdminInvitesPage() {
  return (
    <>
      <h1 className="text-2xl font-bold mb-6">Invite Management</h1>
      <p className="text-gray-600 mb-8">
        Manage who can access the Athlete Support chat. Only invited users can
        sign in via magic link.
      </p>
      <InvitesAdminClient />
    </>
  );
}
