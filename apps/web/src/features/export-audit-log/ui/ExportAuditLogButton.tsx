import { useMutation } from "@tanstack/react-query";
import { exportAuditEvents, type AuditFilters } from "../../../entities/audit";
import { saveBlob } from "../../../shared/api/client";
import { Button, ErrorText } from "../../../shared/ui";

/**
 * "Export CSV" for the audit log page: downloads the rows that match the person and kind filters currently chosen,
 * newest first (the server caps one file at 10,000 rows and says so on the last line). Only shown to people who can
 * read the log; the server checks the same permission.
 */
export function ExportAuditLogButton({ organizationId, filters }: { organizationId: string; filters: AuditFilters }) {
  const mutation = useMutation({
    mutationFn: () => exportAuditEvents(organizationId, filters),
    onSuccess: ({ blob, filename }) => saveBlob(blob, filename),
  });
  return (
    <>
      <Button type="button" variant="secondary" size="sm" pending={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Exporting…" : "Export CSV"}
      </Button>
      {mutation.isError && <ErrorText>Could not export: {mutation.error.message}</ErrorText>}
    </>
  );
}
