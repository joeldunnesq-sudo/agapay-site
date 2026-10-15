import { ROUTE_ACTIONS } from '../../src/routes/worker-actions.js';
import type { AdminActions } from '../../src/routes/admin.js';
import type { PublicActions } from '../../src/routes/public.js';
const admin: AdminActions<Env> = ROUTE_ACTIONS;
const publicActions: PublicActions<Env> = ROUTE_ACTIONS;
void admin;
void publicActions;
