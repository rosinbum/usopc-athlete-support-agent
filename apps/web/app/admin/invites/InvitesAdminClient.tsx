"use client";

import { useState } from "react";
import useSWR from "swr";

interface Invite {
  email: string;
  invitedBy?: string;
  createdAt?: string;
}

interface InvitesResponse {
  invites: Invite[];
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function InvitesAdminClient() {
  const { data, error, isLoading, mutate } = useSWR<InvitesResponse>(
    "/api/admin/invites",
    fetcher,
  );
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json();
        setAddError(body.error ?? "Failed to add invite");
      } else {
        setNewEmail("");
        await mutate();
      }
    } catch {
      setAddError("Network error. Please try again.");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (email: string) => {
    if (!confirm(`Remove invite for ${email}?`)) return;
    setDeletingEmail(email);
    try {
      await fetch("/api/admin/invites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      await mutate();
    } finally {
      setDeletingEmail(null);
    }
  };

  const invites = data?.invites ?? [];

  return (
    <div className="space-y-6">
      {/* Add invite form */}
      <div className="bg-white border rounded-lg p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Add Invite</h2>
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="athlete@example.com"
            required
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={adding}
            className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {adding ? "Adding..." : "Add"}
          </button>
        </form>
        {addError && <p className="text-red-600 text-sm mt-2">{addError}</p>}
      </div>

      {/* Invite list */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <span className="text-sm font-semibold text-gray-700">
            Invited Users ({invites.length})
          </span>
        </div>

        {isLoading && (
          <div className="p-8 text-center text-gray-400 text-sm">
            Loading...
          </div>
        )}

        {error && (
          <div className="p-4 text-red-600 text-sm">
            Failed to load invites.
          </div>
        )}

        {!isLoading && !error && invites.length === 0 && (
          <div className="p-8 text-center text-gray-400 text-sm">
            No invites yet. Add an email above to invite someone.
          </div>
        )}

        {invites.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase tracking-wide border-b">
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Invited By</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr
                  key={invite.email}
                  className="border-b last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 font-mono">{invite.email}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {invite.invitedBy ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {invite.createdAt
                      ? new Date(invite.createdAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(invite.email)}
                      disabled={deletingEmail === invite.email}
                      className="text-red-600 hover:text-red-800 text-xs font-medium disabled:opacity-50 transition-colors"
                    >
                      {deletingEmail === invite.email
                        ? "Removing..."
                        : "Remove"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
