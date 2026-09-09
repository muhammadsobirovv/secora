"use client";

import * as React from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react";
import type { ApiKeyDto } from "@pentesthub/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useApiKeys, useCreateApiKey, useRevokeApiKey, useRotateApiKey } from "../hooks/use-api-keys";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/// Shown exactly once, right after `create`/`rotate` returns — the DTO
/// contract (`CreateApiKeyResultDto.rawKey`/`RotateApiKeyResultDto.rawKey`)
/// guarantees the backend never returns the raw value again afterward.
function RevealKeyDialog({ rawKey, onClose }: { rawKey: string | null; onClose: () => void }) {
  return (
    <Dialog open={rawKey !== null} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your new API key</DialogTitle>
          <DialogDescription>
            Copy this now — for your security, it won&apos;t be shown again. If you lose it, you&apos;ll need to
            rotate or create a new one.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input readOnly value={rawKey ?? ""} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => {
              if (rawKey) {
                void navigator.clipboard.writeText(rawKey);
                toast.success("Copied to clipboard.");
              }
            }}
          >
            <Copy className="size-4" />
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateKeyDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (rawKey: string) => void }) {
  const [name, setName] = React.useState("");
  const [expiresInDays, setExpiresInDays] = React.useState("");
  const create = useCreateApiKey();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const result = await create.mutateAsync({
        name: name.trim(),
        expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
      });
      setName("");
      setExpiresInDays("");
      onOpenChange(false);
      onCreated(result.rawKey);
    } catch {
      toast.error("Couldn't create the API key.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
              Personal key — usable with your own permissions from the CLI, SDKs, or automation. Optionally set an
              expiry.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="api-key-name">Name</Label>
              <Input
                id="api-key-name"
                placeholder="e.g. CI pipeline"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="api-key-expires">Expires in (days, optional)</Label>
              <Input
                id="api-key-expires"
                type="number"
                min={1}
                max={365}
                placeholder="Never expires"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              {create.isPending && <Loader2 className="size-3.5 animate-spin" />}
              Create key
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function KeyRow({ apiKey, onRawKey }: { apiKey: ApiKeyDto; onRawKey: (rawKey: string) => void }) {
  const [confirmRevoke, setConfirmRevoke] = React.useState(false);
  const revoke = useRevokeApiKey();
  const rotate = useRotateApiKey();
  const isRevoked = apiKey.revokedAt !== null;
  const isExpired = apiKey.expiresAt !== null && new Date(apiKey.expiresAt) < new Date();

  async function handleRevoke() {
    try {
      await revoke.mutateAsync(apiKey.id);
      toast.success(`"${apiKey.name}" revoked.`);
    } catch {
      toast.error("Couldn't revoke the key.");
    } finally {
      setConfirmRevoke(false);
    }
  }

  async function handleRotate() {
    try {
      const result = await rotate.mutateAsync(apiKey.id);
      toast.success(`"${apiKey.name}" rotated — the old key stopped working immediately.`);
      onRawKey(result.rawKey);
    } catch {
      toast.error("Couldn't rotate the key.");
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{apiKey.name}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">{apiKey.prefix}…</TableCell>
      <TableCell>
        {isRevoked ? (
          <Badge variant="outline">Revoked</Badge>
        ) : isExpired ? (
          <Badge variant="warning">Expired</Badge>
        ) : (
          <Badge variant="success">Active</Badge>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{formatDate(apiKey.lastUsedAt)}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{formatDate(apiKey.expiresAt)}</TableCell>
      <TableCell className="text-right">
        {!isRevoked && (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => void handleRotate()} disabled={rotate.isPending}>
              {rotate.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Rotate
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmRevoke(true)} disabled={revoke.isPending}>
              <Trash2 className="size-3.5" />
              Revoke
            </Button>
          </div>
        )}
      </TableCell>

      <AlertDialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke &quot;{apiKey.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              Anything using this key will immediately stop working. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep key</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleRevoke()}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TableRow>
  );
}

/// Module 20 (#332-class gap). Backend (`ApiKeysController` + Module 15's
/// rotation/IP-allowlist/rate-limit work) has been complete since Module 9
/// — this page was a permanent "coming soon" stub with no real
/// functionality. Personal keys only: `apiKeysApi.listApiKeys()` omits
/// `workspaceId`, so this always lists the caller's own keys, never a
/// workspace's — a workspace-key picker is real, additive follow-up scope
/// once a workspace switcher exists (see the org-switcher UX audit).
export function ApiKeysSection() {
  const { data: keys, isLoading, error } = useApiKeys();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [rawKey, setRawKey] = React.useState<string | null>(null);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading your API keys…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-destructive">
          Couldn&apos;t load your API keys. Try refreshing the page.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">API keys</CardTitle>
          <CardDescription>Personal keys for the CLI, SDKs, and automation. Revoked keys stop working immediately.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          New key
        </Button>
      </CardHeader>
      <CardContent>
        {!keys || keys.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No API keys yet"
            description="Create one to authenticate the CLI, an SDK, or a script against this account."
            action={
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                Create your first key
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <KeyRow key={key.id} apiKey={key} onRawKey={setRawKey} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={setRawKey} />
      <RevealKeyDialog rawKey={rawKey} onClose={() => setRawKey(null)} />
    </Card>
  );
}
