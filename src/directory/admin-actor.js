// Stable, minimal actor identity shared by directory review operations.
export function actorDto(ctx) {
  return {
    userId: ctx.user.id,
    actorType: ctx.actorType || "platform_user",
    parishId: ctx.parishId || ctx.membership?.parishId,
    capabilities: ctx.capabilities,
    personId: ctx.personId || ""
  };
}
