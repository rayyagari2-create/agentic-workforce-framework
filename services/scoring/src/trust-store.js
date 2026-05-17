// ============================================================================
// services/scoring/src/trust-store.js
// E0-10: Persistence for the D1-D4 reference scorer.
//
// One export:
//
//   writeScore(pool, score)
//       Inserts one row into public.trust_scores. The score argument is
//       the object returned by scorer.computeScore, enriched by the
//       caller with the scope fields that the scorer is not given
//       (tenant_id, division_id, workspace_id, agent_instance_id, and
//       optionally agent_run_id, rationale, correlation_id).
//
//       total_score is a generated column in the table and is not
//       written here; the database recomputes it from the four
//       dimensions on insert. Returns the inserted row.
//
// Why runtime_provider is required
//   Calibration data is never mixed across runtimes. The migration
//   (001_core_schema.sql) makes runtime_provider TEXT NOT NULL on
//   trust_scores so a missing value fails at the database, not silently.
//   The writer surfaces a clearer error before the round-trip.
// ============================================================================

const INSERT_SCORE_SQL = `
    INSERT INTO public.trust_scores (
        tenant_id, division_id, workspace_id,
        agent_instance_id, agent_run_id, runtime_provider,
        d1_correctness, d2_observability, d3_policy, d4_recurrence,
        tier, rationale, correlation_id
    ) VALUES (
        $1, $2, $3,
        $4, $5, $6,
        $7, $8, $9, $10,
        $11::trust_tier, $12, $13
    )
    RETURNING id, tenant_id, division_id, workspace_id,
              agent_instance_id, agent_run_id, runtime_provider,
              d1_correctness, d2_observability, d3_policy, d4_recurrence,
              total_score, tier, rationale, correlation_id, scored_at
`;

function required(score, field) {
    const v = score?.[field];
    if (v === undefined || v === null || v === '') {
        throw new Error(`trust-store.writeScore: missing required field '${field}'`);
    }
    return v;
}

export async function writeScore(pool, score) {
    if (!score || typeof score !== 'object') {
        throw new Error('trust-store.writeScore: score must be an object');
    }

    const tenantId        = required(score, 'tenant_id');
    const divisionId      = required(score, 'division_id');
    const workspaceId     = required(score, 'workspace_id');
    const agentInstanceId = required(score, 'agent_instance_id');
    const runtimeProvider = required(score, 'runtime_provider');
    const tier            = required(score, 'trust_level');

    const d1 = required(score, 'd1').score;
    const d2 = required(score, 'd2').score;
    const d3 = required(score, 'd3').score;
    const d4 = required(score, 'd4').score;

    const r = await pool.query(INSERT_SCORE_SQL, [
        tenantId, divisionId, workspaceId,
        agentInstanceId, score.agent_run_id ?? null, runtimeProvider,
        d1, d2, d3, d4,
        tier, score.rationale ?? null, score.correlation_id ?? null,
    ]);
    return r.rows[0];
}
