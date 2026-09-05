// One SQLite-backed object per hashed bucket/window. No raw IP or email is stored.
// fetch() keeps this class usable by both Workers and the Node test harness.
export class RateLimiter {
  constructor(state) {
    this.state = state;
    state.storage.sql.exec('CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY, attempts INTEGER NOT NULL)');
  }

  async fetch(request) {
    const { limit, expiresAt } = await request.json();
    if (!Number.isInteger(limit) || limit < 1 || limit > 100000 || !Number.isFinite(expiresAt)) {
      return new Response('Invalid counter request', { status: 400 });
    }
    const row = this.state.storage.sql
      .exec(
        'INSERT INTO counter (id, attempts) VALUES (1, 1) ON CONFLICT(id) DO UPDATE SET attempts = MIN(counter.attempts + 1, ?) RETURNING attempts',
        limit + 1
      )
      .one();
    // Storage output gates ensure the counter is durable before the response.
    if (!(await this.state.storage.getAlarm()))
      await this.state.storage.setAlarm(Math.max(Date.now() + 60000, expiresAt));
    return Response.json({ attempts: row.attempts });
  }

  async alarm() {
    await this.state.storage.deleteAll();
  }
}
