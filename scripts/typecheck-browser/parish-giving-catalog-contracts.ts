addGivingOption('fund');
upsertPatronalFeastCampaign('custom', 'julian', 'Custom', '02-28');
// @ts-expect-error Editor kinds are fund or campaign.
addGivingOption('other');
// @ts-expect-error Feast enable state must be boolean.
toggleFeastCampaign('pascha', 'yes');
// @ts-expect-error Monetary goals are numeric cents.
optionProgress({ goalCents: '100' }, 'campaign');
