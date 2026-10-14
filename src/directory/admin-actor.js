// Generated from src/directory/admin-actor.ts by npm run build:server. Do not edit.
function actorDto(ctx) {
  return {
    userId: ctx.user.id,
    actorType: ctx.actorType || 'platform_user',
    parishId: ctx.parishId || ctx.membership?.parishId,
    capabilities: ctx.capabilities,
    personId: ctx.personId || '',
  };
}
export { actorDto };
