import { create } from "zustand";

const SELECTED_ORGANIZATION_KEY = "secora_selected_organization_id";

interface OrganizationState {
  /// Just a UI preference — which of the caller's own organizations to
  /// show first. Never trusted as an authorization boundary: every read
  /// this ID feeds into (`usePrimaryOrganization`) validates it against
  /// the real `GET /enterprise/organizations` response before using it,
  /// and every backend route it's eventually passed to
  /// (`resolveOrganizationMembership`) re-checks membership itself. A
  /// stale or tampered value here can, at worst, make the UI briefly show
  /// the wrong (but still real, still the caller's own) organization —
  /// it can never grant access to one the caller doesn't belong to.
  selectedOrganizationId: string | null;
  setSelectedOrganizationId: (id: string | null) => void;
}

function readStored(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SELECTED_ORGANIZATION_KEY);
}

export const useOrganizationStore = create<OrganizationState>((set) => ({
  selectedOrganizationId: readStored(),
  setSelectedOrganizationId: (id) => {
    if (typeof window !== "undefined") {
      if (id) window.localStorage.setItem(SELECTED_ORGANIZATION_KEY, id);
      else window.localStorage.removeItem(SELECTED_ORGANIZATION_KEY);
    }
    set({ selectedOrganizationId: id });
  },
}));
