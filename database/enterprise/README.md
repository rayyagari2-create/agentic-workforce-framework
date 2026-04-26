Appendix C extension multi-workspace, teams, queues, gates.

Status: [v3.0] not yet shipped

This directory is reserved for the v3.0 enterprise extension. The model is designed but not yet field-proven. Do not implement this layer until the single-workspace governance schema is running reliably.

## Row Level Security

Enterprise RLS policies are intentionally not shipped in
v1.0. The enterprise tables carry tenant_id on every row
and are designed for RLS enforcement. However, because
the enterprise schema is v3.0 Reference Pattern and should
not be deployed until single-workspace governance is
stable, RLS policy files are deferred.

Before deploying enterprise tables in production:

1. Validate the governance RLS example first:
   database/governance/999_enable_rls.example.sql
2. Author equivalent policies for enterprise tables
   following the same pattern.
3. Have your Postgres DBA review before enabling in
   production.

RLS policies for enterprise tables will be added in a
future release once the enterprise model is field-proven.
