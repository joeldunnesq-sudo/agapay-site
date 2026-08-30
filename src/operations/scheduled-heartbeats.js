function databaseFor(env) {
  return env?.DB || env?.AGAPAY_DB || null;
}

async function persist(env, heartbeat) {
  const db = databaseFor(env);
  if (!db?.prepare) return;
  await db
    .prepare(
      `
    INSERT INTO operational_job_heartbeats(
      job_name,cron,status,run_id,started_at,completed_at,duration_ms,error_summary,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(job_name) DO UPDATE SET
      cron=excluded.cron,
      status=excluded.status,
      run_id=excluded.run_id,
      started_at=excluded.started_at,
      completed_at=excluded.completed_at,
      duration_ms=excluded.duration_ms,
      error_summary=excluded.error_summary,
      updated_at=datetime('now')
  `
    )
    .bind(
      heartbeat.name,
      heartbeat.cron,
      heartbeat.status,
      heartbeat.runId,
      heartbeat.startedAt,
      heartbeat.completedAt || null,
      heartbeat.durationMs ?? null,
      heartbeat.errorSummary || null
    )
    .run();
}

export async function recordScheduledHeartbeat(env, heartbeat) {
  try {
    await persist(env, heartbeat);
  } catch (error) {
    console.error('scheduled_job_heartbeat_failed', heartbeat.name, error?.message || String(error));
  }
}
