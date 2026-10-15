// Generated from src/operations/rate-limiter.ts by npm run build:server. Do not edit.
class RateLimiter {
  constructor(state) {
    this.state = state;
    state.storage.sql.exec('CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY, attempts INTEGER NOT NULL)');
  }
  async fetch(request) {
    const { limit, expiresAt } = await request.json();
    if (!Number.isInteger(limit) || limit < 1 || limit > 1e5 || !Number.isFinite(expiresAt)) {
      return new Response('Invalid counter request', { status: 400 });
    }
    const row = this.state.storage.sql
      .exec(
        'INSERT INTO counter (id, attempts) VALUES (1, 1) ON CONFLICT(id) DO UPDATE SET attempts = MIN(counter.attempts + 1, ?) RETURNING attempts',
        limit + 1
      )
      .one();
    if (!(await this.state.storage.getAlarm()))
      await this.state.storage.setAlarm(Math.max(Date.now() + 6e4, expiresAt));
    return Response.json({ attempts: row.attempts });
  }
  async alarm() {
    await this.state.storage.deleteAll();
  }
}
export { RateLimiter };
